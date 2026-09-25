-- Atomic, privacy-preserving claim ledger for the hidden Globe treasure.
--
-- Coordinates and winner identity deliberately do not exist in the public
-- contract. The browser can only read an availability projection and can only
-- attempt one server-serialized claim through the RPC below.

create extension if not exists pgcrypto;

create table if not exists public.globe_treasure_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_code text not null unique,
  status text not null default 'scheduled',
  reward_code text not null,
  reward_label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint globe_treasure_campaigns_code_check
    check (
      campaign_code = lower(campaign_code)
      and campaign_code ~ '^[a-z0-9][a-z0-9_-]{7,63}$'
    ),
  constraint globe_treasure_campaigns_status_check
    check (status in ('scheduled', 'active', 'paused', 'claimed', 'closed')),
  constraint globe_treasure_campaigns_reward_code_check
    check (
      reward_code = lower(reward_code)
      and reward_code ~ '^[a-z0-9][a-z0-9_-]{7,63}$'
    ),
  constraint globe_treasure_campaigns_reward_label_check
    check (char_length(btrim(reward_label)) between 1 and 160),
  constraint globe_treasure_campaigns_window_check
    check (ends_at is null or ends_at > starts_at),
  constraint globe_treasure_campaigns_claim_check
    check (
      (status = 'claimed' and claimed_by is not null and claimed_at is not null)
      or
      (status <> 'claimed' and claimed_by is null and claimed_at is null)
    )
);

create table if not exists public.globe_treasure_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references public.globe_treasure_campaigns(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending_review',
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint globe_treasure_claims_campaign_unique unique (campaign_id),
  constraint globe_treasure_claims_profile_unique unique (campaign_id, profile_id),
  constraint globe_treasure_claims_status_check
    check (status in ('pending_review', 'approved', 'fulfilled', 'revoked'))
);

create index if not exists globe_treasure_claims_profile_created_idx
  on public.globe_treasure_claims(profile_id, claimed_at desc);

drop trigger if exists globe_treasure_campaigns_touch_updated_at
  on public.globe_treasure_campaigns;
create trigger globe_treasure_campaigns_touch_updated_at
before update on public.globe_treasure_campaigns
for each row execute function public.meewav_touch_updated_at();

drop trigger if exists globe_treasure_claims_touch_updated_at
  on public.globe_treasure_claims;
create trigger globe_treasure_claims_touch_updated_at
before update on public.globe_treasure_claims
for each row execute function public.meewav_touch_updated_at();

