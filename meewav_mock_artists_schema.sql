-- Meewav mock artists Supabase schema
-- Run in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.mock_artists (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  district text,
  zone_name text,
  address_label text,
  lat double precision not null,
  lng double precision not null,
  instrument text not null,
  avatar_id text not null,
  country_cluster_id text,
  city_cluster_id text,
  macro_cluster_id text,
  mid_cluster_id text,
  local_cluster_id text,
  micro_cluster_id text,
  nano_cluster_id text,
  anchor_type text,
  anchor_id text,
  render_rank integer,
  source_quality text,
  placement_quality text,
  address_id text,
  identity_seed text,
  display_name text,
  profile_slug text,
  artist_rank text,
  rank_score integer,
  created_at timestamptz not null default now()
);

create index if not exists mock_artists_city_idx on public.mock_artists(city);
create index if not exists mock_artists_cluster_city_idx on public.mock_artists(city_cluster_id);
create index if not exists mock_artists_cluster_macro_idx on public.mock_artists(macro_cluster_id);
create index if not exists mock_artists_cluster_mid_idx on public.mock_artists(mid_cluster_id);
create index if not exists mock_artists_cluster_local_idx on public.mock_artists(local_cluster_id);
create index if not exists mock_artists_cluster_micro_idx on public.mock_artists(micro_cluster_id);
create index if not exists mock_artists_cluster_nano_idx on public.mock_artists(nano_cluster_id);
create index if not exists mock_artists_lat_lng_idx on public.mock_artists(lat, lng);
create index if not exists mock_artists_address_id_idx on public.mock_artists(address_id);
create index if not exists mock_artists_render_rank_idx on public.mock_artists(render_rank);
create index if not exists mock_artists_rank_score_idx on public.mock_artists(rank_score);

create or replace view public.mock_artist_city_counts as
select city, count(*)::int as artist_count
from public.mock_artists
group by city
order by artist_count desc;

create or replace view public.mock_artist_nano_counts as
select nano_cluster_id, count(*)::int as artist_count
from public.mock_artists
where nano_cluster_id is not null
group by nano_cluster_id
order by artist_count desc;
