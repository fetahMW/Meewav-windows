begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Meewav Messaging v1 — Phase A
--
-- Durable text conversations with strict membership, blocking, idempotency,
-- personal read/preferences and reactions. Attachments, collaborations,
-- projects, artist groups and Realtime are delivered by later additive phases.
-- This migration never changes rooms_*_v2.
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason_code text,
  created_at timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  check (blocker_profile_id <> blocked_profile_id),
  check (reason_code is null or char_length(reason_code) <= 64)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks(blocked_profile_id, created_at desc);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null
    check (subject_type in (
      'message', 'conversation', 'collaboration', 'project', 'group', 'profile'
    )),
  subject_id uuid not null,
  category text not null
    check (category in (
      'spam', 'harassment', 'hate', 'sexual', 'violence', 'fraud',
      'copyright', 'privacy', 'other'
    )),
  comment text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_metadata jsonb not null default '{}'::jsonb,
  unique (reporter_profile_id, idempotency_key),
  check (char_length(idempotency_key) between 8 and 128),
  check (comment is null or char_length(comment) <= 1000)
);

alter table public.content_reports
  alter column reporter_profile_id drop not null;
alter table public.content_reports
  drop constraint if exists content_reports_reporter_profile_id_fkey;
alter table public.content_reports
  add constraint content_reports_reporter_profile_id_fkey
  foreign key (reporter_profile_id) references public.profiles(id)
  on delete set null;

create index if not exists content_reports_reporter_time_idx
  on public.content_reports(reporter_profile_id, created_at desc);
create index if not exists content_reports_moderation_queue_idx
  on public.content_reports(status, created_at)
  where status in ('open', 'reviewing');

create table if not exists public.messaging_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group', 'project')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  creation_idempotency_key text,
  title text,
  avatar_media_id uuid,
  last_message_id uuid,
  last_message_at timestamptz,
  next_sequence bigint not null default 1 check (next_sequence > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (creation_idempotency_key is null or char_length(creation_idempotency_key) between 8 and 128),
  check (title is null or char_length(title) between 1 and 120),
  check (octet_length(metadata::text) <= 8192)
);

drop index if exists public.messaging_conversation_creation_idempotency_idx;
create unique index messaging_conversation_creation_idempotency_idx
  on public.messaging_conversations(
    created_by_profile_id, kind, creation_idempotency_key
  )
  where creation_idempotency_key is not null;
create index if not exists messaging_conversations_last_message_idx
  on public.messaging_conversations(last_message_at desc nulls last);

create table if not exists public.messaging_direct_pairs (
  conversation_id uuid primary key
    references public.messaging_conversations(id) on delete cascade,
  profile_low_id uuid not null references public.profiles(id) on delete cascade,
  profile_high_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_low_id, profile_high_id),
  check (profile_low_id < profile_high_id)
);

create table if not exists public.messaging_conversation_members (
  conversation_id uuid not null
    references public.messaging_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_sequence bigint not null default 0 check (last_read_sequence >= 0),
  last_read_at timestamptz,
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz,
  hidden_before_sequence bigint check (hidden_before_sequence is null or hidden_before_sequence >= 0),
  notifications_enabled boolean not null default true,
  membership_status text not null default 'active'
    check (membership_status in ('invited', 'active', 'declined')),
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index if not exists messaging_members_profile_inbox_idx
  on public.messaging_conversation_members(profile_id, archived_at, pinned_at desc)
  where left_at is null;

create table if not exists public.messaging_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.messaging_conversations(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  client_message_id uuid not null,
  sequence bigint not null check (sequence > 0),
  kind text not null
    check (kind in (
      'text', 'audio', 'image', 'video', 'file', 'track_pack',
      'brief', 'system'
    )),
  body text,
  payload jsonb not null default '{}'::jsonb,
  reply_to_message_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'hidden', 'quarantined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, conversation_id),
  unique (sender_profile_id, client_message_id),
  unique (conversation_id, sequence),
  check (body is null or char_length(body) <= 4000),
  check (octet_length(payload::text) <= 8192)
);

create index if not exists messaging_messages_conversation_sequence_idx
  on public.messaging_messages(conversation_id, sequence desc);
create index if not exists messaging_messages_sender_rate_idx
  on public.messaging_messages(sender_profile_id, created_at desc);

create table if not exists public.messaging_message_reactions (
  message_id uuid not null references public.messaging_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji),
  check (emoji in ('❤️', '🔥', '👏', '🎧', '⭐', '👍', '✅', '✨', '🎹'))
);