create or replace function public.get_globe_treasure_state_v1(
  p_campaign_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := lower(btrim(coalesce(p_campaign_code, '')));
  v_viewer_id uuid := auth.uid();
  v_now timestamptz := now();
  v_campaign public.globe_treasure_campaigns%rowtype;
  v_claim public.globe_treasure_claims%rowtype;
  v_claimed boolean := false;
  v_claimed_by_me boolean := false;
  v_available boolean := false;
begin
  if v_code !~ '^[a-z0-9][a-z0-9_-]{7,63}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid_treasure_campaign_code';
  end if;

  select campaign.*
  into v_campaign
  from public.globe_treasure_campaigns campaign
  where campaign.campaign_code = v_code;

  if v_campaign.id is null then
    return jsonb_build_object(
      'ok', false,
      'state', 'unavailable',
      'available', false,
      'claimed', false,
      'claimedByMe', false,
      'claimStatus', null,
      'endsAt', null,
      'serverTime', v_now
    );
  end if;

  select claim.*
  into v_claim
  from public.globe_treasure_claims claim
  where claim.campaign_id = v_campaign.id;

  v_claimed := v_campaign.status = 'claimed' or v_claim.id is not null;
  v_claimed_by_me :=
    v_viewer_id is not null
    and v_claim.id is not null
    and v_claim.profile_id = v_viewer_id;
  v_available :=
    not v_claimed
    and v_campaign.status = 'active'
    and v_campaign.starts_at <= v_now
    and (v_campaign.ends_at is null or v_campaign.ends_at > v_now);

  return jsonb_build_object(
    'ok', true,
    'state', case
      when v_claimed then 'claimed'
      when v_available then 'available'
      else 'unavailable'
    end,
    'available', v_available,
    'claimed', v_claimed,
    'claimedByMe', v_claimed_by_me,
    'claimStatus', case when v_claimed_by_me then v_claim.status else null end,
    'endsAt', v_campaign.ends_at,
    'serverTime', v_now
  );
end;
$$;

create or replace function public.claim_globe_treasure_v1(
  p_campaign_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := lower(btrim(coalesce(p_campaign_code, '')));
  v_profile_id uuid := auth.uid();
  v_now timestamptz := now();
  v_campaign public.globe_treasure_campaigns%rowtype;
  v_claim public.globe_treasure_claims%rowtype;
begin
  if v_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if v_code !~ '^[a-z0-9][a-z0-9_-]{7,63}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid_treasure_campaign_code';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_profile_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'treasure_profile_required';
  end if;

  -- The row lock serializes every contender for this campaign. Only the first
  -- transaction can insert the unique claim and mark the campaign claimed.
  select campaign.*
  into v_campaign
  from public.globe_treasure_campaigns campaign
  where campaign.campaign_code = v_code
  for update;

  if v_campaign.id is null then
    return jsonb_build_object(
      'ok', false,
      'outcome', 'unavailable',
      'claimed', false,
      'claimedByMe', false,
      'claimStatus', null,
      'idempotentReplay', false,
      'claimedAt', null,
      'rewardLabel', null
    );
  end if;

  select claim.*
  into v_claim
  from public.globe_treasure_claims claim
  where claim.campaign_id = v_campaign.id;

  if v_claim.id is not null then
    if v_claim.profile_id = v_profile_id then
      return jsonb_build_object(
        'ok', true,
        'outcome', 'won_by_you',
        'claimed', true,
        'claimedByMe', true,
        'claimStatus', v_claim.status,
        'idempotentReplay', true,
        'claimedAt', v_claim.claimed_at,
        'rewardLabel', v_campaign.reward_label
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'outcome', 'already_claimed',
      'claimed', true,
      'claimedByMe', false,
      'claimStatus', null,
      'idempotentReplay', false,
      'claimedAt', null,
      'rewardLabel', null
    );
  end if;

  -- Fail closed if an administrator previously marked the campaign claimed but
  -- its ledger is inconsistent. Never mint a second winner to repair data.
  if v_campaign.status = 'claimed' or v_campaign.claimed_by is not null then
    return jsonb_build_object(
      'ok', true,
      'outcome', case
        when v_campaign.claimed_by = v_profile_id then 'won_by_you'
        else 'already_claimed'
      end,
      'claimed', true,
      'claimedByMe', v_campaign.claimed_by = v_profile_id,
      'claimStatus', null,
      'idempotentReplay', v_campaign.claimed_by = v_profile_id,
      'claimedAt', case
        when v_campaign.claimed_by = v_profile_id then v_campaign.claimed_at
        else null
      end,
      'rewardLabel', case
        when v_campaign.claimed_by = v_profile_id then v_campaign.reward_label
        else null
      end
    );
  end if;

  if v_campaign.status <> 'active'
     or v_campaign.starts_at > v_now
     or (v_campaign.ends_at is not null and v_campaign.ends_at <= v_now) then
    return jsonb_build_object(
      'ok', true,
      'outcome', 'unavailable',
      'claimed', false,
      'claimedByMe', false,
      'claimStatus', null,
      'idempotentReplay', false,
      'claimedAt', null,
      'rewardLabel', null
    );
  end if;

  insert into public.globe_treasure_claims (
    campaign_id,
    profile_id,
    status,
    claimed_at
  ) values (
    v_campaign.id,
    v_profile_id,
    'pending_review',
    v_now
  )
  returning * into v_claim;

  update public.globe_treasure_campaigns campaign
  set
    status = 'claimed',
    claimed_by = v_profile_id,
    claimed_at = v_now
  where campaign.id = v_campaign.id;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'won_by_you',
    'claimed', true,
    'claimedByMe', true,
    'claimStatus', v_claim.status,
    'idempotentReplay', false,
    'claimedAt', v_claim.claimed_at,
    'rewardLabel', v_campaign.reward_label
  );
end;
$$;

alter table public.globe_treasure_campaigns enable row level security;
alter table public.globe_treasure_campaigns force row level security;
alter table public.globe_treasure_claims enable row level security;
alter table public.globe_treasure_claims force row level security;

-- No browser-facing table policies are intentional. All browser access goes
-- through the two narrow projections above.
revoke all on table public.globe_treasure_campaigns
  from public, anon, authenticated;
revoke all on table public.globe_treasure_claims
  from public, anon, authenticated;
grant all on table public.globe_treasure_campaigns to service_role;
grant all on table public.globe_treasure_claims to service_role;

revoke all on function public.get_globe_treasure_state_v1(text)
  from public, anon, authenticated;
grant execute on function public.get_globe_treasure_state_v1(text)
  to anon, authenticated, service_role;

revoke all on function public.claim_globe_treasure_v1(text)
  from public, anon, authenticated;
grant execute on function public.claim_globe_treasure_v1(text)
  to authenticated, service_role;

comment on table public.globe_treasure_campaigns is
  'Server-only Globe treasure campaign state; never contains map coordinates.';
comment on table public.globe_treasure_claims is
  'Private, single-winner Globe treasure claim ledger.';
comment on function public.get_globe_treasure_state_v1(text) is
  'PII-free Globe treasure availability projection; never exposes winner identity or coordinates.';
comment on function public.claim_globe_treasure_v1(text) is
  'Atomically reserves a Globe treasure for the first authenticated profile.';

-- Initial France discovery campaign. The location remains entirely outside
-- Supabase so neither public state nor database introspection can reveal it.
insert into public.globe_treasure_campaigns (
  campaign_code,
  status,
  reward_code,
  reward_label,
  starts_at,
  ends_at
) values (
  'france-hidden-gift-2026-01',
  'active',
  'france-discovery-reward-2026-01',
  'Récompense secrète Meewav',
  '2026-07-19 00:00:00+00'::timestamptz,
  null
)
on conflict (campaign_code) do nothing;
