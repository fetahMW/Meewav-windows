-- Meewav shared identity and social foundation.
--
-- This migration deliberately extends the existing iOS/Web tables. It does not
-- replace profiles, follows, notifications, or any Rooms v2 object.
-- New accounts are private until complete_onboarding() explicitly persists the
-- user's choices.

create extension if not exists pgcrypto;

-- The historical schema granted every future public table, sequence and
-- function to browser roles. Reset those defaults before creating any Web
-- object; every client-facing privilege below is granted explicitly.
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;

create or replace function public.meewav_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Canonical profiles (shared with iOS)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  full_name text,
  bio text,
  avatar_url text,
  avatar_name text,
  artist_type text,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  is_ghost_mode boolean default true,
  show_on_public_profile boolean default false,
  followers_count integer default 0,
  following_count integer default 0,
  grade integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists avatar_style_key text,
  add column if not exists primary_role_key text,
  add column if not exists country_code text,
  add column if not exists commune_code text,
  add column if not exists zone_id text,
  add column if not exists district_name text,
  add column if not exists scene_name text,
  add column if not exists avatar_icon_id text,
  add column if not exists public_profile_preferences jsonb not null default '{}'::jsonb,
  add column if not exists profile_image_path text,
  add column if not exists collab_available boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists profile_version bigint not null default 1;

-- Do not change historical visibility values. Only make the safe defaults apply
-- to future rows whose clients omit the fields.
alter table public.profiles
  alter column is_ghost_mode set default true,
  alter column show_on_public_profile set default false;

create index if not exists profiles_public_visibility_idx
  on public.profiles (show_on_public_profile, is_ghost_mode)
  where show_on_public_profile is true;

create index if not exists profiles_primary_role_key_idx
  on public.profiles (primary_role_key)
  where primary_role_key is not null;

-- ---------------------------------------------------------------------------
-- Canonical role and avatar catalogs
-- ---------------------------------------------------------------------------

create table if not exists public.artist_roles (
  key text primary key,
  label text not null,
  category text not null default 'role',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.artist_roles
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.artist_roles (key, label, category, sort_order, is_active)
values
  ('viewer', 'Utilisateur / Utilisatrice', 'audience', 10, true),
  ('vocalist', 'Chanteur / Chanteuse / Rappeur', 'performance', 20, true),
  ('dancer', 'Danseur / Danseuse', 'performance', 30, true),
  ('beatmaker', 'Beatmaker', 'creation', 40, true),
  ('dj', 'DJ', 'performance', 50, true),
  ('beatboxer', 'Beatboxer', 'performance', 60, true),
  ('acoustic_guitarist', 'Guitariste acoustique', 'instrument', 70, true),
  ('electric_guitarist', 'Guitariste électrique', 'instrument', 80, true),
  ('pianist', 'Pianiste', 'instrument', 90, true),
  ('drummer', 'Batteur / Batteuse', 'instrument', 100, true),
  ('bassist', 'Bassiste', 'instrument', 110, true),
  ('violinist', 'Violoniste', 'instrument', 120, true),
  ('accordionist', 'Accordéoniste', 'instrument', 130, true),
  ('strings_instrumentalist', 'Instrumentiste à cordes', 'instrument', 140, true),
  ('wind_instrumentalist', 'Instrumentiste à vent', 'instrument', 150, true),
  ('brass_instrumentalist', 'Instrumentiste à cuivre', 'instrument', 160, true),
  ('percussionist', 'Percussionniste', 'instrument', 170, true),
  ('songwriter', 'Auteur / Parolier', 'creation', 180, true),
  ('composer', 'Compositeur', 'creation', 190, true),
  ('producer', 'Producteur', 'creation', 200, true),
  ('sound_designer', 'Sound designer', 'production', 210, true),
  ('sound_engineer', 'Ingénieur du son', 'production', 220, true),
  ('vocal_coach', 'Coach vocal', 'production', 230, true),
  ('artistic_director', 'Direction artistique', 'production', 240, true),
  ('manager', 'Management', 'business', 250, true),
  ('label', 'Label', 'business', 260, true),
  ('videomaker', 'Vidéaste clipper', 'visual', 270, true),
  ('studio', 'Studio', 'production', 280, true),
  ('stage_organization', 'Organisation scénique', 'live', 290, true)
on conflict (key) do update
set label = excluded.label,
    category = excluded.category,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

drop trigger if exists artist_roles_touch_updated_at on public.artist_roles;
create trigger artist_roles_touch_updated_at
before update on public.artist_roles
for each row execute function public.meewav_touch_updated_at();

create table if not exists public.avatar_styles (
  key text primary key,
  label text not null,
  asset_filename text not null unique,
  default_role_key text references public.artist_roles(key) on delete restrict,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.avatar_styles (key, label, asset_filename, default_role_key, sort_order)
values
  ('avatar_3', 'Utilisatrice', 'Utilisatrice.png', 'viewer', 10),
  ('avatar_4', 'Utilisateur', 'Utilisateur.png', 'viewer', 20),
  ('avatar_23', 'Chanteuse, rappeuse', 'Chanteuse, rappeuse.png', 'vocalist', 30),
  ('avatar_24', 'Chanteur, rappeur', 'Chanteur, rappeur..png', 'vocalist', 40),
  ('avatar_19', 'Danseuse', 'danseuse.png', 'dancer', 50),
  ('avatar_20', 'Danseur', 'danseurs.png', 'dancer', 60),
  ('avatar_25', 'Beatmaker', 'Beatmaker.png', 'beatmaker', 70),
  ('avatar_17', 'DJ', 'DJ.png', 'dj', 80),
  ('avatar_26', 'Beatboxer', 'Beatboxer.png', 'beatboxer', 90),
  ('avatar_16', 'Guitariste acoustique', 'Guitariste acoustique.png', 'acoustic_guitarist', 100),
  ('avatar_15', 'Guitariste électrique', 'Guitariste électrique..png', 'electric_guitarist', 110),
  ('avatar_7', 'Pianiste', 'Pianiste..png', 'pianist', 120),
  ('avatar_27', 'Batteur, batteuse', 'batteurs, batteuses.png', 'drummer', 130),
  ('avatar_28', 'Bassiste', 'Bassiste.png', 'bassist', 140),
  ('avatar_1', 'Violoniste', 'Violoniste.png', 'violinist', 150),
  ('avatar_30', 'Accordéoniste', 'accordéoniste.png', 'accordionist', 160),
  ('avatar_31', 'Instrumentiste à cordes', 'Instrumentiste à cordes V2.png', 'strings_instrumentalist', 170),
  ('avatar_13', 'Instrumentiste à vent', 'Instruments a vent.png', 'wind_instrumentalist', 180),
  ('avatar_12', 'Instrumentiste à cuivre', 'Instrumentiste à cuivre..png', 'brass_instrumentalist', 190),
  ('avatar_8', 'Percussionniste', 'percussionniste.png', 'percussionist', 200),
  ('avatar_29', 'Auteur, parolier', 'Auteur parolier.png', 'songwriter', 210),
  ('avatar_21', 'Compositeur', 'Compositeur.png', 'composer', 220),
  ('avatar_33', 'Producteur', 'Producteur musicalv2.png', 'producer', 230),
  ('avatar_6', 'Sound designer', 'Sound designer.png', 'sound_designer', 240),
  ('avatar_14', 'Ingénieur du son', 'Ingénieur du son.png', 'sound_engineer', 250),
  ('avatar_22', 'Coach vocal', 'Coatch vocal.png', 'vocal_coach', 260),
  ('avatar_18', 'Direction artistique', 'Direction artistique V2.png', 'artistic_director', 270),
  ('avatar_10', 'Management', 'Ménagement.png', 'manager', 280),
  ('avatar_11', 'Label', 'Label.png', 'label', 290),
  ('avatar_2', 'Vidéaste clipper', 'vidéaste clipper.png', 'videomaker', 300),
  ('avatar_5', 'Studio', 'Studio d''enregistrement.png', 'studio', 310),
  ('avatar_9', 'Organisation scénique', 'Organisation Scénique.png', 'stage_organization', 320)
on conflict (key) do update
set label = excluded.label,
    asset_filename = excluded.asset_filename,
    default_role_key = excluded.default_role_key,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

-- Globe still knows this historical second string-instrument asset. Keep the
-- key resolvable for old rows, but do not offer it as a duplicate onboarding
-- choice.
insert into public.avatar_styles (
  key, label, asset_filename, default_role_key, sort_order, is_active
) values (
  'avatar_32', 'Instrumentiste à cordes (legacy)',
  'Instrumentiste à cordes.png', 'strings_instrumentalist', 171, false
)
on conflict (key) do update
set label = excluded.label,
    asset_filename = excluded.asset_filename,
    default_role_key = excluded.default_role_key,
    sort_order = excluded.sort_order,
    is_active = false,
    updated_at = now();

drop trigger if exists avatar_styles_touch_updated_at on public.avatar_styles;
create trigger avatar_styles_touch_updated_at
before update on public.avatar_styles
for each row execute function public.meewav_touch_updated_at();

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.artist_roles(key) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, role_key)
);

