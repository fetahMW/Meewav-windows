-- La Certif is a signed community endorsement, never an official MeeWav
-- verification, grade, entitlement or financial signal. This additive ledger
-- is derived only from durable Room gifts that already passed the canonical
-- gift RPCs. Existing iOS/Web gift contracts remain unchanged.

create table if not exists public.profile_certif_endorsements_v1 (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('direct', 'draw')),
  source_delivery_id uuid references public.room_gift_deliveries_v1(id) on delete set null,
  source_award_id uuid references public.room_gift_awards_v1(id) on delete set null,
  source_id_snapshot uuid not null,
  room_id_snapshot uuid not null,
  sender_profile_id uuid references auth.users(id) on delete set null,
  sender_profile_id_snapshot uuid not null,
  recipient_profile_id uuid references auth.users(id) on delete set null,
  recipient_profile_id_snapshot uuid not null,
  sender_display_name_snapshot text not null check (
    char_length(sender_display_name_snapshot) between 1 and 120
    and octet_length(sender_display_name_snapshot) <= 480
  ),
  sender_avatar_url_snapshot text,
  recipient_display_name_snapshot text not null check (
    char_length(recipient_display_name_snapshot) between 1 and 120
    and octet_length(recipient_display_name_snapshot) <= 480
  ),
  recipient_avatar_url_snapshot text,
  sender_grade_level_snapshot smallint not null check (sender_grade_level_snapshot between 1 and 6),
  sender_followers_count_snapshot bigint not null default 0 check (sender_followers_count_snapshot >= 0),
  sender_verified_snapshot boolean not null default false,
  signal_context_version text not null default 'profile-signals-v1' check (
    signal_context_version = 'profile-signals-v1'
  ),
  snapshot_quality text not null default 'source_time' check (
    snapshot_quality in ('source_time', 'backfill_current')
  ),
  state text not null default 'active' check (
    state in ('active', 'withdrawn', 'hidden_by_recipient', 'moderated')
  ),
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  endorsed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, source_id_snapshot),
  -- The nullable foreign key is only a convenience link to the durable gift
  -- source. Retention may purge that row later; source_id_snapshot remains the
  -- immutable/idempotent proof and the endorsement must survive the purge.
  check (
    (source_kind = 'direct' and source_award_id is null)
    or (source_kind = 'draw' and source_delivery_id is null)
  ),
  check (sender_profile_id_snapshot <> recipient_profile_id_snapshot),
  check (
    sender_avatar_url_snapshot is null
    or (
      octet_length(sender_avatar_url_snapshot) <= 2048
      and sender_avatar_url_snapshot ~ '^https://[^[:space:]]+$'
    )
  ),
  check (
    recipient_avatar_url_snapshot is null
    or (
      octet_length(recipient_avatar_url_snapshot) <= 2048
      and recipient_avatar_url_snapshot ~ '^https://[^[:space:]]+$'
    )
  ),
  check (
    (state = 'active' and ended_at is null and ended_by is null)
    or (state <> 'active' and ended_at is not null)
  )
);

create index if not exists profile_certif_endorsements_v1_recipient_time_idx
  on public.profile_certif_endorsements_v1(recipient_profile_id_snapshot, endorsed_at desc);
create index if not exists profile_certif_endorsements_v1_sender_time_idx
  on public.profile_certif_endorsements_v1(sender_profile_id_snapshot, endorsed_at desc);
create index if not exists profile_certif_endorsements_v1_public_projection_idx
  on public.profile_certif_endorsements_v1(
    recipient_profile_id_snapshot, sender_profile_id_snapshot, endorsed_at desc, created_at desc
  );

alter table public.profile_certif_endorsements_v1 enable row level security;

drop policy if exists profile_certif_endorsements_v1_participant_read
  on public.profile_certif_endorsements_v1;
create policy profile_certif_endorsements_v1_participant_read
on public.profile_certif_endorsements_v1 for select to authenticated
using (
  sender_profile_id_snapshot = auth.uid()
  or recipient_profile_id_snapshot = auth.uid()
);

revoke all on table public.profile_certif_endorsements_v1 from public, anon, authenticated;
grant select on table public.profile_certif_endorsements_v1 to authenticated;
grant all on table public.profile_certif_endorsements_v1 to service_role;

