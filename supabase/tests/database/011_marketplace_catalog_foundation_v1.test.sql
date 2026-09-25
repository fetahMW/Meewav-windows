begin;

create extension if not exists pgtap with schema extensions;

-- Phase A is tested only through the browser-visible RPC surface while a
-- client role is active. Internal rows are inspected after reset role.
select plan(107);

-- ---------------------------------------------------------------------------
-- Contract, privilege boundary and deliberate Phase-A scope.
-- ---------------------------------------------------------------------------

select has_table('public', 'marketplace_seller_profiles', 'seller state exists');
select has_table('public', 'marketplace_listings', 'listing catalogue exists');
select has_table('public', 'marketplace_listing_prices', 'server prices exist');
select has_table('public', 'marketplace_listing_media', 'listing media references exist');
select has_table('public', 'marketplace_favorites', 'favorites exist');
select has_table('public', 'marketplace_cart_items', 'cart items exist');
select has_table('public', 'marketplace_intents', 'non-financial intents exist');
select has_table('public', 'marketplace_idempotency', 'idempotency ledger exists');

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.list_marketplace_catalog_v1(timestamp with time zone,uuid,integer,text,text,text,uuid[])',
      'public.get_my_marketplace_state_v1()',
      'public.set_marketplace_favorite_v1(uuid,boolean,text)',
      'public.set_marketplace_cart_item_v1(uuid,integer,text)',
      'public.create_marketplace_listing_draft_v1(jsonb,text)',
      'public.list_my_marketplace_listing_drafts_v1(integer)',
      'public.update_marketplace_listing_draft_v1(uuid,bigint,jsonb,text)',
      'public.create_marketplace_rental_request_v1(uuid,date,date,text,text)',
      'public.create_marketplace_service_booking_v1(uuid,timestamp with time zone,text,text)',
      'public.join_marketplace_collective_v1(uuid,integer,text)',
      'public.list_my_marketplace_intents_v1(text,text,integer)',
      'public.update_marketplace_intent_status_v1(uuid,text,text)',
      'public.cancel_marketplace_intent_v1(uuid,text)'
    ]) expected(signature)
    where to_regprocedure(expected.signature) is null
  ),
  'all stable Marketplace v1 RPC signatures exist'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.marketplace_seller_profiles',
      'public.marketplace_listings',
      'public.marketplace_listing_prices',
      'public.marketplace_listing_media',
      'public.marketplace_favorites',
      'public.marketplace_cart_items',
      'public.marketplace_intents',
      'public.marketplace_idempotency'
    ]) private_table(name)
    cross join unnest(array['select', 'insert', 'update', 'delete']) privilege(name)
    where has_table_privilege('authenticated', private_table.name, privilege.name)
  ),
  'authenticated clients have no raw Marketplace table privilege'
);
select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_class class
    where class.oid in (
      'public.marketplace_seller_profiles'::regclass,
      'public.marketplace_listings'::regclass,
      'public.marketplace_listing_prices'::regclass,
      'public.marketplace_listing_media'::regclass,
      'public.marketplace_favorites'::regclass,
      'public.marketplace_cart_items'::regclass,
      'public.marketplace_intents'::regclass,
      'public.marketplace_idempotency'::regclass
    )
  ),
  'all raw Marketplace tables force RLS'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.get_my_marketplace_state_v1()',
      'public.set_marketplace_favorite_v1(uuid,boolean,text)',
      'public.set_marketplace_cart_item_v1(uuid,integer,text)',
      'public.create_marketplace_listing_draft_v1(jsonb,text)',
      'public.list_my_marketplace_listing_drafts_v1(integer)',
      'public.update_marketplace_listing_draft_v1(uuid,bigint,jsonb,text)',
      'public.create_marketplace_rental_request_v1(uuid,date,date,text,text)',
      'public.create_marketplace_service_booking_v1(uuid,timestamp with time zone,text,text)',
      'public.join_marketplace_collective_v1(uuid,integer,text)',
      'public.list_my_marketplace_intents_v1(text,text,integer)',
      'public.update_marketplace_intent_status_v1(uuid,text,text)',
      'public.cancel_marketplace_intent_v1(uuid,text)'
    ]) expected(signature)
    where has_function_privilege('anon', expected.signature, 'execute')
  ),
  'anonymous clients cannot invoke personal or mutation RPCs'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.marketplace_touch_updated_at_v1()',
      'public.marketplace_validate_listing_media_v1()',
      'public.marketplace_require_profile_v1()',
      'public.marketplace_idempotency_replay_v1(uuid,text,text,text)',
      'public.marketplace_store_idempotency_v1(uuid,text,text,text,uuid,jsonb)',
      'public.marketplace_jsonb_integer_v1(jsonb,text,bigint,bigint,boolean)',
      'public.marketplace_create_intent_v1(uuid,text,integer,date,date,timestamp with time zone,text,text)'
    ]) internal(signature)
    cross join unnest(array['anon', 'authenticated']) client_role(name)
    where has_function_privilege(client_role.name, internal.signature, 'execute')
  ),
  'internal Marketplace helpers are not executable by browser roles'
);
select ok(
  has_function_privilege(
    'anon',
    'public.list_marketplace_catalog_v1(timestamp with time zone,uuid,integer,text,text,text,uuid[])',
    'execute'
  ),
  'anonymous clients can read the safe catalogue projection'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.get_my_marketplace_state_v1()',
      'public.set_marketplace_favorite_v1(uuid,boolean,text)',
      'public.set_marketplace_cart_item_v1(uuid,integer,text)',
      'public.create_marketplace_listing_draft_v1(jsonb,text)',
      'public.list_my_marketplace_listing_drafts_v1(integer)',
      'public.update_marketplace_listing_draft_v1(uuid,bigint,jsonb,text)',
      'public.create_marketplace_rental_request_v1(uuid,date,date,text,text)',
      'public.create_marketplace_service_booking_v1(uuid,timestamp with time zone,text,text)',
      'public.join_marketplace_collective_v1(uuid,integer,text)',
      'public.list_my_marketplace_intents_v1(text,text,integer)',
      'public.update_marketplace_intent_status_v1(uuid,text,text)',
      'public.cancel_marketplace_intent_v1(uuid,text)'
    ]) expected(signature)
    where not has_function_privilege('authenticated', expected.signature, 'execute')
  ),
  'authenticated clients can invoke every intended Marketplace mutation RPC'
);
select ok(
  (
    select bool_and(procedure.prosecdef)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like '%marketplace%v1'
  ),
  'Marketplace functions execute behind the server authority boundary'
);
select ok(
  (
    select bool_and(procedure.proconfig @> array['search_path=public, pg_temp'])
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like '%marketplace%v1'
  ),
  'every Marketplace function fixes its search_path'
);
select ok(
  to_regclass('public.marketplace_orders') is null
    and to_regclass('public.marketplace_payments') is null
    and to_regclass('public.marketplace_payouts') is null
    and to_regclass('public.marketplace_ledger') is null,
  'Phase A creates no order, payment, payout or financial ledger'
);

