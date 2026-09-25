-- Canonical account -> profile contract for the music-scene onboarding flow.
--
-- Important product invariants:
--   * every newly registered profile starts at badge/grade 1;
--   * clients cannot choose or edit their own grade;
--   * the commune and musical scene selected during signup survive a reload;
--   * username availability can be checked without exposing profile rows/emails.

alter table public.profiles
  add column if not exists commune_code text,
  add column if not exists zone_id text,
  add column if not exists district_id text,
  add column if not exists district_name text,
  add column if not exists scene_name text,
  add column if not exists scene_source text,
  add column if not exists avatar_icon_id text;

alter table public.profiles
  alter column grade set default 1;

update public.profiles
set grade = 1
where grade is null;

alter table public.profiles
  alter column grade set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_grade_range_check'
  ) then
    alter table public.profiles
      add constraint profiles_grade_range_check
      check (grade between 1 and 6);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_scene_source_check'
  ) then
    alter table public.profiles
      add constraint profiles_scene_source_check
      check (scene_source is null or scene_source in ('iris', 'single-plate'));
  end if;
end;
$$;

-- Keep the SQL mapping aligned with getOnboardingAvatarIconId in the web app.
-- A future client may send avatar_icon_id explicitly; older clients only send
-- avatar_name, so the trigger still needs this deterministic fallback.
create or replace function public.meewav_avatar_icon_id(p_avatar_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(btrim(coalesce(p_avatar_name, '')))
    when lower('Violoniste.png') then 'avatar_1'
    when lower('vidéaste clipper.png') then 'avatar_2'
    when lower('Utilisatrice.png') then 'avatar_3'
    when lower('Utilisateur.png') then 'avatar_4'
    when lower('Studio d''enregistrement.png') then 'avatar_5'
    when lower('Sound designer.png') then 'avatar_6'
    when lower('Pianiste..png') then 'avatar_7'
    when lower('percussionniste.png') then 'avatar_8'
    when lower('Organisation Scénique.png') then 'avatar_9'
    when lower('Ménagement.png') then 'avatar_10'
    when lower('Label.png') then 'avatar_11'
    when lower('Instrumentiste à cuivre..png') then 'avatar_12'
    when lower('Instruments a vent.png') then 'avatar_13'
    when lower('Ingénieur du son.png') then 'avatar_14'
    when lower('Guitariste électrique..png') then 'avatar_15'
    when lower('Guitariste acoustique.png') then 'avatar_16'
    when lower('DJ.png') then 'avatar_17'
    when lower('Direction artistique V2.png') then 'avatar_18'
    when lower('danseuse.png') then 'avatar_19'
    when lower('danseurs.png') then 'avatar_20'
    when lower('Compositeur.png') then 'avatar_21'
    when lower('Coatch vocal.png') then 'avatar_22'
    when lower('Chanteuse, rappeuse.png') then 'avatar_23'
    when lower('Chanteur, rappeur..png') then 'avatar_24'
    when lower('Beatmaker.png') then 'avatar_25'
    when lower('Beatboxer.png') then 'avatar_26'
    when lower('batteurs, batteuses.png') then 'avatar_27'
    when lower('Bassiste.png') then 'avatar_28'
    when lower('Auteur parolier.png') then 'avatar_29'
    when lower('accordéoniste.png') then 'avatar_30'
    when lower('Instrumentiste à cordes V2.png') then 'avatar_31'
    when lower('Instrumentiste à cordes.png') then 'avatar_32'
    when lower('Producteur musicalv2.png') then 'avatar_33'
    else 'avatar_4'
  end;
$$;

create or replace function public.meewav_can_manage_profile_grade()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
    or coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function public.enforce_profile_grade()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.grade is null or not public.meewav_can_manage_profile_grade() then
      new.grade := 1;
    end if;
    return new;
  end if;

  if new.grade is distinct from old.grade
    and not public.meewav_can_manage_profile_grade()
  then
    raise exception 'Profile grade is managed server-side'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_grade_on_insert_trigger on public.profiles;
create trigger enforce_profile_grade_on_insert_trigger
before insert on public.profiles
for each row
execute function public.enforce_profile_grade();

drop trigger if exists enforce_profile_grade_on_update_trigger on public.profiles;
create trigger enforce_profile_grade_on_update_trigger
before update of grade on public.profiles
for each row
execute function public.enforce_profile_grade();

-- Backfill the new canonical fields from the immutable signup metadata where
-- possible. Existing explicit profile values always win.
update public.profiles as profile
set
  commune_code = coalesce(profile.commune_code, nullif(btrim(account.raw_user_meta_data->>'commune_code'), '')),
  zone_id = coalesce(
    profile.zone_id,
    nullif(btrim(account.raw_user_meta_data->>'zone_id'), ''),
    nullif(btrim(account.raw_user_meta_data->>'district_id'), '')
  ),
  district_id = coalesce(
    profile.district_id,
    nullif(btrim(account.raw_user_meta_data->>'district_id'), ''),
    nullif(btrim(account.raw_user_meta_data->>'zone_id'), '')
  ),
  district_name = coalesce(profile.district_name, nullif(btrim(account.raw_user_meta_data->>'district_name'), '')),
  scene_name = coalesce(
    profile.scene_name,
    nullif(btrim(account.raw_user_meta_data->>'scene_name'), ''),
    nullif(btrim(account.raw_user_meta_data->>'district_name'), '')
  ),
  scene_source = coalesce(profile.scene_source, nullif(btrim(account.raw_user_meta_data->>'scene_source'), '')),
  avatar_icon_id = coalesce(
    profile.avatar_icon_id,
    nullif(btrim(account.raw_user_meta_data->>'avatar_icon_id'), ''),
    public.meewav_avatar_icon_id(coalesce(account.raw_user_meta_data->>'avatar_name', profile.avatar_name))
  )
from auth.users as account
where account.id = profile.id
  and (
    profile.commune_code is null
    or profile.zone_id is null
    or profile.district_id is null
    or profile.district_name is null
    or profile.scene_name is null
    or profile.scene_source is null
    or profile.avatar_icon_id is null
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  canonical_zone_id text := coalesce(
    nullif(btrim(metadata->>'zone_id'), ''),
    nullif(btrim(metadata->>'district_id'), '')
  );
  canonical_scene_name text := coalesce(
    nullif(btrim(metadata->>'scene_name'), ''),
    nullif(btrim(metadata->>'district_name'), '')
  );
begin
  insert into public.profiles (
    id,
    username,
    full_name,
    email,
    birth_date,
    avatar_url,
    avatar_name,
    avatar_icon_id,
    artist_type,
    street,
    city,
    postal_code,
    country,
    latitude,
    longitude,
    commune_code,
    zone_id,
    district_id,
    district_name,
    scene_name,
    scene_source,
    is_ghost_mode,
    show_on_public_profile,
    grade
  )
  values (
    new.id,
    nullif(btrim(metadata->>'username'), ''),
    nullif(btrim(metadata->>'full_name'), ''),
    new.email,
    nullif(metadata->>'birth_date', '')::date,
    nullif(btrim(metadata->>'avatar_url'), ''),
    nullif(btrim(metadata->>'avatar_name'), ''),
    coalesce(
      nullif(btrim(metadata->>'avatar_icon_id'), ''),
      public.meewav_avatar_icon_id(metadata->>'avatar_name')
    ),
    nullif(btrim(metadata->>'artist_type'), ''),
    nullif(btrim(metadata->>'street'), ''),
    nullif(btrim(metadata->>'city'), ''),
    nullif(btrim(metadata->>'postal_code'), ''),
    nullif(btrim(metadata->>'country'), ''),
    nullif(metadata->>'latitude', '')::double precision,
    nullif(metadata->>'longitude', '')::double precision,
    nullif(btrim(metadata->>'commune_code'), ''),
    canonical_zone_id,
    coalesce(nullif(btrim(metadata->>'district_id'), ''), canonical_zone_id),
    nullif(btrim(metadata->>'district_name'), ''),
    canonical_scene_name,
    nullif(btrim(metadata->>'scene_source'), ''),
    coalesce((metadata->>'is_ghost_mode')::boolean, true),
    coalesce((metadata->>'show_on_public_profile')::boolean, false),
    1
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- OAuth providers create auth.users before the app can attach the selected
-- scene. finalizeMusicSceneOAuthOnboarding subsequently updates user metadata;
-- this trigger brings those late canonical values back into public.profiles.
create or replace function public.sync_profile_from_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  metadata_avatar_name text := nullif(btrim(metadata->>'avatar_name'), '');
  metadata_zone_id text := coalesce(
    nullif(btrim(metadata->>'zone_id'), ''),
    nullif(btrim(metadata->>'district_id'), '')
  );
begin
  update public.profiles as profile
  set
    username = coalesce(nullif(btrim(metadata->>'username'), ''), profile.username),
    full_name = coalesce(nullif(btrim(metadata->>'full_name'), ''), profile.full_name),
    avatar_url = coalesce(nullif(btrim(metadata->>'avatar_url'), ''), profile.avatar_url),
    avatar_name = coalesce(metadata_avatar_name, profile.avatar_name),
    avatar_icon_id = case
      when nullif(btrim(metadata->>'avatar_icon_id'), '') is not null
        then nullif(btrim(metadata->>'avatar_icon_id'), '')
      when metadata_avatar_name is not null
        then public.meewav_avatar_icon_id(metadata_avatar_name)
      else profile.avatar_icon_id
    end,
    artist_type = coalesce(nullif(btrim(metadata->>'artist_type'), ''), profile.artist_type),
    city = coalesce(nullif(btrim(metadata->>'city'), ''), profile.city),
    country = coalesce(nullif(btrim(metadata->>'country'), ''), profile.country),
    latitude = coalesce(nullif(metadata->>'latitude', '')::double precision, profile.latitude),
    longitude = coalesce(nullif(metadata->>'longitude', '')::double precision, profile.longitude),
    commune_code = coalesce(nullif(btrim(metadata->>'commune_code'), ''), profile.commune_code),
    zone_id = coalesce(metadata_zone_id, profile.zone_id),
    district_id = coalesce(
      nullif(btrim(metadata->>'district_id'), ''),
      metadata_zone_id,
      profile.district_id
    ),
    district_name = coalesce(nullif(btrim(metadata->>'district_name'), ''), profile.district_name),
    scene_name = coalesce(
      nullif(btrim(metadata->>'scene_name'), ''),
      nullif(btrim(metadata->>'district_name'), ''),
      profile.scene_name
    ),
    scene_source = coalesce(nullif(btrim(metadata->>'scene_source'), ''), profile.scene_source),
    is_ghost_mode = case
      when metadata ? 'is_ghost_mode' then (metadata->>'is_ghost_mode')::boolean
      else profile.is_ghost_mode
    end,
    show_on_public_profile = case
      when metadata ? 'show_on_public_profile' then (metadata->>'show_on_public_profile')::boolean
      else profile.show_on_public_profile
    end
  where profile.id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;
create trigger on_auth_user_metadata_updated
after update of raw_user_meta_data on auth.users
for each row
when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
execute function public.sync_profile_from_auth_metadata();

-- Usernames are product identifiers and therefore case-insensitive. This
-- index also closes the race between the availability RPC and account insert.
create unique index if not exists profiles_username_normalized_key
on public.profiles (lower(btrim(username)))
where username is not null and btrim(username) <> '';

create or replace function public.is_profile_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select btrim(coalesce(p_username, '')) <> ''
    and not exists (
      select 1
      from public.profiles
      where lower(btrim(username)) = lower(btrim(p_username))
    );
$$;

revoke all on function public.is_profile_username_available(text) from public;
grant execute on function public.is_profile_username_available(text) to anon, authenticated, service_role;

comment on column public.profiles.grade is
  'Canonical Meewav account badge level. New accounts start at 1; only trusted backend roles may change it.';
comment on column public.profiles.commune_code is
  'INSEE commune code selected during music-scene onboarding.';
comment on column public.profiles.zone_id is
  'Canonical IRIS or single-plate scene identifier selected during onboarding.';
comment on column public.profiles.avatar_icon_id is
  'Canonical MapLibre avatar icon identifier derived from the selected avatar.';
comment on function public.is_profile_username_available(text) is
  'Returns username availability without exposing profile rows or email addresses.';
