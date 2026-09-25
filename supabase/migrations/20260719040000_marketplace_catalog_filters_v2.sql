begin;

-- Marketplace catalogue filters v2.
--
-- This migration is additive: v1 remains available for deployed clients. The
-- browser still receives only the safe v1 projection; filters are evaluated
-- behind a SECURITY DEFINER RPC and raw Marketplace tables remain private.

alter table public.marketplace_seller_profiles
  add column if not exists seller_kind text;

update public.marketplace_seller_profiles seller
set seller_kind = case
  when lower(coalesce(profile.primary_role_key, profile.artist_type, '')) = 'studio'
    then 'studio'
  else 'artist'
end
from public.profiles profile
where seller.profile_id = profile.id
  and seller.seller_kind is null;

update public.marketplace_seller_profiles
set seller_kind = 'artist'
where seller_kind is null;

alter table public.marketplace_seller_profiles
  alter column seller_kind set default 'artist',
  alter column seller_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.marketplace_seller_profiles'::regclass
      and conname = 'marketplace_seller_profiles_kind_check'
  ) then
    alter table public.marketplace_seller_profiles
      add constraint marketplace_seller_profiles_kind_check
      check (seller_kind in ('store', 'studio', 'artist'));
  end if;
end;
$$;

create index if not exists marketplace_seller_profiles_kind_idx
  on public.marketplace_seller_profiles(seller_kind, seller_status);

create index if not exists marketplace_listing_prices_primary_amount_idx
  on public.marketplace_listing_prices(amount_minor, listing_id)
  where price_kind = 'primary';

create index if not exists marketplace_listings_catalog_filter_idx
  on public.marketplace_listings(
    pillar, condition_code, preparation_days, published_at desc, id desc
  )
  where status = 'published';

-- Privileged maintenance jobs can predate the current composer validation.
-- These total functions keep catalogue reads safe when legacy JSON contains a
-- malformed availability value: invalid values fall back to preparation_days.
create or replace function public.marketplace_safe_date_v1(p_value text)
returns date
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_value::date;
exception when others then
  return null;
end;
$$;