-- ---------------------------------------------------------------------------
-- Three independent profiles and deterministic catalogue fixtures.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'market-seller-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Market Seller A"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'market-buyer@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Market Buyer"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '83000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'market-seller-c@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Market Seller C"}'::jsonb, now(), now()
  );

create temporary table marketplace_test_context (
  draft_id uuid,
  rental_intent_id uuid,
  second_rental_intent_id uuid,
  service_intent_id uuid,
  collective_intent_id uuid,
  ticket_intent_id uuid
);
insert into marketplace_test_context default values;
grant select, insert, update, delete on marketplace_test_context to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'market_seller_a', 'Market Seller A', 'avatar_7', 'producer', 'Paris', 'FR',
    48.8566, 2.3522, false, true
  )$$,
  'seller A completes onboarding'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'market_buyer', 'Market Buyer', 'avatar_8', 'dj', 'Paris', 'FR',
    48.8570, 2.3530, false, true
  )$$,
  'buyer completes onboarding'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.complete_onboarding_v1(
    'market_seller_c', 'Market Seller C', 'avatar_9', 'instrumentalist', 'Paris', 'FR',
    48.8580, 2.3540, false, true
  )$$,
  'seller C completes onboarding'
);

reset role;
insert into public.marketplace_seller_profiles (
  profile_id, rating_basis_points, rating_count, completed_orders_count,
  response_time_bucket
)
values
  ('81000000-0000-4000-8000-000000000001', 48750, 42, 18, 'under_4h'),
  ('83000000-0000-4000-8000-000000000003', 46000, 12, 4, 'same_day');

insert into public.media_files (
  id, user_id, type, name, file_url, is_public, status, visibility,
  published_at, source_pillar, mime_type
)
values
  (
    '84000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001', 'image', 'Market cover',
    'https://assets.example.test/market-cover.webp', true, 'published', 'public',
    now(), 'marketplace', 'image/webp'
  ),
  (
    '84000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002', 'image', 'Buyer draft',
    'https://assets.example.test/buyer-draft.webp', false, 'ready', 'private',
    null, 'marketplace', 'image/webp'
  ),
  (
    '84000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000002', 'video', 'Buyer video',
    'https://assets.example.test/buyer-video.mp4', false, 'draft', 'private',
    null, 'marketplace', 'video/mp4'
  ),
  (
    '84000000-0000-4000-8000-000000000004',
    '82000000-0000-4000-8000-000000000002', 'image', 'Profile image',
    'https://assets.example.test/profile-image.webp', false, 'ready', 'private',
    null, 'profile', 'image/webp'
  ),
  (
    '84000000-0000-4000-8000-000000000005',
    '82000000-0000-4000-8000-000000000002', 'image', 'Archived market image',
    'https://assets.example.test/archived-market-image.webp', false, 'archived', 'private',
    null, 'marketplace', 'image/webp'
  );

update public.media_files
set file_size = 1024, size_bytes = 1024
where id in (
  '84000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000002',
  '84000000-0000-4000-8000-000000000003',
  '84000000-0000-4000-8000-000000000004',
  '84000000-0000-4000-8000-000000000005'
);

insert into public.media_files (
  id, user_id, type, name, file_url, file_size, size_bytes,
  is_public, status, visibility, published_at, source_pillar, mime_type
)
values (
  '84000000-0000-4000-8000-000000000006',
  '82000000-0000-4000-8000-000000000002', 'image', 'Oversized market image',
  'https://assets.example.test/oversized-market-image.webp',
  12582913, 12582913, false, 'ready', 'private', null,
  'marketplace', 'image/webp'
);

insert into public.media_files (
  id, user_id, type, name, file_url,
  is_public, status, visibility, published_at, source_pillar, mime_type
)
values (
  '84000000-0000-4000-8000-000000000007',
  '82000000-0000-4000-8000-000000000002', 'image', 'Unknown-size market image',
  'https://assets.example.test/unknown-size-market-image.webp',
  false, 'ready', 'private', null, 'marketplace', 'image/webp'
);

insert into public.marketplace_listings (
  id, seller_profile_id, slug, pillar, category_code, title,
  short_description, description, brand, condition_code, condition_label,
  status, city_label, pickup_enabled, shipping_enabled, remote_enabled,
  max_quantity, terms, published_at
)
values
  (
    '85000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001', 'synth-neuf-test', 'new',
    'synthesizers', 'Synthé neuf', 'Un synthé prêt pour la scène.',
    'Description complète du synthé neuf.', 'Meewav', 'new', 'Neuf',
    'published', 'Paris', true, true, false, 3,
    '{"stock":3,"warranty_months":24}'::jsonb, now() - interval '1 hour'
  ),
  (
    '85000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000001', 'micro-occasion-test', 'used',
    'microphones', 'Micro occasion', 'Un micro de studio révisé.',
    'Description complète du micro occasion.', 'Meewav', 'excellent', 'Excellent',
    'published', 'Paris', true, false, false, 1,
    '{"purchase_year":2024,"negotiable":true,"condition_notes":"Révisé en atelier."}'::jsonb,
    now() - interval '2 hours'
  ),
  (
    '85000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000001', 'location-console-test', 'rental',
    'mixers', 'Console en location', 'Console disponible à la journée.',
    'Description complète de la console en location.', 'Meewav', null, null,
    'published', 'Paris', true, false, false, 1,
    jsonb_build_object(
      'daily_amount_minor', 12000, 'deposit_amount_minor', 50000,
      'minimum_days', 2, 'available_from', current_date::text,
      'instant_book', false
    ), now() - interval '3 hours'
  ),
  (
    '85000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000001', 'coaching-test', 'services',
    'coaching', 'Coaching production', 'Une session de coaching personnalisée.',
    'Description complète du coaching production.', null, null, null,
    'published', 'Paris', false, false, true, 1,
    jsonb_build_object(
      'service_kind', 'coaching', 'service_format', 'distance',
      'duration_label', '60 min', 'delivery_label', 'Plan personnalisé',
      'next_availability', 'Cette semaine',
      'event_date', (now() + interval '4 days')::timestamptz,
      'capacity', 12, 'venue_name', 'Studio Meewav',
      'included_equipment', 'Console et microphones'
    ),
    now() - interval '4 hours'
  ),
  (
    '85000000-0000-4000-8000-000000000005',
    '81000000-0000-4000-8000-000000000001', 'achat-collectif-test', 'collective',
    'studio', 'Achat collectif studio', 'Un pack studio financé ensemble.',
    'Description complète de cet achat collectif.', 'Meewav', null, null,
    'published', 'Paris', true, false, false, 2,
    '{"target_participants":2,"campaign_days":30}'::jsonb,
    now() - interval '5 hours'
  ),
  (
    '85000000-0000-4000-8000-000000000006',
    '81000000-0000-4000-8000-000000000001', 'brouillon-invisible-test', 'used',
    'other', 'Brouillon invisible', 'Ce brouillon ne doit jamais sortir.',
    'Description privée de ce brouillon.', null, null, null,
    'draft', 'Paris', true, false, false, 1, '{}'::jsonb, null
  ),
  (
    '85000000-0000-4000-8000-000000000007',
    '83000000-0000-4000-8000-000000000003', 'casque-autre-vendeur-test', 'new',
    'headphones', 'Casque autre vendeur', 'Un casque vendu par un autre artiste.',
    'Description complète du casque autre vendeur.', 'Meewav', 'new', 'Neuf',
    'published', 'Paris', true, true, false, 2,
    '{"stock":2,"warranty_months":12}'::jsonb, now() - interval '6 hours'
  );