create table if not exists public.messaging_idempotency_keys (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  result_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, operation, idempotency_key),
  check (char_length(operation) between 3 and 80),
  check (char_length(idempotency_key) between 8 and 128),
  check (request_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists messaging_idempotency_created_idx
  on public.messaging_idempotency_keys(created_at);

-- Keep replaying this draft migration safe if an older local draft created the
-- table with the shorter reaction allow-list.
alter table public.messaging_message_reactions
  drop constraint if exists messaging_message_reactions_emoji_check;
alter table public.messaging_message_reactions
  add constraint messaging_message_reactions_emoji_check
  check (emoji in ('❤️', '🔥', '👏', '🎧', '⭐', '👍', '✅', '✨', '🎹'));

alter table public.messaging_conversations
  alter column created_by_profile_id drop not null;
alter table public.messaging_messages
  alter column sender_profile_id drop not null;

alter table public.messaging_conversations
  drop constraint if exists messaging_conversations_created_by_profile_id_fkey;
alter table public.messaging_conversations
  add constraint messaging_conversations_created_by_profile_id_fkey
  foreign key (created_by_profile_id) references public.profiles(id)
  on delete set null;

alter table public.messaging_messages
  drop constraint if exists messaging_messages_sender_profile_id_fkey;
alter table public.messaging_messages
  add constraint messaging_messages_sender_profile_id_fkey
  foreign key (sender_profile_id) references public.profiles(id)
  on delete set null;

alter table public.messaging_messages
  drop constraint if exists messaging_messages_reply_to_message_id_fkey;

do $$
begin
  alter table public.messaging_conversations
    drop constraint if exists messaging_conversations_last_message_fkey;
  alter table public.messaging_conversations
    add constraint messaging_conversations_last_message_fkey
    foreign key (last_message_id, id)
    references public.messaging_messages(id, conversation_id)
    on delete set null (last_message_id) deferrable initially deferred;

  alter table public.messaging_messages
    drop constraint if exists messaging_messages_reply_same_conversation_fkey;
  alter table public.messaging_messages
    add constraint messaging_messages_reply_same_conversation_fkey
    foreign key (reply_to_message_id, conversation_id)
    references public.messaging_messages(id, conversation_id)
    on delete set null (reply_to_message_id) deferrable initially deferred;
end;
$$;

create or replace function public.messaging_prepare_profile_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation_id uuid;
  v_successor_profile_id uuid;
begin
  -- A hard account deletion must never strand a group without an owner.
  for v_conversation_id in
    select member.conversation_id
    from public.messaging_conversation_members member
    join public.messaging_conversations conversation
      on conversation.id = member.conversation_id
    where member.profile_id = old.id
      and member.role = 'owner'
      and member.membership_status = 'active'
      and member.left_at is null
      and conversation.kind = 'group'
      and conversation.deleted_at is null
  loop
    perform 1
    from public.messaging_conversations conversation
    where conversation.id = v_conversation_id
    for update;

    select successor.profile_id into v_successor_profile_id
    from public.messaging_conversation_members successor
    where successor.conversation_id = v_conversation_id
      and successor.profile_id <> old.id
      and successor.membership_status = 'active'
      and successor.left_at is null
    order by
      case successor.role when 'admin' then 0 else 1 end,
      successor.joined_at,
      successor.profile_id
    limit 1
    for update;

    if v_successor_profile_id is null then
      update public.messaging_conversations
      set deleted_at = coalesce(deleted_at, now()), updated_at = now()
      where id = v_conversation_id;
    else
      update public.messaging_conversation_members
      set role = 'owner', updated_at = now()
      where conversation_id = v_conversation_id
        and profile_id = v_successor_profile_id;
    end if;
  end loop;

  -- The direct-pair row will disappear through its profile FK, but the
  -- remaining participant keeps the conversation and the message history.
  update public.messaging_conversations conversation
  set title = coalesce(nullif(conversation.title, ''), 'Compte supprimé'),
      metadata = conversation.metadata || jsonb_build_object(
        'has_deleted_participant', true,
        'participant_deleted_at', now()
      ),
      updated_at = now()
  from public.messaging_direct_pairs pair
  where pair.conversation_id = conversation.id
    and old.id in (pair.profile_low_id, pair.profile_high_id);

  return old;
end;
$$;

drop trigger if exists messaging_direct_pair_cleanup
  on public.messaging_direct_pairs;
drop function if exists public.messaging_delete_orphaned_direct_conversation_v1();

drop trigger if exists messaging_profile_prepare_delete on public.profiles;
create trigger messaging_profile_prepare_delete
before delete on public.profiles
for each row execute function public.messaging_prepare_profile_delete_v1();

-- ---------------------------------------------------------------------------
-- Security helpers. They expose only booleans and are safe for RLS evaluation.
-- ---------------------------------------------------------------------------

create or replace function public.messaging_is_member_v1(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.messaging_conversation_members member
    join public.messaging_conversations conversation
      on conversation.id = member.conversation_id
    where member.conversation_id = p_conversation_id
      and member.profile_id = auth.uid()
      and member.membership_status = 'active'
      and member.left_at is null
      and conversation.deleted_at is null
  );
$$;

create or replace function public.messaging_profiles_blocked_v1(
  p_profile_a uuid,
  p_profile_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_profile_a is not null
    and p_profile_b is not null
    and exists (
      select 1 from public.user_blocks block
      where (block.blocker_profile_id = p_profile_a and block.blocked_profile_id = p_profile_b)
         or (block.blocker_profile_id = p_profile_b and block.blocked_profile_id = p_profile_a)
    );
$$;

create or replace function public.messaging_direct_other_profile_v1(
  p_conversation_id uuid,
  p_profile_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when pair.profile_low_id = p_profile_id then pair.profile_high_id
    when pair.profile_high_id = p_profile_id then pair.profile_low_id
    else null
  end
  from public.messaging_direct_pairs pair
  where pair.conversation_id = p_conversation_id;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Tables are read through membership and written through narrow RPCs.
-- ---------------------------------------------------------------------------

alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;
alter table public.messaging_conversations enable row level security;
alter table public.messaging_direct_pairs enable row level security;
alter table public.messaging_conversation_members enable row level security;
alter table public.messaging_messages enable row level security;
alter table public.messaging_message_reactions enable row level security;
alter table public.messaging_idempotency_keys enable row level security;

drop policy if exists user_blocks_owner_read on public.user_blocks;
create policy user_blocks_owner_read on public.user_blocks
for select to authenticated using (blocker_profile_id = auth.uid());

drop policy if exists content_reports_reporter_read on public.content_reports;
create policy content_reports_reporter_read on public.content_reports
for select to authenticated using (reporter_profile_id = auth.uid());

drop policy if exists messaging_conversations_member_read
  on public.messaging_conversations;
create policy messaging_conversations_member_read
on public.messaging_conversations
for select to authenticated
using (public.messaging_is_member_v1(id));

drop policy if exists messaging_direct_pairs_member_read
  on public.messaging_direct_pairs;
create policy messaging_direct_pairs_member_read
on public.messaging_direct_pairs
for select to authenticated
using (public.messaging_is_member_v1(conversation_id));

drop policy if exists messaging_members_conversation_read
  on public.messaging_conversation_members;
create policy messaging_members_conversation_read
on public.messaging_conversation_members
for select to authenticated
using (public.messaging_is_member_v1(conversation_id));

drop policy if exists messaging_messages_member_read
  on public.messaging_messages;
create policy messaging_messages_member_read
on public.messaging_messages
for select to authenticated
using (public.messaging_is_member_v1(conversation_id));

drop policy if exists messaging_reactions_member_read
  on public.messaging_message_reactions;
create policy messaging_reactions_member_read
on public.messaging_message_reactions
for select to authenticated
using (
  exists (
    select 1 from public.messaging_messages message
    where message.id = message_id
      and public.messaging_is_member_v1(message.conversation_id)
  )
);

-- Browser access goes through narrow SECURITY DEFINER RPCs. Keeping no table
-- read policy is intentional defense-in-depth against a future accidental
-- GRANT on private preferences, moderation state or message bodies.
drop policy if exists messaging_conversations_member_read
  on public.messaging_conversations;
drop policy if exists messaging_direct_pairs_member_read
  on public.messaging_direct_pairs;
drop policy if exists messaging_members_conversation_read
  on public.messaging_conversation_members;
drop policy if exists messaging_messages_member_read
  on public.messaging_messages;
drop policy if exists messaging_reactions_member_read
  on public.messaging_message_reactions;

revoke all on public.user_blocks, public.content_reports,
  public.messaging_conversations, public.messaging_direct_pairs,
  public.messaging_conversation_members, public.messaging_messages,
  public.messaging_message_reactions, public.messaging_idempotency_keys
from public, anon, authenticated;

grant select on public.user_blocks to authenticated;

grant all on public.user_blocks, public.content_reports,
  public.messaging_conversations, public.messaging_direct_pairs,
  public.messaging_conversation_members, public.messaging_messages,
  public.messaging_message_reactions, public.messaging_idempotency_keys
to service_role;

-- ---------------------------------------------------------------------------
-- User safety mutations.
-- ---------------------------------------------------------------------------

create or replace function public.set_user_block_v1(
  p_blocked_profile_id uuid,
  p_is_blocked boolean,
  p_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_blocked_profile_id is null or p_blocked_profile_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_block_target';
  end if;
  if p_is_blocked is null then
    raise exception using errcode = '22023', message = 'invalid_block_state';
  end if;
  if not exists (select 1 from public.profiles where id = p_blocked_profile_id) then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
  if char_length(coalesce(p_reason_code, '')) > 64 then
    raise exception using errcode = '22001', message = 'block_reason_too_long';
  end if;

  if p_is_blocked then
    insert into public.user_blocks(blocker_profile_id, blocked_profile_id, reason_code)
    values (v_user_id, p_blocked_profile_id, nullif(trim(p_reason_code), ''))
    on conflict (blocker_profile_id, blocked_profile_id) do update
    set reason_code = excluded.reason_code;
  else
    delete from public.user_blocks
    where blocker_profile_id = v_user_id
      and blocked_profile_id = p_blocked_profile_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'blocked_profile_id', p_blocked_profile_id,
    'is_blocked', p_is_blocked
  );
end;
$$;

create or replace function public.report_content_v1(
  p_subject_type text,
  p_subject_id uuid,
  p_category text,
  p_comment text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_subject_type text := lower(trim(coalesce(p_subject_type, '')));
  v_category text := lower(trim(coalesce(p_category, '')));
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_report public.content_reports%rowtype;
  v_inserted boolean := false;
  v_subject_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if v_subject_type not in ('message', 'conversation', 'collaboration', 'project', 'group', 'profile')
     or v_category not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'fraud', 'copyright', 'privacy', 'other') then
    raise exception using errcode = '22023', message = 'invalid_report_category';
  end if;
  if p_subject_id is null
     or char_length(v_idempotency_key) not between 8 and 128
     or char_length(coalesce(v_comment, '')) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_report_payload';
  end if;

  case v_subject_type
    when 'message' then
      select exists (
        select 1
        from public.messaging_messages message
        where message.id = p_subject_id
          and public.messaging_is_member_v1(message.conversation_id)
      ) into v_subject_allowed;
    when 'conversation' then
      v_subject_allowed := public.messaging_is_member_v1(p_subject_id);
    when 'group' then
      select exists (
        select 1 from public.messaging_conversations conversation
        where conversation.id = p_subject_id
          and conversation.kind = 'group'
          and public.messaging_is_member_v1(conversation.id)
      ) into v_subject_allowed;
    when 'collaboration' then
      select exists (
        select 1 from public.collaboration_requests request
        where request.id = p_subject_id
          and v_user_id in (request.sender_profile_id, request.recipient_profile_id)
      ) into v_subject_allowed;
    when 'profile' then
      select exists (
        select 1 from public.profiles profile
        where profile.id = p_subject_id and profile.id <> v_user_id
      ) into v_subject_allowed;
    when 'project' then
      raise exception using errcode = '0A000', message = 'report_subject_not_enabled';
  end case;

  if not coalesce(v_subject_allowed, false) then
    raise exception using errcode = '42501', message = 'report_subject_not_found_or_forbidden';
  end if;

  -- A common reporter lock makes the hourly window atomic even when several
  -- distinct report keys arrive concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended('messaging:reporter-rate:' || v_user_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'messaging:report:' || v_user_id::text || ':' || v_idempotency_key,
      0
    )
  );

  select report.* into v_report
  from public.content_reports report
  where report.reporter_profile_id = v_user_id
    and report.idempotency_key = v_idempotency_key;

  if v_report.id is not null then
    if v_report.subject_type <> v_subject_type
       or v_report.subject_id <> p_subject_id
       or v_report.category <> v_category
       or v_report.comment is distinct from v_comment then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
  else
    if (
      select count(*) from public.content_reports report
      where report.reporter_profile_id = v_user_id
        and report.created_at > now() - interval '1 hour'
    ) >= 20 then
      raise exception using errcode = 'P0001', message = 'report_rate_limit';
    end if;

    insert into public.content_reports (
      reporter_profile_id, subject_type, subject_id, category, comment,
      idempotency_key
    ) values (
      v_user_id, v_subject_type, p_subject_id, v_category,
      v_comment, v_idempotency_key
    ) returning * into v_report;
    v_inserted := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'report_id', v_report.id,
    'status', v_report.status,
    'idempotent', not v_inserted
  );
end;
$$;

create or replace function public.list_my_content_reports_v1(
  p_before timestamptz default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  subject_type text,
  subject_id uuid,
  category text,
  comment text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  return query
  select
    report.id,
    report.subject_type,
    report.subject_id,
    report.category,
    report.comment,
    report.status,
    report.created_at,
    report.resolved_at
  from public.content_reports report
  where report.reporter_profile_id = v_user_id
    and (p_before is null or report.created_at < p_before)
  order by report.created_at desc, report.id desc
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversation creation and reads.
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_direct_conversation_v1(
  p_other_profile_id uuid,
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
  v_low_id uuid;
  v_high_id uuid;
  v_conversation_id uuid;
  v_key_conversation_id uuid;
  v_key_low_id uuid;
  v_key_high_id uuid;
  v_key_deleted_at timestamptz;
  v_request_hash text := encode(digest(p_other_profile_id::text, 'sha256'), 'hex');
  v_idempotency public.messaging_idempotency_keys%rowtype;
  v_existing boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_other_profile_id is null or p_other_profile_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_direct_recipient';
  end if;
  if char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;

  if v_user_id < p_other_profile_id then
    v_low_id := v_user_id;
    v_high_id := p_other_profile_id;
  else
    v_low_id := p_other_profile_id;
    v_high_id := v_user_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:conversation-key:' || v_user_id::text || ':' || v_idempotency_key,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:direct-pair:' || v_low_id::text || ':' || v_high_id::text,
    0
  ));

  select ledger.* into v_idempotency
  from public.messaging_idempotency_keys ledger
  where ledger.profile_id = v_user_id
    and ledger.operation = 'direct_conversation.create'
    and ledger.idempotency_key = v_idempotency_key;

  if v_idempotency.profile_id is not null then
    if v_idempotency.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    select conversation.deleted_at into v_key_deleted_at
    from public.messaging_conversations conversation
    where conversation.id = v_idempotency.result_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'idempotency_result_not_found';
    end if;
    if v_key_deleted_at is not null then
      raise exception using errcode = '55000', message = 'conversation_deleted';
    end if;
    return jsonb_build_object(
      'ok', true,
      'conversation_id', v_idempotency.result_id,
      'kind', 'direct',
      'idempotent', true
    );
  end if;

  select
    conversation.id,
    pair.profile_low_id,
    pair.profile_high_id,
    conversation.deleted_at
  into v_key_conversation_id, v_key_low_id, v_key_high_id, v_key_deleted_at
  from public.messaging_conversations conversation
  left join public.messaging_direct_pairs pair
    on pair.conversation_id = conversation.id
  where conversation.created_by_profile_id = v_user_id
    and conversation.kind = 'direct'
    and conversation.creation_idempotency_key = v_idempotency_key;

  if v_key_conversation_id is not null then
    if v_key_low_id is distinct from v_low_id
       or v_key_high_id is distinct from v_high_id then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_key_deleted_at is not null then
      raise exception using errcode = '55000', message = 'conversation_deleted';
    end if;
    insert into public.messaging_idempotency_keys (
      profile_id, operation, idempotency_key, request_hash, result_id
    ) values (
      v_user_id, 'direct_conversation.create', v_idempotency_key,
      v_request_hash, v_key_conversation_id
    );
    return jsonb_build_object(
      'ok', true,
      'conversation_id', v_key_conversation_id,
      'kind', 'direct',
      'idempotent', true
    );
  end if;

  select pair.conversation_id into v_conversation_id
  from public.messaging_direct_pairs pair
  join public.messaging_conversations conversation
    on conversation.id = pair.conversation_id
  where pair.profile_low_id = v_low_id
    and pair.profile_high_id = v_high_id
    and conversation.deleted_at is null;

  if v_conversation_id is not null then
    v_existing := true;
  else
    if not exists (
      select 1 from public.profiles profile
      where profile.id = p_other_profile_id
        and coalesce(profile.show_on_public_profile, false)
        and not coalesce(profile.is_ghost_mode, true)
    ) then
      raise exception using errcode = 'P0002', message = 'messageable_profile_not_found';
    end if;
    if public.messaging_profiles_blocked_v1(v_user_id, p_other_profile_id) then
      raise exception using errcode = '42501', message = 'blocked_relationship';
    end if;

    insert into public.messaging_conversations (
      kind, created_by_profile_id, creation_idempotency_key
    ) values (
      'direct', v_user_id, v_idempotency_key
    ) returning id into v_conversation_id;

    insert into public.messaging_direct_pairs (
      conversation_id, profile_low_id, profile_high_id
    ) values (v_conversation_id, v_low_id, v_high_id);

    insert into public.messaging_conversation_members (
      conversation_id, profile_id, role
    ) values
      (v_conversation_id, v_user_id, 'member'),
      (v_conversation_id, p_other_profile_id, 'member');
  end if;

  insert into public.messaging_idempotency_keys (
    profile_id, operation, idempotency_key, request_hash, result_id
  ) values (
    v_user_id, 'direct_conversation.create', v_idempotency_key,
    v_request_hash, v_conversation_id
  );

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_conversation_id,
    'kind', 'direct',
    'idempotent', v_existing
  );
