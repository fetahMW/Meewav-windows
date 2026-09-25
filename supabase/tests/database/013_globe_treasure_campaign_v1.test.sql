begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Schema, fixed search path and browser privilege boundary.
-- ---------------------------------------------------------------------------

select has_table(
  'public', 'globe_treasure_campaigns',
  'Globe treasure campaign ledger exists'
);
select has_table(
  'public', 'globe_treasure_claims',
  'Globe treasure private claim ledger exists'
);
select has_column(
  'public', 'globe_treasure_campaigns', 'campaign_code',
  'campaign has a stable public code'
);
select has_column(
  'public', 'globe_treasure_campaigns', 'claimed_by',
  'campaign stores the private winning profile internally'
);
select has_column(
  'public', 'globe_treasure_claims', 'campaign_id',
  'claim references its campaign'
);
select has_column(
  'public', 'globe_treasure_claims', 'profile_id',
  'claim references the authenticated profile'
);
select ok(
  to_regprocedure('public.get_globe_treasure_state_v1(text)') is not null,
  'safe treasure state RPC exists'
);
select ok(
  to_regprocedure('public.claim_globe_treasure_v1(text)') is not null,
  'atomic treasure claim RPC exists'
);
select ok(
  exists (
    select 1
    from pg_proc function_row
    where function_row.oid =
      'public.get_globe_treasure_state_v1(text)'::regprocedure
      and function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=pg_catalog, public']
  ),
  'state RPC is SECURITY DEFINER with a fixed safe search path'
);
select ok(
  exists (
    select 1
    from pg_proc function_row
    where function_row.oid =
      'public.claim_globe_treasure_v1(text)'::regprocedure
      and function_row.prosecdef
      and coalesce(function_row.proconfig, '{}'::text[])
        @> array['search_path=pg_catalog, public']
  ),
  'claim RPC is SECURITY DEFINER with a fixed safe search path'
);
select ok(
  has_function_privilege(
    'anon', 'public.get_globe_treasure_state_v1(text)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.get_globe_treasure_state_v1(text)', 'execute'
  ),
  'anonymous and authenticated clients can read only the safe state'
);
select ok(
  not has_function_privilege(
    'anon', 'public.claim_globe_treasure_v1(text)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.claim_globe_treasure_v1(text)', 'execute'
  ),
  'only authenticated browser clients can attempt a claim'
);
select ok(
  not has_table_privilege(
    'anon', 'public.globe_treasure_campaigns', 'select'
  ),
  'anonymous clients cannot read the raw campaign table'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.globe_treasure_campaigns', 'select'
  ),
  'authenticated clients cannot read winner or reward internals'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.globe_treasure_claims', 'select'
  )
  and not has_table_privilege(
    'authenticated', 'public.globe_treasure_claims', 'insert'
  ),
  'authenticated clients cannot bypass the claim RPC'
);
select ok(
  (
    select table_row.relrowsecurity and table_row.relforcerowsecurity
    from pg_class table_row
    where table_row.oid = 'public.globe_treasure_campaigns'::regclass
  )
  and (
    select table_row.relrowsecurity and table_row.relforcerowsecurity
    from pg_class table_row
    where table_row.oid = 'public.globe_treasure_claims'::regclass
  ),
  'both private ledgers enforce RLS even for their owner'
);
select ok(
  exists (
    select 1
    from public.globe_treasure_campaigns campaign
    where campaign.campaign_code = 'france-hidden-gift-2026-01'
      and campaign.status = 'active'
  ),
  'the initial France campaign is seeded active'
);

update public.globe_treasure_campaigns
set starts_at = now() - interval '1 hour', ends_at = null
where campaign_code = 'france-hidden-gift-2026-01';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  public.get_globe_treasure_state_v1('france-hidden-gift-2026-01') ->> 'state',
  'available',
  'anonymous discovery state reports an active unclaimed campaign'
);
select ok(
  not (
    public.get_globe_treasure_state_v1('france-hidden-gift-2026-01')
      ?| array[
        'claimedBy', 'claimed_by', 'winnerId', 'winnerProfileId',
        'rewardCode', 'coordinates', 'latitude', 'longitude'
      ]
  ),
  'public state contains neither winner identity, internal reward code nor coordinates'
);

