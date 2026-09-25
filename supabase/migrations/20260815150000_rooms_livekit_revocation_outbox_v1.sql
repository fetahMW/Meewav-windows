-- Durable, server-side LiveKit revocation for Place Rooms.
--
-- This migration is deliberately additive. Existing iOS RPCs, tables and
-- policies keep their signatures and behaviour. Database mutations only
-- enqueue work; the `livekit-revocation-worker` Edge Function performs the
-- privileged LiveKit Admin API calls with server-side credentials.

create table if not exists public.room_livekit_publication_grants_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  livekit_room_name text not null,
  generation uuid not null default gen_random_uuid(),
  state_revision bigint not null default 1,
  is_authorized boolean not null default false,
  last_reason text not null default 'initial',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (room_id, user_id),
  constraint room_livekit_publication_grants_v1_revision_check
    check (state_revision > 0),
  constraint room_livekit_publication_grants_v1_room_name_check
    check (char_length(livekit_room_name) between 1 and 128)
);

comment on table public.room_livekit_publication_grants_v1 is
  'Server-only publication authorization generation. A new generation is issued after a revoked guest is legitimately authorized again.';

create index if not exists room_livekit_publication_grants_v1_authorized_idx
  on public.room_livekit_publication_grants_v1 (room_id, is_authorized);

alter table public.room_livekit_publication_grants_v1 enable row level security;
revoke all on table public.room_livekit_publication_grants_v1 from anon, authenticated;
grant select, insert, update, delete on table public.room_livekit_publication_grants_v1 to service_role;

create table if not exists public.room_livekit_revocation_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  room_id uuid not null,
  livekit_room_name text not null,
  participant_identity text,
  publication_generation uuid,
  publication_revision bigint,
  source_reason text not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamp with time zone not null default now(),
  locked_at timestamp with time zone,
  lease_token uuid,
  worker_id text,
  last_error text,
  result text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  constraint room_livekit_revocation_outbox_v1_action_check
    check (action in ('remove_participant', 'end_room')),
  constraint room_livekit_revocation_outbox_v1_state_check
    check (state in ('pending', 'processing', 'retry', 'succeeded', 'dead')),
  constraint room_livekit_revocation_outbox_v1_attempt_check
    check (attempt_count >= 0),
  constraint room_livekit_revocation_outbox_v1_room_name_check
    check (char_length(livekit_room_name) between 1 and 128),
  constraint room_livekit_revocation_outbox_v1_target_check
    check (
      (action = 'remove_participant' and participant_identity is not null)
      or (action = 'end_room' and participant_identity is null)
    )
);

comment on table public.room_livekit_revocation_outbox_v1 is
  'Durable server-only outbox for idempotent LiveKit publication revocation, RemoveParticipant and DeleteRoom calls.';

create index if not exists room_livekit_revocation_outbox_v1_due_idx
  on public.room_livekit_revocation_outbox_v1 (next_attempt_at, created_at)
  where state in ('pending', 'retry');

create index if not exists room_livekit_revocation_outbox_v1_room_idx
  on public.room_livekit_revocation_outbox_v1 (room_id, created_at desc);

-- Only one active delivery exists for the same authorization generation.
-- NULLS NOT DISTINCT also coalesces end_room and pre-generation legacy events.
create unique index if not exists room_livekit_revocation_outbox_v1_active_key
  on public.room_livekit_revocation_outbox_v1 (
    room_id,
    action,
    participant_identity,
    publication_generation
  ) nulls not distinct
  where state in ('pending', 'processing', 'retry');

alter table public.room_livekit_revocation_outbox_v1 enable row level security;
revoke all on table public.room_livekit_revocation_outbox_v1 from anon, authenticated;
grant select, insert, update, delete on table public.room_livekit_revocation_outbox_v1 to service_role;

create or replace function public.rooms_livekit_require_service_role_v1()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.rooms_livekit_require_service_role_v1() from public, anon, authenticated;
grant execute on function public.rooms_livekit_require_service_role_v1() to service_role;