update public.marketplace_listings
set preparation_days = case
  when id = '85000000-0000-4000-8000-000000000001' then 3
  when id = '85000000-0000-4000-8000-000000000002' then 1
  when id = '85000000-0000-4000-8000-000000000004' then 2
  else preparation_days
end
where id in (
  '85000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000002',
  '85000000-0000-4000-8000-000000000004'
);

insert into public.marketplace_listing_prices (
  listing_id, price_kind, currency_code, amount_minor, price_unit
)
values
  ('85000000-0000-4000-8000-000000000001', 'primary', 'EUR', 99000, 'item'),
  ('85000000-0000-4000-8000-000000000001', 'compare_at', 'EUR', 109000, 'item'),
  ('85000000-0000-4000-8000-000000000002', 'primary', 'EUR', 24000, 'item'),
  ('85000000-0000-4000-8000-000000000003', 'primary', 'EUR', 12000, 'day'),
  ('85000000-0000-4000-8000-000000000003', 'deposit', 'EUR', 50000, 'item'),
  ('85000000-0000-4000-8000-000000000004', 'primary', 'EUR', 6500, 'session'),
  ('85000000-0000-4000-8000-000000000005', 'primary', 'EUR', 30000, 'participant'),
  ('85000000-0000-4000-8000-000000000005', 'collective_retail', 'EUR', 45000, 'participant'),
  ('85000000-0000-4000-8000-000000000005', 'collective_unlocked', 'EUR', 30000, 'participant'),
  ('85000000-0000-4000-8000-000000000006', 'primary', 'EUR', 1000, 'item'),
  ('85000000-0000-4000-8000-000000000007', 'primary', 'EUR', 18000, 'item');

insert into public.marketplace_listing_media (
  listing_id, media_file_id, media_role, position, alt_text
)
values (
  '85000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001', 'cover', 0, 'Synthé neuf'
);

-- ---------------------------------------------------------------------------
-- Public catalogue: privacy, filters and stable composite cursor.
-- ---------------------------------------------------------------------------

