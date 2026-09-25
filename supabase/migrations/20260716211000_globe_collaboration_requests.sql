-- Persisted profile-to-profile collaboration requests for the Globe popup.
--
-- This is intentionally independent from Rooms v2 and from the future
-- messaging domain. A future conversation can reference the request id without
-- rewriting this immutable acquisition event.

create extension if not exists pgcrypto;

create table if not exists public.collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  status text not null default 'pending',
  idempotency_key text not null,
  source text not null default 'globe',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint collaboration_requests_no_self_check
    check (sender_profile_id <> recipient_profile_id),
  constraint collaboration_requests_message_check
    check (char_length(btrim(message)) between 1 and 500),
  constraint collaboration_requests_status_check
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  constraint collaboration_requests_idempotency_key_check
    check (char_length(idempotency_key) between 8 and 128),
  constraint collaboration_requests_source_check
    check (source in ('globe', 'profile', 'messaging', 'rooms', 'shorts', 'marketplace', 'tremplin'))
);

create unique index if not exists collaboration_requests_sender_idempotency_idx
  on public.collaboration_requests(sender_profile_id, idempotency_key);
create index if not exists collaboration_requests_recipient_created_idx
  on public.collaboration_requests(recipient_profile_id, created_at desc);
create index if not exists collaboration_requests_sender_created_idx
  on public.collaboration_requests(sender_profile_id, created_at desc);
create index if not exists collaboration_requests_sender_recipient_created_idx
  on public.collaboration_requests(sender_profile_id, recipient_profile_id, created_at desc);
create index if not exists collaboration_requests_recipient_pending_idx
  on public.collaboration_requests(recipient_profile_id, created_at desc)
  where status = 'pending';

drop trigger if exists collaboration_requests_touch_updated_at
  on public.collaboration_requests;
create trigger collaboration_requests_touch_updated_at
before update on public.collaboration_requests
for each row execute function public.meewav_touch_updated_at();

create or replace function public.create_collaboration_request_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.notifications (
    user_id,
    type,
    from_user_id,
    content,
    payload,
    source_pillar,
    source_event_id
  ) values (
    new.recipient_profile_id,
    'collaboration_request',
    new.sender_profile_id,
    't''a envoyé une demande de collaboration',
    jsonb_build_object(
      'request_id', new.id,
      'sender_profile_id', new.sender_profile_id,
      'source', new.source,
      'status', new.status
    ),
    new.source,
    new.id::text
  )
  on conflict (user_id, source_pillar, source_event_id)
    where source_event_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists collaboration_request_notification
  on public.collaboration_requests;
create trigger collaboration_request_notification
after insert on public.collaboration_requests
for each row execute function public.create_collaboration_request_notification();

create or replace function public.track_follow_created_analytics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
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
    new.follower_id,
    new.following_id,
    'profile',
    'follow_created',
    new.id::text,
    'follow:' || new.id::text,
    'server',
    '{}'::jsonb,
    coalesce(new.created_at, now())
  ) on conflict (actor_profile_id, source_pillar, idempotency_key)
    where idempotency_key is not null do nothing;
  return new;
end;
$$;

drop trigger if exists follows_track_created_analytics on public.follows;
create trigger follows_track_created_analytics
after insert on public.follows
for each row execute function public.track_follow_created_analytics();

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
  -- current_user is the function owner inside SECURITY DEFINER and must not be
  -- used to grant browser callers service privileges.
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
  if not v_is_service and v_source <> 'globe' then
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

  -- Serialize all requests from one sender. This keeps idempotent retries
  -- deterministic and prevents parallel retry keys from bypassing rate limits.
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

alter table public.collaboration_requests enable row level security;

drop policy if exists collaboration_requests_participant_select
  on public.collaboration_requests;
create policy collaboration_requests_participant_select
on public.collaboration_requests
for select to authenticated
using (
  sender_profile_id = auth.uid()
  or recipient_profile_id = auth.uid()
);

-- Writes intentionally go through request_profile_collaboration(). This keeps
-- sender identity, idempotency, visibility checks and notification creation in
-- one transaction. Later status transitions can receive their own narrow RPC.
revoke all on public.collaboration_requests from anon, authenticated;
grant select on public.collaboration_requests to authenticated;
grant all on public.collaboration_requests to service_role;

revoke all on function public.request_profile_collaboration(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_profile_collaboration(uuid, text, text, text)
  to authenticated, service_role;
revoke all on function public.create_collaboration_request_notification()
  from public, anon, authenticated;
revoke all on function public.track_follow_created_analytics()
  from public, anon, authenticated;

comment on table public.collaboration_requests is
  'Canonical profile-to-profile collaboration request ledger. Globe, Profile and future pillars share the same source-aware contract.';
comment on function public.request_profile_collaboration(uuid, text, text, text) is
  'Authenticated idempotent collaboration request creation. Direct client writes are denied.';
