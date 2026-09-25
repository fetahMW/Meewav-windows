-- Viewer projection and narrowly scoped media grants. Host V3/V5 contracts stay unchanged.
-- The comparison renderer registers A against the already locked B preview.
-- Raw Beat renders are never silently substituted for a normalized A preview.
create table if not exists public.wave_vote_comparison_a_v6 (
  round_id uuid primary key references public.wave_vote_rounds_v3(id) on delete cascade,
  asset_id uuid not null references public.wave_audio_assets_v3(id) on delete restrict
);
alter table public.wave_vote_comparison_a_v6 enable row level security;
revoke all on public.wave_vote_comparison_a_v6 from public, anon, authenticated, service_role;
create or replace function public.rooms_wave_register_comparison_a_v6(p_round_id uuid, p_asset_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if not exists(select 1 from public.wave_vote_rounds_v3 round
    join public.wave_vote_previews_v5 preview on preview.id = round.preview_id and preview.mode = 'WITH_BEAT'
    join public.wave_asset_derivatives_v4 b on b.asset_id = preview.asset_id
    join public.wave_asset_derivatives_v4 a on a.asset_id = p_asset_id
    join public.wave_audio_assets_v3 asset on asset.id = a.asset_id and asset.status = 'READY'
    where round.id = p_round_id and round.kind = 'REPLACEMENT' and round.status = 'LISTENING'
      and now() <= round.listening_started_at and a.session_id = round.session_id
      and a.asset_id <> b.asset_id and a.artifact_role = 'VOTE_PREVIEW' and a.state = 'READY'
      and a.temporal_exact and a.access_scope = 'ELIGIBLE_VOTER'
      and a.comparison_context_hash = b.comparison_context_hash
      and a.comparison_duration_ms = b.comparison_duration_ms
      and a.loudness_standard = b.loudness_standard) then
    raise exception using errcode = '55000', message = 'wave_comparison_preview_not_ready';
  end if;
  insert into public.wave_vote_comparison_a_v6 values(p_round_id, p_asset_id);
end;
$$;
revoke all on function public.rooms_wave_register_comparison_a_v6(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rooms_wave_register_comparison_a_v6(uuid,uuid) to service_role;

create or replace function public.rooms_wave_viewer_rules_v6(p_rules_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'bpm', bpm, 'key', musical_key,
    'signature', time_signature, 'cycleBars', cycle_bars, 'acceptedBars', accepted_loop_bars,
    'maxDurationMs', max_duration_ms, 'repeatPolicy', repeat_policy, 'mimeTypes', accepted_mime_types)
  from public.wave_rules_revisions_v5 where id = p_rules_id;
$$;
revoke all on function public.rooms_wave_viewer_rules_v6(uuid) from public, anon, authenticated;

create or replace function public.rooms_wave_viewer_snapshot_v6(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_session public.wave_sessions_v3%rowtype;
  v_program public.wave_program_audio_state_v3%rowtype;
  v_round public.wave_vote_rounds_v3%rowtype;
  v_closing public.wave_closing_votes_v5%rowtype;
  v_vote jsonb; v_reference jsonb; v_layers jsonb; v_own jsonb; v_categories jsonb;
  v_revision integer; v_active uuid; v_title text;
begin
  if not public.rooms_wave_is_member_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_member_required';
  end if;
  select * into strict v_session from public.wave_sessions_v3 where id = p_session_id;
  select * into v_program from public.wave_program_audio_state_v3 where session_id = p_session_id;
  -- A validated revision is not necessarily the audible programme.
  if v_program.source = 'SERVER_RENDER' and v_program.render_status = 'READY' then
    select id, revision_number into v_active, v_revision from public.wave_beat_revisions_v3
    where id = v_program.source_revision_id and activation_status = 'ACTIVE';
  end if;
  select title into v_title from public.rooms_v2 where id = v_session.room_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', track.id, 'title', submission.title, 'credit', submission.credit_name,
    'category', coalesce(category.code, 'fx')) order by track.position), '[]'::jsonb)
  into v_layers from public.wave_beat_tracks_v3 track
  join public.wave_loop_versions_v3 version on version.id = track.loop_version_id
  join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
  left join public.wave_categories_v3 category on category.id = coalesce(track.category_id, submission.category_id)
  where track.beat_revision_id = v_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', submission.id, 'title', submission.title, 'category', category.code,
    'status', submission.status, 'reason', submission.status_reason, 'version', submission.current_version_number,
    'integrated', exists(select 1 from public.wave_beat_tracks_v3 track
      join public.wave_loop_versions_v3 version on version.id = track.loop_version_id
      where track.beat_revision_id = v_active and version.submission_id = submission.id
        and version.version_number = submission.current_version_number)
  ) order by submission.submitted_at desc), '[]'::jsonb) into v_own
  from public.wave_loop_submissions_v3 submission
  join public.wave_categories_v3 category on category.id = submission.category_id
  where submission.session_id = p_session_id and submission.contributor_id = v_actor;

  select coalesce(jsonb_agg(jsonb_build_object('id', category.code, 'label', category.label,
    'priority', category.need_state = 'PRIORITY',
    'open', category.need_state in ('OPEN', 'PRIORITY') and exists(
      select 1 from public.wave_slots_v3 slot where slot.category_id = category.id and slot.state = 'OPEN'
        and not exists(select 1 from public.wave_slot_reservations_v5 reservation
          where reservation.slot_id = slot.id and reservation.status = 'RESERVED' and reservation.expires_at > now())),
    'permitted', exists(select 1 from public.wave_submission_allowances_v3 allowance
      where allowance.session_id = p_session_id and allowance.contributor_id = v_actor
        and (allowance.category_id is null or allowance.category_id = category.id)
        and allowance.used_submissions < allowance.max_submissions and allowance.revoked_at is null
        and (allowance.expires_at is null or allowance.expires_at > now()))
  ) order by category.position), '[]'::jsonb) into v_categories
  from public.wave_categories_v3 category where category.session_id = p_session_id;

  -- Only a prepared, temporally exact mix associated with the ACTIVE Beat.
  -- HOST_DAW is not implicitly a musical loop reference.
  select jsonb_build_object('id', reference.id, 'beatRevisionId', reference.beat_revision_id,
    'revision', beat.revision_number, 'rules', public.rooms_wave_viewer_rules_v6(reference.rules_revision_id),
    'durationSeconds', reference.cycle_duration_ms / 1000.0, 'originSeconds', 0,
    'label', case when v_program.source = 'HOST_DAW' then 'Référence du host — Beat version ' else 'Beat actuel — version ' end || beat.revision_number, 'downloadable', true)
  into v_reference from public.wave_production_references_v5 reference
  join public.wave_beat_revisions_v3 beat on beat.id = reference.beat_revision_id
  join public.wave_audio_assets_v3 asset on asset.id = reference.light_asset_id and asset.status = 'READY'
  join public.wave_asset_derivatives_v4 derivative on derivative.asset_id = asset.id
    and derivative.artifact_role = 'PRODUCTION_REFERENCE_LIGHT' and derivative.temporal_exact
    and derivative.state = 'READY' and derivative.access_scope = 'AUTHORIZED_CONTRIBUTOR'
    and derivative.retention_state in ('ACTIVE', 'LEGAL_HOLD')
  where reference.session_id = p_session_id and (reference.beat_revision_id = v_active
    or (v_program.source = 'HOST_DAW' and reference.id = v_session.production_reference_id))
    and exists(select 1 from public.wave_submission_allowances_v3 allowance
      where allowance.session_id = p_session_id and allowance.contributor_id = v_actor
        and allowance.revoked_at is null and (allowance.expires_at is null or allowance.expires_at > now()))
  order by reference.immutable_at desc limit 1;

  select * into v_round from public.wave_vote_rounds_v3 where session_id = p_session_id
  order by (id = v_session.active_vote_round_id) desc nulls last, listening_started_at desc limit 1;
  if v_round.id is not null then
    select jsonb_build_object('id', v_round.id, 'kind', v_round.kind, 'title', submission.title,
      'credit', submission.credit_name, 'candidateVersion', version.version_number,
      'referenceBeatRevisionId', v_round.reference_beat_revision_id, 'status', v_round.status,
      'opensAt', v_round.opens_at, 'closesAt', v_round.closes_at, 'approved', v_round.approved,
      'eligible', exists(select 1 from public.wave_vote_listen_receipts_v5 receipt
        where receipt.round_id = v_round.id and receipt.voter_id = v_actor and receipt.eligible),
      'choice', (select choice from public.wave_votes_v3 where round_id = v_round.id and voter_id = v_actor),
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', preview.mode,
        'label', case when preview.mode = 'SOLO' then 'Candidate · Solo'
          when v_round.kind = 'REPLACEMENT' then 'B — Nouvelle proposition avec le Beat'
          else 'Écouter la candidate avec le Beat' end) order by preview.mode)
        from public.wave_vote_previews_v5 preview
        where preview.session_id = p_session_id and preview.candidate_version_id = v_round.candidate_version_id
          and preview.reference_beat_revision_id = v_round.reference_beat_revision_id and preview.status = 'READY'
          and v_round.status in ('LISTENING', 'OPEN') and now() < v_round.closes_at), '[]'::jsonb)
        || case when v_round.kind = 'REPLACEMENT' and v_round.status in ('LISTENING', 'OPEN')
          and now() < v_round.closes_at and exists(select 1 from public.wave_vote_comparison_a_v6 where round_id = v_round.id)
          then '[{"id":"A","label":"A — Piste actuellement intégrée avec le Beat"}]'::jsonb else '[]'::jsonb end
    ) into v_vote from public.wave_loop_versions_v3 version
    join public.wave_loop_submissions_v3 submission on submission.id = version.submission_id
    where version.id = v_round.candidate_version_id;
  end if;
  select * into v_closing from public.wave_closing_votes_v5 where session_id = p_session_id
    and status in ('LISTENING', 'OPEN') order by created_at desc limit 1;
  if v_closing.id is not null then
    v_vote := jsonb_build_object('id', v_closing.id, 'kind', 'CLOSING', 'title', 'Production soumise à la clôture',
      'credit', 'Production du host', 'candidateVersion', (select revision_number from public.wave_beat_revisions_v3 where id = v_closing.reference_beat_revision_id),
      'referenceBeatRevisionId', v_closing.reference_beat_revision_id, 'status', v_closing.status,
      'opensAt', v_closing.opens_at, 'closesAt', v_closing.closes_at, 'approved', v_closing.approved,
      'eligible', exists(select 1 from public.wave_closing_eligible_voters_v5 where closing_vote_id = v_closing.id and voter_id = v_actor),
      'choice', (select choice from public.wave_closing_ballots_v5 where closing_vote_id = v_closing.id and voter_id = v_actor),
      'options', '[{"id":"mix","label":"Écouter la production"}]'::jsonb);
  end if;
  return jsonb_build_object('sessionId', p_session_id, 'sequence', v_session.event_sequence, 'serverNow', now(),
    'title', coalesce(v_title, 'La Wave'), 'status', v_session.lifecycle_state,
    'rules', public.rooms_wave_viewer_rules_v6(v_session.active_rules_revision_id),
    'activeBeatId', v_active, 'activeRevision', v_revision, 'programSource', coalesce(v_program.source::text, 'SILENCE'),
    'pendingActivation', exists(select 1 from public.wave_activation_queue_v5 where session_id = p_session_id and state = 'PENDING_ACTIVATION'),
    'reference', v_reference, 'categories', v_categories, 'contributions', v_own, 'layers', v_layers, 'vote', v_vote,
    'termsVersion', 'wave-viewer-original-v1',
    'submissionsOpen', v_session.lifecycle_state = 'LIVE_ACTIVE' or
      (v_session.lifecycle_state = 'INTERMISSION' and v_session.submissions_during_intermission));
