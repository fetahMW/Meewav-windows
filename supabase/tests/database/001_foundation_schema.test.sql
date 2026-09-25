begin;

create extension if not exists pgtap with schema extensions;
select plan(66);

select has_table('public', 'profiles', 'shared profiles table exists');
select has_table('public', 'artist_roles', 'canonical role catalog exists');
select has_table('public', 'avatar_styles', 'canonical avatar catalog exists');
select has_table('public', 'profile_locations_private', 'private location table exists');
select has_table('public', 'profile_public_markers', 'coarse public marker table exists');
select has_column('public', 'profile_public_markers', 'commune_code', 'public marker preserves commune code for Globe');
select has_column('public', 'profile_public_markers', 'zone_id', 'public marker preserves IRIS/zone id for Globe');
select has_column('public', 'profile_public_markers', 'zone_name', 'public marker preserves safe zone label');
select has_column('public', 'profile_public_markers', 'avatar_icon_id', 'public marker preserves canonical avatar icon');
select has_column('public', 'profile_public_markers', 'scene_name', 'public marker preserves music scene');
select has_table('public', 'follows', 'shared follows table exists');
select has_table('public', 'notifications', 'shared notifications table exists');
select has_table('public', 'daily_golden_likes', 'shared iOS Golden Like ledger still exists');
select has_table('public', 'grade_levels', 'six-level grade catalog exists');
select has_table('public', 'profile_grade_state', 'profile grade state exists');
select has_table('public', 'profile_grade_events', 'immutable grade ledger exists');
select has_table('public', 'profile_grade_legacy_imports', 'legacy grade snapshots exist');
select has_table('public', 'analytics_events', 'cross-pillar events exist');
select has_table('public', 'profile_daily_metrics', 'daily metric rollups exist');
select has_table('public', 'media_files', 'shared media table still exists');
select has_column('public', 'daily_golden_likes', 'day_date', 'Golden Like ledger has a server-owned Paris day');
select has_column('public', 'profiles', 'golden_likes_count', 'profiles expose the server-maintained Golden Like aggregate');
select has_view('public', 'public_profile_cards', 'safe public profile view exists');
select has_view('public', 'published_media_files', 'safe published media view exists');
select has_view('public', 'public_profiles', 'canonical PII-free public profile view exists');
select has_column('public', 'public_profiles', 'zone_id', 'public profile contract exposes safe Globe zone id');
select has_column('public', 'public_profiles', 'zone_name', 'public profile contract exposes the safe Globe zone label');
select has_column('public', 'public_profiles', 'scene_name', 'public profile contract exposes music scene');
select has_column('public', 'public_profiles', 'golden_likes_count', 'public profile contract exposes only the Golden Like aggregate');

select is(
  (select count(*)::integer from public.grade_levels where is_active),
  6,
  'exactly six canonical grades are active'
);
select is((select code from public.grade_levels where level = 1), 'beginner', 'level 1 is beginner');
select is((select label from public.grade_levels where level = 4), 'Élite', 'level 4 is Élite');
select is((select code from public.grade_levels where level = 5), 'master', 'level 5 is master');
select is((select code from public.grade_levels where level = 6), 'legendary', 'level 6 is legendary');
select is((select visual_key from public.grade_levels where level = 6), 'grade-legendary', 'legendary visual key matches Web');

select is((select count(*)::integer from public.avatar_styles where is_active), 32, 'all current avatar styles are catalogued');
select ok((select count(*) >= 29 from public.artist_roles where is_active), 'complete current role catalog is seeded');
select ok(exists(select 1 from storage.buckets where id = 'profile-media'), 'private profile media bucket exists');
select is((select public from storage.buckets where id = 'profile-media'), false, 'profile media bucket is not public');

select ok(not has_column_privilege('anon', 'public.profiles', 'email', 'select'), 'anon cannot select profile email');
select ok(not has_column_privilege('anon', 'public.profiles', 'street', 'select'), 'anon cannot select profile street');
select ok(not has_column_privilege('anon', 'public.profiles', 'latitude', 'select'), 'anon cannot select exact latitude');
select ok(not has_column_privilege('anon', 'public.profiles', 'longitude', 'select'), 'anon cannot select exact longitude');
select ok(not has_column_privilege('anon', 'public.media_files', 'checksum_sha256', 'select'), 'anon cannot select media checksums');
select ok(not has_table_privilege('anon', 'public.daily_golden_likes', 'select'), 'anon cannot read the Golden Like ledger');
select ok(not has_table_privilege('anon', 'public.daily_golden_likes', 'insert'), 'anon cannot write the Golden Like ledger');
select ok(not has_table_privilege('authenticated', 'public.daily_golden_likes', 'update'), 'authenticated clients cannot rewrite Golden Like events');
select hasnt_column('public', 'public_profile_cards', 'email', 'public profile view excludes email');
select hasnt_column('public', 'public_profile_cards', 'street', 'public profile view excludes street');
select hasnt_column('public', 'public_profile_cards', 'latitude', 'public profile view excludes exact latitude');
select hasnt_column('public', 'public_profiles', 'email', 'canonical public view excludes email');
select hasnt_column('public', 'public_profiles', 'street', 'canonical public view excludes street');
select hasnt_column('public', 'public_profiles', 'latitude', 'canonical public view excludes exact latitude');
select hasnt_column('public', 'public_profiles', 'longitude', 'canonical public view excludes exact longitude');
select hasnt_column('public', 'published_media_files', 'checksum_sha256', 'published media view excludes checksum');
select hasnt_column('public', 'published_media_files', 'deleted_at', 'published media view excludes deletion state');

select ok(
  to_regprocedure('public.meewav_random_artist_grade_level()') is null
  or not has_function_privilege('authenticated', 'public.meewav_random_artist_grade_level()', 'execute'),
  'authenticated clients cannot call legacy random grade-level helper'
);
select ok(
  to_regprocedure('public.meewav_random_artist_grade_stars()') is null
  or not has_function_privilege('authenticated', 'public.meewav_random_artist_grade_stars()', 'execute'),
  'authenticated clients cannot call legacy random star helper'
);
select ok(to_regprocedure('public.is_profile_username_available(text)') is not null, 'shared username availability RPC exists');
select ok(
  to_regprocedure('public.complete_onboarding(text,text,text,text,text,text,double precision,double precision,boolean,boolean)') is not null,
  'atomic onboarding RPC exists'
);
select ok(to_regprocedure('public.get_my_private_profile()') is not null, 'owner-only private profile RPC exists');
select ok(
  to_regprocedure('public.update_my_public_discovery_profile(text,text,text,text,text)') is not null,
  'owner-only public discovery context RPC exists'
);
select ok(to_regprocedure('public.give_golden_like(uuid)') is not null, 'canonical Golden Like RPC exists');
select ok(to_regprocedure('public.get_golden_like_state(uuid)') is not null, 'Golden Like state RPC exists');
select ok(
  to_regprocedure('public.apply_profile_grade_event(uuid,integer,text,text,text,text,jsonb)') is not null,
  'service-only idempotent grade event RPC exists'
);
select ok(
  to_regprocedure('public.refresh_profile_daily_metrics(date,date)') is not null,
  'daily analytics rollup RPC exists'
);

select * from finish();
rollback;