set local role anon;
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v1(null, null, 48, null, null, null)
  ),
  6,
  'public catalogue returns only six published listings'
);
select is(
  (
    select cover_url
    from public.list_marketplace_catalog_v1(null, null, 48, 'new', 'synthesizers', null)
    where listing_id = '85000000-0000-4000-8000-000000000001'
  ),
  'https://assets.example.test/market-cover.webp',
  'public catalogue exposes only the published cover URL'
);
select ok(
  (
    select not (to_jsonb(catalogue_row) ? 'email')
      and not (to_jsonb(catalogue_row) ? 'phone')
      and not (to_jsonb(catalogue_row) ? 'latitude')
      and not (to_jsonb(catalogue_row) ? 'longitude')
    from public.list_marketplace_catalog_v1(null, null, 1, null, null, null) catalogue_row
    limit 1
  ),
  'catalogue projection contains no private profile coordinates or contact data'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v1(null, null, 48, 'rental', null, null)
  ),
  1,
  'pillar filter isolates rental listings'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v1(null, null, 48, null, null, 'coaching')
  ),
  1,
  'catalogue search matches safe listing text'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v1(null, null, 48, null, null, 'market_seller_a')
  ),
  5,
  'catalogue search matches the safe public seller identity'
);
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v1(
      null, null, 48, null, null, null,
      array[
        '85000000-0000-4000-8000-000000000001'::uuid,
        '85000000-0000-4000-8000-000000000004'::uuid
      ]
    )
  ),
  2,
  'exact listing-ID mode hydrates every visible requested listing'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v1(
    null, null, 48, 'new', null, null,
    array['85000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  '22023', 'invalid_marketplace_listing_ids',
  'exact listing-ID mode cannot be mixed with discovery filters'
);
select ok(
  (
    select (collective_terms ->> 'joined')::integer = 0
      and (collective_terms ->> 'target_participants')::integer = 2
      and (collective_terms ->> 'progress_percent')::integer = 0
      and (collective_terms ->> 'days_remaining')::integer between 29 and 30
      and (collective_terms ->> 'retail_unit_amount_minor')::bigint = 45000
      and (collective_terms ->> 'unlocked_unit_amount_minor')::bigint = 30000
      and (collective_terms ->> 'savings_percent')::integer = 33
    from public.list_marketplace_catalog_v1(null, null, 48, 'collective', null, null)
  ),
  'collective catalogue terms contain authoritative computed progress and prices'
);
select ok(
  (
    select shipping_amount_minor = 0
      and to_jsonb(catalogue_row) ? 'cover_storage_bucket'
      and to_jsonb(catalogue_row) ? 'cover_storage_path'
    from public.list_marketplace_catalog_v1(null, null, 48, 'new', 'synthesizers', null) catalogue_row
    limit 1
  ),
  'catalogue exposes canonical shipping and private cover storage coordinates'
);
select ok(
  (
    select preparation_days = 3
      and (new_terms ->> 'stock')::integer = 3
      and (new_terms ->> 'warranty_months')::integer = 24
    from public.list_marketplace_catalog_v1(
      null, null, 48, 'new', 'synthesizers', null
    )
    where listing_id = '85000000-0000-4000-8000-000000000001'
  ),
  'new listing projection preserves preparation, stock and warranty'
);
select ok(
  (
    select preparation_days = 1
      and (used_terms ->> 'purchase_year')::integer = 2024
      and (used_terms ->> 'negotiable')::boolean
      and used_terms ->> 'condition_notes' = 'Révisé en atelier.'
    from public.list_marketplace_catalog_v1(
      null, null, 48, 'used', 'microphones', null
    )
    where listing_id = '85000000-0000-4000-8000-000000000002'
  ),
  'used listing projection preserves year, negotiation and condition notes'
);
select ok(
  (
    select preparation_days = 2
      and service_terms ->> 'event_date' is not null
      and (service_terms ->> 'capacity')::integer = 12
      and service_terms ->> 'venue_name' = 'Studio Meewav'
      and service_terms ->> 'included_equipment' = 'Console et microphones'
    from public.list_marketplace_catalog_v1(
      null, null, 48, 'services', 'coaching', null
    )
    where listing_id = '85000000-0000-4000-8000-000000000004'
  ),
  'service projection preserves event, capacity, venue and equipment'
);
select ok(
  (
    select next_cursor_published_at is not null
      and next_cursor_listing_id is not null
    from public.list_marketplace_catalog_v1(null, null, 2, null, null, null)
    order by published_at asc, listing_id asc
    limit 1
  ),
  'last row of a partial page carries a composite next cursor'
);
select is(
  (
    with first_page as (
      select *
      from public.list_marketplace_catalog_v1(null, null, 2, null, null, null)
    ), cursor_row as (
      select next_cursor_published_at, next_cursor_listing_id
      from first_page
      where next_cursor_listing_id is not null
    )
    select count(*)::integer
    from cursor_row,
      lateral public.list_marketplace_catalog_v1(
        cursor_row.next_cursor_published_at,
        cursor_row.next_cursor_listing_id,
        2, null, null, null
      ) next_page
    where not exists (
      select 1 from first_page
      where first_page.listing_id = next_page.listing_id
    )
  ),
  2,
  'composite cursor returns the next two non-duplicated listings'
);
select throws_ok(
  $$select * from public.list_marketplace_catalog_v1(
    now(), null, 20, null, null, null
  )$$,
  '22023', 'invalid_marketplace_cursor',
  'half a composite cursor is rejected'
);

-- ---------------------------------------------------------------------------
-- Personal state, favorites and mono-seller cart.
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.get_my_marketplace_state_v1(),
  '{"cart_items":[],"favorite_listing_ids":[],"joined_collective_listing_ids":[]}'::jsonb,
  'new buyer starts with empty Marketplace state'
);
select is(
  (public.set_marketplace_favorite_v1(
    '85000000-0000-4000-8000-000000000001', true, 'favorite-add-0001'
  ) ->> 'favorite')::boolean,
  true,
  'buyer can favorite a published listing'
);
select is(
  (public.set_marketplace_favorite_v1(
    '85000000-0000-4000-8000-000000000001', true, 'favorite-add-0001'
  ) ->> 'idempotent')::boolean,
  true,
  'favorite retry is idempotent'
);
select throws_ok(
  $$select public.set_marketplace_favorite_v1(
    '85000000-0000-4000-8000-000000000001', false, 'favorite-add-0001'
  )$$,
  '23505', 'idempotency_conflict',
  'favorite key cannot be replayed with another intent'
);
select is(
  (public.set_marketplace_cart_item_v1(
    '85000000-0000-4000-8000-000000000001', 2, 'cart-new-0001'
  ) ->> 'quantity')::integer,
  2,
  'buyer adds two available items to the cart'
);
select lives_ok(
  $$select public.set_marketplace_cart_item_v1(
    '85000000-0000-4000-8000-000000000002', 1, 'cart-used-0001'
  )$$,
  'same seller and currency can share the cart'
);
select throws_ok(
  $$select public.set_marketplace_cart_item_v1(
    '85000000-0000-4000-8000-000000000007', 1, 'cart-conflict-0001'
  )$$,
  '22023', 'marketplace_cart_scope_conflict',
  'another seller cannot be mixed into the cart'
);
select is(
  (
    select sum((item ->> 'quantity')::integer)::integer
    from jsonb_array_elements(
      public.get_my_marketplace_state_v1() -> 'cart_items'
    ) item
  ),
  3,
  'viewer state returns both persisted cart quantities'
);
select is(
  (public.set_marketplace_cart_item_v1(
    '85000000-0000-4000-8000-000000000001', 0, 'cart-remove-0001'
  ) ->> 'quantity')::integer,
  0,
  'quantity zero removes a cart item'
);
select is(
  (public.set_marketplace_favorite_v1(
    '85000000-0000-4000-8000-000000000001', false, 'favorite-remove-0001'
  ) ->> 'favorite')::boolean,
  false,
  'buyer removes an existing favorite'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.marketplace_idempotency ledger
    where ledger.actor_profile_id = '82000000-0000-4000-8000-000000000002'
      and (
        (ledger.operation = 'favorite' and ledger.idempotency_key = 'favorite-remove-0001')
        or (ledger.operation = 'cart_item' and ledger.idempotency_key = 'cart-remove-0001')
      )
      and ledger.listing_id is null
  ),
  2,
  'remove operations retain idempotency independently from listing lifetime'
);
delete from public.marketplace_listings
where id = '85000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  (public.set_marketplace_favorite_v1(
    '85000000-0000-4000-8000-000000000001', false, 'favorite-remove-0001'
  ) ->> 'idempotent')::boolean
  and (public.set_marketplace_cart_item_v1(
    '85000000-0000-4000-8000-000000000001', 0, 'cart-remove-0001'
  ) ->> 'idempotent')::boolean,
  'favorite and cart removals replay after their listing is deleted'
);
select is(
  (public.set_marketplace_favorite_v1(
    '85000000-0000-4000-8000-000000000099', false, 'favorite-stale-remove-0001'
  ) ->> 'favorite')::boolean,
  false,
  'removing a stale favorite remains idempotent after its listing disappeared'
);
select is(
  (public.set_marketplace_cart_item_v1(
    '85000000-0000-4000-8000-000000000099', 0, 'cart-stale-remove-0001'
  ) ->> 'quantity')::integer,
  0,
  'removing a stale cart item remains idempotent after its listing disappeared'
);
select throws_ok(
  $$select count(*) from public.marketplace_listings$$,
  '42501', 'permission denied for table marketplace_listings',
  'authenticated browser cannot bypass RPCs to read raw listings'
);

