begin;

create extension if not exists pgtap with schema extensions;

select plan(74);

-- ---------------------------------------------------------------------------
-- Additive contract and privilege boundary.
-- ---------------------------------------------------------------------------

select has_column(
  'public', 'marketplace_seller_profiles', 'seller_kind',
  'seller profiles expose a canonical seller kind to the server RPC'
);
select ok(
  to_regprocedure(
    'public.list_marketplace_catalog_v2(jsonb,integer,jsonb,uuid[])'
  ) is not null,
  'filtered catalogue v2 signature exists'
);
select ok(
  exists (
    select 1
    from pg_proc function_row
    where function_row.oid =
      'public.list_marketplace_catalog_v2(jsonb,integer,jsonb,uuid[])'::regprocedure
      and function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=public, pg_temp']
  ),
  'catalogue v2 is security definer with a fixed safe search path'
);
select ok(
  to_regprocedure('public.get_marketplace_catalog_capabilities_v1()') is not null,
  'catalogue capability signature exists'
);
select ok(
  to_regprocedure('public.set_my_marketplace_seller_kind_v1(text)') is not null,
  'authenticated sellers have a canonical seller-kind mutation'
);
select ok(
  to_regprocedure('public.get_my_marketplace_seller_kind_v1()') is not null,
  'authenticated sellers can reload their canonical classification'
);
select ok(
  to_regprocedure(
    'public.create_marketplace_listing_draft_v2(jsonb,text,text)'
  ) is not null
  and to_regprocedure(
    'public.update_marketplace_listing_draft_v2(uuid,bigint,jsonb,text,text)'
  ) is not null,
  'seller classification and draft mutations have transactional wrappers'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.set_my_marketplace_seller_kind_v1(text)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.get_my_marketplace_seller_kind_v1()', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.set_my_marketplace_seller_kind_v1(text)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.get_my_marketplace_seller_kind_v1()', 'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.create_marketplace_listing_draft_v2(jsonb,text,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.update_marketplace_listing_draft_v2(uuid,bigint,jsonb,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.create_marketplace_listing_draft_v2(jsonb,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.update_marketplace_listing_draft_v2(uuid,bigint,jsonb,text,text)',
    'execute'
  ),
  'only authenticated clients can choose their seller classification'
);
select ok(
  has_function_privilege(
    'anon',
    'public.list_marketplace_catalog_v2(jsonb,integer,jsonb,uuid[])',
    'execute'
  ),
  'anonymous clients can invoke the safe filtered catalogue'
);
select ok(
  has_function_privilege(
    'anon', 'public.get_marketplace_catalog_capabilities_v1()', 'execute'
  ),
  'anonymous clients can negotiate catalogue capabilities'
);
select ok(
  not has_function_privilege(
    'anon', 'public.marketplace_safe_date_v1(text)', 'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.marketplace_safe_timestamptz_v1(text)', 'execute'
  ),
  'browser roles cannot invoke internal availability parsers'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.marketplace_seller_profiles', 'select'
  ),
  'seller kinds do not make the raw seller table browser-readable'
);
select is(
  (public.get_marketplace_catalog_capabilities_v1()
    #>> '{sorts,distance,supported}')::boolean,
  false,
  'distance sort is explicitly unsupported'
);
select ok(
  public.get_marketplace_catalog_capabilities_v1()
    #>> '{filters,availability,source}'
    like 'rental_terms.available_from%service_terms.event_date%preparation_days',
  'capabilities publish the canonical rental and service availability sources'
);
select is(
  public.marketplace_safe_timestamptz_v1('infinity'),
  null::timestamptz,
  'the internal parser rejects non-finite and non-ISO timestamps'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid =
      'public.marketplace_seller_profiles'::regclass
      and constraint_row.conname = 'marketplace_seller_profiles_kind_check'
  ),
  'seller kind values are database constrained'
);

-- ---------------------------------------------------------------------------
-- Public seller, buyer and deterministic catalogue fixtures.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'filter-store@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Filter Store"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '92000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'filter-buyer@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Filter Buyer"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '93000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'filter-artist@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Filter Artist"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'filter_store', 'Filter Store', 'avatar_7', 'producer', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'store seller completes onboarding'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'filter_buyer', 'Filter Buyer', 'avatar_8', 'dj', 'Paris', 'FR',
    48.8570, 2.3530, false, true
  )$$,
  'buyer completes onboarding'
);
select lives_ok(
  $$select public.set_my_marketplace_seller_kind_v1('studio')$$,
  'an authenticated owner can set a canonical seller classification'
);
select is(
  public.get_my_marketplace_seller_kind_v1(),
  'studio',
  'the owner can reload the seller classification through a private RPC'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v2(
    '{}'::jsonb,
    'listing:94000000-0000-4000-8000-000000000099',
    'store'
  )$$,
  '22023', 'invalid_marketplace_payload',
  'a failed draft rejects the complete seller-classification transaction'
);
select is(
  public.get_my_marketplace_seller_kind_v1(),
  'studio',
  'a failed draft rolls the seller classification back to its prior value'
);

