-- Meewav Messaging Projects core v1.
--
-- This additive phase deliberately contains no media, stems, takes, mixes,
-- feedback or Rooms dependency. It establishes the authority boundary,
-- invitations, tasks, project chat linkage and append-only activity needed by
-- both Web and iOS clients. Browser roles only use the narrow RPC projections.

begin;

create extension if not exists pgcrypto;

create table if not exists public.creative_projects (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text not null default '',
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'archived')),
  genre text,
  bpm integer check (bpm is null or bpm between 20 and 400),
  musical_key text,
  objective text,
  delivery_at timestamptz,
  milestone text,
  creation_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  check (char_length(name) between 1 and 120),
  check (char_length(description) <= 4000),
  check (genre is null or char_length(genre) between 1 and 80),
  check (musical_key is null or char_length(musical_key) between 1 and 32),
  check (objective is null or char_length(objective) between 1 and 2000),
  check (milestone is null or char_length(milestone) between 1 and 240),
  check (
    creation_idempotency_key is null
    or char_length(creation_idempotency_key) between 8 and 128
  )
);

create unique index if not exists creative_projects_creation_key_idx
  on public.creative_projects(owner_profile_id, creation_idempotency_key)
  where creation_idempotency_key is not null;
create index if not exists creative_projects_owner_activity_idx
  on public.creative_projects(owner_profile_id, updated_at desc)
  where deleted_at is null;
create index if not exists creative_projects_status_activity_idx
  on public.creative_projects(status, updated_at desc)
  where deleted_at is null;

create table if not exists public.creative_project_members (
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  authority_role text not null default 'contributor'
    check (authority_role in ('owner', 'admin', 'contributor', 'viewer')),
  artistic_role text,
  can_edit boolean not null default true,
  can_invite boolean not null default false,
  can_manage_members boolean not null default false,
  can_manage_stems boolean not null default true,
  can_create_tasks boolean not null default true,
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, profile_id),
  check (artistic_role is null or char_length(artistic_role) between 1 and 80),
  check (
    authority_role <> 'viewer'
    or not (can_edit or can_invite or can_manage_members or can_manage_stems or can_create_tasks)
  )
);

create unique index if not exists creative_project_one_active_owner_idx
  on public.creative_project_members(project_id)
  where authority_role = 'owner' and left_at is null;
create index if not exists creative_project_members_profile_idx
  on public.creative_project_members(profile_id, updated_at desc)
  where left_at is null;

create table if not exists public.creative_project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  inviter_profile_id uuid references public.profiles(id) on delete set null,
  invited_profile_id uuid not null references public.profiles(id) on delete cascade,
  proposed_authority_role text not null default 'contributor'
    check (proposed_authority_role in ('admin', 'contributor', 'viewer')),
  proposed_artistic_role text,
  proposed_can_edit boolean not null default true,
  proposed_can_invite boolean not null default false,
  proposed_can_manage_members boolean not null default false,
  proposed_can_manage_stems boolean not null default true,
  proposed_can_create_tasks boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  idempotency_key text not null,
  request_hash text not null,
  response_idempotency_key text,
  response_decision text check (response_decision in ('accept', 'decline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (char_length(idempotency_key) between 8 and 128),
  check (char_length(request_hash) = 64),
  check (
    response_idempotency_key is null
    or char_length(response_idempotency_key) between 8 and 128
  ),
  check (
    proposed_artistic_role is null
    or char_length(proposed_artistic_role) between 1 and 80
  ),
  check (
    proposed_authority_role <> 'viewer'
    or not (
      proposed_can_edit or proposed_can_invite or proposed_can_manage_members
      or proposed_can_manage_stems or proposed_can_create_tasks
    )
  )
);

create unique index if not exists creative_project_invitation_key_idx
  on public.creative_project_invitations(inviter_profile_id, idempotency_key);
create unique index if not exists creative_project_one_pending_invite_idx
  on public.creative_project_invitations(project_id, invited_profile_id)
  where status = 'pending';
create index if not exists creative_project_invited_inbox_idx
  on public.creative_project_invitations(invited_profile_id, created_at desc);
create index if not exists creative_project_inviter_outbox_idx
  on public.creative_project_invitations(inviter_profile_id, created_at desc);

create table if not exists public.creative_project_conversations (
  project_id uuid primary key references public.creative_projects(id) on delete cascade,
  conversation_id uuid not null unique
    references public.messaging_conversations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.creative_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done')),
  due_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  check (char_length(title) between 1 and 200),
  check (char_length(description) <= 4000)
);

create index if not exists creative_project_tasks_project_status_idx
  on public.creative_project_tasks(project_id, status, updated_at desc)
  where deleted_at is null;
create index if not exists creative_project_tasks_assignee_idx
  on public.creative_project_tasks(assigned_profile_id, due_at)
  where deleted_at is null and status <> 'done';

create table if not exists public.creative_project_activity (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'project_created', 'project_updated', 'project_completed',
    'project_reopened', 'project_archived', 'project_deleted',
    'member_invited', 'invitation_accepted', 'invitation_declined',
    'member_updated', 'member_removed', 'member_left',
    'ownership_transferred', 'task_created', 'task_updated', 'task_deleted'
  )),
  subject_profile_id uuid references public.profiles(id) on delete set null,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (octet_length(payload::text) <= 8192)
);

create index if not exists creative_project_activity_project_idx
  on public.creative_project_activity(project_id, id desc);

create or replace function public.messaging_projects_touch_updated_at_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Internal authority helpers are defined before public mutations so a fresh
-- database validates this migration without relying on deferred body lookup.
create or replace function public.messaging_project_is_active_member_v1(
  p_project_id uuid,
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
    from public.creative_projects project
    join public.creative_project_members member
      on member.project_id = project.id
    where project.id = p_project_id
      and project.deleted_at is null
      and member.profile_id = p_profile_id
      and member.left_at is null
  );
$$;

create or replace function public.messaging_project_has_permission_v1(
  p_project_id uuid,
  p_permission text,
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
    from public.creative_projects project
    join public.creative_project_members member
      on member.project_id = project.id
    where project.id = p_project_id
      and project.deleted_at is null
      and member.profile_id = p_profile_id
      and member.left_at is null
      and (
        member.authority_role = 'owner'
        or (p_permission = 'edit' and member.can_edit)
        or (p_permission = 'invite' and member.can_invite)
        or (p_permission = 'manage_members' and member.can_manage_members)
        or (p_permission = 'manage_stems' and member.can_manage_stems)
        or (p_permission = 'create_tasks' and member.can_create_tasks)
        or (p_permission = 'admin' and member.authority_role in ('owner', 'admin'))
      )
  );
$$;