create unique index if not exists profile_roles_one_primary_idx
  on public.profile_roles (profile_id)
  where is_primary is true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_style_key_fk'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_style_key_fk
      foreign key (avatar_style_key) references public.avatar_styles(key)
      on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_primary_role_key_fk'
  ) then
    alter table public.profiles
      add constraint profiles_primary_role_key_fk
      foreign key (primary_role_key) references public.artist_roles(key)
      on delete set null not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exact location is private; the Globe reads only the coarse projection.
-- ---------------------------------------------------------------------------

create table if not exists public.profile_locations_private (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  city text,
  country_code text,
  latitude double precision,
  longitude double precision,
  precision_source text not null default 'user_onboarding',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_locations_private_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint profile_locations_private_longitude_check
    check (longitude is null or longitude between -180 and 180),
  constraint profile_locations_private_pair_check
    check ((latitude is null) = (longitude is null)),
  constraint profile_locations_private_country_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

create table if not exists public.profile_public_markers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  city text,
  country_code text,
  commune_code text,
  zone_id text,
  zone_name text,
  avatar_icon_id text,
  scene_name text,
  latitude double precision,
  longitude double precision,
  is_visible boolean not null default false,
  projection_version smallint not null default 1,
  updated_at timestamptz not null default now(),
  constraint profile_public_markers_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint profile_public_markers_longitude_check
    check (longitude is null or longitude between -180 and 180),
  constraint profile_public_markers_pair_check
    check ((latitude is null) = (longitude is null))
);

alter table public.profile_public_markers
  add column if not exists commune_code text,
  add column if not exists zone_id text,
  add column if not exists zone_name text,
  add column if not exists avatar_icon_id text,
  add column if not exists scene_name text;

create index if not exists profile_public_markers_visible_idx
  on public.profile_public_markers (latitude, longitude)
  where is_visible is true;

create or replace function public.meewav_coarse_coordinate(value double precision)
returns double precision
language sql
immutable
strict
as $$
  -- Approximately kilometre-scale at Paris latitudes. Exact coordinates never
  -- leave profile_locations_private.
  select round(value::numeric, 2)::double precision;
$$;

