-- Wave tools v1: private Host access to submitted media, immutable launch
-- base and a database-enforced public verdict before production integration.

create or replace function public.rooms_specialized_wave_media_visible_v1(p_name text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_specialized_state_v1 state
    join public.rooms_v2 room on room.id = state.room_id
    where state.room_type = 'wave'
      and room.status in ('live', 'ended')
      and state.room_id::text = (storage.foldername(p_name))[1]
      and not exists (
        select 1 from public.room_bans_v2 ban
        where ban.room_id = state.room_id and ban.user_id = p_user_id
      )
      and (
        (p_user_id is not null and (storage.foldername(p_name))[2] = p_user_id::text)
        or state.state #>> '{wave,baseLoop,mediaPath}' = p_name
        or exists (
          select 1
          from jsonb_array_elements(coalesce(state.state #> '{wave,submissions}', '[]'::jsonb)) submission
          where submission->>'mediaPath' = p_name
            and (
              public.rooms_specialized_is_control_v1(state.room_id, p_user_id)
              or submission->>'status' = 'accepted'
              or (
                coalesce((submission #>> '{vote,open}')::boolean, false)
                and (
                  nullif(submission #>> '{vote,endsAt}', '') is null
                  or (submission #>> '{vote,endsAt}')::timestamptz > now()
                )
              )
            )
        )
      )
  );
$$;

revoke all on function public.rooms_specialized_wave_media_visible_v1(text, uuid) from public;
grant execute on function public.rooms_specialized_wave_media_visible_v1(text, uuid) to anon, authenticated, service_role;

create or replace function public.rooms_specialized_sanitize_wave_votes_v1(
  p_projected jsonb,
  p_authoritative jsonb,
  p_user_id uuid,
  p_control boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb := p_projected;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_authoritative_item jsonb;
  v_vote jsonb;
  v_choice jsonb;
  v_total integer;
  v_yes integer;
begin
  if p_control or not (v_state ? 'wave') then return v_state; end if;
  for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{wave,submissions}', '[]'::jsonb)) loop
    v_authoritative_item := null;
    select value into v_authoritative_item
    from jsonb_array_elements(coalesce(p_authoritative #> '{wave,submissions}', '[]'::jsonb))
    where value->>'id' = v_item->>'id'
    limit 1;
    if v_authoritative_item ? 'vote' then
      select count(*), count(*) filter (where value = '"yes"'::jsonb)
      into v_total, v_yes
      from jsonb_each(coalesce(v_authoritative_item #> '{vote,votes}', '{}'::jsonb));
      v_choice := case when p_user_id is null then null else v_authoritative_item #> array['vote','votes',p_user_id::text] end;
      v_vote := (coalesce(v_item->'vote', '{}'::jsonb) - 'votes' - 'totalVotes' - 'yesCount' - 'noCount')
        || jsonb_build_object(
          'votes', case when v_choice is null then '{}'::jsonb else jsonb_build_object(p_user_id::text, v_choice) end,
          'totalVotes', v_total
        );
      if not coalesce((v_authoritative_item #>> '{vote,hidden}')::boolean, true) then
        v_vote := v_vote || jsonb_build_object('yesCount', v_yes, 'noCount', v_total - v_yes);
      end if;
      v_item := jsonb_set(v_item, '{vote}', v_vote, true);
    end if;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;
  return jsonb_set(v_state, '{wave,submissions}', v_items, true);
end;
$$;

revoke all on function public.rooms_specialized_sanitize_wave_votes_v1(jsonb, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.rooms_specialized_sanitize_wave_votes_v1(jsonb, jsonb, uuid, boolean) to service_role;

-- Keep the current V3 projector (including the Loge private-media contract),
-- then apply the Wave-only ballot sanitizer before returning a projection.
create or replace function public.rooms_get_specialized_state_v1(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.room_specialized_state_v1%rowtype;
  v_uid uuid := auth.uid();
  v_control boolean;
  v_artist boolean := false;
  v_eligible boolean := false;
  v_projected jsonb;
  v_room_status text;
begin
  select room.status into v_room_status from public.rooms_v2 room where room.id = p_room_id;
  if not found or v_room_status not in ('live', 'ended') then return null; end if;
  select * into v_row from public.room_specialized_state_v1 specialized where specialized.room_id = p_room_id;
  if not found then return null; end if;
  if exists (select 1 from public.room_bans_v2 ban where ban.room_id = p_room_id and ban.user_id = v_uid) then
    raise exception 'room_specialized_access_revoked' using errcode = '42501';
  end if;
  v_control := public.rooms_specialized_is_control_v1(p_room_id, v_uid);
  if not v_control and v_row.room_type = 'scene' and v_uid is not null then
    v_artist := exists (
      select 1 from public.room_participants_v2 participant
      where participant.room_id = p_room_id and participant.user_id = v_uid
        and participant.left_at is null and participant.role in ('guest', 'artist')
    );
  end if;
  v_eligible := v_control or (
    v_uid is not null and (v_row.room_type <> 'loge' or public.rooms_specialized_loge_eligible_v1(p_room_id, v_uid, v_row.state))
  );
  v_projected := public.rooms_specialized_project_state_v3(v_row.state, v_row.room_type, v_uid, v_control, v_artist, v_room_status);
  if v_row.room_type = 'wave' then
    v_projected := public.rooms_specialized_sanitize_wave_votes_v1(v_projected, v_row.state, v_uid, v_control);
  end if;
  if v_row.room_type = 'loge' and not v_eligible then
    v_projected := jsonb_set(v_projected, '{loge,preview}', jsonb_build_object(
      'title', 'Accès privé', 'description', '', 'mediaName', '', 'mediaPath', null,
      'playing', false, 'replayIncluded', false, 'liveOnly', true, 'expiresAt', null,
      'durationSeconds', null, 'channels', null, 'sampleRate', null, 'waveformPeaks', '[]'::jsonb
    ), true);
    v_projected := jsonb_set(v_projected, '{loge,questionsOpen}', 'false'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,questions}', '[]'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,moments}', '[]'::jsonb, true);
  end if;
  return jsonb_set(v_projected, '{audience}', jsonb_build_object('eligible', v_eligible), true);
end;
$$;

revoke all on function public.rooms_get_specialized_state_v1(uuid) from public;
grant execute on function public.rooms_get_specialized_state_v1(uuid) to anon, authenticated, service_role;

create or replace function public.rooms_specialized_guard_wave_verdict_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_base jsonb := coalesce(old.state #> '{wave,baseLoop}', '{}'::jsonb);
  v_new_base jsonb := coalesce(new.state #> '{wave,baseLoop}', '{}'::jsonb);
  v_old_submission jsonb;
  v_new_submission jsonb;
  v_new_layer jsonb;
  v_is_control boolean := public.rooms_specialized_is_control_v1(new.room_id, new.updated_by);
  v_total integer;
  v_yes integer;
  v_open_votes integer;
  v_threshold numeric;
begin
  if new.room_type <> 'wave' then return new; end if;

  if new.state->'gifts' is distinct from old.state->'gifts' then
    raise exception 'wave_gifts_disabled' using errcode = '42501';
  end if;

  if nullif(v_old_base->>'title', '') is not null and v_new_base is distinct from v_old_base then
    raise exception 'wave_base_locked' using errcode = '55000';
  end if;

  if nullif(v_old_base->>'title', '') is null and nullif(v_new_base->>'title', '') is not null then
    if not v_is_control
      or length(btrim(coalesce(new.state #>> '{wave,title}', ''))) not between 1 and 80
      or length(btrim(coalesce(v_new_base->>'title', ''))) not between 1 and 80
      or length(btrim(coalesce(v_new_base->>'kind', ''))) not between 1 and 80
      or length(btrim(coalesce(v_new_base->>'key', ''))) not between 1 and 80
      or coalesce((v_new_base->>'bars')::integer, 0) not in (4, 8)
      or coalesce((v_new_base->>'bpm')::integer, 0) not between 40 and 260
      or length(coalesce(v_new_base->>'fileName', '')) not between 1 and 255
      or coalesce((v_new_base->>'fileSize')::bigint, 0) not between 1 and 26214400
      or coalesce(v_new_base->>'mimeType', '') not in ('audio/wav','audio/x-wav','audio/mpeg','audio/aac','audio/flac','audio/mp4','audio/x-m4a')
      or coalesce(v_new_base->>'mediaPath', '') not like new.room_id::text || '/' || new.updated_by::text || '/%'
    then
      raise exception 'wave_base_invalid' using errcode = '22023';
    end if;
  end if;

  select count(*) into v_open_votes
  from jsonb_array_elements(coalesce(new.state #> '{wave,submissions}', '[]'::jsonb)) submission
  where coalesce((submission #>> '{vote,open}')::boolean, false);
  if v_open_votes > 1 then raise exception 'wave_vote_already_open' using errcode = '55000'; end if;

  for v_new_submission in
    select value from jsonb_array_elements(coalesce(new.state #> '{wave,submissions}', '[]'::jsonb))
  loop
    v_old_submission := null;
    select value into v_old_submission
    from jsonb_array_elements(coalesce(old.state #> '{wave,submissions}', '[]'::jsonb))
    where value->>'id' = v_new_submission->>'id'
    limit 1;

    if v_old_submission is not null then
      if coalesce((v_new_submission->>'version')::integer, 1) > coalesce((v_old_submission->>'version')::integer, 1) then
        if v_new_submission ? 'vote' or v_new_submission->>'status' <> 'to-review' then
          raise exception 'wave_version_must_return_to_gate' using errcode = '55000';
        end if;
      elsif v_is_control
        and coalesce(v_new_submission #> '{vote,votes}', '{}'::jsonb) is distinct from coalesce(v_old_submission #> '{vote,votes}', '{}'::jsonb)
      then
        raise exception 'wave_vote_control_forbidden' using errcode = '42501';
      end if;

      if coalesce((v_old_submission #>> '{vote,open}')::boolean, false)
         and coalesce((v_new_submission #>> '{vote,open}')::boolean, false)
         and v_new_submission->>'status' is distinct from v_old_submission->>'status' then
        raise exception 'wave_vote_open' using errcode = '55000';
      end if;

      if coalesce((v_old_submission #>> '{vote,open}')::boolean, false)
         and not coalesce((v_new_submission #>> '{vote,open}')::boolean, false) then
        if not (v_new_submission ? 'vote') then raise exception 'wave_vote_required' using errcode = '55000'; end if;
        select count(*), count(*) filter (where value = '"yes"'::jsonb)
        into v_total, v_yes
        from jsonb_each(coalesce(v_new_submission #> '{vote,votes}', '{}'::jsonb));
        v_threshold := coalesce((v_new_submission #>> '{vote,thresholdPercent}')::numeric, 60);
        if v_total = 0 then
          if v_new_submission->>'status' <> 'to-review' or nullif(v_new_submission #>> '{vote,outcome}', '') is not null then
            raise exception 'wave_vote_outcome_mismatch' using errcode = '55000';
          end if;
        elsif (v_yes * 100.0 / v_total) >= v_threshold then
          if v_new_submission->>'status' <> 'accepted' or v_new_submission #>> '{vote,outcome}' <> 'accepted' then
            raise exception 'wave_vote_outcome_mismatch' using errcode = '55000';
          end if;
          if (select count(*) from jsonb_array_elements(coalesce(new.state #> '{wave,layers}', '[]'::jsonb)) layer where layer->>'submissionId' = v_new_submission->>'id') <> 1 then
            raise exception 'wave_layer_public_approval_required' using errcode = '55000';
          end if;
        else
          if v_new_submission->>'status' <> 'rejected'
             or v_new_submission #>> '{vote,outcome}' <> 'rejected'
             or v_new_submission->>'decisionSource' <> 'public' then
            raise exception 'wave_vote_outcome_mismatch' using errcode = '55000';
          end if;
        end if;
      end if;
    end if;

    if coalesce((v_new_submission #>> '{vote,open}')::boolean, false)
       and not coalesce((v_old_submission #>> '{vote,open}')::boolean, false) then
      if not v_is_control
        or v_new_submission->>'status' in ('accepted', 'rejected', 'rework')
        or not coalesce((v_new_submission->>'rightsConfirmed')::boolean, false)
        or coalesce((v_new_submission #>> '{vote,submissionVersion}')::integer, 0) <> coalesce((v_new_submission->>'version')::integer, 1)
        or coalesce((v_new_submission #>> '{vote,thresholdPercent}')::integer, 0) <> 60
        or not coalesce((v_new_submission #>> '{vote,hidden}')::boolean, false)
        or jsonb_object_length(coalesce(v_new_submission #> '{vote,votes}', '{}'::jsonb)) <> 0
        or coalesce((v_new_submission->>'bars')::integer, 0) <> coalesce((v_new_base->>'bars')::integer, 0)
        or abs(coalesce((v_new_submission->>'bpm')::integer, 0) - coalesce((v_new_base->>'bpm')::integer, 0)) > 2
      then
        raise exception 'wave_vote_invalid' using errcode = '22023';
      end if;
    end if;

    if v_new_submission->>'status' = 'accepted'
       and coalesce(v_old_submission->>'status', '') <> 'accepted' then
      if not v_is_control
        or coalesce((v_new_submission #>> '{vote,open}')::boolean, true)
        or coalesce((v_new_submission #>> '{vote,submissionVersion}')::integer, 0) <> coalesce((v_new_submission->>'version')::integer, 1)
        or coalesce((v_new_submission #>> '{vote,thresholdPercent}')::integer, 0) <> 60
      then
        raise exception 'wave_vote_required' using errcode = '55000';
      end if;
      select count(*), count(*) filter (where value = '"yes"'::jsonb)
      into v_total, v_yes
      from jsonb_each(coalesce(v_new_submission #> '{vote,votes}', '{}'::jsonb));
      v_threshold := coalesce((v_new_submission #>> '{vote,thresholdPercent}')::numeric, 60);
      if v_total = 0 or (v_yes * 100.0 / v_total) < v_threshold then
        raise exception 'wave_vote_threshold_not_met' using errcode = '55000';
      end if;
    end if;
  end loop;

  for v_new_layer in
    select value from jsonb_array_elements(coalesce(new.state #> '{wave,layers}', '[]'::jsonb))
  loop
    if nullif(v_new_layer->>'submissionId', '') is not null
       and (select count(*) from jsonb_array_elements(coalesce(new.state #> '{wave,layers}', '[]'::jsonb)) layer where layer->>'submissionId' = v_new_layer->>'submissionId') > 1 then
      raise exception 'wave_layer_duplicate' using errcode = '23505';
    end if;
    if v_new_layer->>'id' <> 'base'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(old.state #> '{wave,layers}', '[]'::jsonb)) old_layer
        where old_layer->>'id' = v_new_layer->>'id'
      )
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(new.state #> '{wave,submissions}', '[]'::jsonb)) submission
        where submission->>'id' = v_new_layer->>'submissionId'
          and submission->>'status' = 'accepted'
          and coalesce((submission #>> '{vote,open}')::boolean, true) = false
          and coalesce((submission #>> '{vote,submissionVersion}')::integer, 0) = coalesce((submission->>'version')::integer, 1)
      )
    then
      raise exception 'wave_layer_public_approval_required' using errcode = '55000';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.rooms_specialized_guard_wave_verdict_v1() from public, anon, authenticated;
grant execute on function public.rooms_specialized_guard_wave_verdict_v1() to service_role;

drop trigger if exists rooms_specialized_guard_wave_verdict_v1 on public.room_specialized_state_v1;
create trigger rooms_specialized_guard_wave_verdict_v1
before update on public.room_specialized_state_v1
for each row execute function public.rooms_specialized_guard_wave_verdict_v1();
