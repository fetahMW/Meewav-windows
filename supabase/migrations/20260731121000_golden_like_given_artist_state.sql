-- Expose the canonical recipient of today's Golden Like so every Shorts
-- surface can reconcile a single global quota without probing every profile.
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
    'givenArtistId', v_existing.recipient_id,
    'dayKey', v_day,
    'availableAt', v_available_at,
    'cooldownSeconds', case when v_existing.id is null then 0 else greatest(
      0,
      floor(extract(epoch from (v_available_at - clock_timestamp())))::integer
    ) end
  );
end;
$$;

revoke all on function public.get_golden_like_state(uuid)
  from public, anon, authenticated;
grant execute on function public.get_golden_like_state(uuid) to authenticated;

comment on function public.get_golden_like_state(uuid) is
  'Returns the target count and the authenticated viewer daily Golden Like recipient.';
