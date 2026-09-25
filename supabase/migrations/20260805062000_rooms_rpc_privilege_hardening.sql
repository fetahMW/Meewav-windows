-- Rooms RPCs run in the shared Supabase project. PostgreSQL grants EXECUTE on
-- new functions to PUBLIC by default, so a later GRANT to authenticated does
-- not remove anonymous access. Classify every current Rooms routine explicitly
-- and fail closed if a future unclassified routine exists when this migration
-- is applied.

do $migration$
declare
  authenticated_api constant text[] := array[
    'rooms_accept_invitation_v2',
    'rooms_ban_user_v2',
    'rooms_cancel_invitation_v2',
    'rooms_clear_pinned_item_v2',
    'rooms_create_poll_v2',
    'rooms_current_user_moderation_state_v2',
    'rooms_decline_invitation_v2',
    'rooms_delete_message_v2',
    'rooms_engagement_state_v1',
    'rooms_give_golden_like_v1',
    'rooms_invite_from_queue_v2',
    'rooms_join_queue_v2',
    'rooms_kick_invitation_v2',
    'rooms_kick_user_v2',
    'rooms_leave_queue_v2',
    'rooms_like_v1',
    'rooms_mark_invitation_ready_v2',
    'rooms_move_invitation_to_backstage_v2',
    'rooms_move_invitation_to_invitations_v2',
    'rooms_move_invitation_to_stage_v2',
    'rooms_pin_custom_item_v2',
    'rooms_pin_message_item_v2',
    'rooms_send_message_v2',
    'rooms_set_audio_live_enabled_v2',
    'rooms_set_host_mic_forced_muted_v2',
    'rooms_set_own_audio_playback_state_v2',
    'rooms_set_own_audio_preview_v2',
    'rooms_set_own_mic_gain_v2',
    'rooms_set_own_mic_muted_v2',
    'rooms_set_own_music_gain_v2',
    'rooms_set_user_slow_mode_v2',
    'rooms_stop_poll_v2',
    'rooms_vote_poll_v2'
  ];
  internal_helpers constant text[] := array[
    'rooms_assert_active_room_member_v2',
    'rooms_assert_moderation_target_v2',
    'rooms_assert_room_host_v2',
    'rooms_assert_room_moderator_v2',
    'rooms_v2_assert_host',
    'rooms_v2_clear_guest_runtime',
    'rooms_v2_upsert_participant'
  ];
  expected_names text[] :=
    authenticated_api || internal_helpers;
  missing_names text[];
  routine record;
begin
  select array_agg(expected_name order by expected_name)
  into missing_names
  from unnest(expected_names) as expected(expected_name)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = expected.expected_name
  );

  if missing_names is not null then
    raise exception 'Expected Rooms routines are missing: %', missing_names;
  end if;

  for routine in
    select
      p.proname,
      p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'rooms\_%' escape '\'
    order by p.proname, p.oid::regprocedure::text
  loop
    if not (routine.proname = any(expected_names)) then
      raise exception 'Unclassified Rooms routine: %', routine.signature;
    end if;

    execute format(
      'revoke all privileges on function %s from public, anon, authenticated, service_role',
      routine.signature
    );

    if routine.proname = any(authenticated_api) then
      execute format(
        'grant execute on function %s to authenticated, service_role',
        routine.signature
      );
    else
      execute format(
        'grant execute on function %s to service_role',
        routine.signature
      );
    end if;
  end loop;
end
$migration$;

comment on function public.rooms_v2_upsert_participant(uuid, uuid, text) is
  'Internal SECURITY DEFINER helper. Direct client execution is forbidden.';

comment on function public.rooms_v2_clear_guest_runtime(uuid, uuid, boolean) is
  'Internal SECURITY DEFINER helper. Direct client execution is forbidden.';