-- ---------------------------------------------------------------------------
-- Five-step composer contract: normalized draft and owned media only.
-- ---------------------------------------------------------------------------

update marketplace_test_context
set draft_id = (
  public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used",
      "category_code":"interfaces",
      "title":"Interface audio révisée",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "brand":"Meewav",
      "model":"Studio Two",
      "condition_code":"excellent",
      "currency_code":"EUR",
      "unit_amount_minor":24500,
      "price_unit":"item",
      "city":"Paris",
      "area":"11e",
      "pickup":true,
      "shipping":true,
      "remote":false,
      "shipping_amount_minor":900,
      "preparation_days":2,
      "media_file_ids":["84000000-0000-4000-8000-000000000002"],
      "terms":{
        "purchase_year":2025,
        "negotiable":true,
        "condition_notes":"Révisée et testée.",
        "ignored_client_authority":"must-not-persist"
      },
      "status":"published",
      "seller_profile_id":"81000000-0000-4000-8000-000000000001"
    }'::jsonb,
    'listing-draft-0001'
  ) ->> 'listing_id'
)::uuid;
select ok(
  (select draft_id is not null from marketplace_test_context),
  'composer creates a durable draft'
);
select is(
  (
    public.create_marketplace_listing_draft_v1(
      '{
        "pillar":"used","category_code":"interfaces",
        "title":"Interface audio révisée",
        "short_description":"Une interface compacte en parfait état.",
        "description":"Description détaillée et honnête de cette interface.",
        "brand":"Meewav","model":"Studio Two","condition_code":"excellent",
        "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
        "city":"Paris","area":"11e","pickup":true,"shipping":true,"remote":false,
        "shipping_amount_minor":900,"preparation_days":2,
        "media_file_ids":["84000000-0000-4000-8000-000000000002"],
        "terms":{"purchase_year":2025,"negotiable":true,"condition_notes":"Révisée et testée.","ignored_client_authority":"must-not-persist"},
        "status":"published","seller_profile_id":"81000000-0000-4000-8000-000000000001"
      }'::jsonb,
      'listing-draft-0001'
    ) ->> 'idempotent'
  )::boolean,
  true,
  'draft retry is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.list_my_marketplace_listing_drafts_v1(50)
  ),
  1,
  'seller workspace lists only the authenticated owner draft'
);
select ok(
  (
    select
      draft.payload ->> 'title' = 'Interface audio révisée'
      and (draft.payload ->> 'unit_amount_minor')::bigint = 24500
      and (draft.payload ->> 'shipping_amount_minor')::bigint = 900
      and draft.payload -> 'terms' = '{"purchase_year":2025,"negotiable":true,"condition_notes":"Révisée et testée."}'::jsonb
      and draft.payload -> 'media_file_ids' = '["84000000-0000-4000-8000-000000000002"]'::jsonb
      and jsonb_array_length(draft.media) = 1
      and draft.media -> 0 ->> 'role' = 'cover'
      and draft.media -> 0 ->> 'mime_type' = 'image/webp'
      and draft.media -> 0 ->> 'file_url' = 'https://assets.example.test/buyer-draft.webp'
    from public.list_my_marketplace_listing_drafts_v1(50) draft
    where draft.listing_id = (select draft_id from marketplace_test_context)
  ),
  'owner draft round-trip preserves canonical prices, terms and reusable media metadata'
);
select ok(
  (
    select
      result ->> 'listing_id' = (select draft_id::text from marketplace_test_context)
      and result ->> 'status' = 'draft'
      and (result ->> 'version')::bigint = 2
    from (
      select public.update_marketplace_listing_draft_v1(
        (select draft_id from marketplace_test_context),
        1,
        '{
          "pillar":"used","category_code":"interfaces",
          "title":"Interface audio reprise",
          "short_description":"Une interface compacte prête à reprendre.",
          "description":"Description mise à jour sans perdre les données métier du brouillon.",
          "brand":"Meewav","model":"Studio Two","condition_code":"excellent",
          "currency_code":"EUR","unit_amount_minor":25900,"price_unit":"item",
          "city":"Paris","area":"11e","pickup":true,"shipping":true,"remote":false,
          "shipping_amount_minor":1200,"preparation_days":3,
          "media_file_ids":["84000000-0000-4000-8000-000000000002"],
          "terms":{"purchase_year":2025,"negotiable":false,"condition_notes":"Révisée une seconde fois."}
        }'::jsonb,
        'listing-draft-update-0001'
      ) result
    ) mutation
  ),
  'owner atomically updates the same draft with optimistic versioning'
);
select is(
  (
    public.update_marketplace_listing_draft_v1(
      (select draft_id from marketplace_test_context),
      1,
      '{
        "pillar":"used","category_code":"interfaces",
        "title":"Interface audio reprise",
        "short_description":"Une interface compacte prête à reprendre.",
        "description":"Description mise à jour sans perdre les données métier du brouillon.",
        "brand":"Meewav","model":"Studio Two","condition_code":"excellent",
        "currency_code":"EUR","unit_amount_minor":25900,"price_unit":"item",
        "city":"Paris","area":"11e","pickup":true,"shipping":true,"remote":false,
        "shipping_amount_minor":1200,"preparation_days":3,
        "media_file_ids":["84000000-0000-4000-8000-000000000002"],
        "terms":{"purchase_year":2025,"negotiable":false,"condition_notes":"Révisée une seconde fois."}
      }'::jsonb,
      'listing-draft-update-0001'
    ) ->> 'idempotent'
  )::boolean,
  true,
  'draft update retry returns the original success despite the old expected version'
);
select throws_ok(
  $$select public.update_marketplace_listing_draft_v1(
    (select draft_id from marketplace_test_context),
    1,
    '{"pillar":"used","title":"Contenu divergent"}'::jsonb,
    'listing-draft-update-0001'
  )$$,
  '23505', 'idempotency_conflict',
  'draft update key cannot be reused for divergent content'
);
select ok(
  (
    select
      draft.version = 2
      and draft.payload ->> 'title' = 'Interface audio reprise'
      and (draft.payload ->> 'unit_amount_minor')::bigint = 25900
      and (draft.payload ->> 'shipping_amount_minor')::bigint = 1200
      and (draft.payload ->> 'preparation_days')::integer = 3
      and draft.payload -> 'terms' = '{"purchase_year":2025,"negotiable":false,"condition_notes":"Révisée une seconde fois."}'::jsonb
      and draft.payload -> 'media_file_ids' = '["84000000-0000-4000-8000-000000000002"]'::jsonb
    from public.list_my_marketplace_listing_drafts_v1(50) draft
    where draft.listing_id = (select draft_id from marketplace_test_context)
  ),
  'updated draft can be reopened without losing prices, terms or cover identity'
);
select throws_ok(
  $$select public.update_marketplace_listing_draft_v1(
    (select draft_id from marketplace_test_context),
    1,
    '{
      "pillar":"used","category_code":"interfaces","title":"Version périmée",
      "short_description":"Cette écriture concurrente doit être refusée.",
      "description":"Le serveur protège le brouillon le plus récent contre une ancienne fenêtre.",
      "currency_code":"EUR","unit_amount_minor":25900,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000002"],
      "terms":{"purchase_year":2025,"negotiable":false}
    }'::jsonb,
    'listing-draft-update-stale-0001'
  )$$,
  '40001', 'marketplace_draft_version_conflict',
  'stale browser cannot overwrite a newer owner draft'
);
select throws_ok(
  $$select public.update_marketplace_listing_draft_v1(
    (select draft_id from marketplace_test_context),
    2,
    '{
      "pillar":"used","category_code":"interfaces","title":"Média trop lourd",
      "short_description":"Cette mise à jour doit rester sans effet.",
      "description":"La reprise applique les mêmes invariants média que la création initiale.",
      "currency_code":"EUR","unit_amount_minor":25900,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000006"],
      "terms":{"purchase_year":2025,"negotiable":false}
    }'::jsonb,
    'listing-draft-update-media-0001'
  )$$,
  '22023', 'marketplace_media_too_large',
  'draft resume keeps the canonical 12 MiB media invariant'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.list_my_marketplace_listing_drafts_v1(50)),
  0,
  'another seller cannot see owner drafts'
);
select throws_ok(
  $$select public.update_marketplace_listing_draft_v1(
    (select draft_id from marketplace_test_context),
    2,
    '{"pillar":"used"}'::jsonb,
    'listing-draft-update-foreign-0001'
  )$$,
  'P0002', 'marketplace_draft_not_found',
  'another seller cannot update an owner draft'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Titre divergent",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,"media_file_ids":[],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-draft-0001'
  )$$,
  '23505', 'idempotency_conflict',
  'draft key cannot be replayed with divergent content'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Média interdit",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000001"],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-media-0001'
  )$$,
  '42501', 'marketplace_media_not_owned_or_unavailable',
  'composer cannot attach another profile media file'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Média dupliqué",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":[
        "84000000-0000-4000-8000-000000000002",
        "84000000-0000-4000-8000-000000000002"
      ],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-media-duplicate-0001'
  )$$,
  '22023', 'marketplace_duplicate_media',
  'composer rejects duplicate media references before insertion'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Couverture vidéo",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":[
        "84000000-0000-4000-8000-000000000003",
        "84000000-0000-4000-8000-000000000002"
      ],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-media-video-cover-0001'
  )$$,
  '22023', 'marketplace_cover_must_be_image',
  'composer requires the first media reference to be an image cover'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Média hors Market",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000004"],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-media-source-0001'
  )$$,
  '42501', 'marketplace_media_not_owned_or_unavailable',
  'composer rejects owner media that was not uploaded for the marketplace'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Média archivé",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000005"],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-media-status-0001'
  )$$,
  '42501', 'marketplace_media_not_owned_or_unavailable',
  'composer rejects an archived marketplace media reference'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Média trop lourd",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000006"],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-media-size-0001'
  )$$,
  '22023', 'marketplace_media_too_large',
  'composer rejects Marketplace media larger than 12 MiB'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Taille inconnue",
      "short_description":"Une interface compacte en parfait état.",
      "description":"Description détaillée et honnête de cette interface.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000007"],
      "terms":{"negotiable":true}
    }'::jsonb,
    'listing-media-size-0002'
  )$$,
  '22023', 'marketplace_media_size_required',
  'composer requires authoritative media size metadata'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"used","category_code":"interfaces","title":"Négociation absente",
      "short_description":"Une interface proposée avec une modalité incomplète.",
      "description":"Description détaillée de cette interface avec un booléen volontairement omis.",
      "currency_code":"EUR","unit_amount_minor":24500,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000002"],
      "terms":{"condition_notes":"Très bon état"}
    }'::jsonb,
    'listing-bool-used-0001'
  )$$,
  '22023', 'invalid_marketplace_payload',
  'used drafts require an explicit negotiable boolean'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"rental","category_code":"mixers","title":"Réservation incomplète",
      "short_description":"Une console proposée avec une modalité incomplète.",
      "description":"Description détaillée de cette console avec un booléen volontairement omis.",
      "currency_code":"EUR","unit_amount_minor":12000,"price_unit":"day",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000002"],
      "terms":{"daily_amount_minor":12000,"deposit_amount_minor":50000,"minimum_days":1,"available_from":"2026-07-20"}
    }'::jsonb,
    'listing-bool-rental-0001'
  )$$,
  '22023', 'invalid_marketplace_payload',
  'rental drafts require an explicit instant-book boolean'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"rental","category_code":"mixers","title":"Date de location impossible",
      "short_description":"Une console proposée avec une date invalide.",
      "description":"Description détaillée de cette console avec une date civile volontairement impossible.",
      "currency_code":"EUR","unit_amount_minor":12000,"price_unit":"day",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000002"],
      "terms":{"daily_amount_minor":12000,"deposit_amount_minor":50000,"minimum_days":1,"available_from":"2026-02-30","instant_book":false}
    }'::jsonb,
    'listing-date-rental-0001'
  )$$,
  '22023', 'invalid_marketplace_payload',
  'rental draft rejects an impossible calendar date with the stable contract error'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"services","category_code":"coaching","title":"Événement à date impossible",
      "short_description":"Une session proposée avec une date invalide.",
      "description":"Description détaillée de cette session avec une date civile volontairement impossible.",
      "currency_code":"EUR","unit_amount_minor":6500,"price_unit":"session",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000002"],
      "terms":{"service_kind":"coaching","service_format":"Sur place","duration_label":"60 min","next_availability":"Cette semaine","event_date":"2026-02-30T10:00:00Z","capacity":1}
    }'::jsonb,
    'listing-date-service-0001'
  )$$,
  '22023', 'invalid_marketplace_payload',
  'service draft rejects an impossible event timestamp with the stable contract error'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"services","category_code":"coaching","title":"Événement au fuseau impossible",
      "short_description":"Une session proposée avec un fuseau invalide.",
      "description":"Description détaillée de cette session avec un décalage de fuseau volontairement impossible.",
      "currency_code":"EUR","unit_amount_minor":6500,"price_unit":"session",
      "pickup":true,"shipping":false,"remote":false,
      "media_file_ids":["84000000-0000-4000-8000-000000000002"],
      "terms":{"service_kind":"coaching","service_format":"Sur place","duration_label":"60 min","next_availability":"Cette semaine","event_date":"2026-07-20T10:00:00+99:99","capacity":1}
    }'::jsonb,
    'listing-timezone-service-0001'
  )$$,
  '22023', 'invalid_marketplace_payload',
  'service draft rejects an impossible timezone offset with the stable contract error'
);
select throws_ok(
  $$select public.create_marketplace_listing_draft_v1(
    '{
      "pillar":"rental","category_code":"mixers","title":"Mauvaise unité",
      "short_description":"Une console proposée en location.",
      "description":"Description détaillée de cette console en location.",
      "currency_code":"EUR","unit_amount_minor":12000,"price_unit":"item",
      "pickup":true,"shipping":false,"remote":false,"media_file_ids":[],
      "terms":{"daily_amount_minor":12000,"deposit_amount_minor":50000,"minimum_days":1,"available_from":"2026-07-20","instant_book":false}
    }'::jsonb,
    'listing-unit-0001'
  )$$,
  '22023', 'invalid_marketplace_price_unit',
  'pillar and price unit cannot diverge'
);