end;
$$;

create or replace function public.search_messageable_profiles_v1(
  p_query text,
  p_limit integer default 20
)
returns table (
  profile_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_style_key text,
  primary_role_key text,
  city text,
  country_code text,
  is_verified boolean,
  grade_level smallint,
  grade_code text,
  grade_label text,
  grade_visual_key text,
  recognitions jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := trim(coalesce(p_query, ''));
  v_pattern text;
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 20)));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if char_length(v_query) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid_profile_search';
  end if;
  v_pattern := replace(
    replace(
      replace(v_query, chr(92), chr(92) || chr(92)),
      '%', chr(92) || '%'
    ),
    '_', chr(92) || '_'
  );

  return query
  select
    profile.id,
    profile.username,
    coalesce(
      nullif(profile.display_name, ''),
      nullif(profile.username, ''),
      'Membre Meewav'
    ),
    profile.avatar_url,
    profile.avatar_style_key,
    profile.primary_role_key,
    profile.city,
    profile.country_code::text,
    profile.is_verified,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.level
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.code
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.label
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.visual_key
      else null
    end,
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', definition.code,
        'label', definition.label,
        'visual_key', definition.visual_key,
        'accent_hex', definition.accent_hex,
        'earned_at', recognition.earned_at
      ) order by definition.sort_order, definition.code), '[]'::jsonb)
      from public.profile_recognition_state recognition
      join public.recognition_definitions definition
        on definition.code = recognition.recognition_code
       and definition.is_active
      where recognition.profile_id = profile.id
        and recognition.status = 'earned'
        and recognition.is_public
    )
  from public.profiles profile
  left join public.profile_grade_state grade_state
    on grade_state.profile_id = profile.id
  left join public.grade_levels grade
    on grade.level = grade_state.level and grade.is_active
  where profile.id <> v_user_id
    and coalesce(profile.show_on_public_profile, false)
    and not coalesce(profile.is_ghost_mode, true)
    and not public.messaging_profiles_blocked_v1(v_user_id, profile.id)
    and (
      profile.username ilike '%' || v_pattern || '%' escape E'\\'
      or profile.display_name ilike '%' || v_pattern || '%' escape E'\\'
    )
  order by
    case
      when profile.username ilike v_pattern || '%' escape E'\\' then 0
      when profile.display_name ilike v_pattern || '%' escape E'\\' then 1
      else 2
    end,
    lower(coalesce(nullif(profile.display_name, ''), profile.username)),
    profile.id
  limit v_limit;
