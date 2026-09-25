-- Durable, transferable Profile gift inventory.
--
-- This migration is deliberately additive: the existing Room draw/delivery
-- ledgers remain the source of truth for their original actions and their RPC
-- signatures are unchanged. Inventory enforcement is attached transactionally
-- through server-side triggers, so an insufficient balance rolls the original
-- Room operation back without exposing write access to browser roles.

create table if not exists public.profile_gift_inventory_v1 (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  gift_code text not null check (
    gift_code in (
      'force-card', 'vip-pass', 'private-access',
      'golden-like', 'supporter-bonus', 'la-certif'
    )
  ),
  available_quantity integer not null default 0
    check (available_quantity between 0 and 1000000),
  reserved_quantity integer not null default 0
    check (reserved_quantity between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, gift_code),
  check (available_quantity + reserved_quantity <= 1000000)
);

-- Every balance mutation has one immutable, payload-bound movement. The
-- resulting balances make support reconciliation possible without replaying
-- the entire ledger for ordinary reads.
create table if not exists public.profile_gift_inventory_movements_v1 (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  gift_code text not null check (
    gift_code in (
      'force-card', 'vip-pass', 'private-access',
      'golden-like', 'supporter-bonus', 'la-certif'
    )
  ),
  movement_kind text not null
    check (movement_kind in ('grant', 'reserve', 'consume', 'release')),
  available_delta integer not null,
  reserved_delta integer not null,
  available_after integer not null check (available_after between 0 and 1000000),
  reserved_after integer not null check (reserved_after between 0 and 1000000),
  source_kind text not null check (
    char_length(source_kind) between 2 and 64
    and source_kind ~ '^[a-z0-9][a-z0-9_-]+$'
  ),
  source_id text not null check (
    char_length(source_id) between 1 and 180
    and octet_length(source_id) <= 512
    and source_id !~ '[[:cntrl:]]'
  ),
  idempotency_key text not null check (
    char_length(idempotency_key) between 8 and 320
    and octet_length(idempotency_key) <= 320
  ),
  created_at timestamptz not null default now(),
  unique (profile_id, idempotency_key),
  check (available_delta <> 0 or reserved_delta <> 0),
  check (available_after + reserved_after <= 1000000),
  check (
    (movement_kind = 'grant' and available_delta > 0 and reserved_delta = 0)
    or (
      movement_kind = 'reserve'
      and available_delta < 0
      and reserved_delta > 0
      and available_delta + reserved_delta = 0
    )
    or (movement_kind = 'consume' and available_delta = 0 and reserved_delta < 0)
    or (
      movement_kind = 'release'
      and available_delta > 0
      and reserved_delta < 0
      and available_delta + reserved_delta = 0
    )
  )
);

-- A reservation binds one inventory unit to one durable Room operation. It is
-- private implementation state: clients can neither inspect nor mutate it.
create table if not exists public.profile_gift_inventory_reservations_v1 (
  id uuid primary key default gen_random_uuid(),
  -- The nullable live FK is deliberately SET NULL instead of CASCADE. A
  -- scheduled Room operation may outlive an account deletion; keeping its
  -- reservation lets workers terminalize that one operation without rolling
  -- back an entire due batch. The immutable snapshot remains for audit.
  profile_id uuid references public.profiles(id) on delete set null,
  owner_profile_id_snapshot uuid not null,
  owner_deleted_at timestamptz,
  gift_code text not null check (
    gift_code in (
      'force-card', 'vip-pass', 'private-access',
      'golden-like', 'supporter-bonus', 'la-certif'
    )
  ),
  quantity integer not null check (quantity between 1 and 1000),
  consumer_kind text not null check (consumer_kind in ('room_draw', 'room_delivery')),
  consumer_id uuid not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released')),
  finalization_reason text check (
    finalization_reason is null
    or finalization_reason in (
      'delivered', 'cancelled', 'source_deleted',
      'owner_deleted_committed', 'owner_deleted_cancelled',
      'recipient_deleted'
    )
  ),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (consumer_kind, consumer_id),
  check ((profile_id is not null and owner_deleted_at is null) or owner_deleted_at is not null),
  check (
    (status = 'reserved' and finalized_at is null and finalization_reason is null)
    or (status <> 'reserved' and finalized_at is not null and finalization_reason is not null)
  )
);

-- Deploy observe-only. Enforcement is an explicit, service-role cutover that
-- seeds stock and flips this singleton in one transaction. This prevents
-- already-shipped Web/iOS clients from suddenly failing with zero balances.
create table if not exists public.profile_gift_inventory_runtime_v1 (
  singleton boolean primary key default true check (singleton),
  enforcement_mode text not null default 'observe'
    check (enforcement_mode in ('observe', 'enforce')),
  installed_at timestamptz not null default clock_timestamp(),
  enforcement_started_at timestamptz,
  activation_key text,
  activation_seed_hash text,
  check (singleton = true),
  check (
    (
      enforcement_mode = 'observe'
      and enforcement_started_at is null
      and activation_key is null
      and activation_seed_hash is null
    )
    or (
      enforcement_mode = 'enforce'
      and enforcement_started_at is not null
      and activation_key is not null
      and char_length(activation_key) between 8 and 80
      and activation_seed_hash is not null
      and activation_seed_hash ~ '^[0-9a-f]{64}$'
    )
  )
);

-- Durable classification independent of transaction-level now()/created_at.
-- In particular, a `round/ready` INSERT crosses cutover without reserving yet,
-- so its later expediable UPDATE needs this marker to know it is not legacy.
create table if not exists public.profile_gift_inventory_enforced_sources_v1 (
  consumer_kind text not null check (consumer_kind in ('room_draw', 'room_delivery')),
  consumer_id uuid not null,
  enforcement_started_at timestamptz not null,
  marked_at timestamptz not null default clock_timestamp(),
  primary key (consumer_kind, consumer_id)
);

create index if not exists profile_gift_inventory_movements_profile_created_idx
  on public.profile_gift_inventory_movements_v1(profile_id, created_at desc);
create index if not exists profile_gift_inventory_reservations_profile_status_idx
  on public.profile_gift_inventory_reservations_v1(profile_id, status, created_at desc);

alter table public.profile_gift_inventory_v1 enable row level security;
alter table public.profile_gift_inventory_movements_v1 enable row level security;
alter table public.profile_gift_inventory_reservations_v1 enable row level security;
alter table public.profile_gift_inventory_runtime_v1 enable row level security;
alter table public.profile_gift_inventory_enforced_sources_v1 enable row level security;

drop policy if exists profile_gift_inventory_v1_owner_read
  on public.profile_gift_inventory_v1;