reset role;
select is(
  (
    select seller_kind
    from public.marketplace_seller_profiles
    where profile_id = '92000000-0000-4000-8000-000000000002'
  ),
  'studio',
  'the selected seller classification is persisted server-side'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'filter_artist', 'Filter Artist', 'avatar_9', 'instrumentalist', 'Paris', 'FR',
    48.8580, 2.3540, false, true
  )$$,
  'artist seller completes onboarding'
);

reset role;
insert into public.marketplace_seller_profiles (
  profile_id, seller_kind, rating_basis_points, rating_count,
  completed_orders_count, response_time_bucket
)
values
  (
    '91000000-0000-4000-8000-000000000001', 'store',
    49000, 80, 30, 'under_1h'
  ),
  (
    '93000000-0000-4000-8000-000000000003', 'artist',
    45000, 12, 5, 'same_day'
  );

update public.profiles
set is_verified = (id = '91000000-0000-4000-8000-000000000001')
where id in (
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003'
);

update public.profile_grade_state
set level = case
  when profile_id = '91000000-0000-4000-8000-000000000001' then 5
  else 2
end
where profile_id in (
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003'
);

insert into public.marketplace_listings (
  id, seller_profile_id, slug, pillar, category_code, title,
  short_description, description, condition_code, condition_label, status,
  city_label, pickup_enabled, shipping_enabled, remote_enabled,
  preparation_days, max_quantity, terms, published_at
)
values
  (
    '94000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001', 'filter-monitors-new',
    'new', 'studio-monitors', 'Moniteurs neufs',
    'Moniteurs disponibles immédiatement.', 'Moniteurs de studio fiables.',
    'new', 'Neuf', 'published', 'Paris', true, true, false, 0, 2,
    '{"stock":2,"warranty_months":24}'::jsonb, now() - interval '1 hour'
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000001', 'filter-micro-used',
    'used', 'microphones', 'Micro atelier',
    'Micro révisé en atelier.', 'Micro de studio en excellent état.',
    'excellent', 'Excellent', 'published', 'Paris', true, false, false, 3, 1,
    '{"purchase_year":null,"negotiable":false,"condition_notes":null}'::jsonb,
    now() - interval '2 hours'
  ),
  (
    '94000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000001', 'filter-rental',
    'rental', 'dj_gear', 'Console en location',
    'Console disponible sous cinq jours.', 'Console de location complète.',
    'mint', 'Comme neuf', 'published', 'Paris', true, false, false, 40, 1,
    jsonb_build_object(
      'daily_amount_minor', 20000,
      'weekend_amount_minor', 40000,
      'weekly_amount_minor', 120000,
      'deposit_amount_minor', 50000,
      'minimum_days', 1,
      'available_from', (current_date + 5)::text,
      'instant_book', true
    ),
    now() - interval '3 hours'
  ),
  (
    '94000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000001', 'filter-service-event',
    'services', 'coaching', 'Coaching événement',
    'Session programmée sous vingt jours.', 'Coaching à distance.',
    null, null, 'published', 'Paris', false, false, true, 60, 1,
    jsonb_build_object(
      'service_kind', 'coaching',
      'service_format', 'À distance',
      'duration_label', '1 heure',
      'delivery_label', 'Compte rendu personnalisé',
      'next_availability', 'Sous vingt jours',
      'event_date', (now() + interval '20 days')::timestamptz
    ),
    now() - interval '4 hours'
  ),
  (
    '94000000-0000-4000-8000-000000000005',
    '93000000-0000-4000-8000-000000000003', 'filter-monitors-used',
    'new', 'studio_monitors', 'Moniteurs artiste',
    'Moniteurs préparés sous dix jours.', 'Moniteurs seconde série.',
    'very_good', 'Très bon', 'published', 'Paris', false, true, false, 10, 1,
    '{"stock":1,"warranty_months":12}'::jsonb, now() - interval '5 hours'
  ),
  (
    '94000000-0000-4000-8000-000000000006',
    '93000000-0000-4000-8000-000000000003', 'filter-service-legacy',
    'services', 'mastering', 'Mastering immédiat',
    'Service avec ancienne date mal formée.', 'Mastering à distance.',
    null, null, 'published', 'Paris', false, false, true, 0, 1,
    '{
      "service_kind":"production",
      "service_format":"À distance",
      "duration_label":"1 heure",
      "delivery_label":null,
      "next_availability":"demain",
      "event_date":"tomorrow"
    }'::jsonb,
    now() - interval '6 hours'
  );