reset role;
select is(
  (
    select listing.status
    from public.marketplace_listings listing
    where listing.id = (select draft_id from marketplace_test_context)
  ),
  'draft',
  'client cannot self-publish a listing through extra payload keys'
);
select is(
  (
    select listing.seller_profile_id
    from public.marketplace_listings listing
    where listing.id = (select draft_id from marketplace_test_context)
  ),
  '82000000-0000-4000-8000-000000000002'::uuid,
  'draft seller identity always comes from auth.uid'
);
select ok(
  (
    select not (listing.terms ? 'ignored_client_authority')
      and listing.preparation_days = 3
      and listing.terms = '{"purchase_year":2025,"negotiable":false,"condition_notes":"Révisée une seconde fois."}'::jsonb
    from public.marketplace_listings listing
    where listing.id = (select draft_id from marketplace_test_context)
  ),
  'only normalized pillar terms are persisted'
);
select is(
  (
    select listing.condition_label
    from public.marketplace_listings listing
    where listing.id = (select draft_id from marketplace_test_context)
  ),
  'Excellent',
  'condition code is exposed through the canonical French public label'
);
select is(
  (
    select count(*)::integer
    from public.marketplace_listing_media listing_media
    where listing_media.listing_id = (select draft_id from marketplace_test_context)
      and listing_media.media_file_id = '84000000-0000-4000-8000-000000000002'
      and listing_media.media_role = 'cover'
  ),
  1,
  'owned composer media is attached as the cover'
);
select throws_ok(
  $$insert into public.marketplace_listing_media (
    listing_id, media_file_id, media_role, position, alt_text
  ) values (
    '85000000-0000-4000-8000-000000000002',
    '84000000-0000-4000-8000-000000000002',
    'gallery', 0, 'Média d’un autre propriétaire'
  )$$,
  '42501', 'marketplace_media_not_owned_or_unavailable',
  'database invariant rejects media owned by another profile'
);
select throws_ok(
  $$insert into public.marketplace_listing_media (
    listing_id, media_file_id, media_role, position, alt_text
  ) values (
    (select draft_id from marketplace_test_context),
    '84000000-0000-4000-8000-000000000004',
    'gallery', 1, 'Média hors Marketplace'
  )$$,
  '42501', 'marketplace_media_not_owned_or_unavailable',
  'database invariant rejects media from another source pillar'
);
select throws_ok(
  $$insert into public.marketplace_listing_media (
    listing_id, media_file_id, media_role, position, alt_text
  ) values (
    (select draft_id from marketplace_test_context),
    '84000000-0000-4000-8000-000000000003',
    'cover', 1, 'Vidéo utilisée comme couverture'
  )$$,
  '22023', 'marketplace_cover_must_be_image',
  'database invariant requires an image cover even for privileged writes'
);
select throws_ok(
  $$insert into public.marketplace_listing_media (
    listing_id, media_file_id, media_role, position, alt_text
  ) values (
    (select draft_id from marketplace_test_context),
    '84000000-0000-4000-8000-000000000006',
    'gallery', 1, 'Média dépassant 12 MiB'
  )$$,
  '22023', 'marketplace_media_too_large',
  'database invariant rejects oversized media on privileged writes'
);

