-- pgcrypto lives in extensions. These existing RPCs call digest() with a
-- security-definer search_path that omitted that schema.
alter function public.send_message_v2(uuid,uuid,text,text,jsonb,jsonb,uuid)
  set search_path = public, extensions, pg_temp;
alter function public.create_creative_project_v1(text,text,text,integer,text,text,timestamp with time zone,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.invite_creative_project_member_v1(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text)
  set search_path = public, extensions, pg_temp;
alter function public.create_artist_group_v1(text,text,text,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.invite_artist_group_member_v1(uuid,uuid,text,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.respond_to_artist_group_invitation_v1(uuid,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.cancel_artist_group_invitation_v1(uuid,text)
  set search_path = public, extensions, pg_temp;
alter function public.update_artist_group_v1(uuid,text,text,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.set_my_artist_group_preferences_v1(uuid,boolean,text,boolean,text)
  set search_path = public, extensions, pg_temp;
alter function public.set_artist_group_authority_role_v1(uuid,uuid,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.set_artist_group_artistic_role_v1(uuid,uuid,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.transfer_artist_group_ownership_v1(uuid,uuid,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.remove_artist_group_member_v1(uuid,uuid,text)
  set search_path = public, extensions, pg_temp;
alter function public.leave_artist_group_v1(uuid,text)
  set search_path = public, extensions, pg_temp;
alter function public.set_artist_group_archived_v1(uuid,boolean,text)
  set search_path = public, extensions, pg_temp;
alter function public.delete_artist_group_v1(uuid,text,text)
  set search_path = public, extensions, pg_temp;
alter function public.attach_collaboration_uploads_v1(uuid,jsonb,text)
  set search_path = public, extensions, pg_temp;
alter function public.rooms_invite_live_call_contact_v1(uuid,uuid,uuid,text)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.rooms_get_or_create_classe_direct_conversation_v1(uuid,uuid,text)
  set search_path = pg_catalog, public, extensions, pg_temp;
