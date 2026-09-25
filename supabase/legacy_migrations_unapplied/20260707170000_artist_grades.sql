-- Meewav artist grades V1
-- Random for product testing, but persistent once written.
-- The frontend must only read these values; it must not randomize grades.

create or replace function public.meewav_artist_grade_tier(stars integer)
returns text
language sql
immutable
as $$
  select case stars
    when 1 then 'rookie'
    when 2 then 'rising'
    when 3 then 'confirmed'
    when 4 then 'premium'
    when 5 then 'legendary'
    else null
  end;
$$;

create or replace function public.meewav_random_artist_grade_stars()
returns integer
language plpgsql
volatile
as $$
declare
  roll double precision := random();
begin
  return case
    when roll < 0.30 then 1
    when roll < 0.60 then 2
    when roll < 0.82 then 3
    when roll < 0.95 then 4
    else 5
  end;
end;
$$;

create or replace function public.meewav_can_manage_artist_grade()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('role', true), '') in ('postgres', 'service_role', 'supabase_admin');
$$;

create or replace function public.assign_default_artist_grade()
returns trigger
language plpgsql
as $$
begin
  if new.grade_stars is null or not public.meewav_can_manage_artist_grade() then
    new.grade_stars := public.meewav_random_artist_grade_stars();
    new.grade_source := coalesce(new.grade_source, 'random_seed_v1');
  end if;

  new.grade_tier := coalesce(new.grade_tier, public.meewav_artist_grade_tier(new.grade_stars));
  new.grade_color := coalesce(new.grade_color, '#8B5CF6');
  new.grade_assigned_at := coalesce(new.grade_assigned_at, now());

  return new;
end;
$$;

create or replace function public.prevent_client_artist_grade_update()
returns trigger
language plpgsql
as $$
begin
  if public.meewav_can_manage_artist_grade() then
    return new;
  end if;

  if new.grade_stars is distinct from old.grade_stars
    or new.grade_tier is distinct from old.grade_tier
    or new.grade_color is distinct from old.grade_color
    or new.grade_assigned_at is distinct from old.grade_assigned_at
    or new.grade_source is distinct from old.grade_source
  then
    raise exception 'Artist grade fields are managed server-side';
  end if;

  return new;
end;
$$;

do $$
declare
  target_table regclass;
  trigger_name text;
begin
  foreach target_table in array array[
    to_regclass('public.mock_artists'),
    to_regclass('public.musicians')
  ]
  loop
    if target_table is null then
      continue;
    end if;

    execute format($sql$
      alter table %s
        add column if not exists grade_stars integer check (grade_stars between 1 and 5),
        add column if not exists grade_tier text,
        add column if not exists grade_color text,
        add column if not exists grade_assigned_at timestamptz,
        add column if not exists grade_source text
    $sql$, target_table);

    execute format($sql$
      with seeded as (
        select id, public.meewav_random_artist_grade_stars() as stars
        from %s
        where grade_stars is null
      )
      update %s artists
      set
        grade_stars = seeded.stars,
        grade_tier = public.meewav_artist_grade_tier(seeded.stars),
        grade_color = coalesce(artists.grade_color, '#8B5CF6'),
        grade_assigned_at = coalesce(artists.grade_assigned_at, now()),
        grade_source = coalesce(artists.grade_source, 'random_seed_v1')
      from seeded
      where artists.id = seeded.id
    $sql$, target_table, target_table);

    execute format($sql$
      update %s
      set
        grade_tier = public.meewav_artist_grade_tier(grade_stars),
        grade_color = coalesce(grade_color, '#8B5CF6'),
        grade_assigned_at = coalesce(grade_assigned_at, now()),
        grade_source = coalesce(grade_source, 'random_seed_v1')
      where grade_stars is not null
        and (grade_tier is null or grade_color is null or grade_assigned_at is null or grade_source is null)
    $sql$, target_table);

    trigger_name := case
      when target_table::text in ('mock_artists', 'public.mock_artists') then 'assign_default_mock_artist_grade_trigger'
      else 'assign_default_musician_grade_trigger'
    end;

    execute format('drop trigger if exists %I on %s', trigger_name, target_table);
    execute format($sql$
      create trigger %I
      before insert on %s
      for each row
      execute function public.assign_default_artist_grade()
    $sql$, trigger_name, target_table);

    execute format('drop trigger if exists %I on %s', trigger_name || '_prevent_client_update', target_table);
    execute format($sql$
      create trigger %I
      before update on %s
      for each row
      execute function public.prevent_client_artist_grade_update()
    $sql$, trigger_name || '_prevent_client_update', target_table);
  end loop;
end;
$$;

create or replace function public.meewav_artist_grades_audit()
returns table (
  table_name text,
  total_artists integer,
  missing_grade_count integer,
  grade_1_count integer,
  grade_2_count integer,
  grade_3_count integer,
  grade_4_count integer,
  grade_5_count integer
)
language plpgsql
stable
as $$
declare
  target_table regclass;
  target_name text;
begin
  foreach target_table in array array[
    to_regclass('public.mock_artists'),
    to_regclass('public.musicians')
  ]
  loop
    if target_table is null then
      continue;
    end if;

    target_name := split_part(target_table::text, '.', 2);
    if target_name = '' then
      target_name := target_table::text;
    end if;

    return query execute format($sql$
      select
        %L::text as table_name,
        count(*)::integer as total_artists,
        count(*) filter (where grade_stars is null)::integer as missing_grade_count,
        count(*) filter (where grade_stars = 1)::integer as grade_1_count,
        count(*) filter (where grade_stars = 2)::integer as grade_2_count,
        count(*) filter (where grade_stars = 3)::integer as grade_3_count,
        count(*) filter (where grade_stars = 4)::integer as grade_4_count,
        count(*) filter (where grade_stars = 5)::integer as grade_5_count
      from %s
    $sql$, target_name, target_table);
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.mock_artists') is not null then
    comment on column public.mock_artists.grade_stars is 'Persistent Meewav visual grade, 1 to 5 stars. V1 random seed stored in DB.';
  end if;

  if to_regclass('public.musicians') is not null then
    comment on column public.musicians.grade_stars is 'Persistent Meewav visual grade, 1 to 5 stars. V1 random seed stored in DB.';
  end if;
end;
$$;