-- ---------------------------------------------------------------------------
-- First authenticated claimant wins atomically; retries are idempotent.
-- ---------------------------------------------------------------------------

reset role;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'treasure-winner@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Treasure Winner"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'treasure-later@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Treasure Later"}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.claim_globe_treasure_v1('france-hidden-gift-2026-01') ->> 'outcome',
  'won_by_you',
  'the first authenticated profile wins the campaign'
);
select is(
  public.claim_globe_treasure_v1('france-hidden-gift-2026-01') ->> 'claimStatus',
  'pending_review',
  'the reward is reserved for operational review rather than auto-paid'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.globe_treasure_claims claim
    join public.globe_treasure_campaigns campaign
      on campaign.id = claim.campaign_id
    where campaign.campaign_code = 'france-hidden-gift-2026-01'
  ),
  1,
  'the winning campaign has exactly one private claim row'
);
select ok(
  exists (
    select 1
    from public.globe_treasure_campaigns campaign
    where campaign.campaign_code = 'france-hidden-gift-2026-01'
      and campaign.status = 'claimed'
      and campaign.claimed_by =
        'a1000000-0000-4000-8000-000000000001'::uuid
      and campaign.claimed_at is not null
  ),
  'the same transaction marks the campaign claimed by the winner'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.claim_globe_treasure_v1('france-hidden-gift-2026-01')
    @> '{"outcome":"won_by_you","idempotentReplay":true}'::jsonb,
  'winner retry receives its original result idempotently'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.globe_treasure_claims claim
    join public.globe_treasure_campaigns campaign
      on campaign.id = claim.campaign_id
    where campaign.campaign_code = 'france-hidden-gift-2026-01'
  ),
  1,
  'winner retry never duplicates the reservation'
);

-- ---------------------------------------------------------------------------
-- Later contenders get a privacy-safe loss response.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.get_globe_treasure_state_v1('france-hidden-gift-2026-01')
    @> '{"state":"claimed","claimed":true,"claimedByMe":false}'::jsonb,
  'another profile sees only that the campaign has been claimed'
);
select ok(
  not (
    public.get_globe_treasure_state_v1('france-hidden-gift-2026-01')
      ?| array['claimedBy', 'claimed_by', 'winnerId', 'winnerProfileId']
  ),
  'claimed state still exposes no winner identity'
);
select is(
  public.claim_globe_treasure_v1('france-hidden-gift-2026-01') ->> 'outcome',
  'already_claimed',
  'a later contender cannot become a second winner'
);
select ok(
  public.claim_globe_treasure_v1('france-hidden-gift-2026-01')
    @> '{"claimedByMe":false,"claimStatus":null,"claimedAt":null,"rewardLabel":null}'::jsonb,
  'loss response leaks neither winner, claim status, claim time nor reward details'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.get_globe_treasure_state_v1('france-hidden-gift-2026-01')
    @> '{"state":"claimed","claimedByMe":true,"claimStatus":"pending_review"}'::jsonb,
  'winner can reload only its own reservation status'
);

reset role;
insert into public.globe_treasure_campaigns (
  campaign_code, status, reward_code, reward_label, starts_at
) values (
  'paused-treasure-test-01', 'paused', 'paused-reward-test-01',
  'Récompense en pause', now() - interval '1 hour'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.claim_globe_treasure_v1('paused-treasure-test-01') ->> 'outcome',
  'unavailable',
  'a paused campaign cannot be claimed'
);
select throws_ok(
  $$select public.claim_globe_treasure_v1('../invalid')$$,
  '22023',
  'invalid_treasure_campaign_code',
  'malformed campaign codes are rejected before lookup'
);

select * from finish();
rollback;