create or replace function public.messaging_project_append_activity_v1(
  p_project_id uuid,
  p_actor_profile_id uuid,
  p_event_type text,
  p_subject_profile_id uuid default null,
  p_subject_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if jsonb_typeof(v_payload) <> 'object'
     or octet_length(v_payload::text) > 8192 then
    raise exception using errcode = '22023', message = 'invalid_activity_payload';
  end if;
  insert into public.creative_project_activity (
    project_id, actor_profile_id, event_type,
    subject_profile_id, subject_id, payload
  ) values (
    p_project_id, p_actor_profile_id, p_event_type,
    p_subject_profile_id, p_subject_id, v_payload
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.messaging_project_profile_name_v1(
  p_profile_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(trim(profile.display_name), ''),
    nullif(trim(profile.username), ''),
    'Membre Meewav'
  )
  from public.profiles profile
  where profile.id = p_profile_id;
$$;

create or replace function public.create_creative_project_v1(
  p_name text,
  p_description text default '',
  p_genre text default null,
  p_bpm integer default null,
  p_musical_key text default null,
  p_objective text default null,
  p_delivery_at timestamptz default null,
  p_milestone text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_genre text := nullif(trim(coalesce(p_genre, '')), '');
  v_musical_key text := nullif(trim(coalesce(p_musical_key, '')), '');
  v_objective text := nullif(trim(coalesce(p_objective, '')), '');
  v_milestone text := nullif(trim(coalesce(p_milestone, '')), '');
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_existing_id uuid;
  v_project_id uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(v_name) not between 1 and 120
     or char_length(v_description) > 4000
     or char_length(coalesce(v_genre, '')) > 80
     or char_length(coalesce(v_musical_key, '')) > 32
     or char_length(coalesce(v_objective, '')) > 2000
     or char_length(coalesce(v_milestone, '')) > 240
     or (p_bpm is not null and p_bpm not between 20 and 400)
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_project_payload';
  end if;

  v_hash := encode(digest(convert_to(jsonb_build_object(
    'name', v_name,
    'description', v_description,
    'genre', v_genre,
    'bpm', p_bpm,
    'musical_key', v_musical_key,
    'objective', v_objective,
    'delivery_at', p_delivery_at,
    'milestone', v_milestone
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-create:' || v_user_id::text || ':' || v_key,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-create-rate:' || v_user_id::text,
    0
  ));

  select ledger.result_id into v_existing_id
  from public.messaging_idempotency_keys ledger
  where ledger.profile_id = v_user_id
    and ledger.operation = 'create_creative_project_v1'
    and ledger.idempotency_key = v_key;
  if found then
    if not exists (
      select 1 from public.messaging_idempotency_keys ledger
      where ledger.profile_id = v_user_id
        and ledger.operation = 'create_creative_project_v1'
        and ledger.idempotency_key = v_key
        and ledger.request_hash = v_hash
    ) then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    select link.conversation_id into v_conversation_id
    from public.creative_project_conversations link
    join public.creative_projects project on project.id = link.project_id
    where project.id = v_existing_id and project.deleted_at is null;
    if v_conversation_id is null then
      raise exception using errcode = '55000', message = 'project_deleted';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'project_id', v_existing_id,
      'conversation_id', v_conversation_id
    );
  end if;

  if (
    select count(*) from public.creative_projects project
    where project.owner_profile_id = v_user_id
      and project.deleted_at is null
  ) >= 100 then
    raise exception using errcode = 'P0001', message = 'project_owner_quota_exceeded';
  end if;
  if (
    select count(*) from public.creative_projects project
    where project.owner_profile_id = v_user_id
      and project.created_at > now() - interval '24 hours'
  ) >= 25 then
    raise exception using errcode = 'P0001', message = 'project_creation_rate_limit';
  end if;

  insert into public.creative_projects (
    owner_profile_id, name, description, genre, bpm, musical_key,
    objective, delivery_at, milestone, creation_idempotency_key
  ) values (
    v_user_id, v_name, v_description, v_genre, p_bpm, v_musical_key,
    v_objective, p_delivery_at, v_milestone, v_key
  ) returning id into v_project_id;

  insert into public.creative_project_members (
    project_id, profile_id, authority_role, artistic_role,
    can_edit, can_invite, can_manage_members, can_manage_stems,
    can_create_tasks
  ) values (
    v_project_id, v_user_id, 'owner', null,
    true, true, true, true, true
  );

  insert into public.messaging_conversations (
    kind, created_by_profile_id, creation_idempotency_key, title, metadata
  ) values (
    'project', v_user_id, v_key, v_name,
    jsonb_build_object('domain', 'creative_project', 'project_id', v_project_id)
  ) returning id into v_conversation_id;

  insert into public.messaging_conversation_members (
    conversation_id, profile_id, role, membership_status
  ) values (v_conversation_id, v_user_id, 'owner', 'active');

  insert into public.creative_project_conversations(project_id, conversation_id)
  values (v_project_id, v_conversation_id);

  perform public.messaging_project_append_activity_v1(
    v_project_id, v_user_id, 'project_created', v_user_id, v_project_id,
    jsonb_build_object('name', v_name)
  );

  insert into public.messaging_idempotency_keys (
    profile_id, operation, idempotency_key, request_hash, result_id
  ) values (
    v_user_id, 'create_creative_project_v1', v_key, v_hash, v_project_id
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'project_id', v_project_id,
    'conversation_id', v_conversation_id
  );
end;
$$;

create or replace function public.update_creative_project_v1(
  p_project_id uuid,
  p_name text,
  p_description text default '',
  p_genre text default null,
  p_bpm integer default null,
  p_musical_key text default null,
  p_objective text default null,
  p_delivery_at timestamptz default null,
  p_milestone text default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_project public.creative_projects%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_genre text := nullif(trim(coalesce(p_genre, '')), '');
  v_musical_key text := nullif(trim(coalesce(p_musical_key, '')), '');
  v_objective text := nullif(trim(coalesce(p_objective, '')), '');
  v_milestone text := nullif(trim(coalesce(p_milestone, '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null
     or char_length(v_name) not between 1 and 120
     or char_length(v_description) > 4000
     or char_length(coalesce(v_genre, '')) > 80
     or char_length(coalesce(v_musical_key, '')) > 32
     or char_length(coalesce(v_objective, '')) > 2000
     or char_length(coalesce(v_milestone, '')) > 240
     or (p_bpm is not null and p_bpm not between 20 and 400) then
    raise exception using errcode = '22023', message = 'invalid_project_payload';
  end if;

  select * into v_project
  from public.creative_projects project
  where project.id = p_project_id and project.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;
  if not public.messaging_project_has_permission_v1(p_project_id, 'edit', v_user_id) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;
  if v_project.name = v_name
     and v_project.description = v_description
     and v_project.genre is not distinct from v_genre
     and v_project.bpm is not distinct from p_bpm
     and v_project.musical_key is not distinct from v_musical_key
     and v_project.objective is not distinct from v_objective
     and v_project.delivery_at is not distinct from p_delivery_at
     and v_project.milestone is not distinct from v_milestone then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'project_id', p_project_id,
      'updated_at', v_project.updated_at
    );
  end if;
  if p_expected_updated_at is not null
     and v_project.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'project_version_conflict';
  end if;

  update public.creative_projects
  set name = v_name,
      description = v_description,
      genre = v_genre,
      bpm = p_bpm,
      musical_key = v_musical_key,
      objective = v_objective,
      delivery_at = p_delivery_at,
      milestone = v_milestone
  where id = p_project_id
  returning * into v_project;

  update public.messaging_conversations conversation
  set title = v_name, updated_at = now()
  from public.creative_project_conversations link
  where link.project_id = p_project_id
    and conversation.id = link.conversation_id;

  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id, 'project_updated', null, p_project_id,
    jsonb_build_object('name', v_name)
  );

  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'updated_at', v_project.updated_at
  );
end;
$$;

create or replace function public.invite_creative_project_member_v1(
  p_project_id uuid,
  p_invited_profile_id uuid,
  p_authority_role text default 'contributor',
  p_artistic_role text default null,
  p_can_edit boolean default true,
  p_can_invite boolean default false,
  p_can_manage_members boolean default false,
  p_can_manage_stems boolean default true,
  p_can_create_tasks boolean default true,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_authority_role, 'contributor')));
  v_artistic_role text := nullif(trim(coalesce(p_artistic_role, '')), '');
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_invitation public.creative_project_invitations%rowtype;
  v_project public.creative_projects%rowtype;
  v_actor public.creative_project_members%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null or p_invited_profile_id is null
     or p_invited_profile_id = v_user_id
     or v_role not in ('admin', 'contributor', 'viewer')
     or char_length(coalesce(v_artistic_role, '')) > 80
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_project_invitation';
  end if;
  if v_role = 'viewer' and (
    coalesce(p_can_edit, false) or coalesce(p_can_invite, false)
    or coalesce(p_can_manage_members, false) or coalesce(p_can_manage_stems, false)
    or coalesce(p_can_create_tasks, false)
  ) then
    raise exception using errcode = '22023', message = 'invalid_viewer_permissions';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-invite:' || v_user_id::text || ':' || v_key, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-invite-rate:' || v_user_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-members:' || p_project_id::text, 0
  ));

  select * into v_project
  from public.creative_projects project
  where project.id = p_project_id and project.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;
  if not public.messaging_project_has_permission_v1(p_project_id, 'invite', v_user_id) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;
  select member.* into v_actor
  from public.creative_project_members member
  where member.project_id = p_project_id
    and member.profile_id = v_user_id and member.left_at is null;
  if v_role = 'admin' and v_actor.authority_role <> 'owner' then
    raise exception using errcode = '42501', message = 'owner_permission_required';
  end if;
  if v_actor.authority_role <> 'owner' and (
    (coalesce(p_can_edit, false) and not v_actor.can_edit)
    or (coalesce(p_can_invite, false) and not v_actor.can_invite)
    or (coalesce(p_can_manage_members, false) and not v_actor.can_manage_members)
    or (coalesce(p_can_manage_stems, false) and not v_actor.can_manage_stems)
    or (coalesce(p_can_create_tasks, false) and not v_actor.can_create_tasks)
  ) then
    raise exception using errcode = '42501', message = 'delegated_permissions_exceeded';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_invited_profile_id) then
    raise exception using errcode = 'P0002', message = 'invited_profile_not_found';
  end if;
  if public.messaging_profiles_blocked_v1(v_user_id, p_invited_profile_id) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;
  if exists (
    select 1
    from public.creative_project_members member
    where member.project_id = p_project_id
      and member.left_at is null
      and public.messaging_profiles_blocked_v1(
        member.profile_id,
        p_invited_profile_id
      )
  ) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;

  update public.creative_project_invitations
  set status = 'expired', responded_at = now()
  where project_id = p_project_id
    and status = 'pending'
    and expires_at <= now();

  v_hash := encode(digest(convert_to(jsonb_build_object(
    'project_id', p_project_id,
    'invited_profile_id', p_invited_profile_id,
    'authority_role', v_role,
    'artistic_role', v_artistic_role,
    'can_edit', coalesce(p_can_edit, false),
    'can_invite', coalesce(p_can_invite, false),
    'can_manage_members', coalesce(p_can_manage_members, false),
    'can_manage_stems', coalesce(p_can_manage_stems, false),
    'can_create_tasks', coalesce(p_can_create_tasks, false)
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_invitation
  from public.creative_project_invitations invitation
  where invitation.inviter_profile_id = v_user_id
    and invitation.idempotency_key = v_key;
  if found then
    if v_invitation.request_hash <> v_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'invitation_id', v_invitation.id,
      'status', v_invitation.status
    );
  end if;

  if exists (
    select 1 from public.creative_project_members member
    where member.project_id = p_project_id
      and member.profile_id = p_invited_profile_id
      and member.left_at is null
  ) then
    raise exception using errcode = '23505', message = 'already_a_project_member';
  end if;
  if (
    (select count(*) from public.creative_project_members member
      where member.project_id = p_project_id and member.left_at is null)
    +
    (select count(*) from public.creative_project_invitations invitation
      where invitation.project_id = p_project_id and invitation.status = 'pending')
  ) >= 50 then
    raise exception using errcode = 'P0001', message = 'project_member_limit';
  end if;
  if (
    select count(*) from public.creative_project_invitations invitation
    where invitation.inviter_profile_id = v_user_id
      and invitation.created_at > now() - interval '24 hours'
  ) >= 100 then
    raise exception using errcode = 'P0001', message = 'project_invitation_rate_limit';
  end if;

  insert into public.creative_project_invitations (
    project_id, inviter_profile_id, invited_profile_id,
    proposed_authority_role, proposed_artistic_role,
    proposed_can_edit, proposed_can_invite, proposed_can_manage_members,
    proposed_can_manage_stems, proposed_can_create_tasks,
    idempotency_key, request_hash
  ) values (
    p_project_id, v_user_id, p_invited_profile_id,
    v_role, v_artistic_role,
    case when v_role = 'viewer' then false else coalesce(p_can_edit, false) end,
    case when v_role = 'viewer' then false else coalesce(p_can_invite, false) end,
    case when v_role = 'viewer' then false else coalesce(p_can_manage_members, false) end,
    case when v_role = 'viewer' then false else coalesce(p_can_manage_stems, false) end,
    case when v_role = 'viewer' then false else coalesce(p_can_create_tasks, false) end,
    v_key, v_hash
  ) returning * into v_invitation;

  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id, 'member_invited', p_invited_profile_id,
    v_invitation.id, jsonb_build_object('authority_role', v_role)
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'invitation_id', v_invitation.id,
    'status', v_invitation.status
  );
end;
$$;

drop trigger if exists creative_projects_touch_updated_at_v1
  on public.creative_projects;
create trigger creative_projects_touch_updated_at_v1
before update on public.creative_projects
for each row execute function public.messaging_projects_touch_updated_at_v1();

drop trigger if exists creative_project_members_touch_updated_at_v1
  on public.creative_project_members;
create trigger creative_project_members_touch_updated_at_v1
before update on public.creative_project_members
for each row execute function public.messaging_projects_touch_updated_at_v1();

drop trigger if exists creative_project_invitations_touch_updated_at_v1
  on public.creative_project_invitations;
create trigger creative_project_invitations_touch_updated_at_v1
before update on public.creative_project_invitations
for each row execute function public.messaging_projects_touch_updated_at_v1();

drop trigger if exists creative_project_tasks_touch_updated_at_v1
  on public.creative_project_tasks;
create trigger creative_project_tasks_touch_updated_at_v1
before update on public.creative_project_tasks
for each row execute function public.messaging_projects_touch_updated_at_v1();

alter table public.creative_projects enable row level security;
alter table public.creative_project_members enable row level security;
alter table public.creative_project_invitations enable row level security;
alter table public.creative_project_conversations enable row level security;
alter table public.creative_project_tasks enable row level security;
alter table public.creative_project_activity enable row level security;

-- There are intentionally no browser table policies. Security-definer RPCs
-- below return bounded projections after an explicit membership check.
revoke all on table public.creative_projects from anon, authenticated;
revoke all on table public.creative_project_members from anon, authenticated;
revoke all on table public.creative_project_invitations from anon, authenticated;
revoke all on table public.creative_project_conversations from anon, authenticated;
revoke all on table public.creative_project_tasks from anon, authenticated;
revoke all on table public.creative_project_activity from anon, authenticated;
revoke all on sequence public.creative_project_activity_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.creative_projects to service_role;
grant select, insert, update, delete on table public.creative_project_members to service_role;
grant select, insert, update, delete on table public.creative_project_invitations to service_role;
grant select, insert, update, delete on table public.creative_project_conversations to service_role;
grant select, insert, update, delete on table public.creative_project_tasks to service_role;
revoke update, delete, truncate on table public.creative_project_activity from service_role;
grant select, insert on table public.creative_project_activity to service_role;
grant usage, select on sequence public.creative_project_activity_id_seq to service_role;

-- Safe project list projection with a stable composite cursor.
create or replace function public.list_my_creative_projects_v1(
  p_cursor jsonb default null,
  p_limit integer default 30,
  p_statuses text[] default array['in_progress', 'completed', 'archived']::text[],
  p_search text default null
)
returns table (
  project_id uuid,
  owner_profile_id uuid,
  name text,
  description text,
  status text,
  genre text,
  bpm integer,
  musical_key text,
  objective text,
  delivery_at timestamptz,
  milestone text,
  conversation_id uuid,
  my_authority_role text,
  my_artistic_role text,
  can_edit boolean,
  can_invite boolean,
  can_manage_members boolean,
  can_manage_stems boolean,
  can_create_tasks boolean,
  member_count bigint,
  task_count bigint,
  pending_task_count bigint,
  unread_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  activity_at timestamptz,
  page_cursor jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_statuses text[] := coalesce(p_statuses, array['in_progress', 'completed', 'archived']::text[]);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_cursor_at timestamptz;
  v_cursor_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if cardinality(v_statuses) < 1
     or exists (
       select 1 from unnest(v_statuses) requested(value)
       where requested.value not in ('in_progress', 'completed', 'archived')
     ) then
    raise exception using errcode = '22023', message = 'invalid_project_status_filter';
  end if;
  if v_search is not null and char_length(v_search) > 120 then
    raise exception using errcode = '22023', message = 'invalid_project_search';
  end if;
  if p_cursor is not null then
    begin
      v_cursor_at := (p_cursor ->> 'activity_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'project_id')::uuid;
    exception when invalid_datetime_format or invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_project_cursor';
    end;
    if v_cursor_at is null or v_cursor_id is null then
      raise exception using errcode = '22023', message = 'invalid_project_cursor';
    end if;
  end if;

  return query
  with visible as (
    select
      project.*,
      member.authority_role,
      member.artistic_role,
      member.can_edit,
      member.can_invite,
      member.can_manage_members,
      member.can_manage_stems,
      member.can_create_tasks,
      link.conversation_id,
      greatest(
        project.updated_at,
        coalesce(conversation.last_message_at, project.updated_at)
      ) as sort_at,
      greatest(
        0::bigint,
        coalesce(conversation.next_sequence - 1, 0)
        - coalesce(conversation_member.last_read_sequence, 0)
      ) as unread
    from public.creative_projects project
    join public.creative_project_members member
      on member.project_id = project.id
     and member.profile_id = v_user_id
     and member.left_at is null
    join public.creative_project_conversations link
      on link.project_id = project.id
    join public.messaging_conversations conversation
      on conversation.id = link.conversation_id
     and conversation.deleted_at is null
    join public.messaging_conversation_members conversation_member
      on conversation_member.conversation_id = conversation.id
     and conversation_member.profile_id = v_user_id
     and conversation_member.membership_status = 'active'
     and conversation_member.left_at is null
    where project.deleted_at is null
      and project.status = any(v_statuses)
      and (
        v_search is null
        or project.name ilike '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
        or project.description ilike '%' || replace(replace(replace(v_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      )
  )
  select
    visible.id,
    visible.owner_profile_id,
    visible.name,
    visible.description,
    visible.status,
    visible.genre,
    visible.bpm,
    visible.musical_key,
    visible.objective,
    visible.delivery_at,
    visible.milestone,
    visible.conversation_id,
    visible.authority_role,
    visible.artistic_role,
    visible.can_edit,
    visible.can_invite,
    visible.can_manage_members,
    visible.can_manage_stems,
    visible.can_create_tasks,
    (
      select count(*) from public.creative_project_members counted
      where counted.project_id = visible.id and counted.left_at is null
    ),
    (
      select count(*) from public.creative_project_tasks task
      where task.project_id = visible.id and task.deleted_at is null
    ),
    (
      select count(*) from public.creative_project_tasks task
      where task.project_id = visible.id
        and task.deleted_at is null and task.status <> 'done'
    ),
    visible.unread,
    visible.created_at,
    visible.updated_at,
    visible.sort_at,
    jsonb_build_object('activity_at', visible.sort_at, 'project_id', visible.id)
  from visible
  where p_cursor is null or (visible.sort_at, visible.id) < (v_cursor_at, v_cursor_id)
  order by visible.sort_at desc, visible.id desc
  limit v_limit;
end;
$$;

create or replace function public.get_creative_project_workspace_v1(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null then
    raise exception using errcode = '22023', message = 'project_id_required';
  end if;
  if not public.messaging_project_is_active_member_v1(p_project_id, v_user_id) then
    raise exception using errcode = '42501', message = 'project_not_found_or_forbidden';
  end if;

  select jsonb_build_object(
    'project_id', project.id,
    'owner_profile_id', project.owner_profile_id,
    'name', project.name,
    'description', project.description,
    'status', project.status,
    'genre', project.genre,
    'bpm', project.bpm,
    'musical_key', project.musical_key,
    'objective', project.objective,
    'delivery_at', project.delivery_at,
    'milestone', project.milestone,
    'conversation_id', link.conversation_id,
    'created_at', project.created_at,
    'updated_at', project.updated_at,
    'completed_at', project.completed_at,
    'archived_at', project.archived_at,
    'membership', jsonb_build_object(
      'authority_role', me.authority_role,
      'artistic_role', me.artistic_role,
      'can_edit', me.can_edit,
      'can_invite', me.can_invite,
      'can_manage_members', me.can_manage_members,
      'can_manage_stems', me.can_manage_stems,
      'can_create_tasks', me.can_create_tasks
    ),
    'unread_count', greatest(
      0::bigint,
      conversation.next_sequence - 1 - conversation_member.last_read_sequence
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id', member.profile_id,
        'username', profile.username,
        'display_name', coalesce(
          nullif(trim(profile.display_name), ''),
          nullif(trim(profile.username), ''),
          'Membre Meewav'
        ),
        'avatar_url', profile.avatar_url,
        'avatar_style_key', profile.avatar_style_key,
        'primary_role_key', profile.primary_role_key,
        'authority_role', member.authority_role,
        'artistic_role', member.artistic_role,
        'can_edit', member.can_edit,
        'can_invite', member.can_invite,
        'can_manage_members', member.can_manage_members,
        'can_manage_stems', member.can_manage_stems,
        'can_create_tasks', member.can_create_tasks,
        'joined_at', member.joined_at
      ) order by
        case member.authority_role when 'owner' then 0 when 'admin' then 1 else 2 end,
        member.joined_at,
        member.profile_id
      )
      from public.creative_project_members member
      join public.profiles profile on profile.id = member.profile_id
      where member.project_id = project.id and member.left_at is null
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_id', task.id,
        'title', task.title,
        'description', task.description,
        'assigned_profile_id', task.assigned_profile_id,
        'assigned_display_name', public.messaging_project_profile_name_v1(task.assigned_profile_id),
        'status', task.status,
        'due_at', task.due_at,
        'created_by_profile_id', task.created_by_profile_id,
        'created_at', task.created_at,
        'updated_at', task.updated_at,
        'completed_at', task.completed_at
      ) order by
        case task.status when 'in_progress' then 0 when 'todo' then 1 else 2 end,
        task.due_at nulls last,
        task.created_at
      )
      from public.creative_project_tasks task
      where task.project_id = project.id and task.deleted_at is null
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(activity_row.item order by activity_row.activity_id desc)
      from (
        select
          activity.id as activity_id,
          jsonb_build_object(
            'activity_id', activity.id,
            'event_type', activity.event_type,
            'actor_profile_id', activity.actor_profile_id,
            'actor_display_name', public.messaging_project_profile_name_v1(activity.actor_profile_id),
            'subject_profile_id', activity.subject_profile_id,
            'subject_id', activity.subject_id,
            'payload', activity.payload,
            'created_at', activity.created_at
          ) as item
        from public.creative_project_activity activity
        where activity.project_id = project.id
        order by activity.id desc
        limit 50
      ) activity_row
    ), '[]'::jsonb)
  ) into v_result
  from public.creative_projects project
  join public.creative_project_members me
    on me.project_id = project.id
   and me.profile_id = v_user_id
   and me.left_at is null
  join public.creative_project_conversations link on link.project_id = project.id
  join public.messaging_conversations conversation on conversation.id = link.conversation_id
  join public.messaging_conversation_members conversation_member
    on conversation_member.conversation_id = conversation.id
   and conversation_member.profile_id = v_user_id
   and conversation_member.membership_status = 'active'
   and conversation_member.left_at is null
  where project.id = p_project_id and project.deleted_at is null;

  if v_result is null then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;
  return v_result;
end;
$$;

create or replace function public.list_my_creative_project_invitations_v1(
  p_scope text default 'received',
  p_statuses text[] default array['pending']::text[],
  p_cursor jsonb default null,
  p_limit integer default 30
)
returns table (
  invitation_id uuid,
  project_id uuid,
  project_name text,
  direction text,
  status text,
  other_profile_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  proposed_authority_role text,
  proposed_artistic_role text,
  proposed_can_edit boolean,
  proposed_can_invite boolean,
  proposed_can_manage_members boolean,
  proposed_can_manage_stems boolean,
  proposed_can_create_tasks boolean,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  page_cursor jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_scope text := lower(trim(coalesce(p_scope, 'received')));
  v_statuses text[] := coalesce(p_statuses, array['pending']::text[]);
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_cursor_at timestamptz;
  v_cursor_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_scope not in ('received', 'sent')
     or cardinality(v_statuses) < 1
     or exists (
       select 1 from unnest(v_statuses) requested(value)
       where requested.value not in ('pending', 'accepted', 'declined', 'cancelled', 'expired')
     ) then
    raise exception using errcode = '22023', message = 'invalid_project_invitation_filter';
  end if;
  if p_cursor is not null then
    begin
      v_cursor_at := (p_cursor ->> 'created_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'invitation_id')::uuid;
    exception when invalid_datetime_format or invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_project_invitation_cursor';
    end;
    if v_cursor_at is null or v_cursor_id is null then
      raise exception using errcode = '22023', message = 'invalid_project_invitation_cursor';
    end if;
  end if;

  update public.creative_project_invitations invitation
  set status = 'expired', responded_at = now()
  where invitation.status = 'pending'
    and invitation.expires_at <= now()
    and (
      (v_scope = 'received' and invitation.invited_profile_id = v_user_id)
      or (v_scope = 'sent' and invitation.inviter_profile_id = v_user_id)
    );

  return query
  select
    invitation.id,
    invitation.project_id,
    project.name,
    v_scope,
    invitation.status,
    other_profile.id,
    other_profile.username,
    coalesce(
      nullif(trim(other_profile.display_name), ''),
      nullif(trim(other_profile.username), ''),
      'Membre Meewav'
    ),
    other_profile.avatar_url,
    invitation.proposed_authority_role,
    invitation.proposed_artistic_role,
    invitation.proposed_can_edit,
    invitation.proposed_can_invite,
    invitation.proposed_can_manage_members,
    invitation.proposed_can_manage_stems,
    invitation.proposed_can_create_tasks,
    invitation.created_at,
    invitation.expires_at,
    invitation.responded_at,
    jsonb_build_object('created_at', invitation.created_at, 'invitation_id', invitation.id)
  from public.creative_project_invitations invitation
  join public.creative_projects project
    on project.id = invitation.project_id and project.deleted_at is null
  join public.profiles other_profile
    on other_profile.id = case
      when v_scope = 'received' then invitation.inviter_profile_id
      else invitation.invited_profile_id
    end
  where invitation.status = any(v_statuses)
    and (
      (v_scope = 'received' and invitation.invited_profile_id = v_user_id)
      or (v_scope = 'sent' and invitation.inviter_profile_id = v_user_id)
    )
    and (
      p_cursor is null
      or (invitation.created_at, invitation.id) < (v_cursor_at, v_cursor_id)
    )
  order by invitation.created_at desc, invitation.id desc
  limit v_limit;
end;
$$;

create or replace function public.respond_to_creative_project_invitation_v1(
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
  v_invitation public.creative_project_invitations%rowtype;
  v_project_id uuid;
  v_conversation_id uuid;
  v_conversation_role text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_id is null or v_decision not in ('accept', 'decline')
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_project_invitation_response';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-invitation-response:' || p_invitation_id::text, 0
  ));
  select invitation.project_id into v_project_id
  from public.creative_project_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.invited_profile_id = v_user_id;
  if v_project_id is null then
    raise exception using errcode = 'P0002', message = 'project_invitation_not_found';
  end if;
  if v_decision = 'accept' then
    perform pg_advisory_xact_lock(hashtextextended(
      'messaging:project-members:' || v_project_id::text, 0
    ));
  end if;
  select * into v_invitation
  from public.creative_project_invitations invitation
  where invitation.id = p_invitation_id
  for update;
  if not found or v_invitation.invited_profile_id <> v_user_id then
    raise exception using errcode = 'P0002', message = 'project_invitation_not_found';
  end if;
  if v_invitation.response_idempotency_key is not null then
    if v_invitation.response_idempotency_key <> v_key
       or v_invitation.response_decision <> v_decision then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    select link.conversation_id into v_conversation_id
    from public.creative_project_conversations link
    where link.project_id = v_invitation.project_id;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'invitation_id', v_invitation.id,
      'project_id', v_invitation.project_id,
      'status', v_invitation.status,
      'conversation_id', case when v_invitation.status = 'accepted' then v_conversation_id else null end
    );
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'invalid_invitation_transition';
  end if;
  if v_invitation.expires_at <= now() then
    update public.creative_project_invitations
    set status = 'expired',
        response_idempotency_key = v_key,
        response_decision = v_decision,
        responded_at = now()
    where id = v_invitation.id
    returning * into v_invitation;
    return jsonb_build_object(
      'ok', false,
      'idempotent', false,
      'invitation_id', v_invitation.id,
      'project_id', v_invitation.project_id,
      'status', v_invitation.status,
      'conversation_id', null
    );
  end if;
  if not exists (
    select 1 from public.creative_projects project
    where project.id = v_invitation.project_id and project.deleted_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;
  if v_invitation.inviter_profile_id is not null
     and public.messaging_profiles_blocked_v1(v_user_id, v_invitation.inviter_profile_id) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;

  if v_decision = 'accept' then
    if exists (
      select 1
      from public.creative_project_members member
      where member.project_id = v_invitation.project_id
        and member.left_at is null
        and public.messaging_profiles_blocked_v1(
          v_user_id,
          member.profile_id
        )
    ) then
      raise exception using errcode = '42501', message = 'blocked_relationship';
    end if;
    if (
      select count(*) from public.creative_project_members member
      where member.project_id = v_invitation.project_id and member.left_at is null
    ) >= 50 then
      raise exception using errcode = 'P0001', message = 'project_member_limit';
    end if;

    insert into public.creative_project_members (
      project_id, profile_id, authority_role, artistic_role,
      can_edit, can_invite, can_manage_members, can_manage_stems,
      can_create_tasks, invited_by_profile_id, invited_at, joined_at, left_at
    ) values (
      v_invitation.project_id, v_user_id,
      v_invitation.proposed_authority_role,
      v_invitation.proposed_artistic_role,
      v_invitation.proposed_can_edit,
      v_invitation.proposed_can_invite,
      v_invitation.proposed_can_manage_members,
      v_invitation.proposed_can_manage_stems,
      v_invitation.proposed_can_create_tasks,
      v_invitation.inviter_profile_id,
      v_invitation.created_at,
      now(), null
    )
    on conflict (project_id, profile_id) do update
    set authority_role = excluded.authority_role,
        artistic_role = excluded.artistic_role,
        can_edit = excluded.can_edit,
        can_invite = excluded.can_invite,
        can_manage_members = excluded.can_manage_members,
        can_manage_stems = excluded.can_manage_stems,
        can_create_tasks = excluded.can_create_tasks,
        invited_by_profile_id = excluded.invited_by_profile_id,
        invited_at = excluded.invited_at,
        joined_at = now(),
        left_at = null;

    select link.conversation_id into v_conversation_id
    from public.creative_project_conversations link
    where link.project_id = v_invitation.project_id;
    v_conversation_role := case
      when v_invitation.proposed_authority_role = 'admin' then 'admin'
      else 'member'
    end;
    insert into public.messaging_conversation_members (
      conversation_id, profile_id, role, membership_status,
      invited_by_profile_id, invited_at, joined_at, left_at, responded_at
    ) values (
      v_conversation_id, v_user_id, v_conversation_role, 'active',
      v_invitation.inviter_profile_id, v_invitation.created_at,
      now(), null, now()
    )
    on conflict (conversation_id, profile_id) do update
    set role = excluded.role,
        membership_status = 'active',
        invited_by_profile_id = excluded.invited_by_profile_id,
        invited_at = excluded.invited_at,
        joined_at = now(),
        left_at = null,
        responded_at = now(),
        updated_at = now();
  end if;

  update public.creative_project_invitations
  set status = case when v_decision = 'accept' then 'accepted' else 'declined' end,
      response_idempotency_key = v_key,
      response_decision = v_decision,
      responded_at = now()
  where id = v_invitation.id
  returning * into v_invitation;

  perform public.messaging_project_append_activity_v1(
    v_invitation.project_id,
    v_user_id,
    case when v_decision = 'accept' then 'invitation_accepted' else 'invitation_declined' end,
    v_user_id,
    v_invitation.id,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'invitation_id', v_invitation.id,
    'project_id', v_invitation.project_id,
    'status', v_invitation.status,
    'conversation_id', case when v_invitation.status = 'accepted' then v_conversation_id else null end
  );
end;
$$;

create or replace function public.update_creative_project_member_v1(
  p_project_id uuid,
  p_member_profile_id uuid,
  p_authority_role text,
  p_artistic_role text default null,
  p_can_edit boolean default true,
  p_can_invite boolean default false,
  p_can_manage_members boolean default false,
  p_can_manage_stems boolean default true,
  p_can_create_tasks boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_authority_role, '')));
  v_artistic_role text := nullif(trim(coalesce(p_artistic_role, '')), '');
  v_actor public.creative_project_members%rowtype;
  v_target_role text;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null or p_member_profile_id is null
     or v_role not in ('admin', 'contributor', 'viewer')
     or char_length(coalesce(v_artistic_role, '')) > 80 then
    raise exception using errcode = '22023', message = 'invalid_project_member_payload';
  end if;
  if v_role = 'viewer' and (
    coalesce(p_can_edit, false) or coalesce(p_can_invite, false)
    or coalesce(p_can_manage_members, false) or coalesce(p_can_manage_stems, false)
    or coalesce(p_can_create_tasks, false)
  ) then
    raise exception using errcode = '22023', message = 'invalid_viewer_permissions';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-members:' || p_project_id::text, 0
  ));
  select member.* into v_actor
  from public.creative_project_members member
  where member.project_id = p_project_id
    and member.profile_id = v_user_id and member.left_at is null
  for update;
  if v_actor.profile_id is null or not public.messaging_project_has_permission_v1(
    p_project_id, 'manage_members', v_user_id
  ) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;
  if p_member_profile_id = v_user_id then
    raise exception using errcode = '42501', message = 'self_member_update_forbidden';
  end if;
  select member.authority_role into v_target_role
  from public.creative_project_members member
  where member.project_id = p_project_id
    and member.profile_id = p_member_profile_id and member.left_at is null
  for update;
  if v_target_role is null then
    raise exception using errcode = 'P0002', message = 'project_member_not_found';
  end if;
  if v_target_role = 'owner'
     or (v_role = 'admin' and v_actor.authority_role <> 'owner')
     or (v_target_role = 'admin' and v_actor.authority_role <> 'owner') then
    raise exception using errcode = '42501', message = 'owner_permission_required';
  end if;
  if v_actor.authority_role <> 'owner' and (
    (coalesce(p_can_edit, false) and not v_actor.can_edit)
    or (coalesce(p_can_invite, false) and not v_actor.can_invite)
    or (coalesce(p_can_manage_members, false) and not v_actor.can_manage_members)
    or (coalesce(p_can_manage_stems, false) and not v_actor.can_manage_stems)
    or (coalesce(p_can_create_tasks, false) and not v_actor.can_create_tasks)
  ) then
    raise exception using errcode = '42501', message = 'delegated_permissions_exceeded';
  end if;

  if v_target_role = v_role
     and (v_role = 'viewer' or (
       (select member.can_edit from public.creative_project_members member
        where member.project_id = p_project_id and member.profile_id = p_member_profile_id)
          = coalesce(p_can_edit, false)
       and (select member.can_invite from public.creative_project_members member
        where member.project_id = p_project_id and member.profile_id = p_member_profile_id)
          = coalesce(p_can_invite, false)
       and (select member.can_manage_members from public.creative_project_members member
        where member.project_id = p_project_id and member.profile_id = p_member_profile_id)
          = coalesce(p_can_manage_members, false)
       and (select member.can_manage_stems from public.creative_project_members member
        where member.project_id = p_project_id and member.profile_id = p_member_profile_id)
          = coalesce(p_can_manage_stems, false)
       and (select member.can_create_tasks from public.creative_project_members member
        where member.project_id = p_project_id and member.profile_id = p_member_profile_id)
          = coalesce(p_can_create_tasks, false)
     ))
     and (select member.artistic_role from public.creative_project_members member
          where member.project_id = p_project_id and member.profile_id = p_member_profile_id)
          is not distinct from v_artistic_role then
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'project_id', p_project_id,
      'profile_id', p_member_profile_id,
      'authority_role', v_role
    );
  end if;

  update public.creative_project_members
  set authority_role = v_role,
      artistic_role = v_artistic_role,
      can_edit = case when v_role = 'viewer' then false else coalesce(p_can_edit, false) end,
      can_invite = case when v_role = 'viewer' then false else coalesce(p_can_invite, false) end,
      can_manage_members = case when v_role = 'viewer' then false else coalesce(p_can_manage_members, false) end,
      can_manage_stems = case when v_role = 'viewer' then false else coalesce(p_can_manage_stems, false) end,
      can_create_tasks = case when v_role = 'viewer' then false else coalesce(p_can_create_tasks, false) end
  where project_id = p_project_id and profile_id = p_member_profile_id;

  select link.conversation_id into v_conversation_id
  from public.creative_project_conversations link
  where link.project_id = p_project_id;
  update public.messaging_conversation_members
  set role = case when v_role = 'admin' then 'admin' else 'member' end,
      updated_at = now()
  where conversation_id = v_conversation_id
    and profile_id = p_member_profile_id
    and left_at is null;

  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id, 'member_updated', p_member_profile_id,
    p_member_profile_id, jsonb_build_object('authority_role', v_role)
  );
  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'profile_id', p_member_profile_id,
    'authority_role', v_role
  );
