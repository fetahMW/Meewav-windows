create or replace function public.check_golden_like_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_given_at timestamptz;
begin
  -- Serialize Golden Like consumption per giver so two devices cannot spend
  -- the same 24-hour allowance concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.giver_id::text, 0)
  );

  select max(golden_like.given_at)
  into v_last_given_at
  from public.daily_golden_likes golden_like
  where golden_like.giver_id = new.giver_id;

  if v_last_given_at is not null
     and (now() - v_last_given_at) < interval '24 hours'
  then
    raise exception 'Golden Like en cooldown. Revenez dans %',
      (interval '24 hours' - (now() - v_last_given_at));
  end if;

  return new;
end;
$$;
