begin;

-- ---------------------------------------------------------------------------
-- Meewav Messaging v1 — Collaboration workflow
--
-- public.collaboration_requests remains the canonical request ledger shared by
-- the Globe and Messaging. This additive migration exposes narrow projections
-- and state-transition RPCs; browser clients never update the ledger directly.
-- No Rooms object is referenced or modified.
-- ---------------------------------------------------------------------------

alter table public.collaboration_requests
  add column if not exists conversation_id uuid
    references public.messaging_conversations(id) on delete set null,
  add column if not exists status_changed_by_profile_id uuid
    references public.profiles(id) on delete set null;

create index if not exists collaboration_requests_conversation_idx
  on public.collaboration_requests(conversation_id)
  where conversation_id is not null;

create table if not exists public.collaboration_request_participant_state (
  request_id uuid not null
    references public.collaboration_requests(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_id, profile_id)
);

create index if not exists collaboration_participant_state_profile_idx
  on public.collaboration_request_participant_state(
    profile_id, archived_at, viewed_at, request_id
  );

create table if not exists public.collaboration_request_transitions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.collaboration_requests(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('accept', 'decline', 'cancel')),
  from_status text not null check (from_status = 'pending'),
  to_status text not null check (to_status in ('accepted', 'declined', 'cancelled')),
  idempotency_key text not null,
  conversation_id uuid
    references public.messaging_conversations(id) on delete set null,
  system_message_id uuid
    references public.messaging_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint collaboration_transition_action_status_check check (
    (action = 'accept' and to_status = 'accepted')
    or (action = 'decline' and to_status = 'declined')
    or (action = 'cancel' and to_status = 'cancelled')
  ),
  constraint collaboration_transition_idempotency_key_check check (
    char_length(idempotency_key) between 8 and 128
  ),
  unique (request_id),
  unique (actor_profile_id, idempotency_key)
);

create index if not exists collaboration_transitions_actor_time_idx
  on public.collaboration_request_transitions(actor_profile_id, created_at desc);

create or replace function public.initialize_collaboration_participant_state_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.collaboration_request_participant_state (
    request_id, profile_id, viewed_at
  ) values
    (new.id, new.sender_profile_id, new.created_at),
    (new.id, new.recipient_profile_id, null)
  on conflict (request_id, profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists collaboration_request_initialize_participant_state
  on public.collaboration_requests;
create trigger collaboration_request_initialize_participant_state
after insert on public.collaboration_requests
for each row execute function public.initialize_collaboration_participant_state_v1();

-- Requests created before this migration receive the same two participant rows.
insert into public.collaboration_request_participant_state (
  request_id, profile_id, viewed_at
)
select request.id, request.sender_profile_id, request.created_at
from public.collaboration_requests request
on conflict (request_id, profile_id) do nothing;

insert into public.collaboration_request_participant_state (
  request_id, profile_id, viewed_at
)
select request.id, request.recipient_profile_id, null
from public.collaboration_requests request
on conflict (request_id, profile_id) do nothing;

create or replace function public.lock_messaging_relationship_v1(
  p_profile_a uuid,
  p_profile_b uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_low_id uuid;
  v_high_id uuid;
begin
  if p_profile_a is null or p_profile_b is null or p_profile_a = p_profile_b then
    raise exception using errcode = '22023', message = 'invalid_relationship_pair';
  end if;
  if p_profile_a < p_profile_b then
    v_low_id := p_profile_a;
    v_high_id := p_profile_b;
  else
    v_low_id := p_profile_b;
    v_high_id := p_profile_a;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:relationship:' || v_low_id::text || ':' || v_high_id::text,
    0
  ));
end;
$$;

create or replace function public.lock_user_block_relationship_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.lock_messaging_relationship_v1(
      old.blocker_profile_id,
      old.blocked_profile_id
    );
    return old;
  end if;
  perform public.lock_messaging_relationship_v1(
    new.blocker_profile_id,
    new.blocked_profile_id
  );
  return new;
end;
$$;

drop trigger if exists user_blocks_relationship_lock on public.user_blocks;
create trigger user_blocks_relationship_lock
before insert or delete on public.user_blocks
for each row execute function public.lock_user_block_relationship_v1();

create or replace function public.guard_collaboration_request_block_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.lock_messaging_relationship_v1(
    new.sender_profile_id,
    new.recipient_profile_id
  );
  if public.messaging_profiles_blocked_v1(
    new.sender_profile_id,
    new.recipient_profile_id
  ) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;
  return new;
end;
$$;

drop trigger if exists collaboration_request_block_guard
  on public.collaboration_requests;
