create table if not exists public.room_audio_engine_pairing_tickets (
  pairing_id uuid primary key,
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_role text not null check (room_role in ('host', 'guest')),
  web_origin text not null check (char_length(web_origin) between 8 and 512),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint room_audio_engine_pairing_short_lived
    -- Edge-issued tickets live for 60 seconds. The extra 30 seconds only
    -- absorbs clock skew between the function runtime and Postgres; it does
    -- not extend the signed token or the consume endpoint validation.
    check (expires_at > created_at and expires_at <= created_at + interval '90 seconds')
);

create index if not exists room_audio_engine_pairing_expiry_idx
  on public.room_audio_engine_pairing_tickets (expires_at)
  where consumed_at is null;

alter table public.room_audio_engine_pairing_tickets enable row level security;

revoke all on table public.room_audio_engine_pairing_tickets from anon, authenticated;
grant all on table public.room_audio_engine_pairing_tickets to service_role;

comment on table public.room_audio_engine_pairing_tickets is
  'Single-use, short-lived pairing tickets for the native MeeWav Audio Engine. Service role only.';

create or replace function public.issue_room_audio_engine_pairing_ticket(
  p_pairing_id uuid,
  p_room_id uuid,
  p_user_id uuid,
  p_room_role text,
  p_web_origin text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms_v2%rowtype;
  v_recent_count integer;
  v_active_count integer;
begin
  if p_room_role not in ('host', 'guest')
    or length(p_web_origin) not between 8 and 512
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '90 seconds' then
    raise exception 'Invalid audio-engine pairing ticket.' using errcode = '22023';
  end if;

  select * into v_room
  from public.rooms_v2 room
  where room.id = p_room_id
  for update;

  if not found or v_room.type <> 'place' or v_room.status <> 'live' then
    raise exception 'Room unavailable.' using errcode = '55000';
  end if;
  if (p_room_role = 'host' and v_room.host_id <> p_user_id)
    or (p_room_role = 'guest' and not exists (
      select 1
      from public.room_invitations_v2 invitation
      where invitation.room_id = p_room_id
        and invitation.guest_id = p_user_id
        and invitation.status in ('accepted', 'ready', 'backstage', 'onstage')
        and invitation.ended_at is null
    )) then
    raise exception 'Voice processing is not authorized.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_room_id::text, 0));

  delete from public.room_audio_engine_pairing_tickets ticket
  where ticket.user_id = p_user_id
    and ticket.room_id = p_room_id
    and (
      ticket.expires_at < clock_timestamp() - interval '1 day'
      or ticket.consumed_at < clock_timestamp() - interval '1 day'
    );

  select count(*) into v_recent_count
  from public.room_audio_engine_pairing_tickets ticket
  where ticket.user_id = p_user_id
    and ticket.room_id = p_room_id
    and ticket.created_at >= clock_timestamp() - interval '1 minute';

  select count(*) into v_active_count
  from public.room_audio_engine_pairing_tickets ticket
  where ticket.user_id = p_user_id
    and ticket.room_id = p_room_id
    and ticket.consumed_at is null
    and ticket.expires_at > clock_timestamp();

  if v_recent_count >= 6 or v_active_count >= 2 then
    raise exception 'Audio-engine pairing rate limit reached.' using errcode = '42900';
  end if;

  insert into public.room_audio_engine_pairing_tickets (
    pairing_id, room_id, user_id, room_role, web_origin, token_hash, expires_at
  ) values (
    p_pairing_id, p_room_id, p_user_id, p_room_role, p_web_origin, p_token_hash, p_expires_at
  );
end;
$$;

revoke all on function public.issue_room_audio_engine_pairing_ticket(uuid, uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_room_audio_engine_pairing_ticket(uuid, uuid, uuid, text, text, text, timestamptz)
  to service_role;

create or replace function public.consume_room_audio_engine_pairing_ticket(
  p_pairing_id uuid,
  p_token_hash text
)
returns table (
  room_id uuid,
  user_id uuid,
  room_role text,
  web_origin text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.room_audio_engine_pairing_tickets ticket
  set consumed_at = clock_timestamp()
  where ticket.pairing_id = p_pairing_id
    and ticket.token_hash = lower(p_token_hash)
    and ticket.consumed_at is null
    and ticket.expires_at > clock_timestamp()
    and exists (
      select 1
      from public.rooms_v2 room
      where room.id = ticket.room_id
        and room.type = 'place'
        and room.status = 'live'
        and (
          (ticket.room_role = 'host' and room.host_id = ticket.user_id)
          or (
            ticket.room_role = 'guest'
            and exists (
              select 1
              from public.room_invitations_v2 invitation
              where invitation.room_id = ticket.room_id
                and invitation.guest_id = ticket.user_id
                and invitation.status in ('accepted', 'ready', 'backstage', 'onstage')
                and invitation.ended_at is null
            )
          )
        )
    )
  returning ticket.room_id, ticket.user_id, ticket.room_role, ticket.web_origin, ticket.expires_at;
end;
$$;

revoke all on function public.consume_room_audio_engine_pairing_ticket(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_room_audio_engine_pairing_ticket(uuid, text) to service_role;