create or replace function public.rooms_enqueue_livekit_revocation_v1(
  p_action text,
  p_room_id uuid,
  p_livekit_room_name text,
  p_participant_identity text default null,
  p_publication_generation uuid default null,
  p_publication_revision bigint default null,
  p_source_reason text default 'room_state_changed'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_lock_key text;
begin
  if p_action not in ('remove_participant', 'end_room') then
    raise exception 'Unsupported LiveKit revocation action.';
  end if;
  if p_room_id is null or nullif(btrim(p_livekit_room_name), '') is null then
    raise exception 'Room identity is required.';
  end if;
  if p_action = 'remove_participant' and nullif(btrim(p_participant_identity), '') is null then
    raise exception 'Participant identity is required.';
  end if;

  v_lock_key := concat_ws(
    ':',
    'meewav:livekit-revocation',
    p_room_id::text,
    p_action,
    coalesce(p_participant_identity, '-'),
    coalesce(p_publication_generation::text, 'legacy')
  );
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  select outbox.id
    into v_event_id
  from public.room_livekit_revocation_outbox_v1 outbox
  where outbox.room_id = p_room_id
    and outbox.action = p_action
    and outbox.participant_identity is not distinct from p_participant_identity
    and outbox.publication_generation is not distinct from p_publication_generation
    and outbox.state in ('pending', 'processing', 'retry')
  order by outbox.created_at
  limit 1
  for update;

  if v_event_id is not null then
    update public.room_livekit_revocation_outbox_v1
    set source_reason = left(coalesce(p_source_reason, source_reason), 240),
        publication_revision = greatest(
          coalesce(publication_revision, 0),
          coalesce(p_publication_revision, 0)
        ),
        next_attempt_at = case
          when state = 'processing' then next_attempt_at
          else least(next_attempt_at, now())
        end,
        updated_at = now()
    where id = v_event_id;
    return v_event_id;
  end if;

  insert into public.room_livekit_revocation_outbox_v1 (
    action,
    room_id,
    livekit_room_name,
    participant_identity,
    publication_generation,
    publication_revision,
    source_reason
  ) values (
    p_action,
    p_room_id,
    btrim(p_livekit_room_name),
    case when p_action = 'remove_participant' then btrim(p_participant_identity) else null end,
    case when p_action = 'remove_participant' then p_publication_generation else null end,
    case when p_action = 'remove_participant' then p_publication_revision else null end,
    left(coalesce(nullif(btrim(p_source_reason), ''), 'room_state_changed'), 240)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.rooms_enqueue_livekit_revocation_v1(text, uuid, text, text, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.rooms_enqueue_livekit_revocation_v1(text, uuid, text, text, uuid, bigint, text)
  to service_role;

create or replace function public.rooms_set_livekit_publication_authorization_v1(
  p_room_id uuid,
  p_user_id uuid,
  p_authorized boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_name text;
  v_generation uuid;
  v_revision bigint;
  v_had_grant boolean := false;
begin
  select room.livekit_room_name
    into v_room_name
  from public.rooms_v2 room
  where room.id = p_room_id;

  if not found or p_user_id is null then return; end if;

  if p_authorized then
    insert into public.room_livekit_publication_grants_v1 (
      room_id,
      user_id,
      livekit_room_name,
      generation,
      state_revision,
      is_authorized,
      last_reason
    ) values (
      p_room_id,
      p_user_id,
      v_room_name,
      gen_random_uuid(),
      1,
      true,
      left(coalesce(p_reason, 'authorized'), 240)
    )
    on conflict (room_id, user_id)
    do update set
      livekit_room_name = excluded.livekit_room_name,
      generation = case
        when public.room_livekit_publication_grants_v1.is_authorized
          then public.room_livekit_publication_grants_v1.generation
        else gen_random_uuid()
      end,
      state_revision = case
        when public.room_livekit_publication_grants_v1.is_authorized
          then public.room_livekit_publication_grants_v1.state_revision
        else public.room_livekit_publication_grants_v1.state_revision + 1
      end,
      is_authorized = true,
      last_reason = excluded.last_reason,
      updated_at = now()
    returning generation, state_revision into v_generation, v_revision;

    -- A new/current authorization supersedes all queued revocations for an
    -- older session. A processing worker still performs its own DB + remote
    -- metadata generation checks immediately before the Admin API call.
    update public.room_livekit_revocation_outbox_v1
    set state = 'succeeded',
        result = 'superseded_by_reauthorization',
        completed_at = now(),
        locked_at = null,
        lease_token = null,
        worker_id = null,
        updated_at = now()
    where room_id = p_room_id
      and action = 'remove_participant'
      and participant_identity = p_user_id::text
      and state in ('pending', 'retry')
      and publication_generation is distinct from v_generation;
    return;
  end if;

  select exists (
    select 1
    from public.room_livekit_publication_grants_v1 grant_state
    where grant_state.room_id = p_room_id
      and grant_state.user_id = p_user_id
  ) into v_had_grant;

  -- A normal Viewer or pending invite never had publication authority. Do not
  -- turn their ordinary INSERT/UPDATE into a destructive LiveKit removal.
  -- Explicit Room departure/moderation events remain force-revocable so an
  -- old or legacy token cannot keep the participant connected.
  if not v_had_grant
     and coalesce(p_reason, '') not in (
       'user_banned',
       'user_kicked',
       'participant_delete',
       'participant_left',
       'participant_target_changed'
     ) then
    return;
  end if;

  insert into public.room_livekit_publication_grants_v1 (
    room_id,
    user_id,
    livekit_room_name,
    generation,
    state_revision,
    is_authorized,
    last_reason
  ) values (
    p_room_id,
    p_user_id,
    v_room_name,
    gen_random_uuid(),
    1,
    false,
    left(coalesce(p_reason, 'revoked'), 240)
  )
  on conflict (room_id, user_id)
  do update set
    livekit_room_name = excluded.livekit_room_name,
    state_revision = case
      when public.room_livekit_publication_grants_v1.is_authorized
        then public.room_livekit_publication_grants_v1.state_revision + 1
      else public.room_livekit_publication_grants_v1.state_revision
    end,
    is_authorized = false,
    last_reason = excluded.last_reason,
    updated_at = now()
  returning generation, state_revision into v_generation, v_revision;

  perform public.rooms_enqueue_livekit_revocation_v1(
    'remove_participant',
    p_room_id,
    v_room_name,
    p_user_id::text,
    v_generation,
    v_revision,
    p_reason
  );
end;
$$;

revoke all on function public.rooms_set_livekit_publication_authorization_v1(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.rooms_set_livekit_publication_authorization_v1(uuid, uuid, boolean, text)
  to service_role;

create or replace function public.rooms_reconcile_livekit_guest_publication_v1(
  p_room_id uuid,
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_authorized boolean;
begin
  select exists (
    select 1
    from public.rooms_v2 room
    join public.room_participants_v2 participant
      on participant.room_id = room.id
     and participant.user_id = p_user_id
     and participant.role = 'guest'
     and participant.left_at is null
    join public.room_invitations_v2 invitation
      on invitation.room_id = room.id
     and invitation.guest_id = p_user_id
     and invitation.status = 'onstage'
     and invitation.ended_at is null
    where room.id = p_room_id
      and room.type = 'place'
      and room.status = 'live'
      and not exists (
        select 1
        from public.room_bans_v2 ban
        where ban.room_id = room.id
          and ban.user_id = p_user_id
      )
  ) into v_authorized;

  perform public.rooms_set_livekit_publication_authorization_v1(
    p_room_id,
    p_user_id,
    coalesce(v_authorized, false),
    p_reason
  );
end;
$$;

revoke all on function public.rooms_reconcile_livekit_guest_publication_v1(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rooms_reconcile_livekit_guest_publication_v1(uuid, uuid, text)
  to service_role;

create or replace function public.rooms_livekit_invitation_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      old.room_id, old.guest_id, 'invitation_delete'
    );
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.room_id, old.guest_id) is distinct from (new.room_id, new.guest_id) then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      old.room_id, old.guest_id, 'invitation_target_changed'
    );
  end if;

  perform public.rooms_reconcile_livekit_guest_publication_v1(
    new.room_id, new.guest_id, concat('invitation_', lower(tg_op))
  );
  return new;
end;
$$;

create or replace function public.rooms_livekit_participant_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.role <> 'host' then
      perform public.rooms_reconcile_livekit_guest_publication_v1(
        old.room_id, old.user_id, 'participant_delete'
      );
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.room_id, old.user_id) is distinct from (new.room_id, new.user_id)
     and old.role <> 'host' then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      old.room_id, old.user_id, 'participant_target_changed'
    );
  end if;

  if tg_op = 'UPDATE'
     and old.left_at is null
     and new.left_at is not null
     and new.role <> 'host' then
    perform public.rooms_set_livekit_publication_authorization_v1(
      new.room_id, new.user_id, false, 'participant_left'
    );
  elsif new.role <> 'host' or (tg_op = 'UPDATE' and old.role <> 'host') then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      new.room_id, new.user_id, concat('participant_', lower(tg_op))
    );
  end if;
  return new;
end;
$$;

create or replace function public.rooms_livekit_ban_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      old.room_id,
      old.user_id,
      'ban_deleted'
    );
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.room_id, old.user_id) is distinct from (new.room_id, new.user_id) then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      old.room_id, old.user_id, 'ban_target_changed'
    );
  end if;

  perform public.rooms_set_livekit_publication_authorization_v1(
    new.room_id,
    new.user_id,
    false,
    'user_banned'
  );
  return new;
