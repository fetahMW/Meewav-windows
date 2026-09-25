-- Room gifts: private entrant snapshots, public draw projection and durable awards.
-- The winner is selected atomically when a draw starts, but their identity is
-- copied to the public row only after reveal_at.

create table if not exists public.room_gift_draws_v1 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  gift_code text not null check (char_length(gift_code) between 1 and 80),
  gift_label text not null check (char_length(gift_label) between 1 and 120),
  pool_mode text not null check (pool_mode in ('manual', 'queue', 'room', 'selected')),
  status text not null default 'ready'
    check (status in ('ready', 'scheduled', 'spinning', 'revealed', 'cancelled')),
  -- Product cap: oversized queue/Room/manual pools are uniformly sampled on
  -- the server instead of making the draw fail.
  eligible_count integer not null default 0 check (eligible_count between 0 and 5000),
  animation_duration_seconds integer not null default 7
    check (animation_duration_seconds between 3 and 20),
  scheduled_at timestamptz,
  started_at timestamptz,
  reveal_at timestamptz,
  winner_profile_id uuid references auth.users(id) on delete set null,
  winner_display_name text,
  winner_avatar_url text,
  winner_source text check (winner_source is null or winner_source in ('stage', 'backstage', 'queue', 'manual', 'room')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  revealed_at timestamptz,
  check (
    winner_display_name is null
    or (
      char_length(winner_display_name) between 1 and 120
      and octet_length(winner_display_name) <= 480
    )
  ),
  check (
    winner_avatar_url is null
    or (
      octet_length(winner_avatar_url) <= 2048
      and winner_avatar_url ~ '^https://[^[:space:]]+$'
    )
  ),
  check (reveal_at is null or started_at is not null),
  check (status <> 'revealed' or (winner_display_name is not null and revealed_at is not null))
);

create table if not exists public.room_gift_draw_entries_v1 (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.room_gift_draws_v1(id) on delete cascade,
  profile_id uuid references auth.users(id) on delete set null,
  candidate_key text not null check (
    char_length(candidate_key) between 1 and 180
    and octet_length(candidate_key) <= 512
  ),
  display_name_snapshot text not null check (
    char_length(display_name_snapshot) between 1 and 120
    and octet_length(display_name_snapshot) <= 480
  ),
  avatar_url_snapshot text,
  source text not null check (source in ('stage', 'backstage', 'queue', 'manual', 'room')),
  created_at timestamptz not null default now(),
  unique (draw_id, candidate_key),
  check (
    avatar_url_snapshot is null
    or (
      octet_length(avatar_url_snapshot) <= 2048
      and avatar_url_snapshot ~ '^https://[^[:space:]]+$'
    )
  )
);

create unique index if not exists room_gift_draw_entries_v1_profile_unique
  on public.room_gift_draw_entries_v1(draw_id, profile_id)
  where profile_id is not null;