create or replace function public.meewav_refresh_public_marker(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profile_public_markers (
    profile_id, city, country_code, commune_code, zone_id, zone_name,
    avatar_icon_id, scene_name, latitude, longitude, is_visible, updated_at
  )
  select
    p.id,
    coalesce(l.city, p.city),
    coalesce(l.country_code, p.country_code),
    p.commune_code,
    p.zone_id,
    p.district_name,
    coalesce(p.avatar_icon_id, p.avatar_style_key),
    p.scene_name,
    public.meewav_coarse_coordinate(l.latitude),
    public.meewav_coarse_coordinate(l.longitude),
    coalesce(not p.is_ghost_mode, false)
      and coalesce(p.show_on_public_profile, false)
      and l.latitude is not null
      and l.longitude is not null,
    now()
  from public.profiles p
  left join public.profile_locations_private l on l.profile_id = p.id
  where p.id = p_profile_id
  on conflict (profile_id) do update
  set city = excluded.city,
      country_code = excluded.country_code,
      commune_code = excluded.commune_code,
      zone_id = excluded.zone_id,
      zone_name = excluded.zone_name,
      avatar_icon_id = excluded.avatar_icon_id,
      scene_name = excluded.scene_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      is_visible = excluded.is_visible,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.meewav_profile_visibility_marker_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.meewav_refresh_public_marker(new.id);
  return new;
end;
$$;

create or replace function public.meewav_private_location_marker_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.meewav_refresh_public_marker(old.profile_id);
    return old;
  end if;

  perform public.meewav_refresh_public_marker(new.profile_id);
  return new;
end;
$$;

drop trigger if exists profiles_refresh_public_marker on public.profiles;
create trigger profiles_refresh_public_marker
after insert or update of is_ghost_mode, show_on_public_profile, city,
  country_code, commune_code, zone_id, district_name, avatar_icon_id,
  avatar_style_key, scene_name on public.profiles
for each row execute function public.meewav_profile_visibility_marker_trigger();

drop trigger if exists profile_locations_refresh_public_marker on public.profile_locations_private;
create trigger profile_locations_refresh_public_marker
after insert or update or delete on public.profile_locations_private
for each row execute function public.meewav_private_location_marker_trigger();

drop trigger if exists profile_locations_touch_updated_at on public.profile_locations_private;
create trigger profile_locations_touch_updated_at
before update on public.profile_locations_private
for each row execute function public.meewav_touch_updated_at();

-- Lossless compatibility backfill for the existing shared profiles: preserve
-- any precise coordinate in the private table before replacing the legacy
-- public columns with the coarse projection.
insert into public.profile_locations_private (
  profile_id, city, country_code, latitude, longitude, precision_source
)
select
  p.id,
  p.city,
  case when upper(coalesce(p.country, '')) ~ '^[A-Z]{2}$' then upper(p.country) else null end,
  p.latitude,
  p.longitude,
  'legacy_profiles_backfill'
from public.profiles p
where p.latitude between -90 and 90
  and p.longitude between -180 and 180
on conflict (profile_id) do nothing;

update public.profiles p
set latitude = public.meewav_coarse_coordinate(l.latitude),
    longitude = public.meewav_coarse_coordinate(l.longitude),
    updated_at = now()
from public.profile_locations_private l
where l.profile_id = p.id
  and (p.latitude is distinct from public.meewav_coarse_coordinate(l.latitude)
       or p.longitude is distinct from public.meewav_coarse_coordinate(l.longitude));

update public.profiles p
set avatar_style_key = a.key,
    updated_at = now()
from public.avatar_styles a
where p.avatar_style_key is null
  and a.is_active
  and (
    lower(a.asset_filename) = lower(coalesce(p.avatar_name, ''))
    or lower(a.key) = lower(coalesce(p.avatar_icon_id, ''))
  );

with mapped_roles as (
  select
    p.id,
    coalesce(r.key, a.default_role_key) as role_key
  from public.profiles p
  left join public.artist_roles r
    on r.is_active
   and (lower(r.key) = lower(coalesce(p.artist_type, ''))
        or lower(r.label) = lower(coalesce(p.artist_type, '')))
  left join public.avatar_styles a on a.key = p.avatar_style_key
  where p.primary_role_key is null
)
update public.profiles p
set primary_role_key = m.role_key,
    updated_at = now()
from mapped_roles m
where p.id = m.id and m.role_key is not null;

insert into public.profile_roles(profile_id, role_key, is_primary)
select p.id, p.primary_role_key, true
from public.profiles p
where p.primary_role_key is not null
on conflict (profile_id, role_key) do update set is_primary = true;

select public.meewav_refresh_public_marker(p.id)
from public.profiles p;

-- ---------------------------------------------------------------------------
-- Auth/onboarding RPC contract shared by Web and iOS.
-- ---------------------------------------------------------------------------

create or replace function public.meewav_normalize_username(p_username text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(p_username, '')));
$$;

create or replace function public.is_profile_username_available(p_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_username text := public.meewav_normalize_username(p_username);
begin
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles p
    where lower(btrim(p.username)) = v_username
      and (auth.uid() is null or p.id <> auth.uid())
  );
end;
$$;

comment on function public.is_profile_username_available(text) is
  'Compatibility RPC shared with iOS. Returns false for invalid or already-used usernames.';

create or replace function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_avatar_style_key text,
  p_primary_role_key text,
  p_city text,
  p_country_code text,
  p_latitude double precision,
  p_longitude double precision,
  p_is_ghost_mode boolean,
  p_show_on_public_profile boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := public.meewav_normalize_username(p_username);
  v_display_name text := nullif(trim(p_display_name), '');
  v_country_code text := nullif(upper(trim(p_country_code)), '');
  v_avatar_key text;
  v_role_key text;
  v_avatar_filename text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception using errcode = '22023', message = 'invalid_username';
  end if;

  if v_display_name is null or char_length(v_display_name) > 80 then
    raise exception using errcode = '22023', message = 'invalid_display_name';
  end if;

  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_country_code';
  end if;

  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180) then
    raise exception using errcode = '22023', message = 'invalid_coordinates';
  end if;

  select a.key, a.asset_filename, coalesce(r.key, a.default_role_key)
    into v_avatar_key, v_avatar_filename, v_role_key
  from public.avatar_styles a
  left join public.artist_roles r
    on r.is_active
   and (
     lower(r.key) = lower(trim(p_primary_role_key))
     or lower(r.label) = lower(trim(p_primary_role_key))
   )
  where a.is_active
    and (
      lower(a.key) = lower(trim(p_avatar_style_key))
      or lower(a.asset_filename) = lower(trim(p_avatar_style_key))
    )
  limit 1;

  if v_avatar_key is null then
    raise exception using errcode = '22023', message = 'invalid_avatar_style';
  end if;

  if p_primary_role_key is not null
     and trim(p_primary_role_key) <> ''
     and not exists (
       select 1 from public.artist_roles r
       where r.is_active
         and (lower(r.key) = lower(trim(p_primary_role_key))
              or lower(r.label) = lower(trim(p_primary_role_key)))
     ) then
    -- Legacy labels such as "Chanteuse, rappeuse" are represented by the
    -- avatar's canonical default role rather than persisted as free text.
    v_role_key := (select default_role_key from public.avatar_styles where key = v_avatar_key);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_username, 0));

  if exists (
    select 1 from public.profiles p
    where lower(btrim(p.username)) = v_username and p.id <> v_user_id
  ) then
    raise exception using errcode = '23505', message = 'username_unavailable';
  end if;

  insert into public.profiles (
    id, username, full_name, display_name, avatar_name, avatar_style_key,
    avatar_icon_id,
    artist_type, primary_role_key, city, country, country_code,
    latitude, longitude, is_ghost_mode, show_on_public_profile,
    onboarding_completed_at, profile_version, updated_at
  )
  values (
    v_user_id, v_username, v_display_name, v_display_name, v_avatar_filename,
    v_avatar_key, v_avatar_key, v_role_key, v_role_key, nullif(trim(p_city), ''),
    v_country_code, v_country_code,
    public.meewav_coarse_coordinate(p_latitude),
    public.meewav_coarse_coordinate(p_longitude),
    coalesce(p_is_ghost_mode, true),
    coalesce(p_show_on_public_profile, false),
    now(), 1, now()
  )
  on conflict (id) do update
  set username = excluded.username,
      full_name = excluded.full_name,
      display_name = excluded.display_name,
      avatar_name = excluded.avatar_name,
      avatar_style_key = excluded.avatar_style_key,
      avatar_icon_id = excluded.avatar_icon_id,
      artist_type = excluded.artist_type,
      primary_role_key = excluded.primary_role_key,
      city = excluded.city,
      country = excluded.country,
      country_code = excluded.country_code,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      is_ghost_mode = excluded.is_ghost_mode,
      show_on_public_profile = excluded.show_on_public_profile,
      onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now()),
      profile_version = public.profiles.profile_version + 1,
      updated_at = now();

  update public.profile_roles
  set is_primary = false
  where profile_id = v_user_id and role_key <> v_role_key and is_primary;

  insert into public.profile_roles (profile_id, role_key, is_primary)
  values (v_user_id, v_role_key, true)
  on conflict (profile_id, role_key) do update set is_primary = true;

  if p_latitude is not null then
    insert into public.profile_locations_private (
      profile_id, city, country_code, latitude, longitude, precision_source, updated_at
    ) values (
      v_user_id, nullif(trim(p_city), ''), v_country_code,
      p_latitude, p_longitude, 'onboarding', now()
    )
    on conflict (profile_id) do update
    set city = excluded.city,
        country_code = excluded.country_code,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        precision_source = excluded.precision_source,
        updated_at = now();
  end if;

  perform public.meewav_refresh_public_marker(v_user_id);

  select jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', coalesce(p.display_name, p.full_name),
      'avatar_style_key', p.avatar_style_key,
      'avatar_icon_id', p.avatar_icon_id,
      'primary_role_key', p.primary_role_key,
      'city', p.city,
      'country_code', p.country_code,
      'is_ghost_mode', p.is_ghost_mode,
      'show_on_public_profile', p.show_on_public_profile,
      'onboarding_completed_at', p.onboarding_completed_at,
      'profile_version', p.profile_version
    )
  ) into v_result
  from public.profiles p where p.id = v_user_id;

  return v_result;
