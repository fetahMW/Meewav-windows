begin;

-- A Classe seat is a private, server-authorized relationship. The generic
-- Messaging discovery RPC deliberately excludes hidden/ghost profiles, so the
-- Host needs one narrow path that revalidates the live Room and active seat
-- before creating the same durable, blocked-aware direct conversation.
create or replace function public.rooms_get_or_create_classe_direct_conversation_v1(
  p_room_id uuid,
  p_student_profile_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_low_id uuid;
  v_high_id uuid;
  v_conversation_id uuid;
  v_creation_key text;
  v_deleted_at timestamptz;
  v_request_hash text;
  v_idempotency public.messaging_idempotency_keys%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_room_id is null
     or p_student_profile_id is null
     or p_student_profile_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_direct_recipient';
  end if;
  if char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_idempotency_key';
  end if;

  -- Do not reveal whether the Room is absent, ended, another type, or owned by
  -- somebody else. The row locks keep this proof valid through creation.
  perform 1
  from public.rooms_v2 room
  join public.room_specialized_state_v1 specialized
    on specialized.room_id = room.id
   and specialized.room_type = 'classe'
  where room.id = p_room_id
    and room.host_id = v_user_id
    and room.type = 'place'
    and room.status = 'live'
  for share of room, specialized;
  if not found then
    raise exception using errcode = '42501', message = 'classe_message_host_required';
  end if;

  perform 1
  from public.room_classe_seat_entitlements_v1 entitlement
  join public.room_participants_v2 participant
    on participant.room_id = entitlement.room_id
   and participant.user_id = entitlement.student_id
   and participant.role = 'viewer'
   and participant.left_at is null
  where entitlement.room_id = p_room_id
    and entitlement.student_id = p_student_profile_id
    and entitlement.status = 'active'
  for share of entitlement, participant;
  if not found
     or not public.rooms_classe_active_seat_v1(p_room_id, p_student_profile_id) then
    raise exception using errcode = '42501', message = 'classe_message_active_seat_required';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_student_profile_id
  ) then
    raise exception using errcode = 'P0002', message = 'messageable_profile_not_found';
  end if;
  if public.messaging_profiles_blocked_v1(v_user_id, p_student_profile_id) then
    raise exception using errcode = '42501', message = 'blocked_relationship';
  end if;

  if v_user_id < p_student_profile_id then
    v_low_id := v_user_id;
    v_high_id := p_student_profile_id;
  else
    v_low_id := p_student_profile_id;
    v_high_id := v_user_id;
  end if;
  v_request_hash := encode(digest(
    p_room_id::text || ':' || p_student_profile_id::text,
    'sha256'
  ), 'hex');
  v_creation_key := 'classe:' || encode(digest(
    p_room_id::text || ':' || v_user_id::text || ':' || v_idempotency_key,
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:classe-conversation-key:' || v_user_id::text || ':' || v_idempotency_key,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'messaging:direct-pair:' || v_low_id::text || ':' || v_high_id::text,
    0
  ));

  select ledger.* into v_idempotency
  from public.messaging_idempotency_keys ledger
  where ledger.profile_id = v_user_id
    and ledger.operation = 'classe_direct_conversation.create'
    and ledger.idempotency_key = v_idempotency_key;
  if found then
    if v_idempotency.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'idempotency_conflict';
    end if;
    select conversation.deleted_at into v_deleted_at
    from public.messaging_conversations conversation
    where conversation.id = v_idempotency.result_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'idempotency_result_not_found';
    end if;
    if v_deleted_at is not null then
      raise exception using errcode = '55000', message = 'conversation_deleted';
    end if;
    return jsonb_build_object(
      'ok', true,
      'conversation_id', v_idempotency.result_id,
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
    insert into public.messaging_idempotency_keys (
      profile_id, operation, idempotency_key, request_hash, result_id
    ) values (
      v_user_id, 'classe_direct_conversation.create', v_idempotency_key,
      v_request_hash, v_conversation_id
    );
    return jsonb_build_object(
      'ok', true,
      'conversation_id', v_conversation_id,
      'kind', 'direct',
      'idempotent', true
    );
  end if;

  insert into public.messaging_conversations (
    kind, created_by_profile_id, creation_idempotency_key
  ) values (
    'direct', v_user_id, v_creation_key
  ) returning id into v_conversation_id;

  insert into public.messaging_direct_pairs (
    conversation_id, profile_low_id, profile_high_id
  ) values (
    v_conversation_id, v_low_id, v_high_id
  );

  insert into public.messaging_conversation_members (
    conversation_id, profile_id, role
  ) values
    (v_conversation_id, v_user_id, 'member'),
    (v_conversation_id, p_student_profile_id, 'member');

  insert into public.messaging_idempotency_keys (
    profile_id, operation, idempotency_key, request_hash, result_id
  ) values (
    v_user_id, 'classe_direct_conversation.create', v_idempotency_key,
    v_request_hash, v_conversation_id
  );

  return jsonb_build_object(
    'ok', true,
    'conversation_id', v_conversation_id,
    'kind', 'direct',
    'idempotent', false
  );
end;
$$;

revoke all on function public.rooms_get_or_create_classe_direct_conversation_v1(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rooms_get_or_create_classe_direct_conversation_v1(uuid, uuid, text)
  to authenticated;

comment on function public.rooms_get_or_create_classe_direct_conversation_v1(uuid, uuid, text)
  is 'Creates or returns a durable direct conversation only after revalidating the live Classe Host and active entitled seat; private profile discovery is never broadened.';

commit;