-- The chosen entry and idempotency token are never placed on the public draw
-- row. This table has no browser grants or RLS policy, including for the Host.
create table if not exists public.room_gift_draw_private_v1 (
  draw_id uuid primary key references public.room_gift_draws_v1(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  selected_entry_id uuid references public.room_gift_draw_entries_v1(id) on delete set null,
  idempotency_key text,
  request_hash text not null,
  created_at timestamptz not null default now(),
  check (
    idempotency_key is null
    or (
      char_length(idempotency_key) between 8 and 128
      and octet_length(idempotency_key) <= 128
    )
  ),
  check (request_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.room_gift_awards_v1 (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid unique references public.room_gift_draws_v1(id) on delete set null,
  draw_id_snapshot uuid not null unique,
  room_id uuid references public.rooms_v2(id) on delete set null,
  room_id_snapshot uuid not null,
  gift_code text not null check (char_length(gift_code) between 1 and 80 and octet_length(gift_code) <= 80),
  gift_label text not null check (char_length(gift_label) between 1 and 120 and octet_length(gift_label) <= 480),
  recipient_profile_id uuid references auth.users(id) on delete set null,
  recipient_display_name_snapshot text not null check (
    char_length(recipient_display_name_snapshot) between 1 and 120
    and octet_length(recipient_display_name_snapshot) <= 480
  ),
  recipient_avatar_url_snapshot text,
  awarded_by uuid references auth.users(id) on delete set null,
  awarded_by_snapshot uuid not null,
  created_at timestamptz not null default now(),
  check (
    recipient_avatar_url_snapshot is null
    or (
      octet_length(recipient_avatar_url_snapshot) <= 2048
      and recipient_avatar_url_snapshot ~ '^https://[^[:space:]]+$'
    )
  )
);

-- Durable direct gifts. Public rows contain only delivery/audit data visible
-- to the sender and recipient; request hashes and idempotency keys stay in the
-- private companion table below.
create table if not exists public.room_gift_deliveries_v1 (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms_v2(id) on delete set null,
  room_id_snapshot uuid not null,
  room_title_snapshot text not null check (
    char_length(room_title_snapshot) between 1 and 160
    and octet_length(room_title_snapshot) <= 640
  ),
  gift_code text not null check (char_length(gift_code) between 1 and 80 and octet_length(gift_code) <= 80),
  gift_label text not null check (char_length(gift_label) between 1 and 120 and octet_length(gift_label) <= 480),
  action text not null check (action in ('send_now', 'schedule', 'round')),
  status text not null check (status in ('sent', 'scheduled', 'ready')),
  round_label text,
  sender_profile_id uuid references auth.users(id) on delete set null,
  sender_profile_id_snapshot uuid not null,
  sender_display_name_snapshot text not null check (
    char_length(sender_display_name_snapshot) between 1 and 120
    and octet_length(sender_display_name_snapshot) <= 480
  ),
  sender_avatar_url_snapshot text,
  recipient_profile_id uuid references auth.users(id) on delete set null,
  recipient_profile_id_snapshot uuid not null,
  recipient_display_name_snapshot text not null check (
    char_length(recipient_display_name_snapshot) between 1 and 120
    and octet_length(recipient_display_name_snapshot) <= 480
  ),
  recipient_avatar_url_snapshot text,
  recipient_source text not null
    check (recipient_source in ('stage', 'backstage', 'queue', 'messaging')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    sender_avatar_url_snapshot is null
    or (
      octet_length(sender_avatar_url_snapshot) <= 2048
      and sender_avatar_url_snapshot ~ '^https://[^[:space:]]+$'
    )
  ),
  check (
    recipient_avatar_url_snapshot is null
    or (
      octet_length(recipient_avatar_url_snapshot) <= 2048
      and recipient_avatar_url_snapshot ~ '^https://[^[:space:]]+$'
    )
  ),
  check (
    round_label is null
    or (
      char_length(round_label) between 1 and 80
      and octet_length(round_label) <= 320
      and round_label !~ '[[:cntrl:]]'
    )
  ),
  check (scheduled_at is null or scheduled_at <= created_at + interval '30 days'),
  check (room_id is null or room_id = room_id_snapshot),
  check (sender_profile_id is null or sender_profile_id = sender_profile_id_snapshot),
  check (recipient_profile_id is null or recipient_profile_id = recipient_profile_id_snapshot),
  check (recipient_profile_id_snapshot <> sender_profile_id_snapshot),
  check (sent_at is null or sent_at >= created_at),
  check (status <> 'scheduled' or scheduled_at > created_at),
  check (
    (action = 'send_now' and status = 'sent' and scheduled_at is null and sent_at is not null and round_label is null)
    or (
      action = 'schedule'
      and scheduled_at is not null
      and round_label is null
      and (
        (status = 'scheduled' and sent_at is null)
        or (status = 'sent' and sent_at is not null)
      )
    )
    or (action = 'round' and status = 'ready' and scheduled_at is null and sent_at is null and round_label is not null)
  )
);

create table if not exists public.room_gift_delivery_private_v1 (
  delivery_id uuid primary key references public.room_gift_deliveries_v1(id) on delete cascade,
  sender_profile_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (
    char_length(idempotency_key) between 8 and 128
    and octet_length(idempotency_key) <= 128
  ),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (sender_profile_id, idempotency_key)
);

-- Machine-readable deployment state. When pg_cron is absent or too old for
-- interval schedules, the migration records an explicit degraded state so an
-- external service scheduler can be configured rather than silently claiming
-- second-level durability.
create table if not exists public.room_gift_draw_scheduler_health_v1 (
  singleton boolean primary key default true check (singleton),
  scheduler_status text not null
    check (scheduler_status in ('pending', 'pg_cron_5_seconds', 'degraded_external_scheduler_required')),
  scheduler_detail text not null check (octet_length(scheduler_detail) <= 1000),
  checked_at timestamptz not null default now()
);

create unique index if not exists room_gift_draws_v1_active_room_unique
  on public.room_gift_draws_v1(room_id)
  where status in ('ready', 'scheduled', 'spinning');

create unique index if not exists room_gift_draw_private_v1_idempotency_unique
  on public.room_gift_draw_private_v1(host_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists room_gift_draws_v1_room_created_idx
  on public.room_gift_draws_v1(room_id, created_at desc);
create index if not exists room_gift_draws_v1_due_scheduled_idx
  on public.room_gift_draws_v1(scheduled_at)
  where status = 'scheduled';
create index if not exists room_gift_draws_v1_due_reveal_idx
  on public.room_gift_draws_v1(reveal_at)
  where status = 'spinning';
create index if not exists room_gift_draws_v1_terminal_cleanup_idx
  on public.room_gift_draws_v1(status, updated_at)
  where status in ('revealed', 'cancelled');
create index if not exists room_gift_draw_private_v1_host_created_idx
  on public.room_gift_draw_private_v1(host_id, created_at desc);
create index if not exists room_gift_awards_v1_recipient_created_idx
  on public.room_gift_awards_v1(recipient_profile_id, created_at desc);
create index if not exists room_gift_awards_v1_awarded_by_created_idx
  on public.room_gift_awards_v1(awarded_by, created_at desc);
create index if not exists room_gift_deliveries_v1_sender_created_idx
  on public.room_gift_deliveries_v1(sender_profile_id, created_at desc);
create index if not exists room_gift_deliveries_v1_recipient_created_idx
  on public.room_gift_deliveries_v1(recipient_profile_id, created_at desc);
create index if not exists room_gift_deliveries_v1_room_created_idx
  on public.room_gift_deliveries_v1(room_id_snapshot, created_at desc);
create index if not exists room_gift_deliveries_v1_due_idx
  on public.room_gift_deliveries_v1(scheduled_at)
  where status = 'scheduled';
create index if not exists room_gift_delivery_private_v1_sender_created_idx
  on public.room_gift_delivery_private_v1(sender_profile_id, created_at desc);

alter table public.room_gift_draws_v1 enable row level security;
alter table public.room_gift_draw_entries_v1 enable row level security;
alter table public.room_gift_draw_private_v1 enable row level security;
alter table public.room_gift_awards_v1 enable row level security;
alter table public.room_gift_deliveries_v1 enable row level security;
alter table public.room_gift_delivery_private_v1 enable row level security;
alter table public.room_gift_draw_scheduler_health_v1 enable row level security;

drop policy if exists room_gift_draws_v1_public_read on public.room_gift_draws_v1;
create policy room_gift_draws_v1_public_read
on public.room_gift_draws_v1 for select
using (
  exists (
    select 1 from public.rooms_v2 room
    where room.id = room_gift_draws_v1.room_id
      and room.status = 'live'
  )
  and (
    room_gift_draws_v1.status in ('ready', 'scheduled', 'spinning')
    or (
      room_gift_draws_v1.status = 'revealed'
      and room_gift_draws_v1.revealed_at is not null
      and room_gift_draws_v1.revealed_at <= now()
      and room_gift_draws_v1.revealed_at > now() - interval '2 minutes'
    )
  )
);

drop policy if exists room_gift_awards_v1_owner_read on public.room_gift_awards_v1;
create policy room_gift_awards_v1_owner_read
on public.room_gift_awards_v1 for select to authenticated
using (awarded_by = auth.uid() or recipient_profile_id = auth.uid());

drop policy if exists room_gift_deliveries_v1_participant_read on public.room_gift_deliveries_v1;
create policy room_gift_deliveries_v1_participant_read
on public.room_gift_deliveries_v1 for select to authenticated
using (
  sender_profile_id = auth.uid()
  or (recipient_profile_id = auth.uid() and status = 'sent')
);

revoke all on table public.room_gift_draws_v1 from public, anon, authenticated;
revoke all on table public.room_gift_draw_entries_v1 from public, anon, authenticated;
revoke all on table public.room_gift_draw_private_v1 from public, anon, authenticated;
revoke all on table public.room_gift_awards_v1 from public, anon, authenticated;
revoke all on table public.room_gift_deliveries_v1 from public, anon, authenticated;
revoke all on table public.room_gift_delivery_private_v1 from public, anon, authenticated;
revoke all on table public.room_gift_draw_scheduler_health_v1 from public, anon, authenticated;
grant select on table public.room_gift_draws_v1 to anon, authenticated;
grant select on table public.room_gift_awards_v1 to authenticated;
grant select on table public.room_gift_deliveries_v1 to authenticated;
grant all on table public.room_gift_draws_v1, public.room_gift_draw_entries_v1, public.room_gift_draw_private_v1, public.room_gift_awards_v1 to service_role;
grant all on table public.room_gift_deliveries_v1, public.room_gift_delivery_private_v1 to service_role;
grant select, insert, update on table public.room_gift_draw_scheduler_health_v1 to service_role;

create or replace function public.rooms_create_gift_draw_v1(
  p_room_id uuid,
  p_gift_code text,
  p_gift_label text,
  p_pool_mode text,
  p_candidates jsonb default '[]'::jsonb,
  p_scheduled_at timestamptz default null,
  p_animation_duration_seconds integer default 7,
  p_idempotency_key text default null
)
returns setof public.room_gift_draws_v1
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_host_id uuid := auth.uid();
  v_draw public.room_gift_draws_v1%rowtype;
  v_secret public.room_gift_draw_private_v1%rowtype;
  v_draw_id uuid;
  v_candidate_count integer;
  v_candidates jsonb := coalesce(p_candidates, '[]'::jsonb);
  v_pool_mode text := lower(btrim(coalesce(p_pool_mode, '')));
  v_gift_code text := btrim(coalesce(p_gift_code, ''));
  v_gift_label text;
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_animation_duration integer := greatest(3, least(20, coalesce(p_animation_duration_seconds, 7)));
  v_effective_scheduled_at timestamptz;
  v_request_hash text;
begin
  if v_host_id is null then
    raise exception using errcode = '42501', message = 'rooms_gift_draw_authentication_required';
  end if;
  if p_room_id is null then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_room_required';
  end if;
  if v_pool_mode not in ('manual', 'queue', 'room', 'selected') then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_pool_mode_invalid';
  end if;
  v_gift_label := case v_gift_code
    when 'force-card' then 'Carte de Force'
    when 'vip-pass' then 'Pass VIP'
    when 'private-access' then 'Accès privé'
    when 'golden-like' then 'Golden Like'
    when 'supporter-bonus' then 'Bonus supporter'
    when 'la-certif' then 'La Certif'
    else null
  end;
  if v_gift_label is null then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_gift_not_allowed';
  end if;
  if p_gift_label is not null and octet_length(p_gift_label) > 480 then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_gift_label_too_large';
  end if;
  if btrim(coalesce(p_gift_label, '')) <> v_gift_label then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_gift_label_mismatch';
  end if;
  if p_scheduled_at is not null and p_scheduled_at > now() + interval '30 days' then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_schedule_beyond_30_days';
  end if;
  if p_idempotency_key is not null and (
    v_idempotency_key is null
    or char_length(v_idempotency_key) not between 8 and 128
    or octet_length(v_idempotency_key) > 128
  ) then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_idempotency_key_invalid';
  end if;
  if jsonb_typeof(v_candidates) <> 'array' then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_candidates_must_be_array';
  end if;

  -- Reject unauthorised callers before measuring, traversing or hashing a
  -- potentially large candidate payload.
  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = p_room_id
      and room.host_id = v_host_id
      and room.status = 'live'
  ) then
    raise exception using errcode = '42501', message = 'rooms_gift_draw_live_host_required';
  end if;

  if octet_length(v_candidates::text) > 1048576 then
    raise exception using errcode = '54000', message = 'rooms_gift_draw_candidates_payload_exceeds_1_mib';
  end if;
  if jsonb_array_length(v_candidates) > 10000 then
    raise exception using errcode = '54000', message = 'rooms_gift_draw_candidate_input_cap_10000';
  end if;
  if v_pool_mode in ('queue', 'room') and jsonb_array_length(v_candidates) <> 0 then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_server_pool_rejects_client_candidates';
  end if;
  if v_pool_mode in ('manual', 'selected') and jsonb_array_length(v_candidates) = 0 then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_candidates_required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_candidates) candidate(value)
    where jsonb_typeof(candidate.value) <> 'object'
      or (
        candidate.value ? 'profile_id'
        and candidate.value -> 'profile_id' <> 'null'::jsonb
        and (
          jsonb_typeof(candidate.value -> 'profile_id') <> 'string'
          or coalesce(candidate.value ->> 'profile_id', '')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
      or (
        candidate.value ? 'display_name'
        and candidate.value -> 'display_name' <> 'null'::jsonb
        and (
          jsonb_typeof(candidate.value -> 'display_name') <> 'string'
          or char_length(btrim(coalesce(candidate.value ->> 'display_name', ''))) > 120
          or octet_length(btrim(coalesce(candidate.value ->> 'display_name', ''))) > 480
        )
      )
      or (
        candidate.value ? 'avatar_url'
        and candidate.value -> 'avatar_url' <> 'null'::jsonb
        and (
          jsonb_typeof(candidate.value -> 'avatar_url') <> 'string'
          or octet_length(btrim(coalesce(candidate.value ->> 'avatar_url', ''))) > 2048
          or btrim(coalesce(candidate.value ->> 'avatar_url', '')) !~ '^https://[^[:space:]]+$'
        )
      )
      or (
        candidate.value ? 'key'
        and candidate.value -> 'key' <> 'null'::jsonb
        and (
          jsonb_typeof(candidate.value -> 'key') <> 'string'
          or octet_length(btrim(coalesce(candidate.value ->> 'key', ''))) > 512
        )
      )
      or (
        candidate.value ? 'source'
        and candidate.value -> 'source' <> 'null'::jsonb
        and (
          jsonb_typeof(candidate.value -> 'source') <> 'string'
          or coalesce(candidate.value ->> 'source', '') not in ('stage', 'backstage', 'queue', 'manual', 'room')
        )
      )
      or (
        v_pool_mode = 'manual'
        and (
          nullif(candidate.value ->> 'profile_id', '') is not null
          or char_length(btrim(coalesce(candidate.value ->> 'display_name', ''))) not between 1 and 120
          or (
            candidate.value ? 'avatar_url'
            and candidate.value -> 'avatar_url' <> 'null'::jsonb
          )
        )
      )
      or (
        v_pool_mode = 'selected'
        and nullif(candidate.value ->> 'profile_id', '') is null
      )
  ) then
    raise exception using errcode = '22023', message = 'rooms_gift_draw_candidate_shape_invalid';
  end if;

  v_effective_scheduled_at := case
    when p_scheduled_at is not null and p_scheduled_at > now() then p_scheduled_at
    else null
  end;
  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'room_id', p_room_id,
    'gift_code', v_gift_code,
    'gift_label', v_gift_label,
    'pool_mode', v_pool_mode,
    'candidates', v_candidates,
    'scheduled_at_epoch', case when p_scheduled_at is null then null else extract(epoch from p_scheduled_at)::text end,
    'animation_duration_seconds', v_animation_duration
  )::text, 'UTF8'), 'sha256'), 'hex');

  -- Host and Room locks make the rate limits exact under concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms-gift-draw-host:' || v_host_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms-gift-draw-room:' || p_room_id::text,
    0
  ));

  if v_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'rooms-gift-draw-key:' || v_host_id::text || ':' || v_idempotency_key,
      0
    ));
    select * into v_secret
    from public.room_gift_draw_private_v1 secret
    where secret.host_id = v_host_id
      and secret.idempotency_key = v_idempotency_key;
    if v_secret.draw_id is not null then
      select * into v_draw
      from public.room_gift_draws_v1 draw
      where draw.id = v_secret.draw_id;
      if v_draw.id is null
         or v_draw.room_id is distinct from p_room_id
         or v_secret.request_hash <> v_request_hash then
        raise exception using errcode = '23505', message = 'rooms_gift_draw_idempotency_conflict';
      end if;
      return next v_draw;
      return;
    end if;
  end if;

  if (
    select count(*)
    from public.room_gift_draw_private_v1 secret
    where secret.host_id = v_host_id
      and secret.created_at >= now() - interval '1 hour'
  ) >= 30 then
    raise exception using errcode = '54000', message = 'rooms_gift_draw_host_hourly_rate_limit';
  end if;
  if (
    select count(*)
    from public.room_gift_draw_private_v1 secret
    where secret.host_id = v_host_id
      and secret.created_at >= now() - interval '24 hours'
  ) >= 200 then
    raise exception using errcode = '54000', message = 'rooms_gift_draw_host_daily_quota';
  end if;
  if (
    select count(*)
    from public.room_gift_draws_v1 draw
    where draw.room_id = p_room_id
      and draw.created_at >= now() - interval '1 hour'
  ) >= 12 then
    raise exception using errcode = '54000', message = 'rooms_gift_draw_room_hourly_rate_limit';
  end if;
  if (
    select count(*)
    from public.room_gift_draws_v1 draw
    where draw.room_id = p_room_id
      and draw.created_at >= now() - interval '24 hours'
  ) >= 50 then
    raise exception using errcode = '54000', message = 'rooms_gift_draw_room_daily_quota';
  end if;
  if v_effective_scheduled_at is not null and (
    select count(*)
    from public.room_gift_draw_private_v1 secret
    join public.room_gift_draws_v1 draw on draw.id = secret.draw_id
    where secret.host_id = v_host_id
      and draw.status = 'scheduled'
  ) >= 20 then
    raise exception using errcode = '54000', message = 'rooms_gift_draw_host_scheduled_quota';
  end if;

  if exists (
    select 1 from public.room_gift_draws_v1 draw
    where draw.room_id = p_room_id
      and draw.status in ('ready', 'scheduled', 'spinning')
  ) then
    raise exception using errcode = '55000', message = 'rooms_gift_draw_room_already_active';
  end if;

  insert into public.room_gift_draws_v1 (
    room_id, gift_code, gift_label, pool_mode, status,
    scheduled_at, animation_duration_seconds
  ) values (
    p_room_id,
    v_gift_code,
    v_gift_label,
    v_pool_mode,
    case when v_effective_scheduled_at is not null then 'scheduled' else 'ready' end,
    v_effective_scheduled_at,
    v_animation_duration
  ) returning id into v_draw_id;

  insert into public.room_gift_draw_private_v1 (draw_id, host_id, idempotency_key, request_hash)
  values (v_draw_id, v_host_id, v_idempotency_key, v_request_hash);

  if v_pool_mode = 'queue' then
    insert into public.room_gift_draw_entries_v1 (
      draw_id, profile_id, candidate_key, display_name_snapshot, avatar_url_snapshot, source
    )
    with eligible as materialized (
      select distinct queued.user_id
      from public.room_queue_v2 queued
      where queued.room_id = p_room_id
        and queued.removed_at is null
        and queued.user_id <> v_host_id
    ), sampled as materialized (
      select eligible.user_id
      from eligible
      order by gen_random_uuid()
      limit 5000
    )
    select
      v_draw_id,
      sampled.user_id,
      'profile:' || sampled.user_id::text,
      left(coalesce(nullif(trim(profile.display_name), ''), nullif(trim(profile.username), ''), 'Participant MeeWav'), 120),
      case
        when octet_length(coalesce(profile.profile_image_url, '')) <= 2048
          and profile.profile_image_url ~ '^https://[^[:space:]]+$' then profile.profile_image_url
        when octet_length(coalesce(profile.avatar_url, '')) <= 2048
          and profile.avatar_url ~ '^https://[^[:space:]]+$' then profile.avatar_url
        else null
      end,
      'queue'
    from sampled
    left join public.public_profiles profile on profile.id = sampled.user_id
    on conflict do nothing;
  elsif v_pool_mode = 'room' then
    insert into public.room_gift_draw_entries_v1 (
      draw_id, profile_id, candidate_key, display_name_snapshot, avatar_url_snapshot, source
    )
    with eligible as materialized (
      select distinct participant.user_id
      from public.room_participants_v2 participant
      where participant.room_id = p_room_id
        and participant.left_at is null
        and participant.user_id <> v_host_id
    ), sampled as materialized (
      select eligible.user_id
      from eligible
      order by gen_random_uuid()
      limit 5000
    )
    select
      v_draw_id,
      sampled.user_id,
      'profile:' || sampled.user_id::text,
      left(coalesce(nullif(trim(profile.display_name), ''), nullif(trim(profile.username), ''), 'Participant MeeWav'), 120),
      case
        when octet_length(coalesce(profile.profile_image_url, '')) <= 2048
          and profile.profile_image_url ~ '^https://[^[:space:]]+$' then profile.profile_image_url
        when octet_length(coalesce(profile.avatar_url, '')) <= 2048
          and profile.avatar_url ~ '^https://[^[:space:]]+$' then profile.avatar_url
        else null
      end,
      'room'
    from sampled
    left join public.public_profiles profile on profile.id = sampled.user_id
    on conflict do nothing;
  else
    with supplied as (
      select
        candidate.value,
        candidate.ordinality,
        case
          when nullif(candidate.value ->> 'profile_id', '') is not null
          then (candidate.value ->> 'profile_id')::uuid
          else null
        end as profile_id
      from jsonb_array_elements(v_candidates) with ordinality candidate(value, ordinality)
    ), eligible as (
      select supplied.*
      from supplied
      where (v_pool_mode = 'manual' and supplied.profile_id is null)
        or (
          v_pool_mode = 'selected'
          and supplied.profile_id is not null
          and supplied.profile_id <> v_host_id
          and (
            exists (
              select 1 from public.room_participants_v2 participant
              where participant.room_id = p_room_id
                and participant.user_id = supplied.profile_id
                and participant.left_at is null
            )
            or exists (
              select 1 from public.room_queue_v2 queued
              where queued.room_id = p_room_id
                and queued.user_id = supplied.profile_id
                and queued.removed_at is null
            )
          )
        )
    ), deduplicated as (
      select eligible.*,
        row_number() over (
          partition by coalesce(
            eligible.profile_id::text,
            'manual:' || lower(btrim(eligible.value ->> 'display_name'))
          )
          order by eligible.ordinality
        ) as duplicate_rank
      from eligible
    ), sampled as materialized (
      select deduplicated.*
      from deduplicated
      where deduplicated.duplicate_rank = 1
      order by gen_random_uuid()
      limit 5000
    )
    insert into public.room_gift_draw_entries_v1 (
      draw_id, profile_id, candidate_key, display_name_snapshot, avatar_url_snapshot, source
    )
    select
      v_draw_id,
      sampled.profile_id,
      case
        when sampled.profile_id is not null then 'profile:' || sampled.profile_id::text
        else 'manual:' || encode(extensions.digest(
          convert_to(lower(btrim(sampled.value ->> 'display_name')), 'UTF8'),
          'sha256'
        ), 'hex')
      end,
      left(coalesce(nullif(trim(profile.display_name), ''), nullif(trim(sampled.value ->> 'display_name'), ''), 'Participant MeeWav'), 120),
      case
        -- Candidate avatars are never trusted: manual entries stay anonymous and
        -- selected profiles can only use the server-owned public projection.
        when sampled.profile_id is null then null
        when octet_length(coalesce(profile.profile_image_url, '')) <= 2048
          and profile.profile_image_url ~ '^https://[^[:space:]]+$' then profile.profile_image_url
        when octet_length(coalesce(profile.avatar_url, '')) <= 2048
          and profile.avatar_url ~ '^https://[^[:space:]]+$' then profile.avatar_url
        else null
      end,
      case
        when sampled.profile_id is null then 'manual'
        when sampled.value ->> 'source' in ('stage', 'backstage', 'queue', 'room')
          then sampled.value ->> 'source'
        else 'room'
      end
    from sampled
    left join public.public_profiles profile on profile.id = sampled.profile_id
    on conflict do nothing;
  end if;

  select count(*)::integer into v_candidate_count
  from public.room_gift_draw_entries_v1 entry
  where entry.draw_id = v_draw_id;

  if v_candidate_count < 1 then
    delete from public.room_gift_draws_v1 where id = v_draw_id;
    raise exception using errcode = '22023', message = 'rooms_gift_draw_no_eligible_candidate';
  end if;

  update public.room_gift_draws_v1
  set eligible_count = v_candidate_count, updated_at = now()
  where id = v_draw_id
  returning * into v_draw;
  return next v_draw;
