begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Messaging / Artist Groups core v1
--
-- This phase owns only durable group identity, authority, invitations,
-- membership preferences and the linked Messaging conversation. Sessions,
-- votes, project links, media/covers and Rooms deliberately live elsewhere.
-- Every browser operation goes through a SECURITY DEFINER RPC; raw ledgers are
-- private and activity is append-only.
-- ---------------------------------------------------------------------------

create table if not exists public.artist_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  visibility text not null default 'private'
    check (visibility in ('private', 'discoverable')),
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'archived', 'deleted')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid not null unique
    references public.messaging_conversations(id) on delete restrict,
  member_limit integer not null default 50 check (member_limit between 2 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  check (char_length(trim(name)) between 2 and 80),
  check (description is null or char_length(description) <= 600),
  check (
    (lifecycle_status = 'active' and archived_at is null and deleted_at is null)
    or (lifecycle_status = 'archived' and archived_at is not null and deleted_at is null)
    or (lifecycle_status = 'deleted' and deleted_at is not null)
  )
);

create index if not exists artist_groups_creator_idx
  on public.artist_groups(created_by_profile_id, created_at desc);
create index if not exists artist_groups_lifecycle_idx
  on public.artist_groups(lifecycle_status, updated_at desc);

create table if not exists public.artist_group_members (
  group_id uuid not null references public.artist_groups(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  authority_role text not null default 'member'
    check (authority_role in ('owner', 'admin', 'member')),
  artistic_role text,
  membership_status text not null default 'active'
    check (membership_status in ('active', 'left', 'removed')),
  notifications_enabled boolean not null default true,
  roster_visibility text not null default 'visible'
    check (roster_visibility in ('visible', 'hidden')),
  archived_at timestamptz,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  removed_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, profile_id),
  check (artistic_role is null or char_length(trim(artistic_role)) between 2 and 80),
  check (
    (membership_status = 'active' and left_at is null)
    or (membership_status in ('left', 'removed') and left_at is not null)
  )
);

create unique index if not exists artist_group_one_active_owner_idx
  on public.artist_group_members(group_id)
  where authority_role = 'owner' and membership_status = 'active';
create index if not exists artist_group_members_profile_idx
  on public.artist_group_members(profile_id, membership_status, archived_at, updated_at desc);
create index if not exists artist_group_members_group_idx
  on public.artist_group_members(group_id, membership_status, authority_role, joined_at);

create table if not exists public.artist_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.artist_groups(id) on delete restrict,
  invitee_profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  artistic_role text,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  updated_at timestamptz not null default now(),
  unique (invited_by_profile_id, idempotency_key),
  check (char_length(idempotency_key) between 8 and 128),
  check (artistic_role is null or char_length(trim(artistic_role)) between 2 and 80),
  check (message is null or char_length(message) <= 500),
  check (expires_at > created_at)
);

create unique index if not exists artist_group_one_pending_invitation_idx
  on public.artist_group_invitations(group_id, invitee_profile_id)
  where status = 'pending';
create index if not exists artist_group_invitations_invitee_idx
  on public.artist_group_invitations(invitee_profile_id, status, created_at desc);
create index if not exists artist_group_invitations_group_idx
  on public.artist_group_invitations(group_id, status, created_at desc);

create table if not exists public.artist_group_activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.artist_groups(id) on delete restrict,
  actor_profile_id uuid,
  event_type text not null check (event_type in (
    'group_created', 'group_updated', 'group_archived', 'group_restored',
    'group_deleted', 'member_invited', 'invitation_accepted',
    'invitation_declined', 'invitation_cancelled', 'member_role_updated',
    'member_preferences_updated', 'ownership_transferred', 'member_removed',
    'member_left'
  )),
  subject_profile_id uuid,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  check (octet_length(payload::text) <= 4096)
);

create index if not exists artist_group_activity_feed_idx
  on public.artist_group_activity(group_id, created_at desc, id desc);

create table if not exists public.artist_group_idempotency (
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  result jsonb not null,
  group_id uuid,
  created_at timestamptz not null default now(),
  primary key (actor_profile_id, operation, idempotency_key),
  check (char_length(operation) between 3 and 80),
  check (char_length(idempotency_key) between 8 and 128),
  check (request_hash ~ '^[0-9a-f]{64}$'),
  check (octet_length(result::text) <= 8192)
);

create index if not exists artist_group_idempotency_created_idx
  on public.artist_group_idempotency(created_at);

-- No FK is attached to activity actor/subject UUIDs: account deletion must not
-- rewrite immutable historical events.
create or replace function public.artist_group_activity_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = '55000', message = 'artist_group_activity_is_append_only';
end;
$$;

drop trigger if exists artist_group_activity_immutable on public.artist_group_activity;
create trigger artist_group_activity_immutable
before update or delete on public.artist_group_activity
for each row execute function public.artist_group_activity_immutable_v1();