end;
$$;

create or replace function public.rooms_livekit_kick_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      old.room_id,
      old.user_id,
      'kick_deleted'
    );
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.room_id, old.user_id) is distinct from (new.room_id, new.user_id) then
    perform public.rooms_reconcile_livekit_guest_publication_v1(
      old.room_id, old.user_id, 'kick_target_changed'
    );
  end if;

  perform public.rooms_set_livekit_publication_authorization_v1(
    new.room_id,
    new.user_id,
    false,
    'user_kicked'
  );
  return new;
end;
$$;

create or replace function public.rooms_livekit_room_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host_id uuid;
begin
  if tg_op = 'DELETE' then
    perform public.rooms_enqueue_livekit_revocation_v1(
      'end_room', old.id, old.livekit_room_name, null, null, null, 'room_deleted'
    );
    return old;
  end if;

  if new.type <> 'place' then return new; end if;

  if new.status = 'ended'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.room_livekit_publication_grants_v1
    set is_authorized = false,
        state_revision = state_revision + case when is_authorized then 1 else 0 end,
        last_reason = 'room_ended',
        updated_at = now()
    where room_id = new.id;

    perform public.rooms_enqueue_livekit_revocation_v1(
      'end_room', new.id, new.livekit_room_name, null, null, null, 'room_ended'
    );
    return new;
  end if;

  if new.status = 'live' then
    v_host_id := new.host_id;
    perform public.rooms_set_livekit_publication_authorization_v1(
      new.id,
      v_host_id,
      true,
      case when tg_op = 'INSERT' then 'room_created_host' else 'room_live_host' end
    );
  end if;
  return new;
