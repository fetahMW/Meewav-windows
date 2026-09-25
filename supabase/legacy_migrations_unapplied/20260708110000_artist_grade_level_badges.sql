-- Meewav grade badges V2
-- Adds the canonical 1..6 badge level while keeping grade_stars as a legacy fallback.

create or replace function public.meewav_artist_grade_tier(level integer)
returns text
language sql
immutable
as $$
  select case level
    when 1 then 'rookie'
    when 2 then 'rising'
    when 3 then 'confirmed'
    when 4 then 'premium'
    when 5 then 'master'
    when 6 then 'legendary'
    else null
  end;
$$;

create or replace function public.meewav_random_artist_grade_level()
returns integer
language plpgsql
volatile
as $$
declare
  roll double precision := random();
begin
  return case
    when roll < 0.28 then 1
    when roll < 0.56 then 2
    when roll < 0.79 then 3
    when roll < 0.93 then 4
    when roll < 0.99 then 5
    else 6
  end;
end;
$$;

do $$
declare
  target_table regclass;
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
        add column if not exists grade_level smallint check (grade_level between 1 and 6)
    $sql$, target_table);

    execute format($sql$
      with seeded as (
        select
          id,
          coalesce(grade_level, grade_stars, public.meewav_random_artist_grade_level()) as next_level
        from %s
        where grade_level is null
          or grade_tier is null
          or grade_color is null
          or grade_assigned_at is null
          or grade_source is null
      )
      update %s artists
      set
        grade_level = seeded.next_level,
        grade_stars = coalesce(artists.grade_stars, least(seeded.next_level, 5)),
        grade_tier = public.meewav_artist_grade_tier(seeded.next_level),
        grade_color = coalesce(artists.grade_color, '#8B5CF6'),
        grade_assigned_at = coalesce(artists.grade_assigned_at, now()),
        grade_source = coalesce(artists.grade_source, 'random_badge_seed_v2')
      from seeded
      where artists.id = seeded.id
    $sql$, target_table, target_table);
  end loop;
end;
$$;

comment on function public.meewav_random_artist_grade_level() is 'Stable once written: random V2 badge level generator, 1 to 6.';

do $$
begin
  if to_regclass('public.mock_artists') is not null then
    comment on column public.mock_artists.grade_level is 'Canonical Meewav badge level, 1 to 6. The frontend renders badges from this stable value.';
  end if;

  if to_regclass('public.musicians') is not null then
    comment on column public.musicians.grade_level is 'Canonical Meewav badge level, 1 to 6. The frontend renders badges from this stable value.';
  end if;
end;
$$;
