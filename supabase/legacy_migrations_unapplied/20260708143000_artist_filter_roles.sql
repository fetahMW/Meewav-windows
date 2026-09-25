-- Meewav artist filters V1
-- Source of truth for role/style facets and denormalized fields used by MapLibre MVT.

create table if not exists public.artist_roles (
  key text primary key,
  label text not null,
  category text not null default 'role',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.artist_roles (key, label, sort_order)
values
  ('guitarist', 'Guitariste', 10),
  ('pianist', 'Pianiste', 20),
  ('singer', 'Chanteur / Chanteuse', 30),
  ('rapper', 'Rappeur / MC', 40),
  ('dj', 'DJ', 50),
  ('beatmaker', 'Beatmaker', 60),
  ('producer', 'Producteur', 70),
  ('drummer', 'Batteur', 80),
  ('bassist', 'Bassiste', 90),
  ('videomaker', 'Vidéaste', 100),
  ('sound_engineer', 'Ingé son', 110),
  ('songwriter', 'Auteur / Topliner', 120)
on conflict (key) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true;

create or replace function public.meewav_normalize_filter_token(value text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(
    translate(
      lower(coalesce(value, '')),
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
      'aaaaaaceeeeiiiinooooouuuuyyoeae'
    ),
    '[^a-z0-9]+',
    '_',
    'g'
  ));
$$;

create or replace function public.meewav_artist_role_key(value text)
returns text
language sql
immutable
as $$
  select case
    when public.meewav_normalize_filter_token(value) ~ '(avatar_15|avatar_16|guitar|guitariste|guitare|riff)' then 'guitarist'
    when public.meewav_normalize_filter_token(value) ~ '(avatar_6|avatar_7|piano|pianiste|keys|clavier|synth)' then 'pianist'
    when public.meewav_normalize_filter_token(value) ~ '(avatar_23|avatar_24|chante|singer|micro|microphone|voice|vocal|vox)' then 'singer'
    when public.meewav_normalize_filter_token(value) ~ '(rappeur|rapper|rap|mc)' then 'rapper'
    when public.meewav_normalize_filter_token(value) ~ '(avatar_17|(^|_)dj(_|$)|deejay|disc_jockey)' then 'dj'
    when public.meewav_normalize_filter_token(value) ~ '(avatar_25|beatmaker|beats|beat|drums|loop|groove)' then 'beatmaker'
    when public.meewav_normalize_filter_token(value) ~ '(avatar_21|producer|producteur|prod|compositeur|composer|studio)' then 'producer'
    when public.meewav_normalize_filter_token(value) ~ '(drummer|batteur|batteuse|percussion)' then 'drummer'
    when public.meewav_normalize_filter_token(value) ~ '(bassist|bassiste|basse)' then 'bassist'
    when public.meewav_normalize_filter_token(value) ~ '(videaste|videomaker|video|camera)' then 'videomaker'
    when public.meewav_normalize_filter_token(value) ~ '(inge_son|ingenieur_son|sound_engineer|mix|mastering)' then 'sound_engineer'
    when public.meewav_normalize_filter_token(value) ~ '(songwriter|auteur|topliner|parolier|lyrics)' then 'songwriter'
    else null
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
        add column if not exists primary_role_key text,
        add column if not exists primary_role_label text,
        add column if not exists role_keys_index text,
        add column if not exists grade_level smallint check (grade_level between 1 and 6)
    $sql$, target_table);

    execute format($sql$
      update %s artists
      set
        primary_role_key = coalesce(
          nullif(primary_role_key, ''),
          public.meewav_artist_role_key(concat_ws(' ', instrument, artist_rank, avatar_id))
        ),
        grade_level = coalesce(grade_level, grade_stars, 1)
      where primary_role_key is null
         or primary_role_key = ''
         or grade_level is null
    $sql$, target_table);

    execute format($sql$
      update %s artists
      set
        primary_role_label = coalesce(
          nullif(primary_role_label, ''),
          (select label from public.artist_roles where key = artists.primary_role_key),
          'Artiste'
        ),
        role_keys_index = coalesce(nullif(role_keys_index, ''), '|' || primary_role_key || '|')
      where primary_role_label is null
         or primary_role_label = ''
         or role_keys_index is null
         or role_keys_index = ''
    $sql$, target_table);
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.musicians') is not null then
    create table if not exists public.musician_roles (
      musician_id uuid not null references public.musicians(id) on delete cascade,
      role_key text not null references public.artist_roles(key) on delete restrict,
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      primary key (musician_id, role_key)
    );

    create index if not exists musician_roles_role_key_idx
    on public.musician_roles (role_key);

    create index if not exists musician_roles_musician_id_idx
    on public.musician_roles (musician_id);
  end if;
end;
$$;

create or replace function public.get_artist_filter_facets(
  p_city_key text default null,
  p_district_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_table text := case
    when to_regclass('public.mock_artists') is not null then 'mock_artists'
    when to_regclass('public.musicians') is not null then 'musicians'
    else null
  end;
  v_roles jsonb := '[]'::jsonb;
  v_grades jsonb := '[]'::jsonb;
begin
  if v_artist_table is null then
    return jsonb_build_object('ok', false, 'reason', 'artist_table_not_found', 'roles', v_roles, 'grades', v_grades);
  end if;

  execute format($sql$
    select jsonb_agg(
      jsonb_build_object(
        'key', ar.key,
        'label', ar.label,
        'count', coalesce(role_counts.count, 0),
        'sortOrder', ar.sort_order
      )
      order by ar.sort_order asc
    )
    from public.artist_roles ar
    left join (
      select primary_role_key as role_key, count(*)::int as count
      from public.%I
      where primary_role_key is not null
      group by primary_role_key
    ) role_counts on role_counts.role_key = ar.key
    where ar.is_active = true
  $sql$, v_artist_table)
  into v_roles;

  execute format($sql$
    select jsonb_agg(
      jsonb_build_object('level', grade_level, 'count', count)
      order by grade_level asc
    )
    from (
      select coalesce(grade_level, grade_stars, 1) as grade_level, count(*)::int as count
      from public.%I
      group by coalesce(grade_level, grade_stars, 1)
    ) grade_counts
  $sql$, v_artist_table)
  into v_grades;

  return jsonb_build_object(
    'ok', true,
    'roles', coalesce(v_roles, '[]'::jsonb),
    'grades', coalesce(v_grades, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_artist_filter_facets(text, text) to anon, authenticated;