end;
$$;

revoke all on function public.rooms_livekit_invitation_changed_v1()
  from public, anon, authenticated;
revoke all on function public.rooms_livekit_participant_changed_v1()
  from public, anon, authenticated;
revoke all on function public.rooms_livekit_ban_changed_v1()
  from public, anon, authenticated;
revoke all on function public.rooms_livekit_kick_changed_v1()
  from public, anon, authenticated;
revoke all on function public.rooms_livekit_room_changed_v1()
  from public, anon, authenticated;

drop trigger if exists rooms_livekit_invitation_changed_v1 on public.room_invitations_v2;
create trigger rooms_livekit_invitation_changed_v1
after insert or update or delete on public.room_invitations_v2
for each row execute function public.rooms_livekit_invitation_changed_v1();

drop trigger if exists rooms_livekit_participant_changed_v1 on public.room_participants_v2;
create trigger rooms_livekit_participant_changed_v1
after insert or update or delete on public.room_participants_v2
for each row execute function public.rooms_livekit_participant_changed_v1();

drop trigger if exists rooms_livekit_ban_changed_v1 on public.room_bans_v2;
create trigger rooms_livekit_ban_changed_v1
after insert or update or delete on public.room_bans_v2
for each row execute function public.rooms_livekit_ban_changed_v1();