create policy profile_gift_inventory_v1_owner_read
on public.profile_gift_inventory_v1 for select to authenticated
using (profile_id = auth.uid());

revoke all on table public.profile_gift_inventory_v1 from public, anon, authenticated;
revoke all on table public.profile_gift_inventory_movements_v1 from public, anon, authenticated;
revoke all on table public.profile_gift_inventory_reservations_v1 from public, anon, authenticated;
revoke all on table public.profile_gift_inventory_runtime_v1 from public, anon, authenticated;
revoke all on table public.profile_gift_inventory_enforced_sources_v1 from public, anon, authenticated;
grant select on table public.profile_gift_inventory_v1 to service_role;
grant select on table public.profile_gift_inventory_movements_v1 to service_role;
grant select on table public.profile_gift_inventory_reservations_v1 to service_role;
grant select on table public.profile_gift_inventory_runtime_v1 to service_role;
grant select on table public.profile_gift_inventory_enforced_sources_v1 to service_role;

create or replace function public.profile_apply_gift_inventory_movement_v1(
  p_profile_id uuid,
  p_gift_code text,
  p_movement_kind text,
  p_available_delta integer,
  p_reserved_delta integer,
  p_source_kind text,
  p_source_id text,
  p_idempotency_key text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gift_code text := lower(btrim(coalesce(p_gift_code, '')));
  v_movement_kind text := lower(btrim(coalesce(p_movement_kind, '')));
  v_source_kind text := lower(btrim(coalesce(p_source_kind, '')));
  v_source_id text := btrim(coalesce(p_source_id, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_inventory public.profile_gift_inventory_v1%rowtype;
  v_existing public.profile_gift_inventory_movements_v1%rowtype;
  v_available_after integer;
  v_reserved_after integer;
begin
  if p_profile_id is null then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_profile_required';
  end if;
  if v_gift_code not in (
    'force-card', 'vip-pass', 'private-access',
    'golden-like', 'supporter-bonus', 'la-certif'
  ) then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_gift_invalid';
  end if;
  if v_movement_kind not in ('grant', 'reserve', 'consume', 'release') then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_movement_invalid';
  end if;
  if p_available_delta is null or p_reserved_delta is null then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_delta_required';
  end if;
  if not (
    (v_movement_kind = 'grant' and p_available_delta > 0 and p_reserved_delta = 0)
    or (
      v_movement_kind = 'reserve'
      and p_available_delta < 0
      and p_reserved_delta > 0
      and p_available_delta + p_reserved_delta = 0
    )
    or (v_movement_kind = 'consume' and p_available_delta = 0 and p_reserved_delta < 0)
    or (
      v_movement_kind = 'release'
      and p_available_delta > 0
      and p_reserved_delta < 0
      and p_available_delta + p_reserved_delta = 0
    )
  ) then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_delta_invalid';
  end if;
  if char_length(v_source_kind) not between 2 and 64
     or v_source_kind !~ '^[a-z0-9][a-z0-9_-]+$'
     or char_length(v_source_id) not between 1 and 180
     or octet_length(v_source_id) > 512
     or v_source_id ~ '[[:cntrl:]]'
     or char_length(v_idempotency_key) not between 8 and 320
     or octet_length(v_idempotency_key) > 320 then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_source_invalid';
  end if;

  -- Parent-first locking avoids a profile-deletion cycle (Profile → FK child)
  -- against an inventory mutation (inventory → Profile FK check).
  perform 1 from public.profiles profile
  where profile.id = p_profile_id
  for key share;
  if not found then
    raise exception using errcode = '23503', message = 'profile_gift_inventory_profile_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'profile-gift-inventory:' || p_profile_id::text || ':' || v_gift_code,
    0
  ));

  select * into v_existing
  from public.profile_gift_inventory_movements_v1 movement
  where movement.profile_id = p_profile_id
    and movement.idempotency_key = v_idempotency_key;
  if v_existing.id is not null then
    if v_existing.gift_code is distinct from v_gift_code
       or v_existing.movement_kind is distinct from v_movement_kind
       or v_existing.available_delta is distinct from p_available_delta
       or v_existing.reserved_delta is distinct from p_reserved_delta
       or v_existing.source_kind is distinct from v_source_kind
       or v_existing.source_id is distinct from v_source_id then
      raise exception using errcode = '23505', message = 'profile_gift_inventory_idempotency_conflict';
    end if;
    return;
  end if;

  insert into public.profile_gift_inventory_v1 (
    profile_id, gift_code, available_quantity, reserved_quantity
  ) values (
    p_profile_id, v_gift_code, 0, 0
  ) on conflict (profile_id, gift_code) do nothing;

  select * into v_inventory
  from public.profile_gift_inventory_v1 inventory
  where inventory.profile_id = p_profile_id
    and inventory.gift_code = v_gift_code
  for update;

  v_available_after := v_inventory.available_quantity + p_available_delta;
  v_reserved_after := v_inventory.reserved_quantity + p_reserved_delta;
  if v_available_after < 0 then
    raise exception using errcode = '22003', message = 'profile_gift_inventory_insufficient_available';
  end if;
  if v_reserved_after < 0 then
    raise exception using errcode = '22003', message = 'profile_gift_inventory_insufficient_reserved';
  end if;
  if v_available_after + v_reserved_after > 1000000 then
    raise exception using errcode = '22003', message = 'profile_gift_inventory_balance_limit';
  end if;

  update public.profile_gift_inventory_v1
  set available_quantity = v_available_after,
      reserved_quantity = v_reserved_after,
      updated_at = now()
  where profile_id = p_profile_id and gift_code = v_gift_code;

  insert into public.profile_gift_inventory_movements_v1 (
    profile_id, gift_code, movement_kind,
    available_delta, reserved_delta, available_after, reserved_after,
    source_kind, source_id, idempotency_key
  ) values (
    p_profile_id, v_gift_code, v_movement_kind,
    p_available_delta, p_reserved_delta, v_available_after, v_reserved_after,
    v_source_kind, v_source_id, v_idempotency_key
  );
end;
$$;

-- Worker-safe variant: lock both live Profiles in canonical UUID order, but
-- return false when privacy deletion won the race. Callers can then release or
-- terminalize the preserved reservation instead of aborting a whole batch.
create or replace function public.profile_try_lock_gift_inventory_pair_v1(
  p_first_profile_id uuid,
  p_second_profile_id uuid,
  p_gift_code text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gift_code text := lower(btrim(coalesce(p_gift_code, '')));
  v_low_profile_id uuid;
  v_high_profile_id uuid;
begin
  if p_first_profile_id is null or p_second_profile_id is null then return false; end if;
  if p_first_profile_id::text <= p_second_profile_id::text then
    v_low_profile_id := p_first_profile_id;
    v_high_profile_id := p_second_profile_id;
  else
    v_low_profile_id := p_second_profile_id;
    v_high_profile_id := p_first_profile_id;
  end if;
  perform 1 from public.profiles profile
  where profile.id = v_low_profile_id
  for key share;
  if not found then return false; end if;
  if v_high_profile_id <> v_low_profile_id then
    perform 1 from public.profiles profile
    where profile.id = v_high_profile_id
    for key share;
    if not found then return false; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'profile-gift-inventory:' || v_low_profile_id::text || ':' || v_gift_code,
    0
  ));
  if v_high_profile_id <> v_low_profile_id then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'profile-gift-inventory:' || v_high_profile_id::text || ':' || v_gift_code,
      0
    ));
  end if;
  return true;