end;
$$;

create or replace function public.rooms_start_gift_draw_v1(p_draw_id uuid)
returns setof public.room_gift_draws_v1
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_draw public.room_gift_draws_v1%rowtype;
  v_private public.room_gift_draw_private_v1%rowtype;
  v_entry_id uuid;
begin
  select * into v_draw
  from public.room_gift_draws_v1 draw
  where draw.id = p_draw_id
  for update;
  if v_draw.id is null then raise exception 'Tirage introuvable'; end if;
  select * into v_private
  from public.room_gift_draw_private_v1 private
  where private.draw_id = v_draw.id;
  if v_private.draw_id is null or v_private.host_id <> v_user_id then raise exception 'Seul le Host peut lancer le tirage'; end if;
  if v_draw.status in ('revealed', 'cancelled') then
    return next v_draw;
    return;
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = v_draw.room_id and room.status = 'live'
  ) then
    update public.room_gift_draws_v1
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = v_draw.id
    returning * into v_draw;
    return next v_draw;
    return;
  end if;
  if v_draw.status = 'spinning' then
    return next v_draw;
    return;
  end if;
  if v_draw.status = 'scheduled' and v_draw.scheduled_at > now() then
    raise exception 'Le tirage est programmé pour plus tard';
  end if;

  select entry.id into v_entry_id
  from public.room_gift_draw_entries_v1 entry
  where entry.draw_id = v_draw.id
  order by gen_random_uuid()
  limit 1;
  if v_entry_id is null then raise exception 'Aucune personne éligible'; end if;

  update public.room_gift_draw_private_v1
  set selected_entry_id = v_entry_id
  where draw_id = v_draw.id;

  update public.room_gift_draws_v1
  set status = 'spinning',
      started_at = now(), reveal_at = now() + make_interval(secs => animation_duration_seconds),
      updated_at = now()
  where id = v_draw.id
  returning * into v_draw;
  return next v_draw;
