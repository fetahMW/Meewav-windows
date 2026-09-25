-- Viewer V1 for Scene, Classe, Wave, Cage and Loge.
-- The authoritative state is private. Realtime only publishes a revision signal;
-- every client reloads a server-projected state so private production data never
-- crosses the RLS boundary.

create table if not exists public.room_specialized_state_v1 (
  room_id uuid primary key references public.rooms_v2(id) on delete cascade,
  room_type text not null check (room_type in ('scene', 'classe', 'wave', 'cage', 'loge')),
  revision bigint not null default 1 check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 524288),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_specialized_state_signal_v1 (
  room_id uuid primary key references public.rooms_v2(id) on delete cascade,
  room_type text not null check (room_type in ('scene', 'classe', 'wave', 'cage', 'loge')),
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_specialized_action_receipts_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  action text not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, idempotency_key)
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('room-wave-submissions', 'room-wave-submissions', false, 26214400, array['audio/wav','audio/x-wav','audio/mpeg','audio/aac','audio/flac','audio/mp4','audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

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
        or exists (
          select 1
          from jsonb_array_elements(coalesce(state.state #> '{wave,submissions}', '[]'::jsonb)) submission
          where submission->>'mediaPath' = p_name
            and (
              submission->>'status' = 'accepted'
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

drop policy if exists room_wave_upload_own_v1 on storage.objects;
create policy room_wave_upload_own_v1 on storage.objects for insert to authenticated
with check (
  bucket_id = 'room-wave-submissions'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.rooms_v2 r
    where r.id::text = (storage.foldername(name))[1] and r.status = 'live'
      and not exists (select 1 from public.room_bans_v2 b where b.room_id = r.id and b.user_id = auth.uid())
  )
);

drop policy if exists room_wave_read_live_v1 on storage.objects;
create policy room_wave_read_live_v1 on storage.objects for select to anon, authenticated
using (
  bucket_id = 'room-wave-submissions'
  and public.rooms_specialized_wave_media_visible_v1(name, auth.uid())
);

drop policy if exists room_wave_delete_own_v1 on storage.objects;
create policy room_wave_delete_own_v1 on storage.objects for delete to authenticated
using (bucket_id = 'room-wave-submissions' and (storage.foldername(name))[2] = auth.uid()::text);

alter table public.room_specialized_state_v1 enable row level security;
alter table public.room_specialized_state_signal_v1 enable row level security;
alter table public.room_specialized_action_receipts_v1 enable row level security;

revoke all on public.room_specialized_state_v1 from anon, authenticated;
revoke all on public.room_specialized_action_receipts_v1 from anon, authenticated;
revoke all on public.room_specialized_state_signal_v1 from anon, authenticated;
grant select on public.room_specialized_state_signal_v1 to anon, authenticated;
grant all on public.room_specialized_state_v1, public.room_specialized_state_signal_v1, public.room_specialized_action_receipts_v1 to service_role;

drop policy if exists room_specialized_signal_visible_v1 on public.room_specialized_state_signal_v1;
create policy room_specialized_signal_visible_v1
on public.room_specialized_state_signal_v1
for select
to anon, authenticated
using (
  exists (
    select 1 from public.rooms_v2 r
    where r.id = room_specialized_state_signal_v1.room_id
      and r.status in ('live', 'ended')
  )
  and (
    auth.uid() is null
    or not exists (
      select 1 from public.room_bans_v2 b
      where b.room_id = room_specialized_state_signal_v1.room_id
        and b.user_id = auth.uid()
    )
  )
);

create or replace function public.rooms_specialized_strip_person_v1(p_person jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_person, '{}'::jsonb) - 'access';
$$;

revoke all on function public.rooms_specialized_strip_person_v1(jsonb) from public, anon, authenticated;
grant execute on function public.rooms_specialized_strip_person_v1(jsonb) to service_role;

create or replace function public.rooms_specialized_is_control_v1(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.rooms_v2 r
    where r.id = p_room_id
      and (
        r.host_id = p_user_id
        or exists (
          select 1 from public.room_moderators_v2 m
          where m.room_id = r.id and m.user_id = p_user_id
        )
      )
  );
$$;

revoke all on function public.rooms_specialized_is_control_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rooms_specialized_is_control_v1(uuid, uuid) to service_role;

create or replace function public.rooms_specialized_loge_eligible_v1(p_room_id uuid, p_user_id uuid, p_state jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    public.rooms_specialized_is_control_v1(p_room_id, p_user_id)
    or exists (
      select 1 from public.room_invitations_v2 invitation
      where invitation.room_id = p_room_id
        and invitation.guest_id = p_user_id
        and invitation.status in ('accepted', 'ready', 'backstage', 'onstage')
    )
    or exists (
      select 1 from public.room_gift_deliveries_v1 delivery
      where delivery.room_id_snapshot = p_room_id
        and delivery.recipient_profile_id_snapshot = p_user_id
        and delivery.gift_code in ('vip-pass', 'private-access')
        and delivery.status = 'sent'
    )
    or exists (
      select 1 from public.room_gift_awards_v1 award
      where award.room_id_snapshot = p_room_id
        and award.recipient_profile_id = p_user_id
        and award.gift_code in ('vip-pass', 'private-access')
    )
    or exists (
      select 1 from jsonb_array_elements(coalesce(p_state #> '{loge,moments}', '[]'::jsonb)) moment
      where moment #>> '{beneficiary,id}' = p_user_id::text
        and moment->>'status' not in ('declined', 'cancelled')
    )
    or exists (
      select 1 from jsonb_array_elements(coalesce(p_state #> '{gifts,redemptions}', '[]'::jsonb)) redemption
      where redemption->>'ownerId' = p_user_id::text
        and redemption->>'kind' = 'vip-moment'
        and redemption->>'status' <> 'cancelled'
    )
  );
$$;

revoke all on function public.rooms_specialized_loge_eligible_v1(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.rooms_specialized_loge_eligible_v1(uuid, uuid, jsonb) to service_role;

create or replace function public.rooms_specialized_project_state_v1(
  p_state jsonb,
  p_room_type text,
  p_user_id uuid,
  p_control boolean default false,
  p_artist boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_items jsonb;
  v_item jsonb;
  v_vote jsonb;
  v_votes jsonb;
  v_uid text := coalesce(p_user_id::text, '');
begin
  if p_control then return v_state; end if;

  v_state := jsonb_set(v_state, '{gifts,stock}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{gifts,transactions}', '[]'::jsonb, true);
  v_state := jsonb_set(v_state, '{gifts,redemptions}', '[]'::jsonb, true);

  if p_room_type = 'scene' and v_state ? 'scene' then
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{scene,people}', '[]'::jsonb)) loop
      v_items := v_items || jsonb_build_array(public.rooms_specialized_strip_person_v1(v_item));
    end loop;
    v_state := jsonb_set(v_state, '{scene,people}', v_items, true);
    if p_artist then
      v_items := '[]'::jsonb;
      for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{scene,prompter,texts}', '[]'::jsonb)) loop
        if v_item->>'artistId' = v_uid then v_items := v_items || jsonb_build_array(v_item); end if;
      end loop;
      v_state := jsonb_set(v_state, '{scene,prompter,texts}', v_items, true);
      v_state := jsonb_set(v_state, '{scene,prompter,activeTextId}', to_jsonb(coalesce(v_items->0->>'id', '')), true);
    else
      v_state := jsonb_set(v_state, '{scene,prompter}', jsonb_build_object(
        'texts', '[]'::jsonb, 'activeTextId', '', 'playing', false, 'line', 0,
        'speed', 1, 'fontSize', 0, 'lineHeight', 1, 'alignment', 'center',
        'countdown', 0, 'controller', 'regie', 'mirrored', false
      ), true);
    end if;
  elsif p_room_type = 'classe' and v_state ? 'classe' then
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{classe,people}', '[]'::jsonb)) loop
      v_items := v_items || jsonb_build_array(public.rooms_specialized_strip_person_v1(v_item));
    end loop;
    v_state := jsonb_set(v_state, '{classe,people}', v_items, true);
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{classe,seats}', '[]'::jsonb)) loop
      if v_item ? 'person' and jsonb_typeof(v_item->'person') = 'object' then
        v_item := jsonb_set(v_item, '{person}', public.rooms_specialized_strip_person_v1(v_item->'person'), true);
      end if;
      if coalesce(v_item #>> '{person,id}', '') <> v_uid then
        v_item := jsonb_set(jsonb_set(v_item, '{canSpeak}', 'false'::jsonb, true), '{canShareScreen}', 'false'::jsonb, true);
      end if;
      v_items := v_items || jsonb_build_array(v_item);
    end loop;
    v_state := jsonb_set(v_state, '{classe,seats}', v_items, true);
  elsif p_room_type = 'wave' and v_state ? 'wave' then
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{wave,submissions}', '[]'::jsonb)) loop
      if v_item->>'status' in ('accepted') or coalesce((v_item #>> '{vote,open}')::boolean, false) or v_item #>> '{contributor,id}' = v_uid then
        if coalesce((v_item #>> '{vote,open}')::boolean, false)
           and nullif(v_item #>> '{vote,endsAt}', '') is not null
           and (v_item #>> '{vote,endsAt}')::timestamptz <= now() then
          v_item := jsonb_set(v_item, '{vote,open}', 'false'::jsonb, true);
        end if;
        v_item := jsonb_set(v_item, '{contributor}', public.rooms_specialized_strip_person_v1(v_item->'contributor'), true);
        v_item := jsonb_set(v_item, '{privateNotes}', '""'::jsonb, true);
        if v_item ? 'vote' and coalesce((v_item #>> '{vote,hidden}')::boolean, false) then
          v_votes := '{}'::jsonb;
          if v_uid <> '' and (v_item #> '{vote,votes}') ? v_uid then
            v_votes := jsonb_build_object(v_uid, v_item #> array['vote', 'votes', v_uid]);
          end if;
          v_vote := jsonb_set(v_item->'vote', '{votes}', v_votes, true);
          v_item := jsonb_set(v_item, '{vote}', v_vote, true);
        end if;
        v_items := v_items || jsonb_build_array(v_item);
      end if;
    end loop;
    v_state := jsonb_set(v_state, '{wave,submissions}', v_items, true);
  elsif p_room_type = 'cage' and v_state ? 'cage' then
    if coalesce((v_state #>> '{cage,votingOpen}')::boolean, false)
       and nullif(v_state #>> '{cage,votingEndsAt}', '') is not null
       and (v_state #>> '{cage,votingEndsAt}')::timestamptz <= now() then
      v_state := jsonb_set(v_state, '{cage,votingOpen}', 'false'::jsonb, true);
    end if;
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{cage,matches}', '[]'::jsonb)) loop
      v_item := jsonb_set(v_item, '{competitorA}', public.rooms_specialized_strip_person_v1(v_item->'competitorA'), true);
      v_item := jsonb_set(v_item, '{competitorB}', public.rooms_specialized_strip_person_v1(v_item->'competitorB'), true);
      if coalesce((v_state #>> '{cage,resultsHidden}')::boolean, false)
         and v_item->>'id' = (v_state #>> '{cage,currentMatchId}') then
        v_item := (v_item - 'winnerId') || jsonb_build_object('scoreA', 0, 'scoreB', 0);
      end if;
      v_items := v_items || jsonb_build_array(v_item);
    end loop;
    v_state := jsonb_set(v_state, '{cage,matches}', v_items, true);
    if coalesce((v_state #>> '{cage,resultsHidden}')::boolean, false) then
      v_votes := '{}'::jsonb;
      if v_uid <> '' and (v_state #> '{cage,votes}') ? v_uid then
        v_votes := jsonb_build_object(v_uid, v_state #> array['cage', 'votes', v_uid]);
      end if;
      v_state := jsonb_set(v_state, '{cage,votes}', v_votes, true);
      v_items := '[]'::jsonb;
      for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{cage,resultHistory}', '[]'::jsonb)) loop
        if v_item->>'matchId' <> (v_state #>> '{cage,currentMatchId}') then
          v_items := v_items || jsonb_build_array(v_item);
        end if;
      end loop;
      v_state := jsonb_set(v_state, '{cage,resultHistory}', v_items, true);
    end if;
  elsif p_room_type = 'loge' and v_state ? 'loge' then
    if (
      nullif(v_state #>> '{loge,preview,expiresAt}', '') is not null
      and (v_state #>> '{loge,preview,expiresAt}')::timestamptz <= now()
    ) or (
      coalesce((v_state #>> '{loge,preview,liveOnly}')::boolean, false)
      and not coalesce((v_state #>> '{loge,preview,playing}')::boolean, false)
    ) then
      v_state := jsonb_set(v_state, '{loge,preview,mediaName}', '""'::jsonb, true);
      v_state := jsonb_set(v_state, '{loge,preview,playing}', 'false'::jsonb, true);
    end if;
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{loge,questions}', '[]'::jsonb)) loop
      if v_item #>> '{author,id}' = v_uid or v_item->>'status' in ('selected', 'answered') then
        v_item := jsonb_set(v_item, '{author}', public.rooms_specialized_strip_person_v1(v_item->'author'), true);
        v_items := v_items || jsonb_build_array(v_item);
      end if;
    end loop;
    v_state := jsonb_set(v_state, '{loge,questions}', v_items, true);
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{loge,moments}', '[]'::jsonb)) loop
      if v_item #>> '{beneficiary,id}' = v_uid or (v_item->>'kind' = 'face-to-face' and v_item->>'status' = 'live') then
        v_item := jsonb_set(v_item, '{beneficiary}', public.rooms_specialized_strip_person_v1(v_item->'beneficiary'), true);
        if v_item #>> '{beneficiary,id}' <> v_uid then v_item := v_item - 'privateContent'; end if;
        v_items := v_items || jsonb_build_array(v_item);
      end if;
    end loop;
    v_state := jsonb_set(v_state, '{loge,moments}', v_items, true);
  end if;
  return v_state;
end;
$$;

revoke all on function public.rooms_specialized_project_state_v1(jsonb, text, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.rooms_specialized_project_state_v1(jsonb, text, uuid, boolean, boolean) to service_role;

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
  select r.status into v_room_status from public.rooms_v2 r where r.id = p_room_id;
  if not found or v_room_status not in ('live', 'ended') then return null; end if;
  select * into v_row from public.room_specialized_state_v1 s where s.room_id = p_room_id;
  if not found then return null; end if;
  if exists (select 1 from public.room_bans_v2 b where b.room_id = p_room_id and b.user_id = v_uid) then
    raise exception 'room_specialized_access_revoked' using errcode = '42501';
  end if;
  v_control := public.rooms_specialized_is_control_v1(p_room_id, v_uid);
  if not v_control and v_row.room_type = 'scene' and v_uid is not null then
    v_artist := exists (
      select 1 from public.room_participants_v2 p
      where p.room_id = p_room_id and p.user_id = v_uid and p.left_at is null and p.role in ('guest', 'artist')
    );
  end if;
  v_eligible := v_control or (
    v_uid is not null
    and (
      v_row.room_type <> 'loge'
      or public.rooms_specialized_loge_eligible_v1(p_room_id, v_uid, v_row.state)
    )
  );
  v_projected := public.rooms_specialized_project_state_v1(v_row.state, v_row.room_type, v_uid, v_control, v_artist);
  if v_row.room_type = 'loge' and not v_eligible then
    v_projected := jsonb_set(v_projected, '{loge,preview}', jsonb_build_object(
      'title', 'Accès privé', 'description', '', 'mediaName', '', 'playing', false,
      'replayIncluded', false, 'liveOnly', true, 'expiresAt', null
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

create or replace function public.rooms_initialize_specialized_state_v1(p_room_id uuid, p_room_type text, p_initial_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms_v2%rowtype;
  v_state jsonb;
begin
  if p_room_type not in ('scene', 'classe', 'wave', 'cage', 'loge') then raise exception 'room_specialized_type_invalid' using errcode = '22023'; end if;
  if jsonb_typeof(p_initial_state) <> 'object' or pg_column_size(p_initial_state) > 524288 then raise exception 'room_specialized_state_invalid' using errcode = '22023'; end if;
  select * into v_room from public.rooms_v2 r where r.id = p_room_id for update;
  if not found or v_room.host_id <> v_uid then raise exception 'room_specialized_initialize_forbidden' using errcode = '42501'; end if;
  if v_room.status <> 'live' then raise exception 'room_specialized_room_not_live' using errcode = '55000'; end if;
  v_state := p_initial_state || jsonb_build_object('roomId', p_room_id::text, 'roomType', p_room_type, 'revision', 1, 'updatedAt', now());
  insert into public.room_specialized_state_v1(room_id, room_type, revision, state, updated_by)
  values (p_room_id, p_room_type, 1, v_state, v_uid)
  on conflict (room_id) do nothing;
  insert into public.room_specialized_state_signal_v1(room_id, room_type, revision)
  select s.room_id, s.room_type, s.revision from public.room_specialized_state_v1 s where s.room_id = p_room_id
  on conflict (room_id) do update set revision = excluded.revision, room_type = excluded.room_type, updated_at = now();
  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_initialize_specialized_state_v1(uuid, text, jsonb) from public, anon;
grant execute on function public.rooms_initialize_specialized_state_v1(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.rooms_commit_specialized_state_v1(p_room_id uuid, p_room_type text, p_expected_revision bigint, p_next_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.room_specialized_state_v1%rowtype;
  v_revision bigint;
  v_state jsonb;
begin
  if not public.rooms_specialized_is_control_v1(p_room_id, v_uid) then raise exception 'room_specialized_commit_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.rooms_v2 r where r.id = p_room_id and r.status = 'live') then raise exception 'room_specialized_room_not_live' using errcode = '55000'; end if;
  if jsonb_typeof(p_next_state) <> 'object' or pg_column_size(p_next_state) > 524288 then raise exception 'room_specialized_state_invalid' using errcode = '22023'; end if;
  select * into v_row from public.room_specialized_state_v1 s where s.room_id = p_room_id for update;
  if not found or v_row.room_type <> p_room_type then raise exception 'room_specialized_state_missing' using errcode = 'P0002'; end if;
  if v_row.revision <> p_expected_revision then raise exception 'room_specialized_revision_conflict' using errcode = '40001'; end if;
  v_revision := v_row.revision + 1;
  v_state := p_next_state || jsonb_build_object('roomId', p_room_id::text, 'roomType', p_room_type, 'revision', v_revision, 'updatedAt', now());
  update public.room_specialized_state_v1 set revision = v_revision, state = v_state, updated_by = v_uid, updated_at = now() where room_id = p_room_id;
  insert into public.room_specialized_state_signal_v1(room_id, room_type, revision) values (p_room_id, p_room_type, v_revision)
  on conflict (room_id) do update set revision = excluded.revision, room_type = excluded.room_type, updated_at = now();
  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_commit_specialized_state_v1(uuid, text, bigint, jsonb) from public, anon;
grant execute on function public.rooms_commit_specialized_state_v1(uuid, text, bigint, jsonb) to authenticated, service_role;

create or replace function public.rooms_apply_specialized_viewer_action_v1(
  p_room_id uuid,
  p_action text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms_v2%rowtype;
  v_row public.room_specialized_state_v1%rowtype;
  v_state jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_target text;
  v_choice text;
  v_found boolean := false;
  v_revision bigint;
  v_profile jsonb;
begin
  if v_uid is null then raise exception 'room_specialized_auth_required' using errcode = '42501'; end if;
  select * into v_room from public.rooms_v2 r where r.id = p_room_id for share;
  if not found or v_room.status <> 'live' then raise exception 'room_specialized_room_not_live' using errcode = '55000'; end if;
  if exists (select 1 from public.room_bans_v2 b where b.room_id = p_room_id and b.user_id = v_uid) then raise exception 'room_specialized_access_revoked' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rooms:specialized:' || p_room_id::text, 0));
  select * into v_row from public.room_specialized_state_v1 s where s.room_id = p_room_id for update;
  if not found then raise exception 'room_specialized_state_missing' using errcode = 'P0002'; end if;
  if exists (select 1 from public.room_specialized_action_receipts_v1 x where x.room_id = p_room_id and x.user_id = v_uid and x.idempotency_key = p_idempotency_key) then
    return public.rooms_get_specialized_state_v1(p_room_id);
  end if;
  v_state := v_row.state;

  if p_action in ('classe.hand.raise', 'classe.hand.lower-own') and v_row.room_type = 'classe' then
    if not exists (select 1 from jsonb_array_elements(coalesce(v_state #> '{classe,seats}', '[]'::jsonb)) s where s #>> '{person,id}' = v_uid::text) then raise exception 'classe_seat_required' using errcode = '42501'; end if;
    if p_action = 'classe.hand.raise' and not coalesce((v_state #>> '{classe,handsOpen}')::boolean, false) then raise exception 'class_hands_closed' using errcode = '55000'; end if;
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{classe,raisedHands}', '[]'::jsonb)) loop
      if v_item->>'personId' <> v_uid::text then v_items := v_items || jsonb_build_array(v_item); end if;
    end loop;
    if p_action = 'classe.hand.raise' then v_items := v_items || jsonb_build_array(jsonb_build_object('personId', v_uid::text, 'raisedAt', now())); end if;
    v_state := jsonb_set(v_state, '{classe,raisedHands}', v_items, true);
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{classe,seats}', '[]'::jsonb)) loop
      if v_item #>> '{person,id}' = v_uid::text then v_item := jsonb_set(v_item, '{handRaised}', to_jsonb(p_action = 'classe.hand.raise'), true); end if;
      v_items := v_items || jsonb_build_array(v_item);
    end loop;
    v_state := jsonb_set(v_state, '{classe,seats}', v_items, true);
  elsif p_action = 'classe.speaker.end-own' and v_row.room_type = 'classe' then
    if v_state #>> '{classe,activeSpeakerId}' <> v_uid::text then raise exception 'classe_speaker_forbidden' using errcode = '42501'; end if;
    v_state := jsonb_set(v_state, '{classe,activeSpeakerId}', 'null'::jsonb, true);
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{classe,seats}', '[]'::jsonb)) loop
      if v_item #>> '{person,id}' = v_uid::text then
        v_item := jsonb_set(jsonb_set(jsonb_set(v_item, '{status}', '"connected"'::jsonb, true), '{canSpeak}', 'false'::jsonb, true), '{canShareScreen}', 'false'::jsonb, true);
      end if;
      v_items := v_items || jsonb_build_array(v_item);
    end loop;
    v_state := jsonb_set(v_state, '{classe,seats}', v_items, true);
  elsif p_action = 'wave.vote.cast' and v_row.room_type = 'wave' then
    v_target := p_payload->>'submissionId'; v_choice := p_payload->>'choice';
    if v_choice not in ('yes', 'no') then raise exception 'wave_vote_invalid' using errcode = '22023'; end if;
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{wave,submissions}', '[]'::jsonb)) loop
      if v_item->>'id' = v_target then
        v_found := true;
        if not coalesce((v_item #>> '{vote,open}')::boolean, false) then raise exception 'wave_vote_closed' using errcode = '55000'; end if;
        if nullif(v_item #>> '{vote,endsAt}', '') is not null and (v_item #>> '{vote,endsAt}')::timestamptz <= now() then raise exception 'wave_vote_expired' using errcode = '55000'; end if;
        if (v_item #> '{vote,votes}') ? v_uid::text then raise exception 'wave_vote_already_cast' using errcode = '23505'; end if;
        v_item := jsonb_set(v_item, array['vote','votes',v_uid::text], to_jsonb(v_choice), true);
      end if;
      v_items := v_items || jsonb_build_array(v_item);
    end loop;
    if not v_found then raise exception 'wave_submission_not_found' using errcode = 'P0002'; end if;
    v_state := jsonb_set(v_state, '{wave,submissions}', v_items, true);
  elsif p_action = 'wave.submission.add' and v_row.room_type = 'wave' then
    if coalesce((p_payload->>'bpm')::integer, 0) < 40 or coalesce((p_payload->>'bpm')::integer, 0) > 260 or coalesce((p_payload->>'bars')::integer, 0) not in (4,8) then raise exception 'wave_submission_invalid' using errcode = '22023'; end if;
    if length(coalesce(p_payload->>'title','')) not between 1 and 120 or length(coalesce(p_payload->>'fileName','')) not between 1 and 255 then raise exception 'wave_submission_invalid' using errcode = '22023'; end if;
    if not coalesce((p_payload->>'rightsConfirmed')::boolean, false) then raise exception 'wave_rights_unconfirmed' using errcode = '42501'; end if;
    if coalesce((p_payload->>'fileSize')::bigint, 0) not between 1 and 26214400 then raise exception 'wave_file_too_large' using errcode = '22023'; end if;
    if coalesce(p_payload->>'mimeType', '') not in ('audio/wav','audio/x-wav','audio/mpeg','audio/aac','audio/flac','audio/mp4','audio/x-m4a') then raise exception 'wave_file_type_invalid' using errcode = '22023'; end if;
    if coalesce(p_payload->>'mediaPath','') not like p_room_id::text || '/' || v_uid::text || '/%' then raise exception 'wave_media_path_invalid' using errcode = '22023'; end if;
    if abs(coalesce((p_payload->>'bpm')::integer, 0) - coalesce((v_state #>> '{wave,baseLoop,bpm}')::integer, 0)) > 8 then raise exception 'wave_submission_incompatible' using errcode = '22023'; end if;
    if (select count(*) from jsonb_array_elements(coalesce(v_state #> '{wave,submissions}', '[]'::jsonb)) submission where submission #>> '{contributor,id}' = v_uid::text and submission->>'status' not in ('rejected','accepted')) >= 3 then raise exception 'wave_submission_limit' using errcode = '54000'; end if;
    select jsonb_build_object('id', p.id::text, 'name', coalesce(p.display_name, p.username, 'Membre'), 'avatarUrl', coalesce(p.avatar_url, p.profile_image_url, ''), 'role', coalesce(p.primary_role_key, 'Contributeur'), 'microphone', 'off', 'camera', 'off') into v_profile
    from public.profiles p where p.id = v_uid;
    v_item := jsonb_build_object(
      'id', gen_random_uuid()::text, 'contributor', coalesce(v_profile, jsonb_build_object('id', v_uid::text, 'name', 'Membre', 'avatarUrl', '', 'role', 'Contributeur', 'microphone', 'off', 'camera', 'off')),
      'title', p_payload->>'title', 'instrument', left(coalesce(p_payload->>'instrument','Autre'),80), 'bpm', (p_payload->>'bpm')::integer,
      'key', left(coalesce(p_payload->>'key','Non renseignée'),40), 'bars', (p_payload->>'bars')::integer,
      'durationSeconds', greatest(0, least(600, coalesce((p_payload->>'durationSeconds')::numeric,0))),
      'fileName', p_payload->>'fileName', 'fileSize', greatest(0, coalesce((p_payload->>'fileSize')::bigint,0)), 'mimeType', left(coalesce(p_payload->>'mimeType','audio/*'),100),
      'mediaPath', case when coalesce(p_payload->>'mediaPath','') like p_room_id::text || '/' || v_uid::text || '/%' then p_payload->>'mediaPath' else null end,
      'submittedAt', now(), 'status', 'received', 'rightsConfirmed', true, 'version', 1, 'privateNotes', '', 'creditPublic', coalesce((p_payload->>'creditPublic')::boolean,true),
      'versions', jsonb_build_array(jsonb_build_object('version',1,'receivedAt',now(),'note','Original'))
    );
    v_state := jsonb_set(v_state, '{wave,submissions}', jsonb_build_array(v_item) || coalesce(v_state #> '{wave,submissions}', '[]'::jsonb), true);
  elsif p_action = 'cage.vote.cast' and v_row.room_type = 'cage' then
    v_choice := p_payload->>'choice';
    if v_choice not in ('A','B') then raise exception 'cage_vote_invalid' using errcode = '22023'; end if;
    if not coalesce((v_state #>> '{cage,votingOpen}')::boolean,false) then raise exception 'cage_vote_closed' using errcode = '55000'; end if;
    if nullif(v_state #>> '{cage,votingEndsAt}', '') is not null and (v_state #>> '{cage,votingEndsAt}')::timestamptz <= now() then raise exception 'cage_vote_expired' using errcode = '55000'; end if;
    if (v_state #> '{cage,votes}') ? v_uid::text then raise exception 'cage_vote_already_cast' using errcode = '23505'; end if;
    v_state := jsonb_set(v_state, array['cage','votes',v_uid::text], to_jsonb(v_choice), true);
  elsif p_action = 'loge.question.add' and v_row.room_type = 'loge' then
    if not public.rooms_specialized_loge_eligible_v1(p_room_id, v_uid, v_state) then raise exception 'loge_access_required' using errcode = '42501'; end if;
    if not coalesce((v_state #>> '{loge,questionsOpen}')::boolean,false) then raise exception 'loge_questions_closed' using errcode = '55000'; end if;
    if length(trim(coalesce(p_payload->>'text',''))) not between 2 and 280 then raise exception 'loge_question_invalid' using errcode = '22023'; end if;
    select jsonb_build_object('id', p.id::text, 'name', coalesce(p.display_name, p.username, 'Membre VIP'), 'avatarUrl', coalesce(p.avatar_url, p.profile_image_url, ''), 'role', coalesce(p.primary_role_key, 'VIP'), 'microphone', 'off', 'camera', 'off') into v_profile
    from public.profiles p where p.id = v_uid;
    v_item := jsonb_build_object('id',gen_random_uuid()::text,'author',coalesce(v_profile,jsonb_build_object('id',v_uid::text,'name','Membre VIP','avatarUrl','','role','VIP','microphone','off','camera','off')),'text',trim(p_payload->>'text'),'status','pending','invited',false,'sentAt',now(),'supports',0);
    v_state := jsonb_set(v_state, '{loge,questions}', jsonb_build_array(v_item) || coalesce(v_state #> '{loge,questions}', '[]'::jsonb), true);
  elsif p_action = 'loge.moment.respond' and v_row.room_type = 'loge' then
    v_target := p_payload->>'momentId'; v_choice := case when coalesce((p_payload->>'accept')::boolean,false) then 'accepted' else 'declined' end;
    v_items := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_state #> '{loge,moments}', '[]'::jsonb)) loop
      if v_item->>'id' = v_target then
        v_found := true;
        if v_item #>> '{beneficiary,id}' <> v_uid::text or v_item->>'kind' <> 'face-to-face' then raise exception 'loge_face_to_face_forbidden' using errcode = '42501'; end if;
        if v_item->>'status' not in ('scheduled', v_choice) then raise exception 'loge_face_to_face_unavailable' using errcode = '55000'; end if;
        v_item := jsonb_set(v_item, '{status}', to_jsonb(v_choice), true);
      end if;
      v_items := v_items || jsonb_build_array(v_item);
    end loop;
    if not v_found then raise exception 'loge_face_to_face_not_found' using errcode = 'P0002'; end if;
    v_state := jsonb_set(v_state, '{loge,moments}', v_items, true);
  elsif p_action in ('scene.prompter.patch','scene.prompter.select','scene.prompter.marker') and v_row.room_type = 'scene' then
    if not exists (select 1 from public.room_participants_v2 p where p.room_id = p_room_id and p.user_id = v_uid and p.left_at is null and p.role in ('guest','artist')) then raise exception 'scene_prompter_forbidden' using errcode = '42501'; end if;
    if p_action = 'scene.prompter.patch' then
      v_state := jsonb_set(v_state, '{scene,prompter}', (v_state #> '{scene,prompter}') || (coalesce(p_payload->'patch','{}'::jsonb) - 'texts' - 'activeTextId' - 'controller'), true);
    elsif p_action = 'scene.prompter.select' then
      v_target := p_payload->>'textId';
      if not exists (select 1 from jsonb_array_elements(coalesce(v_state #> '{scene,prompter,texts}','[]'::jsonb)) t where t->>'id'=v_target and t->>'artistId'=v_uid::text) then raise exception 'scene_prompter_text_forbidden' using errcode = '42501'; end if;
      v_state := jsonb_set(v_state, '{scene,prompter,activeTextId}', to_jsonb(v_target), true);
    else
      v_target := p_payload->>'markerId';
      select (m->>'line')::integer into v_revision from jsonb_array_elements(coalesce(v_state #> '{scene,prompter,texts}','[]'::jsonb)) t cross join lateral jsonb_array_elements(coalesce(t->'markers','[]'::jsonb)) m where t->>'artistId'=v_uid::text and m->>'id'=v_target limit 1;
      if v_revision is null then raise exception 'scene_prompter_marker_forbidden' using errcode = '42501'; end if;
      v_state := jsonb_set(v_state, '{scene,prompter,line}', to_jsonb(v_revision), true);
    end if;
  else
    raise exception 'room_specialized_action_forbidden' using errcode = '42501';
  end if;

  v_revision := v_row.revision + 1;
  v_state := v_state || jsonb_build_object('revision',v_revision,'updatedAt',now());
  update public.room_specialized_state_v1 set state=v_state, revision=v_revision, updated_by=v_uid, updated_at=now() where room_id=p_room_id;
  insert into public.room_specialized_action_receipts_v1(room_id,user_id,idempotency_key,action,revision) values(p_room_id,v_uid,p_idempotency_key,p_action,v_revision);
  insert into public.room_specialized_state_signal_v1(room_id,room_type,revision) values(p_room_id,v_row.room_type,v_revision)
  on conflict(room_id) do update set revision=excluded.revision, room_type=excluded.room_type, updated_at=now();
  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_apply_specialized_viewer_action_v1(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.rooms_apply_specialized_viewer_action_v1(uuid, text, jsonb, uuid) to authenticated, service_role;

create index if not exists room_specialized_receipts_created_idx on public.room_specialized_action_receipts_v1(created_at);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_specialized_state_signal_v1'
  ) then
    alter publication supabase_realtime add table public.room_specialized_state_signal_v1;
  end if;
end $$;

comment on table public.room_specialized_state_v1 is 'Private authoritative state for specialized Rooms. Never expose this table to clients.';
comment on table public.room_specialized_state_signal_v1 is 'Public revision-only Realtime signal. Clients reload a role-projected state through RPC.';
