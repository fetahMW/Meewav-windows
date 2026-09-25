-- Canonical profile Golden Likes built on the existing iOS ledger.
--
-- This migration deliberately keeps public.daily_golden_likes as the only
-- source of truth. It never creates the archived mock_artists/musicians ledger
-- and does not reference or modify any Rooms v2 object.

create extension if not exists pgcrypto;

alter table public.daily_golden_likes
  add column if not exists day_date date;

update public.daily_golden_likes
set day_date = (given_at at time zone 'Europe/Paris')::date
where day_date is null;

alter table public.daily_golden_likes
  alter column day_date set default ((now() at time zone 'Europe/Paris')::date),
  alter column day_date set not null;

create index if not exists daily_golden_likes_giver_day_idx
  on public.daily_golden_likes(giver_id, day_date, given_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_golden_likes'::regclass
      and conname = 'daily_golden_likes_recipient_profile_fk'
  ) then
    alter table public.daily_golden_likes
      add constraint daily_golden_likes_recipient_profile_fk
      foreign key (recipient_id) references public.profiles(id)
      on delete cascade not valid;
  end if;
end;
$$;

alter table public.profiles
  add column if not exists golden_likes_count bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_golden_likes_count_non_negative'
  ) then
    alter table public.profiles
      add constraint profiles_golden_likes_count_non_negative
      check (golden_likes_count >= 0) not valid;
  end if;
end;
$$;

-- Lossless backfill: every historical event remains in the existing ledger.
update public.profiles p
set golden_likes_count = (
      select count(*)::bigint
      from public.daily_golden_likes g
      where g.recipient_id = p.id
    ),
    updated_at = now();

create or replace function public.current_golden_like_day()
returns date
language sql
stable
set search_path = pg_catalog, public
as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

create or replace function public.check_golden_like_cooldown()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day date := public.current_golden_like_day();
begin
  if auth.uid() is not null and new.giver_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'golden_like_giver_mismatch';
  end if;

  if new.giver_id = new.recipient_id then
    raise exception using errcode = '23514', message = 'cannot_golden_like_self';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.recipient_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
  ) then
    raise exception using errcode = '23503', message = 'recipient_profile_not_available';
  end if;

  -- The lock closes the race present in the historical trigger. Client values
  -- cannot backdate or future-date a claim.
  perform pg_advisory_xact_lock(
    hashtextextended(new.giver_id::text || ':' || v_day::text, 0)
  );
  new.given_at := clock_timestamp();
  new.day_date := v_day;

  if exists (
    select 1 from public.daily_golden_likes g
    where g.giver_id = new.giver_id and g.day_date = v_day
  ) then
    raise exception using errcode = '23505', message = 'golden_like_already_used_today';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_golden_like_cooldown on public.daily_golden_likes;
create trigger trg_check_golden_like_cooldown
before insert on public.daily_golden_likes
for each row execute function public.check_golden_like_cooldown();

create or replace function public.sync_profile_golden_likes_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recipient_id uuid;
begin
  if tg_op = 'DELETE' then
    v_recipient_id := old.recipient_id;
  else
    v_recipient_id := new.recipient_id;
  end if;

  update public.profiles p
  set golden_likes_count = (
        select count(*)::bigint
        from public.daily_golden_likes g
        where g.recipient_id = v_recipient_id
      ),
      updated_at = now()
  where p.id = v_recipient_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_golden_likes_sync_profile_count on public.daily_golden_likes;
create trigger daily_golden_likes_sync_profile_count
after insert or delete on public.daily_golden_likes
for each row execute function public.sync_profile_golden_likes_count();

create or replace function public.guard_profile_golden_likes_count()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.golden_likes_count is distinct from old.golden_likes_count
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'golden_likes_count_is_server_managed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_golden_likes_count on public.profiles;
create trigger profiles_guard_golden_likes_count
before update of golden_likes_count on public.profiles
for each row execute function public.guard_profile_golden_likes_count();