end;
$$;

comment on function public.complete_onboarding(
  text, text, text, text, text, text, double precision, double precision, boolean, boolean
) is
  'Idempotent authenticated onboarding RPC. Returns {ok:true, profile:{safe public fields}}. Exact coordinates remain private.';

-- The Globe geocoder owns commune/zone resolution, while onboarding owns the
-- identity row. Keep the stable 10-argument onboarding signature for iOS and
-- persist the discovery context through this additive owner-only RPC.
create or replace function public.update_my_public_discovery_profile(
  p_scene_name text,
  p_commune_code text default null,
  p_zone_id text default null,
  p_district_name text default null,
  p_avatar_icon_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_avatar_icon_id text := nullif(trim(p_avatar_icon_id), '');
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if char_length(coalesce(p_scene_name, '')) > 120
     or char_length(coalesce(p_commune_code, '')) > 32
     or char_length(coalesce(p_zone_id, '')) > 80
     or char_length(coalesce(p_district_name, '')) > 120 then
    raise exception using errcode = '22001', message = 'public_discovery_value_too_long';
  end if;

  if v_avatar_icon_id is not null
     and not exists (
       select 1 from public.avatar_styles a
       where a.is_active and lower(a.key) = lower(v_avatar_icon_id)
     ) then
    raise exception using errcode = '22023', message = 'invalid_avatar_icon_id';
  end if;

  update public.profiles p
  set scene_name = nullif(trim(p_scene_name), ''),
      commune_code = nullif(trim(p_commune_code), ''),
      zone_id = nullif(trim(p_zone_id), ''),
      district_name = nullif(trim(p_district_name), ''),
      avatar_icon_id = coalesce(v_avatar_icon_id, p.avatar_style_key),
      profile_version = p.profile_version + 1,
      updated_at = now()
  where p.id = v_user_id;

  if not found then
    raise exception using errcode = '23503', message = 'profile_not_found';
  end if;

  select jsonb_build_object(
    'ok', true,
    'scene_name', p.scene_name,
    'commune_code', p.commune_code,
    'zone_id', p.zone_id,
    'zone_name', p.district_name,
    'avatar_icon_id', p.avatar_icon_id
  ) into v_result
  from public.profiles p
  where p.id = v_user_id;

  return v_result;
end;
$$;

comment on function public.update_my_public_discovery_profile(text, text, text, text, text) is
  'Owner-only additive onboarding/Globe context RPC. It never accepts or returns exact coordinates.';

create or replace function public.get_my_private_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
    'city', coalesce(l.city, p.city),
    'country', p.country,
    'country_code', coalesce(l.country_code, p.country_code),
    'latitude', l.latitude,
    'longitude', l.longitude,
    'is_ghost_mode', p.is_ghost_mode,
    'show_on_public_profile', p.show_on_public_profile,
    'onboarding_completed_at', p.onboarding_completed_at,
    'profile_version', p.profile_version
  ) into v_result
  from public.profiles p
  left join public.profile_locations_private l on l.profile_id = p.id
  where p.id = v_user_id;

  return v_result;
end;
$$;

comment on function public.get_my_private_profile() is
  'Owner-only projection for private contact and exact location data. Never grant to anon.';

-- Auth trigger compatible with the current iOS metadata contract. Contact data
-- remains protected by RLS/projections; exact coordinates are moved to the
-- private location table and only a coarse copy remains on profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_username text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  v_display_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  v_avatar_url text := nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), '');
  v_avatar_name text := nullif(btrim(new.raw_user_meta_data ->> 'avatar_name'), '');
  v_avatar_icon_id text := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'avatar_icon_id',
    new.raw_user_meta_data ->> 'avatar_style_key'
  )), '');
  v_artist_type text := nullif(btrim(new.raw_user_meta_data ->> 'artist_type'), '');
  v_birth_date date;
  v_street text := nullif(btrim(new.raw_user_meta_data ->> 'street'), '');
  v_postal_code text := nullif(btrim(new.raw_user_meta_data ->> 'postal_code'), '');
  v_city text := nullif(btrim(new.raw_user_meta_data ->> 'city'), '');
  v_country text := nullif(btrim(new.raw_user_meta_data ->> 'country'), '');
  v_country_code text := nullif(upper(btrim(new.raw_user_meta_data ->> 'country_code')), '');
  v_commune_code text := nullif(btrim(new.raw_user_meta_data ->> 'commune_code'), '');
  v_zone_id text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'zone_id'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'district_id'), '')
  );
  v_district_id text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'district_id'), ''),
    v_zone_id
  );
  v_district_name text := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'district_name',
    new.raw_user_meta_data ->> 'zone_name'
  )), '');
  v_scene_name text := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'scene_name',
    new.raw_user_meta_data ->> 'music_scene'
  )), '');
  v_scene_source text := nullif(btrim(new.raw_user_meta_data ->> 'scene_source'), '');
  v_latitude double precision;
  v_longitude double precision;
  v_avatar_key text;
  v_role_key text;
  v_requested_role_key text;
  v_is_ghost_mode boolean := true;
  v_show_on_public_profile boolean := false;