end;
$$;

create or replace function public.transfer_creative_project_ownership_v1(
  p_project_id uuid,
  p_successor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_project public.creative_projects%rowtype;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null or p_successor_profile_id is null
     or p_successor_profile_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_ownership_transfer';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-members:' || p_project_id::text, 0
  ));
  select * into v_project
  from public.creative_projects project
  where project.id = p_project_id and project.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;
  if v_project.owner_profile_id <> v_user_id then
    if v_project.owner_profile_id = p_successor_profile_id
       and public.messaging_project_is_active_member_v1(p_project_id, v_user_id) then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'project_id', p_project_id,
        'previous_owner_profile_id', v_user_id,
        'owner_profile_id', p_successor_profile_id
      );
    end if;
    raise exception using errcode = '42501', message = 'owner_permission_required';
  end if;
  if not exists (
    select 1 from public.creative_project_members member
    where member.project_id = p_project_id
      and member.profile_id = p_successor_profile_id
      and member.left_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'successor_not_a_project_member';
  end if;

  update public.creative_project_members
  set authority_role = 'contributor',
      can_manage_members = false
  where project_id = p_project_id and profile_id = v_user_id;
  update public.creative_project_members
  set authority_role = 'owner',
      can_edit = true,
      can_invite = true,
      can_manage_members = true,
      can_manage_stems = true,
      can_create_tasks = true
  where project_id = p_project_id and profile_id = p_successor_profile_id;
  update public.creative_projects
  set owner_profile_id = p_successor_profile_id
  where id = p_project_id;

  select link.conversation_id into v_conversation_id
  from public.creative_project_conversations link
  where link.project_id = p_project_id;
  update public.messaging_conversation_members
  set role = case when profile_id = p_successor_profile_id then 'owner' else 'member' end,
      updated_at = now()
  where conversation_id = v_conversation_id
    and profile_id in (v_user_id, p_successor_profile_id)
    and left_at is null;

  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id, 'ownership_transferred',
    p_successor_profile_id, p_successor_profile_id, '{}'::jsonb
  );
  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'previous_owner_profile_id', v_user_id,
    'owner_profile_id', p_successor_profile_id
  );
