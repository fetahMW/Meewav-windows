-- A request has its own chat. Acceptance still creates the ordinary friends DM;
-- its messages are never copied or merged with the request discussion.
create unique index if not exists messaging_collaboration_chat_request_idx
  on public.messaging_conversations ((metadata ->> 'collaboration_request_id'))
  where metadata ? 'collaboration_request_id';

create or replace function public.messaging_direct_other_profile_v1(
  p_conversation_id uuid, p_profile_id uuid
)
returns uuid language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case when pair.profile_low_id = p_profile_id then pair.profile_high_id
                 when pair.profile_high_id = p_profile_id then pair.profile_low_id end
     from public.messaging_direct_pairs pair where pair.conversation_id = p_conversation_id),
    (select other.profile_id
     from public.messaging_conversations conversation
     join public.messaging_conversation_members mine
       on mine.conversation_id = conversation.id and mine.profile_id = p_profile_id
     join public.messaging_conversation_members other
       on other.conversation_id = conversation.id and other.profile_id <> p_profile_id
     where conversation.id = p_conversation_id
       and conversation.kind = 'direct'
       and conversation.metadata ? 'collaboration_request_id'
     limit 1)
  );
$$;

create or replace function public.get_or_create_collaboration_conversation_v1(p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_request public.collaboration_requests%rowtype;
  v_conversation uuid;
  v_deleted timestamptz;
  v_message uuid;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  -- Serializes both participants and retries against the same request.
  select * into v_request from public.collaboration_requests
  where id = p_request_id
    and v_user in (sender_profile_id, recipient_profile_id)
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'collaboration_request_not_found';
  end if;
  if public.messaging_profiles_blocked_v1(v_request.sender_profile_id, v_request.recipient_profile_id) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;
  select id, deleted_at into v_conversation, v_deleted
  from public.messaging_conversations
  where metadata ->> 'collaboration_request_id' = p_request_id::text;
  if v_conversation is not null then
    if v_deleted is not null then
      raise exception using errcode = '55000', message = 'conversation_deleted';
    end if;
    return jsonb_build_object('ok', true, 'conversation_id', v_conversation, 'kind', 'direct', 'idempotent', true);
  end if;
  if v_request.status not in ('pending', 'accepted') then
    raise exception using errcode = '55000', message = 'collaboration_request_closed';
  end if;
  insert into public.messaging_conversations (kind, created_by_profile_id, metadata)
  values ('direct', v_user, jsonb_build_object('collaboration_request_id', p_request_id))
  returning id into v_conversation;
  -- Deliberately no messaging_direct_pairs row: an ordinary DM must remain distinct.
  insert into public.messaging_conversation_members (conversation_id, profile_id, role)
  values (v_conversation, v_request.sender_profile_id, 'member'),
         (v_conversation, v_request.recipient_profile_id, 'member');
  insert into public.messaging_messages
    (conversation_id, sender_profile_id, client_message_id, sequence, kind, body, created_at)
  values (v_conversation, v_request.sender_profile_id, gen_random_uuid(), 1, 'text', v_request.message, v_request.created_at)
  returning id into v_message;
  update public.messaging_conversations
  set next_sequence = 2, last_message_id = v_message, last_message_at = v_request.created_at
  where id = v_conversation;
  return jsonb_build_object('ok', true, 'conversation_id', v_conversation, 'kind', 'direct', 'idempotent', false);
end;
$$;

-- Preserve the existing membership, paging and visibility rules and expose the
-- persistent scope to both recipients, including after refresh/realtime updates.
create or replace function public.list_my_conversations_v2(
  p_cursor jsonb default null, p_limit integer default 30,
  p_kinds text[] default array['direct','group'],
  p_unread_only boolean default false, p_search text default null
)
returns setof jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(inbox) || jsonb_build_object(
    'collaboration_request_id', conversation.metadata ->> 'collaboration_request_id'
  )
  from public.list_my_conversations_v1(p_cursor, p_limit, p_kinds, p_unread_only, p_search) inbox
  join public.messaging_conversations conversation on conversation.id = inbox.conversation_id;
$$;

revoke all on function public.get_or_create_collaboration_conversation_v1(uuid) from public, anon;
grant execute on function public.get_or_create_collaboration_conversation_v1(uuid) to authenticated;
revoke all on function public.list_my_conversations_v2(jsonb, integer, text[], boolean, text) from public, anon;
grant execute on function public.list_my_conversations_v2(jsonb, integer, text[], boolean, text) to authenticated;
