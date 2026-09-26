-- READ ONLY. Run against the restored, explicitly verified Meewav Dev project
-- before applying the desktop/BytePlus migrations. Do not run db push --linked:
-- this checkout's cached link may refer to a different project.
-- Existing migration history and all missing prerequisites must be reconciled
-- first; this inventory does not create placeholder tables or RPCs.
with required(name) as (values
  ('public.rooms_v2'), ('public.room_participants_v2'), ('public.room_bans_v2'),
  ('public.room_invitations_v2'), ('public.room_specialized_state_v1'),
  ('public.room_livekit_publication_grants_v1'), ('public.room_livekit_revocation_outbox_v1'),
  ('public.room_experience_v1'), ('public.wave_sessions_v3'),
  ('public.room_classe_settings_v1'), ('public.room_classe_floor_requests_v1'),
  ('public.room_classe_participations_v1'), ('public.profile_public_markers'),
  ('public.public_profiles'), ('public.globe_public_markers_v1'),
  ('public.messaging_conversations'), ('public.messaging_direct_pairs'),
  ('public.messaging_conversation_members'), ('public.messaging_direct_conversations_v1'),
  ('public.messaging_conversation_participants_v1'), ('public.messaging_video_calls_v1')
)
select name, to_regclass(name) is not null as present from required order by name;

with required(name) as (values
  ('rooms_end_room_v1'), ('rooms_end_place_v3'), ('rooms_enter_room_v2'),
  ('rooms_get_experience_v1'), ('rooms_switch_experience_v1'),
  ('rooms_switch_experience_before_roster_v1'), ('rooms_launch_wave_production_v5'),
  ('rooms_set_livekit_publication_authorization_v1'), ('rooms_livekit_room_changed_v1'),
  ('rooms_classe_host_state_v1'), ('rooms_classe_viewer_state_v1'),
  ('rooms_classe_request_floor_v1'), ('rooms_classe_cancel_floor_v1'),
  ('rooms_classe_grant_floor_v1'), ('rooms_classe_release_floor_v1'),
  ('rooms_classe_set_hands_open_v1'), ('rooms_classe_assert_live_v1'), ('rooms_classe_emit_v1'),
  ('rooms_create_classe_v1'), ('rooms_live_catalog_v1'), ('messaging_video_call_v1'),
  ('messaging_profiles_blocked_v1'), ('list_my_conversations_v2'), ('send_message_v1')
)
select r.name, p.oid is not null as present,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result
from required r left join pg_proc p on p.proname=r.name
  and p.pronamespace='public'::regnamespace
order by r.name, arguments;

-- Confirm the precise canonical Classe columns, constraints and triggers;
-- the media-policy migration intentionally never synthesizes these contracts.
select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema='public'
  and table_name in ('rooms_v2','room_classe_settings_v1','room_classe_floor_requests_v1','room_classe_participations_v1')
order by table_name, ordinal_position;

select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers where trigger_schema='public'
  and (event_object_table like 'room_classe_%' or trigger_name like '%livekit%' or trigger_name like '%byteplus%')
order by event_object_table, trigger_name;

select version, name from supabase_migrations.schema_migrations order by version;
