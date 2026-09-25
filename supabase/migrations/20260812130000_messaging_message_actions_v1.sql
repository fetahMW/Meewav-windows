begin;

-- Shared, durable message pins. Clients never read or mutate this ledger
-- directly; the SECURITY DEFINER RPCs below keep membership checks central.
create table if not exists public.messaging_message_pins (
  message_id uuid primary key,
  conversation_id uuid not null,
  pinned_by_profile_id uuid references public.profiles(id) on delete set null,
  pinned_at timestamptz not null default now(),
  foreign key (message_id, conversation_id)
    references public.messaging_messages(id, conversation_id) on delete cascade
);

create index if not exists messaging_message_pins_conversation_idx
  on public.messaging_message_pins(conversation_id, pinned_at desc);

alter table public.messaging_message_pins enable row level security;
revoke all on table public.messaging_message_pins from public, anon, authenticated;

-- Attachment-aware projection plus the shared pin state. V1 and V2 remain in
-- place for older Web/iOS builds; new clients opt into V3.
create or replace function public.get_conversation_messages_v3(
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
  pinned_at timestamptz,
  pinned_by_profile_id uuid,
  reactions jsonb,
  attachments jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    message.id,
    message.conversation_id,
    message.sender_profile_id,
    message.client_message_id,
    message.sequence,
    message.kind,
    message.body,
    message.payload,
    message.reply_to_message_id,
    message.edited_at,
    message.deleted_at,
    message.moderation_status,
    pin.pinned_at,
    pin.pinned_by_profile_id,
    message.reactions,
    message.attachments,
    message.created_at,
    message.updated_at
  from public.get_conversation_messages_v2(
    p_conversation_id, p_before_sequence, p_limit
  ) message
  left join public.messaging_message_pins pin
    on pin.message_id = message.id
   and pin.conversation_id = message.conversation_id;
$$;

create or replace function public.set_message_pinned_v1(
  p_message_id uuid,
  p_pinned boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messaging_messages%rowtype;
  v_pinned_at timestamptz;
  v_pinned_by_profile_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_message_id is null or p_pinned is null then
    raise exception using errcode = '22023', message = 'invalid_message_pin_request';
  end if;

  select message.* into v_message
  from public.messaging_messages message
  where message.id = p_message_id
  for update;

  if not found or v_message.deleted_at is not null
     or v_message.moderation_status <> 'visible' then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;
  if not public.messaging_is_member_v1(v_message.conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;

  if p_pinned then
    insert into public.messaging_message_pins (
      message_id, conversation_id, pinned_by_profile_id, pinned_at
    ) values (
      v_message.id, v_message.conversation_id, v_user_id, now()
    )
    on conflict (message_id) do update
      set pinned_by_profile_id = excluded.pinned_by_profile_id,
          pinned_at = excluded.pinned_at
    returning pinned_at, pinned_by_profile_id
      into v_pinned_at, v_pinned_by_profile_id;
  else
    delete from public.messaging_message_pins pin
    where pin.message_id = v_message.id;
    v_pinned_at := null;
    v_pinned_by_profile_id := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message_id', v_message.id,
    'conversation_id', v_message.conversation_id,
    'pinned', p_pinned,
    'pinned_at', v_pinned_at,
    'pinned_by_profile_id', v_pinned_by_profile_id
  );
end;
$$;

create or replace function public.delete_message_v1(
  p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messaging_messages%rowtype;
  v_deleted_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_message_id is null then
    raise exception using errcode = '22023', message = 'message_id_required';
  end if;

  select message.* into v_message
  from public.messaging_messages message
  where message.id = p_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;
  if not public.messaging_is_member_v1(v_message.conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;
  if v_message.sender_profile_id is distinct from v_user_id then
    raise exception using errcode = '42501', message = 'message_delete_not_allowed';
  end if;

  if v_message.deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'message_id', v_message.id,
      'conversation_id', v_message.conversation_id,
      'deleted_at', v_message.deleted_at
    );
  end if;

  v_deleted_at := now();
  update public.messaging_messages
  set deleted_at = v_deleted_at,
      updated_at = v_deleted_at
  where id = v_message.id;

  delete from public.messaging_message_pins pin
  where pin.message_id = v_message.id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'message_id', v_message.id,
    'conversation_id', v_message.conversation_id,
    'deleted_at', v_deleted_at
  );
end;
$$;

create or replace function public.forward_message_v1(
  p_message_id uuid,
  p_target_conversation_id uuid,
  p_client_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messaging_messages%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_message_id is null or p_target_conversation_id is null
     or p_client_message_id is null then
    raise exception using errcode = '22023', message = 'invalid_message_forward_request';
  end if;

  select message.* into v_message
  from public.messaging_messages message
  where message.id = p_message_id;

  if not found or v_message.deleted_at is not null
     or v_message.moderation_status <> 'visible' then
    raise exception using errcode = 'P0002', message = 'message_not_found';
  end if;
  if not public.messaging_is_member_v1(v_message.conversation_id)
     or not public.messaging_is_member_v1(p_target_conversation_id) then
    raise exception using errcode = '42501', message = 'not_a_conversation_member';
  end if;
  if exists (
    select 1 from public.messaging_message_attachments attachment
    where attachment.message_id = v_message.id
  ) then
    -- A private attachment cannot be moved to another conversation without a
    -- new durable access grant. Refusing is safer than forwarding a dead URL.
    raise exception using
      errcode = '22023', message = 'message_forward_attachments_unsupported';
  end if;
  if v_message.kind <> 'text' then
    raise exception using errcode = '22023', message = 'message_forward_unsupported';
  end if;

  v_result := public.send_message_v1(
    p_target_conversation_id,
    p_client_message_id,
    'text',
    v_message.body,
    jsonb_build_object('is_forwarded', true),
    null
  );

  return v_result || jsonb_build_object(
    'source_message_id', v_message.id,
    'target_conversation_id', p_target_conversation_id
  );
end;
$$;

-- Pin changes use the same private per-conversation invalidation path as
-- messages and reactions, so other members refresh without a public channel.
drop trigger if exists messaging_realtime_message_pins_v1
  on public.messaging_message_pins;
create trigger messaging_realtime_message_pins_v1
after insert or update or delete on public.messaging_message_pins
for each row execute function public.messaging_broadcast_conversation_change_v1();

revoke all on function public.get_conversation_messages_v3(uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.get_conversation_messages_v3(uuid, bigint, integer)
  to authenticated;

revoke all on function public.set_message_pinned_v1(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_message_pinned_v1(uuid, boolean)
  to authenticated;

revoke all on function public.delete_message_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_message_v1(uuid)
  to authenticated;

revoke all on function public.forward_message_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.forward_message_v1(uuid, uuid, uuid)
  to authenticated;

comment on table public.messaging_message_pins is
  'Shared message-pin ledger, accessible only through membership-checked RPCs.';
comment on function public.delete_message_v1(uuid) is
  'Soft-deletes only a message authored by the authenticated conversation member.';
comment on function public.forward_message_v1(uuid, uuid, uuid) is
  'Forwards eligible text into another member conversation; private attachments fail closed.';

commit;