end;
$$;

create or replace function public.create_group_conversation_v1(
  p_title text,
  p_member_profile_ids uuid[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_conversation_id uuid;
  v_existing public.messaging_conversations%rowtype;
  v_member_id uuid;
  v_member_ids uuid[];
  v_all_member_ids uuid[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if nullif(v_title, '') is null or char_length(v_title) > 120 then
    raise exception using errcode = '22023', message = 'invalid_group_title';
  end if;
  if char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;
  if p_member_profile_ids is null
     or cardinality(p_member_profile_ids) not between 1 and 49
     or array_position(p_member_profile_ids, null::uuid) is not null then
    raise exception using errcode = '22023', message = 'invalid_group_members';
  end if;

  select coalesce(array_agg(distinct member_id order by member_id), '{}'::uuid[])
  into v_member_ids
  from unnest(p_member_profile_ids) as member(member_id)
  where member.member_id <> v_user_id;

  if cardinality(v_member_ids) < 1 or cardinality(v_member_ids) > 49 then
    raise exception using errcode = '22023', message = 'invalid_group_members';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:group-rate:' || v_user_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:conversation-key:' || v_user_id::text || ':' || v_idempotency_key,
    0
  ));

  select conversation.* into v_existing
  from public.messaging_conversations conversation
  where conversation.created_by_profile_id = v_user_id
    and conversation.kind = 'group'
    and conversation.creation_idempotency_key = v_idempotency_key;

  if v_existing.id is not null then
    if v_existing.title <> v_title
       or coalesce(v_existing.metadata -> 'requested_member_ids', '[]'::jsonb)
          <> to_jsonb(v_member_ids) then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    if v_existing.deleted_at is not null then
      raise exception using errcode = '55000', message = 'conversation_deleted';
    end if;
    return jsonb_build_object(
      'ok', true,
      'conversation_id', v_existing.id,
      'kind', 'group',
      'idempotent', true,
      'invitation_count', cardinality(v_member_ids)
    );
  end if;

  if exists (
    select 1 from unnest(v_member_ids) as member(member_id)
    where not exists (
      select 1 from public.profiles profile
      where profile.id = member.member_id
        and coalesce(profile.show_on_public_profile, false)
        and not coalesce(profile.is_ghost_mode, true)
    )
  ) then
    raise exception using errcode = 'P0002', message = 'group_member_not_found';
  end if;

  v_all_member_ids := array_prepend(v_user_id, v_member_ids);
  if exists (
    select 1
    from unnest(v_all_member_ids) as first_member(profile_id)
    cross join unnest(v_all_member_ids) as second_member(profile_id)
    where first_member.profile_id < second_member.profile_id
      and public.messaging_profiles_blocked_v1(
        first_member.profile_id,
        second_member.profile_id
      )
  ) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;

  if (
    select count(*) from public.messaging_conversations conversation
    where conversation.created_by_profile_id = v_user_id
      and conversation.kind = 'group'
      and conversation.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'group_creation_rate_limit';
  end if;

  insert into public.messaging_conversations (
    kind, created_by_profile_id, creation_idempotency_key, title, metadata
  ) values (
    'group', v_user_id, v_idempotency_key, v_title,
    jsonb_build_object('requested_member_ids', to_jsonb(v_member_ids))
  ) returning id into v_conversation_id;

  insert into public.messaging_conversation_members (
    conversation_id, profile_id, role, membership_status
  ) values (v_conversation_id, v_user_id, 'owner', 'active');

  foreach v_member_id in array v_member_ids loop
    insert into public.messaging_conversation_members (
      conversation_id, profile_id, role, membership_status,
      invited_by_profile_id, invited_at
    ) values (
      v_conversation_id, v_member_id, 'member', 'invited',
      v_user_id, now()
    );
  end loop;

  return jsonb_build_object(
    'ok', true, 'conversation_id', v_conversation_id,
    'kind', 'group', 'idempotent', false,
    'invitation_count', cardinality(v_member_ids)
  );
end;
$$;

create or replace function public.list_my_conversation_invitations_v1(
  p_limit integer default 30
)
returns table (
  conversation_id uuid,
  title text,
  inviter_profile_id uuid,
  inviter_username text,
  inviter_display_name text,
  inviter_avatar_url text,
  invited_at timestamptz,
  requested_member_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 30)));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  return query
  select
    conversation.id,
    conversation.title,
    member.invited_by_profile_id,
    inviter.username,
    coalesce(
      nullif(inviter.display_name, ''),
      nullif(inviter.username, ''),
      'Membre Meewav'
    ),
    inviter.avatar_url,
    member.invited_at,
    (
      select count(*)
      from public.messaging_conversation_members counted
      where counted.conversation_id = conversation.id
        and counted.membership_status <> 'declined'
    )
  from public.messaging_conversation_members member
  join public.messaging_conversations conversation
    on conversation.id = member.conversation_id
   and conversation.kind = 'group'
   and conversation.deleted_at is null
  left join public.profiles inviter
    on inviter.id = member.invited_by_profile_id
  where member.profile_id = v_user_id
    and member.membership_status = 'invited'
    and member.left_at is null
  order by member.invited_at desc nulls last, conversation.id desc
  limit v_limit;
