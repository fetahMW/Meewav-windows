-- End-of-Room cleanup for the gift draw workflow introduced after
-- rooms_end_place_v3. The trigger also covers legacy clients that still end a
-- Room by updating rooms_v2 directly instead of calling the canonical RPC.

create or replace function public.rooms_cancel_gift_draws_after_end_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelled_at timestamptz := pg_catalog.clock_timestamp();
begin
  update public.room_gift_draws_v1 draw
  set
    status = 'cancelled',
    cancelled_at = coalesce(draw.cancelled_at, v_cancelled_at),
    updated_at = v_cancelled_at
  where draw.room_id = new.id
    and draw.status in ('ready', 'scheduled', 'spinning');

  return new;
end;
$$;

drop trigger if exists rooms_cancel_gift_draws_after_end_v1
  on public.rooms_v2;
create trigger rooms_cancel_gift_draws_after_end_v1
after update of status on public.rooms_v2
for each row
when (
  old.status is distinct from new.status
  and new.status = 'ended'
)
execute function public.rooms_cancel_gift_draws_after_end_v1();

revoke all on function public.rooms_cancel_gift_draws_after_end_v1()
  from public, anon, authenticated, service_role;

comment on function public.rooms_cancel_gift_draws_after_end_v1() is
  'Cancels unrevealed Room gift draws atomically when any supported client ends the Room; scheduled direct gift deliveries remain untouched.';