end;
$$;

create or replace function public.remove_or_leave_creative_project_v1(
  p_project_id uuid,
  p_member_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_id uuid := coalesce(p_member_profile_id, auth.uid());
  v_target_role text;
  v_conversation_id uuid;
  v_self boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null or v_target_id is null then
    raise exception using errcode = '22023', message = 'invalid_project_member_target';
  end if;
  v_self := v_target_id = v_user_id;
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-members:' || p_project_id::text, 0
  ));
  if not public.messaging_project_is_active_member_v1(p_project_id, v_user_id) then
    if v_self and exists (
      select 1 from public.creative_project_members previous_member
      where previous_member.project_id = p_project_id
        and previous_member.profile_id = v_user_id
        and previous_member.left_at is not null
    ) then
      return jsonb_build_object(
        'ok', true, 'idempotent', true,
        'project_id', p_project_id, 'profile_id', v_user_id
      );
    end if;
    raise exception using errcode = '42501', message = 'project_not_found_or_forbidden';
  end if;
  if not v_self and not public.messaging_project_has_permission_v1(
    p_project_id, 'manage_members', v_user_id
  ) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;

  select member.authority_role into v_target_role
  from public.creative_project_members member
  where member.project_id = p_project_id
    and member.profile_id = v_target_id
    and member.left_at is null
  for update;
  if v_target_role is null then
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'project_id', p_project_id, 'profile_id', v_target_id
    );
  end if;
  if v_target_role = 'owner' then
    raise exception using errcode = '55000', message = 'owner_transfer_required';
  end if;
  if not v_self and v_target_role = 'admin' and not exists (
    select 1 from public.creative_project_members actor
    where actor.project_id = p_project_id
      and actor.profile_id = v_user_id
      and actor.authority_role = 'owner'
      and actor.left_at is null
  ) then
    raise exception using errcode = '42501', message = 'owner_permission_required';
  end if;

  update public.creative_project_members
  set left_at = now()
  where project_id = p_project_id and profile_id = v_target_id;
  select link.conversation_id into v_conversation_id
  from public.creative_project_conversations link
  where link.project_id = p_project_id;
  update public.messaging_conversation_members
  set left_at = now(), updated_at = now()
  where conversation_id = v_conversation_id
    and profile_id = v_target_id and left_at is null;
  update public.creative_project_invitations
  set status = 'cancelled', responded_at = now()
  where project_id = p_project_id
    and invited_profile_id = v_target_id and status = 'pending';

  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id,
    case when v_self then 'member_left' else 'member_removed' end,
    v_target_id, v_target_id, '{}'::jsonb
  );
  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'project_id', p_project_id, 'profile_id', v_target_id
  );