end;
$$;

create or replace function public.respond_to_conversation_invitation_v1(
  p_conversation_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.messaging_conversation_members%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_conversation_id is null or p_accept is null then
    raise exception using errcode = '22023', message = 'invalid_invitation_response';
  end if;

  select member.* into v_member
  from public.messaging_conversation_members member
  join public.messaging_conversations conversation
    on conversation.id = member.conversation_id
   and conversation.kind = 'group'
   and conversation.deleted_at is null
  where member.conversation_id = p_conversation_id
    and member.profile_id = v_user_id
  for update of member;

  if v_member.profile_id is null then
    raise exception using errcode = 'P0002', message = 'invitation_not_found';
  end if;
  if (v_member.membership_status = 'active' and p_accept)
     or (v_member.membership_status = 'declined' and not p_accept) then
    return jsonb_build_object(
      'ok', true,
      'conversation_id', p_conversation_id,
      'accepted', p_accept,
      'idempotent', true
    );
  end if;
  if v_member.membership_status <> 'invited' then
    raise exception using errcode = '22023', message = 'invitation_already_responded';
  end if;

  if p_accept and exists (
    select 1
    from public.messaging_conversation_members other_member
    where other_member.conversation_id = p_conversation_id
      and other_member.profile_id <> v_user_id
      and other_member.membership_status = 'active'
      and other_member.left_at is null
      and public.messaging_profiles_blocked_v1(
        v_user_id,
        other_member.profile_id
      )
  ) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;

  update public.messaging_conversation_members
  set membership_status = case when p_accept then 'active' else 'declined' end,
      joined_at = case when p_accept then now() else joined_at end,
      responded_at = now(),
      left_at = case when p_accept then null else now() end,
      updated_at = now()
  where conversation_id = p_conversation_id
    and profile_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'accepted', p_accept,
    'idempotent', false
  );
end;
$$;

drop function if exists public.list_my_conversations_v1(
  timestamptz, integer, text, boolean, text
);
drop function if exists public.list_my_conversations_v1(
  jsonb, integer, text, boolean, text
);

