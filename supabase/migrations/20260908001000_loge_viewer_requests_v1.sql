begin;
-- Uses the same private state, revision signal and role projection as the host tools.
create or replace function public.rooms_apply_loge_request_v1(p_room_id uuid, p_action text, p_payload jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.room_specialized_state_v1%rowtype;
  v_state jsonb; v_items jsonb; v_item jsonb; v_profile jsonb;
  v_kind text := p_payload->>'kind'; v_found boolean := false; v_revision bigint;
begin
  if v_uid is null then raise exception 'room_specialized_auth_required' using errcode='42501'; end if;
  if p_idempotency_key is null or p_action is null or p_action not in ('loge.request.join','loge.request.cancel') then raise exception 'loge_request_invalid' using errcode='22023'; end if;
  perform 1 from public.rooms_v2 where id=p_room_id and status='live' for share;
  if not found then raise exception 'room_specialized_room_not_live' using errcode='55000'; end if;
  if exists(select 1 from public.room_bans_v2 where room_id=p_room_id and user_id=v_uid) then raise exception 'room_specialized_access_revoked' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rooms:specialized:' || p_room_id::text,0));
  select * into v_row from public.room_specialized_state_v1 where room_id=p_room_id for update;
  if not found or v_row.room_type <> 'loge' then raise exception 'loge_state_required' using errcode='55000'; end if;
  v_state := v_row.state;
  if not public.rooms_specialized_loge_eligible_v1(p_room_id,v_uid,v_state) then raise exception 'loge_access_required' using errcode='42501'; end if;
  if exists(select 1 from public.room_specialized_action_receipts_v1 where room_id=p_room_id and user_id=v_uid and idempotency_key=p_idempotency_key) then return public.rooms_get_specialized_state_v1(p_room_id); end if;
  v_items := coalesce(v_state#>'{loge,moments}','[]'::jsonb);
  if p_action='loge.request.join' then
    if v_kind is null or v_kind not in ('dedication','face-to-face','gift-redemption') then raise exception 'loge_request_kind_invalid' using errcode='22023'; end if;
    if (v_state#>array['loge','requestQueues',v_kind]) is distinct from 'true'::jsonb then raise exception 'loge_queue_closed' using errcode='55000'; end if;
    if exists(select 1 from jsonb_array_elements(v_items) m where m#>>'{beneficiary,id}'=v_uid::text and m->>'kind'=v_kind and m->>'status' in ('pending','scheduled','accepted','live')) then return public.rooms_get_specialized_state_v1(p_room_id); end if;
    if jsonb_array_length(v_items)>=1000 then raise exception 'loge_queue_full' using errcode='55000'; end if;
    select jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.username,'Membre VIP'),'avatarUrl',coalesce(p.avatar_url,p.profile_image_url,''),'role',coalesce(p.primary_role_key,'VIP'),'microphone','off','camera','off') into v_profile from public.profiles p where p.id=v_uid;
    v_item := jsonb_build_object('id',gen_random_uuid()::text,'kind',v_kind,'title',case v_kind when 'dedication' then 'Demande de dédicace' when 'face-to-face' then 'Demande de face-à-face' else 'Demande de cadeau' end,'status','pending','requested',true,'beneficiary',coalesce(v_profile,jsonb_build_object('id',v_uid::text,'name','Membre VIP','avatarUrl','','role','VIP','microphone','off','camera','off')));
    v_items := v_items || jsonb_build_array(v_item);
  else
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state#>'{loge,moments}','[]'::jsonb)) loop
      if v_item->>'id'=p_payload->>'momentId' then
        if v_item#>>'{beneficiary,id}' is distinct from v_uid::text or v_item->'requested' is distinct from 'true'::jsonb or v_item->>'status' not in ('pending','cancelled') then raise exception 'loge_request_unavailable' using errcode='42501'; end if;
        v_found := true; v_item := jsonb_set(v_item,'{status}','"cancelled"'::jsonb);
      end if;
      v_items := v_items || jsonb_build_array(v_item);
    end loop;
    if not v_found then raise exception 'loge_request_not_found' using errcode='P0002'; end if;
  end if;
  v_state := jsonb_set(v_state,'{loge,moments}',v_items,true);
  v_revision := v_row.revision+1;
  v_state := v_state || jsonb_build_object('revision',v_revision,'updatedAt',now());
  if pg_column_size(v_state)>524288 then raise exception 'loge_queue_full' using errcode='55000'; end if;
  update public.room_specialized_state_v1 set state=v_state,revision=v_revision,updated_by=v_uid,updated_at=now() where room_id=p_room_id;
  insert into public.room_specialized_action_receipts_v1(room_id,user_id,idempotency_key,action,revision) values(p_room_id,v_uid,p_idempotency_key,p_action,v_revision);
  insert into public.room_specialized_state_signal_v1(room_id,room_type,revision) values(p_room_id,'loge',v_revision) on conflict(room_id) do update set revision=excluded.revision,room_type=excluded.room_type,updated_at=now();
  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;
revoke all on function public.rooms_apply_loge_request_v1(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.rooms_apply_loge_request_v1(uuid,text,jsonb,uuid) to authenticated,service_role;
commit;