end;
$$;

create or replace function public.upsert_creative_project_task_v1(
  p_project_id uuid,
  p_task_id uuid,
  p_title text,
  p_description text default '',
  p_assigned_profile_id uuid default null,
  p_status text default 'todo',
  p_due_at timestamptz default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_task_id uuid := p_task_id;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_status text := lower(trim(coalesce(p_status, 'todo')));
  v_existing public.creative_project_tasks%rowtype;
  v_task public.creative_project_tasks%rowtype;
  v_created boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null or p_task_id is null
     or char_length(v_title) not between 1 and 200
     or char_length(v_description) > 4000
     or v_status not in ('todo', 'in_progress', 'done') then
    raise exception using errcode = '22023', message = 'invalid_project_task_payload';
  end if;
  if not public.messaging_project_has_permission_v1(
    p_project_id, 'create_tasks', v_user_id
  ) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;
  if p_assigned_profile_id is not null and not public.messaging_project_is_active_member_v1(
    p_project_id, p_assigned_profile_id
  ) then
    raise exception using errcode = '22023', message = 'invalid_task_assignee';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-tasks:' || p_project_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-task:' || v_task_id::text, 0
  ));

  select * into v_existing
  from public.creative_project_tasks task
  where task.id = v_task_id
  for update;
  if found then
    if v_existing.project_id <> p_project_id or v_existing.deleted_at is not null then
      raise exception using errcode = '23505', message = 'task_id_conflict';
    end if;
    if v_existing.title = v_title
       and v_existing.description = v_description
       and v_existing.assigned_profile_id is not distinct from p_assigned_profile_id
       and v_existing.status = v_status
       and v_existing.due_at is not distinct from p_due_at then
      return jsonb_build_object(
        'ok', true, 'idempotent', true, 'created', false,
        'task_id', v_existing.id,
        'project_id', p_project_id,
        'updated_at', v_existing.updated_at
      );
    end if;
    if p_expected_updated_at is not null
       and v_existing.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'task_version_conflict';
    end if;
  else
    if (
      select count(*) from public.creative_project_tasks task
      where task.project_id = p_project_id and task.deleted_at is null
    ) >= 500 then
      raise exception using errcode = 'P0001', message = 'project_task_limit';
    end if;
    v_created := true;
  end if;

  insert into public.creative_project_tasks (
    id, project_id, title, description, assigned_profile_id,
    status, due_at, created_by_profile_id, completed_at
  ) values (
    v_task_id, p_project_id, v_title, v_description, p_assigned_profile_id,
    v_status, p_due_at, v_user_id,
    case when v_status = 'done' then now() else null end
  )
  on conflict (id) do update
  set title = excluded.title,
      description = excluded.description,
      assigned_profile_id = excluded.assigned_profile_id,
      status = excluded.status,
      due_at = excluded.due_at,
      completed_at = case
        when excluded.status = 'done' then coalesce(public.creative_project_tasks.completed_at, now())
        else null
      end
  returning * into v_task;

  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id,
    case when v_created then 'task_created' else 'task_updated' end,
    p_assigned_profile_id, v_task.id,
    jsonb_build_object('status', v_task.status, 'title', v_task.title)
  );
  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'task_id', v_task.id,
    'project_id', p_project_id,
    'updated_at', v_task.updated_at
  );