create or replace function public.list_my_conversations_v1(
  p_cursor jsonb default null,
  p_limit integer default 30,
  p_kinds text[] default array['direct', 'group']::text[],
  p_unread_only boolean default false,
  p_search text default null
)
returns table (
  conversation_id uuid,
  kind text,
  title text,
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_body text,
  last_message_kind text,
  last_message_sender_profile_id uuid,
  unread_count bigint,
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz,
  notifications_enabled boolean,
  member_count bigint,
  counterpart_profile_id uuid,
  counterpart_username text,
  counterpart_display_name text,
  counterpart_avatar_url text,
  counterpart_avatar_style_key text,
  counterpart_primary_role_key text,
  counterpart_is_verified boolean,
  counterpart_grade_level smallint,
  counterpart_grade_code text,
  counterpart_grade_label text,
  counterpart_grade_visual_key text,
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
  v_search text := nullif(trim(p_search), '');
  v_cursor_pinned integer;
  v_cursor_pinned_at timestamptz;
  v_cursor_activity_at timestamptz;
  v_cursor_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_kinds is null
     or cardinality(p_kinds) not between 1 and 3
     or array_position(p_kinds, null::text) is not null
     or exists (
       select 1 from unnest(p_kinds) as requested(kind)
       where requested.kind not in ('direct', 'group', 'project')
     ) then
    raise exception using errcode = '22023', message = 'invalid_conversation_kind';
  end if;
  if char_length(coalesce(v_search, '')) > 80 then
    raise exception using errcode = '22023', message = 'search_too_long';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object'
       or not (p_cursor ? 'pinned')
       or not (p_cursor ? 'activity_at')
       or not (p_cursor ? 'conversation_id') then
      raise exception using errcode = '22023', message = 'invalid_conversation_cursor';
    end if;
    begin
      v_cursor_pinned := case
        when (p_cursor ->> 'pinned')::boolean then 1 else 0
      end;
      v_cursor_pinned_at := case
        when v_cursor_pinned = 1
          then (p_cursor ->> 'pinned_at')::timestamptz
        else '-infinity'::timestamptz
      end;
      v_cursor_activity_at := (p_cursor ->> 'activity_at')::timestamptz;
      v_cursor_id := (p_cursor ->> 'conversation_id')::uuid;
    exception
      when invalid_text_representation or invalid_datetime_format
        or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'invalid_conversation_cursor';
    end;
    if v_cursor_activity_at is null or v_cursor_id is null
       or (v_cursor_pinned = 1 and v_cursor_pinned_at is null) then
      raise exception using errcode = '22023', message = 'invalid_conversation_cursor';
    end if;
  end if;

  return query
  with inbox as (
    select
      conversation.id as conversation_id,
      conversation.kind,
      conversation.title,
      message.id as last_message_id,
      message.created_at as last_message_at,
      message.body as last_message_body,
      message.kind as last_message_kind,
      message.sender_profile_id as last_message_sender_profile_id,
      (
        select count(*)
        from public.messaging_messages unread
        where unread.conversation_id = conversation.id
          and unread.sequence > member.last_read_sequence
          and unread.sender_profile_id is distinct from v_user_id
          and unread.deleted_at is null
          and unread.moderation_status = 'visible'
          and (
            member.hidden_before_sequence is null
            or unread.sequence > member.hidden_before_sequence
          )
      ) as unread_count,
      member.pinned_at,
      member.muted_until,
      member.archived_at,
      member.notifications_enabled,
      (
        select count(*)
        from public.messaging_conversation_members counted
        where counted.conversation_id = conversation.id
          and counted.membership_status = 'active'
          and counted.left_at is null
      ) as member_count,
      counterpart.id as counterpart_profile_id,
      counterpart.username as counterpart_username,
      coalesce(
        nullif(counterpart.display_name, ''),
        nullif(counterpart.username, ''),
        case when counterpart.id is null then null else 'Membre Meewav' end
      ) as counterpart_display_name,
      counterpart.avatar_url as counterpart_avatar_url,
      counterpart.avatar_style_key as counterpart_avatar_style_key,
      counterpart.primary_role_key as counterpart_primary_role_key,
      counterpart.is_verified as counterpart_is_verified,
      case
        when coalesce(counterpart.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
          then grade.level
        else null
      end as counterpart_grade_level,
      case
        when coalesce(counterpart.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
          then grade.code
        else null
      end as counterpart_grade_code,
      case
        when coalesce(counterpart.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
          then grade.label
        else null
      end as counterpart_grade_label,
      case
        when coalesce(counterpart.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
          then grade.visual_key
        else null
      end as counterpart_grade_visual_key,
      case when member.pinned_at is null then 0 else 1 end as pinned_sort,
      coalesce(member.pinned_at, '-infinity'::timestamptz) as pinned_sort_at,
      coalesce(message.created_at, conversation.created_at) as activity_at
    from public.messaging_conversation_members member
    join public.messaging_conversations conversation
      on conversation.id = member.conversation_id
     and conversation.deleted_at is null
    left join lateral (
      select visible_message.*
      from public.messaging_messages visible_message
      where visible_message.conversation_id = conversation.id
        and visible_message.deleted_at is null
        and visible_message.moderation_status = 'visible'
        and (
          member.hidden_before_sequence is null
          or visible_message.sequence > member.hidden_before_sequence
        )
      order by visible_message.sequence desc
      limit 1
    ) message on true
    left join public.profiles counterpart
      on counterpart.id = public.messaging_direct_other_profile_v1(
        conversation.id,
        v_user_id
      )
    left join public.profile_grade_state grade_state
      on grade_state.profile_id = counterpart.id
    left join public.grade_levels grade
      on grade.level = grade_state.level and grade.is_active
    where member.profile_id = v_user_id
      and member.membership_status = 'active'
      and member.left_at is null
      and member.archived_at is null
      and conversation.kind = any(p_kinds)
      and (
        v_search is null
        or conversation.title ilike '%' || v_search || '%'
        or counterpart.username ilike '%' || v_search || '%'
        or counterpart.display_name ilike '%' || v_search || '%'
        or exists (
          select 1
          from public.messaging_conversation_members other_member
          join public.profiles profile on profile.id = other_member.profile_id
          where other_member.conversation_id = conversation.id
            and other_member.profile_id <> v_user_id
            and other_member.membership_status = 'active'
            and other_member.left_at is null
            and (
              profile.username ilike '%' || v_search || '%'
              or profile.display_name ilike '%' || v_search || '%'
            )
        )
      )
  )
  select
    inbox.conversation_id,
    inbox.kind,
    inbox.title,
    inbox.last_message_id,
    inbox.last_message_at,
    inbox.last_message_body,
    inbox.last_message_kind,
    inbox.last_message_sender_profile_id,
    inbox.unread_count,
    inbox.pinned_at,
    inbox.muted_until,
    inbox.archived_at,
    inbox.notifications_enabled,
    inbox.member_count,
    inbox.counterpart_profile_id,
    inbox.counterpart_username,
    inbox.counterpart_display_name,
    inbox.counterpart_avatar_url,
    inbox.counterpart_avatar_style_key,
    inbox.counterpart_primary_role_key,
    inbox.counterpart_is_verified,
    inbox.counterpart_grade_level,
    inbox.counterpart_grade_code,
    inbox.counterpart_grade_label,
    inbox.counterpart_grade_visual_key,
    jsonb_build_object(
      'pinned', inbox.pinned_sort = 1,
      'pinned_at', inbox.pinned_at,
      'activity_at', inbox.activity_at,
      'conversation_id', inbox.conversation_id
    )
  from inbox
  where (not coalesce(p_unread_only, false) or inbox.unread_count > 0)
    and (
      p_cursor is null
      or row(
        inbox.pinned_sort,
        inbox.pinned_sort_at,
        inbox.activity_at,
        inbox.conversation_id
      ) < row(
        v_cursor_pinned,
        v_cursor_pinned_at,
        v_cursor_activity_at,
        v_cursor_id
      )
    )
  order by inbox.pinned_sort desc,
           inbox.pinned_sort_at desc,
           inbox.activity_at desc,
           inbox.conversation_id desc
  limit v_limit;
end;
$$;

create or replace function public.get_conversation_messages_v1(
  p_conversation_id uuid,
  p_before_sequence bigint default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_profile_id uuid,
  client_message_id uuid,
  sequence bigint,
  kind text,
  body text,
  payload jsonb,
  reply_to_message_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  moderation_status text,
  reactions jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 50)));
  v_hidden_before bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not public.messaging_is_member_v1(p_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;
  select member.hidden_before_sequence into v_hidden_before
  from public.messaging_conversation_members member
  where member.conversation_id = p_conversation_id
    and member.profile_id = v_user_id;

  return query
  select
    message.id,
    message.conversation_id,
    message.sender_profile_id,
    message.client_message_id,
    message.sequence,
    message.kind,
    case when message.deleted_at is null then message.body else null end,
    case when message.deleted_at is null then message.payload else '{}'::jsonb end,
    message.reply_to_message_id,
    message.edited_at,
    message.deleted_at,
    message.moderation_status,
    case
      when message.deleted_at is not null then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'profile_id', reaction.profile_id,
          'emoji', reaction.emoji,
          'created_at', reaction.created_at
        ) order by reaction.created_at, reaction.profile_id), '[]'::jsonb)
        from public.messaging_message_reactions reaction
        where reaction.message_id = message.id
      )
    end,
    message.created_at,
    message.updated_at
  from public.messaging_messages message
  where message.conversation_id = p_conversation_id
    and (p_before_sequence is null or message.sequence < p_before_sequence)
    and (v_hidden_before is null or message.sequence > v_hidden_before)
    and message.moderation_status = 'visible'
  order by message.sequence desc
  limit v_limit;
end;
$$;

create or replace function public.get_conversation_members_v1(
  p_conversation_id uuid
)
returns table (
  profile_id uuid,
  role text,
  joined_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  avatar_style_key text,
  primary_role_key text,
  profile_image_url text,
  is_verified boolean,
  grade_level smallint,
  grade_code text,
  grade_label text,
  grade_visual_key text,
  recognitions jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not public.messaging_is_member_v1(p_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  return query
  select
    member.profile_id,
    member.role,
    member.joined_at,
    profile.username,
    coalesce(
      nullif(profile.display_name, ''),
      nullif(profile.username, ''),
      'Membre Meewav'
    ),
    profile.avatar_url,
    profile.avatar_style_key,
    profile.primary_role_key,
    profile.profile_image_url,
    profile.is_verified,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.level
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.code
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.label
      else null
    end,
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade.visual_key
      else null
    end,
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', definition.code,
        'label', definition.label,
        'visual_key', definition.visual_key,
        'accent_hex', definition.accent_hex,
        'earned_at', recognition.earned_at
      ) order by definition.sort_order, definition.code), '[]'::jsonb)
      from public.profile_recognition_state recognition
      join public.recognition_definitions definition
        on definition.code = recognition.recognition_code
       and definition.is_active
      where recognition.profile_id = member.profile_id
        and recognition.status = 'earned'
        and recognition.is_public
    )
  from public.messaging_conversation_members member
  join public.profiles profile on profile.id = member.profile_id
  left join public.profile_grade_state state on state.profile_id = profile.id
  left join public.grade_levels grade on grade.level = state.level and grade.is_active
  where member.conversation_id = p_conversation_id
    and member.membership_status = 'active'
    and member.left_at is null
  order by case member.role when 'owner' then 0 when 'admin' then 1 else 2 end,
           member.joined_at,
           member.profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Message and member state mutations.
-- ---------------------------------------------------------------------------