end;
$$;

-- Strict command variant used for newly submitted operations. Missing live
-- Profiles are a validation failure rather than a worker tombstone.
create or replace function public.profile_lock_gift_inventory_pair_v1(
  p_first_profile_id uuid,
  p_second_profile_id uuid,
  p_gift_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.profile_try_lock_gift_inventory_pair_v1(
    p_first_profile_id, p_second_profile_id, p_gift_code
  ) then
    raise exception using errcode = '23503', message = 'profile_gift_inventory_profile_not_found';
  end if;
end;
$$;

create or replace function public.profile_reserve_gift_inventory_v1(
  p_profile_id uuid,
  p_gift_code text,
  p_quantity integer,
  p_consumer_kind text,
  p_consumer_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_consumer_kind text := lower(btrim(coalesce(p_consumer_kind, '')));
  v_gift_code text := lower(btrim(coalesce(p_gift_code, '')));
  v_existing public.profile_gift_inventory_reservations_v1%rowtype;
  v_reservation_id uuid := extensions.gen_random_uuid();
begin
  if p_profile_id is null
     or p_consumer_id is null
     or p_quantity is null
     or p_quantity not between 1 and 1000
     or v_consumer_kind not in ('room_draw', 'room_delivery') then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_reservation_invalid';
  end if;

  perform 1 from public.profiles profile
  where profile.id = p_profile_id
  for key share;
  if not found then
    raise exception using errcode = '23503', message = 'profile_gift_inventory_profile_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'profile-gift-reservation:' || v_consumer_kind || ':' || p_consumer_id::text,
    0
  ));
  select * into v_existing
  from public.profile_gift_inventory_reservations_v1 reservation
  where reservation.consumer_kind = v_consumer_kind
    and reservation.consumer_id = p_consumer_id
  for update;
  if v_existing.id is not null then
    if v_existing.owner_profile_id_snapshot is distinct from p_profile_id
       or v_existing.gift_code is distinct from v_gift_code
       or v_existing.quantity is distinct from p_quantity then
      raise exception using errcode = '23505', message = 'profile_gift_inventory_reservation_conflict';
    end if;
    return v_existing.id;
  end if;

  perform public.profile_apply_gift_inventory_movement_v1(
    p_profile_id, v_gift_code, 'reserve', -p_quantity, p_quantity,
    v_consumer_kind, p_consumer_id::text,
    'reserve:' || v_consumer_kind || ':' || p_consumer_id::text
  );
  insert into public.profile_gift_inventory_reservations_v1 (
    id, profile_id, owner_profile_id_snapshot,
    gift_code, quantity, consumer_kind, consumer_id
  ) values (
    v_reservation_id, p_profile_id, p_profile_id, v_gift_code, p_quantity,
    v_consumer_kind, p_consumer_id
  );
  return v_reservation_id;
end;
$$;

create or replace function public.profile_finalize_gift_inventory_reservation_v1(
  p_consumer_kind text,
  p_consumer_id uuid,
  p_outcome text,
  p_reason text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_consumer_kind text := lower(btrim(coalesce(p_consumer_kind, '')));
  v_outcome text := lower(btrim(coalesce(p_outcome, '')));
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_reservation public.profile_gift_inventory_reservations_v1%rowtype;
  v_profile_hint uuid;
  v_runtime_mode text;
  v_enforcement_started_at timestamptz;
  v_consumer_created_at timestamptz;
  v_consumer_action text;
  v_source_marked boolean := false;
begin
  if p_consumer_id is null
     or v_consumer_kind not in ('room_draw', 'room_delivery')
     or v_outcome not in ('consumed', 'released') then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_finalization_invalid';
  end if;
  if v_reason = '' then
    v_reason := case when v_outcome = 'consumed' then 'delivered' else 'cancelled' end;
  end if;
  if v_reason not in ('delivered', 'cancelled', 'source_deleted', 'recipient_deleted') then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_finalization_reason_invalid';
  end if;

  select reservation.profile_id into v_profile_hint
  from public.profile_gift_inventory_reservations_v1 reservation
  where reservation.consumer_kind = v_consumer_kind
    and reservation.consumer_id = p_consumer_id;
  if v_profile_hint is not null then
    perform 1 from public.profiles profile
    where profile.id = v_profile_hint
    for key share;
    -- A concurrent privacy deletion owns the parent lock first. Once it
    -- completes, reload the preserved reservation below and terminalize its
    -- audit without touching the deleted balance.
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'profile-gift-reservation:' || v_consumer_kind || ':' || p_consumer_id::text,
    0
  ));
  select * into v_reservation
  from public.profile_gift_inventory_reservations_v1 reservation
  where reservation.consumer_kind = v_consumer_kind
    and reservation.consumer_id = p_consumer_id
  for update;

  if v_reservation.id is null then
    select runtime.enforcement_mode, runtime.enforcement_started_at
      into v_runtime_mode, v_enforcement_started_at
    from public.profile_gift_inventory_runtime_v1 runtime
    where runtime.singleton;
    if v_consumer_kind = 'room_draw' then
      select draw.created_at into v_consumer_created_at
      from public.room_gift_draws_v1 draw where draw.id = p_consumer_id;
    else
      select delivery.created_at, delivery.action
        into v_consumer_created_at, v_consumer_action
      from public.room_gift_deliveries_v1 delivery where delivery.id = p_consumer_id;
    end if;
    select exists (
      select 1
      from public.profile_gift_inventory_enforced_sources_v1 source
      where source.consumer_kind = v_consumer_kind
        and source.consumer_id = p_consumer_id
    ) into v_source_marked;
    -- Observe-mode and pre-cutover ledgers are intentionally unreserved.
    -- Deleted ledgers have no recipient-credit side effect left to protect.
    if v_source_marked and v_consumer_action = 'round' then
      return false;
    end if;
    if not v_source_marked and (
      v_runtime_mode is distinct from 'enforce'
      or v_enforcement_started_at is null
      or v_consumer_created_at is null
      or v_consumer_action = 'round'
      or v_consumer_created_at < v_enforcement_started_at
    ) then return false; end if;
    raise exception using errcode = '55000', message = 'profile_gift_inventory_reservation_missing';
  end if;
  -- Terminal ledgers can later be purged without trying to reverse an already
  -- consumed prize. Replays and cleanup are therefore harmless no-ops.
  if v_reservation.status <> 'reserved' then return false; end if;

  if v_reservation.profile_id is not null then
    perform 1 from public.profiles profile
    where profile.id = v_reservation.profile_id
    for key share;
    if not found then
      raise exception using errcode = '55000', message = 'profile_gift_inventory_reservation_owner_state_invalid';
    end if;
  elsif v_reservation.owner_deleted_at is null then
    raise exception using errcode = '55000', message = 'profile_gift_inventory_reservation_owner_state_invalid';
  end if;

  if v_reservation.profile_id is not null and v_outcome = 'consumed' then
    perform public.profile_apply_gift_inventory_movement_v1(
      v_reservation.profile_id, v_reservation.gift_code,
      'consume', 0, -v_reservation.quantity,
      v_consumer_kind, p_consumer_id::text,
      'consume:' || v_consumer_kind || ':' || p_consumer_id::text
    );
  elsif v_reservation.profile_id is not null then
    perform public.profile_apply_gift_inventory_movement_v1(
      v_reservation.profile_id, v_reservation.gift_code,
      'release', v_reservation.quantity, -v_reservation.quantity,
      v_consumer_kind, p_consumer_id::text,
      'release:' || v_consumer_kind || ':' || p_consumer_id::text
    );
  end if;

  if v_reservation.profile_id is null then
    v_reason := case
      when v_outcome = 'consumed' then 'owner_deleted_committed'
      when v_reason = 'recipient_deleted' then 'recipient_deleted'
      else 'owner_deleted_cancelled'
    end;
  end if;

  update public.profile_gift_inventory_reservations_v1
  set status = v_outcome,
      finalization_reason = v_reason,
      finalized_at = now()
  where id = v_reservation.id;
  return true;
