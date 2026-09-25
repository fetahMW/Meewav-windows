begin;

create extension if not exists pgcrypto;

-- Private phone calls launched from a live Place Room.
--
-- This contract is intentionally additive: the existing Room invitation,
-- public-stage and LiveKit token contracts stay untouched for Web and iOS.
-- A live-call contact is always derived from an active canonical direct
-- conversation in Messaging. Accepted calls use a separate private media
-- room and start in preview; publication into the Room remains a distinct,
-- Host-owned state transition.

create table if not exists public.room_live_call_invitations_v1 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  contact_profile_id uuid not null references public.profiles(id) on delete cascade,
  direct_conversation_id uuid not null
    references public.messaging_conversations(id) on delete cascade,
  client_request_id uuid not null,
  request_fingerprint text not null,
  media_generation uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  call_mode text not null default 'private',
  route_mode text not null default 'preview',
  is_on_air boolean not null default false,
  route_revision bigint not null default 1,
  invitation_expires_at timestamptz not null,
  session_expires_at timestamptz,
  responded_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_live_call_invitations_v1_host_contact_check
    check (host_id <> contact_profile_id),
  constraint room_live_call_invitations_v1_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint room_live_call_invitations_v1_status_check
    check (status in (
      'pending', 'accepted', 'declined', 'cancelled', 'ended', 'expired'
    )),
  constraint room_live_call_invitations_v1_call_mode_check
    check (call_mode in ('private', 'public')),
  constraint room_live_call_invitations_v1_route_check
    check (route_mode in ('preview', 'public')),
  constraint room_live_call_invitations_v1_revision_check
    check (route_revision > 0),
  constraint room_live_call_invitations_v1_invitation_expiry_check
    check (
      invitation_expires_at > created_at
      and invitation_expires_at <= created_at + interval '5 minutes'
    ),
  constraint room_live_call_invitations_v1_session_expiry_check
    check (
      session_expires_at is null
      or (
        accepted_at is not null
        and session_expires_at > accepted_at
        and session_expires_at <= accepted_at + interval '4 hours'
      )
    ),
  constraint room_live_call_invitations_v1_accepted_state_check
    check (
      status <> 'accepted'
      or (
        responded_at is not null
        and accepted_at is not null
        and session_expires_at is not null
      )
    ),
  constraint room_live_call_invitations_v1_public_requires_acceptance_check
    check (
      route_mode <> 'public'
      or (status = 'accepted' and call_mode = 'public')
    ),
  constraint room_live_call_invitations_v1_on_air_state_check
    check (not is_on_air or (status = 'accepted' and route_mode = 'public')),
  constraint room_live_call_invitations_v1_terminal_check
    check (
      (status in ('declined', 'cancelled', 'ended', 'expired') and ended_at is not null)
      or (status in ('pending', 'accepted') and ended_at is null)
    ),
  constraint room_live_call_invitations_v1_reason_check
    check (end_reason is null or char_length(end_reason) between 1 and 160),
  -- The same client request groups a checkbox selection. Idempotency remains
  -- per selected contact, while each accepted contact receives its own
  -- isolated private media room.
  unique (host_id, client_request_id, contact_profile_id),
  unique (media_generation)
);

create index if not exists room_live_call_invitations_v1_host_time_idx
  on public.room_live_call_invitations_v1(host_id, created_at desc);
create index if not exists room_live_call_invitations_v1_contact_time_idx
  on public.room_live_call_invitations_v1(contact_profile_id, created_at desc);
create index if not exists room_live_call_invitations_v1_pending_expiry_idx
  on public.room_live_call_invitations_v1(invitation_expires_at)
  where status = 'pending';
create index if not exists room_live_call_invitations_v1_session_expiry_idx
  on public.room_live_call_invitations_v1(session_expires_at)
  where status = 'accepted';
create unique index if not exists room_live_call_invitations_v1_active_contact_idx
  on public.room_live_call_invitations_v1(room_id, contact_profile_id)
  where status in ('pending', 'accepted');
create unique index if not exists room_live_call_invitations_v1_one_accepted_per_contact_idx
  on public.room_live_call_invitations_v1(contact_profile_id)
  where status = 'accepted';

comment on table public.room_live_call_invitations_v1 is
  'Host-only private-call invitations to active direct Messaging contacts. Accepted calls remain preview-only until an explicit Host route transition.';

create table if not exists public.room_live_call_revocation_outbox_v1 (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid references public.room_live_call_invitations_v1(id)
    on delete set null,
  invitation_id_snapshot uuid not null,
  room_id_snapshot uuid not null,
  media_generation uuid not null,
  action text not null,
  route_revision bigint not null,
  source_reason text not null,
  state text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  lease_token uuid,
  worker_id text,
  last_error text,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint room_live_call_revocation_outbox_v1_action_check
    check (action in (
      'detach_public_mix', 'end_private_call', 'cleanup_private_call'
    )),
  constraint room_live_call_revocation_outbox_v1_revision_check
    check (route_revision > 0),
  constraint room_live_call_revocation_outbox_v1_reason_check
    check (char_length(source_reason) between 1 and 160),
  constraint room_live_call_revocation_outbox_v1_state_check
    check (state in ('pending', 'processing', 'retry', 'succeeded', 'dead')),
  constraint room_live_call_revocation_outbox_v1_attempt_check
    check (attempt_count >= 0)
);