create or replace function public.artist_group_is_active_member_v1(
  p_group_id uuid,
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_profile_id is not null and exists (
    select 1
    from public.artist_group_members member
    join public.artist_groups artist_group on artist_group.id = member.group_id
    where member.group_id = p_group_id
      and member.profile_id = p_profile_id
      and member.membership_status = 'active'
      and artist_group.lifecycle_status <> 'deleted'
  );
$$;

create or replace function public.artist_group_authority_v1(
  p_group_id uuid,
  p_profile_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select member.authority_role
  from public.artist_group_members member
  join public.artist_groups artist_group on artist_group.id = member.group_id
  where member.group_id = p_group_id
    and member.profile_id = p_profile_id
    and member.membership_status = 'active'
    and artist_group.lifecycle_status <> 'deleted';
$$;

create or replace function public.artist_group_idempotency_replay_v1(
  p_actor_profile_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.artist_group_idempotency%rowtype;
begin
  select ledger.* into v_row
  from public.artist_group_idempotency ledger
  where ledger.actor_profile_id = p_actor_profile_id
    and ledger.operation = p_operation
    and ledger.idempotency_key = p_idempotency_key;

  if not found then return null; end if;
  if v_row.request_hash <> p_request_hash then
    raise exception using errcode = '23505', message = 'idempotency_conflict';
  end if;
  return v_row.result || jsonb_build_object('idempotent', true);
end;
$$;

create or replace function public.artist_group_store_idempotency_v1(
  p_actor_profile_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text,
  p_group_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.artist_group_idempotency (
    actor_profile_id, operation, idempotency_key, request_hash, group_id, result
  ) values (
    p_actor_profile_id, p_operation, p_idempotency_key,
    p_request_hash, p_group_id, p_result
  );
  return p_result || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.artist_group_prepare_profile_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group record;
  v_successor uuid;
begin
  for v_group in
    select artist_group.id, artist_group.conversation_id
    from public.artist_groups artist_group
    join public.artist_group_members owner_member
      on owner_member.group_id = artist_group.id
     and owner_member.profile_id = old.id
     and owner_member.authority_role = 'owner'
     and owner_member.membership_status = 'active'
    where artist_group.lifecycle_status <> 'deleted'
  loop
    perform 1 from public.artist_groups where id = v_group.id for update;
    select member.profile_id into v_successor
    from public.artist_group_members member
    where member.group_id = v_group.id
      and member.profile_id <> old.id
      and member.membership_status = 'active'
    order by case member.authority_role when 'admin' then 0 else 1 end,
             member.joined_at, member.profile_id
    limit 1
    for update;

    if v_successor is null then
      update public.artist_groups
      set lifecycle_status = 'deleted', deleted_at = now(), updated_at = now()
      where id = v_group.id;
      update public.messaging_conversations
      set deleted_at = coalesce(deleted_at, now()),
          metadata = metadata || jsonb_build_object('artist_group_lifecycle_status', 'deleted'),
          updated_at = now()
      where id = v_group.conversation_id;
      insert into public.artist_group_activity (
        group_id, actor_profile_id, event_type, payload
      ) values (
        v_group.id, old.id, 'group_deleted', jsonb_build_object('reason', 'owner_profile_deleted')
      );
    else
      -- Demote first: partial unique indexes are immediate and may validate
      -- each physical row before the second half of a multi-row swap.
      update public.artist_group_members
      set authority_role = 'member', updated_at = now()
      where group_id = v_group.id and profile_id = old.id;
      update public.artist_group_members
      set authority_role = 'owner', updated_at = now()
      where group_id = v_group.id and profile_id = v_successor;
      update public.messaging_conversation_members
      set role = 'member', updated_at = now()
      where conversation_id = v_group.conversation_id and profile_id = old.id;
      update public.messaging_conversation_members
      set role = 'owner', updated_at = now()
      where conversation_id = v_group.conversation_id and profile_id = v_successor;
      insert into public.artist_group_activity (
        group_id, actor_profile_id, event_type, subject_profile_id, payload
      ) values (
        v_group.id, old.id, 'ownership_transferred', v_successor,
        jsonb_build_object('reason', 'owner_profile_deleted')
      );
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists artist_group_profile_prepare_delete on public.profiles;
create trigger artist_group_profile_prepare_delete
before delete on public.profiles
for each row execute function public.artist_group_prepare_profile_delete_v1();

-- ---------------------------------------------------------------------------
-- Create/list/detail/activity projections.
-- ---------------------------------------------------------------------------

create or replace function public.create_artist_group_v1(
  p_name text,
  p_description text,
  p_visibility text,
  p_artistic_role text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_visibility text := lower(trim(coalesce(p_visibility, 'private')));
  v_artistic_role text := nullif(trim(coalesce(p_artistic_role, '')), '');
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_group_id uuid;
  v_conversation_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_artist_group_name';
  end if;
  if v_description is not null and char_length(v_description) > 600 then
    raise exception using errcode = '22023', message = 'invalid_artist_group_description';
  end if;
  if v_visibility not in ('private', 'discoverable') then
    raise exception using errcode = '22023', message = 'invalid_artist_group_visibility';
  end if;
  if v_artistic_role is not null and char_length(v_artistic_role) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_artist_group_artistic_role';
  end if;
  if char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;

  v_hash := encode(digest(jsonb_build_object(
    'name', v_name,
    'description', v_description,
    'visibility', v_visibility,
    'artistic_role', v_artistic_role
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:create:' || v_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':create:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'create', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  if (
    select count(*) from public.artist_group_members member
    join public.artist_groups artist_group on artist_group.id = member.group_id
    where member.profile_id = v_user_id
      and member.authority_role = 'owner'
      and member.membership_status = 'active'
      and artist_group.lifecycle_status <> 'deleted'
  ) >= 20 then
    raise exception using errcode = 'P0001', message = 'artist_group_owner_quota_reached';
  end if;
  if (
    select count(*) from public.artist_group_activity activity
    where activity.actor_profile_id = v_user_id
      and activity.event_type = 'group_created'
      and activity.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'artist_group_creation_rate_limit';
  end if;

  insert into public.messaging_conversations (
    kind, created_by_profile_id, creation_idempotency_key, title, metadata
  ) values (
    'group', v_user_id,
    'ag:' || substr(encode(digest(v_key, 'sha256'), 'hex'), 1, 60), v_name,
    jsonb_build_object('managed_by', 'artist_groups_v1')
  ) returning id into v_conversation_id;

  insert into public.artist_groups (
    name, description, visibility, created_by_profile_id, conversation_id
  ) values (
    v_name, v_description, v_visibility, v_user_id, v_conversation_id
  ) returning id into v_group_id;

  update public.messaging_conversations
  set metadata = metadata || jsonb_build_object(
        'artist_group_id', v_group_id,
        'artist_group_lifecycle_status', 'active'
      ),
      updated_at = now()
  where id = v_conversation_id;

  insert into public.artist_group_members (
    group_id, profile_id, authority_role, artistic_role
  ) values (v_group_id, v_user_id, 'owner', v_artistic_role);

  insert into public.messaging_conversation_members (
    conversation_id, profile_id, role, membership_status
  ) values (v_conversation_id, v_user_id, 'owner', 'active');

  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, payload, idempotency_key
  ) values (
    v_group_id, v_user_id, 'group_created',
    jsonb_build_object('visibility', v_visibility), v_key
  );

  v_result := jsonb_build_object(
    'ok', true, 'group_id', v_group_id,
    'conversation_id', v_conversation_id, 'lifecycle_status', 'active'
  );
  return public.artist_group_store_idempotency_v1(
    v_user_id, 'create', v_key, v_hash, v_group_id, v_result
  );
end;
$$;

create or replace function public.list_my_artist_groups_v1(
  p_scope text default 'active',
  p_cursor jsonb default null,
  p_limit integer default 30
)
returns table (
  group_id uuid,
  name text,
  description text,
  visibility text,
  lifecycle_status text,
  conversation_id uuid,
  member_limit integer,
  active_member_count bigint,
  pending_invitation_count bigint,
  my_authority_role text,
  my_artistic_role text,
  my_notifications_enabled boolean,
  my_roster_visibility text,
  my_archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  page_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_scope text := lower(trim(coalesce(p_scope, 'active')));
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
  v_cursor_at timestamptz;
  v_cursor_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_scope not in ('active', 'archived', 'all') then
    raise exception using errcode = '22023', message = 'invalid_artist_group_scope';
  end if;
  if p_cursor is not null then
    begin
      v_cursor_at := (p_cursor ->> 'updated_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'group_id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_artist_group_cursor';
    end;
    if v_cursor_at is null or v_cursor_id is null then
      raise exception using errcode = '22023', message = 'invalid_artist_group_cursor';
    end if;
  end if;

  return query
  select
    artist_group.id,
    artist_group.name,
    artist_group.description,
    artist_group.visibility,
    artist_group.lifecycle_status,
    artist_group.conversation_id,
    artist_group.member_limit,
    (select count(*) from public.artist_group_members counted
      where counted.group_id = artist_group.id and counted.membership_status = 'active'),
    (select count(*) from public.artist_group_invitations invitation
      where invitation.group_id = artist_group.id and invitation.status = 'pending'
        and invitation.expires_at > now()),
    member.authority_role,
    member.artistic_role,
    member.notifications_enabled,
    member.roster_visibility,
    member.archived_at,
    artist_group.created_at,
    artist_group.updated_at,
    jsonb_build_object('updated_at', artist_group.updated_at, 'group_id', artist_group.id)
  from public.artist_group_members member
  join public.artist_groups artist_group on artist_group.id = member.group_id
  where member.profile_id = v_user_id
    and member.membership_status = 'active'
    and artist_group.lifecycle_status <> 'deleted'
    and (
      v_scope = 'all'
      or (v_scope = 'active' and artist_group.lifecycle_status = 'active' and member.archived_at is null)
      or (v_scope = 'archived' and (artist_group.lifecycle_status = 'archived' or member.archived_at is not null))
    )
    and (p_cursor is null or (artist_group.updated_at, artist_group.id) < (v_cursor_at, v_cursor_id))
  order by artist_group.updated_at desc, artist_group.id desc
  limit v_limit;
end;
$$;

create or replace function public.get_artist_group_detail_v1(
  p_group_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_authority text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  v_authority := public.artist_group_authority_v1(p_group_id, v_user_id);
  if v_authority is null then
    raise exception using errcode = '42501', message = 'artist_group_membership_required';
  end if;

  select jsonb_build_object(
    'group_id', artist_group.id,
    'name', artist_group.name,
    'description', artist_group.description,
    'visibility', artist_group.visibility,
    'lifecycle_status', artist_group.lifecycle_status,
    'conversation_id', artist_group.conversation_id,
    'member_limit', artist_group.member_limit,
    'created_at', artist_group.created_at,
    'updated_at', artist_group.updated_at,
    'my_authority_role', caller_member.authority_role,
    'my_artistic_role', caller_member.artistic_role,
    'my_notifications_enabled', caller_member.notifications_enabled,
    'my_roster_visibility', caller_member.roster_visibility,
    'my_archived_at', caller_member.archived_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', member.profile_id,
        'username', profile.username,
        'display_name', coalesce(nullif(profile.display_name, ''), nullif(profile.username, ''), 'Membre Meewav'),
        'avatar_url', profile.avatar_url,
        'avatar_style_key', profile.avatar_style_key,
        'primary_role_key', profile.primary_role_key,
        'authority_role', member.authority_role,
        'artistic_role', member.artistic_role,
        'joined_at', member.joined_at,
        'roster_visibility', member.roster_visibility
      ) order by case member.authority_role when 'owner' then 0 when 'admin' then 1 else 2 end,
                 member.joined_at, member.profile_id)
      from public.artist_group_members member
      join public.profiles profile on profile.id = member.profile_id
      where member.group_id = artist_group.id
        and member.membership_status = 'active'
        and (member.roster_visibility = 'visible' or member.profile_id = v_user_id or v_authority in ('owner', 'admin'))
    ), '[]'::jsonb),
    'pending_invitations', case when v_authority in ('owner', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'invitation_id', invitation.id,
        'invitee_profile_id', invitation.invitee_profile_id,
        'invitee_username', invitee.username,
        'invitee_display_name', coalesce(nullif(invitee.display_name, ''), nullif(invitee.username, ''), 'Membre Meewav'),
        'artistic_role', invitation.artistic_role,
        'created_at', invitation.created_at,
        'expires_at', invitation.expires_at
      ) order by invitation.created_at desc)
      from public.artist_group_invitations invitation
      join public.profiles invitee on invitee.id = invitation.invitee_profile_id
      where invitation.group_id = artist_group.id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_result
  from public.artist_groups artist_group
  join public.artist_group_members caller_member
    on caller_member.group_id = artist_group.id
   and caller_member.profile_id = v_user_id
   and caller_member.membership_status = 'active'
  where artist_group.id = p_group_id
    and artist_group.lifecycle_status <> 'deleted';

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'artist_group_not_found';
  end if;
  return v_result;
end;
$$;

create or replace function public.list_artist_group_activity_v1(
  p_group_id uuid,
  p_cursor jsonb default null,
  p_limit integer default 50
)
returns table (
  activity_id uuid,
  event_type text,
  actor_profile_id uuid,
  actor_display_name text,
  subject_profile_id uuid,
  payload jsonb,
  created_at timestamptz,
  page_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 50)));
  v_cursor_at timestamptz;
  v_cursor_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not public.artist_group_is_active_member_v1(p_group_id, v_user_id) then
    raise exception using errcode = '42501', message = 'artist_group_membership_required';
  end if;
  if p_cursor is not null then
    begin
      v_cursor_at := (p_cursor ->> 'created_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'activity_id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_artist_group_cursor';
    end;
  end if;

  return query
  select activity.id, activity.event_type, activity.actor_profile_id,
    coalesce(nullif(actor.display_name, ''), nullif(actor.username, ''), 'Compte supprimé'),
    activity.subject_profile_id, activity.payload, activity.created_at,
    jsonb_build_object('created_at', activity.created_at, 'activity_id', activity.id)
  from public.artist_group_activity activity
  left join public.profiles actor on actor.id = activity.actor_profile_id
  where activity.group_id = p_group_id
    and (p_cursor is null or (activity.created_at, activity.id) < (v_cursor_at, v_cursor_id))
  order by activity.created_at desc, activity.id desc
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations. Acceptance is the only path that adds the invited profile to
-- both the Artist Group roster and its linked Messaging conversation.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_artist_group_invitations_v1(
  p_cursor jsonb default null,
  p_limit integer default 30
)
returns table (
  invitation_id uuid,
  group_id uuid,
  group_name text,
  conversation_id uuid,
  invited_by_profile_id uuid,
  inviter_username text,
  inviter_display_name text,
  inviter_avatar_url text,
  artistic_role text,
  message text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  page_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
  v_cursor_at timestamptz;
  v_cursor_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_cursor is not null then
    begin
      v_cursor_at := (p_cursor ->> 'created_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'invitation_id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_artist_group_cursor';
    end;
    if v_cursor_at is null or v_cursor_id is null then
      raise exception using errcode = '22023', message = 'invalid_artist_group_cursor';
    end if;
  end if;

  return query
  select invitation.id, artist_group.id, artist_group.name,
    artist_group.conversation_id, invitation.invited_by_profile_id,
    inviter.username,
    coalesce(nullif(inviter.display_name, ''), nullif(inviter.username, ''), 'Membre Meewav'),
    inviter.avatar_url, invitation.artistic_role, invitation.message,
    invitation.status, invitation.created_at, invitation.expires_at,
    jsonb_build_object('created_at', invitation.created_at, 'invitation_id', invitation.id)
  from public.artist_group_invitations invitation
  join public.artist_groups artist_group on artist_group.id = invitation.group_id
  left join public.profiles inviter on inviter.id = invitation.invited_by_profile_id
  where invitation.invitee_profile_id = v_user_id
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and artist_group.lifecycle_status = 'active'
    and (p_cursor is null or (invitation.created_at, invitation.id) < (v_cursor_at, v_cursor_id))
  order by invitation.created_at desc, invitation.id desc
  limit v_limit;
end;
$$;

create or replace function public.invite_artist_group_member_v1(
  p_group_id uuid,
  p_profile_id uuid,
  p_artistic_role text,
  p_message text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_authority text;
  v_artistic_role text := nullif(trim(coalesce(p_artistic_role, '')), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_group public.artist_groups%rowtype;
  v_invitation_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_group_id is null or p_profile_id is null or p_profile_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_artist_group_invitee';
  end if;
  if v_artistic_role is not null and char_length(v_artistic_role) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_artist_group_artistic_role';
  end if;
  if v_message is not null and char_length(v_message) > 500 then
    raise exception using errcode = '22023', message = 'invalid_artist_group_invitation_message';
  end if;
  if char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;

  v_hash := encode(digest(jsonb_build_object(
    'group_id', p_group_id,
    'profile_id', p_profile_id,
    'artistic_role', v_artistic_role,
    'message', v_message
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':invite:' || v_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('artist-group:invitee:' || p_group_id::text || ':' || p_profile_id::text, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'invite', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select artist_group.* into v_group
  from public.artist_groups artist_group
  where artist_group.id = p_group_id
  for update;
  if not found or v_group.lifecycle_status = 'deleted' then
    raise exception using errcode = 'P0002', message = 'artist_group_not_found';
  end if;
  if v_group.lifecycle_status <> 'active' then
    raise exception using errcode = '55000', message = 'artist_group_not_active';
  end if;
  v_authority := public.artist_group_authority_v1(p_group_id, v_user_id);
  if v_authority not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'artist_group_admin_required';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_profile_id
      and coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
  ) then
    raise exception using errcode = 'P0002', message = 'artist_group_invitee_not_found';
  end if;
  if public.messaging_profiles_blocked_v1(v_user_id, p_profile_id) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;
  if exists (
    select 1 from public.artist_group_members member
    where member.group_id = p_group_id
      and member.membership_status = 'active'
      and public.messaging_profiles_blocked_v1(member.profile_id, p_profile_id)
  ) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;
  if exists (
    select 1 from public.artist_group_members member
    where member.group_id = p_group_id and member.profile_id = p_profile_id
      and member.membership_status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'artist_group_already_member';
  end if;
  if exists (
    select 1 from public.artist_group_invitations invitation
    where invitation.group_id = p_group_id
      and invitation.invitee_profile_id = p_profile_id
      and invitation.status = 'pending' and invitation.expires_at > now()
  ) then
    raise exception using errcode = '23505', message = 'artist_group_invitation_pending';
  end if;
  if (
    (select count(*) from public.artist_group_members member
      where member.group_id = p_group_id and member.membership_status = 'active')
    +
    (select count(*) from public.artist_group_invitations invitation
      where invitation.group_id = p_group_id and invitation.status = 'pending'
        and invitation.expires_at > now())
  ) >= v_group.member_limit then
    raise exception using errcode = 'P0001', message = 'artist_group_member_quota_reached';
  end if;
  if (
    select count(*) from public.artist_group_activity activity
    where activity.actor_profile_id = v_user_id
      and activity.event_type = 'member_invited'
      and activity.created_at > now() - interval '24 hours'
  ) >= 100 then
    raise exception using errcode = 'P0001', message = 'artist_group_invitation_rate_limit';
  end if;

  update public.artist_group_invitations
  set status = 'expired', responded_at = now(), updated_at = now()
  where group_id = p_group_id and invitee_profile_id = p_profile_id
    and status = 'pending' and expires_at <= now();

  insert into public.artist_group_invitations (
    group_id, invitee_profile_id, invited_by_profile_id,
    artistic_role, message, idempotency_key
  ) values (
    p_group_id, p_profile_id, v_user_id,
    v_artistic_role, v_message, v_key
  ) returning id into v_invitation_id;

  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (
    p_group_id, v_user_id, 'member_invited', p_profile_id,
    jsonb_build_object('invitation_id', v_invitation_id, 'artistic_role', v_artistic_role), v_key
  );

  insert into public.notifications (
    user_id, type, from_user_id, content, payload, source_pillar, source_event_id
  ) values (
    p_profile_id, 'artist_group_invitation', v_user_id,
    't''invite à rejoindre un groupe d''artistes',
    jsonb_build_object('group_id', p_group_id, 'invitation_id', v_invitation_id),
    'messaging', 'artist-group-invitation:' || v_invitation_id::text
  ) on conflict (user_id, source_pillar, source_event_id)
    where source_event_id is not null do nothing;

  v_result := jsonb_build_object(
    'ok', true, 'group_id', p_group_id, 'invitation_id', v_invitation_id,
    'status', 'pending'
  );
  return public.artist_group_store_idempotency_v1(
    v_user_id, 'invite', v_key, v_hash, p_group_id, v_result
  );
end;
$$;

create or replace function public.respond_to_artist_group_invitation_v1(
  p_invitation_id uuid,
  p_decision text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_invitation public.artist_group_invitations%rowtype;
  v_group public.artist_groups%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_id is null or v_decision not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'invalid_artist_group_invitation_decision';
  end if;
  if char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  v_hash := encode(digest(concat_ws('|', p_invitation_id, v_decision), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':respond:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'respond_invitation', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select invitation.* into v_invitation
  from public.artist_group_invitations invitation
  where invitation.id = p_invitation_id
  for update;
  if not found or v_invitation.invitee_profile_id <> v_user_id then
    raise exception using errcode = 'P0002', message = 'artist_group_invitation_not_found';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'artist_group_invitation_already_resolved';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception using errcode = '55000', message = 'artist_group_invitation_expired';
  end if;
  select artist_group.* into v_group
  from public.artist_groups artist_group
  where artist_group.id = v_invitation.group_id
  for update;
  if not found or v_group.lifecycle_status <> 'active' then
    raise exception using errcode = '55000', message = 'artist_group_not_active';
  end if;
  if public.messaging_profiles_blocked_v1(v_user_id, v_invitation.invited_by_profile_id) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;

  if v_decision = 'accept' then
    if exists (
      select 1 from public.artist_group_members member
      where member.group_id = v_group.id
        and member.membership_status = 'active'
        and public.messaging_profiles_blocked_v1(v_user_id, member.profile_id)
    ) then
      raise exception using errcode = '42501', message = 'blocked_relationship';
    end if;
    if (
      select count(*) from public.artist_group_members member
      where member.profile_id = v_user_id and member.membership_status = 'active'
    ) >= 50 then
      raise exception using errcode = 'P0001', message = 'artist_group_membership_quota_reached';
    end if;
    if (
      select count(*) from public.artist_group_members member
      where member.group_id = v_group.id and member.membership_status = 'active'
    ) >= v_group.member_limit then
      raise exception using errcode = 'P0001', message = 'artist_group_member_quota_reached';
    end if;

    insert into public.artist_group_members (
      group_id, profile_id, authority_role, artistic_role,
      membership_status, joined_at, left_at, removed_by_profile_id
    ) values (
      v_group.id, v_user_id, 'member', v_invitation.artistic_role,
      'active', now(), null, null
    ) on conflict (group_id, profile_id) do update
      set authority_role = 'member', artistic_role = excluded.artistic_role,
          membership_status = 'active', joined_at = now(), left_at = null,
          removed_by_profile_id = null, updated_at = now();

    insert into public.messaging_conversation_members (
      conversation_id, profile_id, role, membership_status,
      joined_at, left_at, invited_by_profile_id, invited_at, responded_at
    ) values (
      v_group.conversation_id, v_user_id, 'member', 'active',
      now(), null, v_invitation.invited_by_profile_id, v_invitation.created_at, now()
    ) on conflict (conversation_id, profile_id) do update
      set role = 'member', membership_status = 'active', joined_at = now(),
          left_at = null, invited_by_profile_id = excluded.invited_by_profile_id,
          invited_at = excluded.invited_at, responded_at = now(), updated_at = now();

    update public.artist_group_invitations
    set status = 'accepted', responded_at = now(), updated_at = now()
    where id = v_invitation.id;
    insert into public.artist_group_activity (
      group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
    ) values (
      v_group.id, v_user_id, 'invitation_accepted', v_user_id,
      jsonb_build_object('invitation_id', v_invitation.id), v_key
    );
  else
    update public.artist_group_invitations
    set status = 'declined', responded_at = now(), updated_at = now()
    where id = v_invitation.id;
    insert into public.artist_group_activity (
      group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
    ) values (
      v_group.id, v_user_id, 'invitation_declined', v_user_id,
      jsonb_build_object('invitation_id', v_invitation.id), v_key
    );
  end if;

  if v_invitation.invited_by_profile_id is not null then
    insert into public.notifications (
      user_id, type, from_user_id, content, payload, source_pillar, source_event_id
    ) values (
      v_invitation.invited_by_profile_id,
      'artist_group_invitation_' || case when v_decision = 'accept' then 'accepted' else 'declined' end,
      v_user_id,
      case when v_decision = 'accept' then 'a accepté l''invitation au groupe' else 'a refusé l''invitation au groupe' end,
      jsonb_build_object('group_id', v_group.id, 'invitation_id', v_invitation.id),
      'messaging', 'artist-group-response:' || v_invitation.id::text
    ) on conflict (user_id, source_pillar, source_event_id)
      where source_event_id is not null do nothing;
  end if;

  v_result := jsonb_build_object(
    'ok', true, 'group_id', v_group.id, 'invitation_id', v_invitation.id,
    'status', case when v_decision = 'accept' then 'accepted' else 'declined' end,
    'conversation_id', case when v_decision = 'accept' then v_group.conversation_id else null end
  );
  return public.artist_group_store_idempotency_v1(
    v_user_id, 'respond_invitation', v_key, v_hash, v_group.id, v_result
  );
end;
$$;

create or replace function public.cancel_artist_group_invitation_v1(
  p_invitation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_invitation public.artist_group_invitations%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_invitation_id is null then raise exception using errcode = '22023', message = 'artist_group_invitation_required'; end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(p_invitation_id::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':cancel-invite:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'cancel_invitation', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select invitation.* into v_invitation from public.artist_group_invitations invitation
  where invitation.id = p_invitation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'artist_group_invitation_not_found'; end if;
  if public.artist_group_authority_v1(v_invitation.group_id, v_user_id) not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'artist_group_admin_required';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'artist_group_invitation_already_resolved';
  end if;

  update public.artist_group_invitations set status = 'cancelled', responded_at = now(), updated_at = now()
  where id = v_invitation.id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (
    v_invitation.group_id, v_user_id, 'invitation_cancelled', v_invitation.invitee_profile_id,
    jsonb_build_object('invitation_id', v_invitation.id), v_key
  );
  v_result := jsonb_build_object(
    'ok', true, 'group_id', v_invitation.group_id,
    'invitation_id', v_invitation.id, 'status', 'cancelled'
  );
  return public.artist_group_store_idempotency_v1(
    v_user_id, 'cancel_invitation', v_key, v_hash, v_invitation.group_id, v_result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Group/member lifecycle and preferences.
-- Authority (`owner/admin/member`) is intentionally separate from the free
-- artistic role displayed in the group roster.
-- ---------------------------------------------------------------------------

create or replace function public.update_artist_group_v1(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_visibility text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_visibility text := lower(trim(coalesce(p_visibility, '')));
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_group public.artist_groups%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if char_length(v_name) not between 2 and 80 then raise exception using errcode = '22023', message = 'invalid_artist_group_name'; end if;
  if v_description is not null and char_length(v_description) > 600 then raise exception using errcode = '22023', message = 'invalid_artist_group_description'; end if;
  if v_visibility not in ('private', 'discoverable') then raise exception using errcode = '22023', message = 'invalid_artist_group_visibility'; end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, v_name, coalesce(v_description, ''), v_visibility), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':update:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'update_group', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select artist_group.* into v_group from public.artist_groups artist_group
  where artist_group.id = p_group_id for update;
  if not found or v_group.lifecycle_status = 'deleted' then raise exception using errcode = 'P0002', message = 'artist_group_not_found'; end if;
  if public.artist_group_authority_v1(p_group_id, v_user_id) not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'artist_group_admin_required';
  end if;
  update public.artist_groups set name = v_name, description = v_description,
    visibility = v_visibility, updated_at = now() where id = p_group_id;
  update public.messaging_conversations set title = v_name, updated_at = now()
  where id = v_group.conversation_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, payload, idempotency_key
  ) values (
    p_group_id, v_user_id, 'group_updated', jsonb_build_object('visibility', v_visibility), v_key
  );
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'name', v_name, 'visibility', v_visibility);
  return public.artist_group_store_idempotency_v1(v_user_id, 'update_group', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.set_my_artist_group_preferences_v1(
  p_group_id uuid,
  p_notifications_enabled boolean,
  p_roster_visibility text,
  p_archived boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_visibility text := case when p_roster_visibility is null then null else lower(trim(p_roster_visibility)) end;
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_conversation_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_notifications_enabled is null and v_visibility is null and p_archived is null then
    raise exception using errcode = '22023', message = 'artist_group_preferences_empty';
  end if;
  if v_visibility is not null and v_visibility not in ('visible', 'hidden') then
    raise exception using errcode = '22023', message = 'invalid_artist_group_roster_visibility';
  end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, p_notifications_enabled, coalesce(v_visibility, ''), p_archived), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':preferences:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'set_preferences', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select artist_group.conversation_id into v_conversation_id
  from public.artist_groups artist_group
  join public.artist_group_members member on member.group_id = artist_group.id
  where artist_group.id = p_group_id and artist_group.lifecycle_status <> 'deleted'
    and member.profile_id = v_user_id and member.membership_status = 'active'
  for update of member;
  if not found then raise exception using errcode = '42501', message = 'artist_group_membership_required'; end if;

  update public.artist_group_members member
  set notifications_enabled = coalesce(p_notifications_enabled, member.notifications_enabled),
      roster_visibility = coalesce(v_visibility, member.roster_visibility),
      archived_at = case when p_archived is null then member.archived_at
                         when p_archived then coalesce(member.archived_at, now()) else null end,
      updated_at = now()
  where member.group_id = p_group_id and member.profile_id = v_user_id;
  update public.messaging_conversation_members member
  set notifications_enabled = coalesce(p_notifications_enabled, member.notifications_enabled),
      archived_at = case when p_archived is null then member.archived_at
                         when p_archived then coalesce(member.archived_at, now()) else null end,
      updated_at = now()
  where member.conversation_id = v_conversation_id and member.profile_id = v_user_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (
    p_group_id, v_user_id, 'member_preferences_updated', v_user_id,
    jsonb_strip_nulls(jsonb_build_object(
      'notifications_enabled', p_notifications_enabled,
      'roster_visibility', v_visibility,
      'archived', p_archived
    )), v_key
  );
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'profile_id', v_user_id);
  return public.artist_group_store_idempotency_v1(v_user_id, 'set_preferences', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.set_artist_group_authority_role_v1(
  p_group_id uuid,
  p_profile_id uuid,
  p_authority_role text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_authority_role, '')));
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_conversation_id uuid;
  v_target_role text;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_profile_id is null or p_profile_id = v_user_id or v_role not in ('admin', 'member') then
    raise exception using errcode = '22023', message = 'invalid_artist_group_authority_role';
  end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, p_profile_id, v_role), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':authority:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'set_authority', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select artist_group.conversation_id, member.authority_role
  into v_conversation_id, v_target_role
  from public.artist_groups artist_group
  join public.artist_group_members member on member.group_id = artist_group.id
  where artist_group.id = p_group_id and artist_group.lifecycle_status <> 'deleted'
    and member.profile_id = p_profile_id and member.membership_status = 'active'
  for update of member;
  if not found then raise exception using errcode = 'P0002', message = 'artist_group_member_not_found'; end if;
  if public.artist_group_authority_v1(p_group_id, v_user_id) <> 'owner' then
    raise exception using errcode = '42501', message = 'artist_group_owner_required';
  end if;
  if v_target_role = 'owner' then raise exception using errcode = '55000', message = 'artist_group_owner_role_immutable'; end if;

  update public.artist_group_members set authority_role = v_role, updated_at = now()
  where group_id = p_group_id and profile_id = p_profile_id;
  update public.messaging_conversation_members set role = v_role, updated_at = now()
  where conversation_id = v_conversation_id and profile_id = p_profile_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (
    p_group_id, v_user_id, 'member_role_updated', p_profile_id,
    jsonb_build_object('role_kind', 'authority', 'authority_role', v_role), v_key
  );
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'profile_id', p_profile_id, 'authority_role', v_role);
  return public.artist_group_store_idempotency_v1(v_user_id, 'set_authority', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.set_artist_group_artistic_role_v1(
  p_group_id uuid,
  p_profile_id uuid,
  p_artistic_role text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := nullif(trim(coalesce(p_artistic_role, '')), '');
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_profile_id is null or (v_role is not null and char_length(v_role) not between 2 and 80) then
    raise exception using errcode = '22023', message = 'invalid_artist_group_artistic_role';
  end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, p_profile_id, coalesce(v_role, '')), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':artistic-role:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'set_artistic_role', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  perform 1 from public.artist_group_members member
  join public.artist_groups artist_group on artist_group.id = member.group_id
  where member.group_id = p_group_id and member.profile_id = p_profile_id
    and member.membership_status = 'active' and artist_group.lifecycle_status <> 'deleted'
  for update of member;
  if not found then raise exception using errcode = 'P0002', message = 'artist_group_member_not_found'; end if;
  if p_profile_id <> v_user_id and public.artist_group_authority_v1(p_group_id, v_user_id) not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'artist_group_admin_required';
  end if;

  update public.artist_group_members set artistic_role = v_role, updated_at = now()
  where group_id = p_group_id and profile_id = p_profile_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (
    p_group_id, v_user_id, 'member_role_updated', p_profile_id,
    jsonb_build_object('role_kind', 'artistic', 'artistic_role', v_role), v_key
  );
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'profile_id', p_profile_id, 'artistic_role', v_role);
  return public.artist_group_store_idempotency_v1(v_user_id, 'set_artistic_role', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.transfer_artist_group_ownership_v1(
  p_group_id uuid,
  p_profile_id uuid,
  p_previous_owner_role text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous_role text := lower(trim(coalesce(p_previous_owner_role, 'admin')));
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_conversation_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_profile_id is null or p_profile_id = v_user_id or v_previous_role not in ('admin', 'member') then
    raise exception using errcode = '22023', message = 'invalid_artist_group_ownership_transfer';
  end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, p_profile_id, v_previous_role), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':transfer:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'transfer_ownership', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select artist_group.conversation_id into v_conversation_id
  from public.artist_groups artist_group
  join public.artist_group_members target on target.group_id = artist_group.id
  where artist_group.id = p_group_id and artist_group.lifecycle_status <> 'deleted'
    and target.profile_id = p_profile_id and target.membership_status = 'active'
  for update of artist_group, target;
  if not found then raise exception using errcode = 'P0002', message = 'artist_group_member_not_found'; end if;
  if public.artist_group_authority_v1(p_group_id, v_user_id) <> 'owner' then
    raise exception using errcode = '42501', message = 'artist_group_owner_required';
  end if;

  -- Demote before promoting because the active-owner partial unique index is
  -- immediate, not deferrable.
  update public.artist_group_members
  set authority_role = v_previous_role, updated_at = now()
  where group_id = p_group_id and profile_id = v_user_id;
  update public.artist_group_members
  set authority_role = 'owner', updated_at = now()
  where group_id = p_group_id and profile_id = p_profile_id;
  update public.messaging_conversation_members
  set role = v_previous_role, updated_at = now()
  where conversation_id = v_conversation_id and profile_id = v_user_id;
  update public.messaging_conversation_members
  set role = 'owner', updated_at = now()
  where conversation_id = v_conversation_id and profile_id = p_profile_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (
    p_group_id, v_user_id, 'ownership_transferred', p_profile_id,
    jsonb_build_object('previous_owner_role', v_previous_role), v_key
  );
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'owner_profile_id', p_profile_id);
  return public.artist_group_store_idempotency_v1(v_user_id, 'transfer_ownership', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.remove_artist_group_member_v1(
  p_group_id uuid,
  p_profile_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_actor_role text;
  v_target_role text;
  v_conversation_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_profile_id is null or p_profile_id = v_user_id then raise exception using errcode = '22023', message = 'invalid_artist_group_member'; end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, p_profile_id), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':remove:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'remove_member', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;

  select artist_group.conversation_id, member.authority_role into v_conversation_id, v_target_role
  from public.artist_groups artist_group
  join public.artist_group_members member on member.group_id = artist_group.id
  where artist_group.id = p_group_id and artist_group.lifecycle_status <> 'deleted'
    and member.profile_id = p_profile_id and member.membership_status = 'active'
  for update of member;
  if not found then raise exception using errcode = 'P0002', message = 'artist_group_member_not_found'; end if;
  v_actor_role := public.artist_group_authority_v1(p_group_id, v_user_id);
  if v_actor_role not in ('owner', 'admin') then raise exception using errcode = '42501', message = 'artist_group_admin_required'; end if;
  if v_target_role = 'owner' or (v_actor_role = 'admin' and v_target_role <> 'member') then
    raise exception using errcode = '42501', message = 'artist_group_member_remove_forbidden';
  end if;

  update public.artist_group_members set membership_status = 'removed', left_at = now(),
    archived_at = null, removed_by_profile_id = v_user_id, updated_at = now()
  where group_id = p_group_id and profile_id = p_profile_id;
  update public.messaging_conversation_members set left_at = now(), archived_at = null,
    updated_at = now()
  where conversation_id = v_conversation_id and profile_id = p_profile_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (p_group_id, v_user_id, 'member_removed', p_profile_id, '{}'::jsonb, v_key);
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'profile_id', p_profile_id, 'status', 'removed');
  return public.artist_group_store_idempotency_v1(v_user_id, 'remove_member', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.leave_artist_group_v1(
  p_group_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_role text;
  v_conversation_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(p_group_id::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':leave:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'leave', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select artist_group.conversation_id, member.authority_role into v_conversation_id, v_role
  from public.artist_groups artist_group
  join public.artist_group_members member on member.group_id = artist_group.id
  where artist_group.id = p_group_id and artist_group.lifecycle_status <> 'deleted'
    and member.profile_id = v_user_id and member.membership_status = 'active'
  for update of member;
  if not found then raise exception using errcode = '42501', message = 'artist_group_membership_required'; end if;
  if v_role = 'owner' then raise exception using errcode = '55000', message = 'artist_group_owner_transfer_required'; end if;
  update public.artist_group_members set membership_status = 'left', left_at = now(),
    archived_at = null, updated_at = now()
  where group_id = p_group_id and profile_id = v_user_id;
  update public.messaging_conversation_members set left_at = now(), archived_at = null, updated_at = now()
  where conversation_id = v_conversation_id and profile_id = v_user_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, subject_profile_id, payload, idempotency_key
  ) values (p_group_id, v_user_id, 'member_left', v_user_id, '{}'::jsonb, v_key);
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'profile_id', v_user_id, 'status', 'left');
  return public.artist_group_store_idempotency_v1(v_user_id, 'leave', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.set_artist_group_archived_v1(
  p_group_id uuid,
  p_archived boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_group public.artist_groups%rowtype;
  v_status text;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_archived is null then raise exception using errcode = '22023', message = 'invalid_artist_group_archive_state'; end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, p_archived), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':archive:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'set_archived', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select artist_group.* into v_group from public.artist_groups artist_group
  where artist_group.id = p_group_id for update;
  if not found or v_group.lifecycle_status = 'deleted' then raise exception using errcode = 'P0002', message = 'artist_group_not_found'; end if;
  if public.artist_group_authority_v1(p_group_id, v_user_id) <> 'owner' then
    raise exception using errcode = '42501', message = 'artist_group_owner_required';
  end if;
  v_status := case when p_archived then 'archived' else 'active' end;
  update public.artist_groups set lifecycle_status = v_status,
    archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
    updated_at = now() where id = p_group_id;
  update public.messaging_conversations set
    deleted_at = case when p_archived then coalesce(deleted_at, now()) else null end,
    metadata = metadata || jsonb_build_object('artist_group_lifecycle_status', v_status),
    updated_at = now()
  where id = v_group.conversation_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, payload, idempotency_key
  ) values (
    p_group_id, v_user_id, case when p_archived then 'group_archived' else 'group_restored' end,
    '{}'::jsonb, v_key
  );
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'lifecycle_status', v_status);
  return public.artist_group_store_idempotency_v1(v_user_id, 'set_archived', v_key, v_hash, p_group_id, v_result);
end;
$$;

create or replace function public.delete_artist_group_v1(
  p_group_id uuid,
  p_confirmation_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_confirmation text := trim(coalesce(p_confirmation_name, ''));
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_group public.artist_groups%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if char_length(v_key) not between 8 and 128 then raise exception using errcode = '22023', message = 'invalid_idempotency_key'; end if;
  v_hash := encode(digest(concat_ws('|', p_group_id, v_confirmation), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('artist-group:key:' || v_user_id::text || ':delete:' || v_key, 0));
  v_replay := public.artist_group_idempotency_replay_v1(v_user_id, 'delete', v_key, v_hash);
  if v_replay is not null then return v_replay; end if;
  select artist_group.* into v_group from public.artist_groups artist_group
  where artist_group.id = p_group_id for update;
  if not found or v_group.lifecycle_status = 'deleted' then raise exception using errcode = 'P0002', message = 'artist_group_not_found'; end if;
  if public.artist_group_authority_v1(p_group_id, v_user_id) <> 'owner' then
    raise exception using errcode = '42501', message = 'artist_group_owner_required';
  end if;
  if v_confirmation <> v_group.name then raise exception using errcode = '22023', message = 'artist_group_delete_confirmation_mismatch'; end if;
  update public.artist_group_invitations set status = 'cancelled', responded_at = now(), updated_at = now()
  where group_id = p_group_id and status = 'pending';
  update public.artist_groups set lifecycle_status = 'deleted', deleted_at = now(), updated_at = now()
  where id = p_group_id;
  update public.messaging_conversations set deleted_at = coalesce(deleted_at, now()),
    metadata = metadata || jsonb_build_object('artist_group_lifecycle_status', 'deleted'),
    updated_at = now()
  where id = v_group.conversation_id;
  insert into public.artist_group_activity (
    group_id, actor_profile_id, event_type, payload, idempotency_key
  ) values (p_group_id, v_user_id, 'group_deleted', '{}'::jsonb, v_key);
  v_result := jsonb_build_object('ok', true, 'group_id', p_group_id, 'lifecycle_status', 'deleted');
  return public.artist_group_store_idempotency_v1(v_user_id, 'delete', v_key, v_hash, p_group_id, v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Least privilege. There are intentionally no authenticated RLS policies on
-- raw Artist Group state; the stable RPC projections are the only client API.
-- ---------------------------------------------------------------------------

alter table public.artist_groups enable row level security;
alter table public.artist_group_members enable row level security;
alter table public.artist_group_invitations enable row level security;
alter table public.artist_group_activity enable row level security;
alter table public.artist_group_idempotency enable row level security;

revoke all on public.artist_groups from anon, authenticated;
revoke all on public.artist_group_members from anon, authenticated;
revoke all on public.artist_group_invitations from anon, authenticated;
revoke all on public.artist_group_activity from anon, authenticated;
revoke all on public.artist_group_idempotency from anon, authenticated;
grant all on public.artist_groups to service_role;
grant all on public.artist_group_members to service_role;
grant all on public.artist_group_invitations to service_role;
grant all on public.artist_group_activity to service_role;
grant all on public.artist_group_idempotency to service_role;

revoke execute on function public.artist_group_activity_immutable_v1() from public, anon, authenticated;
revoke execute on function public.artist_group_is_active_member_v1(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.artist_group_authority_v1(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.artist_group_idempotency_replay_v1(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.artist_group_store_idempotency_v1(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.artist_group_prepare_profile_delete_v1() from public, anon, authenticated;

revoke execute on function public.create_artist_group_v1(text, text, text, text, text) from public, anon;
grant execute on function public.create_artist_group_v1(text, text, text, text, text) to authenticated, service_role;
revoke execute on function public.list_my_artist_groups_v1(text, jsonb, integer) from public, anon;
grant execute on function public.list_my_artist_groups_v1(text, jsonb, integer) to authenticated, service_role;
revoke execute on function public.get_artist_group_detail_v1(uuid) from public, anon;
grant execute on function public.get_artist_group_detail_v1(uuid) to authenticated, service_role;
revoke execute on function public.list_artist_group_activity_v1(uuid, jsonb, integer) from public, anon;
grant execute on function public.list_artist_group_activity_v1(uuid, jsonb, integer) to authenticated, service_role;
revoke execute on function public.list_my_artist_group_invitations_v1(jsonb, integer) from public, anon;
grant execute on function public.list_my_artist_group_invitations_v1(jsonb, integer) to authenticated, service_role;
revoke execute on function public.invite_artist_group_member_v1(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.invite_artist_group_member_v1(uuid, uuid, text, text, text) to authenticated, service_role;
revoke execute on function public.respond_to_artist_group_invitation_v1(uuid, text, text) from public, anon;
grant execute on function public.respond_to_artist_group_invitation_v1(uuid, text, text) to authenticated, service_role;
revoke execute on function public.cancel_artist_group_invitation_v1(uuid, text) from public, anon;
grant execute on function public.cancel_artist_group_invitation_v1(uuid, text) to authenticated, service_role;
revoke execute on function public.update_artist_group_v1(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_artist_group_v1(uuid, text, text, text, text) to authenticated, service_role;
revoke execute on function public.set_my_artist_group_preferences_v1(uuid, boolean, text, boolean, text) from public, anon;
grant execute on function public.set_my_artist_group_preferences_v1(uuid, boolean, text, boolean, text) to authenticated, service_role;
revoke execute on function public.set_artist_group_authority_role_v1(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_artist_group_authority_role_v1(uuid, uuid, text, text) to authenticated, service_role;
revoke execute on function public.set_artist_group_artistic_role_v1(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_artist_group_artistic_role_v1(uuid, uuid, text, text) to authenticated, service_role;
revoke execute on function public.transfer_artist_group_ownership_v1(uuid, uuid, text, text) from public, anon;
grant execute on function public.transfer_artist_group_ownership_v1(uuid, uuid, text, text) to authenticated, service_role;
revoke execute on function public.remove_artist_group_member_v1(uuid, uuid, text) from public, anon;
grant execute on function public.remove_artist_group_member_v1(uuid, uuid, text) to authenticated, service_role;
revoke execute on function public.leave_artist_group_v1(uuid, text) from public, anon;
grant execute on function public.leave_artist_group_v1(uuid, text) to authenticated, service_role;
revoke execute on function public.set_artist_group_archived_v1(uuid, boolean, text) from public, anon;
grant execute on function public.set_artist_group_archived_v1(uuid, boolean, text) to authenticated, service_role;
revoke execute on function public.delete_artist_group_v1(uuid, text, text) from public, anon;
grant execute on function public.delete_artist_group_v1(uuid, text, text) to authenticated, service_role;

commit;
