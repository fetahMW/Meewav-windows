-- Public La Place stage projection.
--
-- Invitations, Green House, backstage, queue previews and private mixer
-- settings stay protected by their table RLS. This function exposes only the
-- live Host and at most three guests whose invitation is explicitly onstage.

create or replace function public.rooms_public_stage_v1(p_room_id uuid)
returns table (
  room_id uuid,
  participant_id uuid,
  stage_role text,
  joined_at timestamptz,
  stage_position smallint,
  is_camera_enabled boolean,
  is_microphone_enabled boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target_room as (
    select room.id, room.host_id, room.created_at
    from public.rooms_v2 room
    where room.id = p_room_id
      and room.type = 'place'
      and room.status = 'live'
  ),
  host_row as (
    select
      room.id as room_id,
      room.host_id as participant_id,
      'host'::text as stage_role,
      room.created_at as joined_at,
      0::smallint as stage_position,
      not coalesce(mixer.is_video_off, false) as is_camera_enabled,
      not (
        coalesce(mixer.is_mic_muted, false)
        or coalesce(mixer.host_mic_forced_muted, false)
      ) as is_microphone_enabled
    from target_room room
    left join public.room_mixer_state_v2 mixer
      on mixer.room_id = room.id
     and mixer.guest_id = room.host_id
  ),
  latest_onstage_invitations as (
    select distinct on (invitation.guest_id)
      invitation.id,
      invitation.room_id,
      invitation.guest_id,
      invitation.created_at,
      invitation.onstage_at
    from target_room room
    join public.room_invitations_v2 invitation
      on invitation.room_id = room.id
     and invitation.guest_id <> room.host_id
     and invitation.status = 'onstage'
     and invitation.ended_at is null
    order by
      invitation.guest_id,
      coalesce(invitation.onstage_at, invitation.created_at) desc,
      invitation.id desc
  ),
  ranked_guests as (
    select
      invitation.room_id,
      invitation.guest_id as participant_id,
      'guest'::text as stage_role,
      coalesce(invitation.onstage_at, invitation.created_at) as joined_at,
      row_number() over (
        order by
          coalesce(invitation.onstage_at, invitation.created_at),
          invitation.created_at,
          invitation.id
      ) as stage_position,
      not coalesce(mixer.is_video_off, false) as is_camera_enabled,
      not (
        coalesce(mixer.is_mic_muted, false)
        or coalesce(mixer.host_mic_forced_muted, false)
      ) as is_microphone_enabled
    from latest_onstage_invitations invitation
    join public.room_participants_v2 participant
      on participant.room_id = invitation.room_id
     and participant.user_id = invitation.guest_id
     and participant.left_at is null
    left join public.room_mixer_state_v2 mixer
      on mixer.room_id = invitation.room_id
     and mixer.guest_id = invitation.guest_id
  )
  select
    host.room_id,
    host.participant_id,
    host.stage_role,
    host.joined_at,
    host.stage_position,
    host.is_camera_enabled,
    host.is_microphone_enabled
  from host_row host

  union all

  select
    guest.room_id,
    guest.participant_id,
    guest.stage_role,
    guest.joined_at,
    guest.stage_position::smallint,
    guest.is_camera_enabled,
    guest.is_microphone_enabled
  from ranked_guests guest
  where guest.stage_position <= 3

  order by stage_position;
$$;

revoke all on function public.rooms_public_stage_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rooms_public_stage_v1(uuid)
  to authenticated, service_role;

comment on function public.rooms_public_stage_v1(uuid) is
  'Safe public stage: live Place Host plus at most three onstage guests; no queue, Green House, backstage or private mixer fields.';