end;
$$;

create or replace function public.delete_creative_project_task_v1(
  p_project_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.creative_project_tasks%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null or p_task_id is null then
    raise exception using errcode = '22023', message = 'invalid_project_task_target';
  end if;
  if not public.messaging_project_has_permission_v1(
    p_project_id, 'create_tasks', v_user_id
  ) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;
  select * into v_task
  from public.creative_project_tasks task
  where task.id = p_task_id and task.project_id = p_project_id
  for update;
  if not found or v_task.deleted_at is not null then
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'project_id', p_project_id, 'task_id', p_task_id
    );
  end if;
  update public.creative_project_tasks
  set deleted_at = now()
  where id = p_task_id;
  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id, 'task_deleted', null, p_task_id,
    jsonb_build_object('title', v_task.title)
  );
  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'project_id', p_project_id, 'task_id', p_task_id
  );
end;
$$;

create or replace function public.set_creative_project_status_v1(
  p_project_id uuid,
  p_status text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status, '')));
  v_project public.creative_projects%rowtype;
  v_event text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null or v_status not in ('in_progress', 'completed', 'archived') then
    raise exception using errcode = '22023', message = 'invalid_project_status';
  end if;
  select * into v_project
  from public.creative_projects project
  where project.id = p_project_id and project.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project_not_found';
  end if;
  if not public.messaging_project_has_permission_v1(p_project_id, 'admin', v_user_id) then
    raise exception using errcode = '42501', message = 'permission_denied';
  end if;
  if v_project.status = v_status then
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'project_id', p_project_id, 'status', v_status,
      'updated_at', v_project.updated_at
    );
  end if;
  if p_expected_updated_at is not null
     and v_project.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'project_version_conflict';
  end if;
  v_event := case v_status
    when 'completed' then 'project_completed'
    when 'archived' then 'project_archived'
    else 'project_reopened'
  end;
  update public.creative_projects
  set status = v_status,
      completed_at = case when v_status = 'completed' then now() else null end,
      archived_at = case when v_status = 'archived' then now() else null end
  where id = p_project_id
  returning * into v_project;
  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id, v_event, null, p_project_id,
    jsonb_build_object('status', v_status)
  );
  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'project_id', p_project_id, 'status', v_status,
    'updated_at', v_project.updated_at
  );