drop trigger if exists rooms_livekit_kick_changed_v1 on public.room_kicks_v2;
create trigger rooms_livekit_kick_changed_v1
after insert or update or delete on public.room_kicks_v2
for each row execute function public.rooms_livekit_kick_changed_v1();

drop trigger if exists rooms_livekit_room_changed_v1 on public.rooms_v2;
create trigger rooms_livekit_room_changed_v1
after insert or update of status or delete on public.rooms_v2
for each row execute function public.rooms_livekit_room_changed_v1();

-- Backfill the authorization generation for already-live Place Hosts.
insert into public.room_livekit_publication_grants_v1 (
  room_id,
  user_id,
  livekit_room_name,
  is_authorized,
  last_reason
)
select room.id, room.host_id, room.livekit_room_name, true, 'migration_live_host'
from public.rooms_v2 room
where room.type = 'place' and room.status = 'live'
on conflict (room_id, user_id) do nothing;

-- Backfill only guests who satisfy the exact token publication contract.
insert into public.room_livekit_publication_grants_v1 (
  room_id,
  user_id,
  livekit_room_name,
  is_authorized,
  last_reason
)
select distinct
  room.id,
  invitation.guest_id,
  room.livekit_room_name,
  true,
  'migration_onstage_guest'
from public.rooms_v2 room
join public.room_invitations_v2 invitation
  on invitation.room_id = room.id
 and invitation.status = 'onstage'
 and invitation.ended_at is null
join public.room_participants_v2 participant
  on participant.room_id = room.id
 and participant.user_id = invitation.guest_id
 and participant.role = 'guest'
 and participant.left_at is null
where room.type = 'place'
  and room.status = 'live'
  and not exists (
    select 1 from public.room_bans_v2 ban
    where ban.room_id = room.id and ban.user_id = invitation.guest_id
  )
on conflict (room_id, user_id) do update
set is_authorized = true,
    last_reason = excluded.last_reason,
    updated_at = now();

