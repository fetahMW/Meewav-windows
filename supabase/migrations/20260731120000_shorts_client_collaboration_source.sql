-- Shorts can initiate the same authenticated, idempotent collaboration request
-- as the Globe. All other source pillars remain reserved to service_role.
create or replace function public.request_profile_collaboration(
  p_recipient_profile_id uuid,
  p_message text,
  p_idempotency_key text,
  p_source text default 'globe'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sender_profile_id uuid := auth.uid();
  v_message text := btrim(coalesce(p_message, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_source text := lower(btrim(coalesce(p_source, 'globe')));
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_request public.collaboration_requests%rowtype;
  v_inserted boolean := false;
begin
  if v_sender_profile_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_recipient_profile_id is null then
    raise exception using errcode = '22023', message = 'recipient_profile_required';
  end if;
  if p_recipient_profile_id = v_sender_profile_id then
    raise exception using errcode = '23514', message = 'cannot_request_collaboration_with_self';
  end if;
  if char_length(v_message) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'collaboration_message_length_invalid';
  end if;
  if char_length(v_idempotency_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'collaboration_idempotency_key_invalid';
  end if;
  if v_source not in ('globe', 'profile', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin') then
    raise exception using errcode = '22023', message = 'collaboration_source_invalid';
  end if;
  if not v_is_service and v_source not in ('globe', 'shorts') then
    raise exception using errcode = '22023', message = 'collaboration_client_source_not_allowed';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_recipient_profile_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
      and coalesce(p.collab_available, false)
  ) then
    raise exception using errcode = '23503', message = 'recipient_profile_not_available';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('profile-collaboration:' || v_sender_profile_id::text, 0)
  );

  select r.* into v_request
  from public.collaboration_requests r
  where r.sender_profile_id = v_sender_profile_id
    and r.idempotency_key = v_idempotency_key;

  if v_request.id is not null then
    if v_request.recipient_profile_id <> p_recipient_profile_id
       or v_request.message <> v_message
       or v_request.source <> v_source then
      raise exception using errcode = '23505', message = 'collaboration_idempotency_key_conflict';
    end if;
  else
    if (
      select count(*)
      from public.collaboration_requests r
      where r.sender_profile_id = v_sender_profile_id
        and r.created_at >= now() - interval '1 hour'
    ) >= 20 then
      raise exception using errcode = '54000', message = 'collaboration_hourly_rate_limit';
    end if;

    if (
      select count(*)
      from public.collaboration_requests r
      where r.sender_profile_id = v_sender_profile_id
        and r.recipient_profile_id = p_recipient_profile_id
        and r.created_at >= now() - interval '24 hours'
    ) >= 3 then
      raise exception using errcode = '54000', message = 'collaboration_recipient_rate_limit';
    end if;

    insert into public.collaboration_requests (
      sender_profile_id,
      recipient_profile_id,
      message,
      status,
      idempotency_key,
      source
    ) values (
      v_sender_profile_id,
      p_recipient_profile_id,
      v_message,
      'pending',
      v_idempotency_key,
      v_source
    )
    returning * into v_request;

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
      v_sender_profile_id,
      p_recipient_profile_id,
      v_source,
      'collaboration_request_created',
      v_request.id::text,
      'collaboration:' || v_request.id::text,
      'server',
      jsonb_build_object('status', v_request.status),
      v_request.created_at
    ) on conflict (actor_profile_id, source_pillar, idempotency_key)
      where idempotency_key is not null do nothing;

    v_inserted := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'requestId', v_request.id,
    'senderProfileId', v_request.sender_profile_id,
    'recipientProfileId', v_request.recipient_profile_id,
    'status', v_request.status,
    'source', v_request.source,
    'createdAt', v_request.created_at,
    'idempotentReplay', not v_inserted
  );
end;
$$;

revoke all on function public.request_profile_collaboration(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_profile_collaboration(uuid, text, text, text)
  to authenticated, service_role;

comment on function public.request_profile_collaboration(uuid, text, text, text) is
  'Authenticated idempotent collaboration creation from Globe or Shorts. Other source pillars remain service-only.';