-- ---------------------------------------------------------------------------
-- Dedicated rental, service and collective intents with server price snapshot.
-- ---------------------------------------------------------------------------

reset role;
insert into public.marketplace_listings (
  id, seller_profile_id, slug, pillar, category_code, title,
  short_description, description, status, city_label, pickup_enabled,
  shipping_enabled, remote_enabled, preparation_days, max_quantity, terms,
  published_at
)
values (
  '85000000-0000-4000-8000-000000000008',
  '81000000-0000-4000-8000-000000000001',
  'ticket-capacite-test', 'services', 'ticketing', 'Live capacité limitée',
  'Une place pour un live Meewav.',
  'Une place nominative pour tester la capacité serveur du live.',
  'published', 'Paris', false, false, true, 1, 1,
  jsonb_build_object(
    'service_kind', 'ticket', 'service_format', 'Sur place',
    'duration_label', '3 heures', 'delivery_label', 'Accès nominatif',
    'next_availability', 'La semaine prochaine',
    'event_date', (now() + interval '7 days')::timestamptz,
    'capacity', 1, 'venue_name', 'Room Meewav',
    'included_equipment', 'Scène et système de diffusion'
  ),
  now() - interval '30 minutes'
);
insert into public.marketplace_listing_prices (
  listing_id, price_kind, currency_code, amount_minor, price_unit
)
values (
  '85000000-0000-4000-8000-000000000008',
  'primary', 'EUR', 2500, 'ticket'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.create_marketplace_rental_request_v1(
    '85000000-0000-4000-8000-000000000003',
    current_date - 4, current_date - 2, 'Dates entièrement passées',
    'rental-past-0001'
  )$$,
  '22023', 'invalid_marketplace_rental_dates',
  'rental requests cannot target dates entirely in the past'
);
update marketplace_test_context
set rental_intent_id = (
  public.create_marketplace_rental_request_v1(
    '85000000-0000-4000-8000-000000000003',
    current_date + 2, current_date + 5, 'Session de trois jours',
    'rental-request-0001'
  ) ->> 'intent_id'
)::uuid;
select ok(
  (select rental_intent_id is not null from marketplace_test_context),
  'buyer creates a rental request with valid dates'
);
select is(
  (
    public.create_marketplace_rental_request_v1(
      '85000000-0000-4000-8000-000000000003',
      current_date + 2, current_date + 5, 'Session de trois jours',
      'rental-request-0001'
    ) ->> 'idempotent'
  )::boolean,
  true,
  'rental request retry is idempotent'
);
update marketplace_test_context
set service_intent_id = (
  public.create_marketplace_service_booking_v1(
    '85000000-0000-4000-8000-000000000004',
    null, 'Coaching pour mon prochain live',
    'service-booking-0001'
  ) ->> 'intent_id'
)::uuid;
select ok(
  (select service_intent_id is not null from marketplace_test_context),
  'buyer creates a service booking request'
);
reset role;
update public.marketplace_listings
set published_at = now() - interval '31 days'
where id = '85000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.join_marketplace_collective_v1(
    '85000000-0000-4000-8000-000000000005', null,
    'collective-null-quantity-0001'
  )$$,
  '22023', 'invalid_marketplace_request',
  'collective join rejects a missing quantity with a stable contract error'
);
select throws_ok(
  $$select public.join_marketplace_collective_v1(
    '85000000-0000-4000-8000-000000000005', 1,
    'collective-expired-0001'
  )$$,
  '22023', 'marketplace_collective_closed',
  'an expired collective campaign cannot accept new participants'
);
reset role;
update public.marketplace_listings
set published_at = now() - interval '30 minutes'
where id = '85000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update marketplace_test_context
set collective_intent_id = (
  public.join_marketplace_collective_v1(
    '85000000-0000-4000-8000-000000000005', 2,
    'collective-join-0001'
  ) ->> 'intent_id'
)::uuid;
select ok(
  (select collective_intent_id is not null from marketplace_test_context),
  'buyer joins an open collective allocation'
);
select is(
  jsonb_array_length(
    public.get_my_marketplace_state_v1() -> 'joined_collective_listing_ids'
  ),
  1,
  'viewer state exposes the joined collective listing once'
);
select throws_ok(
  $$select public.create_marketplace_rental_request_v1(
    '85000000-0000-4000-8000-000000000004',
    current_date + 1, current_date + 3, null, 'wrong-pillar-0001'
  )$$,
  '22023', 'invalid_marketplace_rental_request',
  'dedicated intent RPC rejects the wrong listing pillar'
);