end;
$$;

create or replace function public.rooms_reveal_gift_draw_v1(p_draw_id uuid)
returns setof public.room_gift_draws_v1
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_draw public.room_gift_draws_v1%rowtype;
  v_private public.room_gift_draw_private_v1%rowtype;
  v_entry public.room_gift_draw_entries_v1%rowtype;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;
  select * into v_draw
  from public.room_gift_draws_v1 draw
  where draw.id = p_draw_id
  for update;
  if v_draw.id is null then raise exception 'Tirage introuvable'; end if;
  if v_draw.status in ('revealed', 'cancelled') then
    return next v_draw;
    return;
  end if;
  if v_draw.status <> 'spinning' or v_draw.reveal_at > now() then
    raise exception 'La révélation n’est pas encore disponible';
  end if;
  select * into v_private
  from public.room_gift_draw_private_v1 private
  where private.draw_id = v_draw.id;
  if v_private.draw_id is null or v_private.host_id <> v_user_id then
    raise exception 'Seul le Host peut révéler le tirage';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = v_draw.room_id and room.status = 'live'
  ) then
    update public.room_gift_draws_v1
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = v_draw.id
    returning * into v_draw;
    return next v_draw;
    return;
  end if;

  select * into v_entry
  from public.room_gift_draw_entries_v1 entry
  where entry.id = v_private.selected_entry_id;
  if v_entry.id is null then raise exception 'Résultat du tirage introuvable'; end if;

  update public.room_gift_draws_v1
  set status = 'revealed',
      winner_profile_id = v_entry.profile_id,
      winner_display_name = v_entry.display_name_snapshot,
      winner_avatar_url = v_entry.avatar_url_snapshot,
      winner_source = v_entry.source,
      revealed_at = now(), updated_at = now()
  where id = v_draw.id
  returning * into v_draw;

  insert into public.room_gift_awards_v1 (
    draw_id, draw_id_snapshot, room_id, room_id_snapshot,
    gift_code, gift_label, recipient_profile_id,
    recipient_display_name_snapshot, recipient_avatar_url_snapshot,
    awarded_by, awarded_by_snapshot
  ) values (
    v_draw.id, v_draw.id, v_draw.room_id, v_draw.room_id,
    v_draw.gift_code, v_draw.gift_label, v_entry.profile_id,
    v_entry.display_name_snapshot, v_entry.avatar_url_snapshot,
    v_private.host_id, v_private.host_id
  ) on conflict (draw_id_snapshot) do nothing;

  return next v_draw;
