alter table public.room_mixer_state_v2
  add column if not exists local_mic_gain real not null default 1.0;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_mixer_state_v2_local_mic_gain_check'
  ) then
    alter table public.room_mixer_state_v2
      add constraint room_mixer_state_v2_local_mic_gain_check
      check (local_mic_gain >= 0 and local_mic_gain <= 1);
  end if;
end $$;
create or replace function public.rooms_set_own_mic_gain_v2(
  p_room_id uuid,
  p_gain real
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.room_mixer_state_v2%rowtype;
begin
  perform public.rooms_assert_active_room_member_v2(p_room_id);

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    local_mic_gain,
    updated_at
  )
  values (
    p_room_id,
    auth.uid(),
    least(1, greatest(0, p_gain)),
    now()
  )
  on conflict (room_id, guest_id)
  do update
    set local_mic_gain = excluded.local_mic_gain,
        updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;
create or replace function public.rooms_set_own_music_gain_v2(
  p_room_id uuid,
  p_gain real
)
returns public.room_mixer_state_v2
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.room_mixer_state_v2%rowtype;
begin
  perform public.rooms_assert_active_room_member_v2(p_room_id);

  insert into public.room_mixer_state_v2 (
    room_id,
    guest_id,
    music_gain,
    updated_at
  )
  values (
    p_room_id,
    auth.uid(),
    least(1, greatest(0, p_gain)),
    now()
  )
  on conflict (room_id, guest_id)
  do update
    set music_gain = excluded.music_gain,
        updated_at = now()
  returning * into v_state;

  return v_state;
end;
$$;
grant execute on function public.rooms_set_own_mic_gain_v2(uuid, real) to authenticated;
grant execute on function public.rooms_set_own_music_gain_v2(uuid, real) to authenticated;