end;
$$;

create or replace function public.delete_creative_project_v1(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_project public.creative_projects%rowtype;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_project_id is null then
    raise exception using errcode = '22023', message = 'project_id_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:project-members:' || p_project_id::text, 0
  ));
  select * into v_project
  from public.creative_projects project
  where project.id = p_project_id
  for update;
  if not found or v_project.deleted_at is not null then
    return jsonb_build_object(
      'ok', true, 'idempotent', true, 'project_id', p_project_id
    );
  end if;
  if v_project.owner_profile_id <> v_user_id then
    raise exception using errcode = '42501', message = 'owner_permission_required';
  end if;
  select link.conversation_id into v_conversation_id
  from public.creative_project_conversations link
  where link.project_id = p_project_id;

  perform public.messaging_project_append_activity_v1(
    p_project_id, v_user_id, 'project_deleted', null, p_project_id, '{}'::jsonb
  );
  update public.creative_projects
  set status = 'archived', archived_at = coalesce(archived_at, now()), deleted_at = now()
  where id = p_project_id;
  update public.creative_project_members
  set left_at = coalesce(left_at, now())
  where project_id = p_project_id;
  update public.creative_project_invitations
  set status = 'cancelled', responded_at = coalesce(responded_at, now())
  where project_id = p_project_id and status = 'pending';
  update public.messaging_conversation_members
  set left_at = coalesce(left_at, now()), updated_at = now()
  where conversation_id = v_conversation_id;
  update public.messaging_conversations
  set deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where id = v_conversation_id;
  return jsonb_build_object(
    'ok', true, 'idempotent', false, 'project_id', p_project_id
  );