end;
$$;

create or replace function public.rooms_cancel_gift_draw_v1(p_draw_id uuid)
returns setof public.room_gift_draws_v1
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_draw public.room_gift_draws_v1%rowtype;
  v_private public.room_gift_draw_private_v1%rowtype;
begin
  select * into v_draw
  from public.room_gift_draws_v1 draw
  where draw.id = p_draw_id
  for update;
  if v_draw.id is null then raise exception 'Tirage introuvable'; end if;
  select * into v_private
  from public.room_gift_draw_private_v1 private
  where private.draw_id = v_draw.id;
  if v_private.draw_id is null or v_private.host_id <> v_user_id then raise exception 'Seul le Host peut annuler le tirage'; end if;
  if v_draw.status in ('cancelled', 'revealed') then
    return next v_draw;
    return;
  end if;
  update public.room_gift_draws_v1
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = v_draw.id
  returning * into v_draw;
  return next v_draw;
end;
$$;

create or replace function public.rooms_submit_gift_v1(
  p_room_id uuid,
  p_gift_code text,
  p_gift_label text,
  p_recipient_profile_id uuid,
  p_action text default 'send_now',
  p_scheduled_at timestamptz default null,
  p_round_label text default null,
  p_idempotency_key text default null
)
returns setof public.room_gift_deliveries_v1
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_host_id uuid := auth.uid();
  v_room public.rooms_v2%rowtype;
  v_sender public.profiles%rowtype;
  v_recipient public.profiles%rowtype;
  v_delivery public.room_gift_deliveries_v1%rowtype;
  v_secret public.room_gift_delivery_private_v1%rowtype;
  v_gift_code text := btrim(coalesce(p_gift_code, ''));
  v_gift_label text;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_round_label text := nullif(btrim(coalesce(p_round_label, '')), '');
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_recipient_source text;
  v_request_hash text;
  v_sender_name text;
  v_sender_avatar text;
  v_recipient_name text;
  v_recipient_avatar text;