-- Internal capture primitive. It validates the durable source again so a
-- forged trigger invocation can never mint an endorsement.
create or replace function public.profile_capture_certif_endorsement_v1(
  p_source_kind text,
  p_source_id uuid,
  p_room_id uuid,
  p_sender_profile_id uuid,
  p_recipient_profile_id uuid,
  p_sender_display_name text,
  p_sender_avatar_url text,
  p_recipient_display_name text,
  p_recipient_avatar_url text,
  p_endorsed_at timestamptz,
  p_snapshot_quality text default 'source_time'
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sender public.profiles%rowtype;
  v_recipient public.profiles%rowtype;
  v_grade smallint;
  v_sender_name text;
  v_sender_avatar text;
  v_recipient_name text;
  v_recipient_avatar text;
begin
  if p_source_kind not in ('direct', 'draw')
     or p_source_id is null
     or p_room_id is null
     or p_sender_profile_id is null
     or p_recipient_profile_id is null then
    raise exception using errcode = '22023', message = 'profile_certif_source_invalid';
  end if;
  if p_sender_profile_id = p_recipient_profile_id then
    -- Do not block a legacy draw/delivery transaction, but never project a
    -- self-awarded Certif as community recognition.
    return;
  end if;
  if p_snapshot_quality not in ('source_time', 'backfill_current') then
    raise exception using errcode = '22023', message = 'profile_certif_snapshot_quality_invalid';
  end if;

  if p_source_kind = 'direct' and not exists (
    select 1
    from public.room_gift_deliveries_v1 delivery
    where delivery.id = p_source_id
      and delivery.room_id_snapshot = p_room_id
      and delivery.gift_code = 'la-certif'
      and delivery.status = 'sent'
      and delivery.sender_profile_id_snapshot = p_sender_profile_id
      and delivery.recipient_profile_id_snapshot = p_recipient_profile_id
  ) then
    raise exception using errcode = '22023', message = 'profile_certif_direct_source_invalid';
  end if;
  if p_source_kind = 'draw' and not exists (
    select 1
    from public.room_gift_awards_v1 award
    where award.id = p_source_id
      and award.room_id_snapshot = p_room_id
      and award.gift_code = 'la-certif'
      and award.awarded_by_snapshot = p_sender_profile_id
      and award.recipient_profile_id = p_recipient_profile_id
  ) then
    raise exception using errcode = '22023', message = 'profile_certif_draw_source_invalid';
  end if;

  select * into v_sender
  from public.profiles profile
  where profile.id = p_sender_profile_id;
  if v_sender.id is null then
    -- A scheduled legacy gift may become due after its sender deleted their
    -- profile. Delivery must keep advancing, but there is no Profile on which
    -- an endorsement could safely be projected.
    return;
  end if;
  select * into v_recipient
  from public.profiles profile
  where profile.id = p_recipient_profile_id;
  if v_recipient.id is null then
    return;
  end if;

  select coalesce(state.level, v_sender.grade, 1)::smallint into v_grade
  from (select 1) seed
  left join public.profile_grade_state state on state.profile_id = p_sender_profile_id;
  v_grade := greatest(1, least(6, coalesce(v_grade, 1)))::smallint;
  v_sender_name := left(coalesce(
    nullif(btrim(p_sender_display_name), ''),
    nullif(btrim(v_sender.display_name), ''),
    nullif(btrim(v_sender.username), ''),
    'Membre MeeWav'
  ), 120);
  v_sender_avatar := case
    when octet_length(coalesce(p_sender_avatar_url, '')) <= 2048
      and p_sender_avatar_url ~ '^https://[^[:space:]]+$' then p_sender_avatar_url
    when octet_length(coalesce(v_sender.profile_image_url, '')) <= 2048
      and v_sender.profile_image_url ~ '^https://[^[:space:]]+$' then v_sender.profile_image_url
    when octet_length(coalesce(v_sender.avatar_url, '')) <= 2048
      and v_sender.avatar_url ~ '^https://[^[:space:]]+$' then v_sender.avatar_url
    else null
  end;
  v_recipient_name := left(coalesce(
    nullif(btrim(p_recipient_display_name), ''),
    nullif(btrim(v_recipient.display_name), ''),
    nullif(btrim(v_recipient.username), ''),
    'Membre MeeWav'
  ), 120);
  v_recipient_avatar := case
    when octet_length(coalesce(p_recipient_avatar_url, '')) <= 2048
      and p_recipient_avatar_url ~ '^https://[^[:space:]]+$' then p_recipient_avatar_url
    when octet_length(coalesce(v_recipient.profile_image_url, '')) <= 2048
      and v_recipient.profile_image_url ~ '^https://[^[:space:]]+$' then v_recipient.profile_image_url
    when octet_length(coalesce(v_recipient.avatar_url, '')) <= 2048
      and v_recipient.avatar_url ~ '^https://[^[:space:]]+$' then v_recipient.avatar_url
    else null
  end;

  insert into public.profile_certif_endorsements_v1 (
    source_kind, source_delivery_id, source_award_id, source_id_snapshot,
    room_id_snapshot, sender_profile_id, sender_profile_id_snapshot,
    recipient_profile_id, recipient_profile_id_snapshot,
    sender_display_name_snapshot, sender_avatar_url_snapshot,
    recipient_display_name_snapshot, recipient_avatar_url_snapshot,
    sender_grade_level_snapshot, sender_followers_count_snapshot,
    sender_verified_snapshot, snapshot_quality, endorsed_at
  ) values (
    p_source_kind,
    case when p_source_kind = 'direct' then p_source_id else null end,
    case when p_source_kind = 'draw' then p_source_id else null end,
    p_source_id, p_room_id, p_sender_profile_id, p_sender_profile_id,
    p_recipient_profile_id, p_recipient_profile_id,
    v_sender_name, v_sender_avatar, v_recipient_name, v_recipient_avatar, v_grade,
    greatest(0, coalesce(v_sender.followers_count, 0))::bigint,
    coalesce(v_sender.is_verified, false), p_snapshot_quality,
    coalesce(p_endorsed_at, now())
  )
  on conflict (source_kind, source_id_snapshot) do nothing;
end;
$$;

create or replace function public.profile_capture_direct_certif_trigger_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_should_capture boolean := false;
begin
  if new.gift_code = 'la-certif' and new.status = 'sent' then
    if tg_op = 'INSERT' then
      v_should_capture := true;
    elsif tg_op = 'UPDATE' then
      v_should_capture := old.status is distinct from 'sent';
    end if;
  end if;
  if v_should_capture then
    perform public.profile_capture_certif_endorsement_v1(
      'direct', new.id, new.room_id_snapshot,
      new.sender_profile_id_snapshot, new.recipient_profile_id_snapshot,
      new.sender_display_name_snapshot, new.sender_avatar_url_snapshot,
      new.recipient_display_name_snapshot, new.recipient_avatar_url_snapshot,
      coalesce(new.sent_at, new.created_at), 'source_time'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists room_gift_delivery_capture_certif_v1
  on public.room_gift_deliveries_v1;
create trigger room_gift_delivery_capture_certif_v1
after insert or update of status on public.room_gift_deliveries_v1
for each row execute function public.profile_capture_direct_certif_trigger_v1();

create or replace function public.profile_capture_draw_certif_trigger_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sender public.profiles%rowtype;
begin
  if new.gift_code = 'la-certif' and new.recipient_profile_id is not null then
    select * into v_sender
    from public.profiles profile
    where profile.id = new.awarded_by_snapshot;
    perform public.profile_capture_certif_endorsement_v1(
      'draw', new.id, new.room_id_snapshot,
      new.awarded_by_snapshot, new.recipient_profile_id,
      coalesce(v_sender.display_name, v_sender.username, 'Membre MeeWav'),
      coalesce(v_sender.profile_image_url, v_sender.avatar_url),
      new.recipient_display_name_snapshot, new.recipient_avatar_url_snapshot,
      new.created_at, 'source_time'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists room_gift_award_capture_certif_v1
  on public.room_gift_awards_v1;
create trigger room_gift_award_capture_certif_v1
after insert on public.room_gift_awards_v1
for each row execute function public.profile_capture_draw_certif_trigger_v1();

-- Backfill already delivered Certifs. Raw sender context necessarily reflects
-- migration time and is explicitly labelled so it is never mistaken for a
-- historical official metric.
select public.profile_capture_certif_endorsement_v1(
  'direct', delivery.id, delivery.room_id_snapshot,
  delivery.sender_profile_id_snapshot, delivery.recipient_profile_id_snapshot,
  delivery.sender_display_name_snapshot, delivery.sender_avatar_url_snapshot,
  delivery.recipient_display_name_snapshot, delivery.recipient_avatar_url_snapshot,
  coalesce(delivery.sent_at, delivery.created_at), 'backfill_current'
)
from public.room_gift_deliveries_v1 delivery
where delivery.gift_code = 'la-certif'
  and delivery.status = 'sent';

select public.profile_capture_certif_endorsement_v1(
  'draw', award.id, award.room_id_snapshot,
  award.awarded_by_snapshot, award.recipient_profile_id,
  coalesce(profile.display_name, profile.username, 'Membre MeeWav'),
  coalesce(profile.profile_image_url, profile.avatar_url),
  award.recipient_display_name_snapshot, award.recipient_avatar_url_snapshot,
  award.created_at, 'backfill_current'
)
from public.room_gift_awards_v1 award
left join public.profiles profile on profile.id = award.awarded_by_snapshot
where award.gift_code = 'la-certif'
  and award.recipient_profile_id is not null;

-- A withdrawal is final for that event. A recipient-only hide can be restored.
-- The immutable source gift remains intact for support/audit.
create or replace function public.profile_set_my_certif_state_v1(
  p_endorsement_id uuid,
  p_action text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_endorsement public.profile_certif_endorsements_v1%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'profile_certif_authentication_required';
  end if;
  select * into v_endorsement
  from public.profile_certif_endorsements_v1 endorsement
  where endorsement.id = p_endorsement_id
    and (
      endorsement.sender_profile_id_snapshot = v_user_id
      or endorsement.recipient_profile_id_snapshot = v_user_id
    )
  for update;
  if v_endorsement.id is null then
    raise exception using errcode = 'P0002', message = 'profile_certif_endorsement_not_found';
  end if;

  if v_action = 'withdraw' then
    if v_endorsement.sender_profile_id_snapshot <> v_user_id then
      raise exception using errcode = '42501', message = 'profile_certif_sender_required';
    end if;
    if v_endorsement.state = 'withdrawn' then
      return jsonb_build_object('id', v_endorsement.id, 'state', v_endorsement.state);
    end if;
    if v_endorsement.state not in ('active', 'hidden_by_recipient') then
      raise exception using errcode = '55000', message = 'profile_certif_state_conflict';
    end if;
    update public.profile_certif_endorsements_v1
    set state = 'withdrawn', ended_at = now(), ended_by = v_user_id, updated_at = now()
    where id = v_endorsement.id
    returning * into v_endorsement;
  elsif v_action = 'hide' then
    if v_endorsement.recipient_profile_id_snapshot <> v_user_id then
      raise exception using errcode = '42501', message = 'profile_certif_recipient_required';
    end if;
    if v_endorsement.state = 'hidden_by_recipient' then
      return jsonb_build_object('id', v_endorsement.id, 'state', v_endorsement.state);
    end if;
    if v_endorsement.state <> 'active' then
      raise exception using errcode = '55000', message = 'profile_certif_state_conflict';
    end if;
    update public.profile_certif_endorsements_v1
    set state = 'hidden_by_recipient', ended_at = now(), ended_by = v_user_id, updated_at = now()
    where id = v_endorsement.id
    returning * into v_endorsement;
  elsif v_action = 'restore_visibility' then
    if v_endorsement.recipient_profile_id_snapshot <> v_user_id then
      raise exception using errcode = '42501', message = 'profile_certif_recipient_required';
    end if;
    if v_endorsement.state = 'active' then
      return jsonb_build_object('id', v_endorsement.id, 'state', v_endorsement.state);
    end if;
    if v_endorsement.state <> 'hidden_by_recipient' then
      raise exception using errcode = '55000', message = 'profile_certif_state_conflict';
    end if;
    update public.profile_certif_endorsements_v1
    set state = 'active', ended_at = null, ended_by = null, updated_at = now()
    where id = v_endorsement.id
    returning * into v_endorsement;
  else
    raise exception using errcode = '22023', message = 'profile_certif_action_invalid';
  end if;

  return jsonb_build_object('id', v_endorsement.id, 'state', v_endorsement.state);
end;
$$;

create or replace function public.profile_moderate_certif_v1(p_endorsement_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'profile_certif_service_role_required';
  end if;
  update public.profile_certif_endorsements_v1
  set state = 'moderated', ended_at = coalesce(ended_at, now()), ended_by = null, updated_at = now()
  where id = p_endorsement_id
    and state <> 'moderated';
end;
$$;

-- Safe Profile projection. Every sender contributes at most once: the latest
-- event wins, including a withdrawal/hide, so an older Certif cannot reappear.
-- Sender identity is included only while that sender has a public non-ghost
-- profile. Raw follower snapshots never become an official influence score.
create or replace function public.get_profile_certif_summary_v1(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_unique_endorsers integer := 0;
  v_high_grade_endorsers integer := 0;
  v_verified_endorsers integer := 0;
  v_recent jsonb := '[]'::jsonb;
begin
  if p_profile_id is null then return null; end if;
  select (
    profile.id = auth.uid()
    or (
      coalesce(profile.show_on_public_profile, false)
      and not coalesce(profile.is_ghost_mode, true)
    )
  ) into v_allowed
  from public.profiles profile
  where profile.id = p_profile_id;
  if not coalesce(v_allowed, false) then return null; end if;

  with ranked as (
    select endorsement.*,
      row_number() over (
        partition by endorsement.sender_profile_id_snapshot
        order by endorsement.endorsed_at desc, endorsement.created_at desc, endorsement.id desc
      ) as sender_rank
    from public.profile_certif_endorsements_v1 endorsement
    where endorsement.recipient_profile_id_snapshot = p_profile_id
  ), active_latest as (
    select * from ranked where sender_rank = 1 and state = 'active'
  )
  select count(*)::integer,
    count(*) filter (where sender_grade_level_snapshot >= 4)::integer,
    count(*) filter (where sender_verified_snapshot)::integer
  into v_unique_endorsers, v_high_grade_endorsers, v_verified_endorsers
  from active_latest;

  with ranked as (
    select endorsement.*,
      row_number() over (
        partition by endorsement.sender_profile_id_snapshot
        order by endorsement.endorsed_at desc, endorsement.created_at desc, endorsement.id desc
      ) as sender_rank
    from public.profile_certif_endorsements_v1 endorsement
    where endorsement.recipient_profile_id_snapshot = p_profile_id
  ), visible_recent as (
    select endorsement.*
    from ranked endorsement
    join public.profiles sender on sender.id = endorsement.sender_profile_id_snapshot
    where endorsement.sender_rank = 1
      and endorsement.state = 'active'
      and coalesce(sender.show_on_public_profile, false)
      and not coalesce(sender.is_ghost_mode, true)
    order by endorsement.endorsed_at desc, endorsement.id desc
    limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'display_name', sender_display_name_snapshot,
    'avatar_url', sender_avatar_url_snapshot,
    'grade_level_at_endorsement', sender_grade_level_snapshot,
    'followers_at_endorsement', sender_followers_count_snapshot,
    'was_verified_at_endorsement', sender_verified_snapshot,
    'endorsed_at', endorsed_at,
    'snapshot_quality', snapshot_quality
  ) order by endorsed_at desc), '[]'::jsonb)
  into v_recent
  from visible_recent;

  return jsonb_build_object(
    'profile_id', p_profile_id,
    'kind', 'signed_community_endorsements',
    'display_label', 'Validations reçues',
    'official_meewav_verification', false,
    'unique_endorsers', v_unique_endorsers,
    'high_grade_endorsers', v_high_grade_endorsers,
    'verified_endorsers', v_verified_endorsers,
    'signal_context_version', 'profile-signals-v1',
    'recent_public_endorsers', v_recent,
    'disclaimer', 'Éloges signées par des membres ; ne constituent pas une vérification officielle MeeWav.'
  );
end;
$$;

revoke all on function public.profile_capture_certif_endorsement_v1(
  text, uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.profile_capture_direct_certif_trigger_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.profile_capture_draw_certif_trigger_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.profile_set_my_certif_state_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.profile_set_my_certif_state_v1(uuid, text)
  to authenticated;
revoke all on function public.profile_moderate_certif_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.profile_moderate_certif_v1(uuid)
  to service_role;
revoke all on function public.get_profile_certif_summary_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_profile_certif_summary_v1(uuid)
  to anon, authenticated;

comment on table public.profile_certif_endorsements_v1 is
  'Signed community endorsements derived from La Certif gifts. Not an official MeeWav verification, grade, entitlement or financial signal.';
comment on column public.profile_certif_endorsements_v1.sender_grade_level_snapshot is
  'Canonical sender grade at capture time; immutable context only and never a grade mutation.';
comment on column public.profile_certif_endorsements_v1.sender_followers_count_snapshot is
  'Raw reach context at capture time; deliberately not converted into an official influence score.';
comment on function public.get_profile_certif_summary_v1(uuid) is
  'Safe public/owner Profile projection. Deduplicates by sender and exposes no official certification claim.';