create trigger collaboration_request_block_guard
before insert on public.collaboration_requests
for each row execute function public.guard_collaboration_request_block_v1();

create or replace function public.emit_collaboration_transition_side_effects_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.collaboration_requests%rowtype;
  v_notification_user_id uuid;
  v_notification_type text;
  v_notification_content text;
  v_analytics_subject_id uuid;
begin
  select request.* into strict v_request
  from public.collaboration_requests request
  where request.id = new.request_id;

  -- The original request notification must not remain as a false pending item.
  update public.notifications notification
  set is_read = true,
      read_at = coalesce(notification.read_at, now()),
      payload = coalesce(notification.payload, '{}'::jsonb)
        || jsonb_build_object(
          'status', new.to_status,
          'conversation_id', new.conversation_id
        )
  where notification.payload ->> 'request_id' = new.request_id::text
    and notification.type = 'collaboration_request';

  if new.action = 'accept' then
    v_notification_user_id := v_request.sender_profile_id;
    v_notification_type := 'collaboration_request_accepted';
    v_notification_content := 'a accepté ta demande de collaboration';
    v_analytics_subject_id := v_request.sender_profile_id;
  elsif new.action = 'decline' then
    v_notification_user_id := v_request.sender_profile_id;
    v_notification_type := 'collaboration_request_declined';
    v_notification_content := 'a refusé ta demande de collaboration';
    v_analytics_subject_id := v_request.sender_profile_id;
  else
    v_notification_user_id := v_request.recipient_profile_id;
    v_notification_type := 'collaboration_request_cancelled';
    v_notification_content := 'a annulé sa demande de collaboration';
    v_analytics_subject_id := v_request.recipient_profile_id;
  end if;

  insert into public.notifications (
    user_id,
    type,
    from_user_id,
    content,
    payload,
    source_pillar,
    source_event_id
  ) values (
    v_notification_user_id,
    v_notification_type,
    new.actor_profile_id,
    v_notification_content,
    jsonb_build_object(
      'request_id', new.request_id,
      'status', new.to_status,
      'conversation_id', new.conversation_id,
      'original_source', v_request.source
    ),
    'messaging',
    new.request_id::text || ':' || new.action
  )
  on conflict (user_id, source_pillar, source_event_id)
    where source_event_id is not null do nothing;

  insert into public.analytics_events (
    actor_profile_id,
    subject_profile_id,
    source_pillar,
    event_name,
    source_event_id,
    idempotency_key,
    trust_level,
    properties,
    occurred_at
  ) values (
    new.actor_profile_id,
    v_analytics_subject_id,
    'messaging',
    'collaboration_request_' || new.to_status,
    new.request_id::text,
    'collaboration-transition:' || new.id::text,
    'server',
    jsonb_build_object(
      'request_id', new.request_id,
      'status', new.to_status,
      'conversation_id', new.conversation_id,
      'original_source', v_request.source
    ),
    new.created_at
  )
  on conflict (actor_profile_id, source_pillar, idempotency_key)
    where idempotency_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists collaboration_transition_side_effects
  on public.collaboration_request_transitions;
create trigger collaboration_transition_side_effects
after insert on public.collaboration_request_transitions
for each row execute function public.emit_collaboration_transition_side_effects_v1();

