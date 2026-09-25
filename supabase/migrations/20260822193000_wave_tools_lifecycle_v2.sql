-- Wave tools v2: authoritative loop lifecycle, immutable corrected versions,
-- one locked public vote and an accepted-only collective beat.
--
-- The v1 `status` property remains untouched for old clients. New writes use
-- `lifecycleStatus` as the source of truth and keep the legacy value as a UI
-- mirror until every persisted Room has been upgraded.

create or replace function public.rooms_wave_loop_status_v2(p_submission jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce((p_submission #>> '{vote,open}')::boolean, false) then 'VOTING'
    when upper(coalesce(p_submission->>'lifecycleStatus', '')) in (
      'UPLOADING','PROCESSING','RECEIVED','NEEDS_REVIEW','NEEDS_CORRECTION',
      'READY_FOR_VOTE','VOTING','ACCEPTED','NOT_SELECTED','REJECTED',
      'SUPERSEDED','REMOVED','PROCESSING_FAILED'
    ) then upper(p_submission->>'lifecycleStatus')
    when p_submission->>'status' = 'received' then 'RECEIVED'
    when p_submission->>'status' = 'analysis' then 'READY_FOR_VOTE'
    when p_submission->>'status' = 'to-review' then 'NEEDS_REVIEW'
    when p_submission->>'status' = 'accepted' then 'ACCEPTED'
    when p_submission->>'status' = 'rework' then 'NEEDS_CORRECTION'
    when p_submission->>'status' = 'rejected' and p_submission->>'decisionSource' = 'public' then 'NOT_SELECTED'
    when p_submission->>'status' = 'rejected' then 'REJECTED'
    else 'NEEDS_REVIEW'
  end;
$$;

revoke all on function public.rooms_wave_loop_status_v2(jsonb) from public, anon, authenticated;
grant execute on function public.rooms_wave_loop_status_v2(jsonb) to service_role;

create or replace function public.rooms_wave_transition_allowed_v2(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or case p_from
    when 'UPLOADING' then p_to in ('PROCESSING','PROCESSING_FAILED','REMOVED')
    when 'PROCESSING' then p_to in ('RECEIVED','NEEDS_REVIEW','PROCESSING_FAILED','REMOVED')
    when 'RECEIVED' then p_to in ('NEEDS_REVIEW','NEEDS_CORRECTION','READY_FOR_VOTE','REJECTED','REMOVED')
    when 'NEEDS_REVIEW' then p_to in ('NEEDS_CORRECTION','READY_FOR_VOTE','REJECTED','REMOVED')
    when 'NEEDS_CORRECTION' then p_to in ('NEEDS_REVIEW','REJECTED','SUPERSEDED','REMOVED')
    when 'READY_FOR_VOTE' then p_to in ('VOTING','NEEDS_REVIEW','NEEDS_CORRECTION','REJECTED','REMOVED')
    when 'VOTING' then p_to in ('ACCEPTED','NOT_SELECTED','NEEDS_REVIEW')
    when 'ACCEPTED' then p_to = 'REMOVED'
    when 'NOT_SELECTED' then p_to in ('NEEDS_REVIEW','NEEDS_CORRECTION','REMOVED')
    when 'REJECTED' then p_to = 'REMOVED'
    when 'SUPERSEDED' then p_to = 'REMOVED'
    when 'PROCESSING_FAILED' then p_to in ('PROCESSING','REMOVED')
    else false
  end;
$$;

revoke all on function public.rooms_wave_transition_allowed_v2(text, text) from public, anon, authenticated;
grant execute on function public.rooms_wave_transition_allowed_v2(text, text) to service_role;

create or replace function public.rooms_wave_normalize_submission_v2(p_submission jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_submission jsonb := coalesce(p_submission, '{}'::jsonb);
  v_status text := public.rooms_wave_loop_status_v2(p_submission);
  v_version_number integer := greatest(coalesce((p_submission->>'version')::integer, 1), 1);
  v_versions jsonb := '[]'::jsonb;
  v_version jsonb;
  v_history jsonb;
  v_contributor_id text := coalesce(p_submission #>> '{contributor,id}', p_submission->>'originalContributorId', 'legacy');
begin
  v_submission := jsonb_set(v_submission, '{lifecycleStatus}', to_jsonb(v_status), true);
  v_submission := jsonb_set(v_submission, '{originalContributorId}', to_jsonb(v_contributor_id), true);

  v_history := coalesce(v_submission->'statusHistory', '[]'::jsonb);
  if jsonb_typeof(v_history) <> 'array' then v_history := '[]'::jsonb; end if;
  if jsonb_array_length(v_history) = 0 then
    v_history := jsonb_build_array(jsonb_build_object(
      'id', coalesce(v_submission->>'id', 'legacy') || ':legacy:' || v_status,
      'sequence', 1,
      'status', v_status,
      'at', coalesce(v_submission->>'submittedAt', v_submission #>> '{versions,0,receivedAt}', '1970-01-01T00:00:00.000Z'),
      'version', v_version_number,
      'reason', 'legacy_normalization'
    ));
  end if;
  v_submission := jsonb_set(v_submission, '{statusHistory}', v_history, true);

  for v_version in
    select value from jsonb_array_elements(coalesce(v_submission->'versions', '[]'::jsonb))
  loop
    if coalesce((v_version->>'version')::integer, v_version_number) = v_version_number then
      -- Defaults are placed on the left, therefore an explicit immutable
      -- version value always wins over the legacy top-level mirror.
      v_version := jsonb_strip_nulls(jsonb_build_object(
        'fileName', v_submission->>'fileName',
        'fileSize', v_submission->'fileSize',
        'mimeType', v_submission->>'mimeType',
        'mediaUrl', v_submission->>'mediaUrl',
        'mediaPath', v_submission->>'mediaPath',
        'bpm', v_submission->'bpm',
        'key', v_submission->>'key',
        'bars', v_submission->'bars',
        'durationSeconds', v_submission->'durationSeconds'
      )) || v_version;
    end if;
    v_version := jsonb_set(v_version, '{contributorId}', to_jsonb(coalesce(v_version->>'contributorId', v_contributor_id)), true);
    v_version := jsonb_set(
      v_version,
      '{status}',
      to_jsonb(case when coalesce((v_version->>'version')::integer, v_version_number) < v_version_number then 'SUPERSEDED' else v_status end),
      true
    );
    v_versions := v_versions || jsonb_build_array(v_version);
  end loop;

  if jsonb_array_length(v_versions) = 0 then
    v_versions := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'version', v_version_number,
      'receivedAt', coalesce(v_submission->>'submittedAt', '1970-01-01T00:00:00.000Z'),
      'note', 'Version originale normalisée',
      'status', v_status,
      'contributorId', v_contributor_id,
      'fileName', v_submission->>'fileName',
      'fileSize', v_submission->'fileSize',
      'mimeType', v_submission->>'mimeType',
      'mediaUrl', v_submission->>'mediaUrl',
      'mediaPath', v_submission->>'mediaPath',
      'bpm', v_submission->'bpm',
      'key', v_submission->>'key',
      'bars', v_submission->'bars',
      'durationSeconds', v_submission->'durationSeconds'
    )));
  end if;
  return jsonb_set(v_submission, '{versions}', v_versions, true);
end;
$$;

revoke all on function public.rooms_wave_normalize_submission_v2(jsonb) from public, anon, authenticated;
grant execute on function public.rooms_wave_normalize_submission_v2(jsonb) to service_role;

create or replace function public.rooms_wave_normalize_state_v2(p_state jsonb, p_drop_invalid_layers boolean default false)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_submissions jsonb := '[]'::jsonb;
  v_submission jsonb;
  v_layers jsonb := '[]'::jsonb;
  v_layer jsonb;
  v_layer_submission jsonb;
begin
  if not (v_state ? 'wave') then return v_state; end if;
  for v_submission in
    select value from jsonb_array_elements(coalesce(v_state #> '{wave,submissions}', '[]'::jsonb))
  loop
    v_submissions := v_submissions || jsonb_build_array(public.rooms_wave_normalize_submission_v2(v_submission));
  end loop;
  v_state := jsonb_set(v_state, '{wave,submissions}', v_submissions, true);

  for v_layer in
    select value from jsonb_array_elements(coalesce(v_state #> '{wave,layers}', '[]'::jsonb))
  loop
    if v_layer->>'id' = 'base' or nullif(v_layer->>'submissionId', '') is null then
      v_layers := v_layers || jsonb_build_array(v_layer);
      continue;
    end if;
    v_layer_submission := null;
    select value into v_layer_submission
    from jsonb_array_elements(v_submissions)
    where value->>'id' = v_layer->>'submissionId'
    limit 1;
    if v_layer_submission is not null and v_layer_submission->>'lifecycleStatus' = 'ACCEPTED' then
      v_layer := jsonb_set(
        v_layer,
        '{submissionVersion}',
        coalesce(v_layer->'submissionVersion', v_layer_submission->'version', '1'::jsonb),
        true
      );
      v_layers := v_layers || jsonb_build_array(v_layer);
    elsif not p_drop_invalid_layers then
      v_layers := v_layers || jsonb_build_array(v_layer);
    end if;
  end loop;
  return jsonb_set(v_state, '{wave,layers}', v_layers, true);
end;
$$;

revoke all on function public.rooms_wave_normalize_state_v2(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.rooms_wave_normalize_state_v2(jsonb, boolean) to service_role;

-- One-time additive upgrade. The v1 status and all private media references are
-- preserved; only lifecycle/audit/version metadata is added. Any impossible
-- legacy Beat layer is removed from playback before the stricter trigger lands.
update public.room_specialized_state_v1
set state = public.rooms_wave_normalize_state_v2(state, true)
where room_type = 'wave';

create or replace function public.rooms_specialized_guard_wave_lifecycle_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_state jsonb;
  v_new_state jsonb;
  v_raw_submission jsonb;
  v_old_submission jsonb;
  v_new_submission jsonb;
  v_previous_version jsonb;
  v_current_version jsonb;
  v_layer jsonb;
  v_layer_submission jsonb;
  v_old_status text;
  v_new_status text;
  v_open_votes integer;
  v_history_old jsonb;
  v_history_new jsonb;
  v_history_index integer;
begin
  if new.room_type <> 'wave' then return new; end if;
  for v_raw_submission in
    select value from jsonb_array_elements(coalesce(new.state #> '{wave,submissions}', '[]'::jsonb))
  loop
    if v_raw_submission ? 'lifecycleStatus'
       and upper(coalesce(v_raw_submission->>'lifecycleStatus', '')) not in (
         'UPLOADING','PROCESSING','RECEIVED','NEEDS_REVIEW','NEEDS_CORRECTION',
         'READY_FOR_VOTE','VOTING','ACCEPTED','NOT_SELECTED','REJECTED',
         'SUPERSEDED','REMOVED','PROCESSING_FAILED'
       ) then
      raise exception 'wave_status_invalid' using errcode = '22023';
    end if;
  end loop;
  v_old_state := public.rooms_wave_normalize_state_v2(old.state, false);
  v_new_state := public.rooms_wave_normalize_state_v2(new.state, false);
  new.state := v_new_state;

  select count(*) into v_open_votes
  from jsonb_array_elements(coalesce(v_new_state #> '{wave,submissions}', '[]'::jsonb)) submission
  where coalesce((submission #>> '{vote,open}')::boolean, false)
     or submission->>'lifecycleStatus' = 'VOTING';
  if v_open_votes > 1 then raise exception 'wave_vote_already_open' using errcode = '55000'; end if;

  for v_new_submission in
    select value from jsonb_array_elements(coalesce(v_new_state #> '{wave,submissions}', '[]'::jsonb))
  loop
    v_new_status := v_new_submission->>'lifecycleStatus';
    v_old_submission := null;
    select value into v_old_submission
    from jsonb_array_elements(coalesce(v_old_state #> '{wave,submissions}', '[]'::jsonb))
    where value->>'id' = v_new_submission->>'id'
    limit 1;

    if v_old_submission is null then
      if v_new_status not in ('UPLOADING','PROCESSING','RECEIVED','NEEDS_REVIEW') then
        raise exception 'wave_status_transition_forbidden' using errcode = '55000';
      end if;
      if v_new_submission->>'originalContributorId' is distinct from v_new_submission #>> '{contributor,id}' then
        raise exception 'wave_original_credit_required' using errcode = '55000';
      end if;
      if coalesce((v_new_submission->>'version')::integer, 1) <> 1
         or (v_new_submission ? 'vote' and v_new_submission->'vote' <> 'null'::jsonb) then
        raise exception 'wave_new_submission_invalid' using errcode = '55000';
      end if;
      continue;
    end if;

    v_old_status := v_old_submission->>'lifecycleStatus';
    if not public.rooms_wave_transition_allowed_v2(v_old_status, v_new_status) then
      raise exception 'wave_status_transition_forbidden:%:%', v_old_status, v_new_status using errcode = '55000';
    end if;
    if v_new_submission #>> '{contributor,id}' is distinct from v_old_submission #>> '{contributor,id}'
       or v_new_submission->>'originalContributorId' is distinct from v_old_submission->>'originalContributorId' then
      raise exception 'wave_original_credit_required' using errcode = '55000';
    end if;

    v_history_old := coalesce(v_old_submission->'statusHistory', '[]'::jsonb);
    v_history_new := coalesce(v_new_submission->'statusHistory', '[]'::jsonb);
    if jsonb_array_length(v_history_new) < jsonb_array_length(v_history_old) then
      raise exception 'wave_status_history_immutable' using errcode = '55000';
    end if;
    if jsonb_array_length(v_history_old) > 0 then
      for v_history_index in 0..jsonb_array_length(v_history_old) - 1 loop
        if v_history_new->v_history_index is distinct from v_history_old->v_history_index then
          raise exception 'wave_status_history_immutable' using errcode = '55000';
        end if;
      end loop;
    end if;
    if v_new_status is distinct from v_old_status then
      if jsonb_array_length(v_history_new) <> jsonb_array_length(v_history_old) + 1
         or v_history_new #>> array[(jsonb_array_length(v_history_new) - 1)::text, 'status'] <> v_new_status then
        raise exception 'wave_status_history_required' using errcode = '55000';
      end if;
    end if;

    if coalesce((v_new_submission->>'version')::integer, 1) < coalesce((v_old_submission->>'version')::integer, 1) then
      raise exception 'wave_version_regression' using errcode = '55000';
    end if;
    if coalesce((v_new_submission->>'version')::integer, 1) > coalesce((v_old_submission->>'version')::integer, 1) then
      if coalesce((v_new_submission->>'version')::integer, 1) <> coalesce((v_old_submission->>'version')::integer, 1) + 1
         or v_new_status <> 'NEEDS_REVIEW'
         or (v_new_submission ? 'vote' and v_new_submission->'vote' <> 'null'::jsonb) then
        raise exception 'wave_version_must_return_to_gate' using errcode = '55000';
      end if;
      if coalesce((v_old_submission #>> '{vote,open}')::boolean, false) then
        raise exception 'wave_vote_open' using errcode = '55000';
      end if;
      v_previous_version := null;
      select value into v_previous_version
      from jsonb_array_elements(coalesce(v_new_submission->'versions', '[]'::jsonb))
      where coalesce((value->>'version')::integer, 0) = coalesce((v_old_submission->>'version')::integer, 1)
      limit 1;
      v_current_version := null;
      select value into v_current_version
      from jsonb_array_elements(coalesce(v_new_submission->'versions', '[]'::jsonb))
      where coalesce((value->>'version')::integer, 0) = coalesce((v_new_submission->>'version')::integer, 1)
      limit 1;
      if v_previous_version is null or v_previous_version->>'status' <> 'SUPERSEDED'
         or v_previous_version->>'fileName' is distinct from v_old_submission->>'fileName'
         or v_previous_version->>'fileSize' is distinct from v_old_submission->>'fileSize'
         or v_previous_version->>'mimeType' is distinct from v_old_submission->>'mimeType'
         or v_previous_version->>'mediaPath' is distinct from v_old_submission->>'mediaPath'
         or v_previous_version->>'mediaUrl' is distinct from v_old_submission->>'mediaUrl'
         or v_previous_version->>'bpm' is distinct from v_old_submission->>'bpm'
         or v_previous_version->>'key' is distinct from v_old_submission->>'key'
         or v_previous_version->>'bars' is distinct from v_old_submission->>'bars'
         or v_previous_version->>'durationSeconds' is distinct from v_old_submission->>'durationSeconds'
         or v_current_version is null or v_current_version->>'status' <> 'NEEDS_REVIEW' then
        raise exception 'wave_original_version_required' using errcode = '55000';
      end if;
    end if;

    if coalesce((v_old_submission #>> '{vote,finalizedAt}'), '') <> ''
       and v_new_submission->'vote' is distinct from v_old_submission->'vote' then
      raise exception 'wave_vote_already_finalized' using errcode = '55000';
    end if;
    if v_new_status = 'VOTING' then
      if not coalesce((v_new_submission #>> '{vote,open}')::boolean, false)
         or coalesce((v_new_submission #>> '{vote,submissionVersion}')::integer, 0) <> coalesce((v_new_submission->>'version')::integer, 1)
         or nullif(v_new_submission #>> '{vote,roundId}', '') is null
         or not coalesce((v_new_submission #>> '{vote,hidden}')::boolean, false) then
        raise exception 'wave_vote_version_mismatch' using errcode = '55000';
      end if;
    elsif coalesce((v_new_submission #>> '{vote,open}')::boolean, false) then
      raise exception 'wave_vote_status_mismatch' using errcode = '55000';
    end if;
    if v_old_status = 'VOTING' and v_new_status <> 'VOTING' then
      if coalesce((v_new_submission #>> '{vote,open}')::boolean, true)
         or coalesce((v_new_submission #>> '{vote,submissionVersion}')::integer, 0) <> coalesce((v_new_submission->>'version')::integer, 1)
         or nullif(v_new_submission #>> '{vote,finalizedAt}', '') is null
         or nullif(v_new_submission #>> '{vote,finalizationKey}', '') is null then
        raise exception 'wave_vote_finalization_required' using errcode = '55000';
      end if;
      if v_new_status = 'ACCEPTED' and v_new_submission #>> '{vote,outcome}' <> 'accepted' then
        raise exception 'wave_vote_outcome_mismatch' using errcode = '55000';
      end if;
      if v_new_status = 'NOT_SELECTED' and v_new_submission #>> '{vote,outcome}' <> 'rejected' then
        raise exception 'wave_vote_outcome_mismatch' using errcode = '55000';
      end if;
    end if;
  end loop;

  for v_layer in
    select value from jsonb_array_elements(coalesce(v_new_state #> '{wave,layers}', '[]'::jsonb))
  loop
    if v_layer->>'id' = 'base' then continue; end if;
    if nullif(v_layer->>'submissionId', '') is null
       or (select count(*) from jsonb_array_elements(coalesce(v_new_state #> '{wave,layers}', '[]'::jsonb)) duplicate where duplicate->>'submissionId' = v_layer->>'submissionId') <> 1 then
      raise exception 'wave_layer_duplicate' using errcode = '23505';
    end if;
    v_layer_submission := null;
    select value into v_layer_submission
    from jsonb_array_elements(coalesce(v_new_state #> '{wave,submissions}', '[]'::jsonb))
    where value->>'id' = v_layer->>'submissionId'
    limit 1;
    if v_layer_submission is null
       or v_layer_submission->>'lifecycleStatus' <> 'ACCEPTED'
       or coalesce((v_layer->>'submissionVersion')::integer, 0) <> coalesce((v_layer_submission->>'version')::integer, 1) then
      raise exception 'wave_layer_public_approval_required' using errcode = '55000';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.rooms_specialized_guard_wave_lifecycle_v2() from public, anon, authenticated;
grant execute on function public.rooms_specialized_guard_wave_lifecycle_v2() to service_role;

drop trigger if exists rooms_specialized_guard_wave_lifecycle_v2 on public.room_specialized_state_v1;
create trigger rooms_specialized_guard_wave_lifecycle_v2
before update on public.room_specialized_state_v1
for each row execute function public.rooms_specialized_guard_wave_lifecycle_v2();