create or replace function public.rooms_claim_livekit_revocations_v1(
  p_batch_size integer default 20,
  p_worker_id text default 'livekit-revocation-worker'
)
returns table (
  id uuid,
  action text,
  room_id uuid,
  livekit_room_name text,
  participant_identity text,
  publication_generation uuid,
  publication_revision bigint,
  source_reason text,
  attempt_count integer,
  lease_token uuid,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.rooms_livekit_require_service_role_v1();

  return query
  with candidates as (
    select outbox.id
    from public.room_livekit_revocation_outbox_v1 outbox
    where (
      outbox.state in ('pending', 'retry')
      and outbox.next_attempt_at <= now()
    ) or (
      outbox.state = 'processing'
      and outbox.locked_at < now() - interval '2 minutes'
    )
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 20), 50))
  ), claimed as (
    update public.room_livekit_revocation_outbox_v1 outbox
    set state = 'processing',
        attempt_count = outbox.attempt_count + 1,
        locked_at = now(),
        lease_token = gen_random_uuid(),
        worker_id = left(coalesce(nullif(btrim(p_worker_id), ''), 'livekit-revocation-worker'), 120),
        updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.action,
    claimed.room_id,
    claimed.livekit_room_name,
    claimed.participant_identity,
    claimed.publication_generation,
    claimed.publication_revision,
    claimed.source_reason,
    claimed.attempt_count,
    claimed.lease_token,
    claimed.created_at
  from claimed;
end;
$$;

revoke all on function public.rooms_claim_livekit_revocations_v1(integer, text)
  from public, anon, authenticated;
grant execute on function public.rooms_claim_livekit_revocations_v1(integer, text)
  to service_role;

create or replace function public.rooms_resolve_livekit_revocation_v1(
  p_event_id uuid,
  p_lease_token uuid,
  p_resolution text,
  p_result text default null,
  p_error text default null,
  p_retry_at timestamp with time zone default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.rooms_livekit_require_service_role_v1();
  if p_resolution not in ('succeeded', 'retry', 'dead') then
    raise exception 'Unsupported LiveKit revocation resolution.';
  end if;

  update public.room_livekit_revocation_outbox_v1 outbox
  set state = p_resolution,
      result = left(p_result, 240),
      last_error = left(p_error, 1000),
      next_attempt_at = case
        when p_resolution = 'retry' then greatest(coalesce(p_retry_at, now()), now())
        else outbox.next_attempt_at
      end,
      completed_at = case when p_resolution in ('succeeded', 'dead') then now() else null end,
      locked_at = null,
      lease_token = null,
      worker_id = null,
      updated_at = now()
  where outbox.id = p_event_id
    and outbox.state = 'processing'
    and outbox.lease_token = p_lease_token;

  if not found then
    raise exception 'Stale or invalid LiveKit revocation lease.' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.rooms_resolve_livekit_revocation_v1(uuid, uuid, text, text, text, timestamp with time zone)
  from public, anon, authenticated;
grant execute on function public.rooms_resolve_livekit_revocation_v1(uuid, uuid, text, text, text, timestamp with time zone)
  to service_role;

create or replace view public.room_livekit_revocation_health_v1
with (security_invoker = true)
as
select
  case
    when count(*) filter (where state = 'dead') > 0 then 'blocked'
    when count(*) filter (
      where state in ('pending', 'retry')
        and next_attempt_at < now() - interval '30 seconds'
    ) > 0
      or count(*) filter (where state = 'retry' and last_error is not null) > 0
      or count(*) filter (
        where state = 'processing'
          and locked_at < now() - interval '2 minutes'
      ) > 0
      then 'degraded'
    else 'healthy'
  end as status,
  count(*) filter (where state = 'pending')::bigint as pending_count,
  count(*) filter (where state = 'retry')::bigint as retry_count,
  count(*) filter (where state = 'processing')::bigint as processing_count,
  count(*) filter (where state = 'dead')::bigint as dead_count,
  min(next_attempt_at) filter (where state in ('pending', 'retry')) as oldest_due_at,
  now() as checked_at
from public.room_livekit_revocation_outbox_v1;

revoke all on table public.room_livekit_revocation_health_v1 from public, anon, authenticated;
grant select on table public.room_livekit_revocation_health_v1 to service_role;

create or replace function public.rooms_livekit_revocation_health_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_health public.room_livekit_revocation_health_v1%rowtype;
begin
  perform public.rooms_livekit_require_service_role_v1();
  select * into v_health from public.room_livekit_revocation_health_v1;
  return jsonb_build_object(
    'status', v_health.status,
    'pendingCount', v_health.pending_count,
    'retryCount', v_health.retry_count,
    'processingCount', v_health.processing_count,
    'deadCount', v_health.dead_count,
    'oldestDueAt', v_health.oldest_due_at,
    'checkedAt', v_health.checked_at
  );
end;
$$;

revoke all on function public.rooms_livekit_revocation_health_v1()
  from public, anon, authenticated;
grant execute on function public.rooms_livekit_revocation_health_v1()
  to service_role;

comment on function public.rooms_livekit_revocation_health_v1() is
  'Server-only health snapshot. degraded means durable retry/lag; blocked means at least one event exhausted retries.';