create or replace function public.marketplace_safe_timestamptz_v1(p_value text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timestamp timestamptz;
begin
  if p_value is null
     or p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$' then
    return null;
  end if;
  v_timestamp := p_value::timestamptz;
  if not isfinite(v_timestamp) then
    return null;
  end if;
  return v_timestamp;
exception when others then
  return null;
end;
$$;

create or replace function public.set_my_marketplace_seller_kind_v1(
  p_seller_kind text
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller_kind text := lower(trim(coalesce(p_seller_kind, '')));
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if v_seller_kind not in ('artist', 'studio', 'store') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_seller_kind';
  end if;

  insert into public.marketplace_seller_profiles(profile_id, seller_kind)
  values (v_user_id, v_seller_kind)
  on conflict (profile_id) do update
    set seller_kind = excluded.seller_kind;

  return v_seller_kind;
end;
$$;

create or replace function public.get_my_marketplace_seller_kind_v1()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller_kind text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  select seller.seller_kind
    into v_seller_kind
  from public.marketplace_seller_profiles seller
  where seller.profile_id = v_user_id;
  return coalesce(v_seller_kind, 'artist');
end;
$$;

create or replace function public.create_marketplace_listing_draft_v2(
  p_payload jsonb,
  p_idempotency_key text,
  p_seller_kind text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.set_my_marketplace_seller_kind_v1(p_seller_kind);
  return public.create_marketplace_listing_draft_v1(
    p_payload,
    p_idempotency_key
  );
end;
$$;

create or replace function public.update_marketplace_listing_draft_v2(
  p_listing_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_idempotency_key text,
  p_seller_kind text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.set_my_marketplace_seller_kind_v1(p_seller_kind);
  return public.update_marketplace_listing_draft_v1(
    p_listing_id,
    p_expected_version,
    p_payload,
    p_idempotency_key
  );
end;
$$;

create or replace function public.get_marketplace_catalog_capabilities_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'catalog_version', 2,
    'cursor_version', 1,
    'maximum_page_size', 100,
    'filters', jsonb_build_object(
      'multiple_categories', true,
      'multiple_conditions', true,
      'fulfillment_any_match', true,
      'favorites_requires_authentication', true,
      'availability', jsonb_build_object(
        'source',
          'rental_terms.available_from | service_terms.event_date | marketplace_listings.preparation_days',
        'contract', 'canonical availability date, falling back to preparation lead time',
        'values', jsonb_build_array('any', 'now', '7-days', '30-days')
      )
    ),
    'sorts', jsonb_build_object(
      'recommended', jsonb_build_object(
        'supported', true,
        'source', 'published_at'
      ),
      'price-asc', jsonb_build_object(
        'supported', true,
        'source', 'marketplace_listing_prices.primary.amount_minor'
      ),
      'price-desc', jsonb_build_object(
        'supported', true,
        'source', 'marketplace_listing_prices.primary.amount_minor'
      ),
      'rating', jsonb_build_object(
        'supported', true,
        'source', 'marketplace_seller_profiles.rating_basis_points'
      ),
      'popular', jsonb_build_object(
        'supported', true,
        'source', 'marketplace_seller_profiles.completed_orders_count'
      ),
      'distance', jsonb_build_object(
        'supported', false,
        'reason', 'No public, consented seller coordinates are part of the Marketplace catalogue contract.'
      )
    )
  );
$$;

create or replace function public.list_marketplace_catalog_v2(
  p_cursor jsonb default null,
  p_limit integer default 48,
  p_filters jsonb default '{}'::jsonb,
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
  next_cursor_listing_id uuid,
  seller_kind text,
  remote_enabled boolean,
  viewer_favorite boolean,
  availability_bucket text,
  sort_applied text,
  distance_supported boolean,
  distance_km double precision,
  next_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_limit integer := coalesce(p_limit, 48);
  v_pillar text;
  v_categories text[];
  v_price_min bigint;
  v_price_max bigint;
  v_conditions text[];
  v_fulfillment text[];
  v_availability text;
  v_seller_kinds text[];
  v_verified_only boolean;
  v_minimum_grade smallint;
  v_sort text;
  v_favorites_only boolean;
  v_search text;
  v_viewer_id uuid := auth.uid();
  v_listing_ids uuid[];
  v_cursor_sort text;
  v_cursor_sort_value bigint;
  v_cursor_published_at timestamptz;
  v_cursor_listing_id uuid;
  v_known_categories constant text[] := array[
    'synthetiseurs', 'synths', 'synthesizers',
    'interfaces_audio', 'audio_interfaces', 'microphones',
    'casques', 'headphones', 'guitares', 'guitars',
    'batteries_electroniques', 'electronic_drums',
    'dj_vinyle', 'dj_et_vinyle', 'dj_and_vinyl',
    'controleurs_midi', 'midi_controllers', 'monitoring',
    'enregistreurs', 'recorders', 'mix_mastering',
    'mix_et_mastering', 'cours_coaching', 'cours_et_coaching',
    'courses_coaching', 'billetterie', 'ticketing',
    'rooms_studios', 'rooms_et_studios', 'rooms_and_studios',
    'autres', 'other'
  ];
begin
  if jsonb_typeof(v_filters) is distinct from 'object'
     or octet_length(v_filters::text) > 16384
     or exists (
       select 1
       from jsonb_object_keys(v_filters) supplied(key)
       where supplied.key <> all(array[
         'pillar', 'categories', 'priceMinMinor', 'priceMaxMinor',
         'conditions', 'fulfillment', 'availability', 'sellerKinds',
         'verifiedOnly', 'minimumGrade', 'sort', 'favoritesOnly', 'search'
       ]::text[])
     ) then
    raise exception using errcode = '22023', message = 'invalid_marketplace_filters';
  end if;

  if (v_filters ? 'pillar')
     and jsonb_typeof(v_filters -> 'pillar') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_pillar';
  end if;
  v_pillar := nullif(trim(coalesce(v_filters ->> 'pillar', 'all')), '');
  if v_pillar is null or v_pillar = 'all' then
    v_pillar := null;
  elsif v_pillar not in ('new', 'used', 'rental', 'services', 'collective') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_pillar';
  end if;

  if v_filters ? 'categories' then
    if jsonb_typeof(v_filters -> 'categories') <> 'array'
       or jsonb_array_length(v_filters -> 'categories') > 50
       or exists (
         select 1
         from jsonb_array_elements(v_filters -> 'categories') item(value)
         where jsonb_typeof(item.value) <> 'string'
           or char_length(trim(item.value #>> '{}')) not between 1 and 80
       ) then
      raise exception using errcode = '22023', message = 'invalid_marketplace_categories';
    end if;
    select array_agg(
      distinct lower(replace(trim(item.value), '-', '_'))
      order by lower(replace(trim(item.value), '-', '_'))
    )
      into v_categories
    from jsonb_array_elements_text(v_filters -> 'categories') item(value);
  end if;

  v_price_min := public.marketplace_jsonb_integer_v1(
    v_filters, 'priceMinMinor', 0, 1000000000000, false
  );
  v_price_max := public.marketplace_jsonb_integer_v1(
    v_filters, 'priceMaxMinor', 0, 1000000000000, false
  );
  if v_price_min is not null and v_price_max is not null
     and v_price_min > v_price_max then
    raise exception using errcode = '22023', message = 'invalid_marketplace_price_range';
  end if;

  if v_filters ? 'conditions' then
    if jsonb_typeof(v_filters -> 'conditions') <> 'array'
       or jsonb_array_length(v_filters -> 'conditions') > 20
       or exists (
         select 1
         from jsonb_array_elements(v_filters -> 'conditions') item(value)
         where jsonb_typeof(item.value) <> 'string'
           or char_length(trim(item.value #>> '{}')) not between 1 and 80
       ) then
      raise exception using errcode = '22023', message = 'invalid_marketplace_conditions';
    end if;
    select array_agg(
      distinct lower(replace(trim(item.value), '_', '-'))
      order by lower(replace(trim(item.value), '_', '-'))
    )
      into v_conditions
    from jsonb_array_elements_text(v_filters -> 'conditions') item(value);
  end if;

  if v_filters ? 'fulfillment' then
    if jsonb_typeof(v_filters -> 'fulfillment') <> 'array'
       or jsonb_array_length(v_filters -> 'fulfillment') > 3
       or exists (
         select 1
         from jsonb_array_elements(v_filters -> 'fulfillment') item(value)
         where jsonb_typeof(item.value) <> 'string'
           or (item.value #>> '{}') not in ('shipping', 'pickup', 'remote')
       ) then
      raise exception using errcode = '22023', message = 'invalid_marketplace_fulfillment';
    end if;
    select array_agg(distinct item.value order by item.value)
      into v_fulfillment
    from jsonb_array_elements_text(v_filters -> 'fulfillment') item(value);
  end if;

  if (v_filters ? 'availability')
     and jsonb_typeof(v_filters -> 'availability') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_availability';
  end if;
  v_availability := coalesce(v_filters ->> 'availability', 'any');
  if v_availability not in ('any', 'now', '7-days', '30-days') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_availability';
  end if;

  if v_filters ? 'sellerKinds' then
    if jsonb_typeof(v_filters -> 'sellerKinds') <> 'array'
       or jsonb_array_length(v_filters -> 'sellerKinds') > 3
       or exists (
         select 1
         from jsonb_array_elements(v_filters -> 'sellerKinds') item(value)
         where jsonb_typeof(item.value) <> 'string'
           or (item.value #>> '{}') not in ('store', 'studio', 'artist')
       ) then
      raise exception using errcode = '22023', message = 'invalid_marketplace_seller_kinds';
    end if;
    select array_agg(distinct item.value order by item.value)
      into v_seller_kinds
    from jsonb_array_elements_text(v_filters -> 'sellerKinds') item(value);
  end if;

  if (v_filters ? 'verifiedOnly')
     and jsonb_typeof(v_filters -> 'verifiedOnly') not in ('boolean', 'null') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_verified_filter';
  end if;
  v_verified_only := coalesce((v_filters ->> 'verifiedOnly')::boolean, false);

  if v_filters ? 'minimumGrade' then
    v_minimum_grade := public.marketplace_jsonb_integer_v1(
      v_filters, 'minimumGrade', 1, 6, false
    )::smallint;
  end if;

  if (v_filters ? 'sort')
     and jsonb_typeof(v_filters -> 'sort') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_sort';
  end if;
  v_sort := coalesce(v_filters ->> 'sort', 'recommended');
  if v_sort = 'distance' then
    raise exception using
      errcode = '0A000',
      message = 'marketplace_distance_sort_unavailable',
      detail = 'The catalogue has no public, consented seller coordinates.',
      hint = 'Use get_marketplace_catalog_capabilities_v1() before offering this sort.';
  elsif v_sort not in (
    'recommended', 'price-asc', 'price-desc', 'rating', 'popular'
  ) then
    raise exception using errcode = '22023', message = 'invalid_marketplace_sort';
  end if;

  if (v_filters ? 'favoritesOnly')
     and jsonb_typeof(v_filters -> 'favoritesOnly') not in ('boolean', 'null') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_favorites_filter';
  end if;
  v_favorites_only := coalesce((v_filters ->> 'favoritesOnly')::boolean, false);
  if v_favorites_only then
    v_viewer_id := public.marketplace_require_profile_v1();
  end if;

  if (v_filters ? 'search')
     and jsonb_typeof(v_filters -> 'search') not in ('string', 'null') then
    raise exception using errcode = '22023', message = 'invalid_marketplace_search';
  end if;
  v_search := nullif(trim(coalesce(v_filters ->> 'search', '')), '');
  if v_search is not null and char_length(v_search) > 120 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_search';
  end if;

  if p_listing_ids is not null then
    if cardinality(p_listing_ids) not between 1 and 100
       or array_position(p_listing_ids, null) is not null then
      raise exception using errcode = '22023', message = 'invalid_marketplace_listing_ids';
    end if;
    select array_agg(distinct requested.listing_id order by requested.listing_id)
      into v_listing_ids
    from unnest(p_listing_ids) requested(listing_id);

    if p_cursor is not null or v_filters <> '{}'::jsonb then
      raise exception using
        errcode = '22023', message = 'invalid_marketplace_listing_ids_mode';
    end if;
    -- Exact hydration is an all-or-nothing lookup. Match v1 by ignoring the
    -- discovery page size and returning every distinct requested listing.
    v_limit := cardinality(v_listing_ids);
  end if;

  if v_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_marketplace_limit';
  end if;

  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object'
       or octet_length(p_cursor::text) > 2048
       or exists (
         select 1
         from jsonb_object_keys(p_cursor) supplied(key)
         where supplied.key <> all(array[
           'version', 'sort', 'sortValue', 'publishedAt', 'listingId'
         ]::text[])
       )
       or jsonb_typeof(p_cursor -> 'version') <> 'number'
       or jsonb_typeof(p_cursor -> 'sort') <> 'string'
       or jsonb_typeof(p_cursor -> 'publishedAt') <> 'string'
       or jsonb_typeof(p_cursor -> 'listingId') <> 'string'
       or not (p_cursor ?& array[
         'version', 'sort', 'sortValue', 'publishedAt', 'listingId'
       ])
       or coalesce(p_cursor ->> 'version', '') <> '1'
       or p_cursor ->> 'sort' is distinct from v_sort
       or nullif(p_cursor ->> 'publishedAt', '') is null
       or nullif(p_cursor ->> 'listingId', '') is null then
      raise exception using errcode = '22023', message = 'invalid_marketplace_cursor';
    end if;
    begin
      v_cursor_sort := p_cursor ->> 'sort';
      v_cursor_published_at := public.marketplace_safe_timestamptz_v1(
        p_cursor ->> 'publishedAt'
      );
      if v_cursor_published_at is null then
        raise exception using errcode = '22023', message = 'invalid_marketplace_cursor';
      end if;
      v_cursor_listing_id := (p_cursor ->> 'listingId')::uuid;
      if v_sort <> 'recommended' then
        v_cursor_sort_value := public.marketplace_jsonb_integer_v1(
          p_cursor, 'sortValue', 0, 1000000000000, true
        );
      elsif jsonb_typeof(p_cursor -> 'sortValue') <> 'null' then
        raise exception using errcode = '22023', message = 'invalid_marketplace_cursor';
      end if;
    exception
      when others then
        raise exception using errcode = '22023', message = 'invalid_marketplace_cursor';
    end;
  end if;

  return query
  with eligible as (
    select
      listing.id,
      listing.published_at,
      listing.remote_enabled,
      listing.preparation_days,
      case
        when listing.pillar = 'rental' then coalesce(
          public.marketplace_safe_date_v1(listing.terms ->> 'available_from'),
          current_date + listing.preparation_days
        )
        when listing.pillar = 'services' then coalesce(
          public.marketplace_safe_timestamptz_v1(
            listing.terms ->> 'event_date'
          )::date,
          current_date + listing.preparation_days
        )
        else current_date + listing.preparation_days
      end as available_on,
      seller.seller_kind,
      primary_price.amount_minor,
      case
        when v_sort in ('price-asc', 'price-desc') then primary_price.amount_minor
        when v_sort = 'rating' then seller.rating_basis_points::bigint
        when v_sort = 'popular' then seller.completed_orders_count::bigint
        else null::bigint
      end as sort_value,
      case
        when v_viewer_id is null then false
        else exists (
          select 1
          from public.marketplace_favorites favorite
          where favorite.profile_id = v_viewer_id
            and favorite.listing_id = listing.id
        )
      end as viewer_favorite
    from public.marketplace_listings listing
    join public.marketplace_seller_profiles seller
      on seller.profile_id = listing.seller_profile_id
     and seller.seller_status = 'active'
    join public.profiles profile
      on profile.id = listing.seller_profile_id
    left join public.profile_grade_state grade_state
      on grade_state.profile_id = listing.seller_profile_id
    join public.marketplace_listing_prices primary_price
      on primary_price.listing_id = listing.id
     and primary_price.price_kind = 'primary'
    where listing.status = 'published'
      and listing.published_at is not null
      and coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
      and (v_listing_ids is null or listing.id = any(v_listing_ids))
      and (v_pillar is null or listing.pillar = v_pillar)
      and (
        v_categories is null
        or lower(replace(trim(listing.category_code), '-', '_')) = any(v_categories)
        or (
          ('autres' = any(v_categories) or 'other' = any(v_categories))
          and (
            lower(replace(trim(listing.category_code), '-', '_'))
              = any(array['autres', 'other']::text[])
            or lower(replace(trim(listing.category_code), '-', '_'))
              <> all(v_known_categories)
          )
        )
      )
      and (v_price_min is null or primary_price.amount_minor >= v_price_min)
      and (v_price_max is null or primary_price.amount_minor <= v_price_max)
      and (
        v_conditions is null
        or case
          when listing.pillar = 'new' then 'new'
          when listing.condition_code is null then
            case when listing.pillar = 'used' then 'excellent' else 'new' end
          when lower(replace(trim(listing.condition_code), '_', '-'))
            in ('new', 'neuf') then 'new'
          when lower(replace(trim(listing.condition_code), '_', '-'))
            in ('mint', 'comme-neuf') then 'mint'
          when lower(replace(trim(listing.condition_code), '_', '-'))
            = 'excellent' then 'excellent'
          when lower(replace(trim(listing.condition_code), '_', '-'))
            in ('very-good', 'tres-bon') then 'very-good'
          when listing.pillar = 'used' then 'very-good'
          else 'new'
        end = any(v_conditions)
      )
      and (
        v_fulfillment is null
        or ('shipping' = any(v_fulfillment) and listing.shipping_enabled)
        or ('pickup' = any(v_fulfillment) and listing.pickup_enabled)
        or ('remote' = any(v_fulfillment) and listing.remote_enabled)
      )
      and (
        v_availability = 'any'
        or (
          v_availability = 'now'
          and case
            when listing.pillar = 'rental' then coalesce(
              public.marketplace_safe_date_v1(listing.terms ->> 'available_from'),
              current_date + listing.preparation_days
            )
            when listing.pillar = 'services' then coalesce(
              public.marketplace_safe_timestamptz_v1(
                listing.terms ->> 'event_date'
              )::date,
              current_date + listing.preparation_days
            )
            else current_date + listing.preparation_days
          end <= current_date
        )
        or (
          v_availability = '7-days'
          and case
            when listing.pillar = 'rental' then coalesce(
              public.marketplace_safe_date_v1(listing.terms ->> 'available_from'),
              current_date + listing.preparation_days
            )
            when listing.pillar = 'services' then coalesce(
              public.marketplace_safe_timestamptz_v1(
                listing.terms ->> 'event_date'
              )::date,
              current_date + listing.preparation_days
            )
            else current_date + listing.preparation_days
          end <= current_date + 7
        )
        or (
          v_availability = '30-days'
          and case
            when listing.pillar = 'rental' then coalesce(
              public.marketplace_safe_date_v1(listing.terms ->> 'available_from'),
              current_date + listing.preparation_days
            )
            when listing.pillar = 'services' then coalesce(
              public.marketplace_safe_timestamptz_v1(
                listing.terms ->> 'event_date'
              )::date,
              current_date + listing.preparation_days
            )
            else current_date + listing.preparation_days
          end <= current_date + 30
        )
      )
      and (v_seller_kinds is null or seller.seller_kind = any(v_seller_kinds))
      and (not v_verified_only or coalesce(profile.is_verified, false))
      and (
        v_minimum_grade is null
        or (
          coalesce(profile.public_profile_preferences ->> 'show_grade', 'true') <> 'false'
          and grade_state.level >= v_minimum_grade
        )
      )
      and (
        not v_favorites_only
        or exists (
          select 1
          from public.marketplace_favorites favorite
          where favorite.profile_id = v_viewer_id
            and favorite.listing_id = listing.id
        )
      )
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
  ),
  after_cursor as (
    select eligible.*
    from eligible
    where p_cursor is null
      or (
        v_sort = 'recommended'
        and (eligible.published_at, eligible.id)
          < (v_cursor_published_at, v_cursor_listing_id)
      )
      or (
        v_sort = 'price-asc'
        and (
          eligible.sort_value > v_cursor_sort_value
          or (
            eligible.sort_value = v_cursor_sort_value
            and (eligible.published_at, eligible.id)
              < (v_cursor_published_at, v_cursor_listing_id)
          )
        )
      )
      or (
        v_sort in ('price-desc', 'rating', 'popular')
        and (
          eligible.sort_value < v_cursor_sort_value
          or (
            eligible.sort_value = v_cursor_sort_value
            and (eligible.published_at, eligible.id)
              < (v_cursor_published_at, v_cursor_listing_id)
          )
        )
      )
  ),
  ranked as (
    select
      after_cursor.*,
      row_number() over (
        order by
          case when v_sort = 'price-asc' then after_cursor.sort_value end asc,
          case when v_sort in ('price-desc', 'rating', 'popular')
            then after_cursor.sort_value end desc,
          after_cursor.published_at desc,
          after_cursor.id desc
      ) as ordinal
    from after_cursor
  ),
  page as (
    select ranked.*
    from ranked
    where ranked.ordinal <= v_limit + 1
  ),
  page_meta as (
    select exists(select 1 from page where page.ordinal = v_limit + 1) as has_more
  ),
  selected_ids as (
    select array_agg(page.id order by page.ordinal) as ids
    from page
    where page.ordinal <= v_limit
  )
  select
    catalog.listing_id,
    catalog.seller_profile_id,
    catalog.seller_display_name,
    catalog.seller_username,
    catalog.seller_avatar_url,
    catalog.seller_grade_level,
    catalog.seller_verified,
    catalog.seller_rating_basis_points,
    catalog.seller_rating_count,
    catalog.seller_completed_orders_count,
    catalog.seller_response_time_bucket,
    catalog.slug,
    catalog.pillar,
    catalog.category_code,
    catalog.title,
    catalog.short_description,
    catalog.description,
    catalog.brand,
    catalog.model,
    catalog.condition_code,
    catalog.condition_label,
    catalog.cover_url,
    catalog.cover_storage_bucket,
    catalog.cover_storage_path,
    catalog.cover_alt,
    catalog.badge_label,
    catalog.city_label,
    catalog.area_label,
    catalog.pickup_enabled,
    catalog.shipping_enabled,
    catalog.shipping_amount_minor,
    catalog.currency_code,
    catalog.unit_amount_minor,
    catalog.compare_at_amount_minor,
    catalog.price_unit,
    catalog.max_quantity,
    catalog.preparation_days,
    catalog.new_terms,
    catalog.used_terms,
    case
      when catalog.rental_terms is not null then jsonb_set(
        catalog.rental_terms,
        '{available_from}',
        to_jsonb(page.available_on::text),
        true
      )
      else null
    end,
    case
      when catalog.service_terms is not null then jsonb_set(
        catalog.service_terms,
        '{event_date}',
        coalesce(
          to_jsonb(public.marketplace_safe_timestamptz_v1(
            catalog.service_terms ->> 'event_date'
          )),
          'null'::jsonb
        ),
        true
      )
      else null
    end,
    catalog.collective_terms,
    catalog.published_at,
    case
      when page.ordinal = v_limit and page_meta.has_more then page.published_at
      else null
    end,
    case
      when page.ordinal = v_limit and page_meta.has_more then page.id
      else null
    end,
    page.seller_kind,
    page.remote_enabled,
    page.viewer_favorite,
    case
      when page.available_on <= current_date then 'now'
      when page.available_on <= current_date + 7 then '7-days'
      when page.available_on <= current_date + 30 then '30-days'
      else 'later'
    end,
    v_sort,
    false,
    null::double precision,
    case
      when page.ordinal = v_limit and page_meta.has_more then
        jsonb_build_object(
          'version', 1,
          'sort', v_sort,
          'sortValue', case when v_sort = 'recommended' then null else page.sort_value end,
          'publishedAt', page.published_at,
          'listingId', page.id
        )
      else null
    end
  from selected_ids
  cross join page_meta
  cross join lateral public.list_marketplace_catalog_v1(
    null, null, cardinality(selected_ids.ids), null, null, null, selected_ids.ids
  ) catalog
  join page on page.id = catalog.listing_id and page.ordinal <= v_limit
  where selected_ids.ids is not null
  order by
    case when v_sort = 'price-asc' then page.sort_value end asc,
    case when v_sort in ('price-desc', 'rating', 'popular')
      then page.sort_value end desc,
    page.published_at desc,
    page.id desc;
end;
$$;

revoke execute on function public.get_marketplace_catalog_capabilities_v1()
  from public;
revoke execute on function public.marketplace_safe_date_v1(text)
  from public, anon, authenticated;
revoke execute on function public.marketplace_safe_timestamptz_v1(text)
  from public, anon, authenticated;
revoke execute on function public.set_my_marketplace_seller_kind_v1(text)
  from public, anon;
revoke execute on function public.get_my_marketplace_seller_kind_v1()
  from public, anon;
revoke execute on function public.create_marketplace_listing_draft_v2(jsonb, text, text)
  from public, anon;
revoke execute on function public.update_marketplace_listing_draft_v2(uuid, bigint, jsonb, text, text)
  from public, anon;
revoke execute on function public.list_marketplace_catalog_v2(jsonb, integer, jsonb, uuid[])
  from public;

grant execute on function public.get_marketplace_catalog_capabilities_v1()
  to anon, authenticated, service_role;
grant execute on function public.set_my_marketplace_seller_kind_v1(text)
  to authenticated, service_role;
grant execute on function public.get_my_marketplace_seller_kind_v1()
  to authenticated, service_role;
grant execute on function public.create_marketplace_listing_draft_v2(jsonb, text, text)
  to authenticated, service_role;
grant execute on function public.update_marketplace_listing_draft_v2(uuid, bigint, jsonb, text, text)
  to authenticated, service_role;
grant execute on function public.list_marketplace_catalog_v2(jsonb, integer, jsonb, uuid[])
  to anon, authenticated, service_role;

commit;