-- ---------------------------------------------------------------------------
-- Safe collaboration inbox projection.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_collaboration_requests_v1(
  p_scope text default 'received',
  p_statuses text[] default null,
  p_cursor jsonb default null,
  p_limit integer default 30
)
returns table (
  request_id uuid,
  direction text,
  status text,
  message text,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  responded_at timestamptz,
  conversation_id uuid,
  viewed_at timestamptz,
  is_unread boolean,
  can_accept boolean,
  can_decline boolean,
  can_cancel boolean,
  relationship_blocked boolean,
  other_profile_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_avatar_style_key text,
  other_primary_role_key text,
  other_city text,
  other_country_code text,
  other_is_verified boolean,
  other_grade_level smallint,
  other_grade_code text,
  other_grade_label text,
  other_grade_visual_key text,
  page_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_statuses text[];
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
  v_cursor_sort_at timestamptz;
  v_cursor_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_scope not in ('received', 'sent', 'accepted') then
    raise exception using errcode = '22023', message = 'invalid_collaboration_scope';
  end if;

  v_statuses := coalesce(
    p_statuses,
    case
      when v_scope = 'accepted' then array['accepted']::text[]
      else array['pending', 'accepted', 'declined', 'cancelled', 'expired']::text[]
    end
  );
  if cardinality(v_statuses) not between 1 and 5
     or array_position(v_statuses, null::text) is not null
     or exists (
       select 1 from unnest(v_statuses) requested(status)
       where requested.status not in (
         'pending', 'accepted', 'declined', 'cancelled', 'expired'
       )
     )
     or (v_scope = 'accepted' and v_statuses <> array['accepted']::text[]) then
    raise exception using errcode = '22023', message = 'invalid_collaboration_status_filter';
  end if;

  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object'
       or not (p_cursor ? 'sort_at')
       or not (p_cursor ? 'request_id') then
      raise exception using errcode = '22023', message = 'invalid_collaboration_cursor';
    end if;
    begin
      v_cursor_sort_at := (p_cursor ->> 'sort_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'request_id')::uuid;
    exception
      when invalid_text_representation
        or invalid_datetime_format
        or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'invalid_collaboration_cursor';
    end;
    if v_cursor_sort_at is null or v_cursor_id is null then
      raise exception using errcode = '22023', message = 'invalid_collaboration_cursor';
    end if;
  end if;

  return query
  with scoped as (
    select
      request.*,
      case
        when request.sender_profile_id = v_user_id then 'sent'
        else 'received'
      end as request_direction,
      case
        when request.sender_profile_id = v_user_id
          then request.recipient_profile_id
        else request.sender_profile_id
      end as counterpart_id,
      coalesce(request.responded_at, request.created_at) as sort_at
    from public.collaboration_requests request
    where (
      (v_scope = 'received' and request.recipient_profile_id = v_user_id)
      or (v_scope = 'sent' and request.sender_profile_id = v_user_id)
      or (
        v_scope = 'accepted'
        and request.status = 'accepted'
        and v_user_id in (request.sender_profile_id, request.recipient_profile_id)
      )
    )
      and request.status = any(v_statuses)
  )
  select
    scoped.id,
    scoped.request_direction,
    scoped.status,
    scoped.message,
    scoped.source,
    scoped.created_at,
    scoped.updated_at,
    scoped.responded_at,
    scoped.conversation_id,
    participant_state.viewed_at,
    (
      scoped.recipient_profile_id = v_user_id
      and participant_state.viewed_at is null
    ),
    (
      scoped.recipient_profile_id = v_user_id
      and scoped.status = 'pending'
      and not public.messaging_profiles_blocked_v1(
        scoped.sender_profile_id,
        scoped.recipient_profile_id
      )
    ),
    scoped.recipient_profile_id = v_user_id and scoped.status = 'pending',
    scoped.sender_profile_id = v_user_id and scoped.status = 'pending',
    public.messaging_profiles_blocked_v1(
      scoped.sender_profile_id,
      scoped.recipient_profile_id
    ),
    counterpart.id,
    counterpart.username,
    coalesce(
      nullif(counterpart.display_name, ''),
      nullif(counterpart.username, ''),
      'Membre Meewav'
    ),
    counterpart.avatar_url,
    counterpart.avatar_style_key,
    counterpart.primary_role_key,
    counterpart.city,
    counterpart.country_code::text,
    coalesce(counterpart.is_verified, false),
    case
      when coalesce(
        counterpart.public_profile_preferences ->> 'show_grade', 'true'
      ) <> 'false' then grade.level
      else null
    end,
    case
      when coalesce(
        counterpart.public_profile_preferences ->> 'show_grade', 'true'
      ) <> 'false' then grade.code
      else null
    end,
    case
      when coalesce(
        counterpart.public_profile_preferences ->> 'show_grade', 'true'
      ) <> 'false' then grade.label
      else null
    end,
    case
      when coalesce(
        counterpart.public_profile_preferences ->> 'show_grade', 'true'
      ) <> 'false' then grade.visual_key
      else null
    end,
    jsonb_build_object(
      'sort_at', scoped.sort_at,
      'request_id', scoped.id
    )
  from scoped
  join public.profiles counterpart on counterpart.id = scoped.counterpart_id
  left join public.collaboration_request_participant_state participant_state
    on participant_state.request_id = scoped.id
   and participant_state.profile_id = v_user_id
  left join public.profile_grade_state grade_state
    on grade_state.profile_id = counterpart.id
  left join public.grade_levels grade
    on grade.level = grade_state.level and grade.is_active
  where participant_state.archived_at is null
    and (
      p_cursor is null
      or (scoped.sort_at, scoped.id) < (v_cursor_sort_at, v_cursor_id)
    )
  order by scoped.sort_at desc, scoped.id desc
  limit v_limit;
end;
$$;

create or replace function public.mark_collaboration_request_viewed_v1(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_viewed_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'collaboration_request_required';
  end if;

  update public.collaboration_request_participant_state participant_state
  set viewed_at = coalesce(participant_state.viewed_at, now()),
      updated_at = now()
  where participant_state.request_id = p_request_id
    and participant_state.profile_id = v_user_id
  returning participant_state.viewed_at into v_viewed_at;

  if v_viewed_at is null then
    raise exception using errcode = 'P0002', message = 'collaboration_request_not_found';
  end if;
  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'viewed_at', v_viewed_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Recipient response. The request row is the concurrency boundary. Acceptance
-- also creates/reuses a direct conversation and appends one linked system event
-- in the same transaction.
-- ---------------------------------------------------------------------------

create or replace function public.respond_to_collaboration_request_v1(
  p_request_id uuid,
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
  v_target_status text;
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_request public.collaboration_requests%rowtype;
  v_transition public.collaboration_request_transitions%rowtype;
  v_conversation_result jsonb;
  v_conversation_id uuid;
  v_system_message_id uuid;
  v_sequence bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'collaboration_request_required';
  end if;
  if v_decision not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'invalid_collaboration_decision';
  end if;
  if char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  v_target_status := case
    when v_decision = 'accept' then 'accepted'
    else 'declined'
  end;

  perform pg_advisory_xact_lock(hashtextextended(
    'collaboration-transition:' || v_user_id::text || ':' || v_idempotency_key,
    0
  ));

  select transition.* into v_transition
  from public.collaboration_request_transitions transition
  where transition.actor_profile_id = v_user_id
    and transition.idempotency_key = v_idempotency_key;
  if found then
    if v_transition.request_id <> p_request_id
       or v_transition.action <> v_decision then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request_id', v_transition.request_id,
      'status', v_transition.to_status,
      'conversation_id', v_transition.conversation_id,
      'system_message_id', v_transition.system_message_id
    );
  end if;

  select request.* into v_request
  from public.collaboration_requests request
  where request.id = p_request_id
  for update;
  if not found or v_request.recipient_profile_id <> v_user_id then
    raise exception using errcode = 'P0002', message = 'collaboration_request_not_found';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'collaboration_request_already_resolved';
  end if;

  if v_decision = 'accept' then
    perform public.lock_messaging_relationship_v1(
      v_request.sender_profile_id,
      v_request.recipient_profile_id
    );
    if public.messaging_profiles_blocked_v1(
      v_request.sender_profile_id,
      v_request.recipient_profile_id
    ) then
      raise exception using errcode = '42501', message = 'blocked_relationship';
    end if;

    v_conversation_result := public.get_or_create_direct_conversation_v1(
      v_request.sender_profile_id,
      'collaboration:' || v_request.id::text
    );
    v_conversation_id := (v_conversation_result ->> 'conversation_id')::uuid;

    select conversation.next_sequence into v_sequence
    from public.messaging_conversations conversation
    where conversation.id = v_conversation_id
      and conversation.deleted_at is null
    for update;
    if v_sequence is null then
      raise exception using errcode = 'P0002', message = 'conversation_not_found';
    end if;

    insert into public.messaging_messages (
      conversation_id,
      sender_profile_id,
      client_message_id,
      sequence,
      kind,
      body,
      payload
    ) values (
      v_conversation_id,
      v_user_id,
      gen_random_uuid(),
      v_sequence,
      'system',
      'Collaboration acceptée',
      jsonb_build_object(
        'event', 'collaboration_request_accepted',
        'request_id', v_request.id,
        'source', v_request.source
      )
    ) returning id into v_system_message_id;

    update public.messaging_conversations
    set next_sequence = v_sequence + 1,
        last_message_id = v_system_message_id,
        last_message_at = now(),
        updated_at = now()
    where id = v_conversation_id;

    update public.messaging_conversation_members
    set archived_at = null,
        updated_at = now()
    where conversation_id = v_conversation_id
      and membership_status = 'active'
      and left_at is null;

    update public.messaging_conversation_members
    set last_read_sequence = greatest(last_read_sequence, v_sequence),
        last_read_at = now(),
        updated_at = now()
    where conversation_id = v_conversation_id
      and profile_id = v_user_id;
  end if;

  update public.collaboration_requests
  set status = v_target_status,
      responded_at = now(),
      conversation_id = v_conversation_id,
      status_changed_by_profile_id = v_user_id
  where id = p_request_id
  returning * into v_request;

  insert into public.collaboration_request_transitions (
    request_id,
    actor_profile_id,
    action,
    from_status,
    to_status,
    idempotency_key,
    conversation_id,
    system_message_id
  ) values (
    p_request_id,
    v_user_id,
    v_decision,
    'pending',
    v_target_status,
    v_idempotency_key,
    v_conversation_id,
    v_system_message_id
  ) returning * into v_transition;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request_id', v_request.id,
    'status', v_request.status,
    'conversation_id', v_conversation_id,
    'system_message_id', v_system_message_id
  );
end;
$$;

create or replace function public.cancel_collaboration_request_v1(
  p_request_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_request public.collaboration_requests%rowtype;
  v_transition public.collaboration_request_transitions%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'collaboration_request_required';
  end if;
  if char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'collaboration-transition:' || v_user_id::text || ':' || v_idempotency_key,
    0
  ));

  select transition.* into v_transition
  from public.collaboration_request_transitions transition
  where transition.actor_profile_id = v_user_id
    and transition.idempotency_key = v_idempotency_key;
  if found then
    if v_transition.request_id <> p_request_id
       or v_transition.action <> 'cancel' then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request_id', v_transition.request_id,
      'status', v_transition.to_status
    );
  end if;

  select request.* into v_request
  from public.collaboration_requests request
  where request.id = p_request_id
  for update;
  if not found or v_request.sender_profile_id <> v_user_id then
    raise exception using errcode = 'P0002', message = 'collaboration_request_not_found';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'collaboration_request_already_resolved';
  end if;

  update public.collaboration_requests
  set status = 'cancelled',
      responded_at = now(),
      status_changed_by_profile_id = v_user_id
  where id = p_request_id
  returning * into v_request;

  insert into public.collaboration_request_transitions (
    request_id,
    actor_profile_id,
    action,
    from_status,
    to_status,
    idempotency_key
  ) values (
    p_request_id,
    v_user_id,
    'cancel',
    'pending',
    'cancelled',
    v_idempotency_key
  ) returning * into v_transition;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request_id', v_request.id,
    'status', v_request.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and explicit privileges.