end;
$$;

create or replace function public.profile_grant_gift_inventory_unit_v1(
  p_profile_id uuid,
  p_gift_code text,
  p_quantity integer,
  p_source_kind text,
  p_source_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_quantity is null or p_quantity not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_grant_quantity_invalid';
  end if;
  perform public.profile_apply_gift_inventory_movement_v1(
    p_profile_id, p_gift_code, 'grant', p_quantity, 0,
    p_source_kind, p_source_id,
    'grant:' || lower(btrim(p_source_kind)) || ':' || btrim(p_source_id)
  );
end;
$$;

-- Owner-only read projection. Returning every canonical code keeps the UI
-- deterministic while still distinguishing an actual zero balance from a
-- missing client-side catalogue entry.
create or replace function public.profile_list_my_gift_inventory_v1()
returns table (
  gift_code text,
  available_quantity integer,
  reserved_quantity integer,
  total_quantity integer,
  updated_at timestamptz,
  enforcement_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'profile_gift_inventory_authentication_required';
  end if;
  return query
  with canonical(gift_code, ordinal) as (
    values
      ('force-card'::text, 1),
      ('vip-pass'::text, 2),
      ('private-access'::text, 3),
      ('golden-like'::text, 4),
      ('supporter-bonus'::text, 5),
      ('la-certif'::text, 6)
  )
  select
    canonical.gift_code,
    coalesce(inventory.available_quantity, 0)::integer,
    coalesce(inventory.reserved_quantity, 0)::integer,
    (coalesce(inventory.available_quantity, 0) + coalesce(inventory.reserved_quantity, 0))::integer,
    inventory.updated_at,
    coalesce((
      select runtime.enforcement_mode = 'enforce'
      from public.profile_gift_inventory_runtime_v1 runtime
      where runtime.singleton
    ), false)
  from canonical
  left join public.profile_gift_inventory_v1 inventory
    on inventory.profile_id = v_profile_id
   and inventory.gift_code = canonical.gift_code
  order by canonical.ordinal;
end;
$$;

-- Trusted campaign/admin grant hook. Browser roles never receive EXECUTE.
create or replace function public.profile_grant_gift_inventory_v1(
  p_profile_id uuid,
  p_gift_code text,
  p_quantity integer,
  p_source_kind text,
  p_source_id text,
  p_idempotency_key text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'profile_gift_inventory_service_role_required';
  end if;
  if p_quantity is null or p_quantity not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_grant_quantity_invalid';
  end if;
  if char_length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 240
     or octet_length(btrim(coalesce(p_idempotency_key, ''))) > 240 then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_grant_idempotency_invalid';
  end if;
  perform public.profile_apply_gift_inventory_movement_v1(
    p_profile_id, p_gift_code, 'grant', p_quantity, 0,
    p_source_kind, p_source_id,
    'external:' || btrim(coalesce(p_idempotency_key, ''))
  );
end;
$$;

create or replace function public.profile_should_enforce_gift_inventory_v1(
  p_source_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select runtime.enforcement_mode = 'enforce'
      and runtime.enforcement_started_at is not null
      and p_source_created_at >= runtime.enforcement_started_at
    from public.profile_gift_inventory_runtime_v1 runtime
    where runtime.singleton
  ), false);
$$;

create or replace function public.profile_gift_inventory_is_active_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select runtime.enforcement_mode = 'enforce'
    from public.profile_gift_inventory_runtime_v1 runtime
    where runtime.singleton
  ), false);
$$;

create or replace function public.profile_require_gift_inventory_read_committed_v1()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using
      errcode = '0A000',
      message = 'profile_gift_inventory_read_committed_required';
  end if;
end;
$$;