end;
$$;

create or replace function public.cancel_creative_project_invitation_v1(
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.creative_project_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_invitation_id is null then
    raise exception using errcode = '22023', message = 'invitation_id_required';
  end if;
  select * into v_invitation
  from public.creative_project_invitations invitation
  where invitation.id = p_invitation_id
  for update;
  if not found or v_invitation.inviter_profile_id <> v_user_id then
    raise exception using errcode = 'P0002', message = 'project_invitation_not_found';
  end if;
  if v_invitation.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'invitation_id', v_invitation.id, 'status', v_invitation.status
    );
  end if;
  if v_invitation.status <> 'pending' then
    raise exception using errcode = '55000', message = 'invalid_invitation_transition';
  end if;
  update public.creative_project_invitations
  set status = 'cancelled', responded_at = now()
  where id = v_invitation.id
  returning * into v_invitation;
  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'invitation_id', v_invitation.id, 'status', v_invitation.status
  );
end;
$$;

-- Preserve project ownership and chat history during hard profile deletion.
create or replace function public.messaging_projects_prepare_profile_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_successor_profile_id uuid;
  v_conversation_id uuid;
begin
  for v_project_id in
    select project.id
    from public.creative_projects project
    where project.owner_profile_id = old.id
      and project.deleted_at is null
  loop
    perform 1 from public.creative_projects project
    where project.id = v_project_id for update;

    select member.profile_id into v_successor_profile_id
    from public.creative_project_members member
    where member.project_id = v_project_id
      and member.profile_id <> old.id
      and member.left_at is null
    order by
      case member.authority_role when 'admin' then 0 when 'contributor' then 1 else 2 end,
      member.joined_at,
      member.profile_id
    limit 1
    for update;

    select link.conversation_id into v_conversation_id
    from public.creative_project_conversations link
    where link.project_id = v_project_id;

    perform 1
    from public.messaging_conversations conversation
    where conversation.id = v_conversation_id
    for update;

    if v_successor_profile_id is null then
      perform public.messaging_project_append_activity_v1(
        v_project_id, null, 'project_deleted', null, v_project_id,
        jsonb_build_object('reason', 'owner_account_deleted')
      );
      update public.creative_projects
      set owner_profile_id = null,
          status = 'archived',
          archived_at = coalesce(archived_at, now()),
          deleted_at = now()
      where id = v_project_id;
      update public.messaging_conversations
      set deleted_at = coalesce(deleted_at, now()), updated_at = now()
      where id = v_conversation_id;
    else
      update public.creative_project_members
      set authority_role = 'contributor', can_manage_members = false
      where project_id = v_project_id and profile_id = old.id;
      update public.creative_project_members
      set authority_role = 'owner',
          can_edit = true,
          can_invite = true,
          can_manage_members = true,
          can_manage_stems = true,
          can_create_tasks = true
      where project_id = v_project_id and profile_id = v_successor_profile_id;
      update public.creative_projects
      set owner_profile_id = v_successor_profile_id
      where id = v_project_id;

      -- Another profile-deletion trigger may already have promoted a
      -- conversation member using the generic messaging succession order.
      -- Rebuild the active Project-chat roles from the Project authority root
      -- before installing the Project-selected successor. This guarantees one
      -- and only one active conversation owner, without erasing legitimate
      -- Project-admin authority on the remaining members.
      insert into public.messaging_conversation_members (
        conversation_id, profile_id, role, membership_status
      ) values (
        v_conversation_id, v_successor_profile_id, 'member', 'active'
      )
      on conflict (conversation_id, profile_id) do update
      set membership_status = 'active',
          left_at = null,
          updated_at = now();

      update public.messaging_conversation_members
      set role = case
            when exists (
              select 1
              from public.creative_project_members project_member
              where project_member.project_id = v_project_id
                and project_member.profile_id = messaging_conversation_members.profile_id
                and project_member.left_at is null
                and project_member.authority_role = 'admin'
            ) then 'admin'
            else 'member'
          end,
          updated_at = now()
      where conversation_id = v_conversation_id
        and membership_status = 'active'
        and left_at is null;

      update public.messaging_conversation_members
      set role = 'owner', updated_at = now()
      where conversation_id = v_conversation_id
        and profile_id = v_successor_profile_id
        and membership_status = 'active'
        and left_at is null;

      perform public.messaging_project_append_activity_v1(
        v_project_id, null, 'ownership_transferred',
        v_successor_profile_id, v_successor_profile_id,
        jsonb_build_object('reason', 'owner_account_deleted')
      );
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists messaging_projects_prepare_profile_delete_v1
  on public.profiles;
create trigger messaging_projects_prepare_profile_delete_v1
before delete on public.profiles
for each row execute function public.messaging_projects_prepare_profile_delete_v1();

-- Internal helpers are never callable by a browser role.
revoke all on function public.messaging_projects_touch_updated_at_v1()
  from public, anon, authenticated;
revoke all on function public.messaging_project_is_active_member_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.messaging_project_has_permission_v1(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.messaging_project_append_activity_v1(uuid, uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.messaging_project_profile_name_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.messaging_projects_prepare_profile_delete_v1()
  from public, anon, authenticated;

-- Narrow authenticated RPC surface.
revoke all on function public.list_my_creative_projects_v1(jsonb, integer, text[], text)
  from public, anon, authenticated;
grant execute on function public.list_my_creative_projects_v1(jsonb, integer, text[], text)
  to authenticated;
revoke all on function public.get_creative_project_workspace_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_creative_project_workspace_v1(uuid)
  to authenticated;
revoke all on function public.list_my_creative_project_invitations_v1(text, text[], jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.list_my_creative_project_invitations_v1(text, text[], jsonb, integer)
  to authenticated;
revoke all on function public.create_creative_project_v1(text, text, text, integer, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.create_creative_project_v1(text, text, text, integer, text, text, timestamptz, text, text)
  to authenticated;
revoke all on function public.update_creative_project_v1(uuid, text, text, text, integer, text, text, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.update_creative_project_v1(uuid, text, text, text, integer, text, text, timestamptz, text, timestamptz)
  to authenticated;
revoke all on function public.invite_creative_project_member_v1(uuid, uuid, text, text, boolean, boolean, boolean, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.invite_creative_project_member_v1(uuid, uuid, text, text, boolean, boolean, boolean, boolean, boolean, text)
  to authenticated;
revoke all on function public.respond_to_creative_project_invitation_v1(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.respond_to_creative_project_invitation_v1(uuid, text, text)
  to authenticated;
revoke all on function public.cancel_creative_project_invitation_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_creative_project_invitation_v1(uuid)
  to authenticated;
revoke all on function public.update_creative_project_member_v1(uuid, uuid, text, text, boolean, boolean, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.update_creative_project_member_v1(uuid, uuid, text, text, boolean, boolean, boolean, boolean, boolean)
  to authenticated;
revoke all on function public.transfer_creative_project_ownership_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_creative_project_ownership_v1(uuid, uuid)
  to authenticated;
revoke all on function public.remove_or_leave_creative_project_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.remove_or_leave_creative_project_v1(uuid, uuid)
  to authenticated;
revoke all on function public.upsert_creative_project_task_v1(uuid, uuid, text, text, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.upsert_creative_project_task_v1(uuid, uuid, text, text, uuid, text, timestamptz, timestamptz)
  to authenticated;
revoke all on function public.delete_creative_project_task_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_creative_project_task_v1(uuid, uuid)
  to authenticated;
revoke all on function public.set_creative_project_status_v1(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.set_creative_project_status_v1(uuid, text, timestamptz)
  to authenticated;
revoke all on function public.delete_creative_project_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_creative_project_v1(uuid)
  to authenticated;

comment on table public.creative_projects is
  'Private creative project authority root. Access is exposed only through project RPC projections.';
comment on table public.creative_project_activity is
  'Append-only server-authored project authority and task activity ledger.';

commit;