create table if not exists public.room_live_call_token_windows_v1 (
  invitation_id uuid not null
    references public.room_live_call_invitations_v1(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  issued_count integer not null default 0,
  last_issued_at timestamptz,
  primary key (invitation_id, user_id),
  constraint room_live_call_token_windows_v1_count_check
    check (issued_count between 0 and 100)
);

create table if not exists public.room_live_call_user_token_windows_v1 (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  issued_count integer not null default 0,
  last_issued_at timestamptz,
  constraint room_live_call_user_token_windows_v1_count_check
    check (issued_count between 0 and 1000)
);

create index if not exists room_live_call_revocation_outbox_v1_due_idx
  on public.room_live_call_revocation_outbox_v1(next_attempt_at, created_at)
  where state in ('pending', 'retry');
create unique index if not exists room_live_call_revocation_outbox_v1_active_key
  on public.room_live_call_revocation_outbox_v1(
    media_generation, action, route_revision
  )
  where state in ('pending', 'processing', 'retry');

comment on table public.room_live_call_revocation_outbox_v1 is
  'Server-only durable media revocation queue for private live-call rooms and their optional public bridge.';
comment on table public.room_live_call_token_windows_v1 is
  'Server-only fixed-window throttle for private live-call token minting, scoped to one invitation party.';
comment on table public.room_live_call_user_token_windows_v1 is
  'Server-only fixed-window throttle for private live-call token minting across every invitation of one user.';

alter table public.room_live_call_invitations_v1 enable row level security;
alter table public.room_live_call_invitations_v1 replica identity full;
alter table public.room_live_call_revocation_outbox_v1 enable row level security;
alter table public.room_live_call_token_windows_v1 enable row level security;
alter table public.room_live_call_user_token_windows_v1 enable row level security;

revoke all on table public.room_live_call_invitations_v1
  from public, anon, authenticated;
grant select on table public.room_live_call_invitations_v1 to authenticated;
grant select, insert, update, delete on table public.room_live_call_invitations_v1
  to service_role;

revoke all on table public.room_live_call_revocation_outbox_v1
  from public, anon, authenticated;
grant select, insert, update, delete on table public.room_live_call_revocation_outbox_v1
  to service_role;

revoke all on table public.room_live_call_token_windows_v1
  from public, anon, authenticated;
grant select, insert, update, delete on table public.room_live_call_token_windows_v1
  to service_role;

revoke all on table public.room_live_call_user_token_windows_v1
  from public, anon, authenticated;
grant select, insert, update, delete on table public.room_live_call_user_token_windows_v1
  to service_role;

drop policy if exists room_live_call_parties_read_v1
  on public.room_live_call_invitations_v1;
create policy room_live_call_parties_read_v1
on public.room_live_call_invitations_v1
for select to authenticated
using (auth.uid() in (host_id, contact_profile_id));

-- -------------------------------------------------------------------------
-- Private authority helpers.
-- -------------------------------------------------------------------------

create or replace function public.rooms_live_call_require_service_role_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'live_call_service_role_required';
  end if;
end;
$$;

create or replace function public.rooms_live_call_contact_allowed_v1(
  p_host_id uuid,
  p_contact_profile_id uuid,
  p_direct_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select p_host_id is not null
    and p_contact_profile_id is not null
    and p_host_id <> p_contact_profile_id
    and exists (
      select 1
      from public.messaging_conversations conversation
      join public.messaging_direct_pairs pair
        on pair.conversation_id = conversation.id
      join public.messaging_conversation_members host_member
        on host_member.conversation_id = conversation.id
       and host_member.profile_id = p_host_id
       and host_member.membership_status = 'active'
       and host_member.left_at is null
      join public.messaging_conversation_members contact_member
        on contact_member.conversation_id = conversation.id
       and contact_member.profile_id = p_contact_profile_id
       and contact_member.membership_status = 'active'
       and contact_member.left_at is null
      where conversation.id = p_direct_conversation_id
        and conversation.kind = 'direct'
        and conversation.deleted_at is null
        and (
          (pair.profile_low_id = p_host_id and pair.profile_high_id = p_contact_profile_id)
          or
          (pair.profile_low_id = p_contact_profile_id and pair.profile_high_id = p_host_id)
        )
        and not exists (
          select 1
          from public.user_blocks block
          where (block.blocker_profile_id = p_host_id and block.blocked_profile_id = p_contact_profile_id)
             or (block.blocker_profile_id = p_contact_profile_id and block.blocked_profile_id = p_host_id)
        )
    );
$$;

create or replace function public.rooms_live_call_room_access_revoked_v1(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select p_room_id is null
    or p_user_id is null
    or exists (
      select 1
      from public.room_bans_v2 ban
      where ban.room_id = p_room_id
        and ban.user_id = p_user_id
    )
    or exists (
      select 1
      from public.room_kicks_v2 kick
      where kick.room_id = p_room_id
        and kick.user_id = p_user_id
        and not exists (
          select 1
          from public.room_participants_v2 participant
          where participant.room_id = p_room_id
            and participant.user_id = p_user_id
            and participant.left_at is null
        )
    );
$$;

create or replace function public.rooms_live_call_contact_on_public_stage_v1(
  p_room_id uuid,
  p_contact_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  -- Active Room guests and the canonical public-stage projection are phone
  -- ineligible. Ordinary participants whose role is viewer remain callable.
  select p_room_id is not null
    and p_contact_profile_id is not null
    and (
      exists (
        select 1
        from public.room_participants_v2 active_guest
        where active_guest.room_id = p_room_id
          and active_guest.user_id = p_contact_profile_id
          and active_guest.role = 'guest'
          and active_guest.left_at is null
      )
      or exists (
        select 1
        from public.rooms_v2 room
        join public.room_invitations_v2 stage_invitation
          on stage_invitation.room_id = room.id
         and stage_invitation.guest_id = p_contact_profile_id
         and stage_invitation.status = 'onstage'
         and stage_invitation.ended_at is null
        where room.id = p_room_id
          and room.type = 'place'
          and room.status = 'live'
      )
    );
$$;

create or replace function public.rooms_enqueue_live_call_revocation_internal_v1(
  p_invitation_id uuid,
  p_room_id uuid,
  p_media_generation uuid,
  p_action text,
  p_route_revision bigint,
  p_source_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_outbox_id uuid;
begin
  if p_invitation_id is null or p_room_id is null or p_media_generation is null
     or p_action not in (
       'detach_public_mix', 'end_private_call', 'cleanup_private_call'
     )
     or coalesce(p_route_revision, 0) < 1 then
    raise exception using errcode = '22023', message = 'invalid_live_call_revocation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', 'rooms:live-call-revocation', p_media_generation::text,
      p_action, p_route_revision::text),
    0
  ));

  select outbox.id into v_outbox_id
  from public.room_live_call_revocation_outbox_v1 outbox
  where outbox.media_generation = p_media_generation
    and outbox.action = p_action
    and outbox.route_revision = p_route_revision
    and outbox.state in ('pending', 'processing', 'retry')
  order by outbox.created_at
  limit 1
  for update;

  if v_outbox_id is not null then
    return v_outbox_id;
  end if;

  insert into public.room_live_call_revocation_outbox_v1 (
    invitation_id,
    invitation_id_snapshot,
    room_id_snapshot,
    media_generation,
    action,
    route_revision,
    source_reason,
    next_attempt_at
  ) values (
    case
      when exists (
        select 1 from public.room_live_call_invitations_v1 invitation
        where invitation.id = p_invitation_id
      ) then p_invitation_id
      else null
    end,
    p_invitation_id,
    p_room_id,
    p_media_generation,
    p_action,
    p_route_revision,
    left(coalesce(nullif(btrim(p_source_reason), ''), 'state_changed'), 160),
    case
      when p_action = 'cleanup_private_call' then now() + interval '40 seconds'
      else now()
    end
  )
  returning id into v_outbox_id;

  return v_outbox_id;
end;
$$;

create or replace function public.rooms_expire_live_call_invitations_internal_v1(
  p_limit integer default 100,
  p_room_id uuid default null,
  p_party_profile_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_count integer;
begin
  with due as (
    select invitation.id
    from public.room_live_call_invitations_v1 invitation
    where invitation.status in ('pending', 'accepted')
      and (p_room_id is null or invitation.room_id = p_room_id)
      and (
        p_party_profile_id is null
        or p_party_profile_id in (invitation.host_id, invitation.contact_profile_id)
      )
      and (
        (invitation.status = 'pending' and invitation.invitation_expires_at <= now())
        or
        (invitation.status = 'accepted' and invitation.session_expires_at <= now())
      )
    order by coalesce(invitation.session_expires_at, invitation.invitation_expires_at), invitation.id
    limit least(500, greatest(1, coalesce(p_limit, 100)))
    for update skip locked
  )
  update public.room_live_call_invitations_v1 invitation
  set status = 'expired',
      route_mode = 'preview',
      route_revision = invitation.route_revision + 1,
      ended_at = now(),
      end_reason = 'expired',
      updated_at = now()
  from due
  where invitation.id = due.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.rooms_live_call_force_off_air_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.is_on_air
     and (new.status <> 'accepted' or new.route_mode <> 'public') then
    new.is_on_air := false;
    -- Every lifecycle mutation in this contract already advances the shared
    -- revision. Keep that invariant true for future server-side mutations too.
    new.route_revision := greatest(new.route_revision, old.route_revision + 1);
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_live_call_force_off_air_v1
  on public.room_live_call_invitations_v1;
create trigger rooms_live_call_force_off_air_v1
before update of status, route_mode
on public.room_live_call_invitations_v1
for each row execute function public.rooms_live_call_force_off_air_v1();

create or replace function public.rooms_live_call_keep_mode_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.call_mode is distinct from old.call_mode then
    raise exception using errcode = '55000', message = 'live_call_mode_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_live_call_keep_mode_immutable_v1
  on public.room_live_call_invitations_v1;
create trigger rooms_live_call_keep_mode_immutable_v1
before update of call_mode
on public.room_live_call_invitations_v1
for each row execute function public.rooms_live_call_keep_mode_immutable_v1();

create or replace function public.rooms_live_call_revocation_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_reason text;
begin
  if tg_op = 'DELETE' then
    if old.route_mode = 'public' then
      perform public.rooms_enqueue_live_call_revocation_internal_v1(
        old.id, old.room_id, old.media_generation, 'detach_public_mix',
        old.route_revision, 'invitation_deleted'
      );
    end if;
    if old.status = 'accepted' then
      perform public.rooms_enqueue_live_call_revocation_internal_v1(
        old.id, old.room_id, old.media_generation, 'end_private_call',
        old.route_revision, 'invitation_deleted'
      );
      perform public.rooms_enqueue_live_call_revocation_internal_v1(
        old.id, old.room_id, old.media_generation, 'cleanup_private_call',
        old.route_revision, 'invitation_deleted_token_cleanup'
      );
    end if;
    return old;
  end if;

  v_reason := coalesce(
    new.end_reason,
    case
      when old.is_on_air and not new.is_on_air then 'on_air_disabled'
      else 'state_changed'
    end
  );
  if (old.route_mode = 'public' and new.route_mode <> 'public')
     or (old.is_on_air and not new.is_on_air) then
    perform public.rooms_enqueue_live_call_revocation_internal_v1(
      new.id, new.room_id, new.media_generation, 'detach_public_mix',
      new.route_revision, v_reason
    );
  end if;
  if old.status = 'accepted' and new.status <> 'accepted' then
    perform public.rooms_enqueue_live_call_revocation_internal_v1(
      new.id, new.room_id, new.media_generation, 'end_private_call',
      new.route_revision, v_reason
    );
    perform public.rooms_enqueue_live_call_revocation_internal_v1(
      new.id, new.room_id, new.media_generation, 'cleanup_private_call',
      new.route_revision, 'expired_token_cleanup'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_live_call_revocation_changed_v1
  on public.room_live_call_invitations_v1;
create trigger rooms_live_call_revocation_changed_v1
after update of status, route_mode, is_on_air or delete
on public.room_live_call_invitations_v1
for each row execute function public.rooms_live_call_revocation_changed_v1();

-- -------------------------------------------------------------------------
-- Host/contact browser RPCs.
-- -------------------------------------------------------------------------

create or replace function public.rooms_list_live_call_contacts_v1(
  p_room_id uuid,
  p_search text default null,
  p_limit integer default 50
)
returns table (
  contact_profile_id uuid,
  direct_conversation_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_online boolean,
  active_invitation_id uuid,
  active_invitation_status text,
  active_call_mode text,
  active_route_mode text,
  active_invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_host_id uuid := auth.uid();
  v_search text := nullif(btrim(p_search), '');
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 50)));
begin
  if v_host_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_room_id is null then
    raise exception using errcode = '22023', message = 'room_id_required';
  end if;
  if char_length(coalesce(v_search, '')) > 80 then
    raise exception using errcode = '22023', message = 'search_too_long';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = p_room_id
      and room.host_id = v_host_id
      and room.type = 'place'
      and room.status = 'live'
  ) then
    raise exception using errcode = '42501', message = 'live_call_host_required';
  end if;

  perform public.rooms_expire_live_call_invitations_internal_v1(
    100, p_room_id, null
  );

  return query
  with direct_contacts as (
    select
      conversation.id as conversation_id,
      case
        when pair.profile_low_id = v_host_id then pair.profile_high_id
        else pair.profile_low_id
      end as profile_id
    from public.messaging_direct_pairs pair
    join public.messaging_conversations conversation
      on conversation.id = pair.conversation_id
     and conversation.kind = 'direct'
     and conversation.deleted_at is null
    join public.messaging_conversation_members host_member
      on host_member.conversation_id = conversation.id
     and host_member.profile_id = v_host_id
     and host_member.membership_status = 'active'
     and host_member.left_at is null
    join public.messaging_conversation_members contact_member
      on contact_member.conversation_id = conversation.id
     and contact_member.profile_id = case
       when pair.profile_low_id = v_host_id then pair.profile_high_id
       else pair.profile_low_id
     end
     and contact_member.membership_status = 'active'
     and contact_member.left_at is null
    where v_host_id in (pair.profile_low_id, pair.profile_high_id)
  )
  select
    contact.id,
    direct_contact.conversation_id,
    contact.username,
    coalesce(
      nullif(contact.display_name, ''),
      nullif(contact.full_name, ''),
      nullif(contact.username, ''),
      'Contact Meewav'
    ),
    contact.avatar_url,
    coalesce(contact.is_online, false),
    active_invitation.id,
    active_invitation.status,
    active_invitation.call_mode,
    active_invitation.route_mode,
    active_invitation.invitation_expires_at
  from direct_contacts direct_contact
  join public.profiles contact on contact.id = direct_contact.profile_id
  left join lateral (
    select invitation.*
    from public.room_live_call_invitations_v1 invitation
    where invitation.room_id = p_room_id
      and invitation.contact_profile_id = contact.id
      and invitation.status in ('pending', 'accepted')
    order by invitation.created_at desc
    limit 1
  ) active_invitation on true
  where not public.messaging_profiles_blocked_v1(v_host_id, contact.id)
    and not public.rooms_live_call_room_access_revoked_v1(
      p_room_id, contact.id
    )
    and not public.rooms_live_call_contact_on_public_stage_v1(
      p_room_id, contact.id
    )
    and (
      v_search is null
      or contact.username ilike '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or contact.display_name ilike '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or contact.full_name ilike '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
    )
  order by coalesce(contact.is_online, false) desc,
    lower(coalesce(nullif(contact.display_name, ''), nullif(contact.full_name, ''), contact.username, '')),
    contact.id
  limit v_limit;
end;
$$;

create or replace function public.rooms_invite_live_call_contact_v1(
  p_room_id uuid,
  p_contact_profile_id uuid,
  p_client_request_id uuid,
  p_call_mode text default 'private'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_host_id uuid := auth.uid();
  v_conversation_id uuid;
  v_batch_room_id uuid;
  v_call_mode text := lower(btrim(coalesce(p_call_mode, 'private')));
  v_fingerprint text;
  v_existing public.room_live_call_invitations_v1%rowtype;
  v_invitation public.room_live_call_invitations_v1%rowtype;
begin
  if v_host_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_room_id is null or p_contact_profile_id is null or p_client_request_id is null
     or p_contact_profile_id = v_host_id
     or v_call_mode not in ('private', 'public') then
    raise exception using errcode = '22023', message = 'invalid_live_call_invitation';
  end if;

  v_fingerprint := encode(digest(
    concat_ws(':', p_room_id::text, p_contact_profile_id::text, v_call_mode), 'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-request:' || v_host_id::text || ':' || p_client_request_id::text,
    0
  ));

  select invitation.room_id into v_batch_room_id
  from public.room_live_call_invitations_v1 invitation
  where invitation.host_id = v_host_id
    and invitation.client_request_id = p_client_request_id
  order by invitation.created_at, invitation.id
  limit 1;
  if v_batch_room_id is not null and v_batch_room_id <> p_room_id then
    raise exception using errcode = '23505', message = 'live_call_idempotency_conflict';
  end if;

  select invitation.* into v_existing
  from public.room_live_call_invitations_v1 invitation
  where invitation.host_id = v_host_id
    and invitation.client_request_id = p_client_request_id
    and invitation.contact_profile_id = p_contact_profile_id
  for update;

  if v_existing.id is not null then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'live_call_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'invitation_id', v_existing.id,
      'status', v_existing.status,
      'call_mode', v_existing.call_mode,
      'route_mode', v_existing.route_mode,
      'route_revision', v_existing.route_revision,
      'invitation_expires_at', v_existing.invitation_expires_at,
      'idempotent', true
    );
  end if;

  perform 1
  from public.rooms_v2 room
  where room.id = p_room_id
    and room.host_id = v_host_id
    and room.type = 'place'
    and room.status = 'live'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'live_call_host_required';
  end if;

  -- The Room row already serializes one Room, while these two explicit keys
  -- also serialize the Host's cross-Room minute window and make the capacity
  -- invariant independent from future changes to the Room read above.
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-host-rate:' || v_host_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-room-capacity:' || p_room_id::text,
    0
  ));

  select conversation.id into v_conversation_id
  from public.messaging_direct_pairs pair
  join public.messaging_conversations conversation
    on conversation.id = pair.conversation_id
  where (
      (pair.profile_low_id = v_host_id and pair.profile_high_id = p_contact_profile_id)
      or
      (pair.profile_low_id = p_contact_profile_id and pair.profile_high_id = v_host_id)
    )
    and public.rooms_live_call_contact_allowed_v1(
      v_host_id, p_contact_profile_id, conversation.id
    )
  limit 1;

  if v_conversation_id is null then
    raise exception using errcode = '42501', message = 'live_call_direct_contact_required';
  end if;
  if public.rooms_live_call_room_access_revoked_v1(
    p_room_id, p_contact_profile_id
  ) then
    raise exception using errcode = '42501', message = 'live_call_contact_room_access_revoked';
  end if;
  if public.rooms_live_call_contact_on_public_stage_v1(
    p_room_id, p_contact_profile_id
  ) then
    raise exception using errcode = '55000', message = 'live_call_contact_onstage';
  end if;

  -- The Host advisory lock above serializes this cross-Room capacity check.
  -- Clear stale leases first so an expired call never consumes active quota.
  perform public.rooms_expire_live_call_invitations_internal_v1(
    100, null, v_host_id
  );
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.host_id = v_host_id
      and invitation.status in ('pending', 'accepted')
  ) >= 24 then
    raise exception using errcode = '54000', message = 'live_call_host_active_limit';
  end if;

  perform public.rooms_expire_live_call_invitations_internal_v1(
    100, p_room_id, null
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-contact:' || p_room_id::text || ':' || p_contact_profile_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-contact-ring-rate:' || p_contact_profile_id::text,
    0
  ));
  -- Expire this recipient's stale ringing rows across every Room before the
  -- global recipient counters are evaluated under the same advisory lock.
  perform public.rooms_expire_live_call_invitations_internal_v1(
    100, null, p_contact_profile_id
  );

  if exists (
    select 1 from public.room_live_call_invitations_v1 invitation
    where invitation.room_id = p_room_id
      and invitation.contact_profile_id = p_contact_profile_id
      and invitation.status in ('pending', 'accepted')
  ) then
    raise exception using errcode = '55000', message = 'live_call_already_active';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.contact_profile_id = p_contact_profile_id
      and invitation.created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'live_call_contact_invitation_limit';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.contact_profile_id = p_contact_profile_id
      and invitation.status = 'pending'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'live_call_contact_invitation_limit';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.host_id = v_host_id
      and invitation.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception using errcode = 'P0001', message = 'live_call_invitation_rate_limit';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.room_id = p_room_id
      and invitation.status in ('pending', 'accepted')
  ) >= 8 then
    raise exception using errcode = '54000', message = 'live_call_room_capacity';
  end if;

  insert into public.room_live_call_invitations_v1 (
    room_id,
    host_id,
    contact_profile_id,
    direct_conversation_id,
    client_request_id,
    request_fingerprint,
    call_mode,
    invitation_expires_at
  ) values (
    p_room_id,
    v_host_id,
    p_contact_profile_id,
    v_conversation_id,
    p_client_request_id,
    v_fingerprint,
    v_call_mode,
    now() + interval '90 seconds'
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation.id,
    'status', v_invitation.status,
    'call_mode', v_invitation.call_mode,
    'route_mode', v_invitation.route_mode,
    'route_revision', v_invitation.route_revision,
    'invitation_expires_at', v_invitation.invitation_expires_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.rooms_list_my_live_call_invitations_v1(
  p_limit integer default 30
)
returns table (
  invitation_id uuid,
  room_id uuid,
  room_title text,
  host_profile_id uuid,
  host_username text,
  host_display_name text,
  host_avatar_url text,
  contact_profile_id uuid,
  contact_username text,
  contact_display_name text,
  contact_avatar_url text,
  party_role text,
  status text,
  call_mode text,
  route_mode text,
  is_on_air boolean,
  route_revision bigint,
  invitation_expires_at timestamptz,
  session_expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_contact_id uuid := auth.uid();
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
begin
  if v_contact_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform public.rooms_expire_live_call_invitations_internal_v1(
    100, null, v_contact_id
  );

  return query
  select
    invitation.id,
    invitation.room_id,
    room.title,
    invitation.host_id,
    host.username,
    coalesce(
      nullif(host.display_name, ''), nullif(host.full_name, ''),
      nullif(host.username, ''), 'Host Meewav'
    ),
    host.avatar_url,
    invitation.contact_profile_id,
    contact.username,
    coalesce(
      nullif(contact.display_name, ''), nullif(contact.full_name, ''),
      nullif(contact.username, ''), 'Contact Meewav'
    ),
    contact.avatar_url,
    case when invitation.host_id = v_contact_id then 'host' else 'contact' end,
    invitation.status,
    invitation.call_mode,
    invitation.route_mode,
    invitation.is_on_air,
    invitation.route_revision,
    invitation.invitation_expires_at,
    invitation.session_expires_at,
    invitation.created_at
  from public.room_live_call_invitations_v1 invitation
  join public.rooms_v2 room on room.id = invitation.room_id
  join public.profiles host on host.id = invitation.host_id
  join public.profiles contact on contact.id = invitation.contact_profile_id
  where v_contact_id in (invitation.host_id, invitation.contact_profile_id)
    and invitation.status in ('pending', 'accepted')
  -- Never let a burst of pending rings push an established call outside the
  -- bounded projection consumed by the media provider.
  order by
    case when invitation.status = 'accepted' then 0 else 1 end,
    invitation.created_at desc,
    invitation.id desc
  limit v_limit;
end;
$$;

create or replace function public.rooms_respond_live_call_invitation_v1(
  p_invitation_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_contact_id uuid := auth.uid();
  v_invitation public.room_live_call_invitations_v1%rowtype;
  v_room_live boolean;
begin
  if v_contact_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_id is null or p_accept is null then
    raise exception using errcode = '22023', message = 'invalid_live_call_response';
  end if;

  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id;

  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if v_invitation.contact_profile_id <> v_contact_id then
    raise exception using errcode = '42501', message = 'live_call_contact_required';
  end if;
  if p_accept then
    perform pg_advisory_xact_lock(hashtextextended(
      'rooms:live-call-contact-accept:' || v_contact_id::text,
      0
    ));
    -- Serialize the final acceptance decision with every canonical stage
    -- transition so a contact cannot be accepted while becoming onstage.
    perform pg_advisory_xact_lock(hashtextextended(
      'meewav:rooms:program-transition:' || v_invitation.room_id::text,
      0
    ));
  end if;

  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id
  for update;
  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if v_invitation.contact_profile_id <> v_contact_id then
    raise exception using errcode = '42501', message = 'live_call_contact_required';
  end if;
  if v_invitation.status = 'accepted'
     and v_invitation.session_expires_at <= now() then
    update public.room_live_call_invitations_v1
    set status = 'expired', route_mode = 'preview',
        route_revision = route_revision + 1,
        ended_at = now(), end_reason = 'session_timeout', updated_at = now()
    where id = v_invitation.id;
    return jsonb_build_object(
      'ok', false, 'invitation_id', v_invitation.id,
      'status', 'expired', 'error', 'live_call_session_expired'
    );
  end if;
  if (v_invitation.status = 'accepted' and p_accept)
     or (v_invitation.status = 'declined' and not p_accept) then
    return jsonb_build_object(
      'ok', true, 'invitation_id', v_invitation.id,
      'status', v_invitation.status,
      'call_mode', v_invitation.call_mode,
      'route_mode', v_invitation.route_mode,
      'is_on_air', v_invitation.is_on_air,
      'route_revision', v_invitation.route_revision,
      'invitation_expires_at', v_invitation.invitation_expires_at,
      'session_expires_at', v_invitation.session_expires_at,
      'idempotent', true
    );
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'live_call_invitation_already_responded';
  end if;

  if v_invitation.invitation_expires_at <= now() then
    update public.room_live_call_invitations_v1
    set status = 'expired', route_mode = 'preview',
        route_revision = route_revision + 1,
        ended_at = now(), end_reason = 'ring_timeout', updated_at = now()
    where id = v_invitation.id;
    return jsonb_build_object(
      'ok', false, 'invitation_id', v_invitation.id,
      'status', 'expired', 'error', 'live_call_invitation_expired'
    );
  end if;

  select exists (
    select 1 from public.rooms_v2 room
    where room.id = v_invitation.room_id
      and room.host_id = v_invitation.host_id
      and room.type = 'place'
      and room.status = 'live'
  ) into v_room_live;

  if p_accept and public.rooms_live_call_contact_on_public_stage_v1(
    v_invitation.room_id, v_invitation.contact_profile_id
  ) then
    update public.room_live_call_invitations_v1
    set status = 'cancelled', route_mode = 'preview',
        route_revision = route_revision + 1,
        responded_at = now(), ended_at = now(),
        end_reason = 'contact_onstage', updated_at = now()
    where id = v_invitation.id;
    return jsonb_build_object(
      'ok', false, 'invitation_id', v_invitation.id,
      'status', 'cancelled', 'error', 'live_call_contact_onstage'
    );
  end if;

  if p_accept and (
    not v_room_live
    or not public.rooms_live_call_contact_allowed_v1(
      v_invitation.host_id,
      v_invitation.contact_profile_id,
      v_invitation.direct_conversation_id
    )
    or public.rooms_live_call_room_access_revoked_v1(
      v_invitation.room_id,
      v_invitation.contact_profile_id
    )
  ) then
    update public.room_live_call_invitations_v1
    set status = 'cancelled', route_mode = 'preview',
        route_revision = route_revision + 1,
        responded_at = now(), ended_at = now(),
        end_reason = 'contact_no_longer_eligible', updated_at = now()
    where id = v_invitation.id;
    return jsonb_build_object(
      'ok', false, 'invitation_id', v_invitation.id,
      'status', 'cancelled', 'error', 'live_call_contact_no_longer_eligible'
    );
  end if;

  if p_accept then
    -- Clear an accepted call whose four-hour lease elapsed even if the
    -- scheduler is temporarily delayed, then decide the global busy state.
    perform public.rooms_expire_live_call_invitations_internal_v1(
      100, null, v_contact_id
    );
  end if;

  if p_accept and exists (
    select 1
    from public.room_live_call_invitations_v1 accepted_call
    where accepted_call.contact_profile_id = v_contact_id
      and accepted_call.status = 'accepted'
      and accepted_call.id <> v_invitation.id
  ) then
    raise exception using errcode = '55000', message = 'live_call_contact_busy';
  end if;

  update public.room_live_call_invitations_v1
  set status = case when p_accept then 'accepted' else 'declined' end,
      route_mode = 'preview',
      responded_at = now(),
      accepted_at = case when p_accept then now() else accepted_at end,
      session_expires_at = case when p_accept then now() + interval '4 hours' else null end,
      ended_at = case when p_accept then null else now() end,
      end_reason = case when p_accept then null else 'contact_declined' end,
      updated_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  return jsonb_build_object(
    'ok', true, 'invitation_id', v_invitation.id,
    'status', v_invitation.status,
    'call_mode', v_invitation.call_mode,
    'route_mode', v_invitation.route_mode,
    'is_on_air', v_invitation.is_on_air,
    'route_revision', v_invitation.route_revision,
    'invitation_expires_at', v_invitation.invitation_expires_at,
    'session_expires_at', v_invitation.session_expires_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.rooms_set_live_call_route_v1(
  p_invitation_id uuid,
  p_route_mode text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_host_id uuid := auth.uid();
  v_mode text := lower(btrim(coalesce(p_route_mode, '')));
  v_invitation public.room_live_call_invitations_v1%rowtype;
begin
  if v_host_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_id is null or v_mode not in ('preview', 'public')
     or coalesce(p_expected_revision, 0) < 1 then
    raise exception using errcode = '22023', message = 'invalid_live_call_route';
  end if;

  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id;

  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if v_invitation.host_id <> v_host_id then
    raise exception using errcode = '42501', message = 'live_call_host_required';
  end if;
  if v_mode = 'public' then
    perform pg_advisory_xact_lock(hashtextextended(
      'meewav:rooms:program-transition:' || v_invitation.room_id::text,
      0
    ));
  end if;
  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id
  for update;
  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if v_invitation.host_id <> v_host_id then
    raise exception using errcode = '42501', message = 'live_call_host_required';
  end if;
  if v_invitation.status = 'accepted'
     and v_invitation.session_expires_at <= now() then
    update public.room_live_call_invitations_v1
    set status = 'expired', route_mode = 'preview',
        route_revision = route_revision + 1,
        ended_at = now(), end_reason = 'session_timeout', updated_at = now()
    where id = v_invitation.id;
    return jsonb_build_object(
      'ok', false, 'invitation_id', v_invitation.id,
      'status', 'expired', 'error', 'live_call_session_expired'
    );
  end if;
  if v_invitation.status <> 'accepted' then
    raise exception using errcode = '55000', message = 'live_call_not_active';
  end if;
  if v_invitation.route_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'live_call_route_revision_conflict';
  end if;
  if v_invitation.route_mode = v_mode then
    return jsonb_build_object(
      'ok', true, 'invitation_id', v_invitation.id,
      'call_mode', v_invitation.call_mode,
      'route_mode', v_invitation.route_mode,
      'is_on_air', v_invitation.is_on_air,
      'route_revision', v_invitation.route_revision,
      'idempotent', true
    );
  end if;

  if v_mode = 'public' and v_invitation.call_mode <> 'public' then
    raise exception using errcode = '55000', message = 'live_call_private_mode';
  end if;

  if v_mode = 'public' and (
    not exists (
      select 1 from public.rooms_v2 room
      where room.id = v_invitation.room_id
        and room.host_id = v_host_id
        and room.type = 'place'
        and room.status = 'live'
    )
    or not public.rooms_live_call_contact_allowed_v1(
      v_invitation.host_id,
      v_invitation.contact_profile_id,
      v_invitation.direct_conversation_id
    )
    or public.rooms_live_call_room_access_revoked_v1(
      v_invitation.room_id,
      v_invitation.contact_profile_id
    )
    or public.rooms_live_call_contact_on_public_stage_v1(
      v_invitation.room_id,
      v_invitation.contact_profile_id
    )
  ) then
    raise exception using errcode = '42501', message = 'live_call_public_route_forbidden';
  end if;

  update public.room_live_call_invitations_v1
  set route_mode = v_mode,
      route_revision = route_revision + 1,
      updated_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  if v_mode = 'public' then
    update public.room_live_call_revocation_outbox_v1
    set state = 'succeeded', result = 'superseded_by_route_reenable',
        completed_at = now(), locked_at = null, lease_token = null,
        worker_id = null, updated_at = now()
    where media_generation = v_invitation.media_generation
      and action = 'detach_public_mix'
      and state in ('pending', 'retry')
      and route_revision < v_invitation.route_revision;
  end if;

  return jsonb_build_object(
    'ok', true, 'invitation_id', v_invitation.id,
    'call_mode', v_invitation.call_mode,
    'route_mode', v_invitation.route_mode,
    'is_on_air', v_invitation.is_on_air,
    'route_revision', v_invitation.route_revision,
    'idempotent', false
  );
end;
$$;

create or replace function public.rooms_set_live_call_on_air_v1(
  p_invitation_id uuid,
  p_enabled boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_host_id uuid := auth.uid();
  v_invitation public.room_live_call_invitations_v1%rowtype;
begin
  if v_host_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_id is null or p_enabled is null
     or coalesce(p_expected_revision, 0) < 1 then
    raise exception using errcode = '22023', message = 'invalid_live_call_on_air_state';
  end if;

  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id;

  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if v_invitation.host_id <> v_host_id then
    raise exception using errcode = '42501', message = 'live_call_host_required';
  end if;
  if p_enabled then
    perform pg_advisory_xact_lock(hashtextextended(
      'meewav:rooms:program-transition:' || v_invitation.room_id::text,
      0
    ));
  end if;
  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id
  for update;
  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if v_invitation.host_id <> v_host_id then
    raise exception using errcode = '42501', message = 'live_call_host_required';
  end if;

  -- Disabling an already disabled route is deliberately fail-safe and does
  -- not fail because a delayed client holds an older revision.
  if not p_enabled and not v_invitation.is_on_air then
    return jsonb_build_object(
      'ok', true, 'invitation_id', v_invitation.id,
      'call_mode', v_invitation.call_mode,
      'is_on_air', false,
      'route_revision', v_invitation.route_revision,
      'idempotent', true
    );
  end if;

  if v_invitation.status = 'accepted'
     and v_invitation.session_expires_at <= now() then
    update public.room_live_call_invitations_v1
    set status = 'expired', route_mode = 'preview',
        route_revision = route_revision + 1,
        ended_at = now(), end_reason = 'session_timeout', updated_at = now()
    where id = v_invitation.id
    returning * into v_invitation;
    return jsonb_build_object(
      'ok', false, 'invitation_id', v_invitation.id,
      'status', 'expired', 'is_on_air', false,
      'route_revision', v_invitation.route_revision,
      'error', 'live_call_session_expired'
    );
  end if;

  if v_invitation.route_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'live_call_on_air_revision_conflict';
  end if;

  if p_enabled then
    if v_invitation.status <> 'accepted' or v_invitation.route_mode <> 'public' then
      raise exception using errcode = '55000', message = 'live_call_on_air_not_ready';
    end if;
    if v_invitation.call_mode <> 'public' then
      raise exception using errcode = '55000', message = 'live_call_private_mode';
    end if;
    if not exists (
      select 1 from public.rooms_v2 room
      where room.id = v_invitation.room_id
        and room.host_id = v_host_id
        and room.type = 'place'
        and room.status = 'live'
    )
    or not public.rooms_live_call_contact_allowed_v1(
      v_invitation.host_id,
      v_invitation.contact_profile_id,
      v_invitation.direct_conversation_id
    )
    or public.rooms_live_call_room_access_revoked_v1(
      v_invitation.room_id,
      v_invitation.contact_profile_id
    )
    or public.rooms_live_call_contact_on_public_stage_v1(
      v_invitation.room_id,
      v_invitation.contact_profile_id
    ) then
      raise exception using errcode = '42501', message = 'live_call_on_air_forbidden';
    end if;
  end if;

  if v_invitation.is_on_air = p_enabled then
    return jsonb_build_object(
      'ok', true, 'invitation_id', v_invitation.id,
      'call_mode', v_invitation.call_mode,
      'is_on_air', v_invitation.is_on_air,
      'route_revision', v_invitation.route_revision,
      'idempotent', true
    );
  end if;

  update public.room_live_call_invitations_v1
  set is_on_air = p_enabled,
      route_revision = route_revision + 1,
      updated_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  if p_enabled then
    update public.room_live_call_revocation_outbox_v1
    set state = 'succeeded', result = 'superseded_by_on_air_reenable',
        completed_at = now(), locked_at = null, lease_token = null,
        worker_id = null, updated_at = now()
    where media_generation = v_invitation.media_generation
      and action = 'detach_public_mix'
      and state in ('pending', 'retry')
      and route_revision < v_invitation.route_revision;
  end if;

  return jsonb_build_object(
    'ok', true, 'invitation_id', v_invitation.id,
    'call_mode', v_invitation.call_mode,
    'is_on_air', v_invitation.is_on_air,
    'route_revision', v_invitation.route_revision,
    'idempotent', false
  );
end;
$$;

create or replace function public.rooms_end_live_call_invitation_v1(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.room_live_call_invitations_v1%rowtype;
  v_next_status text;
  v_reason text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_id is null then
    raise exception using errcode = '22023', message = 'invitation_id_required';
  end if;

  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id
  for update;

  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if v_user_id not in (v_invitation.host_id, v_invitation.contact_profile_id) then
    raise exception using errcode = '42501', message = 'live_call_party_required';
  end if;
  if v_invitation.status in ('declined', 'cancelled', 'ended', 'expired') then
    return jsonb_build_object(
      'ok', true, 'invitation_id', v_invitation.id,
      'status', v_invitation.status, 'idempotent', true
    );
  end if;

  if v_invitation.status = 'accepted' then
    v_next_status := 'ended';
    v_reason := case
      when v_user_id = v_invitation.host_id then 'host_ended'
      else 'contact_ended'
    end;
  elsif v_user_id = v_invitation.host_id then
    v_next_status := 'cancelled';
    v_reason := 'host_cancelled';
  else
    v_next_status := 'declined';
    v_reason := 'contact_declined';
  end if;

  update public.room_live_call_invitations_v1
  set status = v_next_status,
      route_mode = 'preview',
      route_revision = route_revision + 1,
      responded_at = coalesce(responded_at, now()),
      ended_at = now(),
      end_reason = v_reason,
      updated_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  return jsonb_build_object(
    'ok', true, 'invitation_id', v_invitation.id,
    'status', v_invitation.status,
    'route_mode', v_invitation.route_mode,
    'route_revision', v_invitation.route_revision,
    'idempotent', false
  );
end;
$$;

-- -------------------------------------------------------------------------
-- Server-only media authorization and durable revocation worker API.
-- -------------------------------------------------------------------------

create or replace function public.rooms_authorize_live_call_media_v1(
  p_invitation_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_invitation public.room_live_call_invitations_v1%rowtype;
  v_role text;
  v_peer_id uuid;
  v_private_room_name text;
  v_room_id uuid;
  v_token_window public.room_live_call_token_windows_v1%rowtype;
  v_user_token_window public.room_live_call_user_token_windows_v1%rowtype;
begin
  perform public.rooms_live_call_require_service_role_v1();
  if p_invitation_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'invalid_live_call_media_request';
  end if;

  select invitation.room_id into v_room_id
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id;
  if v_room_id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'meewav:rooms:program-transition:' || v_room_id::text,
    0
  ));
  perform public.rooms_expire_live_call_invitations_internal_v1(
    500, null, p_user_id
  );

  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = p_invitation_id
  for update;

  if v_invitation.id is null then
    raise exception using errcode = 'P0002', message = 'live_call_invitation_not_found';
  end if;
  if p_user_id = v_invitation.host_id then
    v_role := 'host';
    v_peer_id := v_invitation.contact_profile_id;
  elsif p_user_id = v_invitation.contact_profile_id then
    v_role := 'contact';
    v_peer_id := v_invitation.host_id;
  else
    raise exception using errcode = '42501', message = 'live_call_party_required';
  end if;
  if v_invitation.status <> 'accepted'
     or v_invitation.session_expires_at <= now() then
    raise exception using errcode = '42501', message = 'live_call_media_not_authorized';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = v_invitation.room_id
      and room.host_id = v_invitation.host_id
      and room.type = 'place'
      and room.status = 'live'
  )
  or not public.rooms_live_call_contact_allowed_v1(
    v_invitation.host_id,
    v_invitation.contact_profile_id,
    v_invitation.direct_conversation_id
  )
  or public.rooms_live_call_room_access_revoked_v1(
    v_invitation.room_id,
    v_invitation.contact_profile_id
  )
  or public.rooms_live_call_contact_on_public_stage_v1(
    v_invitation.room_id,
    v_invitation.contact_profile_id
  ) then
    raise exception using errcode = '42501', message = 'live_call_media_not_authorized';
  end if;

  v_private_room_name := 'mw-call-'
    || replace(v_invitation.id::text, '-', '')
    || '-'
    || left(replace(v_invitation.media_generation::text, '-', ''), 12);

  -- Both throttle dimensions are serialized in this authority transaction.
  -- Acquire the user-wide key first so parallel calls for different accepted
  -- invitations cannot evade the aggregate cap. Eighty tokens/minute leaves
  -- substantial reconnect headroom while ten/invitation limits one bad call.
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-token-user:' || p_user_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-token:' || p_invitation_id::text || ':' || p_user_id::text,
    0
  ));

  select token_window.* into v_user_token_window
  from public.room_live_call_user_token_windows_v1 token_window
  where token_window.user_id = p_user_id
  for update;

  if v_user_token_window.user_id is null then
    insert into public.room_live_call_user_token_windows_v1 (
      user_id, window_started_at, issued_count, last_issued_at
    ) values (
      p_user_id, now(), 1, now()
    );
  elsif v_user_token_window.window_started_at <= now() - interval '1 minute' then
    update public.room_live_call_user_token_windows_v1
    set window_started_at = now(), issued_count = 1, last_issued_at = now()
    where user_id = p_user_id;
  elsif v_user_token_window.issued_count >= 80 then
    raise exception using errcode = 'P0001', message = 'live_call_token_rate_limit';
  else
    update public.room_live_call_user_token_windows_v1
    set issued_count = issued_count + 1, last_issued_at = now()
    where user_id = p_user_id;
  end if;

  select token_window.* into v_token_window
  from public.room_live_call_token_windows_v1 token_window
  where token_window.invitation_id = p_invitation_id
    and token_window.user_id = p_user_id
  for update;

  if v_token_window.invitation_id is null then
    insert into public.room_live_call_token_windows_v1 (
      invitation_id, user_id, window_started_at, issued_count, last_issued_at
    ) values (
      p_invitation_id, p_user_id, now(), 1, now()
    );
  elsif v_token_window.window_started_at <= now() - interval '1 minute' then
    update public.room_live_call_token_windows_v1
    set window_started_at = now(), issued_count = 1, last_issued_at = now()
    where invitation_id = p_invitation_id and user_id = p_user_id;
  elsif v_token_window.issued_count >= 10 then
    raise exception using errcode = 'P0001', message = 'live_call_token_rate_limit';
  else
    update public.room_live_call_token_windows_v1
    set issued_count = issued_count + 1, last_issued_at = now()
    where invitation_id = p_invitation_id and user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'room_id', v_invitation.room_id,
    'private_room_name', v_private_room_name,
    'media_generation', v_invitation.media_generation,
    'call_mode', v_invitation.call_mode,
    'role', v_role,
    'participant_identity', p_user_id::text || ':call:' || v_invitation.id::text,
    'peer_identity', v_peer_id::text || ':call:' || v_invitation.id::text,
    'session_expires_at', v_invitation.session_expires_at
  );
end;
$$;

create or replace function public.rooms_expire_live_call_invitations_v1(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.rooms_live_call_require_service_role_v1();
  return public.rooms_expire_live_call_invitations_internal_v1(p_limit, null, null);
end;
$$;

create or replace function public.rooms_claim_live_call_revocations_v1(
  p_worker_id text,
  p_limit integer default 20
)
returns table (
  outbox_id uuid,
  invitation_id uuid,
  room_id uuid,
  media_generation uuid,
  private_room_name text,
  action text,
  route_revision bigint,
  source_reason text,
  lease_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.rooms_live_call_require_service_role_v1();
  if char_length(btrim(coalesce(p_worker_id, ''))) not between 3 and 120 then
    raise exception using errcode = '22023', message = 'invalid_worker_id';
  end if;

  update public.room_live_call_revocation_outbox_v1 outbox
  set state = 'retry', locked_at = null, lease_token = null,
      worker_id = null, next_attempt_at = now(), updated_at = now()
  where outbox.state = 'processing'
    and outbox.locked_at < now() - interval '5 minutes';

  return query
  with claimed as (
    select outbox.id
    from public.room_live_call_revocation_outbox_v1 outbox
    where outbox.state in ('pending', 'retry')
      and outbox.next_attempt_at <= now()
    order by outbox.next_attempt_at, outbox.created_at
    limit least(100, greatest(1, coalesce(p_limit, 20)))
    for update skip locked
  ), updated as (
    update public.room_live_call_revocation_outbox_v1 outbox
    set state = 'processing', attempt_count = outbox.attempt_count + 1,
        locked_at = now(), lease_token = gen_random_uuid(),
        worker_id = left(btrim(p_worker_id), 120), updated_at = now()
    from claimed
    where outbox.id = claimed.id
    returning outbox.*
  )
  select
    updated.id,
    updated.invitation_id_snapshot,
    updated.room_id_snapshot,
    updated.media_generation,
    'mw-call-' || replace(updated.invitation_id_snapshot::text, '-', '')
      || '-' || left(replace(updated.media_generation::text, '-', ''), 12),
    updated.action,
    updated.route_revision,
    updated.source_reason,
    updated.lease_token,
    updated.attempt_count
  from updated;
end;
$$;

create or replace function public.rooms_live_call_revocation_should_execute_v1(
  p_outbox_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_outbox public.room_live_call_revocation_outbox_v1%rowtype;
  v_invitation public.room_live_call_invitations_v1%rowtype;
begin
  perform public.rooms_live_call_require_service_role_v1();
  select outbox.* into v_outbox
  from public.room_live_call_revocation_outbox_v1 outbox
  where outbox.id = p_outbox_id
    and outbox.state = 'processing'
    and outbox.lease_token = p_lease_token;
  if v_outbox.id is null then return false; end if;

  select invitation.* into v_invitation
  from public.room_live_call_invitations_v1 invitation
  where invitation.id = v_outbox.invitation_id_snapshot;

  if v_outbox.action in ('end_private_call', 'cleanup_private_call') then
    return v_invitation.id is null or v_invitation.status <> 'accepted';
  end if;
  return v_invitation.id is null
    or v_invitation.route_mode <> 'public'
    or not v_invitation.is_on_air
    or v_invitation.route_revision = v_outbox.route_revision;
end;
$$;

create or replace function public.rooms_complete_live_call_revocation_v1(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_result text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_attempt_count integer;
begin
  perform public.rooms_live_call_require_service_role_v1();
  if p_outbox_id is null or p_lease_token is null or p_succeeded is null then
    raise exception using errcode = '22023', message = 'invalid_revocation_completion';
  end if;

  select outbox.attempt_count into v_attempt_count
  from public.room_live_call_revocation_outbox_v1 outbox
  where outbox.id = p_outbox_id
    and outbox.state = 'processing'
    and outbox.lease_token = p_lease_token
  for update;
  if v_attempt_count is null then return false; end if;

  update public.room_live_call_revocation_outbox_v1
  set state = case
        when p_succeeded then 'succeeded'
        when v_attempt_count >= 8 then 'dead'
        else 'retry'
      end,
      result = case when p_succeeded then left(coalesce(p_result, 'ok'), 500) else result end,
      last_error = case when p_succeeded then null else left(coalesce(p_result, 'worker_error'), 1000) end,
      next_attempt_at = case
        when p_succeeded or v_attempt_count >= 8 then next_attempt_at
        else now() + make_interval(secs => least(300, 2 ^ least(v_attempt_count, 8)))
      end,
      completed_at = case when p_succeeded or v_attempt_count >= 8 then now() else null end,
      locked_at = null, lease_token = null, worker_id = null, updated_at = now()
  where id = p_outbox_id;
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- Automatic invalidation from Room, Messaging and moderation lifecycles.
-- -------------------------------------------------------------------------

create or replace function public.rooms_end_live_call_for_stage_entry_internal_v1(
  p_room_id uuid,
  p_contact_profile_id uuid,
  p_reason text default 'contact_joined_public_stage'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_room_id is null or p_contact_profile_id is null then
    raise exception using errcode = '22023', message = 'invalid_live_call_stage_entry';
  end if;
  -- Canonical stage RPCs already hold this key. Direct service writes are
  -- serialized here too, closing both accept->stage and stage->accept races.
  perform pg_advisory_xact_lock(hashtextextended(
    'meewav:rooms:program-transition:' || p_room_id::text,
    0
  ));
  update public.room_live_call_invitations_v1 invitation
  set status = 'ended',
      route_mode = 'preview',
      route_revision = invitation.route_revision + 1,
      ended_at = now(),
      end_reason = left(coalesce(nullif(btrim(p_reason), ''), 'contact_joined_public_stage'), 160),
      updated_at = now()
  where invitation.room_id = p_room_id
    and invitation.contact_profile_id = p_contact_profile_id
    and invitation.status = 'accepted';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.rooms_end_live_call_on_stage_invitation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_entered boolean;
begin
  if tg_op = 'INSERT' then
    v_entered := new.status = 'onstage' and new.ended_at is null;
  else
    v_entered := new.status = 'onstage' and new.ended_at is null
      and (
        old.status is distinct from new.status
        or old.ended_at is distinct from new.ended_at
        or old.room_id is distinct from new.room_id
        or old.guest_id is distinct from new.guest_id
      );
  end if;
  if v_entered then
    perform public.rooms_end_live_call_for_stage_entry_internal_v1(
      new.room_id, new.guest_id, 'contact_joined_public_stage'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_end_live_call_on_stage_invitation_v1
  on public.room_invitations_v2;
create trigger rooms_end_live_call_on_stage_invitation_v1
after insert or update of room_id, guest_id, status, ended_at
on public.room_invitations_v2
for each row execute function public.rooms_end_live_call_on_stage_invitation_v1();

create or replace function public.rooms_end_live_call_on_active_guest_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_entered boolean;
begin
  if tg_op = 'INSERT' then
    v_entered := new.role = 'guest' and new.left_at is null;
  else
    v_entered := new.role = 'guest' and new.left_at is null
      and (
        old.role is distinct from new.role
        or old.left_at is distinct from new.left_at
        or old.room_id is distinct from new.room_id
        or old.user_id is distinct from new.user_id
      );
  end if;
  if v_entered then
    perform public.rooms_end_live_call_for_stage_entry_internal_v1(
      new.room_id, new.user_id, 'contact_became_active_guest'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_end_live_call_on_active_guest_v1
  on public.room_participants_v2;
create trigger rooms_end_live_call_on_active_guest_v1
after insert or update of room_id, user_id, role, left_at
on public.room_participants_v2
for each row execute function public.rooms_end_live_call_on_active_guest_v1();

create or replace function public.rooms_end_live_calls_for_room_state_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_room_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_reason text := case
    when tg_op = 'DELETE' then 'room_deleted'
    when new.status <> 'live' then 'room_not_live'
    when new.type <> 'place' then 'room_type_changed'
    else 'room_host_changed'
  end;
begin
  if tg_op <> 'DELETE'
     and new.status = 'live' and new.type = 'place'
     and new.host_id is not distinct from old.host_id then
    return new;
  end if;

  update public.room_live_call_invitations_v1 invitation
  set status = case when invitation.status = 'accepted' then 'ended' else 'cancelled' end,
      route_mode = 'preview', route_revision = invitation.route_revision + 1,
      ended_at = now(), end_reason = v_reason, updated_at = now()
  where invitation.room_id = v_room_id
    and invitation.status in ('pending', 'accepted');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_end_live_calls_for_room_update_v1 on public.rooms_v2;
create trigger rooms_end_live_calls_for_room_update_v1
after update of status, type, host_id on public.rooms_v2
for each row execute function public.rooms_end_live_calls_for_room_state_v1();
drop trigger if exists rooms_end_live_calls_for_room_delete_v1 on public.rooms_v2;
create trigger rooms_end_live_calls_for_room_delete_v1
before delete on public.rooms_v2
for each row execute function public.rooms_end_live_calls_for_room_state_v1();

create or replace function public.rooms_end_live_calls_for_messaging_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_conversation_id uuid := case when tg_op = 'DELETE' then old.conversation_id else new.conversation_id end;
begin
  update public.room_live_call_invitations_v1 invitation
  set status = case when invitation.status = 'accepted' then 'ended' else 'cancelled' end,
      route_mode = 'preview', route_revision = invitation.route_revision + 1,
      ended_at = now(), end_reason = 'direct_contact_revoked', updated_at = now()
  where invitation.direct_conversation_id = v_conversation_id
    and invitation.status in ('pending', 'accepted')
    and not public.rooms_live_call_contact_allowed_v1(
      invitation.host_id,
      invitation.contact_profile_id,
      invitation.direct_conversation_id
    );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_end_live_calls_for_membership_change_v1
  on public.messaging_conversation_members;
create trigger rooms_end_live_calls_for_membership_change_v1
after update of membership_status, left_at or delete
on public.messaging_conversation_members
for each row execute function public.rooms_end_live_calls_for_messaging_change_v1();

create or replace function public.rooms_end_live_calls_for_conversation_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_conversation_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if tg_op = 'UPDATE' and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  update public.room_live_call_invitations_v1 invitation
  set status = case when invitation.status = 'accepted' then 'ended' else 'cancelled' end,
      route_mode = 'preview', route_revision = invitation.route_revision + 1,
      ended_at = now(), end_reason = 'direct_conversation_closed', updated_at = now()
  where invitation.direct_conversation_id = v_conversation_id
    and invitation.status in ('pending', 'accepted');
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_end_live_calls_for_conversation_update_v1
  on public.messaging_conversations;
create trigger rooms_end_live_calls_for_conversation_update_v1
after update of deleted_at on public.messaging_conversations
for each row execute function public.rooms_end_live_calls_for_conversation_change_v1();
drop trigger if exists rooms_end_live_calls_for_conversation_delete_v1
  on public.messaging_conversations;
create trigger rooms_end_live_calls_for_conversation_delete_v1
before delete on public.messaging_conversations
for each row execute function public.rooms_end_live_calls_for_conversation_change_v1();

create or replace function public.rooms_end_live_calls_for_block_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  update public.room_live_call_invitations_v1 invitation
  set status = case when invitation.status = 'accepted' then 'ended' else 'cancelled' end,
      route_mode = 'preview', route_revision = invitation.route_revision + 1,
      ended_at = now(), end_reason = 'messaging_blocked', updated_at = now()
  where invitation.status in ('pending', 'accepted')
    and (
      (invitation.host_id = new.blocker_profile_id and invitation.contact_profile_id = new.blocked_profile_id)
      or
      (invitation.host_id = new.blocked_profile_id and invitation.contact_profile_id = new.blocker_profile_id)
    );
  return new;
end;
$$;

drop trigger if exists rooms_end_live_calls_for_block_v1 on public.user_blocks;
create trigger rooms_end_live_calls_for_block_v1
after insert on public.user_blocks
for each row execute function public.rooms_end_live_calls_for_block_v1();

create or replace function public.rooms_end_live_calls_for_ban_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  update public.room_live_call_invitations_v1 invitation
  set status = case when invitation.status = 'accepted' then 'ended' else 'cancelled' end,
      route_mode = 'preview', route_revision = invitation.route_revision + 1,
      ended_at = now(), end_reason = 'room_access_revoked', updated_at = now()
  where invitation.room_id = new.room_id
    and invitation.contact_profile_id = new.user_id
    and invitation.status in ('pending', 'accepted');
  return new;
end;
$$;

drop trigger if exists rooms_end_live_calls_for_ban_v1 on public.room_bans_v2;
create trigger rooms_end_live_calls_for_ban_v1
after insert or update of room_id, user_id on public.room_bans_v2
for each row execute function public.rooms_end_live_calls_for_ban_v1();
drop trigger if exists rooms_end_live_calls_for_kick_v1 on public.room_kicks_v2;
create trigger rooms_end_live_calls_for_kick_v1
after insert or update of room_id, user_id on public.room_kicks_v2
for each row execute function public.rooms_end_live_calls_for_ban_v1();

-- -------------------------------------------------------------------------
-- Grants: browsers receive only narrow read/mutation RPCs. Media authority,
-- expiration and the outbox worker remain service-role-only.
-- -------------------------------------------------------------------------

revoke all on function public.rooms_live_call_require_service_role_v1()
  from public, anon, authenticated;
revoke all on function public.rooms_live_call_contact_allowed_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_live_call_room_access_revoked_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_live_call_contact_on_public_stage_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_enqueue_live_call_revocation_internal_v1(uuid, uuid, uuid, text, bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_expire_live_call_invitations_internal_v1(integer, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_live_call_force_off_air_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_live_call_keep_mode_immutable_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_live_call_revocation_changed_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_call_for_stage_entry_internal_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_call_on_stage_invitation_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_call_on_active_guest_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_calls_for_room_state_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_calls_for_messaging_change_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_calls_for_conversation_change_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_calls_for_block_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_live_calls_for_ban_v1()
  from public, anon, authenticated, service_role;

revoke all on function public.rooms_list_live_call_contacts_v1(uuid, text, integer)
  from public, anon;
grant execute on function public.rooms_list_live_call_contacts_v1(uuid, text, integer)
  to authenticated;
revoke all on function public.rooms_invite_live_call_contact_v1(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.rooms_invite_live_call_contact_v1(uuid, uuid, uuid, text)
  to authenticated;
revoke all on function public.rooms_list_my_live_call_invitations_v1(integer)
  from public, anon;
grant execute on function public.rooms_list_my_live_call_invitations_v1(integer)
  to authenticated;
revoke all on function public.rooms_respond_live_call_invitation_v1(uuid, boolean)
  from public, anon;
grant execute on function public.rooms_respond_live_call_invitation_v1(uuid, boolean)
  to authenticated;
revoke all on function public.rooms_set_live_call_route_v1(uuid, text, bigint)
  from public, anon;
grant execute on function public.rooms_set_live_call_route_v1(uuid, text, bigint)
  to authenticated;
revoke all on function public.rooms_set_live_call_on_air_v1(uuid, boolean, bigint)
  from public, anon;
grant execute on function public.rooms_set_live_call_on_air_v1(uuid, boolean, bigint)
  to authenticated;
revoke all on function public.rooms_end_live_call_invitation_v1(uuid)
  from public, anon;
grant execute on function public.rooms_end_live_call_invitation_v1(uuid)
  to authenticated;

revoke all on function public.rooms_authorize_live_call_media_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rooms_authorize_live_call_media_v1(uuid, uuid)
  to service_role;
revoke all on function public.rooms_expire_live_call_invitations_v1(integer)
  from public, anon, authenticated;
grant execute on function public.rooms_expire_live_call_invitations_v1(integer)
  to service_role;
revoke all on function public.rooms_claim_live_call_revocations_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.rooms_claim_live_call_revocations_v1(text, integer)
  to service_role;
revoke all on function public.rooms_live_call_revocation_should_execute_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rooms_live_call_revocation_should_execute_v1(uuid, uuid)
  to service_role;
revoke all on function public.rooms_complete_live_call_revocation_v1(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.rooms_complete_live_call_revocation_v1(uuid, uuid, boolean, text)
  to service_role;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables published
    where published.pubname = 'supabase_realtime'
      and published.schemaname = 'public'
      and published.tablename = 'room_live_call_invitations_v1'
  ) then
    alter publication supabase_realtime
      add table public.room_live_call_invitations_v1;
  end if;
end;
$$;

commit;