create or replace function public.give_golden_like(p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_day date := public.current_golden_like_day();
  v_existing public.daily_golden_likes%rowtype;
  v_event_id uuid;
  v_count bigint;
  v_available_at timestamptz;
  v_cooldown_seconds integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_artist_id is null then
    raise exception using errcode = '22023', message = 'recipient_profile_required';
  end if;
  if p_artist_id = v_user_id then
    return jsonb_build_object('ok', false, 'reason', 'cannot_golden_like_self');
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_artist_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'artist_not_found');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_day::text, 0)
  );

  select g.* into v_existing
  from public.daily_golden_likes g
  where g.giver_id = v_user_id and g.day_date = v_day
  order by g.given_at, g.id
  limit 1;

  v_available_at := ((v_day + 1)::timestamp at time zone 'Europe/Paris');
  v_cooldown_seconds := greatest(
    0,
    floor(extract(epoch from (v_available_at - clock_timestamp())))::integer
  );

  select p.golden_likes_count into v_count
  from public.profiles p where p.id = p_artist_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', v_existing.recipient_id = p_artist_id,
      'reason', case when v_existing.recipient_id = p_artist_id
        then 'golden_like_already_sent' else 'already_used_today' end,
      'artistId', p_artist_id,
      'goldenLikeId', v_existing.id,
      'goldenLikesCount', coalesce(v_count, 0),
      'usedToday', true,
      'availableToday', false,
      'dayKey', v_day,
      'availableAt', v_available_at,
      'cooldownSeconds', v_cooldown_seconds,
      'idempotentReplay', v_existing.recipient_id = p_artist_id
    );
  end if;

  insert into public.daily_golden_likes(giver_id, recipient_id, given_at, day_date)
  values (v_user_id, p_artist_id, clock_timestamp(), v_day)
  returning id into v_event_id;

  select p.golden_likes_count into v_count
  from public.profiles p where p.id = p_artist_id;

  return jsonb_build_object(
    'ok', true,
    'reason', 'golden_like_sent',
    'artistId', p_artist_id,
    'goldenLikeId', v_event_id,
    'goldenLikesCount', coalesce(v_count, 0),
    'usedToday', true,
    'availableToday', false,
    'dayKey', v_day,
    'availableAt', v_available_at,
    'cooldownSeconds', v_cooldown_seconds,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.get_golden_like_state(p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_day date := public.current_golden_like_day();
  v_existing public.daily_golden_likes%rowtype;
  v_count bigint;
  v_available_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select p.golden_likes_count into v_count
  from public.profiles p
  where p.id = p_artist_id
    and coalesce(p.show_on_public_profile, false)
    and not coalesce(p.is_ghost_mode, true);

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'artist_not_found');
  end if;

  select g.* into v_existing
  from public.daily_golden_likes g
  where g.giver_id = v_user_id and g.day_date = v_day
  order by g.given_at, g.id
  limit 1;

  v_available_at := ((v_day + 1)::timestamp at time zone 'Europe/Paris');

  return jsonb_build_object(
    'ok', true,
    'artistId', p_artist_id,
    'goldenLikesCount', coalesce(v_count, 0),
    'usedToday', v_existing.id is not null,
    'availableToday', v_existing.id is null,
    'givenToThisArtistToday', coalesce(v_existing.recipient_id = p_artist_id, false),
    'dayKey', v_day,
    'availableAt', v_available_at,
    'cooldownSeconds', case when v_existing.id is null then 0 else greatest(
      0,
      floor(extract(epoch from (v_available_at - clock_timestamp())))::integer
    ) end
  );
end;
$$;

alter table public.daily_golden_likes enable row level security;

drop policy if exists "Donner un golden like" on public.daily_golden_likes;
drop policy if exists "Voir ses golden likes" on public.daily_golden_likes;
drop policy if exists daily_golden_likes_participant_read on public.daily_golden_likes;
create policy daily_golden_likes_participant_read on public.daily_golden_likes
for select to authenticated using (
  giver_id = auth.uid() or recipient_id = auth.uid()
);
drop policy if exists daily_golden_likes_ios_insert_compat on public.daily_golden_likes;
create policy daily_golden_likes_ios_insert_compat on public.daily_golden_likes
for insert to authenticated with check (
  giver_id = auth.uid()
  and recipient_id <> auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = recipient_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
  )
);

revoke all on public.daily_golden_likes from anon, authenticated;
grant select, insert on public.daily_golden_likes to authenticated;
grant all on public.daily_golden_likes to service_role;

revoke all on function public.check_golden_like_cooldown() from public, anon, authenticated;
revoke all on function public.sync_profile_golden_likes_count() from public, anon, authenticated;
revoke all on function public.guard_profile_golden_likes_count() from public, anon, authenticated;
revoke all on function public.current_golden_like_day()
  from public, anon, authenticated;
grant execute on function public.current_golden_like_day() to authenticated, service_role;
revoke all on function public.give_golden_like(uuid)
  from public, anon, authenticated;
grant execute on function public.give_golden_like(uuid) to authenticated;
revoke all on function public.get_golden_like_state(uuid)
  from public, anon, authenticated;