create or replace function public.profile_mark_gift_inventory_source_enforced_v1(
  p_consumer_kind text,
  p_consumer_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_consumer_kind text := lower(btrim(coalesce(p_consumer_kind, '')));
  v_enforcement_started_at timestamptz;
begin
  if p_consumer_id is null or v_consumer_kind not in ('room_draw', 'room_delivery') then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_source_marker_invalid';
  end if;
  select runtime.enforcement_started_at into v_enforcement_started_at
  from public.profile_gift_inventory_runtime_v1 runtime
  where runtime.singleton and runtime.enforcement_mode = 'enforce';
  if v_enforcement_started_at is null then
    raise exception using errcode = '55000', message = 'profile_gift_inventory_runtime_not_active';
  end if;
  insert into public.profile_gift_inventory_enforced_sources_v1 (
    consumer_kind, consumer_id, enforcement_started_at
  ) values (
    v_consumer_kind, p_consumer_id, v_enforcement_started_at
  ) on conflict (consumer_kind, consumer_id) do nothing;
end;
$$;

-- Explicit cutover: a trusted operator supplies the initial stock and flips
-- enforcement in the same transaction. The source-table locks drain all
-- in-flight Room writes before the cutoff, leaving no observe/enforce gap.
create or replace function public.profile_activate_gift_inventory_v1(
  p_activation_key text,
  p_seed jsonb default '[]'::jsonb
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_activation_key text := btrim(coalesce(p_activation_key, ''));
  v_seed jsonb := coalesce(p_seed, 'null'::jsonb);
  v_seed_hash text;
  v_runtime public.profile_gift_inventory_runtime_v1%rowtype;
  v_item jsonb;
  v_profile_id_text text;
  v_profile_id uuid;
  v_gift_code text;
  v_quantity_text text;
  v_quantity integer;
  v_started_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'profile_gift_inventory_service_role_required';
  end if;
  perform public.profile_require_gift_inventory_read_committed_v1();
  if char_length(v_activation_key) not between 8 and 80
     or octet_length(v_activation_key) > 80
     or v_activation_key ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_activation_key_invalid';
  end if;
  if jsonb_typeof(v_seed) <> 'array' then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_activation_seed_invalid';
  end if;
  if jsonb_array_length(v_seed) > 10000 then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_activation_seed_invalid';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_seed) as seed(seed_item)
    group by
      lower(btrim(coalesce(seed.seed_item ->> 'profile_id', ''))),
      lower(btrim(coalesce(seed.seed_item ->> 'gift_code', '')))
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'profile_gift_inventory_activation_seed_duplicate';
  end if;
  v_seed_hash := encode(extensions.digest(convert_to(v_seed::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'profile-gift-inventory:activation', 0
  ));
  lock table public.room_gift_draws_v1 in share row exclusive mode;
  lock table public.room_gift_awards_v1 in share row exclusive mode;
  lock table public.room_gift_deliveries_v1 in share row exclusive mode;

  select * into v_runtime
  from public.profile_gift_inventory_runtime_v1 runtime
  where runtime.singleton
  for update;
  if v_runtime.singleton is null then
    raise exception using errcode = '55000', message = 'profile_gift_inventory_runtime_missing';
  end if;
  if v_runtime.enforcement_mode = 'enforce' then
    if v_runtime.activation_key is distinct from v_activation_key
       or v_runtime.activation_seed_hash is distinct from v_seed_hash then
      raise exception using errcode = '23505', message = 'profile_gift_inventory_activation_conflict';
    end if;
    return v_runtime.enforcement_started_at;
  end if;

  -- Observe-mode sends are intentionally not auto-credited: otherwise a
  -- fail-open legacy client could farm unlimited future stock. The reviewed
  -- seed is the single explicit source for any approved observe-window awards.
  for v_item in select value from jsonb_array_elements(v_seed)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'profile_gift_inventory_activation_seed_invalid';
    end if;
    v_profile_id_text := btrim(coalesce(v_item ->> 'profile_id', ''));
    v_gift_code := lower(btrim(coalesce(v_item ->> 'gift_code', '')));
    v_quantity_text := btrim(coalesce(v_item ->> 'quantity', ''));
    if v_profile_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or v_gift_code not in (
         'force-card', 'vip-pass', 'private-access',
         'golden-like', 'supporter-bonus', 'la-certif'
       )
       or v_quantity_text !~ '^[1-9][0-9]{0,3}$' then
      raise exception using errcode = '22023', message = 'profile_gift_inventory_activation_seed_invalid';
    end if;
    v_profile_id := v_profile_id_text::uuid;
    v_quantity := v_quantity_text::integer;
    if v_quantity > 1000 then
      raise exception using errcode = '22023', message = 'profile_gift_inventory_activation_seed_invalid';
    end if;
    perform public.profile_grant_gift_inventory_unit_v1(
      v_profile_id, v_gift_code, v_quantity,
      'cutover_seed',
      v_activation_key || ':' || v_profile_id::text || ':' || v_gift_code
    );
  end loop;

  v_started_at := clock_timestamp();
  update public.profile_gift_inventory_runtime_v1
  set enforcement_mode = 'enforce',
      enforcement_started_at = v_started_at,
      activation_key = v_activation_key,
      activation_seed_hash = v_seed_hash
  where singleton;
  return v_started_at;
end;
$$;

create or replace function public.profile_reject_gift_inventory_movement_mutation_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Preserve privacy deletion: a cascading cleanup caused by deleting the
  -- owning Profile may remove its now-unlinkable ledger. Ordinary direct
  -- movement mutation remains forbidden, including to service_role.
  if tg_op = 'DELETE' and not exists (
    select 1 from public.profiles profile where profile.id = old.profile_id
  ) then
    return old;
  end if;
  raise exception using errcode = '55000', message = 'profile_gift_inventory_movements_are_append_only';
end;
$$;

drop trigger if exists profile_gift_inventory_movements_immutable_v1
  on public.profile_gift_inventory_movements_v1;
create trigger profile_gift_inventory_movements_immutable_v1
before update or delete on public.profile_gift_inventory_movements_v1
for each row execute function public.profile_reject_gift_inventory_movement_mutation_v1();

-- Preserve enough non-public audit state before the live Profile FK is SET
-- NULL. Workers can then consume a committed scheduled gift or release a
-- cancelled draw without resurrecting the deleted owner's balance.
create or replace function public.profile_mark_gift_inventory_owner_deleted_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.profile_gift_inventory_reservations_v1 reservation
  set owner_deleted_at = coalesce(reservation.owner_deleted_at, clock_timestamp())
  where reservation.profile_id = old.id;
  return old;
end;
$$;

drop trigger if exists profile_mark_gift_inventory_owner_deleted_v1
  on public.profiles;
create trigger profile_mark_gift_inventory_owner_deleted_v1
before delete on public.profiles
for each row execute function public.profile_mark_gift_inventory_owner_deleted_v1();

-- Credits from the existing immutable Room ledgers.
create or replace function public.profile_credit_room_gift_award_inventory_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reservation public.profile_gift_inventory_reservations_v1%rowtype;
  v_recipient_exists boolean;
  v_source_enforced boolean;
begin
  if not public.profile_gift_inventory_is_active_v1() then
    return new;
  end if;
  if new.recipient_profile_id is not null then
    select * into v_reservation
    from public.profile_gift_inventory_reservations_v1 reservation
    where reservation.consumer_kind = 'room_draw'
      and reservation.consumer_id = new.draw_id_snapshot;
    select exists (
      select 1 from public.profiles profile where profile.id = new.recipient_profile_id
    ) into v_recipient_exists;
    -- Credits require a consumed reservation, not a timestamp heuristic. This
    -- covers INSERTs released after cutover locks while rejecting observe-era
    -- draws that never reserved stock.
    v_source_enforced := v_reservation.id is not null
      and v_reservation.status = 'consumed';
    if not v_source_enforced then
      return new;
    end if;
    if not v_recipient_exists then
      if v_reservation.id is null and v_source_enforced then
        raise exception using errcode = '55000', message = 'profile_gift_inventory_award_reservation_missing';
      end if;
      return new;
    end if;
    if public.profile_try_lock_gift_inventory_pair_v1(
      new.awarded_by_snapshot, new.recipient_profile_id, new.gift_code
    ) then
      null;
    elsif v_reservation.id is not null
       and v_reservation.owner_profile_id_snapshot = new.awarded_by_snapshot
       and v_reservation.owner_deleted_at is not null
       and v_reservation.status = 'consumed' then
      if not public.profile_try_lock_gift_inventory_pair_v1(
        new.recipient_profile_id, new.recipient_profile_id, new.gift_code
      ) then
        return new;
      end if;
    else
      raise exception using errcode = '55000', message = 'profile_gift_inventory_award_owner_state_invalid';
    end if;
    perform public.profile_grant_gift_inventory_unit_v1(
      new.recipient_profile_id, new.gift_code, 1,
      'room_draw_award', new.id::text
    );
  end if;
  return new;
end;
$$;

create or replace function public.profile_credit_room_gift_delivery_inventory_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reservation public.profile_gift_inventory_reservations_v1%rowtype;
  v_recipient_exists boolean;
  v_source_enforced boolean;
begin
  if new.status <> 'sent' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status is not distinct from 'sent' then
      return new;
    end if;
  end if;
  if not public.profile_gift_inventory_is_active_v1() then
    return new;
  end if;
  if new.status = 'sent' then
    select * into v_reservation
    from public.profile_gift_inventory_reservations_v1 reservation
    where reservation.consumer_kind = 'room_delivery'
      and reservation.consumer_id = new.id;
    select exists (
      select 1 from public.profiles profile
      where profile.id = new.recipient_profile_id_snapshot
    ) into v_recipient_exists;
    v_source_enforced := v_reservation.id is not null
      and v_reservation.status = 'consumed';
    if not v_source_enforced then
      return new;
    end if;
    if v_reservation.id is null and new.action = 'round' then
      return new;
    end if;
    if not v_recipient_exists then
      if v_reservation.status = 'released'
         and v_reservation.finalization_reason = 'recipient_deleted' then
        return new;
      end if;
      if v_source_enforced then
        raise exception using errcode = '23503', message = 'profile_gift_inventory_delivery_recipient_missing';
      end if;
      return new;
    end if;
    if public.profile_try_lock_gift_inventory_pair_v1(
      new.sender_profile_id_snapshot, new.recipient_profile_id_snapshot, new.gift_code
    ) then
      null;
    elsif v_reservation.id is not null
       and v_reservation.owner_profile_id_snapshot = new.sender_profile_id_snapshot
       and v_reservation.owner_deleted_at is not null
       and v_reservation.status = 'consumed' then
      if not public.profile_try_lock_gift_inventory_pair_v1(
        new.recipient_profile_id_snapshot, new.recipient_profile_id_snapshot, new.gift_code
      ) then
        return new;
      end if;
    else
      raise exception using errcode = '55000', message = 'profile_gift_inventory_delivery_owner_state_invalid';
    end if;
    perform public.profile_grant_gift_inventory_unit_v1(
      new.recipient_profile_id_snapshot, new.gift_code, 1,
      'room_direct_delivery', new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profile_credit_room_gift_award_inventory_v1
  on public.room_gift_awards_v1;
create trigger profile_credit_room_gift_award_inventory_v1
after insert on public.room_gift_awards_v1
for each row execute function public.profile_credit_room_gift_award_inventory_v1();

drop trigger if exists profile_credit_room_gift_delivery_inventory_v1
  on public.room_gift_deliveries_v1;
create trigger profile_credit_room_gift_delivery_inventory_v1
after insert or update of status on public.room_gift_deliveries_v1
for each row execute function public.profile_credit_room_gift_delivery_inventory_v1();

-- Transactional enforcement for new Room operations. These triggers preserve
-- every existing RPC signature and run inside the same transaction as its
-- original ledger write.
create or replace function public.profile_reserve_room_gift_draw_inventory_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_host_id uuid;
begin
  perform public.profile_require_gift_inventory_read_committed_v1();
  -- INSERT is classified from the runtime visible after the table-level
  -- cutover lock, never from now()/created_at (which may be transaction-old).
  if not public.profile_gift_inventory_is_active_v1() then
    return new;
  end if;
  perform public.profile_mark_gift_inventory_source_enforced_v1(
    'room_draw', new.id
  );
  select room.host_id into v_host_id
  from public.rooms_v2 room
  where room.id = new.room_id;
  if v_host_id is null then
    raise exception using errcode = '23503', message = 'profile_gift_inventory_room_host_missing';
  end if;
  perform public.profile_reserve_gift_inventory_v1(
    v_host_id, new.gift_code, 1, 'room_draw', new.id
  );
  return new;
end;
$$;

create or replace function public.profile_finalize_room_gift_draw_inventory_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reservation public.profile_gift_inventory_reservations_v1%rowtype;
  v_recipient_exists boolean;
begin
  if tg_op = 'DELETE' then
    perform public.profile_finalize_gift_inventory_reservation_v1(
      'room_draw', old.id, 'released', 'source_deleted'
    );
    return old;
  end if;
  if new.status = 'revealed' and old.status is distinct from 'revealed' then
    select * into v_reservation
    from public.profile_gift_inventory_reservations_v1 reservation
    where reservation.consumer_kind = 'room_draw'
      and reservation.consumer_id = new.id;
    select exists (
      select 1 from public.profiles profile where profile.id = new.winner_profile_id
    ) into v_recipient_exists;
    if not v_recipient_exists then
      perform public.profile_finalize_gift_inventory_reservation_v1(
        'room_draw', new.id, 'released', 'recipient_deleted'
      );
    else
      if v_reservation.profile_id is not null then
        if not public.profile_try_lock_gift_inventory_pair_v1(
          v_reservation.profile_id, new.winner_profile_id, new.gift_code
        ) then
          select * into v_reservation
          from public.profile_gift_inventory_reservations_v1 reservation
          where reservation.consumer_kind = 'room_draw'
            and reservation.consumer_id = new.id;
          if v_reservation.profile_id is null and v_reservation.owner_deleted_at is not null then
            if not public.profile_try_lock_gift_inventory_pair_v1(
              new.winner_profile_id, new.winner_profile_id, new.gift_code
            ) then
              perform public.profile_finalize_gift_inventory_reservation_v1(
                'room_draw', new.id, 'released', 'recipient_deleted'
              );
              return new;
            end if;
          else
            perform public.profile_finalize_gift_inventory_reservation_v1(
              'room_draw', new.id, 'released', 'recipient_deleted'
            );
            return new;
          end if;
        end if;
      elsif v_reservation.owner_deleted_at is not null then
        if not public.profile_try_lock_gift_inventory_pair_v1(
          new.winner_profile_id, new.winner_profile_id, new.gift_code
        ) then
          perform public.profile_finalize_gift_inventory_reservation_v1(
            'room_draw', new.id, 'released', 'recipient_deleted'
          );
          return new;
        end if;
      end if;
      perform public.profile_finalize_gift_inventory_reservation_v1(
        'room_draw', new.id, 'consumed'
      );
    end if;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform public.profile_finalize_gift_inventory_reservation_v1(
      'room_draw', new.id, 'released'
    );
  end if;
  return new;
end;
$$;

create or replace function public.profile_reserve_room_gift_delivery_inventory_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_reservation public.profile_gift_inventory_reservations_v1%rowtype;
  v_recipient_exists boolean;
  v_source_marked boolean := false;
begin
  -- Observe-mode and rows created before the explicit cutover retain their
  -- legacy behaviour. `round`/`ready` is not expediable in the current Room
  -- contract, so it must never hold stock indefinitely.
  if tg_op = 'INSERT' then
    perform public.profile_require_gift_inventory_read_committed_v1();
    -- An INSERT whose transaction began before activation can only reach this
    -- trigger after the activation lock commits. Runtime state is authoritative.
    if not public.profile_gift_inventory_is_active_v1() then
      return new;
    end if;
    perform public.profile_mark_gift_inventory_source_enforced_v1(
      'room_delivery', new.id
    );
  else
    select * into v_reservation
    from public.profile_gift_inventory_reservations_v1 reservation
    where reservation.consumer_kind = 'room_delivery'
      and reservation.consumer_id = new.id;
    select exists (
      select 1
      from public.profile_gift_inventory_enforced_sources_v1 source
      where source.consumer_kind = 'room_delivery'
        and source.consumer_id = new.id
    ) into v_source_marked;
    if v_reservation.id is null
       and not v_source_marked
       and not public.profile_should_enforce_gift_inventory_v1(new.created_at) then
      -- UPDATE keeps the creation cutoff only for genuinely historical,
      -- unreserved rows. A reservation proves the INSERT crossed cutover even
      -- when transaction-level now()/created_at is older than the cutoff.
      return new;
    end if;
  end if;
  if new.status = 'ready' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then
      return new;
    end if;
  end if;

  if v_reservation.id is null then
    select * into v_reservation
    from public.profile_gift_inventory_reservations_v1 reservation
    where reservation.consumer_kind = 'room_delivery'
      and reservation.consumer_id = new.id;
  end if;
  if v_reservation.id is not null then
    if v_reservation.owner_profile_id_snapshot is distinct from new.sender_profile_id_snapshot
       or v_reservation.gift_code is distinct from new.gift_code then
      raise exception using errcode = '23505', message = 'profile_gift_inventory_reservation_conflict';
    end if;
    v_host_id := v_reservation.owner_profile_id_snapshot;
  else
    select room.host_id into v_host_id
    from public.rooms_v2 room
    where room.id = new.room_id_snapshot;
    if v_host_id is null or v_host_id <> new.sender_profile_id_snapshot then
      if new.action = 'round' then
        return new;
      end if;
      raise exception using errcode = '23503', message = 'profile_gift_inventory_delivery_host_mismatch';
    end if;
  end if;
  select exists (
    select 1 from public.profiles profile
    where profile.id = new.recipient_profile_id_snapshot
  ) into v_recipient_exists;

  if not v_recipient_exists then
    if v_reservation.id is null then
      if new.action = 'round' then
        return new;
      end if;
      perform public.profile_reserve_gift_inventory_v1(
        v_host_id, new.gift_code, 1, 'room_delivery', new.id
      );
    end if;
    perform public.profile_finalize_gift_inventory_reservation_v1(
      'room_delivery', new.id, 'released', 'recipient_deleted'
    );
    return new;
  end if;

  if v_reservation.id is null then
    if new.action = 'round' then
      if not public.profile_try_lock_gift_inventory_pair_v1(
        v_host_id, new.recipient_profile_id_snapshot, new.gift_code
      ) then
        return new;
      end if;
    else
      perform public.profile_lock_gift_inventory_pair_v1(
        v_host_id, new.recipient_profile_id_snapshot, new.gift_code
      );
    end if;
    perform public.profile_reserve_gift_inventory_v1(
      v_host_id, new.gift_code, 1, 'room_delivery', new.id
    );
  elsif v_reservation.profile_id is not null then
    if not public.profile_try_lock_gift_inventory_pair_v1(
      v_reservation.profile_id, new.recipient_profile_id_snapshot, new.gift_code
    ) then
      select * into v_reservation
      from public.profile_gift_inventory_reservations_v1 reservation
      where reservation.consumer_kind = 'room_delivery'
        and reservation.consumer_id = new.id;
      if v_reservation.profile_id is null and v_reservation.owner_deleted_at is not null then
        if not public.profile_try_lock_gift_inventory_pair_v1(
          new.recipient_profile_id_snapshot, new.recipient_profile_id_snapshot, new.gift_code
        ) then
          perform public.profile_finalize_gift_inventory_reservation_v1(
            'room_delivery', new.id, 'released', 'recipient_deleted'
          );
          return new;
        end if;
      else
        perform public.profile_finalize_gift_inventory_reservation_v1(
          'room_delivery', new.id, 'released', 'recipient_deleted'
        );
        return new;
      end if;
    end if;
  else
    if not public.profile_try_lock_gift_inventory_pair_v1(
      new.recipient_profile_id_snapshot, new.recipient_profile_id_snapshot, new.gift_code
    ) then
      perform public.profile_finalize_gift_inventory_reservation_v1(
        'room_delivery', new.id, 'released', 'recipient_deleted'
      );
      return new;
    end if;
  end if;
  if new.status = 'sent' then
    perform public.profile_finalize_gift_inventory_reservation_v1(
      'room_delivery', new.id, 'consumed'
    );
  end if;
  return new;
end;
$$;

create or replace function public.profile_finalize_room_gift_delivery_inventory_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.profile_finalize_gift_inventory_reservation_v1(
      'room_delivery', old.id, 'released', 'source_deleted'
    );
    return old;
  end if;
  if new.status = 'sent' and old.status is distinct from 'sent' then
    perform public.profile_finalize_gift_inventory_reservation_v1(
      'room_delivery', new.id, 'consumed'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profile_reserve_room_gift_draw_inventory_v1
  on public.room_gift_draws_v1;
create trigger profile_reserve_room_gift_draw_inventory_v1
after insert on public.room_gift_draws_v1
for each row execute function public.profile_reserve_room_gift_draw_inventory_v1();

drop trigger if exists profile_finalize_room_gift_draw_inventory_v1
  on public.room_gift_draws_v1;
create trigger profile_finalize_room_gift_draw_inventory_v1
after update of status or delete on public.room_gift_draws_v1
for each row execute function public.profile_finalize_room_gift_draw_inventory_v1();

drop trigger if exists profile_reserve_room_gift_delivery_inventory_v1
  on public.room_gift_deliveries_v1;
create trigger profile_reserve_room_gift_delivery_inventory_v1
before insert or update of status on public.room_gift_deliveries_v1
for each row execute function public.profile_reserve_room_gift_delivery_inventory_v1();

drop trigger if exists profile_finalize_room_gift_delivery_inventory_v1
  on public.room_gift_deliveries_v1;
create trigger profile_finalize_room_gift_delivery_inventory_v1
after update of status or delete on public.room_gift_deliveries_v1
for each row execute function public.profile_finalize_room_gift_delivery_inventory_v1();

-- Deployment is deliberately fail-open/observe-only. Credits and backfill are
-- recorded immediately, but outgoing legacy Web/iOS commands are not charged
-- until `profile_activate_gift_inventory_v1` atomically seeds and activates.
insert into public.profile_gift_inventory_runtime_v1 (singleton, enforcement_mode)
values (true, 'observe')
on conflict (singleton) do nothing;

-- Idempotent historical credit. Existing sender operations are intentionally
-- grandfathered; only gifts already won/received become available stock.
do $backfill$
declare
  v_row record;
begin
  for v_row in
    select award.id, award.recipient_profile_id as profile_id, award.gift_code
    from public.room_gift_awards_v1 award
    join public.profiles profile on profile.id = award.recipient_profile_id
    where award.recipient_profile_id is not null
  loop
    perform public.profile_grant_gift_inventory_unit_v1(
      v_row.profile_id, v_row.gift_code, 1,
      'room_draw_award', v_row.id::text
    );
  end loop;

  for v_row in
    select delivery.id, delivery.recipient_profile_id as profile_id, delivery.gift_code
    from public.room_gift_deliveries_v1 delivery
    join public.profiles profile on profile.id = delivery.recipient_profile_id
    where delivery.recipient_profile_id is not null
      and delivery.status = 'sent'
  loop
    perform public.profile_grant_gift_inventory_unit_v1(
      v_row.profile_id, v_row.gift_code, 1,
      'room_direct_delivery', v_row.id::text
    );
  end loop;
end;
$backfill$;

revoke all on function public.profile_apply_gift_inventory_movement_v1(uuid, text, text, integer, integer, text, text, text)
  from public, anon, authenticated;
revoke all on function public.profile_try_lock_gift_inventory_pair_v1(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.profile_lock_gift_inventory_pair_v1(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.profile_reserve_gift_inventory_v1(uuid, text, integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.profile_finalize_gift_inventory_reservation_v1(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.profile_grant_gift_inventory_unit_v1(uuid, text, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.profile_grant_gift_inventory_v1(uuid, text, integer, text, text, text)
  from public, anon, authenticated;
revoke all on function public.profile_should_enforce_gift_inventory_v1(timestamptz)
  from public, anon, authenticated;
revoke all on function public.profile_gift_inventory_is_active_v1()
  from public, anon, authenticated;
revoke all on function public.profile_require_gift_inventory_read_committed_v1()
  from public, anon, authenticated;
revoke all on function public.profile_mark_gift_inventory_source_enforced_v1(text, uuid)
  from public, anon, authenticated;
revoke all on function public.profile_activate_gift_inventory_v1(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.profile_reject_gift_inventory_movement_mutation_v1()
  from public, anon, authenticated;
revoke all on function public.profile_mark_gift_inventory_owner_deleted_v1()
  from public, anon, authenticated;
revoke all on function public.profile_credit_room_gift_award_inventory_v1()
  from public, anon, authenticated;
revoke all on function public.profile_credit_room_gift_delivery_inventory_v1()
  from public, anon, authenticated;
revoke all on function public.profile_reserve_room_gift_draw_inventory_v1()
  from public, anon, authenticated;
revoke all on function public.profile_finalize_room_gift_draw_inventory_v1()
  from public, anon, authenticated;
revoke all on function public.profile_reserve_room_gift_delivery_inventory_v1()
  from public, anon, authenticated;
revoke all on function public.profile_finalize_room_gift_delivery_inventory_v1()
  from public, anon, authenticated;
revoke all on function public.profile_list_my_gift_inventory_v1()
  from public, anon;

grant execute on function public.profile_list_my_gift_inventory_v1() to authenticated;
grant execute on function public.profile_grant_gift_inventory_v1(uuid, text, integer, text, text, text)
  to service_role;
grant execute on function public.profile_activate_gift_inventory_v1(text, jsonb)
  to service_role;

comment on table public.profile_gift_inventory_v1 is
  'Owner gift balances. Browser writes are forbidden; Room/campaign mutations are transactional server operations.';
comment on table public.profile_gift_inventory_movements_v1 is
  'Append-only, idempotent audit ledger for every gift balance mutation.';
comment on table public.profile_gift_inventory_reservations_v1 is
  'Private reservation and tombstone ledger binding owned gifts to Room operations without poisoning workers after Profile deletion.';
comment on table public.profile_gift_inventory_enforced_sources_v1 is
  'Private durable cutover classification for Room sources, independent of transaction-old created_at timestamps.';
comment on function public.profile_list_my_gift_inventory_v1() is
  'Returns the authenticated Profile owner inventory for all six canonical Room gifts.';
comment on function public.profile_activate_gift_inventory_v1(text, jsonb) is
  'Service-role-only atomic seed and irreversible observe-to-enforce cutover for gift inventory.';