end;
$$;
revoke all on function public.rooms_wave_viewer_snapshot_v6(uuid) from public, anon;
grant execute on function public.rooms_wave_viewer_snapshot_v6(uuid) to authenticated;

-- Returns only an authorized asset identity, never arbitrary originals or Storage paths.
create or replace function public.rooms_wave_viewer_media_grant_v6(p_session_id uuid, p_kind text, p_id uuid, p_option text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_asset uuid; v_actor uuid := auth.uid(); v_role text;
begin
  if not public.rooms_wave_is_member_v3(p_session_id, v_actor) then
    raise exception using errcode = '42501', message = 'wave_member_required';
  end if;
  if p_kind = 'reference' then
    if not exists(select 1 from public.wave_submission_allowances_v3 where session_id = p_session_id
      and contributor_id = v_actor and revoked_at is null and (expires_at is null or expires_at > now())) then
      raise exception using errcode = '42501', message = 'wave_reference_forbidden';
    end if;
    select light_asset_id into v_asset from public.wave_production_references_v5
    where id = p_id and session_id = p_session_id;
    v_role := 'PRODUCTION_REFERENCE_LIGHT';
  elsif p_kind = 'vote' then
    if p_option = 'A' then
      select comparison.asset_id into v_asset from public.wave_vote_rounds_v3 round
      join public.wave_vote_comparison_a_v6 comparison on comparison.round_id = round.id
      where round.id = p_id and round.session_id = p_session_id and round.kind = 'REPLACEMENT'
        and round.status in ('LISTENING', 'OPEN') and now() < round.closes_at;
      v_role := 'VOTE_PREVIEW';
    else
      select preview.asset_id into v_asset from public.wave_vote_rounds_v3 round
      join public.wave_vote_previews_v5 preview on preview.candidate_version_id = round.candidate_version_id
        and preview.reference_beat_revision_id = round.reference_beat_revision_id and preview.session_id = round.session_id
      where round.id = p_id and round.session_id = p_session_id and round.status in ('LISTENING', 'OPEN')
        and now() < round.closes_at and preview.mode = p_option and preview.status = 'READY';
      v_role := 'VOTE_PREVIEW';
    end if;
  elsif p_kind = 'closing' then
    select preview_asset_id into v_asset from public.wave_closing_votes_v5
    where id = p_id and session_id = p_session_id and status in ('LISTENING', 'OPEN') and now() < closes_at;
    v_role := 'VOTE_PREVIEW';
  end if;
  if v_asset is null or not exists(select 1 from public.wave_audio_assets_v3 asset
    where asset.id = v_asset and asset.session_id = p_session_id and asset.status = 'READY'
      and asset.kind <> 'ORIGINAL'
      and (v_role is null or exists(select 1 from public.wave_asset_derivatives_v4 derivative
        where derivative.asset_id = asset.id and derivative.artifact_role = v_role and derivative.state = 'READY'
          and derivative.temporal_exact and derivative.retention_state in ('ACTIVE', 'LEGAL_HOLD')
          and derivative.access_scope = case when p_kind = 'reference' then 'AUTHORIZED_CONTRIBUTOR' else 'ELIGIBLE_VOTER' end))) then
    raise exception using errcode = '42501', message = 'wave_viewer_media_forbidden';
  end if;
  return v_asset;
end;
$$;
revoke all on function public.rooms_wave_viewer_media_grant_v6(uuid, text, uuid, text) from public, anon;
grant execute on function public.rooms_wave_viewer_media_grant_v6(uuid, text, uuid, text) to authenticated;

-- Upload authorization stays in V5. Attach the locally pinned reference only
-- on the first request; retries cannot mutate its title, file or context.
create table if not exists public.wave_viewer_upload_context_v6 (
  upload_id uuid primary key references public.wave_asset_uploads_v4(id) on delete cascade,
  title text not null,
  reference_id uuid references public.wave_production_references_v5(id) on delete restrict
);
alter table public.wave_viewer_upload_context_v6 enable row level security;
revoke all on public.wave_viewer_upload_context_v6 from public, anon, authenticated;
grant all on public.wave_viewer_upload_context_v6 to service_role;

create or replace function public.rooms_wave_viewer_upload_v6(
  p_session_id uuid, p_category_code text, p_file_name text, p_byte_size bigint,
  p_claimed_mime_type text, p_sha256 text, p_terms_version text, p_terms_accepted_at timestamptz,
  p_idempotency_key text, p_correlation_id text, p_title text, p_reference_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_upload uuid; v_reference public.wave_production_references_v5%rowtype;
  v_context public.wave_viewer_upload_context_v6%rowtype;
begin
  if p_terms_version <> 'wave-viewer-original-v1' or length(btrim(p_title)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'wave_viewer_consent_or_title_invalid';
  end if;
  if p_reference_id is not null then
    perform public.rooms_wave_viewer_media_grant_v6(p_session_id, 'reference', p_reference_id, 'mix');
    select * into strict v_reference from public.wave_production_references_v5 where id = p_reference_id;
  end if;
  v_result := public.rooms_wave_request_asset_upload_v5(p_session_id, 'LOOP_ORIGINAL', p_category_code,
    p_file_name, p_byte_size, p_claimed_mime_type, p_sha256, p_terms_version, p_terms_accepted_at,
    p_idempotency_key, p_correlation_id);
  v_upload := (v_result->>'uploadId')::uuid;
  select * into v_context from public.wave_viewer_upload_context_v6 where upload_id = v_upload;
  if found then
    if v_context.title <> p_title or v_context.reference_id is distinct from p_reference_id then
      raise exception using errcode = '23505', message = 'wave_viewer_retry_context_mismatch';
    end if;
    return v_result;
  end if;
  insert into public.wave_viewer_upload_context_v6 values(v_upload, p_title, p_reference_id);
  update public.wave_loop_submissions_v3 submission set title = p_title,
    based_on_beat_revision_id = coalesce(v_reference.beat_revision_id, submission.based_on_beat_revision_id),
    based_on_rules_revision_id = coalesce(v_reference.rules_revision_id, submission.based_on_rules_revision_id)
  from public.wave_asset_uploads_v4 upload where upload.id = v_upload and submission.id = upload.submission_id
    and upload.actor_id = auth.uid() and submission.status = 'UPLOADING';
  update public.wave_asset_uploads_v4 set
    based_on_beat_revision_id = coalesce(v_reference.beat_revision_id, based_on_beat_revision_id),
    based_on_rules_revision_id = coalesce(v_reference.rules_revision_id, based_on_rules_revision_id)
  where id = v_upload and actor_id = auth.uid();
  return v_result;
end;
$$;
revoke all on function public.rooms_wave_viewer_upload_v6(uuid,text,text,bigint,text,text,text,timestamptz,text,text,text,uuid) from public, anon;
grant execute on function public.rooms_wave_viewer_upload_v6(uuid,text,text,bigint,text,text,text,timestamptz,text,text,text,uuid) to authenticated;