grant execute on function public.get_golden_like_state(uuid) to authenticated;

-- Safe count only. Authenticated keeps its legacy profile SELECT temporarily;
-- anonymous visitors receive no access to the Golden Like ledger itself.
grant select (golden_likes_count) on public.profiles to anon, authenticated;

-- Keep the host popup on the same owner-only contract as the Profile
-- dashboard. This replaces the narrower projection created by the identity
-- migration only after the Golden Like aggregate exists; exact coordinates
-- remain visible solely to the authenticated owner.
create or replace function public.get_my_private_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'full_name', p.full_name,
    'display_name', coalesce(p.display_name, p.full_name),
    'email', p.email,
    'phone', p.phone,
    'birth_date', p.birth_date,
    'street', p.street,
    'postal_code', p.postal_code,
    'bio', p.bio,
    'avatar_url', p.avatar_url,
    'avatar_name', p.avatar_name,
    'avatar_style_key', p.avatar_style_key,
    'artist_type', p.artist_type,
    'primary_role_key', p.primary_role_key,
    'talents', coalesce(p.talents, '[]'::jsonb),
    'city', coalesce(l.city, p.city),
    'country', p.country,
    'country_code', coalesce(l.country_code, p.country_code),
    'commune_code', p.commune_code,
    'zone_id', p.zone_id,
    'district_name', p.district_name,
    'zone_name', p.district_name,
    'scene_name', p.scene_name,
    'avatar_icon_id', coalesce(p.avatar_icon_id, p.avatar_style_key),
    'profile_image_url', p.profile_image_url,
    'profile_image_path', p.profile_image_path,
    'collab_available', coalesce(p.collab_available, false),
    'is_online', coalesce(p.is_online, false),
    'followers_count', coalesce(p.followers_count, 0),
    'following_count', coalesce(p.following_count, 0),
    'grade', coalesce(p.grade, 1),
    'is_verified', coalesce(p.is_verified, false),
    'social_links', coalesce(p.social_links, '{}'::jsonb),
    'selected_audio_ids', p.selected_audio_ids,
    'selected_video_ids', p.selected_video_ids,
    'public_profile_preferences', coalesce(p.public_profile_preferences, '{}'::jsonb),
    'golden_likes_count', p.golden_likes_count,
    'latitude', l.latitude,
    'longitude', l.longitude,
    'is_ghost_mode', p.is_ghost_mode,
    'show_on_public_profile', p.show_on_public_profile,
    'onboarding_completed_at', p.onboarding_completed_at,
    'profile_version', p.profile_version,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) into v_result
  from public.profiles p
  left join public.profile_locations_private l on l.profile_id = p.id
  where p.id = v_user_id;

  return v_result;
end;
$$;

revoke all on function public.get_my_private_profile()
  from public, anon, authenticated;
grant execute on function public.get_my_private_profile() to authenticated, service_role;

create or replace view public.public_profile_cards
with (security_invoker = true, security_barrier = true)
as
select
  p.id,
  p.username,
  coalesce(p.display_name, p.full_name) as display_name,
  p.bio,
  p.avatar_url,
  p.avatar_style_key,
  p.primary_role_key,
  p.city,
  p.country_code,
  p.commune_code,
  p.zone_id,
  p.district_name,
  p.district_name as zone_name,
  p.scene_name,
  coalesce(p.avatar_icon_id, p.avatar_style_key) as avatar_icon_id,
  p.profile_image_url,
  p.profile_image_path,
  p.collab_available,
  p.is_online,
  p.followers_count,
  p.following_count,
  p.grade,
  p.is_verified,
  p.social_links,
  p.created_at,
  p.updated_at,
  p.golden_likes_count
from public.profiles p
where coalesce(p.show_on_public_profile, false)
  and not coalesce(p.is_ghost_mode, true);

grant select on public.public_profile_cards to anon, authenticated;

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true)
as
select * from public.public_profile_cards;

grant select on public.public_profiles to anon, authenticated;

comment on table public.daily_golden_likes is
  'Shared iOS/Web Golden Like ledger. One claim per giver per Europe/Paris calendar day; recipient IDs are canonical profile IDs.';
comment on column public.profiles.golden_likes_count is
  'Server-maintained public aggregate. Clients must use give_golden_like(uuid), never update this value.';

-- TODO(post-ios-golden-like-rpc): once iOS calls give_golden_like(uuid), revoke
-- authenticated INSERT on daily_golden_likes and remove the compatibility policy.
