create table if not exists public.media_reactions (
  media_id uuid not null references public.media_files(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'like' check (reaction_type = 'like'),
  created_at timestamptz not null default now(),
  primary key (media_id, profile_id, reaction_type)
);

create index if not exists media_reactions_media_created_idx
  on public.media_reactions (media_id, created_at desc);

alter table public.media_reactions enable row level security;

drop policy if exists media_reactions_read_own on public.media_reactions;
create policy media_reactions_read_own on public.media_reactions
  for select to authenticated using (profile_id = auth.uid());

create or replace function public.get_scene_media_like_states(p_media_ids uuid[])
returns table(media_id uuid, liked boolean, like_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.id,
    exists (
      select 1 from public.media_reactions mine
      where mine.media_id = m.id and mine.profile_id = auth.uid() and mine.reaction_type = 'like'
    ) as liked,
    (select count(*) from public.media_reactions reactions where reactions.media_id = m.id and reactions.reaction_type = 'like') as like_count
  from public.media_files m
  where m.id = any(coalesce(p_media_ids, array[]::uuid[]))
    and m.status = 'published'
    and m.visibility = 'public'
    and m.deleted_at is null
  limit 100;
$$;

create or replace function public.toggle_scene_media_like(p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_liked boolean;
  v_count bigint;
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from public.media_files media
    where media.id = p_media_id
      and media.status = 'published'
      and media.visibility = 'public'
      and media.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'media_not_available';
  end if;

  delete from public.media_reactions
  where media_id = p_media_id and profile_id = v_profile_id and reaction_type = 'like';
  if found then
    v_liked := false;
  else
    insert into public.media_reactions(media_id, profile_id, reaction_type)
    values (p_media_id, v_profile_id, 'like')
    on conflict do nothing;
    v_liked := true;
  end if;

  select count(*) into v_count from public.media_reactions
  where media_id = p_media_id and reaction_type = 'like';
  return jsonb_build_object('mediaId', p_media_id, 'liked', v_liked, 'likeCount', v_count);
end;
$$;

revoke all on function public.get_scene_media_like_states(uuid[]) from public;
revoke all on function public.toggle_scene_media_like(uuid) from public;
grant execute on function public.get_scene_media_like_states(uuid[]) to anon, authenticated, service_role;
grant execute on function public.toggle_scene_media_like(uuid) to authenticated, service_role;