create or replace function public.send_message_v1(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_kind text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_conversation public.messaging_conversations%rowtype;
  v_sender_member public.messaging_conversation_members%rowtype;
  v_existing public.messaging_messages%rowtype;
  v_message public.messaging_messages%rowtype;
  v_other_profile_id uuid;
  v_sequence bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_client_message_id is null then
    raise exception using errcode = '22023', message = 'client_message_id_required';
  end if;
  if p_conversation_id is null then
    raise exception using errcode = '22023', message = 'conversation_id_required';
  end if;
  if p_kind is distinct from 'text' then
    raise exception using errcode = '22023', message = 'message_kind_not_enabled_in_phase_a';
  end if;
  if nullif(v_body, '') is null or char_length(v_body) > 4000 then
    raise exception using errcode = '22023', message = 'invalid_message_body';
  end if;
  if jsonb_typeof(v_payload) <> 'object'
     or octet_length(v_payload::text) > 8192 then
    raise exception using errcode = '22023', message = 'invalid_message_payload';
  end if;
  if not public.messaging_is_member_v1(p_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  -- One sender lock makes retries, idempotency and both rate windows atomic
  -- even when the same account sends concurrently to different conversations.
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:sender:' || v_user_id::text,
    0
  ));

  select * into v_existing
  from public.messaging_messages message
  where message.sender_profile_id = v_user_id
    and message.client_message_id = p_client_message_id;
  if found then
    if v_existing.conversation_id <> p_conversation_id
       or v_existing.kind <> p_kind
       or coalesce(v_existing.body, '') <> v_body
       or v_existing.payload <> v_payload
       or v_existing.reply_to_message_id is distinct from p_reply_to_message_id then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true, 'idempotent', true,
      'message_id', v_existing.id,
      'sequence', v_existing.sequence,
      'created_at', v_existing.created_at
    );
  end if;

  if (select count(*) from public.messaging_messages message
      where message.sender_profile_id = v_user_id
        and message.created_at > now() - interval '1 minute') >= 60
     or (select count(*) from public.messaging_messages message
         where message.sender_profile_id = v_user_id
           and message.created_at > now() - interval '1 hour') >= 500 then
    raise exception using errcode = 'P0001', message = 'message_rate_limit';
  end if;

  select * into v_conversation
  from public.messaging_conversations conversation
  where conversation.id = p_conversation_id
    and conversation.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'conversation_not_found';
  end if;

  -- Revalidate membership under the same lock order used by leave_group:
  -- conversation first, then membership. The optimistic check above gives a
  -- fast failure; this locked check closes the send-versus-leave race.
  select member.* into v_sender_member
  from public.messaging_conversation_members member
  where member.conversation_id = p_conversation_id
    and member.profile_id = v_user_id
  for update;
  if v_sender_member.profile_id is null
     or v_sender_member.membership_status <> 'active'
     or v_sender_member.left_at is not null then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  if v_conversation.kind = 'direct' then
    v_other_profile_id := public.messaging_direct_other_profile_v1(
      p_conversation_id, v_user_id
    );
    if v_other_profile_id is null
       or public.messaging_profiles_blocked_v1(v_user_id, v_other_profile_id) then
      raise exception using errcode = '42501', message = 'blocked_relationship';
    end if;
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1 from public.messaging_messages reply
    where reply.id = p_reply_to_message_id
      and reply.conversation_id = p_conversation_id
      and reply.deleted_at is null
      and reply.moderation_status = 'visible'
  ) then
    raise exception using errcode = '22023', message = 'invalid_reply_target';
  end if;

  v_sequence := v_conversation.next_sequence;
  insert into public.messaging_messages (
    conversation_id, sender_profile_id, client_message_id, sequence,
    kind, body, payload, reply_to_message_id
  ) values (
    p_conversation_id, v_user_id, p_client_message_id, v_sequence,
    p_kind, v_body, v_payload, p_reply_to_message_id
  ) returning * into v_message;

  update public.messaging_conversations
  set next_sequence = v_sequence + 1,
      last_message_id = v_message.id,
      last_message_at = v_message.created_at,
      updated_at = now()
  where id = p_conversation_id;

  update public.messaging_conversation_members
  set archived_at = null,
      updated_at = now()
  where conversation_id = p_conversation_id
    and membership_status = 'active'
    and left_at is null;

  update public.messaging_conversation_members
  set archived_at = null,
      last_read_sequence = greatest(last_read_sequence, v_sequence),
      last_read_at = now(),
      updated_at = now()
  where conversation_id = p_conversation_id
    and profile_id = v_user_id;

  return jsonb_build_object(
    'ok', true, 'idempotent', false,
    'message_id', v_message.id,
    'sequence', v_message.sequence,
    'created_at', v_message.created_at
  );
end;
$$;

