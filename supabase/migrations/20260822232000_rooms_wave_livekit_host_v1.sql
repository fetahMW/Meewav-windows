-- Extend the canonical LiveKit publication-generation contract to La Wave.
-- Guests remain governed by La Place's invitation workflow; only the Wave
-- Host receives publication authority here.

create or replace function public.rooms_wave_livekit_host_changed_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and old.type = 'wave'
     and (
       new.type is distinct from old.type
       or new.host_id is distinct from old.host_id
       or (old.status = 'live' and new.status <> 'live')
     ) then
    perform public.rooms_set_livekit_publication_authorization_v1(
      old.id,
      old.host_id,
      false,
      case
        when new.type is distinct from old.type then 'wave_room_type_changed'
        when new.host_id is distinct from old.host_id then 'wave_host_changed'
        else 'wave_room_no_longer_live'
      end
    );
  end if;

  if new.type <> 'wave' then return new; end if;

  if new.status = 'ended'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.room_livekit_publication_grants_v1
    set is_authorized = false,
        state_revision = state_revision + case when is_authorized then 1 else 0 end,
        last_reason = 'wave_room_ended',
        updated_at = now()
    where room_id = new.id;

    perform public.rooms_enqueue_livekit_revocation_v1(
      'end_room', new.id, new.livekit_room_name, null, null, null, 'wave_room_ended'
    );
    return new;
  end if;

  if new.status = 'live' then
    perform public.rooms_set_livekit_publication_authorization_v1(
      new.id,
      new.host_id,
      true,
      case when tg_op = 'INSERT' then 'wave_room_created_host' else 'wave_room_live_host' end
    );
  end if;

  return new;
end;
$$;

revoke all on function public.rooms_wave_livekit_host_changed_v1()
  from public, anon, authenticated;
grant execute on function public.rooms_wave_livekit_host_changed_v1()
  to service_role;

drop trigger if exists rooms_wave_livekit_host_changed_v1 on public.rooms_v2;
create trigger rooms_wave_livekit_host_changed_v1
after insert or update of status, type, host_id on public.rooms_v2
for each row execute function public.rooms_wave_livekit_host_changed_v1();

insert into public.room_livekit_publication_grants_v1 (
  room_id,
  user_id,
  livekit_room_name,
  is_authorized,
  last_reason
)
select room.id, room.host_id, room.livekit_room_name, true, 'migration_live_wave_host'
from public.rooms_v2 room
where room.type = 'wave' and room.status = 'live'
on conflict (room_id, user_id)
do update set
  livekit_room_name = excluded.livekit_room_name,
  is_authorized = true,
  last_reason = excluded.last_reason,
  updated_at = now();

comment on function public.rooms_wave_livekit_host_changed_v1() is
  'Keeps Wave Host LiveKit publication authority durable and revocable without granting artistic or publication control to viewers.';