update marketplace_test_context
set ticket_intent_id = (
  public.create_marketplace_service_booking_v1(
    '85000000-0000-4000-8000-000000000008',
    null, 'Une place pour le live', 'ticket-booking-0001'
  ) ->> 'intent_id'
)::uuid;
select ok(
  (
    select requested_for is not null
    from public.list_my_marketplace_intents_v1('buyer', 'pending', 50)
    where intent_id = (select ticket_intent_id from marketplace_test_context)
  ),
  'fixed-date ticket intent stores the canonical event slot even when omitted by the client'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '83000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.create_marketplace_service_booking_v1(
    '85000000-0000-4000-8000-000000000008',
    null, null, 'ticket-capacity-0002'
  )$$,
  '22023', 'marketplace_service_capacity_full',
  'active ticket intents cannot exceed the server-owned capacity'
);
update marketplace_test_context
set second_rental_intent_id = (
  public.create_marketplace_rental_request_v1(
    '85000000-0000-4000-8000-000000000003',
    current_date + 3, current_date + 6, 'Demande concurrente',
    'rental-request-0002'
  ) ->> 'intent_id'
)::uuid;
select ok(
  (select second_rental_intent_id is not null from marketplace_test_context),
  'another buyer may submit a competing rental request for seller review'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (
    select count(*)::integer
    from public.list_my_marketplace_intents_v1('seller', 'pending', 50)
  ),
  5,
  'seller workspace lists every pending request for owned listings'
);
select is(
  public.update_marketplace_intent_status_v1(
    (select rental_intent_id from marketplace_test_context),
    'accepted', 'rental-owner-status-0001'
  ) ->> 'status',
  'accepted',
  'seller can accept the first rental request for a time slot'
);
select throws_ok(
  $$select public.update_marketplace_intent_status_v1(
    (select second_rental_intent_id from marketplace_test_context),
    'accepted', 'rental-owner-status-0002'
  )$$,
  '22023', 'marketplace_rental_slot_unavailable',
  'overlapping rental requests cannot both be accepted'
);
select is(
  public.update_marketplace_intent_status_v1(
    (select service_intent_id from marketplace_test_context),
    'accepted', 'intent-owner-status-0001'
  ) ->> 'status',
  'accepted',
  'seller can accept a pending intent through the dedicated transition RPC'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  public.cancel_marketplace_intent_v1(
    (select service_intent_id from marketplace_test_context),
    'intent-buyer-cancel-0001'
  ) ->> 'status' = 'cancelled'
  and exists (
    select 1
    from public.list_my_marketplace_intents_v1('buyer', 'cancelled', 50)
    where intent_id = (select service_intent_id from marketplace_test_context)
  ),
  'buyer can cancel an accepted request and immediately observe its final status'
);

reset role;
select is(
  (
    select (intent.pricing_snapshot -> 'primary' ->> 'amount_minor')::bigint
    from public.marketplace_intents intent
    where intent.id = (select rental_intent_id from marketplace_test_context)
  ),
  12000::bigint,
  'rental intent snapshots the canonical server price'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.create_marketplace_rental_request_v1(
    '85000000-0000-4000-8000-000000000003',
    current_date + 2, current_date + 5, null, 'own-rental-0001'
  )$$,
  '22023', 'cannot_request_own_listing',
  'seller cannot create an intent against their own listing'
);

reset role;
update public.profiles
set is_ghost_mode = true
where id = '83000000-0000-4000-8000-000000000003';
set local role anon;
select is(
  (
    select count(*)::integer
    from public.list_marketplace_catalog_v1(null, null, 48, null, null, null)
  ),
  5,
  'ghost seller and all of their listings disappear from public catalogue'
);

select * from finish();
rollback;
