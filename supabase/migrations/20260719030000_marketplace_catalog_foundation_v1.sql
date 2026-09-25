begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Marketplace v1 — catalogue and intent foundation (Phase A)
--
-- This phase deliberately stops before orders, payments, payouts and ledgers.
-- It owns seller catalogue metadata, listings, server-owned prices, media
-- references, favorites, a mono-seller/mono-currency cart and non-financial
-- rental/service/collective intents. Browser clients use the versioned RPCs;
-- raw tables are private and protected by RLS.
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_seller_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  rating_basis_points integer not null default 0
    check (rating_basis_points between 0 and 50000),
  rating_count integer not null default 0 check (rating_count >= 0),
  completed_orders_count integer not null default 0
    check (completed_orders_count >= 0),
  response_time_bucket text
    check (response_time_bucket is null or response_time_bucket in (
      'under_1h', 'under_4h', 'same_day', 'under_48h', 'over_48h'
    )),
  seller_status text not null default 'active'
    check (seller_status in ('active', 'paused', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null
    references public.marketplace_seller_profiles(profile_id) on delete cascade,
  slug text not null unique,
  pillar text not null
    check (pillar in ('new', 'used', 'rental', 'services', 'collective')),
  category_code text not null,
  title text not null,
  short_description text not null,
  description text not null,
  brand text,
  model text,
  condition_code text,
  condition_label text,
  status text not null default 'draft'
    check (status in (
      'draft', 'pending_review', 'published', 'paused', 'sold_out',
      'rejected', 'archived'
    )),
  badge_label text,
  city_label text,
  area_label text,
  pickup_enabled boolean not null default false,
  shipping_enabled boolean not null default false,
  remote_enabled boolean not null default false,
  preparation_days integer not null default 0
    check (preparation_days between 0 and 365),
  max_quantity integer not null default 1 check (max_quantity between 0 and 100000),
  terms jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (char_length(category_code) between 1 and 80),
  check (char_length(title) between 3 and 140),
  check (char_length(short_description) between 3 and 280),
  check (char_length(description) between 3 and 5000),
  check (brand is null or char_length(brand) <= 120),
  check (model is null or char_length(model) <= 120),
  check (condition_code is null or char_length(condition_code) <= 80),
  check (condition_label is null or char_length(condition_label) <= 120),
  check (badge_label is null or char_length(badge_label) <= 80),
  check (city_label is null or char_length(city_label) <= 120),
  check (area_label is null or char_length(area_label) <= 120),
  check (pickup_enabled or shipping_enabled or remote_enabled),
  check (octet_length(terms::text) <= 8192),
  check (
    (status = 'published' and published_at is not null)
    or status <> 'published'
  )
);

create index if not exists marketplace_listings_catalog_idx
  on public.marketplace_listings(published_at desc, id desc)
  where status = 'published';
create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings(seller_profile_id, status, updated_at desc);
create index if not exists marketplace_listings_pillar_category_idx
  on public.marketplace_listings(pillar, category_code, published_at desc, id desc)
  where status = 'published';

create table if not exists public.marketplace_listing_prices (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  price_kind text not null
    check (price_kind in (
      'primary', 'compare_at', 'shipping', 'deposit', 'weekend', 'weekly',
      'collective_retail', 'collective_unlocked'
    )),
  currency_code text not null default 'EUR' check (currency_code = 'EUR'),
  amount_minor bigint not null
    check (amount_minor between 0 and 1000000000000),
  price_unit text not null
    check (price_unit in ('item', 'day', 'session', 'ticket', 'participant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, price_kind)
);

create index if not exists marketplace_listing_prices_listing_idx
  on public.marketplace_listing_prices(listing_id, price_kind);

create table if not exists public.marketplace_listing_media (
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  media_file_id uuid not null references public.media_files(id) on delete cascade,
  media_role text not null default 'gallery'
    check (media_role in ('cover', 'gallery')),
  position integer not null check (position between 0 and 11),
  alt_text text,
  created_at timestamptz not null default now(),
  primary key (listing_id, media_file_id),
  unique (listing_id, position),
  check (alt_text is null or char_length(alt_text) <= 240)
);

create unique index if not exists marketplace_listing_one_cover_idx
  on public.marketplace_listing_media(listing_id)
  where media_role = 'cover';

create table if not exists public.marketplace_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create index if not exists marketplace_favorites_profile_idx
  on public.marketplace_favorites(profile_id, created_at desc);

create table if not exists public.marketplace_cart_items (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create index if not exists marketplace_cart_items_profile_idx
  on public.marketplace_cart_items(profile_id, updated_at desc);

create table if not exists public.marketplace_intents (
  id uuid primary key default gen_random_uuid(),
  buyer_profile_id uuid not null references public.profiles(id) on delete cascade,
  seller_profile_id uuid references public.profiles(id) on delete set null,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  kind text not null
    check (kind in ('rental_request', 'service_booking', 'collective_join')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  requested_quantity integer not null default 1
    check (requested_quantity between 1 and 20),
  starts_on date,
  ends_on date,
  requested_for timestamptz,
  note text,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  check (note is null or char_length(note) <= 1000),
  check (octet_length(pricing_snapshot::text) <= 8192),
  check (ends_on is null or starts_on is not null),
  check (ends_on is null or ends_on > starts_on)
);

create unique index if not exists marketplace_one_active_intent_idx
  on public.marketplace_intents(buyer_profile_id, listing_id, kind)
  where status in ('pending', 'accepted');
create index if not exists marketplace_intents_buyer_idx
  on public.marketplace_intents(buyer_profile_id, status, created_at desc);
create index if not exists marketplace_intents_seller_idx
  on public.marketplace_intents(seller_profile_id, status, created_at desc);

create table if not exists public.marketplace_idempotency (
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  result jsonb not null,
  listing_id uuid
    references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_profile_id, operation, idempotency_key),
  check (char_length(operation) between 3 and 80),
  check (char_length(idempotency_key) between 8 and 128),
  check (request_hash ~ '^[0-9a-f]{64}$'),
  check (octet_length(result::text) <= 16384)
);

create index if not exists marketplace_idempotency_created_idx
  on public.marketplace_idempotency(created_at);

-- ---------------------------------------------------------------------------
-- Internal invariants and idempotency helpers.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_touch_updated_at_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if tg_table_name in ('marketplace_seller_profiles', 'marketplace_listings') then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_seller_profiles_touch_v1
  on public.marketplace_seller_profiles;
create trigger marketplace_seller_profiles_touch_v1
before update on public.marketplace_seller_profiles
for each row execute function public.marketplace_touch_updated_at_v1();

drop trigger if exists marketplace_listings_touch_v1
  on public.marketplace_listings;
create trigger marketplace_listings_touch_v1
before update on public.marketplace_listings
for each row execute function public.marketplace_touch_updated_at_v1();

drop trigger if exists marketplace_listing_prices_touch_v1
  on public.marketplace_listing_prices;
create trigger marketplace_listing_prices_touch_v1
before update on public.marketplace_listing_prices
for each row execute function public.marketplace_touch_updated_at_v1();

drop trigger if exists marketplace_cart_items_touch_v1
  on public.marketplace_cart_items;
create trigger marketplace_cart_items_touch_v1
before update on public.marketplace_cart_items
for each row execute function public.marketplace_touch_updated_at_v1();

drop trigger if exists marketplace_intents_touch_v1
  on public.marketplace_intents;
create trigger marketplace_intents_touch_v1
before update on public.marketplace_intents
for each row execute function public.marketplace_touch_updated_at_v1();

-- Keep media ownership and purpose as database invariants, not only RPC
-- validation. This also protects the public catalogue if a privileged
-- maintenance job attaches media directly.
create or replace function public.marketplace_validate_listing_media_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seller_profile_id uuid;
  v_media public.media_files%rowtype;
begin
  select listing.seller_profile_id
    into v_seller_profile_id
  from public.marketplace_listings listing
  where listing.id = new.listing_id;

  select file.*
    into v_media
  from public.media_files file
  where file.id = new.media_file_id;

  if v_seller_profile_id is null
     or not found
     or v_media.user_id is distinct from v_seller_profile_id
     or v_media.deleted_at is not null
     or coalesce(v_media.status, '') not in ('draft', 'ready', 'published')
     or coalesce(v_media.source_pillar, '') <> 'marketplace'
     or coalesce(v_media.mime_type, '') not in (
       'image/jpeg', 'image/png', 'image/webp', 'image/avif',
       'video/mp4', 'video/quicktime', 'video/webm'
     ) then
    raise exception using
      errcode = '42501',
      message = 'marketplace_media_not_owned_or_unavailable';
  end if;

  if coalesce(v_media.size_bytes, v_media.file_size::bigint, 0) <= 0 then
    raise exception using
      errcode = '22023',
      message = 'marketplace_media_size_required';
  end if;

  if coalesce(v_media.size_bytes, v_media.file_size::bigint) > 12 * 1024 * 1024 then
    raise exception using
      errcode = '22023',
      message = 'marketplace_media_too_large';
  end if;

  if new.media_role = 'cover'
     and coalesce(v_media.mime_type, '') not in (
       'image/jpeg', 'image/png', 'image/webp', 'image/avif'
     ) then
    raise exception using
      errcode = '22023',
      message = 'marketplace_cover_must_be_image';
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_listing_media_validate_v1
  on public.marketplace_listing_media;
create trigger marketplace_listing_media_validate_v1
before insert or update of listing_id, media_file_id, media_role
on public.marketplace_listing_media
for each row execute function public.marketplace_validate_listing_media_v1();

create or replace function public.marketplace_require_profile_v1()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = v_user_id) then
    raise exception using errcode = '42501', message = 'profile_required';
  end if;
  return v_user_id;
end;
$$;

create or replace function public.marketplace_idempotency_replay_v1(
  p_actor_profile_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.marketplace_idempotency%rowtype;
begin
  select idempotency.* into v_record
  from public.marketplace_idempotency idempotency
  where idempotency.actor_profile_id = p_actor_profile_id
    and idempotency.operation = p_operation
    and idempotency.idempotency_key = p_idempotency_key
  for update;
  if not found then return null; end if;
  if v_record.request_hash <> p_request_hash then
    raise exception using errcode = '23505', message = 'idempotency_conflict';
  end if;
  return v_record.result || jsonb_build_object('idempotent', true);
end;
$$;

create or replace function public.marketplace_store_idempotency_v1(
  p_actor_profile_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text,
  p_listing_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.marketplace_idempotency (
    actor_profile_id, operation, idempotency_key, request_hash, listing_id, result
  ) values (
    p_actor_profile_id, p_operation, p_idempotency_key, p_request_hash,
    case
      when exists (
        select 1 from public.marketplace_listings listing
        where listing.id = p_listing_id
      ) then p_listing_id
      else null
    end,
    p_result
  );
  return p_result || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.marketplace_jsonb_integer_v1(
  p_payload jsonb,
  p_key text,
  p_minimum bigint,
  p_maximum bigint,
  p_required boolean default true
)
returns bigint
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_value_text text := p_payload ->> p_key;
  v_value numeric;
begin
  if v_value_text is null then
    if p_required then
      raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
    end if;
    return null;
  end if;
  if jsonb_typeof(p_payload -> p_key) is distinct from 'number'
     or v_value_text !~ '^-?[0-9]+$'
     or char_length(v_value_text) > 20 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
  end if;
  v_value := v_value_text::numeric;
  if v_value < p_minimum or v_value > p_maximum then
    raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
  end if;
  return v_value::bigint;
end;
$$;

-- ---------------------------------------------------------------------------
-- Safe public catalogue projection.
-- ---------------------------------------------------------------------------

create or replace function public.list_marketplace_catalog_v1(
  p_cursor_published_at timestamptz default null,
  p_cursor_listing_id uuid default null,
  p_limit integer default 48,
  p_pillar text default null,
  p_category_code text default null,
  p_search text default null,
  p_listing_ids uuid[] default null
)
returns table (
  listing_id uuid,
  seller_profile_id uuid,
  seller_display_name text,
  seller_username text,
  seller_avatar_url text,
  seller_grade_level smallint,
  seller_verified boolean,
  seller_rating_basis_points integer,
  seller_rating_count integer,
  seller_completed_orders_count integer,
  seller_response_time_bucket text,
  slug text,
  pillar text,
  category_code text,
  title text,
  short_description text,
  description text,
  brand text,
  model text,
  condition_code text,
  condition_label text,
  cover_url text,
  cover_storage_bucket text,
  cover_storage_path text,
  cover_alt text,
  badge_label text,
  city_label text,
  area_label text,
  pickup_enabled boolean,
  shipping_enabled boolean,
  shipping_amount_minor bigint,
  currency_code text,
  unit_amount_minor bigint,
  compare_at_amount_minor bigint,
  price_unit text,
  max_quantity integer,
  preparation_days integer,
  new_terms jsonb,
  used_terms jsonb,
  rental_terms jsonb,
  service_terms jsonb,
  collective_terms jsonb,
  published_at timestamptz,
  next_cursor_published_at timestamptz,
  next_cursor_listing_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := coalesce(p_limit, 48);
  v_pillar text := nullif(trim(coalesce(p_pillar, '')), '');
  v_category text := nullif(trim(coalesce(p_category_code, '')), '');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_listing_ids uuid[];
begin
  if p_listing_ids is not null then
    if cardinality(p_listing_ids) not between 1 and 100
       or p_cursor_published_at is not null
       or p_cursor_listing_id is not null
       or v_pillar is not null
       or v_category is not null
       or v_search is not null then
      raise exception using errcode = '22023', message = 'invalid_marketplace_listing_ids';
    end if;
    select array_agg(distinct requested.listing_id order by requested.listing_id)
      into v_listing_ids
    from unnest(p_listing_ids) requested(listing_id);
    v_limit := cardinality(v_listing_ids);
  end if;
  if v_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_limit';
  end if;
  if (p_cursor_published_at is null) <> (p_cursor_listing_id is null) then
    raise exception using errcode = '22023', message = 'invalid_marketplace_cursor';
  end if;
  if v_pillar is not null and v_pillar not in (
    'new', 'used', 'rental', 'services', 'collective'
  ) then
    raise exception using errcode = '22023', message = 'invalid_marketplace_pillar';
  end if;
  if v_category is not null and char_length(v_category) > 80 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_category';
  end if;
  if v_search is not null and char_length(v_search) > 120 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_search';
  end if;

  return query
  with ranked as (
    select
      listing.*,
      row_number() over (
        order by listing.published_at desc, listing.id desc
      ) as ordinal
    from public.marketplace_listings listing
    join public.marketplace_seller_profiles seller
      on seller.profile_id = listing.seller_profile_id
     and seller.seller_status = 'active'
    join public.profiles profile on profile.id = listing.seller_profile_id
    where listing.status = 'published'
      and listing.published_at is not null
      and coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
      and (v_listing_ids is null or listing.id = any(v_listing_ids))
      and (
        p_cursor_published_at is null
        or (listing.published_at, listing.id)
           < (p_cursor_published_at, p_cursor_listing_id)
      )
      and (v_pillar is null or listing.pillar = v_pillar)
      and (v_category is null or listing.category_code = v_category)
      and (
        v_search is null
        or strpos(
          lower(concat_ws(' ', listing.title, listing.short_description,
            listing.brand, listing.model, listing.category_code,
            listing.city_label, listing.area_label,
            profile.display_name, profile.full_name, profile.username)),
          lower(v_search)
        ) > 0
      )
    order by listing.published_at desc, listing.id desc
    limit v_limit + 1
  ),
  page_meta as (
    select exists(select 1 from ranked where ordinal = v_limit + 1) as has_more
  )
  select
    listing.id,
    listing.seller_profile_id,
    coalesce(profile.display_name, profile.full_name, profile.username, 'Artiste'),
    profile.username,
    coalesce(profile.profile_image_url, profile.avatar_url),
    case
      when coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
        then grade_state.level
      else null
    end,
    coalesce(profile.is_verified, false),
    seller.rating_basis_points,
    seller.rating_count,
    seller.completed_orders_count,
    seller.response_time_bucket,
    listing.slug,
    listing.pillar,
    listing.category_code,
    listing.title,
    listing.short_description,
    listing.description,
    listing.brand,
    listing.model,
    listing.condition_code,
    listing.condition_label,
    media.cover_url,
    media.storage_bucket,
    media.storage_path,
    media.cover_alt,
    listing.badge_label,
    listing.city_label,
    listing.area_label,
    listing.pickup_enabled,
    listing.shipping_enabled,
    case when listing.shipping_enabled
      then coalesce(shipping_price.amount_minor, 0)
      else 0
    end,
    primary_price.currency_code,
    primary_price.amount_minor,
    compare_price.amount_minor,
    primary_price.price_unit,
    listing.max_quantity,
    listing.preparation_days,
    case when listing.pillar = 'new' then listing.terms else null end,
    case when listing.pillar = 'used' then listing.terms else null end,
    case when listing.pillar = 'rental' then listing.terms else null end,
    case when listing.pillar = 'services' then listing.terms else null end,
    case when listing.pillar = 'collective' then collective_metrics.terms else null end,
    listing.published_at,
    case
      when listing.ordinal = v_limit and page_meta.has_more
        then listing.published_at
      else null
    end,
    case
      when listing.ordinal = v_limit and page_meta.has_more then listing.id
      else null
    end
  from ranked listing
  cross join page_meta
  join public.marketplace_seller_profiles seller
    on seller.profile_id = listing.seller_profile_id
  join public.profiles profile on profile.id = listing.seller_profile_id
  left join public.profile_grade_state grade_state
    on grade_state.profile_id = listing.seller_profile_id
  join lateral (
    select price.currency_code, price.amount_minor, price.price_unit
    from public.marketplace_listing_prices price
    where price.listing_id = listing.id and price.price_kind = 'primary'
  ) primary_price on true
  left join lateral (
    select price.amount_minor
    from public.marketplace_listing_prices price
    where price.listing_id = listing.id and price.price_kind = 'compare_at'
  ) compare_price on true
  left join lateral (
    select price.amount_minor
    from public.marketplace_listing_prices price
    where price.listing_id = listing.id and price.price_kind = 'shipping'
  ) shipping_price on true
  left join lateral (
    select
      max(price.amount_minor) filter (
        where price.price_kind = 'collective_retail'
      ) as retail_amount_minor,
      max(price.amount_minor) filter (
        where price.price_kind = 'collective_unlocked'
      ) as unlocked_amount_minor
    from public.marketplace_listing_prices price
    where price.listing_id = listing.id
  ) collective_prices on listing.pillar = 'collective'
  left join lateral (
    select coalesce(sum(intent.requested_quantity), 0)::integer as joined
    from public.marketplace_intents intent
    where intent.listing_id = listing.id
      and intent.kind = 'collective_join'
      and intent.status in ('pending', 'accepted')
  ) collective_state on listing.pillar = 'collective'
  left join lateral (
    select jsonb_build_object(
      'joined', least(listing.max_quantity, coalesce(collective_state.joined, 0)),
      'target_participants', greatest(listing.max_quantity, 1),
      'progress_percent', case
        when listing.max_quantity > 0 then least(100, floor(
          least(listing.max_quantity, coalesce(collective_state.joined, 0))
          * 100.0 / listing.max_quantity
        )::integer)
        else 0
      end,
      'days_remaining', greatest(0, ceil(extract(epoch from (
        listing.published_at + make_interval(days => case
          when coalesce(listing.terms ->> 'campaign_days', '') ~ '^\d{1,3}$'
            then (listing.terms ->> 'campaign_days')::integer
          else 0
        end) - now()
      )) / 86400.0)::integer),
      'retail_unit_amount_minor', coalesce(
        collective_prices.retail_amount_minor,
        primary_price.amount_minor
      ),
      'unlocked_unit_amount_minor', coalesce(
        collective_prices.unlocked_amount_minor,
        primary_price.amount_minor
      ),
      'savings_percent', case
        when coalesce(collective_prices.retail_amount_minor, primary_price.amount_minor) > 0
          then least(100, greatest(0, round(
            (
              coalesce(collective_prices.retail_amount_minor, primary_price.amount_minor)
              - coalesce(collective_prices.unlocked_amount_minor, primary_price.amount_minor)
            ) * 100.0
            / coalesce(collective_prices.retail_amount_minor, primary_price.amount_minor)
          )::integer))
        else 0
      end
    ) as terms
  ) collective_metrics on listing.pillar = 'collective'
  left join lateral (
    select
      coalesce(file.file_url, file.cover_url) as cover_url,
      file.storage_bucket,
      file.storage_path,
      listing_media.alt_text as cover_alt
    from public.marketplace_listing_media listing_media
    join public.media_files file on file.id = listing_media.media_file_id
    where listing_media.listing_id = listing.id
      and listing_media.media_role = 'cover'
      and file.user_id = listing.seller_profile_id
      and file.source_pillar = 'marketplace'
      and file.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
      and coalesce(file.size_bytes, file.file_size::bigint)
        between 0 and 12 * 1024 * 1024
      and file.status = 'published'
      and file.visibility = 'public'
      and file.deleted_at is null
    limit 1
  ) media on true
  where listing.ordinal <= v_limit
  order by listing.published_at desc, listing.id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authenticated viewer state and idempotent mutations.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_marketplace_state_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
begin
  return jsonb_build_object(
    'favorite_listing_ids', coalesce((
      select jsonb_agg(favorite.listing_id order by favorite.created_at desc)
      from public.marketplace_favorites favorite
      where favorite.profile_id = v_user_id
    ), '[]'::jsonb),
    'cart_items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'listing_id', cart.listing_id,
          'quantity', cart.quantity
        ) order by cart.updated_at desc
      )
      from public.marketplace_cart_items cart
      where cart.profile_id = v_user_id
    ), '[]'::jsonb),
    'joined_collective_listing_ids', coalesce((
      select jsonb_agg(intent.listing_id order by intent.created_at desc)
      from public.marketplace_intents intent
      where intent.buyer_profile_id = v_user_id
        and intent.kind = 'collective_join'
        and intent.status in ('pending', 'accepted')
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_marketplace_favorite_v1(
  p_listing_id uuid,
  p_favorite boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_result jsonb;
begin
  if p_listing_id is null or p_favorite is null
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_request';
  end if;
  v_hash := encode(extensions.digest(
    concat_ws('|', p_listing_id, p_favorite), 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:key:' || v_user_id::text || ':favorite:' || v_key, 0
  ));
  v_replay := public.marketplace_idempotency_replay_v1(
    v_user_id, 'favorite', v_key, v_hash
  );
  if v_replay is not null then return v_replay; end if;

  if p_favorite and not exists (
    select 1
    from public.marketplace_listings listing
    join public.marketplace_seller_profiles seller
      on seller.profile_id = listing.seller_profile_id
    join public.profiles profile on profile.id = listing.seller_profile_id
    where listing.id = p_listing_id
      and listing.status = 'published'
      and seller.seller_status = 'active'
      and coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
  ) then
    raise exception using errcode = 'P0002', message = 'marketplace_listing_not_found';
  end if;

  if p_favorite then
    insert into public.marketplace_favorites(profile_id, listing_id)
    values (v_user_id, p_listing_id)
    on conflict (profile_id, listing_id) do nothing;
  else
    delete from public.marketplace_favorites
    where profile_id = v_user_id and listing_id = p_listing_id;
  end if;
  v_result := jsonb_build_object(
    'listing_id', p_listing_id, 'favorite', p_favorite
  );
  return public.marketplace_store_idempotency_v1(
    v_user_id, 'favorite', v_key, v_hash,
    case when p_favorite then p_listing_id else null end,
    v_result
  );
end;
$$;

create or replace function public.set_marketplace_cart_item_v1(
  p_listing_id uuid,
  p_quantity integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_seller_profile_id uuid;
  v_listing_max_quantity integer;
  v_currency text;
  v_conflicting_item boolean;
  v_result jsonb;
begin
  if p_listing_id is null or p_quantity is null
     or p_quantity not between 0 and 99
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_request';
  end if;
  v_hash := encode(extensions.digest(
    concat_ws('|', p_listing_id, p_quantity), 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:key:' || v_user_id::text || ':cart:' || v_key, 0
  ));
  v_replay := public.marketplace_idempotency_replay_v1(
    v_user_id, 'cart_item', v_key, v_hash
  );
  if v_replay is not null then return v_replay; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:cart:' || v_user_id::text, 0
  ));

  if p_quantity = 0 then
    delete from public.marketplace_cart_items
    where profile_id = v_user_id and listing_id = p_listing_id;
  else
    select listing.seller_profile_id, listing.max_quantity, price.currency_code
      into v_seller_profile_id, v_listing_max_quantity, v_currency
    from public.marketplace_listings listing
    join public.marketplace_listing_prices price
      on price.listing_id = listing.id and price.price_kind = 'primary'
    join public.marketplace_seller_profiles seller
      on seller.profile_id = listing.seller_profile_id
     and seller.seller_status = 'active'
    join public.profiles profile on profile.id = listing.seller_profile_id
    where listing.id = p_listing_id
      and listing.status = 'published'
      and listing.pillar in ('new', 'used')
      and coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
    for update of listing;
    if not found then
      raise exception using errcode = 'P0002', message = 'marketplace_listing_not_found';
    end if;
    if v_seller_profile_id = v_user_id then
      raise exception using errcode = '22023', message = 'cannot_purchase_own_listing';
    end if;
    if p_quantity > v_listing_max_quantity then
      raise exception using errcode = '22023', message = 'marketplace_quantity_unavailable';
    end if;

    select exists (
      select 1
      from public.marketplace_cart_items cart
      join public.marketplace_listings existing_listing
        on existing_listing.id = cart.listing_id
      join public.marketplace_listing_prices existing_price
        on existing_price.listing_id = existing_listing.id
       and existing_price.price_kind = 'primary'
      where cart.profile_id = v_user_id
        and cart.listing_id <> p_listing_id
        and (
          existing_listing.seller_profile_id <> v_seller_profile_id
          or existing_price.currency_code <> v_currency
        )
    ) into v_conflicting_item;
    if v_conflicting_item then
      raise exception using errcode = '22023', message = 'marketplace_cart_scope_conflict';
    end if;

    insert into public.marketplace_cart_items(profile_id, listing_id, quantity)
    values (v_user_id, p_listing_id, p_quantity)
    on conflict (profile_id, listing_id) do update
      set quantity = excluded.quantity;
  end if;

  v_result := jsonb_build_object(
    'listing_id', p_listing_id, 'quantity', p_quantity
  );
  return public.marketplace_store_idempotency_v1(
    v_user_id, 'cart_item', v_key, v_hash,
    case when p_quantity > 0 then p_listing_id else null end,
    v_result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Listing draft creation. All accepted input is normalized into explicit
-- columns/terms; arbitrary client JSON is never persisted.
-- ---------------------------------------------------------------------------

create or replace function public.create_marketplace_listing_draft_v1(
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_pillar text := trim(coalesce(p_payload ->> 'pillar', ''));
  v_category text := trim(coalesce(p_payload ->> 'category_code', ''));
  v_title text := trim(coalesce(p_payload ->> 'title', ''));
  v_short text := trim(coalesce(p_payload ->> 'short_description', ''));
  v_description text := trim(coalesce(p_payload ->> 'description', ''));
  v_brand text := nullif(trim(coalesce(p_payload ->> 'brand', '')), '');
  v_model text := nullif(trim(coalesce(p_payload ->> 'model', '')), '');
  v_condition text := nullif(trim(coalesce(p_payload ->> 'condition_code', '')), '');
  v_city text := nullif(trim(coalesce(p_payload ->> 'city', '')), '');
  v_area text := nullif(trim(coalesce(p_payload ->> 'area', '')), '');
  v_currency text := trim(coalesce(p_payload ->> 'currency_code', ''));
  v_price_unit text := trim(coalesce(p_payload ->> 'price_unit', ''));
  v_pickup boolean;
  v_shipping boolean;
  v_remote boolean;
  v_amount bigint;
  v_shipping_amount bigint;
  v_preparation_days bigint;
  v_terms_input jsonb := p_payload -> 'terms';
  v_terms jsonb;
  v_max_quantity integer;
  v_compare_amount bigint;
  v_listing_id uuid := gen_random_uuid();
  v_slug_base text;
  v_media_count integer;
  v_result jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
  end if;
  v_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:key:' || v_user_id::text || ':listing_draft:' || v_key, 0
  ));
  v_replay := public.marketplace_idempotency_replay_v1(
    v_user_id, 'listing_draft', v_key, v_hash
  );
  if v_replay is not null then return v_replay; end if;

  if v_pillar not in ('new', 'used', 'rental', 'services', 'collective')
     or char_length(v_category) not between 1 and 80
     or char_length(v_title) not between 3 and 140
     or char_length(v_short) not between 3 and 280
     or char_length(v_description) not between 3 and 5000
     or char_length(coalesce(v_brand, '')) > 120
     or char_length(coalesce(v_model, '')) > 120
     or char_length(coalesce(v_condition, '')) > 80
     or char_length(coalesce(v_city, '')) > 120
     or char_length(coalesce(v_area, '')) > 120
     or v_currency <> 'EUR'
     or v_price_unit not in ('item', 'day', 'session', 'ticket', 'participant')
     or jsonb_typeof(v_terms_input) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
  end if;

  if jsonb_typeof(p_payload -> 'pickup') is distinct from 'boolean'
     or jsonb_typeof(p_payload -> 'shipping') is distinct from 'boolean'
     or jsonb_typeof(p_payload -> 'remote') is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
  end if;
  v_pickup := (p_payload ->> 'pickup')::boolean;
  v_shipping := (p_payload ->> 'shipping')::boolean;
  v_remote := (p_payload ->> 'remote')::boolean;
  if not (v_pickup or v_shipping or v_remote) then
    raise exception using errcode = '22023', message = 'marketplace_fulfillment_required';
  end if;

  v_amount := public.marketplace_jsonb_integer_v1(
    p_payload, 'unit_amount_minor', 0, 1000000000000
  );
  v_shipping_amount := coalesce(public.marketplace_jsonb_integer_v1(
    p_payload, 'shipping_amount_minor', 0, 1000000000000, false
  ), 0);
  v_preparation_days := coalesce(public.marketplace_jsonb_integer_v1(
    p_payload, 'preparation_days', 0, 365, false
  ), 0);

  if (v_pillar in ('new', 'used') and v_price_unit <> 'item')
     or (v_pillar = 'rental' and v_price_unit <> 'day')
     or (v_pillar = 'services' and v_price_unit not in ('session', 'ticket'))
     or (v_pillar = 'collective' and v_price_unit <> 'participant') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_price_unit';
  end if;

  if coalesce(p_payload -> 'media_file_ids', '[]'::jsonb) = 'null'::jsonb then
    p_payload := jsonb_set(p_payload, '{media_file_ids}', '[]'::jsonb);
  end if;
  if jsonb_typeof(coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)) not between 1 and 8 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_media';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)) value
    where jsonb_typeof(value) is distinct from 'string'
       or trim(both '"' from value::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode = '22023', message = 'invalid_marketplace_media';
  end if;
  if (
    select count(distinct media_id.value)
    from jsonb_array_elements_text(
      coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)
    ) media_id(value)
  ) <> jsonb_array_length(coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)) then
    raise exception using errcode = '22023', message = 'marketplace_duplicate_media';
  end if;
  select count(*) into v_media_count
  from (
    select distinct value::uuid as media_id
    from jsonb_array_elements_text(coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)) value
  ) requested
  join public.media_files file
    on file.id = requested.media_id
   and file.user_id = v_user_id
   and file.deleted_at is null
   and file.status in ('draft', 'ready', 'published')
   and file.source_pillar = 'marketplace'
   and file.mime_type in (
     'image/jpeg', 'image/png', 'image/webp', 'image/avif',
     'video/mp4', 'video/quicktime', 'video/webm'
   );
  if v_media_count <> jsonb_array_length(coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)) then
    raise exception using errcode = '42501', message = 'marketplace_media_not_owned_or_unavailable';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)
    ) requested(media_id)
    join public.media_files file on file.id = requested.media_id::uuid
    where file.user_id = v_user_id
      and file.deleted_at is null
      and file.status in ('draft', 'ready', 'published')
      and file.source_pillar = 'marketplace'
      and coalesce(file.size_bytes, file.file_size::bigint, 0) <= 0
  ) then
    raise exception using errcode = '22023', message = 'marketplace_media_size_required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)
    ) requested(media_id)
    join public.media_files file on file.id = requested.media_id::uuid
    where file.user_id = v_user_id
      and file.deleted_at is null
      and file.status in ('draft', 'ready', 'published')
      and file.source_pillar = 'marketplace'
      and coalesce(file.size_bytes, file.file_size::bigint) > 12 * 1024 * 1024
  ) then
    raise exception using errcode = '22023', message = 'marketplace_media_too_large';
  end if;
  if not exists (
    select 1
    from public.media_files cover
    where cover.id = (p_payload -> 'media_file_ids' ->> 0)::uuid
      and cover.user_id = v_user_id
      and cover.deleted_at is null
      and cover.status in ('draft', 'ready', 'published')
      and cover.source_pillar = 'marketplace'
      and cover.mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ) then
    raise exception using errcode = '22023', message = 'marketplace_cover_must_be_image';
  end if;

  if v_pillar = 'new' then
    v_max_quantity := public.marketplace_jsonb_integer_v1(
      v_terms_input, 'stock', 0, 100000
    )::integer;
    perform public.marketplace_jsonb_integer_v1(
      v_terms_input, 'warranty_months', 0, 240
    );
    v_compare_amount := public.marketplace_jsonb_integer_v1(
      v_terms_input, 'compare_at_amount_minor', 0, 1000000000000, false
    );
    if v_compare_amount is not null and v_compare_amount < v_amount then
      raise exception using errcode = '22023', message = 'invalid_marketplace_compare_price';
    end if;
    v_terms := jsonb_build_object(
      'stock', v_max_quantity,
      'warranty_months', (v_terms_input ->> 'warranty_months')::integer,
      'compare_at_amount_minor', v_compare_amount
    );
  elsif v_pillar = 'used' then
    v_max_quantity := 1;
    if v_terms_input ? 'purchase_year'
       and v_terms_input -> 'purchase_year' <> 'null'::jsonb then
      perform public.marketplace_jsonb_integer_v1(
        v_terms_input, 'purchase_year', 1900,
        extract(year from current_date)::bigint + 1
      );
    end if;
    if jsonb_typeof(v_terms_input -> 'negotiable') is distinct from 'boolean'
       or char_length(coalesce(v_terms_input ->> 'condition_notes', '')) > 2000 then
      raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
    end if;
    v_terms := jsonb_build_object(
      'purchase_year', case
        when v_terms_input -> 'purchase_year' is null
          or v_terms_input -> 'purchase_year' = 'null'::jsonb then null
        else (v_terms_input ->> 'purchase_year')::integer
      end,
      'negotiable', (v_terms_input ->> 'negotiable')::boolean,
      'condition_notes', nullif(trim(coalesce(
        v_terms_input ->> 'condition_notes', ''
      )), '')
    );
  elsif v_pillar = 'rental' then
    if public.marketplace_jsonb_integer_v1(
      v_terms_input, 'daily_amount_minor', 0, 1000000000000
    ) <> v_amount then
      raise exception using errcode = '22023', message = 'marketplace_primary_price_mismatch';
    end if;
    perform public.marketplace_jsonb_integer_v1(
      v_terms_input, 'weekend_amount_minor', 0, 1000000000000, false
    );
    perform public.marketplace_jsonb_integer_v1(
      v_terms_input, 'weekly_amount_minor', 0, 1000000000000, false
    );
    perform public.marketplace_jsonb_integer_v1(
      v_terms_input, 'deposit_amount_minor', 0, 1000000000000
    );
    v_max_quantity := 1;
    perform public.marketplace_jsonb_integer_v1(
      v_terms_input, 'minimum_days', 1, 365
    );
    if coalesce(v_terms_input ->> 'available_from', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or jsonb_typeof(v_terms_input -> 'instant_book') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
    end if;
    begin
      perform (v_terms_input ->> 'available_from')::date;
    exception
      when datetime_field_overflow or invalid_datetime_format then
        raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
    end;
    v_terms := jsonb_build_object(
      'daily_amount_minor', v_amount,
      'weekend_amount_minor', public.marketplace_jsonb_integer_v1(
        v_terms_input, 'weekend_amount_minor', 0, 1000000000000, false
      ),
      'weekly_amount_minor', public.marketplace_jsonb_integer_v1(
        v_terms_input, 'weekly_amount_minor', 0, 1000000000000, false
      ),
      'deposit_amount_minor', public.marketplace_jsonb_integer_v1(
        v_terms_input, 'deposit_amount_minor', 0, 1000000000000
      ),
      'minimum_days', (v_terms_input ->> 'minimum_days')::integer,
      'available_from', v_terms_input ->> 'available_from',
      'instant_book', (v_terms_input ->> 'instant_book')::boolean
    );
  elsif v_pillar = 'services' then
    if coalesce(v_terms_input ->> 'service_kind', '') not in (
      'production', 'coaching', 'ticket', 'room'
    )
       or char_length(trim(coalesce(v_terms_input ->> 'service_format', ''))) not between 1 and 120
       or char_length(trim(coalesce(v_terms_input ->> 'duration_label', ''))) not between 1 and 120
       or char_length(coalesce(v_terms_input ->> 'delivery_label', '')) > 160
       or char_length(trim(coalesce(v_terms_input ->> 'next_availability', ''))) not between 1 and 160
       or char_length(coalesce(v_terms_input ->> 'venue_name', '')) > 180
       or char_length(coalesce(v_terms_input ->> 'included_equipment', '')) > 2000 then
      raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
    end if;
    if v_terms_input ? 'capacity' and v_terms_input -> 'capacity' <> 'null'::jsonb then
      v_max_quantity := public.marketplace_jsonb_integer_v1(
        v_terms_input, 'capacity', 1, 100000
      )::integer;
    else
      v_max_quantity := 1;
    end if;
    if v_terms_input ? 'event_date' and v_terms_input -> 'event_date' <> 'null'::jsonb then
      if (v_terms_input ->> 'event_date')
           !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}([.]\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$' then
        raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
      end if;
      begin
        perform (v_terms_input ->> 'event_date')::timestamptz;
      exception
        when datetime_field_overflow
          or invalid_datetime_format
          or invalid_time_zone_displacement_value then
          raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
      end;
    end if;
    v_terms := jsonb_build_object(
      'service_kind', v_terms_input ->> 'service_kind',
      'service_format', trim(v_terms_input ->> 'service_format'),
      'duration_label', trim(v_terms_input ->> 'duration_label'),
      'delivery_label', nullif(trim(coalesce(v_terms_input ->> 'delivery_label', '')), ''),
      'next_availability', trim(v_terms_input ->> 'next_availability'),
      'event_date', case
        when v_terms_input -> 'event_date' is null
          or v_terms_input -> 'event_date' = 'null'::jsonb then null
        else (v_terms_input ->> 'event_date')::timestamptz
      end,
      'capacity', v_max_quantity,
      'venue_name', nullif(trim(coalesce(v_terms_input ->> 'venue_name', '')), ''),
      'included_equipment', nullif(trim(coalesce(
        v_terms_input ->> 'included_equipment', ''
      )), '')
    );
  else
    perform public.marketplace_jsonb_integer_v1(
      v_terms_input, 'retail_unit_amount_minor', 0, 1000000000000
    );
    if public.marketplace_jsonb_integer_v1(
      v_terms_input, 'unlocked_unit_amount_minor', 0, 1000000000000
    ) <> v_amount then
      raise exception using errcode = '22023', message = 'marketplace_primary_price_mismatch';
    end if;
    v_max_quantity := public.marketplace_jsonb_integer_v1(
      v_terms_input, 'target_participants', 2, 100000
    )::integer;
    perform public.marketplace_jsonb_integer_v1(
      v_terms_input, 'campaign_days', 1, 365
    );
    if (v_terms_input ->> 'retail_unit_amount_minor')::bigint < v_amount then
      raise exception using errcode = '22023', message = 'invalid_marketplace_collective_price';
    end if;
    v_terms := jsonb_build_object(
      'retail_unit_amount_minor', (v_terms_input ->> 'retail_unit_amount_minor')::bigint,
      'unlocked_unit_amount_minor', v_amount,
      'target_participants', v_max_quantity,
      'campaign_days', (v_terms_input ->> 'campaign_days')::integer
    );
  end if;

  insert into public.marketplace_seller_profiles(profile_id)
  values (v_user_id)
  on conflict (profile_id) do nothing;

  v_slug_base := trim(both '-' from regexp_replace(
    lower(v_title), '[^a-z0-9]+', '-', 'g'
  ));
  if v_slug_base = '' then v_slug_base := 'annonce'; end if;

  insert into public.marketplace_listings (
    id, seller_profile_id, slug, pillar, category_code, title,
    short_description, description, brand, model, condition_code,
    condition_label, city_label, area_label, pickup_enabled,
    shipping_enabled, remote_enabled, preparation_days, max_quantity, terms
  ) values (
    v_listing_id, v_user_id,
    left(v_slug_base, 90) || '-' || left(replace(v_listing_id::text, '-', ''), 12),
    v_pillar, v_category, v_title, v_short, v_description, v_brand, v_model,
    v_condition,
    case lower(replace(coalesce(v_condition, ''), '_', '-'))
      when 'new' then 'Neuf'
      when 'mint' then 'Comme neuf'
      when 'excellent' then 'Excellent'
      when 'very-good' then 'Très bon'
      else null
    end,
    v_city, v_area, v_pickup, v_shipping, v_remote,
    v_preparation_days::integer, v_max_quantity, v_terms
  );

  insert into public.marketplace_listing_prices (
    listing_id, price_kind, currency_code, amount_minor, price_unit
  ) values (v_listing_id, 'primary', 'EUR', v_amount, v_price_unit);

  if v_compare_amount is not null then
    insert into public.marketplace_listing_prices (
      listing_id, price_kind, currency_code, amount_minor, price_unit
    ) values (v_listing_id, 'compare_at', 'EUR', v_compare_amount, v_price_unit);
  end if;
  if v_shipping and v_shipping_amount > 0 then
    insert into public.marketplace_listing_prices (
      listing_id, price_kind, currency_code, amount_minor, price_unit
    ) values (v_listing_id, 'shipping', 'EUR', v_shipping_amount, 'item');
  end if;
  if v_pillar = 'rental' then
    insert into public.marketplace_listing_prices (
      listing_id, price_kind, currency_code, amount_minor, price_unit
    )
    select v_listing_id, price.price_kind, 'EUR', price.amount_minor, price.price_unit
    from (values
      ('deposit', (v_terms ->> 'deposit_amount_minor')::bigint, 'item'),
      ('weekend', (v_terms ->> 'weekend_amount_minor')::bigint, 'day'),
      ('weekly', (v_terms ->> 'weekly_amount_minor')::bigint, 'day')
    ) price(price_kind, amount_minor, price_unit)
    where price.amount_minor is not null;
  elsif v_pillar = 'collective' then
    insert into public.marketplace_listing_prices (
      listing_id, price_kind, currency_code, amount_minor, price_unit
    ) values
      (v_listing_id, 'collective_retail', 'EUR',
        (v_terms ->> 'retail_unit_amount_minor')::bigint, 'participant'),
      (v_listing_id, 'collective_unlocked', 'EUR',
        (v_terms ->> 'unlocked_unit_amount_minor')::bigint, 'participant');
  end if;

  insert into public.marketplace_listing_media (
    listing_id, media_file_id, media_role, position, alt_text
  )
  select
    v_listing_id,
    media.value::uuid,
    case when media.ordinality = 1 then 'cover' else 'gallery' end,
    media.ordinality::integer - 1,
    v_title
  from jsonb_array_elements_text(
    coalesce(p_payload -> 'media_file_ids', '[]'::jsonb)
  ) with ordinality media(value, ordinality);

  v_result := jsonb_build_object(
    'listing_id', v_listing_id,
    'status', 'draft',
    'version', 1
  );
  return public.marketplace_store_idempotency_v1(
    v_user_id, 'listing_draft', v_key, v_hash, v_listing_id, v_result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner draft workspace. Drafts stay private and non-financial: the browser
-- can list its own normalized payloads and replace one draft atomically, but
-- it cannot change status or create an order/payment from this surface.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_marketplace_listing_drafts_v1(
  p_limit integer default 50
)
returns table (
  listing_id uuid,
  status text,
  version bigint,
  payload jsonb,
  media jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_draft_limit';
  end if;

  return query
  select
    listing.id,
    listing.status,
    listing.version,
    jsonb_build_object(
      'pillar', listing.pillar,
      'category_code', listing.category_code,
      'title', listing.title,
      'short_description', listing.short_description,
      'description', listing.description,
      'brand', listing.brand,
      'model', listing.model,
      'condition_code', listing.condition_code,
      'currency_code', primary_price.currency_code,
      'unit_amount_minor', primary_price.amount_minor,
      'price_unit', primary_price.price_unit,
      'city', listing.city_label,
      'area', listing.area_label,
      'pickup', listing.pickup_enabled,
      'shipping', listing.shipping_enabled,
      'remote', listing.remote_enabled,
      'shipping_amount_minor', coalesce(shipping_price.amount_minor, 0),
      'preparation_days', listing.preparation_days,
      'media_file_ids', coalesce(media.media_file_ids, '[]'::jsonb),
      'terms', listing.terms
    ),
    coalesce(media.media_items, '[]'::jsonb),
    listing.created_at,
    listing.updated_at
  from public.marketplace_listings listing
  join public.marketplace_listing_prices primary_price
    on primary_price.listing_id = listing.id
   and primary_price.price_kind = 'primary'
  left join public.marketplace_listing_prices shipping_price
    on shipping_price.listing_id = listing.id
   and shipping_price.price_kind = 'shipping'
  left join lateral (
    select
      jsonb_agg(media_row.media_file_id order by media_row.position) as media_file_ids,
      jsonb_agg(jsonb_build_object(
        'media_file_id', media_row.media_file_id,
        'role', media_row.media_role,
        'position', media_row.position,
        'name', file.name,
        'mime_type', file.mime_type,
        'size_bytes', coalesce(file.size_bytes, file.file_size::bigint),
        'storage_bucket', file.storage_bucket,
        'storage_path', file.storage_path,
        'file_url', file.file_url
      ) order by media_row.position) as media_items
    from public.marketplace_listing_media media_row
    join public.media_files file
      on file.id = media_row.media_file_id
     and file.user_id = v_user_id
     and file.deleted_at is null
     and file.source_pillar = 'marketplace'
    where media_row.listing_id = listing.id
  ) media on true
  where listing.seller_profile_id = v_user_id
    and listing.status = 'draft'
  order by listing.updated_at desc, listing.id desc
  limit p_limit;
end;
$$;

create or replace function public.update_marketplace_listing_draft_v1(
  p_listing_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_target public.marketplace_listings%rowtype;
  v_seed public.marketplace_listings%rowtype;
  v_seed_id uuid;
  v_seed_key text;
  v_new_version bigint;
  v_result jsonb;
begin
  if p_listing_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_payload is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_payload';
  end if;

  v_hash := encode(extensions.digest(
    concat_ws('|', p_listing_id::text, p_expected_version::text, p_payload::text),
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:key:' || v_user_id::text || ':listing_draft_update:' || v_key,
    0
  ));
  v_replay := public.marketplace_idempotency_replay_v1(
    v_user_id, 'listing_draft_update', v_key, v_hash
  );
  if v_replay is not null then return v_replay; end if;

  select listing.* into v_target
  from public.marketplace_listings listing
  where listing.id = p_listing_id
  for update;

  if not found or v_target.seller_profile_id is distinct from v_user_id then
    raise exception using errcode = 'P0002', message = 'marketplace_draft_not_found';
  end if;
  if v_target.status <> 'draft' then
    raise exception using errcode = '22023', message = 'marketplace_draft_not_editable';
  end if;
  if v_target.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'marketplace_draft_version_conflict';
  end if;

  -- The create RPC is the canonical validator/normalizer for pillar terms,
  -- prices, logistics and owned media. Its temporary draft is removed in the
  -- same transaction after its normalized rows replace the target rows.
  v_seed_key := 'draft-update-seed:' || encode(extensions.digest(
    concat_ws('|', v_user_id::text, p_listing_id::text, v_key), 'sha256'
  ), 'hex');
  v_seed_id := (
    public.create_marketplace_listing_draft_v1(p_payload, v_seed_key)
      ->> 'listing_id'
  )::uuid;

  select listing.* into strict v_seed
  from public.marketplace_listings listing
  where listing.id = v_seed_id
    and listing.seller_profile_id = v_user_id
    and listing.status = 'draft';

  update public.marketplace_listings target
  set
    pillar = v_seed.pillar,
    category_code = v_seed.category_code,
    title = v_seed.title,
    short_description = v_seed.short_description,
    description = v_seed.description,
    brand = v_seed.brand,
    model = v_seed.model,
    condition_code = v_seed.condition_code,
    condition_label = v_seed.condition_label,
    badge_label = null,
    city_label = v_seed.city_label,
    area_label = v_seed.area_label,
    pickup_enabled = v_seed.pickup_enabled,
    shipping_enabled = v_seed.shipping_enabled,
    remote_enabled = v_seed.remote_enabled,
    preparation_days = v_seed.preparation_days,
    max_quantity = v_seed.max_quantity,
    terms = v_seed.terms,
    published_at = null
  where target.id = p_listing_id;

  delete from public.marketplace_listing_prices price
  where price.listing_id = p_listing_id;
  insert into public.marketplace_listing_prices (
    listing_id, price_kind, currency_code, amount_minor, price_unit
  )
  select p_listing_id, price.price_kind, price.currency_code,
    price.amount_minor, price.price_unit
  from public.marketplace_listing_prices price
  where price.listing_id = v_seed_id;

  delete from public.marketplace_listing_media media
  where media.listing_id = p_listing_id;
  insert into public.marketplace_listing_media (
    listing_id, media_file_id, media_role, position, alt_text
  )
  select p_listing_id, media.media_file_id, media.media_role,
    media.position, media.alt_text
  from public.marketplace_listing_media media
  where media.listing_id = v_seed_id
  order by media.position;

  delete from public.marketplace_listings listing
  where listing.id = v_seed_id;

  select listing.version into strict v_new_version
  from public.marketplace_listings listing
  where listing.id = p_listing_id;

  v_result := jsonb_build_object(
    'listing_id', p_listing_id,
    'status', 'draft',
    'version', v_new_version
  );
  return public.marketplace_store_idempotency_v1(
    v_user_id, 'listing_draft_update', v_key, v_hash,
    p_listing_id, v_result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Non-financial request intents. Price snapshots are always read from the
-- canonical price rows and never accepted from a browser payload.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_create_intent_v1(
  p_listing_id uuid,
  p_kind text,
  p_quantity integer,
  p_starts_on date,
  p_ends_on date,
  p_requested_for timestamptz,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_hash text;
  v_replay jsonb;
  v_listing public.marketplace_listings%rowtype;
  v_minimum_days integer;
  v_campaign_days integer;
  v_joined_quantity bigint;
  v_reserved_quantity bigint;
  v_service_kind text;
  v_event_date timestamptz;
  v_requested_for timestamptz := p_requested_for;
  v_intent_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_result jsonb;
begin
  if p_listing_id is null
     or p_kind not in ('rental_request', 'service_booking', 'collective_join')
     or p_quantity is null
     or p_quantity not between 1 and 20
     or char_length(coalesce(v_note, '')) > 1000
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_request';
  end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'listing_id', p_listing_id,
    'kind', p_kind,
    'quantity', p_quantity,
    'starts_on', p_starts_on,
    'ends_on', p_ends_on,
    'requested_for', p_requested_for,
    'note', v_note
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:key:' || v_user_id::text || ':' || p_kind || ':' || v_key, 0
  ));
  v_replay := public.marketplace_idempotency_replay_v1(
    v_user_id, p_kind, v_key, v_hash
  );
  if v_replay is not null then return v_replay; end if;

  select listing.* into v_listing
  from public.marketplace_listings listing
  join public.marketplace_seller_profiles seller
    on seller.profile_id = listing.seller_profile_id
   and seller.seller_status = 'active'
  join public.profiles profile on profile.id = listing.seller_profile_id
  where listing.id = p_listing_id
    and listing.status = 'published'
    and coalesce(profile.show_on_public_profile, false)
    and not coalesce(profile.is_ghost_mode, true)
  for update of listing;
  if not found then
    raise exception using errcode = 'P0002', message = 'marketplace_listing_not_found';
  end if;
  if v_listing.seller_profile_id = v_user_id then
    raise exception using errcode = '22023', message = 'cannot_request_own_listing';
  end if;
  if exists (
    select 1 from public.marketplace_intents intent
    where intent.buyer_profile_id = v_user_id
      and intent.listing_id = p_listing_id
      and intent.kind = p_kind
      and intent.status in ('pending', 'accepted')
  ) then
    raise exception using errcode = '23505', message = 'marketplace_intent_already_active';
  end if;

  if p_kind = 'rental_request' then
    if v_listing.pillar <> 'rental' or p_starts_on is null or p_ends_on is null
       or p_ends_on <= p_starts_on then
      raise exception using errcode = '22023', message = 'invalid_marketplace_rental_request';
    end if;
    v_minimum_days := coalesce((v_listing.terms ->> 'minimum_days')::integer, 1);
    if (p_ends_on - p_starts_on) < v_minimum_days
       or p_starts_on < greatest(
         coalesce((v_listing.terms ->> 'available_from')::date, current_date),
         current_date
       ) then
      raise exception using errcode = '22023', message = 'invalid_marketplace_rental_dates';
    end if;
  elsif p_kind = 'service_booking' then
    if v_listing.pillar <> 'services'
       or p_starts_on is not null or p_ends_on is not null
       or p_quantity <> 1
       or (p_requested_for is not null and p_requested_for < now() - interval '5 minutes') then
      raise exception using errcode = '22023', message = 'invalid_marketplace_service_booking';
    end if;
    v_service_kind := v_listing.terms ->> 'service_kind';
    if nullif(v_listing.terms ->> 'event_date', '') is not null then
      v_event_date := (v_listing.terms ->> 'event_date')::timestamptz;
      v_requested_for := coalesce(p_requested_for, v_event_date);
      if v_requested_for <> v_event_date then
        raise exception using errcode = '22023', message = 'marketplace_service_slot_mismatch';
      end if;
    end if;
    if v_requested_for is not null
       and v_requested_for < now() - interval '5 minutes' then
      raise exception using errcode = '22023', message = 'invalid_marketplace_service_booking';
    end if;
    if v_service_kind in ('ticket', 'room') then
      perform pg_advisory_xact_lock(hashtextextended(
        'marketplace:capacity:' || p_listing_id::text, 0
      ));
      select coalesce(sum(intent.requested_quantity), 0)
        into v_reserved_quantity
      from public.marketplace_intents intent
      where intent.listing_id = p_listing_id
        and intent.kind = 'service_booking'
        and intent.status in ('pending', 'accepted');
      if v_reserved_quantity + p_quantity > v_listing.max_quantity then
        raise exception using errcode = '22023', message = 'marketplace_service_capacity_full';
      end if;
    end if;
  else
    if v_listing.pillar <> 'collective'
       or p_starts_on is not null or p_ends_on is not null
       or p_requested_for is not null then
      raise exception using errcode = '22023', message = 'invalid_marketplace_collective_join';
    end if;
    v_campaign_days := public.marketplace_jsonb_integer_v1(
      v_listing.terms, 'campaign_days', 1, 365
    )::integer;
    if v_listing.published_at is null
       or v_listing.published_at + (v_campaign_days * interval '1 day') <= now() then
      raise exception using errcode = '22023', message = 'marketplace_collective_closed';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'marketplace:capacity:' || p_listing_id::text, 0
    ));
    select coalesce(sum(intent.requested_quantity), 0)
      into v_joined_quantity
    from public.marketplace_intents intent
    where intent.listing_id = p_listing_id
      and intent.kind = 'collective_join'
      and intent.status in ('pending', 'accepted');
    if v_joined_quantity + p_quantity > v_listing.max_quantity then
      raise exception using errcode = '22023', message = 'marketplace_collective_full';
    end if;
  end if;

  select coalesce(jsonb_object_agg(
    price.price_kind,
    jsonb_build_object(
      'currency_code', price.currency_code,
      'amount_minor', price.amount_minor,
      'price_unit', price.price_unit
    )
  ), '{}'::jsonb)
  into v_snapshot
  from public.marketplace_listing_prices price
  where price.listing_id = p_listing_id;

  insert into public.marketplace_intents (
    id, buyer_profile_id, seller_profile_id, listing_id, kind,
    requested_quantity, starts_on, ends_on, requested_for, note,
    pricing_snapshot
  ) values (
    v_intent_id, v_user_id, v_listing.seller_profile_id, p_listing_id, p_kind,
    p_quantity, p_starts_on, p_ends_on, v_requested_for, v_note, v_snapshot
  );

  v_result := jsonb_build_object(
    'intent_id', v_intent_id,
    'status', 'pending',
    'listing_id', p_listing_id,
    'kind', p_kind
  );
  return public.marketplace_store_idempotency_v1(
    v_user_id, p_kind, v_key, v_hash, p_listing_id, v_result
  );
end;
$$;

create or replace function public.create_marketplace_rental_request_v1(
  p_listing_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.marketplace_create_intent_v1(
    p_listing_id, 'rental_request', 1, p_starts_on, p_ends_on,
    null, p_note, p_idempotency_key
  );
$$;

create or replace function public.create_marketplace_service_booking_v1(
  p_listing_id uuid,
  p_requested_for timestamptz,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.marketplace_create_intent_v1(
    p_listing_id, 'service_booking', 1, null, null,
    p_requested_for, p_note, p_idempotency_key
  );
$$;

create or replace function public.join_marketplace_collective_v1(
  p_listing_id uuid,
  p_quantity integer,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.marketplace_create_intent_v1(
    p_listing_id, 'collective_join', p_quantity, null, null,
    null, null, p_idempotency_key
  );
$$;

-- Private intent workspace. It deliberately exposes no contact details and
-- no payment/order semantics: Phase A remains a request workflow only.
create or replace function public.list_my_marketplace_intents_v1(
  p_role text default 'buyer',
  p_status text default null,
  p_limit integer default 50
)
returns table (
  intent_id uuid,
  listing_id uuid,
  listing_title text,
  listing_pillar text,
  kind text,
  status text,
  requested_quantity integer,
  starts_on date,
  ends_on date,
  requested_for timestamptz,
  note text,
  pricing_snapshot jsonb,
  buyer_profile_id uuid,
  buyer_display_name text,
  seller_profile_id uuid,
  seller_display_name text,
  created_at timestamptz,
  updated_at timestamptz,
  responded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_role text := trim(coalesce(p_role, ''));
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_limit integer := coalesce(p_limit, 50);
begin
  if v_role not in ('buyer', 'seller')
     or (v_status is not null and v_status not in (
       'pending', 'accepted', 'declined', 'cancelled', 'expired'
     ))
     or v_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_intent_filter';
  end if;

  return query
  select
    intent.id,
    intent.listing_id,
    listing.title,
    listing.pillar,
    intent.kind,
    intent.status,
    intent.requested_quantity,
    intent.starts_on,
    intent.ends_on,
    intent.requested_for,
    intent.note,
    intent.pricing_snapshot,
    intent.buyer_profile_id,
    coalesce(
      buyer.display_name, buyer.full_name, buyer.username, 'Membre Meewav'
    ),
    intent.seller_profile_id,
    coalesce(
      seller.display_name, seller.full_name, seller.username, 'Artiste'
    ),
    intent.created_at,
    intent.updated_at,
    intent.responded_at
  from public.marketplace_intents intent
  join public.marketplace_listings listing on listing.id = intent.listing_id
  join public.profiles buyer on buyer.id = intent.buyer_profile_id
  left join public.profiles seller on seller.id = intent.seller_profile_id
  where (
      (v_role = 'buyer' and intent.buyer_profile_id = v_user_id)
      or (v_role = 'seller' and intent.seller_profile_id = v_user_id)
    )
    and (v_status is null or intent.status = v_status)
  order by intent.created_at desc, intent.id desc
  limit v_limit;
end;
$$;

create or replace function public.update_marketplace_intent_status_v1(
  p_intent_id uuid,
  p_status text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_status text := trim(coalesce(p_status, ''));
  v_hash text;
  v_replay jsonb;
  v_intent public.marketplace_intents%rowtype;
  v_result jsonb;
begin
  if p_intent_id is null or v_status not in ('accepted', 'declined')
     or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_intent_update';
  end if;
  select intent.* into v_intent
  from public.marketplace_intents intent
  where intent.id = p_intent_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'marketplace_intent_not_found';
  end if;
  if v_intent.seller_profile_id is distinct from v_user_id then
    raise exception using errcode = '42501', message = 'marketplace_intent_owner_required';
  end if;
  v_hash := encode(extensions.digest(
    concat_ws('|', p_intent_id, v_status), 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:key:' || v_user_id::text || ':intent_owner_status:' || v_key, 0
  ));
  v_replay := public.marketplace_idempotency_replay_v1(
    v_user_id, 'intent_owner_status', v_key, v_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_intent.status <> 'pending' and v_intent.status <> v_status then
    raise exception using errcode = '22023', message = 'invalid_marketplace_intent_transition';
  end if;
  if v_intent.status = 'pending'
     and v_status = 'accepted'
     and v_intent.kind = 'rental_request' then
    perform pg_advisory_xact_lock(hashtextextended(
      'marketplace:capacity:' || v_intent.listing_id::text, 0
    ));
    if exists (
      select 1
      from public.marketplace_intents competing
      where competing.listing_id = v_intent.listing_id
        and competing.kind = 'rental_request'
        and competing.status = 'accepted'
        and competing.id <> v_intent.id
        and competing.starts_on < v_intent.ends_on
        and competing.ends_on > v_intent.starts_on
    ) then
      raise exception using
        errcode = '22023',
        message = 'marketplace_rental_slot_unavailable';
    end if;
  end if;
  if v_intent.status = 'pending' then
    update public.marketplace_intents
    set status = v_status, responded_at = now()
    where id = p_intent_id;
  end if;
  v_result := jsonb_build_object(
    'intent_id', v_intent.id,
    'listing_id', v_intent.listing_id,
    'kind', v_intent.kind,
    'status', v_status
  );
  return public.marketplace_store_idempotency_v1(
    v_user_id, 'intent_owner_status', v_key, v_hash,
    v_intent.listing_id, v_result
  );
end;
$$;

create or replace function public.cancel_marketplace_intent_v1(
  p_intent_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := public.marketplace_require_profile_v1();
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_hash text;
  v_replay jsonb;
  v_intent public.marketplace_intents%rowtype;
  v_result jsonb;
begin
  if p_intent_id is null or char_length(v_key) not between 8 and 128 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_intent_cancel';
  end if;
  select intent.* into v_intent
  from public.marketplace_intents intent
  where intent.id = p_intent_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'marketplace_intent_not_found';
  end if;
  if v_intent.buyer_profile_id <> v_user_id then
    raise exception using errcode = '42501', message = 'marketplace_intent_buyer_required';
  end if;
  v_hash := encode(extensions.digest(p_intent_id::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'marketplace:key:' || v_user_id::text || ':intent_buyer_cancel:' || v_key, 0
  ));
  v_replay := public.marketplace_idempotency_replay_v1(
    v_user_id, 'intent_buyer_cancel', v_key, v_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_intent.status not in ('pending', 'accepted', 'cancelled') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_intent_transition';
  end if;
  if v_intent.status <> 'cancelled' then
    update public.marketplace_intents
    set status = 'cancelled'
    where id = p_intent_id;
  end if;
  v_result := jsonb_build_object(
    'intent_id', v_intent.id,
    'listing_id', v_intent.listing_id,
    'kind', v_intent.kind,
    'status', 'cancelled'
  );
  return public.marketplace_store_idempotency_v1(
    v_user_id, 'intent_buyer_cancel', v_key, v_hash,
    v_intent.listing_id, v_result
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Least privilege. No authenticated policy exists on raw Marketplace tables;
-- clients receive only the stable projections above.
-- ---------------------------------------------------------------------------

alter table public.marketplace_seller_profiles enable row level security;
alter table public.marketplace_seller_profiles force row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listings force row level security;
alter table public.marketplace_listing_prices enable row level security;
alter table public.marketplace_listing_prices force row level security;
alter table public.marketplace_listing_media enable row level security;
alter table public.marketplace_listing_media force row level security;
alter table public.marketplace_favorites enable row level security;
alter table public.marketplace_favorites force row level security;
alter table public.marketplace_cart_items enable row level security;
alter table public.marketplace_cart_items force row level security;
alter table public.marketplace_intents enable row level security;
alter table public.marketplace_intents force row level security;
alter table public.marketplace_idempotency enable row level security;
alter table public.marketplace_idempotency force row level security;

revoke all on public.marketplace_seller_profiles from anon, authenticated;
revoke all on public.marketplace_listings from anon, authenticated;
revoke all on public.marketplace_listing_prices from anon, authenticated;
revoke all on public.marketplace_listing_media from anon, authenticated;
revoke all on public.marketplace_favorites from anon, authenticated;
revoke all on public.marketplace_cart_items from anon, authenticated;
revoke all on public.marketplace_intents from anon, authenticated;
revoke all on public.marketplace_idempotency from anon, authenticated;

grant all on public.marketplace_seller_profiles to service_role;
grant all on public.marketplace_listings to service_role;
grant all on public.marketplace_listing_prices to service_role;
grant all on public.marketplace_listing_media to service_role;
grant all on public.marketplace_favorites to service_role;
grant all on public.marketplace_cart_items to service_role;
grant all on public.marketplace_intents to service_role;
grant all on public.marketplace_idempotency to service_role;

revoke execute on function public.marketplace_touch_updated_at_v1()
  from public, anon, authenticated;
revoke execute on function public.marketplace_validate_listing_media_v1()
  from public, anon, authenticated;
revoke execute on function public.marketplace_require_profile_v1()
  from public, anon, authenticated;
revoke execute on function public.marketplace_idempotency_replay_v1(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.marketplace_store_idempotency_v1(uuid, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.marketplace_jsonb_integer_v1(jsonb, text, bigint, bigint, boolean)
  from public, anon, authenticated;
revoke execute on function public.marketplace_create_intent_v1(uuid, text, integer, date, date, timestamptz, text, text)
  from public, anon, authenticated;

revoke execute on function public.list_marketplace_catalog_v1(timestamptz, uuid, integer, text, text, text, uuid[])
  from public;
grant execute on function public.list_marketplace_catalog_v1(timestamptz, uuid, integer, text, text, text, uuid[])
  to anon, authenticated, service_role;

revoke execute on function public.get_my_marketplace_state_v1()
  from public, anon;
grant execute on function public.get_my_marketplace_state_v1()
  to authenticated, service_role;
revoke execute on function public.set_marketplace_favorite_v1(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_marketplace_favorite_v1(uuid, boolean, text)
  to authenticated, service_role;
revoke execute on function public.set_marketplace_cart_item_v1(uuid, integer, text)
  from public, anon;
grant execute on function public.set_marketplace_cart_item_v1(uuid, integer, text)
  to authenticated, service_role;
revoke execute on function public.create_marketplace_listing_draft_v1(jsonb, text)
  from public, anon;
grant execute on function public.create_marketplace_listing_draft_v1(jsonb, text)
  to authenticated, service_role;
revoke execute on function public.list_my_marketplace_listing_drafts_v1(integer)
  from public, anon;
grant execute on function public.list_my_marketplace_listing_drafts_v1(integer)
  to authenticated, service_role;
revoke execute on function public.update_marketplace_listing_draft_v1(uuid, bigint, jsonb, text)
  from public, anon;
grant execute on function public.update_marketplace_listing_draft_v1(uuid, bigint, jsonb, text)
  to authenticated, service_role;
revoke execute on function public.create_marketplace_rental_request_v1(uuid, date, date, text, text)
  from public, anon;
grant execute on function public.create_marketplace_rental_request_v1(uuid, date, date, text, text)
  to authenticated, service_role;
revoke execute on function public.create_marketplace_service_booking_v1(uuid, timestamptz, text, text)
  from public, anon;
grant execute on function public.create_marketplace_service_booking_v1(uuid, timestamptz, text, text)
  to authenticated, service_role;
revoke execute on function public.join_marketplace_collective_v1(uuid, integer, text)
  from public, anon;
grant execute on function public.join_marketplace_collective_v1(uuid, integer, text)
  to authenticated, service_role;
revoke execute on function public.list_my_marketplace_intents_v1(text, text, integer)
  from public, anon;
grant execute on function public.list_my_marketplace_intents_v1(text, text, integer)
  to authenticated, service_role;
revoke execute on function public.update_marketplace_intent_status_v1(uuid, text, text)
  from public, anon;
grant execute on function public.update_marketplace_intent_status_v1(uuid, text, text)
  to authenticated, service_role;
revoke execute on function public.cancel_marketplace_intent_v1(uuid, text)
  from public, anon;
grant execute on function public.cancel_marketplace_intent_v1(uuid, text)
  to authenticated, service_role;

commit;
