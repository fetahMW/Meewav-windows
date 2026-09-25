-- Realtime-safe public projection for the interactive Room voice mix.
--
-- `rooms_public_stage_v1` is already consumed by iOS and keeps its exact
-- return contract. The private mixer RLS also stays closed. This materialized
-- projection contains only the Room key plus the three public audio fields a
-- Web subscriber needs to reproduce the Host's public voice mix.

create table if not exists public.room_public_audio_channels_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  participant_id uuid not null references auth.users(id) on delete cascade,
  public_mic_gain real not null default 1.0,
  is_routed_to_public boolean not null default false,
  primary key (room_id, participant_id),
  constraint room_public_audio_channels_v1_gain_check
    check (public_mic_gain >= 0 and public_mic_gain <= 1)
);

alter table public.room_public_audio_channels_v1 owner to postgres;
alter table public.room_public_audio_channels_v1 enable row level security;
alter table public.room_public_audio_channels_v1 replica identity full;

revoke all on table public.room_public_audio_channels_v1
  from public, anon, authenticated;
grant select on table public.room_public_audio_channels_v1
  to authenticated, service_role;

drop policy if exists "Active Room members read public audio channels"
  on public.room_public_audio_channels_v1;
create policy "Active Room members read public audio channels"
  on public.room_public_audio_channels_v1
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.rooms_v2 room
      where room.id = room_public_audio_channels_v1.room_id
        and room.type = 'place'
        and room.status = 'live'
        and (
          room.host_id = auth.uid()
          or exists (
            select 1
            from public.room_participants_v2 participant
            where participant.room_id = room.id
              and participant.user_id = auth.uid()
              and participant.left_at is null
          )
        )
    )
  );

comment on table public.room_public_audio_channels_v1 is
  'Realtime-safe public Room voice mix; no private mixer, queue or backstage fields.';

create or replace function public.rooms_refresh_public_audio_channels_v1(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  delete from public.room_public_audio_channels_v1 projection
  where projection.room_id = p_room_id;

  insert into public.room_public_audio_channels_v1 (
    room_id,
    participant_id,
    public_mic_gain,
    is_routed_to_public
  )
  select
    stage.room_id,
    stage.participant_id,
    least(
      1::real,
      greatest(
        0::real,
        coalesce(
          case
            -- The Host's local_mic_gain is already applied before the voice
            -- track is published. Reapplying it on remote clients would square
            -- that gain. Only guest public faders are receiver-side controls.
            when stage.stage_role = 'host' then 1::real
            else mixer.mic_gain
          end,
          1::real
        )
      )
    ) as public_mic_gain,
    -- audio_live_enabled is exclusively the music Player Preview/Public route.
    stage.is_microphone_enabled as is_routed_to_public
  from public.rooms_public_stage_v1(p_room_id) stage
  left join public.room_mixer_state_v2 mixer
    on mixer.room_id = stage.room_id
   and mixer.guest_id = stage.participant_id
  where stage.stage_role in ('host', 'guest');
end;
$$;

alter function public.rooms_refresh_public_audio_channels_v1(uuid) owner to postgres;
revoke all on function public.rooms_refresh_public_audio_channels_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rooms_sync_public_audio_channels_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_room_id uuid;
  v_new_room_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_room_id := coalesce(to_jsonb(old) ->> 'room_id', to_jsonb(old) ->> 'id')::uuid;
  end if;
  if tg_op <> 'DELETE' then
    v_new_room_id := coalesce(to_jsonb(new) ->> 'room_id', to_jsonb(new) ->> 'id')::uuid;
  end if;

  if v_old_room_id is not null then
    perform public.rooms_refresh_public_audio_channels_v1(v_old_room_id);
  end if;
  if v_new_room_id is not null and v_new_room_id is distinct from v_old_room_id then
    perform public.rooms_refresh_public_audio_channels_v1(v_new_room_id);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

alter function public.rooms_sync_public_audio_channels_v1() owner to postgres;
revoke all on function public.rooms_sync_public_audio_channels_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists rooms_public_audio_room_changed_v1 on public.rooms_v2;
create trigger rooms_public_audio_room_changed_v1
after insert or delete or update of status, type, host_id
on public.rooms_v2
for each row execute function public.rooms_sync_public_audio_channels_v1();

drop trigger if exists rooms_public_audio_participant_changed_v1 on public.room_participants_v2;
create trigger rooms_public_audio_participant_changed_v1
after insert or update or delete
on public.room_participants_v2
for each row execute function public.rooms_sync_public_audio_channels_v1();

drop trigger if exists rooms_public_audio_invitation_changed_v1 on public.room_invitations_v2;
create trigger rooms_public_audio_invitation_changed_v1
after insert or update or delete
on public.room_invitations_v2
for each row execute function public.rooms_sync_public_audio_channels_v1();

drop trigger if exists rooms_public_audio_mixer_changed_v1 on public.room_mixer_state_v2;
create trigger rooms_public_audio_mixer_changed_v1
after insert or delete or update of mic_gain, local_mic_gain, is_mic_muted, host_mic_forced_muted
on public.room_mixer_state_v2
for each row execute function public.rooms_sync_public_audio_channels_v1();

do $$
declare
  live_room record;
begin
  for live_room in
    select room.id
    from public.rooms_v2 room
    where room.type = 'place' and room.status = 'live'
  loop
    perform public.rooms_refresh_public_audio_channels_v1(live_room.id);
  end loop;
end;
$$;

create or replace function public.rooms_public_audio_channels_v1(p_room_id uuid)
returns table (
  participant_id uuid,
  public_mic_gain real,
  is_routed_to_public boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
rows 4
as $$
  select
    projection.participant_id,
    projection.public_mic_gain,
    projection.is_routed_to_public
  from public.room_public_audio_channels_v1 projection
  where projection.room_id = p_room_id
  order by projection.participant_id;
$$;

alter function public.rooms_public_audio_channels_v1(uuid) owner to postgres;
revoke all on function public.rooms_public_audio_channels_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rooms_public_audio_channels_v1(uuid)
  to authenticated, service_role;

comment on function public.rooms_public_audio_channels_v1(uuid) is
  'Safe public Room voice mix: onstage UUID, clamped public microphone gain and public-route flag only.';

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'room_public_audio_channels_v1'
  ) then
    alter publication supabase_realtime add table public.room_public_audio_channels_v1;
  end if;
end;
$$;
