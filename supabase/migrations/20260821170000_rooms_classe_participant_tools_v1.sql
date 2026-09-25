begin;

-- La Classe keeps its mutable production state in room_specialized_state_v1.
-- Browsers never write that table directly: participant questions and their
-- supports use one narrow, idempotent RPC and publish the existing revision-only
-- Realtime signal.

-- The access sequencer writes its already-decided commercial/manual outcome
-- here. This is deliberately not an order, payment or subscription ledger.
-- Presence alone is never sufficient: room_participants_v2 is open to every
-- authenticated, non-banned Viewer and therefore cannot prove premium access.
create table if not exists public.room_classe_seat_entitlements_v1 (
  room_id uuid not null references public.rooms_v2(id) on delete cascade,
  seat_number smallint not null check (seat_number between 1 and 24),
  student_id uuid not null references auth.users(id) on delete cascade,
  access_kind text not null check (access_kind in (
    'premium_subscription', 'paid_seat', 'private_access', 'manual_grant'
  )),
  status text not null default 'active' check (status in ('active', 'revoked')),
  source_reference text,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (room_id, seat_number),
  check (source_reference is null or char_length(source_reference) between 1 and 256),
  check (
    (access_kind = 'manual_grant' and granted_by is not null)
    or
    (access_kind <> 'manual_grant' and nullif(btrim(source_reference), '') is not null)
  ),
  check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index if not exists room_classe_seat_entitlements_v1_active_student_idx
  on public.room_classe_seat_entitlements_v1(room_id, student_id)
  where status = 'active';

create index if not exists room_classe_seat_entitlements_v1_student_idx
  on public.room_classe_seat_entitlements_v1(student_id, status, room_id);

alter table public.room_classe_seat_entitlements_v1 enable row level security;
alter table public.room_classe_seat_entitlements_v1 force row level security;
revoke all on table public.room_classe_seat_entitlements_v1
  from public, anon, authenticated, service_role;

create or replace function public.rooms_classe_uuid_text_v1(p_value text)
returns uuid
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select case
    when btrim(p_value) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then btrim(p_value)::uuid
    else null
  end;
$$;

revoke all on function public.rooms_classe_uuid_text_v1(text)
  from public, anon, authenticated, service_role;

create or replace function public.rooms_classe_has_entitlement_v1(
  p_room_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select p_room_id is not null
    and p_student_id is not null
    and exists (
      select 1
      from public.room_classe_seat_entitlements_v1 entitlement
      join public.rooms_v2 room on room.id = entitlement.room_id
      join public.room_specialized_state_v1 specialized
        on specialized.room_id = room.id
       and specialized.room_type = 'classe'
      where entitlement.room_id = p_room_id
        and entitlement.student_id = p_student_id
        and entitlement.status = 'active'
        and room.type = 'place'
        and room.status = 'live'
        and room.host_id <> p_student_id
        and not public.rooms_live_call_room_access_revoked_v1(
          room.id,
          p_student_id
        )
    );
$$;

revoke all on function public.rooms_classe_has_entitlement_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rooms_classe_active_seat_v1(
  p_room_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.rooms_classe_has_entitlement_v1(p_room_id, p_student_id)
    and exists (
      select 1
      from public.room_participants_v2 participant
      where participant.room_id = p_room_id
        and participant.user_id = p_student_id
        and participant.role = 'viewer'
        and participant.left_at is null
    );
$$;

revoke all on function public.rooms_classe_active_seat_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Rebuild every identity-bearing Classe field from grants and Profiles. The
-- caller may preserve runtime flags, but never a seat number, identity or
-- access label supplied by a browser fixture/commit.
create or replace function public.rooms_project_classe_seats_v1(
  p_room_id uuid,
  p_state jsonb,
  p_user_id uuid,
  p_control boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_classe jsonb;
  v_old_seats jsonb;
  v_old_raised jsonb;
  v_seats jsonb := '[]'::jsonb;
  v_people jsonb := '[]'::jsonb;
  v_raised jsonb := '[]'::jsonb;
  v_public_seats jsonb := '[]'::jsonb;
  v_public_people jsonb := '[]'::jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_question jsonb;
  v_supporters jsonb;
  v_supporter jsonb;
  v_question_id uuid;
  v_author_id uuid;
  v_supporter_id uuid;
  v_featured_id uuid;
  v_number integer;
  v_entitlement record;
  v_old_seat jsonb;
  v_old_hand jsonb;
  v_person jsonb;
  v_public_person jsonb;
  v_host_person jsonb;
  v_seat jsonb;
  v_present boolean;
  v_hand_raised boolean;
  v_can_speak boolean;
  v_can_share boolean;
  v_status text;
  v_microphone text;
  v_camera text;
  v_access_label text;
  v_public_call_student_id uuid;
  v_active_speaker_id uuid;
  v_private_student_id uuid;
  v_screen_owner_id uuid;
begin
  v_classe := case
    when jsonb_typeof(v_state->'classe') = 'object' then v_state->'classe'
    else '{}'::jsonb
  end;
  v_old_seats := case
    when jsonb_typeof(v_classe->'seats') = 'array' then v_classe->'seats'
    else '[]'::jsonb
  end;
  v_old_raised := case
    when jsonb_typeof(v_classe->'raisedHands') = 'array' then v_classe->'raisedHands'
    else '[]'::jsonb
  end;
  -- Audio mode is reconstructed from the accepted server-side transport, not
  -- from reducer intent. This also restores the correct marker after reload.
  select invitation.contact_profile_id into v_private_student_id
  from public.room_live_call_invitations_v1 invitation
  where invitation.room_id = p_room_id
    and invitation.authority_kind = 'classe-seat'
    and invitation.status = 'accepted'
    and invitation.call_mode = 'private'
    and public.rooms_classe_active_seat_v1(
      invitation.room_id,
      invitation.contact_profile_id
    )
  order by invitation.accepted_at desc, invitation.id desc
  limit 1;
  select invitation.contact_profile_id into v_active_speaker_id
  from public.room_live_call_invitations_v1 invitation
  where invitation.room_id = p_room_id
    and invitation.authority_kind = 'classe-seat'
    and invitation.status = 'accepted'
    and invitation.call_mode = 'public'
    and invitation.route_mode = 'public'
    and invitation.is_on_air
    and public.rooms_classe_active_seat_v1(
      invitation.room_id,
      invitation.contact_profile_id
    )
  order by invitation.accepted_at desc, invitation.id desc
  limit 1;
  select invitation.contact_profile_id into v_public_call_student_id
  from public.room_live_call_invitations_v1 invitation
  where invitation.room_id = p_room_id
    and invitation.authority_kind = 'classe-seat'
    and invitation.status = 'accepted'
    and invitation.call_mode = 'public'
    and public.rooms_classe_active_seat_v1(
      invitation.room_id,
      invitation.contact_profile_id
    )
  order by invitation.accepted_at desc, invitation.id desc
  limit 1;
  if not p_control
     and p_user_id is distinct from v_private_student_id then
    v_private_student_id := null;
  end if;
  if not p_control
     and p_user_id is distinct from v_public_call_student_id then
    v_public_call_student_id := null;
  end if;
  v_screen_owner_id := public.rooms_classe_uuid_text_v1(
    v_classe->>'screenShareOwnerId'
  );

  for v_number in 1..24 loop
    select
      entitlement.student_id,
      entitlement.access_kind,
      profile.display_name,
      profile.full_name,
      profile.username,
      profile.avatar_url,
      profile.profile_image_url,
      profile.primary_role_key
    into v_entitlement
    from public.room_classe_seat_entitlements_v1 entitlement
    left join public.profiles profile on profile.id = entitlement.student_id
    where entitlement.room_id = p_room_id
      and entitlement.seat_number = v_number
      and entitlement.status = 'active';

    if not found then
      v_seats := v_seats || jsonb_build_array(jsonb_build_object(
        'number', v_number,
        'status', 'free',
        'canSpeak', false,
        'canShareScreen', false,
        'handRaised', false
      ));
      continue;
    end if;

    v_old_seat := null;
    select seat.value into v_old_seat
    from jsonb_array_elements(v_old_seats) seat
    where public.rooms_classe_uuid_text_v1(seat.value #>> '{person,id}')
      = v_entitlement.student_id
    limit 1;
    v_old_seat := coalesce(v_old_seat, '{}'::jsonb);

    v_present := exists (
      select 1
      from public.room_participants_v2 participant
      where participant.room_id = p_room_id
        and participant.user_id = v_entitlement.student_id
        and participant.role = 'viewer'
        and participant.left_at is null
    ) and not public.rooms_live_call_room_access_revoked_v1(
      p_room_id,
      v_entitlement.student_id
    );

    v_old_hand := null;
    select hand.value into v_old_hand
    from jsonb_array_elements(v_old_raised) hand
    where public.rooms_classe_uuid_text_v1(hand.value->>'personId')
      = v_entitlement.student_id
    limit 1;
    v_hand_raised := v_present and (
      v_old_hand is not null
      or case
        when jsonb_typeof(v_old_seat->'handRaised') = 'boolean'
          then (v_old_seat->>'handRaised')::boolean
        else false
      end
    );
    v_can_speak := v_present and case
      when jsonb_typeof(v_old_seat->'canSpeak') = 'boolean'
        then (v_old_seat->>'canSpeak')::boolean
      else false
    end;
    v_can_share := v_present and case
      when jsonb_typeof(v_old_seat->'canShareScreen') = 'boolean'
        then (v_old_seat->>'canShareScreen')::boolean
      else false
    end;

    if not v_present then
      v_status := 'disconnected';
      v_can_speak := false;
      v_can_share := false;
      v_hand_raised := false;
    elsif coalesce(v_old_seat->>'status', '') = 'suspended' then
      v_status := 'suspended';
      v_can_speak := false;
      v_can_share := false;
      v_hand_raised := false;
    elsif v_private_student_id = v_entitlement.student_id then
      v_status := 'private';
    elsif v_active_speaker_id = v_entitlement.student_id or v_can_speak then
      v_status := 'speaking';
      v_can_speak := true;
    elsif v_hand_raised then
      v_status := 'hand-raised';
    elsif coalesce(v_old_seat->>'status', '') in ('connected', 'listening', 'muted') then
      v_status := v_old_seat->>'status';
    else
      v_status := 'listening';
    end if;

    v_microphone := case
      when not v_present then 'off'
      when v_old_seat #>> '{person,microphone}' in ('ready', 'muted', 'off')
        then v_old_seat #>> '{person,microphone}'
      else 'ready'
    end;
    v_camera := case
      when not v_present then 'off'
      when v_old_seat #>> '{person,camera}' in ('ready', 'off')
        then v_old_seat #>> '{person,camera}'
      else 'off'
    end;
    v_access_label := case v_entitlement.access_kind
      when 'premium_subscription' then 'Premium'
      when 'paid_seat' then 'Payant'
      when 'private_access' then 'Invité privé'
      else 'Accordé manuellement'
    end;
    v_person := jsonb_build_object(
      'id', v_entitlement.student_id::text,
      'name', coalesce(
        nullif(v_entitlement.display_name, ''),
        nullif(v_entitlement.full_name, ''),
        nullif(v_entitlement.username, ''),
        'Élève'
      ),
      'avatarUrl', coalesce(
        v_entitlement.avatar_url,
        v_entitlement.profile_image_url,
        ''
      ),
      'role', coalesce(nullif(v_entitlement.primary_role_key, ''), 'Élève'),
      'microphone', v_microphone,
      'camera', v_camera,
      'place', v_number,
      'access', v_access_label
    );
    if not p_control then
      v_person := v_person - 'access';
    end if;
    v_seat := jsonb_build_object(
      'number', v_number,
      'person', v_person,
      'status', v_status,
      'canSpeak', v_can_speak,
      'canShareScreen', v_can_share,
      'handRaised', v_hand_raised
    );
    v_seats := v_seats || jsonb_build_array(v_seat);
    v_people := v_people || jsonb_build_array(v_person);
    if v_hand_raised then
      v_raised := v_raised || jsonb_build_array(coalesce(
        v_old_hand,
        jsonb_build_object(
          'personId', v_entitlement.student_id::text,
          'raisedAt', now()
        )
      ));
    end if;
  end loop;

  if v_active_speaker_id is not null
     and not public.rooms_classe_active_seat_v1(
       p_room_id,
       v_active_speaker_id
     ) then
    v_active_speaker_id := null;
  end if;
  if v_public_call_student_id is not null
     and not public.rooms_classe_active_seat_v1(
       p_room_id,
       v_public_call_student_id
     ) then
    v_public_call_student_id := null;
  end if;
  if v_private_student_id is not null
     and not public.rooms_classe_active_seat_v1(
       p_room_id,
       v_private_student_id
     ) then
    v_private_student_id := null;
  end if;
  if v_screen_owner_id is not null
     and not exists (
       select 1 from public.rooms_v2 room
       where room.id = p_room_id and room.host_id = v_screen_owner_id
     )
     and not public.rooms_classe_active_seat_v1(
       p_room_id,
       v_screen_owner_id
     ) then
    v_screen_owner_id := null;
  end if;

  -- Only server-shaped UUID questions survive initialization. This removes
  -- the six class-question-* investor fixtures while retaining real history
  -- after a student later disconnects or loses an entitlement.
  for v_question in
    select question.value
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_classe->'questions') = 'array'
          then v_classe->'questions'
        else '[]'::jsonb
      end
    ) question
  loop
    v_question_id := public.rooms_classe_uuid_text_v1(v_question->>'id');
    v_author_id := public.rooms_classe_uuid_text_v1(
      v_question #>> '{author,id}'
    );
    if v_question_id is null
       or v_author_id is null
       or coalesce(v_question->>'status', '') not in (
         'pending', 'displayed', 'answered'
       )
       or char_length(btrim(coalesce(v_question->>'text', ''))) not between 2 and 280
       or not exists (
         select 1 from public.profiles profile where profile.id = v_author_id
       ) then
      continue;
    end if;

    v_supporters := '[]'::jsonb;
    for v_supporter in
      select supporter.value
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_question->'supporterIds') = 'array'
            then v_question->'supporterIds'
          else '[]'::jsonb
        end
      ) supporter
    loop
      v_supporter_id := public.rooms_classe_uuid_text_v1(
        v_supporter #>> '{}'
      );
      if v_supporter_id is not null
         and v_supporter_id <> v_author_id
         and not (v_supporters ? v_supporter_id::text)
         and exists (
           select 1 from public.profiles profile
           where profile.id = v_supporter_id
         ) then
        v_supporters := v_supporters || jsonb_build_array(v_supporter_id::text);
      end if;
    end loop;
    select jsonb_build_object(
      'id', profile.id::text,
      'name', coalesce(
        nullif(profile.display_name, ''),
        nullif(profile.full_name, ''),
        nullif(profile.username, ''),
        'Élève'
      ),
      'avatarUrl', coalesce(profile.avatar_url, profile.profile_image_url, ''),
      'role', coalesce(nullif(profile.primary_role_key, ''), 'Élève'),
      'microphone', case
        when public.rooms_classe_active_seat_v1(p_room_id, profile.id)
          then 'ready'
        else 'off'
      end,
      'camera', 'off'
    ) into v_person
    from public.profiles profile
    where profile.id = v_author_id;
    v_question := v_question || jsonb_build_object(
      'id', v_question_id::text,
      'author', v_person,
      'text', btrim(v_question->>'text'),
      'status', v_question->>'status',
      'supports', jsonb_array_length(v_supporters),
      'supporterIds', v_supporters
    );
    v_questions := v_questions || jsonb_build_array(v_question);
  end loop;

  v_featured_id := public.rooms_classe_uuid_text_v1(
    v_classe->>'featuredQuestionId'
  );
  if v_featured_id is not null
     and not exists (
       select 1 from jsonb_array_elements(v_questions) question
       where question.value->>'id' = v_featured_id::text
     ) then
    v_featured_id := null;
  end if;

  -- A public Viewer may watch the lesson, but a private entitlement must not
  -- become an anonymous roster API. Keep only the public Host, the current
  -- server-authorized on-air speaker and anonymous occupied-seat placeholders.
  -- Hand, presence-mode and screen-owner identities remain control/seat-only.
  if not p_control
     and not public.rooms_classe_active_seat_v1(p_room_id, p_user_id) then
    select jsonb_build_object(
      'id', room.host_id::text,
      'name', coalesce(
        nullif(profile.display_name, ''),
        nullif(profile.full_name, ''),
        nullif(profile.username, ''),
        'Professeur'
      ),
      'avatarUrl', coalesce(profile.avatar_url, profile.profile_image_url, ''),
      'role', 'Professeur',
      'microphone', 'ready',
      'camera', 'off'
    ) into v_host_person
    from public.rooms_v2 room
    left join public.profiles profile on profile.id = room.host_id
    where room.id = p_room_id;

    if v_host_person is not null then
      v_public_people := jsonb_build_array(v_host_person);
    end if;
    for v_seat in
      select seat.value from jsonb_array_elements(v_seats) seat
    loop
      if v_active_speaker_id is not null
         and v_seat #>> '{person,id}' = v_active_speaker_id::text then
        v_public_person := public.rooms_specialized_strip_person_v1(
          v_seat->'person'
        );
        v_public_seats := v_public_seats || jsonb_build_array(
          jsonb_set(
            jsonb_set(
              jsonb_set(v_seat, '{canSpeak}', 'false'::jsonb, true),
              '{canShareScreen}', 'false'::jsonb, true
            ),
            '{handRaised}', 'false'::jsonb, true
          )
        );
        v_public_people := v_public_people || jsonb_build_array(v_public_person);
      elsif v_seat ? 'person'
            and coalesce(v_seat->>'status', '') not in (
              'disconnected', 'absent', 'suspended'
            ) then
        v_public_person := jsonb_build_object(
          'id', 'classe-public-seat-' || (v_seat->>'number'),
          'name', 'Élève',
          'avatarUrl', '/avatars/utilisateur.png',
          'role', 'Élève',
          'microphone', 'off',
          'camera', 'off',
          'place', (v_seat->>'number')::integer
        );
        v_public_seats := v_public_seats || jsonb_build_array(
          jsonb_build_object(
            'number', (v_seat->>'number')::integer,
            'person', v_public_person,
            'status', 'listening',
            'canSpeak', false,
            'canShareScreen', false,
            'handRaised', false
          )
        );
      else
        v_public_seats := v_public_seats || jsonb_build_array(
          jsonb_build_object(
            'number', (v_seat->>'number')::integer,
            'status', 'free',
            'canSpeak', false,
            'canShareScreen', false,
            'handRaised', false
          )
        );
      end if;
    end loop;
    v_people := v_public_people;
    v_seats := v_public_seats;
    v_raised := '[]'::jsonb;
    v_screen_owner_id := null;
  end if;

  v_classe := jsonb_set(v_classe, '{people}', v_people, true);
  v_classe := jsonb_set(v_classe, '{seats}', v_seats, true);
  v_classe := jsonb_set(v_classe, '{raisedHands}', v_raised, true);
  v_classe := jsonb_set(
    v_classe,
    '{publicCallStudentId}',
    coalesce(to_jsonb(v_public_call_student_id::text), 'null'::jsonb),
    true
  );
  v_classe := jsonb_set(
    v_classe,
    '{activeSpeakerId}',
    coalesce(to_jsonb(v_active_speaker_id::text), 'null'::jsonb),
    true
  );
  v_classe := jsonb_set(
    v_classe,
    '{privateTalkStudentId}',
    coalesce(to_jsonb(v_private_student_id::text), 'null'::jsonb),
    true
  );
  v_classe := jsonb_set(
    v_classe,
    '{screenShareOwnerId}',
    coalesce(to_jsonb(v_screen_owner_id::text), 'null'::jsonb),
    true
  );
  v_classe := jsonb_set(v_classe, '{questions}', v_questions, true);
  v_classe := jsonb_set(
    v_classe,
    '{featuredQuestionId}',
    coalesce(to_jsonb(v_featured_id::text), 'null'::jsonb),
    true
  );
  return jsonb_set(v_state, '{classe}', v_classe, true);
end;
$$;

revoke all on function public.rooms_project_classe_seats_v1(uuid, jsonb, uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.rooms_sanitize_classe_state_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.room_type = 'classe' then
    if tg_op = 'INSERT' then
      new.state := jsonb_set(new.state, '{classe,people}', '[]'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,seats}', '[]'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,raisedHands}', '[]'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,publicCallStudentId}', 'null'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,activeSpeakerId}', 'null'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,privateTalkStudentId}', 'null'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,screenShareOwnerId}', 'null'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,questions}', '[]'::jsonb, true);
      new.state := jsonb_set(new.state, '{classe,featuredQuestionId}', 'null'::jsonb, true);
    end if;
    new.state := public.rooms_project_classe_seats_v1(
      new.room_id,
      new.state,
      null,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_sanitize_classe_state_v1
  on public.room_specialized_state_v1;
create trigger rooms_sanitize_classe_state_v1
before insert or update of room_type, state
on public.room_specialized_state_v1
for each row execute function public.rooms_sanitize_classe_state_v1();

revoke all on function public.rooms_sanitize_classe_state_v1()
  from public, anon, authenticated, service_role;

create or replace function public.rooms_sync_classe_state_v1(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_row public.room_specialized_state_v1%rowtype;
  v_state jsonb;
  v_revision bigint;
begin
  if p_room_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:specialized:' || p_room_id::text,
    0
  ));
  select specialized.* into v_row
  from public.room_specialized_state_v1 specialized
  where specialized.room_id = p_room_id
  for update;
  if not found or v_row.room_type <> 'classe' then return false; end if;

  v_state := public.rooms_project_classe_seats_v1(
    p_room_id,
    v_row.state,
    null,
    true
  );
  if (v_state - 'revision' - 'updatedAt')
     = (v_row.state - 'revision' - 'updatedAt') then
    return false;
  end if;

  v_revision := v_row.revision + 1;
  v_state := v_state || jsonb_build_object(
    'revision', v_revision,
    'updatedAt', now()
  );
  update public.room_specialized_state_v1
  set state = v_state,
      revision = v_revision,
      updated_at = now()
  where room_id = p_room_id;
  insert into public.room_specialized_state_signal_v1(
    room_id,
    room_type,
    revision
  ) values (
    p_room_id,
    'classe',
    v_revision
  )
  on conflict (room_id) do update
  set room_type = excluded.room_type,
      revision = excluded.revision,
      updated_at = now();
  return true;