-- ---------------------------------------------------------------------------

alter table public.collaboration_request_participant_state enable row level security;
alter table public.collaboration_request_transitions enable row level security;

drop policy if exists collaboration_participant_state_own_read
  on public.collaboration_request_participant_state;
create policy collaboration_participant_state_own_read
on public.collaboration_request_participant_state
for select to authenticated
using (profile_id = auth.uid());

drop policy if exists collaboration_transitions_participant_read
  on public.collaboration_request_transitions;
create policy collaboration_transitions_participant_read
on public.collaboration_request_transitions
for select to authenticated
using (
  exists (
    select 1
    from public.collaboration_requests request
    where request.id = request_id
      and auth.uid() in (request.sender_profile_id, request.recipient_profile_id)
  )
);

-- Read access is intentionally RPC-only so recipient clients cannot retrieve
-- sender idempotency keys or future internal columns with SELECT *.
revoke all on public.collaboration_requests from anon, authenticated;
revoke all on public.collaboration_request_participant_state
  from anon, authenticated;
revoke all on public.collaboration_request_transitions
  from anon, authenticated;
grant all on public.collaboration_requests,
  public.collaboration_request_participant_state,
  public.collaboration_request_transitions to service_role;

revoke all on function public.list_my_collaboration_requests_v1(
  text, text[], jsonb, integer
) from public, anon, authenticated;
grant execute on function public.list_my_collaboration_requests_v1(
  text, text[], jsonb, integer
) to authenticated, service_role;