insert into public.marketplace_listing_prices (
  listing_id, price_kind, currency_code, amount_minor, price_unit
)
values
  ('94000000-0000-4000-8000-000000000001', 'primary', 'EUR', 10000, 'item'),
  ('94000000-0000-4000-8000-000000000002', 'primary', 'EUR', 30000, 'item'),
  ('94000000-0000-4000-8000-000000000003', 'primary', 'EUR', 20000, 'day'),
  ('94000000-0000-4000-8000-000000000004', 'primary', 'EUR', 5000, 'session'),
  ('94000000-0000-4000-8000-000000000005', 'primary', 'EUR', 15000, 'item'),
  ('94000000-0000-4000-8000-000000000006', 'primary', 'EUR', 7000, 'session');

-- ---------------------------------------------------------------------------
-- Safe projection, complete filters and explicit unsupported capabilities.
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select ok(
  (
    select not (to_jsonb(catalogue_row) ? 'email')
      and not (to_jsonb(catalogue_row) ? 'phone')
      and not (to_jsonb(catalogue_row) ? 'latitude')
      and not (to_jsonb(catalogue_row) ? 'longitude')
    from public.list_marketplace_catalog_v2() catalogue_row
    limit 1
  ),
  'v2 projection contains no contact details or seller coordinates'
);
select is(
  (select count(*)::integer from public.list_marketplace_catalog_v2()),
  6,
  'all/default catalogue returns every public fixture'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{
        "pillar":"all","categories":[],"priceMinMinor":null,
        "priceMaxMinor":null,"conditions":[],"fulfillment":[],
        "availability":"any","sellerKinds":[],"verifiedOnly":false,
        "minimumGrade":null,"sort":"recommended",
        "favoritesOnly":false,"search":null
      }'::jsonb
    )
  ),
  6,
  'complete client-shaped defaults including JSON nulls are accepted'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"pillar":"services"}'::jsonb
    )
  ),
  2,
  'pillar filter isolates services'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"categories":["studio_monitors","microphones"]}'::jsonb
    )
  ),
  3,
  'multiple categories use OR semantics'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"categories":["studio-monitors"]}'::jsonb
    )
  ),
  2,
  'legacy hyphen and canonical underscore category codes interoperate'
);
update public.marketplace_listings
set category_code = 'other'
where id = '94000000-0000-4000-8000-000000000001';
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"categories":["autres"]}'::jsonb
    )
  ),
  2,
  'Autres includes its explicit legacy alias and safe unknown category codes'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"priceMinMinor":7000,"priceMaxMinor":15000}'::jsonb
    )
  ),
  3,
  'server-owned primary prices honor inclusive bounds'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"conditions":["new","excellent"]}'::jsonb
    )
  ),
  3,
  'multiple condition codes use OR semantics'
);
update public.marketplace_listings
set condition_code = 'legacy-good'
where id = '94000000-0000-4000-8000-000000000002';
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"conditions":["very-good"]}'::jsonb
    )
  ),
  1,
  'unknown legacy occasion states match the same Très bon state shown by the adapter'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"fulfillment":["shipping"]}'::jsonb
    )
  ),
  2,
  'shipping mode uses the canonical listing flag'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"fulfillment":["remote"]}'::jsonb
    )
  ),
  2,
  'remote mode uses the canonical listing flag'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"pillar":"new","availability":"now"}'::jsonb
    )
  ),
  1,
  'generic immediate availability uses preparation_days'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"pillar":"rental","availability":"7-days"}'::jsonb
    )
  ),
  1,
  'rental availability uses terms.available_from instead of preparation prose'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"categories":["coaching"],"availability":"30-days"}'::jsonb
    )
  ),
  1,
  'service availability uses the canonical terms.event_date timestamp'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"categories":["mastering"],"availability":"now"}'::jsonb
    )
  ),
  1,
  'malformed legacy service dates safely fall back to preparation_days'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"sellerKinds":["store"]}'::jsonb
    )
  ),
  4,
  'seller kind filters use canonical seller metadata'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"verifiedOnly":true}'::jsonb
    )
  ),
  4,
  'verified-only excludes unverified sellers'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"minimumGrade":4}'::jsonb
    )
  ),
  4,
  'minimum grade uses the canonical grade state'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"search":"atelier"}'::jsonb
    )
  ),
  1,
  'safe search remains available through the v2 filter object'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_filters => '{"favoritesOnly":true}'::jsonb
  )$$,
  '42501', 'authentication_required',
  'favorites-only requires an authenticated profile'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_filters => '{"sort":"distance"}'::jsonb
  )$$,
  '0A000', 'marketplace_distance_sort_unavailable',
  'distance never returns a fabricated ordering'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_filters => '{"invented":true}'::jsonb
  )$$,
  '22023', 'invalid_marketplace_filters',
  'unknown filter fields are rejected'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_filters => '{"priceMinMinor":30000,"priceMaxMinor":10000}'::jsonb
  )$$,
  '22023', 'invalid_marketplace_price_range',
  'inverted price bounds are rejected'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_filters => '{"categories":[7]}'::jsonb
  )$$,
  '22023', 'invalid_marketplace_categories',
  'non-text category values are rejected'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.set_marketplace_favorite_v1(
    '94000000-0000-4000-8000-000000000002', true,
    'filter-favorite-add-0001'
  )$$,
  'authenticated buyer favorites a listing'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_filters => '{"favoritesOnly":true}'::jsonb
    )
  ),
  1,
  'favorites-only returns the viewer own favorite'
);
select is(
  (
    select viewer_favorite
    from public.list_marketplace_catalog_v2(
      p_listing_ids => array['94000000-0000-4000-8000-000000000002'::uuid]
    )
  ),
  true,
  'authenticated rows encode viewer favorite state'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select is(
  (
    select listing_id
    from public.list_marketplace_catalog_v2(
      p_filters => '{"sort":"price-asc"}'::jsonb
    )
    limit 1
  ),
  '94000000-0000-4000-8000-000000000004'::uuid,
  'price ascending starts with the lowest server price'
);
select is(
  (
    select listing_id
    from public.list_marketplace_catalog_v2(
      p_filters => '{"sort":"price-desc"}'::jsonb
    )
    limit 1
  ),
  '94000000-0000-4000-8000-000000000002'::uuid,
  'price descending starts with the highest server price'
);
select is(
  (
    select seller_profile_id
    from public.list_marketplace_catalog_v2(
      p_filters => '{"sort":"rating"}'::jsonb
    )
    limit 1
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'rating sort uses authoritative seller rating basis points'
);
select is(
  (
    select seller_profile_id
    from public.list_marketplace_catalog_v2(
      p_filters => '{"sort":"popular"}'::jsonb
    )
    limit 1
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'popular sort uses authoritative completed orders'
);
select ok(
  (
    select next_cursor ?& array[
      'version', 'sort', 'sortValue', 'publishedAt', 'listingId'
    ]
    from public.list_marketplace_catalog_v2(
      p_limit => 2,
      p_filters => '{"sort":"price-asc"}'::jsonb
    )
    where next_cursor is not null
  ),
  'partial page carries the complete versioned sort cursor'
);
select is(
  (
    with first_page as (
      select *
      from public.list_marketplace_catalog_v2(
        p_limit => 2,
        p_filters => '{"sort":"price-asc"}'::jsonb
      )
    ), cursor_row as (
      select next_cursor
      from first_page
      where next_cursor is not null
    )
    select count(*)::integer
    from cursor_row,
      lateral public.list_marketplace_catalog_v2(
        p_cursor => cursor_row.next_cursor,
        p_limit => 2,
        p_filters => '{"sort":"price-asc"}'::jsonb
      ) second_page
  ),
  2,
  'price cursor returns the next complete page'
);
select is(
  (
    with first_page as (
      select *
      from public.list_marketplace_catalog_v2(
        p_limit => 2,
        p_filters => '{"sort":"price-asc"}'::jsonb
      )
    ), cursor_row as (
      select next_cursor from first_page where next_cursor is not null
    ), second_page as (
      select next_page.*
      from cursor_row,
        lateral public.list_marketplace_catalog_v2(
          p_cursor => cursor_row.next_cursor,
          p_limit => 2,
          p_filters => '{"sort":"price-asc"}'::jsonb
        ) next_page
    )
    select count(*)::integer
    from first_page
    join second_page using (listing_id)
  ),
  0,
  'sort-aware cursor pages contain no duplicate listing'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_cursor => jsonb_build_object(
      'version', 1, 'sort', 'price-desc', 'sortValue', 10000,
      'publishedAt', now(),
      'listingId', '94000000-0000-4000-8000-000000000001'
    ),
    p_filters => '{"sort":"price-asc"}'::jsonb
  )$$,
  '22023', 'invalid_marketplace_cursor',
  'cursor sort must match the requested sort'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_cursor => jsonb_build_object(
      'version', 1, 'sort', 'price-asc', 'sortValue', 'invalide',
      'publishedAt', now(),
      'listingId', '94000000-0000-4000-8000-000000000001'
    ),
    p_filters => '{"sort":"price-asc"}'::jsonb
  )$$,
  '22023', 'invalid_marketplace_cursor',
  'malformed cursor values expose only the stable cursor error contract'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_cursor => jsonb_build_object(
      'version', 1, 'sort', 'recommended',
      'publishedAt', now(),
      'listingId', '94000000-0000-4000-8000-000000000001'
    )
  )$$,
  '22023', 'invalid_marketplace_cursor',
  'versioned cursors require an explicit sortValue key'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_cursor => jsonb_build_object(
      'version', 1, 'sort', 'recommended', 'sortValue', null,
      'publishedAt', 'infinity',
      'listingId', '94000000-0000-4000-8000-000000000001'
    )
  )$$,
  '22023', 'invalid_marketplace_cursor',
  'cursor timestamps reject PostgreSQL special and non-ISO values'
);
select ok(
  (
    select next_cursor_published_at is not null
      and next_cursor_listing_id is not null
    from public.list_marketplace_catalog_v2(p_limit => 2)
    where next_cursor is not null
  ),
  'legacy cursor identity columns remain present for projection compatibility'
);
select ok(
  (
    select sort_applied = 'recommended'
      and not distance_supported
      and distance_km is null
    from public.list_marketplace_catalog_v2(p_limit => 1)
  ),
  'every row explicitly encodes applied sort and unavailable distance'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_listing_ids => array[
        '94000000-0000-4000-8000-000000000001'::uuid,
        '94000000-0000-4000-8000-000000000004'::uuid
      ]
    )
  ),
  2,
  'exact listing hydration remains available in v2'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_limit => 1,
      p_listing_ids => array[
        '94000000-0000-4000-8000-000000000001'::uuid,
        '94000000-0000-4000-8000-000000000004'::uuid
      ]
    )
  ),
  2,
  'exact listing hydration ignores a smaller discovery page limit'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v2(
      p_limit => 0,
      p_listing_ids => array[
        '94000000-0000-4000-8000-000000000001'::uuid,
        '94000000-0000-4000-8000-000000000004'::uuid
      ]
    )
  ),
  2,
  'exact listing hydration ignores an invalid discovery-only page limit'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_filters => '{"pillar":"new"}'::jsonb,
    p_listing_ids => array['94000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  '22023', 'invalid_marketplace_listing_ids_mode',
  'exact listing hydration rejects discovery filters'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v2(
    p_cursor => jsonb_build_object(
      'version', 1, 'sort', 'recommended', 'sortValue', null,
      'publishedAt', now(),
      'listingId', '94000000-0000-4000-8000-000000000001'
    ),
    p_listing_ids => array['94000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  '22023', 'invalid_marketplace_listing_ids_mode',
  'exact listing hydration rejects a discovery cursor'
);
select is(
  (
    select availability_bucket
    from public.list_marketplace_catalog_v2(
      p_listing_ids => array['94000000-0000-4000-8000-000000000003'::uuid]
    )
  ),
  '7-days',
  'returned rental availability bucket follows available_from'
);
select is(
  (
    select service_terms -> 'event_date'
    from public.list_marketplace_catalog_v2(
      p_listing_ids => array['94000000-0000-4000-8000-000000000006'::uuid]
    )
  ),
  'null'::jsonb,
  'invalid legacy service event dates are safely normalized in the public projection'
);
select is(
  (public.get_marketplace_catalog_capabilities_v1()
    #>> '{filters,favorites_requires_authentication}')::boolean,
  true,
  'capabilities tell clients that favorites need authentication'
);
select ok(
  (
    select not (to_jsonb(catalogue_row) ? 'seller_latitude')
      and not (to_jsonb(catalogue_row) ? 'seller_longitude')
    from public.list_marketplace_catalog_v2(p_limit => 1) catalogue_row
  ),
  'distance fallback does not leak private seller coordinates'
);

select * from finish();
rollback;