begin
  if v_host_id is null then
    raise exception using errcode = '42501', message = 'rooms_gift_delivery_authentication_required';
  end if;
  if p_room_id is null then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_room_required';
  end if;
  if p_recipient_profile_id is null or p_recipient_profile_id = v_host_id then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_recipient_invalid';
  end if;

  v_gift_label := case v_gift_code
    when 'force-card' then 'Carte de Force'
    when 'vip-pass' then 'Pass VIP'
    when 'private-access' then 'Accès privé'
    when 'golden-like' then 'Golden Like'
    when 'supporter-bonus' then 'Bonus supporter'
    when 'la-certif' then 'La Certif'
    else null
  end;
  if v_gift_label is null then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_gift_not_allowed';
  end if;
  if octet_length(coalesce(p_gift_label, '')) > 480
     or btrim(coalesce(p_gift_label, '')) <> v_gift_label then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_gift_label_mismatch';
  end if;
  if v_action not in ('send_now', 'schedule', 'round') then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_action_invalid';
  end if;
  if v_idempotency_key is null
     or char_length(v_idempotency_key) not between 8 and 128
     or octet_length(v_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_idempotency_key_invalid';
  end if;

  if v_action = 'schedule' then
    if p_scheduled_at is null
       or p_scheduled_at > now() + interval '30 days' then
      raise exception using errcode = '22023', message = 'rooms_gift_delivery_schedule_invalid';
    end if;
  elsif p_scheduled_at is not null then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_schedule_action_mismatch';
  end if;

  if v_action = 'round' then
    if v_round_label is null
       or char_length(v_round_label) > 80
       or octet_length(v_round_label) > 320
       or v_round_label ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'rooms_gift_delivery_round_label_invalid';
    end if;
  elsif v_round_label is not null then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_round_label_action_mismatch';
  end if;

  select * into v_room
  from public.rooms_v2 room
  where room.id = p_room_id
    and room.host_id = v_host_id;
  if v_room.id is null then
    raise exception using errcode = '42501', message = 'rooms_gift_delivery_live_host_required';
  end if;

  v_request_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'room_id', p_room_id,
    'gift_code', v_gift_code,
    'gift_label', v_gift_label,
    'recipient_profile_id', p_recipient_profile_id,
    'action', v_action,
    'scheduled_at_epoch', case when p_scheduled_at is null then null else extract(epoch from p_scheduled_at)::text end,
    'round_label', v_round_label
  )::text, 'UTF8'), 'sha256'), 'hex');

  -- Shared gift locks keep Host/Room quotas exact under concurrent draw and
  -- direct-delivery requests.
  perform pg_advisory_xact_lock(hashtextextended('rooms-gift-draw-host:' || v_host_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('rooms-gift-draw-room:' || p_room_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms-gift-delivery-key:' || v_host_id::text || ':' || v_idempotency_key,
    0
  ));

  select * into v_secret
  from public.room_gift_delivery_private_v1 secret
  where secret.sender_profile_id = v_host_id
    and secret.idempotency_key = v_idempotency_key;
  if v_secret.delivery_id is not null then
    select * into v_delivery
    from public.room_gift_deliveries_v1 delivery
    where delivery.id = v_secret.delivery_id;
    if v_delivery.id is null
       or v_delivery.room_id_snapshot is distinct from p_room_id
       or v_secret.request_hash <> v_request_hash then
      raise exception using errcode = '23505', message = 'rooms_gift_delivery_idempotency_conflict';
    end if;
    return next v_delivery;
    return;
  end if;

  if v_room.status <> 'live' then
    raise exception using errcode = '42501', message = 'rooms_gift_delivery_live_host_required';
  end if;
  if v_action = 'schedule' and p_scheduled_at <= now() then
    raise exception using errcode = '22023', message = 'rooms_gift_delivery_schedule_invalid';
  end if;

  select * into v_sender from public.profiles profile where profile.id = v_host_id;
  select * into v_recipient from public.profiles profile where profile.id = p_recipient_profile_id;
  if v_sender.id is null or v_recipient.id is null then
    raise exception using errcode = '23503', message = 'rooms_gift_delivery_profile_not_found';
  end if;

  v_recipient_source := case
    when exists (
      select 1 from public.room_invitations_v2 invitation
      where invitation.room_id = p_room_id
        and invitation.guest_id = p_recipient_profile_id
        and invitation.status = 'onstage'
    ) then 'stage'
    when exists (
      select 1 from public.room_invitations_v2 invitation
      where invitation.room_id = p_room_id
        and invitation.guest_id = p_recipient_profile_id
        and invitation.status = 'backstage'
    ) then 'backstage'
    when exists (
      select 1 from public.room_queue_v2 queued
      where queued.room_id = p_room_id
        and queued.user_id = p_recipient_profile_id
        and queued.removed_at is null
    ) then 'queue'
    when exists (
      select 1
      from public.messaging_conversations conversation
      join public.messaging_direct_pairs pair on pair.conversation_id = conversation.id
      join public.messaging_conversation_members sender_member
        on sender_member.conversation_id = conversation.id
       and sender_member.profile_id = v_host_id
       and sender_member.membership_status = 'active'
       and sender_member.left_at is null
      join public.messaging_conversation_members recipient_member
        on recipient_member.conversation_id = conversation.id
       and recipient_member.profile_id = p_recipient_profile_id
       and recipient_member.membership_status = 'active'
       and recipient_member.left_at is null
      where conversation.kind = 'direct'
        and conversation.deleted_at is null
        and (
          (pair.profile_low_id = v_host_id and pair.profile_high_id = p_recipient_profile_id)
          or (pair.profile_high_id = v_host_id and pair.profile_low_id = p_recipient_profile_id)
        )
        and not public.messaging_profiles_blocked_v1(v_host_id, p_recipient_profile_id)
    ) then 'messaging'
    else null
  end;
  if v_recipient_source is null then
    raise exception using errcode = '42501', message = 'rooms_gift_delivery_recipient_not_eligible';
  end if;

  v_sender_name := left(coalesce(
    nullif(btrim(v_sender.display_name), ''),
    nullif(btrim(v_sender.username), ''),
    nullif(btrim(v_sender.avatar_name), ''),
    'Host MeeWav'
  ), 120);
  v_recipient_name := left(coalesce(
    nullif(btrim(v_recipient.display_name), ''),
    nullif(btrim(v_recipient.username), ''),
    nullif(btrim(v_recipient.avatar_name), ''),
    'Membre MeeWav'
  ), 120);
  v_sender_avatar := case
    when octet_length(coalesce(v_sender.profile_image_url, '')) <= 2048
      and v_sender.profile_image_url ~ '^https://[^[:space:]]+$' then v_sender.profile_image_url
    when octet_length(coalesce(v_sender.avatar_url, '')) <= 2048
      and v_sender.avatar_url ~ '^https://[^[:space:]]+$' then v_sender.avatar_url
    else null
  end;
  v_recipient_avatar := case
    when octet_length(coalesce(v_recipient.profile_image_url, '')) <= 2048
      and v_recipient.profile_image_url ~ '^https://[^[:space:]]+$' then v_recipient.profile_image_url
    when octet_length(coalesce(v_recipient.avatar_url, '')) <= 2048
      and v_recipient.avatar_url ~ '^https://[^[:space:]]+$' then v_recipient.avatar_url
    else null
  end;

  if (
    select count(*) from public.room_gift_delivery_private_v1 secret
    where secret.sender_profile_id = v_host_id
      and secret.created_at >= now() - interval '1 hour'
  ) >= 30 then
    raise exception using errcode = '54000', message = 'rooms_gift_delivery_host_hourly_rate_limit';
  end if;
  if (
    select count(*) from public.room_gift_delivery_private_v1 secret
    where secret.sender_profile_id = v_host_id
      and secret.created_at >= now() - interval '24 hours'
  ) >= 200 then
    raise exception using errcode = '54000', message = 'rooms_gift_delivery_host_daily_quota';
  end if;
  if (
    select count(*) from public.room_gift_deliveries_v1 delivery
    where delivery.room_id_snapshot = p_room_id
      and delivery.created_at >= now() - interval '1 hour'
  ) >= 12 then
    raise exception using errcode = '54000', message = 'rooms_gift_delivery_room_hourly_rate_limit';
  end if;
  if (
    select count(*) from public.room_gift_deliveries_v1 delivery
    where delivery.room_id_snapshot = p_room_id
      and delivery.created_at >= now() - interval '24 hours'
  ) >= 50 then
    raise exception using errcode = '54000', message = 'rooms_gift_delivery_room_daily_quota';
  end if;
  if v_action = 'schedule' and (
    select count(*) from public.room_gift_delivery_private_v1 secret
    join public.room_gift_deliveries_v1 delivery on delivery.id = secret.delivery_id
    where secret.sender_profile_id = v_host_id
      and delivery.status = 'scheduled'
  ) >= 20 then
    raise exception using errcode = '54000', message = 'rooms_gift_delivery_host_scheduled_quota';
  end if;

  insert into public.room_gift_deliveries_v1 (
    room_id, room_id_snapshot, room_title_snapshot,
    gift_code, gift_label, action, status, round_label,
    sender_profile_id, sender_profile_id_snapshot,
    sender_display_name_snapshot, sender_avatar_url_snapshot,
    recipient_profile_id, recipient_profile_id_snapshot,
    recipient_display_name_snapshot, recipient_avatar_url_snapshot,
    recipient_source, scheduled_at, sent_at
  ) values (
    v_room.id, v_room.id,
    left(coalesce(nullif(btrim(v_room.title), ''), 'Room MeeWav'), 160),
    v_gift_code, v_gift_label, v_action,
    case v_action when 'send_now' then 'sent' when 'schedule' then 'scheduled' else 'ready' end,
    v_round_label,
    v_host_id, v_host_id, v_sender_name, v_sender_avatar,
    p_recipient_profile_id, p_recipient_profile_id,
    v_recipient_name, v_recipient_avatar, v_recipient_source,
    case when v_action = 'schedule' then p_scheduled_at else null end,
    case when v_action = 'send_now' then now() else null end
  ) returning * into v_delivery;

  insert into public.room_gift_delivery_private_v1 (
    delivery_id, sender_profile_id, idempotency_key, request_hash
  ) values (
    v_delivery.id, v_host_id, v_idempotency_key, v_request_hash
  );

  return next v_delivery;
end;
$$;

-- Private entrant snapshots have a deliberately shorter lifetime than the
-- public draw projection and immutable award ledger. This function is invoked
-- by a trusted scheduler and remains safe to retry.
create or replace function public.rooms_purge_gift_draw_snapshots_v1(p_limit integer default 500)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch_limit integer := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_deleted_entries integer := 0;
  v_deleted_private integer := 0;
  v_deleted_delivery_private integer := 0;
  v_deleted_draws integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'rooms_gift_draw_service_role_required';
  end if;

  -- Entrants are no longer needed after a terminal draw. Cancelled pools are
  -- retained 48 hours for support; revealed pools seven days for audit.
  with targets as materialized (
    select draw.id
    from public.room_gift_draws_v1 draw
    where (
      draw.status = 'cancelled'
      and coalesce(draw.cancelled_at, draw.updated_at) < now() - interval '48 hours'
    ) or (
      draw.status = 'revealed'
      and coalesce(draw.revealed_at, draw.updated_at) < now() - interval '7 days'
    )
    order by coalesce(draw.cancelled_at, draw.revealed_at, draw.updated_at)
    limit v_batch_limit
    for update skip locked
  )
  delete from public.room_gift_draw_entries_v1 entry
  using targets
  where entry.draw_id = targets.id;
  get diagnostics v_deleted_entries = row_count;

  -- Keep the lightweight idempotency/Host record for 35 days even after the
  -- entrant snapshot is gone, so late retries still reject payload reuse.
  with targets as materialized (
    select draw.id
    from public.room_gift_draws_v1 draw
    where draw.status in ('cancelled', 'revealed')
      and coalesce(draw.cancelled_at, draw.revealed_at, draw.updated_at)
        < now() - interval '35 days'
    order by coalesce(draw.cancelled_at, draw.revealed_at, draw.updated_at)
    limit v_batch_limit
    for update skip locked
  )
  delete from public.room_gift_draw_private_v1 secret
  using targets
  where secret.draw_id = targets.id;
  get diagnostics v_deleted_private = row_count;

  -- The participant-visible direct-delivery ledger is durable, while its
  -- payload hash/idempotency secret follows the same 35-day retention window.
  with targets as materialized (
    select secret.delivery_id
    from public.room_gift_delivery_private_v1 secret
    where secret.created_at < now() - interval '35 days'
    order by secret.created_at
    limit v_batch_limit
    for update skip locked
  )
  delete from public.room_gift_delivery_private_v1 secret
  using targets
  where secret.delivery_id = targets.delivery_id;
  get diagnostics v_deleted_delivery_private = row_count;

  -- Cancelled projections expire after 90 days; revealed projections after
  -- 180 days. Award snapshot columns survive because their FKs use SET NULL.
  with targets as materialized (
    select draw.id
    from public.room_gift_draws_v1 draw
    where (
      draw.status = 'cancelled'
      and coalesce(draw.cancelled_at, draw.updated_at) < now() - interval '90 days'
    ) or (
      draw.status = 'revealed'
      and coalesce(draw.revealed_at, draw.updated_at) < now() - interval '180 days'
    )
    order by coalesce(draw.cancelled_at, draw.revealed_at, draw.updated_at)
    limit v_batch_limit
    for update skip locked
  )
  delete from public.room_gift_draws_v1 draw
  using targets
  where draw.id = targets.id;
  get diagnostics v_deleted_draws = row_count;

  return v_deleted_entries + v_deleted_private + v_deleted_delivery_private + v_deleted_draws;
end;
$$;

-- Durable scheduler entry point. A five-second pg_cron interval is installed
-- below when supported; otherwise deployment health is explicitly degraded.
create or replace function public.rooms_advance_due_gift_draws_v1(p_limit integer default 20)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_draw public.room_gift_draws_v1%rowtype;
  v_private public.room_gift_draw_private_v1%rowtype;
  v_entry public.room_gift_draw_entries_v1%rowtype;
  v_advanced integer := 0;
  v_cancelled integer := 0;
  v_delivered integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role requise';
  end if;

  -- A prepared-but-never-started draw must not block a Room forever.
  with stale_ready as materialized (
    select draw.id
    from public.room_gift_draws_v1 draw
    where draw.status = 'ready'
      and draw.created_at < now() - interval '2 hours'
    order by draw.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  )
  update public.room_gift_draws_v1 draw
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  from stale_ready
  where draw.id = stale_ready.id;
  get diagnostics v_cancelled = row_count;
  v_advanced := v_advanced + v_cancelled;

  -- Direct scheduled gifts share the same durable five-second worker.
  -- Eligibility is intentionally frozen when the Host submits the gift: a
  -- scheduled attribution is firm and is not re-evaluated when it becomes due.
  with due_deliveries as materialized (
    select delivery.id
    from public.room_gift_deliveries_v1 delivery
    where delivery.status = 'scheduled'
      and delivery.scheduled_at <= now()
    order by delivery.scheduled_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  )
  update public.room_gift_deliveries_v1 delivery
  set status = 'sent', sent_at = now(), updated_at = now()
  from due_deliveries
  where delivery.id = due_deliveries.id;
  get diagnostics v_delivered = row_count;
  v_advanced := v_advanced + v_delivered;

  for v_draw in
    select * from public.room_gift_draws_v1 draw
    where draw.status = 'scheduled' and draw.scheduled_at <= now()
    order by draw.scheduled_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  loop
    if not exists (
      select 1 from public.rooms_v2 room
      where room.id = v_draw.room_id and room.status = 'live'
    ) then
      update public.room_gift_draws_v1
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_draw.id;
      v_advanced := v_advanced + 1;
      continue;
    end if;
    select * into v_private
    from public.room_gift_draw_private_v1 private
    where private.draw_id = v_draw.id;
    if v_private.draw_id is null then
      update public.room_gift_draws_v1
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_draw.id;
      v_advanced := v_advanced + 1;
      continue;
    end if;
    select * into v_entry
    from public.room_gift_draw_entries_v1 entry
    where entry.draw_id = v_draw.id
    order by gen_random_uuid()
    limit 1;
    if v_entry.id is not null then
      update public.room_gift_draw_private_v1
      set selected_entry_id = v_entry.id
      where draw_id = v_draw.id;
      update public.room_gift_draws_v1
      set status = 'spinning',
          started_at = now(), reveal_at = now() + make_interval(secs => animation_duration_seconds),
          updated_at = now()
      where id = v_draw.id;
      v_advanced := v_advanced + 1;
    else
      update public.room_gift_draws_v1
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_draw.id;
      v_advanced := v_advanced + 1;
    end if;
  end loop;

  for v_draw in
    select * from public.room_gift_draws_v1 draw
    where draw.status = 'spinning' and draw.reveal_at <= now()
    order by draw.reveal_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  loop
    if not exists (
      select 1 from public.rooms_v2 room
      where room.id = v_draw.room_id and room.status = 'live'
    ) then
      update public.room_gift_draws_v1
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_draw.id;
      v_advanced := v_advanced + 1;
      continue;
    end if;
    select * into v_private
    from public.room_gift_draw_private_v1 private
    where private.draw_id = v_draw.id;
    if v_private.draw_id is null then
      update public.room_gift_draws_v1
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_draw.id;
      v_advanced := v_advanced + 1;
      continue;
    end if;
    select * into v_entry
    from public.room_gift_draw_entries_v1 entry
    where entry.id = v_private.selected_entry_id;
    if v_entry.id is not null then
      update public.room_gift_draws_v1
      set status = 'revealed', winner_profile_id = v_entry.profile_id,
          winner_display_name = v_entry.display_name_snapshot,
          winner_avatar_url = v_entry.avatar_url_snapshot,
          winner_source = v_entry.source, revealed_at = now(), updated_at = now()
      where id = v_draw.id;
      insert into public.room_gift_awards_v1 (
        draw_id, draw_id_snapshot, room_id, room_id_snapshot,
        gift_code, gift_label, recipient_profile_id,
        recipient_display_name_snapshot, recipient_avatar_url_snapshot,
        awarded_by, awarded_by_snapshot
      ) values (
        v_draw.id, v_draw.id, v_draw.room_id, v_draw.room_id,
        v_draw.gift_code, v_draw.gift_label, v_entry.profile_id,
        v_entry.display_name_snapshot, v_entry.avatar_url_snapshot,
        v_private.host_id, v_private.host_id
      ) on conflict (draw_id_snapshot) do nothing;
      v_advanced := v_advanced + 1;
    else
      update public.room_gift_draws_v1
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_draw.id;
      v_advanced := v_advanced + 1;
    end if;
  end loop;
  return v_advanced;
end;
$$;

revoke all on function public.rooms_create_gift_draw_v1(uuid, text, text, text, jsonb, timestamptz, integer, text) from public, anon;
revoke all on function public.rooms_start_gift_draw_v1(uuid) from public, anon;
revoke all on function public.rooms_reveal_gift_draw_v1(uuid) from public, anon;
revoke all on function public.rooms_cancel_gift_draw_v1(uuid) from public, anon;
revoke all on function public.rooms_submit_gift_v1(uuid, text, text, uuid, text, timestamptz, text, text) from public, anon;
revoke all on function public.rooms_purge_gift_draw_snapshots_v1(integer) from public, anon, authenticated;
revoke all on function public.rooms_advance_due_gift_draws_v1(integer) from public, anon, authenticated;
grant execute on function public.rooms_create_gift_draw_v1(uuid, text, text, text, jsonb, timestamptz, integer, text) to authenticated;
grant execute on function public.rooms_start_gift_draw_v1(uuid) to authenticated;
grant execute on function public.rooms_reveal_gift_draw_v1(uuid) to authenticated;
grant execute on function public.rooms_cancel_gift_draw_v1(uuid) to authenticated;
grant execute on function public.rooms_submit_gift_v1(uuid, text, text, uuid, text, timestamptz, text, text) to authenticated;
grant execute on function public.rooms_purge_gift_draw_snapshots_v1(integer) to service_role;
grant execute on function public.rooms_advance_due_gift_draws_v1(integer) to service_role;

-- pg_cron 1.6+ accepts interval schedules down to one second. The Room draw
-- contract requires a five-second cadence. Older/missing pg_cron installations
-- are recorded as degraded and MUST invoke both service RPCs from an external
-- trusted scheduler; there is no silent minute-level fallback.
do $schedule$
declare
  v_detail text;
begin
  insert into public.room_gift_draw_scheduler_health_v1 (
    singleton, scheduler_status, scheduler_detail, checked_at
  ) values (
    true, 'pending', 'Gift draw scheduler installation is being checked.', now()
  )
  on conflict (singleton) do update
  set scheduler_status = excluded.scheduler_status,
      scheduler_detail = excluded.scheduler_detail,
      checked_at = excluded.checked_at;

  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      execute 'select cron.schedule($1, $2, $3)'
        using 'rooms-gift-draws-v1', '5 seconds',
          'select public.rooms_advance_due_gift_draws_v1(100);';
      execute 'select cron.schedule($1, $2, $3)'
        using 'rooms-gift-draw-snapshots-purge-v1', '1 hour',
          'select public.rooms_purge_gift_draw_snapshots_v1(200);';

      update public.room_gift_draw_scheduler_health_v1
      set scheduler_status = 'pg_cron_5_seconds',
          scheduler_detail = 'pg_cron advances draws and scheduled direct gifts every 5 seconds, with hourly snapshot purge.',
          checked_at = now()
      where singleton;
    exception
      when others then
        v_detail := left(
          'pg_cron interval scheduling failed; configure an external trusted scheduler: ' || sqlerrm,
          1000
        );
        update public.room_gift_draw_scheduler_health_v1
        set scheduler_status = 'degraded_external_scheduler_required',
            scheduler_detail = v_detail,
            checked_at = now()
        where singleton;
        raise warning 'rooms_gift_draw_scheduler_degraded: %', v_detail;
    end;
  else
    v_detail := 'pg_cron is unavailable; configure an external trusted scheduler every 5 seconds plus hourly purge.';
    update public.room_gift_draw_scheduler_health_v1
    set scheduler_status = 'degraded_external_scheduler_required',
        scheduler_detail = v_detail,
        checked_at = now()
    where singleton;
    raise warning 'rooms_gift_draw_scheduler_degraded: %', v_detail;
  end if;
end;
$schedule$;

do $$
begin
  alter publication supabase_realtime add table public.room_gift_draws_v1;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.room_gift_deliveries_v1;
exception
  when duplicate_object then null;
end;
$$;

comment on table public.room_gift_draws_v1 is
  'Public Room gift draw projection. Entrants and the pre-reveal winner stay in room_gift_draw_entries_v1.';
comment on table public.room_gift_draw_entries_v1 is
  'Server-only snapshot of eligible identities. No browser role, including the Host, can read it.';
comment on table public.room_gift_draw_private_v1 is
  'Server-only draw secret: Host authorization, payload-bound idempotency token and pre-reveal selected entry.';
comment on table public.room_gift_awards_v1 is
  'Immutable award ledger created idempotently when a gift draw is revealed.';
comment on table public.room_gift_deliveries_v1 is
  'Durable direct Room gift ledger: all states are visible to sender, while recipients see only sent gifts.';
comment on table public.room_gift_delivery_private_v1 is
  'Server-only payload hash and idempotency token for direct Room gifts.';
comment on table public.room_gift_draw_scheduler_health_v1 is
  'Machine-readable scheduler installation state. A degraded row requires a trusted external five-second runner.';