revoke all on function public.mark_collaboration_request_viewed_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_collaboration_request_viewed_v1(uuid)
  to authenticated, service_role;

revoke all on function public.respond_to_collaboration_request_v1(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.respond_to_collaboration_request_v1(
  uuid, text, text
) to authenticated, service_role;

revoke all on function public.cancel_collaboration_request_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_collaboration_request_v1(uuid, text)
  to authenticated, service_role;

revoke all on function public.initialize_collaboration_participant_state_v1()
  from public, anon, authenticated;
revoke all on function public.lock_messaging_relationship_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.lock_user_block_relationship_v1()
  from public, anon, authenticated;
revoke all on function public.guard_collaboration_request_block_v1()
  from public, anon, authenticated;
revoke all on function public.emit_collaboration_transition_side_effects_v1()
  from public, anon, authenticated;

comment on function public.list_my_collaboration_requests_v1(
  text, text[], jsonb, integer
) is 'Safe participant-only collaboration inbox projection without PII or idempotency keys.';
comment on function public.respond_to_collaboration_request_v1(
  uuid, text, text
) is 'Recipient-only idempotent accept/decline transition. Acceptance atomically links a direct conversation and system message.';
comment on function public.cancel_collaboration_request_v1(uuid, text) is
  'Sender-only idempotent cancellation of a pending collaboration request.';

commit;
