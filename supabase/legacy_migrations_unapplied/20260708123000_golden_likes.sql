-- Meewav Golden Likes V1
-- One rare daily Golden Like per authenticated user, persisted in Supabase.
-- The frontend only reads counts and calls RPCs; it must not randomize or insert directly.

create extension if not exists pgcrypto;

do $$
declare
  target_table regclass;
  constraint_name text;
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
        add column if not exists golden_likes_count integer not null default 0
    $sql$, target_table);

    constraint_name := replace(target_table::text, '.', '_') || '_golden_likes_count_non_negative';

    begin
      execute format($sql$
        alter table %s
          add constraint %I check (golden_likes_count >= 0)
      $sql$, target_table, constraint_name);
    exception
      when duplicate_object then
        null;
    end;
  end loop;
end;
$$;

create table if not exists public.golden_likes (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_artist_table text not null default 'mock_artists'
    check (recipient_artist_table in ('mock_artists', 'musicians')),
  recipient_artist_id uuid not null,
  day_key date not null,
  created_at timestamptz not null default now(),
  source text not null default 'daily_free_golden_like_v1',

  constraint golden_likes_one_per_user_per_day unique (sender_user_id, day_key)
);

create index if not exists golden_likes_recipient_artist_idx
on public.golden_likes (recipient_artist_table, recipient_artist_id);

create index if not exists golden_likes_sender_user_id_idx
on public.golden_likes (sender_user_id);

create index if not exists golden_likes_day_key_idx
on public.golden_likes (day_key);

create or replace function public.current_golden_like_day()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

create or replace function public.find_golden_like_artist_table(p_artist_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  exists_in_table boolean;
begin
  if to_regclass('public.mock_artists') is not null then
    execute 'select exists (select 1 from public.mock_artists where id::text = $1::text)'
    using p_artist_id
    into exists_in_table;

    if exists_in_table then
      return 'mock_artists';
    end if;
  end if;

  if to_regclass('public.musicians') is not null then
    execute 'select exists (select 1 from public.musicians where id::text = $1::text)'
    using p_artist_id
    into exists_in_table;

    if exists_in_table then
      return 'musicians';
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.sync_artist_golden_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    execute format(
      'update public.%I set golden_likes_count = golden_likes_count + 1 where id::text = $1::text',
      new.recipient_artist_table
    )
    using new.recipient_artist_id;

    return new;
  end if;

  if tg_op = 'DELETE' then
    execute format(
      'update public.%I set golden_likes_count = greatest(golden_likes_count - 1, 0) where id::text = $1::text',
      old.recipient_artist_table
    )
    using old.recipient_artist_id;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists golden_likes_sync_count_insert on public.golden_likes;
create trigger golden_likes_sync_count_insert
after insert on public.golden_likes
for each row
execute function public.sync_artist_golden_likes_count();

drop trigger if exists golden_likes_sync_count_delete on public.golden_likes;
create trigger golden_likes_sync_count_delete
after delete on public.golden_likes
for each row
execute function public.sync_artist_golden_likes_count();

create or replace function public.give_golden_like(p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_day date;
  v_artist_table text;
  v_has_owner_column boolean := false;
  v_artist_owner_user_id uuid;
  v_new_count integer := 0;
begin
  v_user_id := auth.uid();
  v_day := public.current_golden_like_day();

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  v_artist_table := public.find_golden_like_artist_table(p_artist_id);

  if v_artist_table is null then
    return jsonb_build_object('ok', false, 'reason', 'artist_not_found');
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = v_artist_table
      and column_name = 'user_id'
  )
  into v_has_owner_column;

  if v_has_owner_column then
    execute format('select user_id from public.%I where id::text = $1::text', v_artist_table)
    using p_artist_id
    into v_artist_owner_user_id;

    if v_artist_owner_user_id = v_user_id then
      return jsonb_build_object('ok', false, 'reason', 'cannot_golden_like_self');
    end if;
  end if;

  begin
    insert into public.golden_likes (
      sender_user_id,
      recipient_artist_table,
      recipient_artist_id,
      day_key,
      source
    )
    values (
      v_user_id,
      v_artist_table,
      p_artist_id,
      v_day,
      'daily_free_golden_like_v1'
    );
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'already_used_today');
  end;

  execute format('select golden_likes_count from public.%I where id::text = $1::text', v_artist_table)
  using p_artist_id
  into v_new_count;

  return jsonb_build_object(
    'ok', true,
    'reason', 'golden_like_sent',
    'artistId', p_artist_id,
    'goldenLikesCount', coalesce(v_new_count, 0),
    'usedToday', true,
    'dayKey', v_day
  );
end;
$$;

create or replace function public.get_golden_like_state(p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_day date;
  v_artist_table text;
  v_count integer := 0;
  v_used_today boolean := false;
  v_given_to_this_artist_today boolean := false;
begin
  v_user_id := auth.uid();
  v_day := public.current_golden_like_day();
  v_artist_table := public.find_golden_like_artist_table(p_artist_id);

  if v_artist_table is null then
    return jsonb_build_object('ok', false, 'reason', 'artist_not_found');
  end if;

  execute format('select coalesce(golden_likes_count, 0) from public.%I where id::text = $1::text', v_artist_table)
  using p_artist_id
  into v_count;

  if v_user_id is not null then
    select exists (
      select 1
      from public.golden_likes
      where sender_user_id = v_user_id
        and day_key = v_day
    )
    into v_used_today;

    select exists (
      select 1
      from public.golden_likes
      where sender_user_id = v_user_id
        and recipient_artist_table = v_artist_table
        and recipient_artist_id = p_artist_id
        and day_key = v_day
    )
    into v_given_to_this_artist_today;
  end if;

  return jsonb_build_object(
    'ok', true,
    'artistId', p_artist_id,
    'goldenLikesCount', coalesce(v_count, 0),
    'authenticated', v_user_id is not null,
    'usedToday', v_used_today,
    'availableToday', case
      when v_user_id is null then false
      else not v_used_today
    end,
    'givenToThisArtistToday', v_given_to_this_artist_today,
    'dayKey', v_day
  );
end;
$$;

alter table public.golden_likes enable row level security;

drop policy if exists golden_likes_select_own on public.golden_likes;
create policy golden_likes_select_own
on public.golden_likes
for select
to authenticated
using (sender_user_id = auth.uid());

drop policy if exists golden_likes_insert_direct on public.golden_likes;
drop policy if exists golden_likes_update_direct on public.golden_likes;
drop policy if exists golden_likes_delete_direct on public.golden_likes;

grant execute on function public.give_golden_like(uuid) to authenticated;
grant execute on function public.get_golden_like_state(uuid) to anon, authenticated;
grant execute on function public.current_golden_like_day() to anon, authenticated;

comment on table public.golden_likes is 'Persistent daily Golden Likes. V1 allows one free Golden Like per authenticated user per Europe/Paris day.';