begin
  if v_username is not null and char_length(v_username) > 20 then
    v_username := null;
  end if;

  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    v_country_code := null;
  end if;

  if v_country_code is null and v_country is not null and upper(v_country) ~ '^[A-Z]{2}$' then
    v_country_code := upper(v_country);
  end if;

  begin
    v_birth_date := nullif(new.raw_user_meta_data ->> 'birth_date', '')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    v_birth_date := null;
  end;

  if v_scene_source not in ('iris', 'single-plate') then
    v_scene_source := null;
  end if;

  begin
    v_latitude := nullif(new.raw_user_meta_data ->> 'latitude', '')::double precision;
    v_longitude := nullif(new.raw_user_meta_data ->> 'longitude', '')::double precision;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_latitude := null;
    v_longitude := null;
  end;

  if (v_latitude is null) <> (v_longitude is null)
     or (v_latitude is not null and v_latitude not between -90 and 90)
     or (v_longitude is not null and v_longitude not between -180 and 180) then
    v_latitude := null;
    v_longitude := null;
  end if;

  v_is_ghost_mode := case lower(coalesce(new.raw_user_meta_data ->> 'is_ghost_mode', ''))
    when 'false' then false when 'true' then true else true end;
  v_show_on_public_profile := case lower(coalesce(new.raw_user_meta_data ->> 'show_on_public_profile', ''))
    when 'true' then true when 'false' then false else false end;

  select a.key, a.default_role_key
  into v_avatar_key, v_role_key
  from public.avatar_styles a
  where lower(a.key) = lower(coalesce(v_avatar_icon_id, v_avatar_name, ''))
     or lower(a.asset_filename) = lower(coalesce(v_avatar_icon_id, v_avatar_name, ''))
  order by a.is_active desc
  limit 1;

  select r.key into v_requested_role_key
  from public.artist_roles r
  where r.is_active
    and (lower(r.key) = lower(coalesce(v_artist_type, ''))
         or lower(r.label) = lower(coalesce(v_artist_type, '')))
  limit 1;

  v_role_key := coalesce(v_requested_role_key, v_role_key);

  insert into public.profiles (
    id, username, email, phone, birth_date, street, postal_code,
    full_name, display_name,
    avatar_url, avatar_name, avatar_style_key, avatar_icon_id,
    artist_type, primary_role_key,
    city, country, country_code, commune_code, zone_id, district_id,
    district_name, scene_name, scene_source, latitude, longitude,
    is_ghost_mode, show_on_public_profile, created_at, updated_at
  ) values (
    new.id,
    v_username,
    new.email,
    new.phone,
    v_birth_date,
    v_street,
    v_postal_code,
    v_display_name,
    v_display_name,
    v_avatar_url,
    v_avatar_name,
    v_avatar_key,
    coalesce(v_avatar_key, v_avatar_icon_id),
    v_artist_type,
    v_role_key,
    v_city,
    v_country,
    v_country_code,
    v_commune_code,
    v_zone_id,
    v_district_id,
    v_district_name,
    v_scene_name,
    v_scene_source,
    public.meewav_coarse_coordinate(v_latitude),
    public.meewav_coarse_coordinate(v_longitude),
    v_is_ghost_mode,
    v_show_on_public_profile,
    now(),
    now()
  )
  on conflict (id) do nothing;

  if v_role_key is not null then
    insert into public.profile_roles(profile_id, role_key, is_primary)
    values (new.id, v_role_key, true)
    on conflict (profile_id, role_key) do update set is_primary = true;
  end if;

  if v_latitude is not null then
    insert into public.profile_locations_private(
      profile_id, city, country_code, latitude, longitude, precision_source
    ) values (
      new.id, v_city, v_country_code, v_latitude, v_longitude, 'auth_metadata_compat'
    )
    on conflict (profile_id) do nothing;
  end if;

  perform public.meewav_refresh_public_marker(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- OAuth and iOS can attach or amend onboarding metadata after auth.users has
-- been created. Replace the historical synchronizer as well: private contact
-- fields remain owner-only, exact coordinates move to the private location
-- table, and profiles receives only the coarse compatibility projection.
create or replace function public.sync_profile_from_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := nullif(btrim(v_metadata ->> 'username'), '');
  v_display_name text := nullif(btrim(v_metadata ->> 'full_name'), '');
  v_birth_date date;
  v_avatar_url text := nullif(btrim(v_metadata ->> 'avatar_url'), '');
  v_avatar_name text := nullif(btrim(v_metadata ->> 'avatar_name'), '');
  v_avatar_requested text := nullif(btrim(coalesce(
    v_metadata ->> 'avatar_style_key',
    v_metadata ->> 'avatar_icon_id',
    v_metadata ->> 'avatar_name'
  )), '');
  v_artist_type text := nullif(btrim(v_metadata ->> 'artist_type'), '');
  v_role_requested text := nullif(btrim(coalesce(
    v_metadata ->> 'primary_role_key',
    v_metadata ->> 'artist_type'
  )), '');
  v_street text := nullif(btrim(v_metadata ->> 'street'), '');
  v_postal_code text := nullif(btrim(v_metadata ->> 'postal_code'), '');
  v_city text := nullif(btrim(v_metadata ->> 'city'), '');
  v_country text := nullif(btrim(v_metadata ->> 'country'), '');
  v_country_code text := nullif(upper(btrim(v_metadata ->> 'country_code')), '');
  v_commune_code text := nullif(btrim(v_metadata ->> 'commune_code'), '');
  v_zone_id text := coalesce(
    nullif(btrim(v_metadata ->> 'zone_id'), ''),
    nullif(btrim(v_metadata ->> 'district_id'), '')
  );
  v_district_id text := coalesce(
    nullif(btrim(v_metadata ->> 'district_id'), ''),
    v_zone_id
  );
  v_district_name text := nullif(btrim(coalesce(
    v_metadata ->> 'district_name',
    v_metadata ->> 'zone_name'
  )), '');
  v_scene_name text := nullif(btrim(coalesce(
    v_metadata ->> 'scene_name',
    v_metadata ->> 'music_scene',
    v_metadata ->> 'district_name'
  )), '');
  v_scene_source text := nullif(btrim(v_metadata ->> 'scene_source'), '');
  v_latitude double precision;
  v_longitude double precision;
  v_avatar_key text;
  v_avatar_default_role_key text;
  v_role_key text;
  v_is_ghost_mode boolean;
  v_show_on_public_profile boolean;
begin
  if v_username is not null and (
    char_length(v_username) not between 3 and 20
    or v_username !~ '^[a-zA-Z0-9_]+$'
  ) then
    v_username := null;
  end if;

  begin
    v_birth_date := nullif(v_metadata ->> 'birth_date', '')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    v_birth_date := null;
  end;

  begin
    v_latitude := nullif(v_metadata ->> 'latitude', '')::double precision;
    v_longitude := nullif(v_metadata ->> 'longitude', '')::double precision;
  exception when invalid_text_representation or numeric_value_out_of_range then
    v_latitude := null;
    v_longitude := null;
  end;

  if (v_latitude is null) <> (v_longitude is null)
     or (v_latitude is not null and v_latitude not between -90 and 90)
     or (v_longitude is not null and v_longitude not between -180 and 180) then
    v_latitude := null;
    v_longitude := null;
  end if;

  if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
    v_country_code := null;
  end if;
  if v_country_code is null and v_country is not null and upper(v_country) ~ '^[A-Z]{2}$' then
    v_country_code := upper(v_country);
  end if;
  if v_scene_source not in ('iris', 'single-plate') then
    v_scene_source := null;
  end if;

  v_is_ghost_mode := case lower(coalesce(v_metadata ->> 'is_ghost_mode', ''))
    when 'true' then true when 'false' then false else null end;
  v_show_on_public_profile := case lower(coalesce(v_metadata ->> 'show_on_public_profile', ''))
    when 'true' then true when 'false' then false else null end;

  select a.key, a.default_role_key
  into v_avatar_key, v_avatar_default_role_key
  from public.avatar_styles a
  where lower(a.key) = lower(coalesce(v_avatar_requested, ''))
     or lower(a.asset_filename) = lower(coalesce(v_avatar_requested, ''))
  order by a.is_active desc
  limit 1;

  select r.key into v_role_key
  from public.artist_roles r
  where r.is_active
    and (lower(r.key) = lower(coalesce(v_role_requested, ''))
         or lower(r.label) = lower(coalesce(v_role_requested, '')))
  limit 1;
  v_role_key := coalesce(v_role_key, v_avatar_default_role_key);

  update public.profiles as p
  set username = coalesce(v_username, p.username),
      full_name = coalesce(v_display_name, p.full_name),
      display_name = coalesce(v_display_name, p.display_name, p.full_name),
      email = coalesce(new.email, p.email),
      phone = coalesce(nullif(new.phone, ''), p.phone),
      birth_date = coalesce(v_birth_date, p.birth_date),
      street = coalesce(v_street, p.street),
      postal_code = coalesce(v_postal_code, p.postal_code),
      avatar_url = coalesce(v_avatar_url, p.avatar_url),
      avatar_name = coalesce(v_avatar_name, p.avatar_name),
      avatar_style_key = coalesce(v_avatar_key, p.avatar_style_key),
      avatar_icon_id = coalesce(v_avatar_key, v_avatar_requested, p.avatar_icon_id),
      artist_type = coalesce(v_role_key, v_artist_type, p.artist_type),
      primary_role_key = coalesce(v_role_key, p.primary_role_key),
      city = coalesce(v_city, p.city),
      country = coalesce(v_country, p.country),
      country_code = coalesce(v_country_code, p.country_code),
      commune_code = coalesce(v_commune_code, p.commune_code),
      zone_id = coalesce(v_zone_id, p.zone_id),
      district_id = coalesce(v_district_id, p.district_id),
      district_name = coalesce(v_district_name, p.district_name),
      scene_name = coalesce(v_scene_name, p.scene_name),
      scene_source = coalesce(v_scene_source, p.scene_source),
      latitude = case
        when v_latitude is not null then public.meewav_coarse_coordinate(v_latitude)
        else p.latitude
      end,
      longitude = case
        when v_longitude is not null then public.meewav_coarse_coordinate(v_longitude)
        else p.longitude
      end,
      is_ghost_mode = coalesce(v_is_ghost_mode, p.is_ghost_mode),
      show_on_public_profile = coalesce(v_show_on_public_profile, p.show_on_public_profile),
      profile_version = p.profile_version + 1,
      updated_at = now()
  where p.id = new.id;

  if v_role_key is not null then
    update public.profile_roles
    set is_primary = false
    where profile_id = new.id and is_primary;

    insert into public.profile_roles(profile_id, role_key, is_primary)
    values (new.id, v_role_key, true)
    on conflict (profile_id, role_key) do update set is_primary = true;
  end if;

  if v_latitude is not null then
    insert into public.profile_locations_private (
      profile_id, city, country_code, latitude, longitude,
      precision_source, updated_at
    ) values (
      new.id, v_city, v_country_code, v_latitude, v_longitude,
      'auth_metadata_compat', now()
    )
    on conflict (profile_id) do update
    set city = coalesce(excluded.city, public.profile_locations_private.city),
        country_code = coalesce(excluded.country_code, public.profile_locations_private.country_code),
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        precision_source = excluded.precision_source,
        updated_at = now();
  elsif v_city is not null or v_country_code is not null then
    update public.profile_locations_private
    set city = coalesce(v_city, city),
        country_code = coalesce(v_country_code, country_code),
        updated_at = now()
    where profile_id = new.id;
  end if;

  perform public.meewav_refresh_public_marker(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;
create trigger on_auth_user_metadata_updated
after update of raw_user_meta_data on auth.users
for each row
when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
execute function public.sync_profile_from_auth_metadata();

-- Keep the compatibility artist_type column and the canonical role ledger in
-- one transaction for every Web/iOS profile edit.
create or replace function public.meewav_normalize_profile_primary_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requested text;
  v_role_key text;
begin
  if tg_op = 'UPDATE'
     and new.primary_role_key is not distinct from old.primary_role_key
     and new.artist_type is not distinct from old.artist_type then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_requested := coalesce(
      nullif(btrim(new.primary_role_key), ''),
      nullif(btrim(new.artist_type), '')
    );
  elsif new.primary_role_key is distinct from old.primary_role_key then
    v_requested := nullif(btrim(new.primary_role_key), '');
  else
    v_requested := nullif(btrim(new.artist_type), '');
  end if;

  if v_requested is null then
    new.primary_role_key := null;
    new.artist_type := null;
    return new;
  end if;

  select r.key into v_role_key
  from public.artist_roles r
  where r.is_active
    and (
      lower(r.key) = lower(v_requested)
      or lower(r.label) = lower(v_requested)
    )
  limit 1;

  if v_role_key is null then
    if tg_op = 'INSERT' and new.primary_role_key is null then
      -- Do not make auth.users creation fail for an unknown legacy label. A
      -- later explicit edit must still choose one of the canonical roles.
      return new;
    end if;
    raise exception using errcode = '22023', message = 'invalid_primary_role';
  end if;

  new.primary_role_key := v_role_key;
  new.artist_type := v_role_key;
  return new;
end;
$$;

create or replace function public.meewav_sync_profile_primary_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
     and new.primary_role_key is not distinct from old.primary_role_key then
    return new;
  end if;

  update public.profile_roles
  set is_primary = false
  where profile_id = new.id and is_primary;

  if new.primary_role_key is not null then
    insert into public.profile_roles(profile_id, role_key, is_primary)
    values (new.id, new.primary_role_key, true)
    on conflict (profile_id, role_key) do update set is_primary = true;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_normalize_primary_role on public.profiles;
create trigger profiles_normalize_primary_role
before insert or update on public.profiles
for each row execute function public.meewav_normalize_profile_primary_role();

drop trigger if exists profiles_sync_primary_role on public.profiles;
create trigger profiles_sync_primary_role
after insert or update on public.profiles
for each row execute function public.meewav_sync_profile_primary_role();

-- ---------------------------------------------------------------------------
-- Follows and notifications: retain the iOS table contracts, harden writes.
-- ---------------------------------------------------------------------------

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (follower_id, following_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.follows'::regclass
      and conname = 'follows_no_self_check'
  ) then
    alter table public.follows
      add constraint follows_no_self_check
      check (follower_id <> following_id) not valid;
  end if;
end;
$$;

create index if not exists idx_follows_follower on public.follows(follower_id);
create index if not exists idx_follows_following on public.follows(following_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  from_user_id uuid references auth.users(id) on delete set null,
  content text,
  is_read boolean default false,
  created_at timestamptz default now()
);

alter table public.notifications
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz,
  add column if not exists source_pillar text,
  add column if not exists source_event_id text;

create index if not exists idx_notifications_user
  on public.notifications(user_id, created_at desc);
create unique index if not exists notifications_source_event_unique_idx
  on public.notifications(user_id, source_pillar, source_event_id)
  where source_event_id is not null;

create or replace function public.update_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_follower uuid;
  v_following uuid;
begin
  if tg_op = 'DELETE' then
    v_follower := old.follower_id;
    v_following := old.following_id;
  else
    v_follower := new.follower_id;
    v_following := new.following_id;
  end if;

  update public.profiles p
  set following_count = (
        select count(*)::integer from public.follows f where f.follower_id = v_follower
      ),
      updated_at = now()
  where p.id = v_follower;

  update public.profiles p
  set followers_count = (
        select count(*)::integer from public.follows f where f.following_id = v_following
      ),
      updated_at = now()
  where p.id = v_following;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists on_follow_change on public.follows;
create trigger on_follow_change
after insert or delete on public.follows
for each row execute function public.update_follow_counts();

create or replace function public.create_follow_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (
    user_id, type, from_user_id, content, payload, source_pillar, source_event_id
  ) values (
    new.following_id,
    'follow',
    new.follower_id,
    'a commencé à te suivre',
    jsonb_build_object('follower_id', new.follower_id),
    'profile',
    new.id::text
  )
  on conflict (user_id, source_pillar, source_event_id)
    where source_event_id is not null do nothing;
  return new;
end;
$$;

drop trigger if exists on_new_follow_notification on public.follows;
create trigger on_new_follow_notification
after insert on public.follows
for each row execute function public.create_follow_notification();

create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and not coalesce(is_read, false)
    and (p_notification_ids is null or id = any(p_notification_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and safe projections.
--
-- IMPORTANT DEPLOYMENT GATE: this migration deliberately closes the historical
-- authenticated SELECT * PII leak. The current iOS owner repository still uses
-- profiles.stream()/select('*') and direct private-field updates, so this file
-- MUST NOT be pushed to a shared project before a coordinated iOS release moves
-- owner reads/writes to narrow RPCs. Rooms v2 itself only reads
-- id/username/avatar_url and can move to public_profiles independently.
-- Web uses public_profiles for visitor reads and get_my_private_profile() for
-- owner-private reads.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.artist_roles enable row level security;
alter table public.avatar_styles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.profile_locations_private enable row level security;
alter table public.profile_public_markers enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Tout le monde peut voir les profils" on public.profiles;
drop policy if exists "Insertion de son propre profil" on public.profiles;
drop policy if exists "L'utilisateur peut modifier son propre profil" on public.profiles;
drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
for select to authenticated using (id = auth.uid());
drop policy if exists profiles_visible_select on public.profiles;
create policy profiles_visible_select on public.profiles
for select to anon, authenticated using (
  coalesce(show_on_public_profile, false)
  and not coalesce(is_ghost_mode, true)
);
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists artist_roles_catalog_read on public.artist_roles;
create policy artist_roles_catalog_read on public.artist_roles
for select to anon, authenticated using (is_active);
drop policy if exists avatar_styles_catalog_read on public.avatar_styles;
create policy avatar_styles_catalog_read on public.avatar_styles
for select to anon, authenticated using (is_active);

drop policy if exists profile_roles_owner_or_public_read on public.profile_roles;
create policy profile_roles_owner_or_public_read on public.profile_roles
for select to anon, authenticated using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = profile_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
  )
);
drop policy if exists profile_roles_owner_manage on public.profile_roles;
create policy profile_roles_owner_manage on public.profile_roles
for all to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists profile_locations_private_owner on public.profile_locations_private;
create policy profile_locations_private_owner on public.profile_locations_private
for select to authenticated using (profile_id = auth.uid());
drop policy if exists profile_public_markers_visible on public.profile_public_markers;
create policy profile_public_markers_visible on public.profile_public_markers
for select to anon, authenticated using (is_visible or profile_id = auth.uid());

drop policy if exists "Voir les follows" on public.follows;
drop policy if exists "Follow" on public.follows;
drop policy if exists "Unfollow" on public.follows;
drop policy if exists follows_visible_select on public.follows;
create policy follows_visible_select on public.follows
for select to anon, authenticated using (
  follower_id = auth.uid()
  or following_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = following_id
      and coalesce(p.show_on_public_profile, false)
      and not coalesce(p.is_ghost_mode, true)
  )
);
drop policy if exists follows_owner_insert on public.follows;
create policy follows_owner_insert on public.follows
for insert to authenticated with check (
  follower_id = auth.uid() and following_id <> auth.uid()
);
drop policy if exists follows_owner_delete on public.follows;
create policy follows_owner_delete on public.follows
for delete to authenticated using (follower_id = auth.uid());

drop policy if exists "Voir ses notifications" on public.notifications;
drop policy if exists "Créer des notifications" on public.notifications;
drop policy if exists "Marquer comme lu" on public.notifications;
drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications
for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Remove historical table-wide browser grants. Public/Rooms reads use the
-- PII-free projection below; owner-private fields use get_my_private_profile().
-- Deployment is intentionally gated on the coordinated iOS repository move
-- away from profiles.select('*') and direct private-field updates.
revoke all on public.profiles from authenticated;

grant select (
  id, username, full_name, display_name, bio, avatar_url, avatar_name,
  avatar_style_key, artist_type, primary_role_key, city, country,
  country_code, commune_code, zone_id, district_name, scene_name,
  avatar_icon_id, profile_image_url, profile_image_path, collab_available,
  is_online, followers_count, following_count, grade, is_verified,
  social_links, talents, public_profile_preferences,
  show_on_public_profile, onboarding_completed_at, created_at, updated_at
) on public.profiles to anon, authenticated;
-- Close every legacy anonymous table privilege, then grant back only the
-- explicit PII-free projection below.
revoke all on public.profiles from anon;
grant select (
  id, username, full_name, display_name, bio, avatar_url, avatar_name,
  avatar_style_key, artist_type, primary_role_key, city, country,
  country_code, commune_code, zone_id, district_name, scene_name,
  avatar_icon_id, profile_image_url, profile_image_path, collab_available,
  is_online, followers_count, following_count, grade, is_verified,
  social_links, talents, public_profile_preferences,
  show_on_public_profile, is_ghost_mode, onboarding_completed_at, created_at,
  updated_at
) on public.profiles to anon;
grant select (is_ghost_mode) on public.profiles to authenticated;
grant update (
  username, full_name, display_name, bio, avatar_url, avatar_name,
  avatar_style_key, artist_type, primary_role_key, city, country,
  country_code, commune_code, zone_id, district_name, scene_name,
  avatar_icon_id, profile_image_url, profile_image_path, collab_available,
  is_ghost_mode, show_on_public_profile, social_links, talents,
  public_profile_preferences
) on public.profiles to authenticated;

revoke all on public.follows, public.notifications from anon, authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select (
  id, user_id, type, from_user_id, content, is_read, payload, read_at,
  source_pillar, source_event_id, created_at
) on public.notifications to authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

revoke all on public.profile_roles from anon, authenticated;
grant select on public.artist_roles, public.avatar_styles,
  public.profile_roles, public.profile_public_markers to anon, authenticated;
grant select on public.profile_locations_private to authenticated;

grant all on public.artist_roles, public.avatar_styles, public.profile_roles,
  public.profile_locations_private, public.profile_public_markers,
  public.follows, public.notifications to service_role;

revoke all on function public.is_profile_username_available(text)
  from public, anon, authenticated;
grant execute on function public.is_profile_username_available(text) to anon, authenticated;
grant execute on function public.is_profile_username_available(text) to service_role;
revoke all on function public.complete_onboarding(
  text, text, text, text, text, text, double precision, double precision, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.complete_onboarding(
  text, text, text, text, text, text, double precision, double precision, boolean, boolean
) to authenticated;
revoke all on function public.update_my_public_discovery_profile(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_my_public_discovery_profile(
  text, text, text, text, text
) to authenticated;
revoke all on function public.mark_notifications_read(uuid[])
  from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
revoke all on function public.get_my_private_profile()
  from public, anon, authenticated;
grant execute on function public.get_my_private_profile() to authenticated;
revoke all on function public.meewav_touch_updated_at()
  from public, anon, authenticated;
revoke all on function public.meewav_coarse_coordinate(double precision)
  from public, anon, authenticated;
revoke all on function public.meewav_refresh_public_marker(uuid)
  from public, anon, authenticated;
revoke all on function public.meewav_profile_visibility_marker_trigger()
  from public, anon, authenticated;
revoke all on function public.meewav_private_location_marker_trigger()
  from public, anon, authenticated;
revoke all on function public.meewav_normalize_username(text)
  from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_profile_from_auth_metadata()
  from public, anon, authenticated;
revoke all on function public.meewav_normalize_profile_primary_role()
  from public, anon, authenticated;
revoke all on function public.meewav_sync_profile_primary_role()
  from public, anon, authenticated;
revoke all on function public.update_follow_counts() from public, anon, authenticated;
revoke all on function public.create_follow_notification() from public, anon, authenticated;

-- This legacy username-login helper returned an e-mail address to anonymous
-- callers. Web authentication now accepts e-mail directly; keep the function
-- unavailable until a non-disclosing Edge Function contract exists.
do $$
begin
  if to_regprocedure('public.resolve_profile_email_for_username(text)') is not null then
    execute 'revoke all on function public.resolve_profile_email_for_username(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.meewav_avatar_icon_id(text)') is not null then
    execute 'revoke all on function public.meewav_avatar_icon_id(text) from public, anon, authenticated';
  end if;
end;
$$;

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
  p.updated_at
from public.profiles p
where coalesce(p.show_on_public_profile, false)
  and not coalesce(p.is_ghost_mode, true);

grant select on public.public_profile_cards to anon, authenticated;

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true)
as
select * from public.public_profile_cards;

grant select on public.public_profiles to anon, authenticated;

-- The current Web dashboard treats finance, contracts, equipment,
-- organisation and badges as read-only until their server workflows exist.
-- Historical owner-write grants made authoritative-looking rows forgeable.
revoke all on public.profile_transactions, public.profile_contracts,
  public.profile_hardware_devices, public.profile_organization_invitations,
  public.profile_badges from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.profile_transactions, public.profile_contracts,
  public.profile_hardware_devices, public.profile_organization_invitations,
  public.profile_badges from authenticated;
grant select on public.profile_transactions, public.profile_contracts,
  public.profile_hardware_devices, public.profile_organization_invitations,
  public.profile_badges to authenticated;
grant all on public.profile_transactions, public.profile_contracts,
  public.profile_hardware_devices, public.profile_organization_invitations,
  public.profile_badges to service_role;

comment on table public.profile_locations_private is
  'Exact profile location. Owner/service only; never use directly for Globe tiles.';
comment on table public.profile_public_markers is
  'Kilometre-scale public projection for Globe rendering. Exact coordinates are intentionally absent.';
comment on view public.public_profile_cards is
  'Public profile projection that intentionally excludes email, phone, birth date, street and exact coordinates.';
comment on view public.public_profiles is
  'Canonical PII-free visitor projection. Web visitor queries must use this view instead of profiles.';