end;
$$;

revoke all on function public.rooms_sync_classe_state_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rooms_sync_classe_state_from_entitlement_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_room_id uuid := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
begin
  perform public.rooms_sync_classe_state_v1(v_room_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_sync_classe_state_from_entitlement_v1
  on public.room_classe_seat_entitlements_v1;
create trigger rooms_sync_classe_state_from_entitlement_v1
after insert or update or delete
on public.room_classe_seat_entitlements_v1
for each row execute function public.rooms_sync_classe_state_from_entitlement_v1();

create or replace function public.rooms_sync_classe_state_from_presence_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_old_room_id uuid := case when tg_op = 'INSERT' then null else old.room_id end;
  v_new_room_id uuid := case when tg_op = 'DELETE' then null else new.room_id end;
begin
  if v_old_room_id is not null then
    perform public.rooms_sync_classe_state_v1(v_old_room_id);
  end if;
  if v_new_room_id is not null and v_new_room_id is distinct from v_old_room_id then
    perform public.rooms_sync_classe_state_v1(v_new_room_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_sync_classe_state_from_presence_v1
  on public.room_participants_v2;
create trigger rooms_sync_classe_state_from_presence_v1
after insert or update of room_id, user_id, role, left_at or delete
on public.room_participants_v2
for each row execute function public.rooms_sync_classe_state_from_presence_v1();

create or replace function public.rooms_sync_classe_state_from_profile_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_student_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_room record;
begin
  for v_room in
    select distinct entitlement.room_id
    from public.room_classe_seat_entitlements_v1 entitlement
    where entitlement.student_id = v_student_id
      and entitlement.status = 'active'
  loop
    perform public.rooms_sync_classe_state_v1(v_room.room_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_sync_classe_state_from_profile_v1
  on public.profiles;
create trigger rooms_sync_classe_state_from_profile_v1
after insert or update of display_name, full_name, username, avatar_url,
  profile_image_url, primary_role_key or delete
on public.profiles
for each row execute function public.rooms_sync_classe_state_from_profile_v1();

revoke all on function public.rooms_sync_classe_state_from_entitlement_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_sync_classe_state_from_presence_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_sync_classe_state_from_profile_v1()
  from public, anon, authenticated, service_role;

-- Trusted access-sequencer ingress. Paid/subscription/private access must
-- carry an opaque reference owned by that upstream system. This RPC records
-- only its authorization decision and never accepts price/payment assertions.
create or replace function public.rooms_upsert_classe_seat_entitlement_v1(
  p_room_id uuid,
  p_seat_number integer,
  p_student_id uuid,
  p_access_kind text,
  p_source_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_room public.rooms_v2%rowtype;
  v_entitlement public.room_classe_seat_entitlements_v1%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_room_id is null
     or p_seat_number is null
     or p_seat_number not between 1 and 24
     or p_student_id is null
     or p_access_kind is null
     or p_access_kind not in (
       'premium_subscription', 'paid_seat', 'private_access'
     )
     or char_length(btrim(coalesce(p_source_reference, ''))) not between 1 and 256 then
    raise exception using errcode = '22023', message = 'classe_entitlement_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'meewav:rooms:program-transition:' || p_room_id::text,
    0
  ));
  select room.* into v_room
  from public.rooms_v2 room
  where room.id = p_room_id
    and room.type = 'place'
    and room.status <> 'ended'
  for update;
  if not found or v_room.host_id = p_student_id then
    raise exception using errcode = '42501', message = 'classe_entitlement_forbidden';
  end if;
  if not exists (
    select 1 from auth.users account where account.id = p_student_id
  ) then
    raise exception using errcode = 'P0002', message = 'classe_student_not_found';
  end if;

  update public.room_classe_seat_entitlements_v1 entitlement
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  where entitlement.room_id = p_room_id
    and entitlement.student_id = p_student_id
    and entitlement.seat_number <> p_seat_number
    and entitlement.status = 'active';

  insert into public.room_classe_seat_entitlements_v1(
    room_id,
    seat_number,
    student_id,
    access_kind,
    status,
    source_reference,
    granted_by,
    revoked_at,
    updated_at
  ) values (
    p_room_id,
    p_seat_number,
    p_student_id,
    p_access_kind,
    'active',
    btrim(p_source_reference),
    null,
    null,
    now()
  )
  on conflict (room_id, seat_number) do update
  set student_id = excluded.student_id,
      access_kind = excluded.access_kind,
      status = 'active',
      source_reference = excluded.source_reference,
      granted_by = null,
      revoked_at = null,
      updated_at = now()
  returning * into v_entitlement;

  return jsonb_build_object(
    'roomId', v_entitlement.room_id,
    'seatNumber', v_entitlement.seat_number,
    'studentId', v_entitlement.student_id,
    'accessKind', v_entitlement.access_kind,
    'status', v_entitlement.status
  );
end;
$$;

revoke all on function public.rooms_upsert_classe_seat_entitlement_v1(
  uuid, integer, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.rooms_upsert_classe_seat_entitlement_v1(
  uuid, integer, uuid, text, text
) to service_role;

create or replace function public.rooms_revoke_classe_seat_entitlement_v1(
  p_room_id uuid,
  p_seat_number integer,
  p_source_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_entitlement public.room_classe_seat_entitlements_v1%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_room_id is null
     or p_seat_number is null
     or p_seat_number not between 1 and 24
     or char_length(btrim(coalesce(p_source_reference, ''))) not between 1 and 256 then
    raise exception using errcode = '22023', message = 'classe_entitlement_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'meewav:rooms:program-transition:' || p_room_id::text,
    0
  ));
  update public.room_classe_seat_entitlements_v1 entitlement
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  where entitlement.room_id = p_room_id
    and entitlement.seat_number = p_seat_number
    and entitlement.status = 'active'
    and entitlement.source_reference = btrim(p_source_reference)
  returning * into v_entitlement;
  return jsonb_build_object(
    'roomId', p_room_id,
    'seatNumber', p_seat_number,
    'status', case when v_entitlement.room_id is null then 'unchanged' else 'revoked' end
  );
end;
$$;

revoke all on function public.rooms_revoke_classe_seat_entitlement_v1(
  uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.rooms_revoke_classe_seat_entitlement_v1(
  uuid, integer, text
) to service_role;

-- Manual access is the only entitlement a browser may create. It is host-only,
-- references a real auth account, and may be assigned before that student is
-- present; the seat remains disconnected until a canonical Viewer joins.
create or replace function public.rooms_set_classe_manual_seat_v1(
  p_room_id uuid,
  p_seat_number integer,
  p_student_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_host_id uuid := auth.uid();
  v_room public.rooms_v2%rowtype;
begin
  if v_host_id is null
     or p_room_id is null
     or p_seat_number is null
     or p_seat_number not between 1 and 24 then
    raise exception using errcode = '22023', message = 'classe_manual_seat_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'meewav:rooms:program-transition:' || p_room_id::text,
    0
  ));
  select room.* into v_room
  from public.rooms_v2 room
  where room.id = p_room_id
    and room.host_id = v_host_id
    and room.type = 'place'
    and room.status = 'live'
  for update;
  if not found or not exists (
    select 1
    from public.room_specialized_state_v1 specialized
    where specialized.room_id = p_room_id
      and specialized.room_type = 'classe'
  ) then
    raise exception using errcode = '42501', message = 'classe_manual_seat_host_required';
  end if;

  if p_student_id is null then
    update public.room_classe_seat_entitlements_v1 entitlement
    set status = 'revoked',
        revoked_at = now(),
        updated_at = now()
    where entitlement.room_id = p_room_id
      and entitlement.seat_number = p_seat_number
      and entitlement.access_kind = 'manual_grant'
      and entitlement.status = 'active';
    return public.rooms_get_specialized_state_v1(p_room_id);
  end if;

  if p_student_id = v_host_id
     or not exists (
       select 1 from auth.users account where account.id = p_student_id
     )
     or exists (
       select 1 from public.room_bans_v2 ban
       where ban.room_id = p_room_id and ban.user_id = p_student_id
     )
     or public.messaging_profiles_blocked_v1(v_host_id, p_student_id) then
    raise exception using errcode = '42501', message = 'classe_manual_student_unavailable';
  end if;

  if exists (
    select 1
    from public.room_classe_seat_entitlements_v1 entitlement
    where entitlement.room_id = p_room_id
      and entitlement.status = 'active'
      and entitlement.access_kind <> 'manual_grant'
      and (
        entitlement.seat_number = p_seat_number
        or entitlement.student_id = p_student_id
      )
  ) then
    raise exception using errcode = '42501', message = 'classe_commercial_seat_immutable';
  end if;

  update public.room_classe_seat_entitlements_v1 entitlement
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  where entitlement.room_id = p_room_id
    and entitlement.student_id = p_student_id
    and entitlement.seat_number <> p_seat_number
    and entitlement.access_kind = 'manual_grant'
    and entitlement.status = 'active';

  insert into public.room_classe_seat_entitlements_v1(
    room_id,
    seat_number,
    student_id,
    access_kind,
    status,
    source_reference,
    granted_by,
    revoked_at,
    updated_at
  ) values (
    p_room_id,
    p_seat_number,
    p_student_id,
    'manual_grant',
    'active',
    null,
    v_host_id,
    null,
    now()
  )
  on conflict (room_id, seat_number) do update
  set student_id = excluded.student_id,
      access_kind = 'manual_grant',
      status = 'active',
      source_reference = null,
      granted_by = v_host_id,
      revoked_at = null,
      updated_at = now();

  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_set_classe_manual_seat_v1(
  uuid, integer, uuid
) from public, anon;
grant execute on function public.rooms_set_classe_manual_seat_v1(
  uuid, integer, uuid
) to authenticated;

-- Preserve the broad specialized viewer implementation while putting the
-- same entitlement + Viewer-presence gate in front of the legacy Classe hand
-- actions. The renamed implementation remains internal.
alter function public.rooms_apply_specialized_viewer_action_v1(
  uuid, text, jsonb, uuid
) rename to rooms_apply_specialized_viewer_action_base_v1;

revoke all on function public.rooms_apply_specialized_viewer_action_base_v1(
  uuid, text, jsonb, uuid
) from public, anon, authenticated, service_role;

create or replace function public.rooms_apply_specialized_viewer_action_v1(
  p_room_id uuid,
  p_action text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_action in (
    'classe.hand.raise',
    'classe.hand.lower-own',
    'classe.speaker.end-own'
  ) and not public.rooms_classe_active_seat_v1(p_room_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'classe_seat_required';
  end if;
  return public.rooms_apply_specialized_viewer_action_base_v1(
    p_room_id,
    p_action,
    p_payload,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.rooms_apply_specialized_viewer_action_v1(
  uuid, text, jsonb, uuid
) from public, anon;
grant execute on function public.rooms_apply_specialized_viewer_action_v1(
  uuid, text, jsonb, uuid
) to authenticated, service_role;

create or replace function public.rooms_project_classe_questions_v1(
  p_state jsonb,
  p_room_type text,
  p_user_id uuid,
  p_control boolean default false,
  p_participant boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_questions jsonb := '[]'::jsonb;
  v_question jsonb;
  v_supporters jsonb;
  v_uid text := coalesce(p_user_id::text, '');
begin
  if p_room_type <> 'classe' or (v_state #> '{classe}') is null then
    return v_state;
  end if;

  for v_question in
    select value
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_state #> '{classe,questions}') = 'array'
          then v_state #> '{classe,questions}'
        else '[]'::jsonb
      end
    )
  loop
    if jsonb_typeof(v_question) = 'object'
       and (
         p_control
         or p_participant
         or v_question #>> '{author,id}' = v_uid
         or coalesce(v_question->>'status', '') in ('displayed', 'answered')
       ) then
      if not p_control then
        if jsonb_typeof(v_question->'author') = 'object' then
          v_question := jsonb_set(
            v_question,
            '{author}',
            public.rooms_specialized_strip_person_v1(v_question->'author'),
            true
          );
        end if;
        v_supporters := case
          when jsonb_typeof(v_question->'supporterIds') = 'array'
            then v_question->'supporterIds'
          else '[]'::jsonb
        end;
        v_question := jsonb_set(
          v_question,
          '{supporterIds}',
          case
            when v_uid <> '' and v_supporters ? v_uid
              then jsonb_build_array(v_uid)
            else '[]'::jsonb
          end,
          true
        );
      end if;
      v_questions := v_questions || jsonb_build_array(v_question);
    end if;
  end loop;

  return jsonb_set(v_state, '{classe,questions}', v_questions, true);
end;
$$;

revoke all on function public.rooms_project_classe_questions_v1(jsonb, text, uuid, boolean, boolean)
  from public, anon, authenticated, service_role;

-- Keep the latest Loge v3 projection in place, then add the Classe question
-- privacy projection. A non-control caller sees the public support count and
-- only their own supporter id, never the identities of the other supporters.
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
  v_classe_seat_number smallint;
  v_classe_access_kind text;
  v_actor_role text;
begin
  select room.status into v_room_status
  from public.rooms_v2 room
  where room.id = p_room_id;
  if not found or v_room_status not in ('live', 'ended') then return null; end if;

  select * into v_row
  from public.room_specialized_state_v1 specialized
  where specialized.room_id = p_room_id;
  if not found then return null; end if;
  if exists (
    select 1 from public.room_bans_v2 ban
    where ban.room_id = p_room_id and ban.user_id = v_uid
  ) then
    raise exception 'room_specialized_access_revoked' using errcode = '42501';
  end if;

  v_control := public.rooms_specialized_is_control_v1(p_room_id, v_uid);
  if not v_control and v_row.room_type = 'scene' and v_uid is not null then
    v_artist := exists (
      select 1 from public.room_participants_v2 participant
      where participant.room_id = p_room_id
        and participant.user_id = v_uid
        and participant.left_at is null
        and participant.role in ('guest', 'artist')
    );
  end if;
  if v_row.room_type = 'classe'
     and public.rooms_classe_active_seat_v1(p_room_id, v_uid) then
    select entitlement.seat_number, entitlement.access_kind
    into v_classe_seat_number, v_classe_access_kind
    from public.room_classe_seat_entitlements_v1 entitlement
    where entitlement.room_id = p_room_id
      and entitlement.student_id = v_uid
      and entitlement.status = 'active';
  end if;
  v_actor_role := case
    when v_uid is null then 'visitor'
    when exists (
      select 1 from public.rooms_v2 room
      where room.id = p_room_id and room.host_id = v_uid
    ) then 'host'
    when v_control then 'regisseur'
    when v_classe_seat_number is not null then 'premium_participant'
    else 'viewer'
  end;
  if v_row.room_type = 'classe' then
    v_eligible := v_control or v_classe_seat_number is not null;
  else
    v_eligible := v_control or (
      v_uid is not null
      and (
        v_row.room_type <> 'loge'
        or public.rooms_specialized_loge_eligible_v1(
          p_room_id,
          v_uid,
          v_row.state
        )
      )
    );
  end if;

  v_projected := public.rooms_specialized_project_state_v3(
    v_row.state,
    v_row.room_type,
    v_uid,
    v_control,
    v_artist,
    v_room_status
  );
  if v_row.room_type = 'classe' then
    v_projected := public.rooms_project_classe_seats_v1(
      p_room_id,
      v_projected,
      v_uid,
      v_control
    );
  end if;
  v_projected := public.rooms_project_classe_questions_v1(
    v_projected,
    v_row.room_type,
    v_uid,
    v_control,
    v_classe_seat_number is not null
  );
  if v_row.room_type = 'loge' and not v_eligible then
    v_projected := jsonb_set(v_projected, '{loge,preview}', jsonb_build_object(
      'title', 'Accès privé',
      'description', '',
      'mediaName', '',
      'mediaPath', null,
      'playing', false,
      'replayIncluded', false,
      'liveOnly', true,
      'expiresAt', null,
      'durationSeconds', null,
      'channels', null,
      'sampleRate', null,
      'waveformPeaks', '[]'::jsonb
    ), true);
    v_projected := jsonb_set(v_projected, '{loge,questionsOpen}', 'false'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,questions}', '[]'::jsonb, true);
    v_projected := jsonb_set(v_projected, '{loge,moments}', '[]'::jsonb, true);
  end if;
  return jsonb_set(
    v_projected,
    '{audience}',
    jsonb_build_object(
      'eligible', v_eligible,
      'actorRole', v_actor_role,
      'classeSeatNumber', v_classe_seat_number,
      'classeAccessKind', v_classe_access_kind
    ),
    true
  );
end;
$$;

revoke all on function public.rooms_get_specialized_state_v1(uuid) from public;
grant execute on function public.rooms_get_specialized_state_v1(uuid)
  to anon, authenticated, service_role;

-- A control client may change pedagogical moderation state, but it must never
-- author, delete or rewrite an enrolled student's question/support history.
-- Preserve the generic Room commit contract for every other Room type while
-- merging only the Classe question status chosen by a control caller.
create or replace function public.rooms_commit_specialized_state_v1(
  p_room_id uuid,
  p_room_type text,
  p_expected_revision bigint,
  p_next_state jsonb
)
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
  v_old_questions jsonb := '[]'::jsonb;
  v_next_questions jsonb := '[]'::jsonb;
  v_safe_questions jsonb := '[]'::jsonb;
  v_old_question jsonb;
  v_next_question jsonb;
  v_match_count integer;
  v_next_status text;
  v_featured_id text;
begin
  if not public.rooms_specialized_is_control_v1(p_room_id, v_uid) then
    raise exception 'room_specialized_commit_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.rooms_v2 room
    where room.id = p_room_id and room.status = 'live'
  ) then
    raise exception 'room_specialized_room_not_live' using errcode = '55000';
  end if;
  if p_next_state is null
     or jsonb_typeof(p_next_state) is distinct from 'object'
     or pg_column_size(p_next_state) > 524288 then
    raise exception 'room_specialized_state_invalid' using errcode = '22023';
  end if;

  select specialized.* into v_row
  from public.room_specialized_state_v1 specialized
  where specialized.room_id = p_room_id
  for update;
  if not found or v_row.room_type <> p_room_type then
    raise exception 'room_specialized_state_missing' using errcode = 'P0002';
  end if;
  if v_row.revision <> p_expected_revision then
    raise exception 'room_specialized_revision_conflict' using errcode = '40001';
  end if;

  v_state := p_next_state;
  if p_room_type = 'classe' then
    if jsonb_typeof(v_state->'classe') is distinct from 'object'
       or jsonb_typeof(v_state #> '{classe,questions}') is distinct from 'array' then
      raise exception using errcode = '22023',
        message = 'classe_question_control_payload_invalid';
    end if;
    v_old_questions := case
      when jsonb_typeof(v_row.state #> '{classe,questions}') = 'array'
        then v_row.state #> '{classe,questions}'
      else '[]'::jsonb
    end;
    v_next_questions := v_state #> '{classe,questions}';

    if jsonb_array_length(v_old_questions) <> jsonb_array_length(v_next_questions)
       or exists (
         select 1
         from jsonb_array_elements(v_old_questions) question
         group by question.value->>'id'
         having question.value->>'id' is null or count(*) <> 1
       ) then
      raise exception using errcode = '22023',
        message = 'classe_question_control_payload_invalid';
    end if;

    for v_old_question in
      select question.value from jsonb_array_elements(v_old_questions) question
    loop
      select count(*) into v_match_count
      from jsonb_array_elements(v_next_questions) question
      where question.value->>'id' = v_old_question->>'id';
      if v_match_count <> 1 then
        raise exception using errcode = '22023',
          message = 'classe_question_control_payload_invalid';
      end if;
      select question.value into v_next_question
      from jsonb_array_elements(v_next_questions) question
      where question.value->>'id' = v_old_question->>'id'
      limit 1;
      if jsonb_typeof(v_next_question) <> 'object'
         or (v_next_question - 'status') is distinct from (v_old_question - 'status') then
        raise exception using errcode = '42501',
          message = 'classe_question_participant_fields_immutable';
      end if;
      v_next_status := v_next_question->>'status';
      if v_next_status not in ('pending', 'displayed', 'answered') then
        raise exception using errcode = '22023',
          message = 'classe_question_status_invalid';
      end if;
      v_safe_questions := v_safe_questions || jsonb_build_array(
        jsonb_set(v_old_question, '{status}', to_jsonb(v_next_status), true)
      );
    end loop;

    v_featured_id := nullif(btrim(v_state #>> '{classe,featuredQuestionId}'), '');
    if v_featured_id is not null and not exists (
      select 1 from jsonb_array_elements(v_safe_questions) question
      where question.value->>'id' = v_featured_id
        and question.value->>'status' = 'displayed'
    ) then
      raise exception using errcode = '22023',
        message = 'classe_featured_question_invalid';
    end if;
    v_state := jsonb_set(v_state, '{classe,questions}', v_safe_questions, true);
  end if;

  v_revision := v_row.revision + 1;
  v_state := v_state || jsonb_build_object(
    'roomId', p_room_id::text,
    'roomType', p_room_type,
    'revision', v_revision,
    'updatedAt', now()
  );
  if pg_column_size(v_state) > 524288 then
    raise exception 'room_specialized_state_invalid' using errcode = '22023';
  end if;
  update public.room_specialized_state_v1
  set revision = v_revision,
      state = v_state,
      updated_by = v_uid,
      updated_at = now()
  where room_id = p_room_id;
  insert into public.room_specialized_state_signal_v1(
    room_id,
    room_type,
    revision
  ) values (
    p_room_id,
    p_room_type,
    v_revision
  )
  on conflict (room_id) do update
  set revision = excluded.revision,
      room_type = excluded.room_type,
      updated_at = now();
  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_commit_specialized_state_v1(
  uuid, text, bigint, jsonb
) from public, anon;
grant execute on function public.rooms_commit_specialized_state_v1(
  uuid, text, bigint, jsonb
) to authenticated, service_role;

create or replace function public.rooms_apply_classe_question_action_v1(
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
  v_row public.room_specialized_state_v1%rowtype;
  v_receipt_action text;
  v_state jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_question jsonb;
  v_supporters jsonb;
  v_profile jsonb;
  v_text text;
  v_question_id text;
  v_found boolean := false;
  v_revision bigint;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'room_specialized_auth_required';
  end if;
  if p_room_id is null
     or p_idempotency_key is null
     or p_action is null
     or p_action not in ('classe.question.add', 'classe.question.support')
     or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'classe_question_action_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:specialized:' || p_room_id::text,
    0
  ));
  select * into v_row
  from public.room_specialized_state_v1 specialized
  where specialized.room_id = p_room_id
  for update;
  if not found or v_row.room_type <> 'classe' then
    raise exception using errcode = 'P0002', message = 'room_specialized_state_missing';
  end if;
  -- Revalidate after taking the authoritative state-row lock. A concurrent
  -- control commit can therefore linearize either before this action (denied)
  -- or after it (the action completed while the seat was still valid).
  if not public.rooms_classe_active_seat_v1(p_room_id, v_uid) then
    raise exception using errcode = '42501', message = 'classe_seat_required';
  end if;

  select receipt.action into v_receipt_action
  from public.room_specialized_action_receipts_v1 receipt
  where receipt.room_id = p_room_id
    and receipt.user_id = v_uid
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt_action <> p_action then
      raise exception using errcode = '23505', message = 'room_specialized_idempotency_conflict';
    end if;
    return public.rooms_get_specialized_state_v1(p_room_id);
  end if;

  v_state := v_row.state;
  if not coalesce(
    case
      when jsonb_typeof(v_state #> '{classe,questionsOpen}') = 'boolean'
        then (v_state #>> '{classe,questionsOpen}')::boolean
      else false
    end,
    false
  ) then
    raise exception using errcode = '55000', message = 'classe_questions_closed';
  end if;

  if p_action = 'classe.question.add' then
    v_text := btrim(coalesce(p_payload->>'text', ''));
    if char_length(v_text) not between 2 and 280 then
      raise exception using errcode = '22023', message = 'classe_question_invalid';
    end if;
    if (
      select count(*)
      from public.room_specialized_action_receipts_v1 receipt
      where receipt.room_id = p_room_id
        and receipt.user_id = v_uid
        and receipt.action = 'classe.question.add'
        and receipt.created_at > now() - interval '1 minute'
    ) >= 5 then
      raise exception using errcode = 'P0001', message = 'classe_question_rate_limit';
    end if;
    if jsonb_array_length(
      case
        when jsonb_typeof(v_state #> '{classe,questions}') = 'array'
          then v_state #> '{classe,questions}'
        else '[]'::jsonb
      end
    ) >= 100 then
      raise exception using errcode = '54000', message = 'classe_question_capacity';
    end if;

    select jsonb_build_object(
      'id', profile.id::text,
      'name', coalesce(
        nullif(profile.display_name, ''),
        nullif(profile.full_name, ''),
        nullif(profile.username, ''),
        'Élève'
      ),
      'avatarUrl', coalesce(profile.avatar_url, profile.profile_image_url, ''),
      'role', coalesce(profile.primary_role_key, 'Élève'),
      'microphone', 'ready',
      'camera', 'off'
    ) into v_profile
    from public.profiles profile
    where profile.id = v_uid;

    v_question := jsonb_build_object(
      'id', gen_random_uuid()::text,
      'author', coalesce(v_profile, jsonb_build_object(
        'id', v_uid::text,
        'name', 'Élève',
        'avatarUrl', '',
        'role', 'Élève',
        'microphone', 'off',
        'camera', 'off'
      )),
      'text', v_text,
      'status', 'pending',
      'sentAt', now(),
      'supports', 0,
      'supporterIds', '[]'::jsonb
    );
    v_state := jsonb_set(
      v_state,
      '{classe,questions}',
      jsonb_build_array(v_question) || case
        when jsonb_typeof(v_state #> '{classe,questions}') = 'array'
          then v_state #> '{classe,questions}'
        else '[]'::jsonb
      end,
      true
    );
  else
    v_question_id := btrim(coalesce(p_payload->>'questionId', ''));
    if char_length(v_question_id) not between 1 and 100
       or v_question_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' then
      raise exception using errcode = '22023', message = 'classe_question_id_invalid';
    end if;

    for v_question in
      select value
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_state #> '{classe,questions}') = 'array'
            then v_state #> '{classe,questions}'
          else '[]'::jsonb
        end
      )
    loop
      if v_question->>'id' = v_question_id then
        v_found := true;
        if v_question #>> '{author,id}' = v_uid::text then
          raise exception using errcode = '42501', message = 'classe_question_self_support_forbidden';
        end if;
        if coalesce(v_question->>'status', '') not in ('pending', 'displayed') then
          raise exception using errcode = '55000', message = 'classe_question_support_closed';
        end if;
        v_supporters := case
          when jsonb_typeof(v_question->'supporterIds') = 'array'
            then v_question->'supporterIds'
          else '[]'::jsonb
        end;
        if v_supporters ? v_uid::text then
          raise exception using errcode = '23505', message = 'classe_question_already_supported';
        end if;
        v_supporters := v_supporters || jsonb_build_array(v_uid::text);
        v_question := jsonb_set(v_question, '{supporterIds}', v_supporters, true);
        v_question := jsonb_set(
          v_question,
          '{supports}',
          to_jsonb(jsonb_array_length(v_supporters)),
          true
        );
      end if;
      v_questions := v_questions || jsonb_build_array(v_question);
    end loop;
    if not v_found then
      raise exception using errcode = 'P0002', message = 'classe_question_not_found';
    end if;
    v_state := jsonb_set(v_state, '{classe,questions}', v_questions, true);
  end if;

  v_revision := v_row.revision + 1;
  v_state := v_state || jsonb_build_object(
    'revision', v_revision,
    'updatedAt', now()
  );
  if pg_column_size(v_state) > 524288 then
    raise exception using errcode = '54000', message = 'room_specialized_state_too_large';
  end if;
  update public.room_specialized_state_v1
  set state = v_state,
      revision = v_revision,
      updated_by = v_uid,
      updated_at = now()
  where room_id = p_room_id;
  insert into public.room_specialized_action_receipts_v1(
    room_id,
    user_id,
    idempotency_key,
    action,
    revision
  ) values (
    p_room_id,
    v_uid,
    p_idempotency_key,
    p_action,
    v_revision
  );
  insert into public.room_specialized_state_signal_v1(
    room_id,
    room_type,
    revision
  ) values (
    p_room_id,
    'classe',
    v_revision
  )
  on conflict (room_id) do update
  set room_type = excluded.room_type,
      revision = excluded.revision,
      updated_at = now();

  return public.rooms_get_specialized_state_v1(p_room_id);
end;
$$;

revoke all on function public.rooms_apply_classe_question_action_v1(uuid, text, jsonb, uuid)
  from public, anon;
grant execute on function public.rooms_apply_classe_question_action_v1(uuid, text, jsonb, uuid)
  to authenticated, service_role;

-- The existing private live-call transport can also be authorized by a
-- current Classe seat. A nullable direct_conversation_id is safe only when
-- the server-stamped authority_kind is classe-seat.
alter table public.room_live_call_invitations_v1
  add column if not exists authority_kind text not null default 'direct';

alter table public.room_live_call_invitations_v1
  alter column direct_conversation_id drop not null;

alter table public.room_live_call_invitations_v1
  add constraint room_live_call_invitations_v1_authority_kind_check
  check (
    (authority_kind = 'direct' and direct_conversation_id is not null)
    or (authority_kind = 'classe-seat' and direct_conversation_id is null)
  ) not valid;

alter table public.room_live_call_invitations_v1
  validate constraint room_live_call_invitations_v1_authority_kind_check;

create unique index if not exists room_live_call_invitations_v1_active_classe_student_idx
  on public.room_live_call_invitations_v1(host_id, contact_profile_id)
  where authority_kind = 'classe-seat' and status in ('pending', 'accepted');

-- V1 deliberately permits several students to ring, but only one accepted
-- Classe transport may exist in a Room. This keeps both the private aside and
-- the public programme bridge aligned with the scalar classroom speaker state.
create unique index if not exists room_live_call_invitations_v1_one_accepted_classe_idx
  on public.room_live_call_invitations_v1(room_id)
  where authority_kind = 'classe-seat' and status = 'accepted';

create or replace function public.rooms_live_call_keep_authority_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.room_id is distinct from old.room_id
     or new.host_id is distinct from old.host_id
     or new.contact_profile_id is distinct from old.contact_profile_id
     or new.authority_kind is distinct from old.authority_kind
     or new.direct_conversation_id is distinct from old.direct_conversation_id then
    raise exception using errcode = '55000', message = 'live_call_authority_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_live_call_keep_authority_immutable_v1
  on public.room_live_call_invitations_v1;
create trigger rooms_live_call_keep_authority_immutable_v1
before update of room_id, host_id, contact_profile_id, authority_kind, direct_conversation_id
on public.room_live_call_invitations_v1
for each row execute function public.rooms_live_call_keep_authority_immutable_v1();

revoke all on function public.rooms_live_call_keep_authority_immutable_v1()
  from public, anon, authenticated, service_role;

create or replace function public.rooms_live_call_contact_allowed_v1(
  p_host_id uuid,
  p_contact_profile_id uuid,
  p_direct_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select p_host_id is not null
    and p_contact_profile_id is not null
    and p_host_id <> p_contact_profile_id
    and (
      (
        p_direct_conversation_id is not null
        and exists (
          select 1
          from public.messaging_conversations conversation
          join public.messaging_direct_pairs pair
            on pair.conversation_id = conversation.id
          join public.messaging_conversation_members host_member
            on host_member.conversation_id = conversation.id
           and host_member.profile_id = p_host_id
           and host_member.membership_status = 'active'
           and host_member.left_at is null
          join public.messaging_conversation_members contact_member
            on contact_member.conversation_id = conversation.id
           and contact_member.profile_id = p_contact_profile_id
           and contact_member.membership_status = 'active'
           and contact_member.left_at is null
          where conversation.id = p_direct_conversation_id
            and conversation.kind = 'direct'
            and conversation.deleted_at is null
            and (
              (pair.profile_low_id = p_host_id and pair.profile_high_id = p_contact_profile_id)
              or
              (pair.profile_low_id = p_contact_profile_id and pair.profile_high_id = p_host_id)
            )
            and not exists (
              select 1
              from public.user_blocks block
              where (
                block.blocker_profile_id = p_host_id
                and block.blocked_profile_id = p_contact_profile_id
              ) or (
                block.blocker_profile_id = p_contact_profile_id
                and block.blocked_profile_id = p_host_id
              )
            )
        )
      )
      or (
        p_direct_conversation_id is null
        and exists (
          select 1
          from public.room_live_call_invitations_v1 invitation
          join public.rooms_v2 room on room.id = invitation.room_id
          where invitation.host_id = p_host_id
            and invitation.contact_profile_id = p_contact_profile_id
            and invitation.authority_kind = 'classe-seat'
            and invitation.direct_conversation_id is null
            and invitation.status in ('pending', 'accepted')
            and room.host_id = p_host_id
            and room.type = 'place'
            and room.status = 'live'
            and public.rooms_classe_active_seat_v1(
              invitation.room_id,
              p_contact_profile_id
            )
            and not public.messaging_profiles_blocked_v1(
              p_host_id,
              p_contact_profile_id
            )
        )
      )
    );
$$;

revoke all on function public.rooms_live_call_contact_allowed_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rooms_invite_live_call_contact_v1(
  p_room_id uuid,
  p_contact_profile_id uuid,
  p_client_request_id uuid,
  p_call_mode text default 'private'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_host_id uuid := auth.uid();
  v_conversation_id uuid;
  v_authority_kind text := 'direct';
  v_batch_room_id uuid;
  v_call_mode text := lower(btrim(coalesce(p_call_mode, 'private')));
  v_fingerprint text;
  v_existing public.room_live_call_invitations_v1%rowtype;
  v_invitation public.room_live_call_invitations_v1%rowtype;
begin
  if v_host_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_room_id is null or p_contact_profile_id is null or p_client_request_id is null
     or p_contact_profile_id = v_host_id
     or v_call_mode not in ('private', 'public') then
    raise exception using errcode = '22023', message = 'invalid_live_call_invitation';
  end if;

  v_fingerprint := encode(digest(
    concat_ws(':', p_room_id::text, p_contact_profile_id::text, v_call_mode),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-request:' || v_host_id::text || ':' || p_client_request_id::text,
    0
  ));

  select invitation.room_id into v_batch_room_id
  from public.room_live_call_invitations_v1 invitation
  where invitation.host_id = v_host_id
    and invitation.client_request_id = p_client_request_id
  order by invitation.created_at, invitation.id
  limit 1;
  if v_batch_room_id is not null and v_batch_room_id <> p_room_id then
    raise exception using errcode = '23505', message = 'live_call_idempotency_conflict';
  end if;

  select invitation.* into v_existing
  from public.room_live_call_invitations_v1 invitation
  where invitation.host_id = v_host_id
    and invitation.client_request_id = p_client_request_id
    and invitation.contact_profile_id = p_contact_profile_id
  for update;

  if v_existing.id is not null then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'live_call_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'ok', true,
      'invitation_id', v_existing.id,
      'status', v_existing.status,
      'call_mode', v_existing.call_mode,
      'route_mode', v_existing.route_mode,
      'route_revision', v_existing.route_revision,
      'invitation_expires_at', v_existing.invitation_expires_at,
      'authority_kind', v_existing.authority_kind,
      'idempotent', true
    );
  end if;

  perform 1
  from public.rooms_v2 room
  where room.id = p_room_id
    and room.host_id = v_host_id
    and room.type = 'place'
    and room.status = 'live'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'live_call_host_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-host-rate:' || v_host_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-room-capacity:' || p_room_id::text,
    0
  ));
  -- Hold every Classe authority row through insertion. If a grant or Viewer
  -- presence is revoked concurrently, either this transaction observes the
  -- revocation and refuses the Classe authority, or the revocation trigger
  -- runs after insertion and terminates the new invitation.
  perform 1
  from public.room_classe_seat_entitlements_v1 entitlement
  where entitlement.room_id = p_room_id
    and entitlement.student_id = p_contact_profile_id
    and entitlement.status = 'active'
  for share;
  perform 1
  from public.room_participants_v2 participant
  where participant.room_id = p_room_id
    and participant.user_id = p_contact_profile_id
    and participant.role = 'viewer'
    and participant.left_at is null
  for share;
  perform 1
  from public.room_specialized_state_v1 specialized
  where specialized.room_id = p_room_id
    and specialized.room_type = 'classe'
  for share;
  if public.rooms_classe_active_seat_v1(p_room_id, p_contact_profile_id) then
    v_authority_kind := 'classe-seat';
    v_conversation_id := null;
  else
    select conversation.id into v_conversation_id
    from public.messaging_direct_pairs pair
    join public.messaging_conversations conversation
      on conversation.id = pair.conversation_id
    where (
        (pair.profile_low_id = v_host_id and pair.profile_high_id = p_contact_profile_id)
        or
        (pair.profile_low_id = p_contact_profile_id and pair.profile_high_id = v_host_id)
      )
      and public.rooms_live_call_contact_allowed_v1(
        v_host_id,
        p_contact_profile_id,
        conversation.id
      )
    limit 1;
    if v_conversation_id is null then
      raise exception using errcode = '42501',
        message = 'live_call_direct_contact_or_classe_seat_required';
    end if;
  end if;

  if public.messaging_profiles_blocked_v1(v_host_id, p_contact_profile_id) then
    raise exception using errcode = '42501', message = 'live_call_contact_blocked';
  end if;

  if public.rooms_live_call_room_access_revoked_v1(
    p_room_id,
    p_contact_profile_id
  ) then
    raise exception using errcode = '42501', message = 'live_call_contact_room_access_revoked';
  end if;
  if public.rooms_live_call_contact_on_public_stage_v1(
    p_room_id,
    p_contact_profile_id
  ) then
    raise exception using errcode = '55000', message = 'live_call_contact_onstage';
  end if;

  perform public.rooms_expire_live_call_invitations_internal_v1(
    100,
    null,
    v_host_id
  );
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.host_id = v_host_id
      and invitation.status in ('pending', 'accepted')
  ) >= 24 then
    raise exception using errcode = '54000', message = 'live_call_host_active_limit';
  end if;

  perform public.rooms_expire_live_call_invitations_internal_v1(
    100,
    p_room_id,
    null
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-contact:' || p_room_id::text || ':' || p_contact_profile_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'rooms:live-call-contact-ring-rate:' || p_contact_profile_id::text,
    0
  ));
  perform public.rooms_expire_live_call_invitations_internal_v1(
    100,
    null,
    p_contact_profile_id
  );

  if exists (
    select 1
    from public.room_live_call_invitations_v1 invitation
    where invitation.room_id = p_room_id
      and invitation.contact_profile_id = p_contact_profile_id
      and invitation.status in ('pending', 'accepted')
  ) then
    raise exception using errcode = '55000', message = 'live_call_already_active';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.contact_profile_id = p_contact_profile_id
      and invitation.created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'live_call_contact_invitation_limit';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.contact_profile_id = p_contact_profile_id
      and invitation.status = 'pending'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'live_call_contact_invitation_limit';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.host_id = v_host_id
      and invitation.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception using errcode = 'P0001', message = 'live_call_invitation_rate_limit';
  end if;
  if (
    select count(*)
    from public.room_live_call_invitations_v1 invitation
    where invitation.room_id = p_room_id
      and invitation.status in ('pending', 'accepted')
  ) >= 8 then
    raise exception using errcode = '54000', message = 'live_call_room_capacity';
  end if;

  insert into public.room_live_call_invitations_v1 (
    room_id,
    host_id,
    contact_profile_id,
    direct_conversation_id,
    authority_kind,
    client_request_id,
    request_fingerprint,
    call_mode,
    invitation_expires_at
  ) values (
    p_room_id,
    v_host_id,
    p_contact_profile_id,
    v_conversation_id,
    v_authority_kind,
    p_client_request_id,
    v_fingerprint,
    v_call_mode,
    now() + interval '90 seconds'
  )
  returning * into v_invitation;

  return jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation.id,
    'status', v_invitation.status,
    'call_mode', v_invitation.call_mode,
    'route_mode', v_invitation.route_mode,
    'route_revision', v_invitation.route_revision,
    'invitation_expires_at', v_invitation.invitation_expires_at,
    'authority_kind', v_invitation.authority_kind,
    'idempotent', false
  );
end;
$$;

revoke all on function public.rooms_invite_live_call_contact_v1(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.rooms_invite_live_call_contact_v1(uuid, uuid, uuid, text)
  to authenticated;

create or replace function public.rooms_end_classe_live_calls_for_state_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_room_id uuid := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
begin
  update public.room_live_call_invitations_v1 invitation
  set status = case when invitation.status = 'accepted' then 'ended' else 'cancelled' end,
      route_mode = 'preview',
      route_revision = invitation.route_revision + 1,
      ended_at = now(),
      end_reason = 'classe_seat_revoked',
      updated_at = now()
  where invitation.room_id = v_room_id
    and invitation.authority_kind = 'classe-seat'
    and invitation.status in ('pending', 'accepted')
    and not public.rooms_classe_active_seat_v1(
      invitation.room_id,
      invitation.contact_profile_id
    );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_end_classe_live_calls_for_state_v1
  on public.room_specialized_state_v1;
create trigger rooms_end_classe_live_calls_for_state_v1
after update of room_type, state or delete
on public.room_specialized_state_v1
for each row execute function public.rooms_end_classe_live_calls_for_state_v1();

create or replace function public.rooms_end_classe_live_calls_for_presence_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_room_id uuid := old.room_id;
  v_student_id uuid := old.user_id;
begin
  update public.room_live_call_invitations_v1 invitation
  set status = case when invitation.status = 'accepted' then 'ended' else 'cancelled' end,
      route_mode = 'preview',
      route_revision = invitation.route_revision + 1,
      ended_at = now(),
      end_reason = 'classe_presence_revoked',
      updated_at = now()
  where invitation.room_id = v_room_id
    and invitation.contact_profile_id = v_student_id
    and invitation.authority_kind = 'classe-seat'
    and invitation.status in ('pending', 'accepted')
    and not public.rooms_classe_active_seat_v1(
      invitation.room_id,
      invitation.contact_profile_id
    );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rooms_end_classe_live_calls_for_presence_v1
  on public.room_participants_v2;
create trigger rooms_end_classe_live_calls_for_presence_v1
after update of room_id, user_id, role, left_at or delete
on public.room_participants_v2
for each row execute function public.rooms_end_classe_live_calls_for_presence_v1();

revoke all on function public.rooms_end_classe_live_calls_for_state_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rooms_end_classe_live_calls_for_presence_v1()
  from public, anon, authenticated, service_role;

-- Existing live Classe rows may already contain the investor fixture. Re-run
-- the canonical projection once so no class-* identity/question survives the
-- migration, then publish the normal revision-only signal.
do $$
declare
  v_room record;
begin
  for v_room in
    select specialized.room_id
    from public.room_specialized_state_v1 specialized
    where specialized.room_type = 'classe'
  loop
    perform public.rooms_sync_classe_state_v1(v_room.room_id);
  end loop;
end;
$$;

comment on function public.rooms_apply_classe_question_action_v1(uuid, text, jsonb, uuid)
  is 'Server-authoritative Classe participant actions for adding and uniquely supporting written questions.';
comment on function public.rooms_classe_active_seat_v1(uuid, uuid)
  is 'Internal fail-closed authority: active Classe entitlement plus a present canonical Viewer, independent from the three Room guests.';
comment on table public.room_classe_seat_entitlements_v1
  is 'Private output of the Room access sequencer for the 24 Classe seats; it contains no payment/order/subscription ledger.';
comment on function public.rooms_upsert_classe_seat_entitlement_v1(uuid, integer, uuid, text, text)
  is 'Service-only ingress for a paid, subscription or private-access decision already verified upstream.';
comment on function public.rooms_set_classe_manual_seat_v1(uuid, integer, uuid)
  is 'Host-only manual grant/revoke for a real account; cannot overwrite commercial access decisions.';
comment on function public.rooms_project_classe_seats_v1(uuid, jsonb, uuid, boolean)
  is 'Rebuilds exactly 24 Classe seats and all person identities from private entitlements, Profiles and Viewer presence.';
comment on column public.room_live_call_invitations_v1.authority_kind
  is 'Server-stamped call authority: canonical direct Messaging contact or an active Classe seat.';
comment on table public.room_live_call_invitations_v1
  is 'Two-party Room live-call invitations. Direct contacts and active Classe seats share the same isolated private media transport.';

commit;