create or replace function public.mark_conversation_read_v1(
  p_conversation_id uuid,
  p_through_sequence bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_latest_sequence bigint;
  v_read_sequence bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not public.messaging_is_member_v1(p_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  select coalesce(max(message.sequence), 0) into v_latest_sequence
  from public.messaging_messages message
  where message.conversation_id = p_conversation_id;
  v_read_sequence := least(
    v_latest_sequence,
    greatest(0, coalesce(p_through_sequence, v_latest_sequence))
  );

  update public.messaging_conversation_members
  set last_read_sequence = greatest(last_read_sequence, v_read_sequence),
      last_read_at = now(),
      updated_at = now()
  where conversation_id = p_conversation_id
    and profile_id = v_user_id
    and last_read_sequence < v_read_sequence;

  return jsonb_build_object(
    'ok', true, 'conversation_id', p_conversation_id,
    'last_read_sequence', (
      select last_read_sequence
      from public.messaging_conversation_members
      where conversation_id = p_conversation_id and profile_id = v_user_id
    )
  );
end;
$$;

create or replace function public.set_conversation_preferences_v1(
  p_conversation_id uuid,
  p_pinned boolean,
  p_muted_until timestamptz,
  p_archived boolean,
  p_notifications_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.messaging_conversation_members%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not public.messaging_is_member_v1(p_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;
  if p_pinned is null or p_archived is null
     or p_notifications_enabled is null then
    raise exception using errcode = '22023', message = 'invalid_conversation_preferences';
  end if;
  if p_muted_until is not null and p_muted_until > now() + interval '1 year' then
    raise exception using errcode = '22023', message = 'mute_duration_too_long';
  end if;

  update public.messaging_conversation_members
  set pinned_at = case when p_pinned then coalesce(pinned_at, now()) else null end,
      muted_until = case when p_muted_until > now() then p_muted_until else null end,
      archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
      notifications_enabled = p_notifications_enabled,
      updated_at = now()
  where conversation_id = p_conversation_id
    and profile_id = v_user_id
  returning * into v_member;

  return jsonb_build_object(
    'ok', true, 'conversation_id', p_conversation_id,
    'pinned_at', v_member.pinned_at,
    'muted_until', v_member.muted_until,
    'archived_at', v_member.archived_at,
    'notifications_enabled', v_member.notifications_enabled
  );
end;
$$;

create or replace function public.set_conversation_hidden_v1(
  p_conversation_id uuid,
  p_hidden boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_latest_sequence bigint;
  v_member public.messaging_conversation_members%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_conversation_id is null or p_hidden is null then
    raise exception using errcode = '22023', message = 'invalid_hidden_state';
  end if;
  if not public.messaging_is_member_v1(p_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  select coalesce(max(message.sequence), 0) into v_latest_sequence
  from public.messaging_messages message
  where message.conversation_id = p_conversation_id;

  update public.messaging_conversation_members
  set hidden_before_sequence = case when p_hidden then v_latest_sequence else null end,
      last_read_sequence = case
        when p_hidden then greatest(last_read_sequence, v_latest_sequence)
        else last_read_sequence
      end,
      last_read_at = case when p_hidden then now() else last_read_at end,
      archived_at = case when p_hidden then coalesce(archived_at, now()) else null end,
      updated_at = now()
  where conversation_id = p_conversation_id
    and profile_id = v_user_id
  returning * into v_member;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'hidden', p_hidden,
    'hidden_before_sequence', v_member.hidden_before_sequence
  );
end;
$$;

create or replace function public.leave_group_conversation_v1(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.messaging_conversation_members%rowtype;
  v_successor_profile_id uuid;
  v_managed_by text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_conversation_id is null then
    raise exception using errcode = '22023', message = 'conversation_id_required';
  end if;

  select nullif(trim(conversation.metadata ->> 'managed_by'), '')
    into v_managed_by
  from public.messaging_conversations conversation
  where conversation.id = p_conversation_id
    and conversation.kind = 'group'
    and conversation.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'group_conversation_not_found';
  end if;
  if v_managed_by is not null then
    raise exception using
      errcode = '42501',
      message = 'managed_conversation_requires_domain_rpc';
  end if;

  select member.* into v_member
  from public.messaging_conversation_members member
  where member.conversation_id = p_conversation_id
    and member.profile_id = v_user_id
  for update;
  if v_member.profile_id is null then
    raise exception using errcode = 'P0002', message = 'conversation_member_not_found';
  end if;
  if v_member.left_at is not null then
    return jsonb_build_object(
      'ok', true,
      'conversation_id', p_conversation_id,
      'idempotent', true
    );
  end if;
  if v_member.membership_status <> 'active' then
    raise exception using errcode = '42501', message = 'not_an_active_conversation_member';
  end if;

  if v_member.role = 'owner' then
    select other_member.profile_id into v_successor_profile_id
    from public.messaging_conversation_members other_member
    where other_member.conversation_id = p_conversation_id
      and other_member.profile_id <> v_user_id
      and other_member.membership_status = 'active'
      and other_member.left_at is null
    order by
      case other_member.role when 'admin' then 0 else 1 end,
      other_member.joined_at,
      other_member.profile_id
    limit 1
    for update;

    if v_successor_profile_id is null then
      update public.messaging_conversations
      set deleted_at = now(), updated_at = now()
      where id = p_conversation_id;
    else
      update public.messaging_conversation_members
      set role = 'owner', updated_at = now()
      where conversation_id = p_conversation_id
        and profile_id = v_successor_profile_id;
    end if;
  end if;

  update public.messaging_conversation_members
  set left_at = now(), updated_at = now()
  where conversation_id = p_conversation_id
    and profile_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'idempotent', false,
    'transferred_owner_to', v_successor_profile_id
  );
end;
$$;

create or replace function public.set_message_reaction_v1(
  p_message_id uuid,
  p_emoji text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_message_id is null or p_active is null then
    raise exception using errcode = '22023', message = 'invalid_reaction_payload';
  end if;
  if p_emoji is null
     or p_emoji not in ('❤️', '🔥', '👏', '🎧', '⭐', '👍', '✅', '✨', '🎹') then
    raise exception using errcode = '22023', message = 'unsupported_reaction';
  end if;
  select message.conversation_id into v_conversation_id
  from public.messaging_messages message
  where message.id = p_message_id
    and message.deleted_at is null
    and message.moderation_status = 'visible';
  if v_conversation_id is null then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;
  if not public.messaging_is_member_v1(v_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  if p_active then
    insert into public.messaging_message_reactions(message_id, profile_id, emoji)
    values (p_message_id, v_user_id, p_emoji)
    on conflict (message_id, profile_id, emoji) do nothing;
  else
    delete from public.messaging_message_reactions
    where message_id = p_message_id
      and profile_id = v_user_id
      and emoji = p_emoji;
  end if;

  return jsonb_build_object(
    'ok', true, 'message_id', p_message_id,
    'emoji', p_emoji, 'active', p_active
  );
end;
$$;

drop function if exists public.toggle_message_reaction_v1(uuid, text);

-- ---------------------------------------------------------------------------
-- Grants: no direct mutation path exists for browser roles.
-- ---------------------------------------------------------------------------

revoke all on function public.messaging_is_member_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.messaging_is_member_v1(uuid)
  to authenticated;
revoke all on function public.messaging_profiles_blocked_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.messaging_profiles_blocked_v1(uuid, uuid)
  to service_role;
revoke all on function public.messaging_direct_other_profile_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.messaging_direct_other_profile_v1(uuid, uuid)
  to service_role;
revoke all on function public.messaging_prepare_profile_delete_v1()
  from public, anon, authenticated;

revoke all on function public.set_user_block_v1(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_user_block_v1(uuid, boolean, text)
  to authenticated;
revoke all on function public.report_content_v1(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.report_content_v1(text, uuid, text, text, text)
  to authenticated;
revoke all on function public.list_my_content_reports_v1(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.list_my_content_reports_v1(timestamptz, integer)
  to authenticated;
revoke all on function public.get_or_create_direct_conversation_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_or_create_direct_conversation_v1(uuid, text)
  to authenticated;
revoke all on function public.search_messageable_profiles_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.search_messageable_profiles_v1(text, integer)
  to authenticated;
revoke all on function public.create_group_conversation_v1(text, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.create_group_conversation_v1(text, uuid[], text)
  to authenticated;
revoke all on function public.list_my_conversation_invitations_v1(integer)
  from public, anon, authenticated;
grant execute on function public.list_my_conversation_invitations_v1(integer)
  to authenticated;
revoke all on function public.respond_to_conversation_invitation_v1(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.respond_to_conversation_invitation_v1(uuid, boolean)
  to authenticated;
revoke all on function public.list_my_conversations_v1(
  jsonb, integer, text[], boolean, text
) from public, anon, authenticated;
grant execute on function public.list_my_conversations_v1(
  jsonb, integer, text[], boolean, text
) to authenticated;
revoke all on function public.get_conversation_messages_v1(uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_conversation_messages_v1(uuid, bigint, integer)
  to authenticated;
revoke all on function public.get_conversation_members_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_conversation_members_v1(uuid)
  to authenticated;
revoke all on function public.send_message_v1(uuid, uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.send_message_v1(uuid, uuid, text, text, jsonb, uuid)
  to authenticated;
revoke all on function public.mark_conversation_read_v1(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.mark_conversation_read_v1(uuid, bigint)
  to authenticated;
revoke all on function public.set_conversation_preferences_v1(
  uuid, boolean, timestamptz, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.set_conversation_preferences_v1(
  uuid, boolean, timestamptz, boolean, boolean
) to authenticated;
revoke all on function public.set_conversation_hidden_v1(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_conversation_hidden_v1(uuid, boolean)
  to authenticated;
revoke all on function public.leave_group_conversation_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.leave_group_conversation_v1(uuid)
  to authenticated;
revoke all on function public.set_message_reaction_v1(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_message_reaction_v1(uuid, text, boolean)
  to authenticated;

comment on table public.messaging_messages is
  'Messaging Phase A durable text ledger. Direct client inserts are forbidden.';
comment on function public.send_message_v1(uuid, uuid, text, text, jsonb, uuid) is
  'Authenticated, membership-checked and idempotent text send contract.';
comment on function public.get_or_create_direct_conversation_v1(uuid, text) is
  'Creates one canonical direct conversation per unordered profile pair.';
comment on function public.messaging_prepare_profile_delete_v1() is
  'Preserves surviving participants history and transfers group ownership before a hard profile deletion.';

commit;
