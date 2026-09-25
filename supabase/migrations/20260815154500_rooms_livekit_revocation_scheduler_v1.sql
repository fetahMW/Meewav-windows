-- Server-only delivery schedule for the durable LiveKit revocation outbox.
--
-- This migration is additive: it does not alter an existing Room, iOS or
-- LiveKit token contract. When pg_cron, pg_net and the two named Vault values
-- are available, a 15-second worker tick is installed automatically. Every
-- unavailable dependency is persisted as an explicit degraded health state.

create table if not exists public.room_livekit_revocation_scheduler_health_v1 (
  singleton boolean primary key default true check (singleton),
  scheduler_status text not null
    check (scheduler_status in ('pending', 'healthy', 'degraded')),
  scheduler_mode text not null
    check (scheduler_mode in ('unconfigured', 'pg_cron_pg_net', 'external_scheduler_required')),
  reason_code text not null check (char_length(reason_code) between 1 and 96),
  detail text not null check (octet_length(detail) <= 1000),
  cadence_seconds integer not null default 15 check (cadence_seconds = 15),
  cron_job_name text not null default 'rooms-livekit-revocation-worker-v1'
    check (cron_job_name = 'rooms-livekit-revocation-worker-v1'),
  cron_job_id bigint,
  last_install_attempt_at timestamptz,
  last_request_enqueued_at timestamptz,
  last_request_id bigint,
  last_error text,
  updated_at timestamptz not null default now()
);

comment on table public.room_livekit_revocation_scheduler_health_v1 is
  'Private machine-readable scheduler state for the pg_cron + pg_net LiveKit revocation worker tick.';

alter table public.room_livekit_revocation_scheduler_health_v1 enable row level security;
revoke all on table public.room_livekit_revocation_scheduler_health_v1
  from public, anon, authenticated;
grant select on table public.room_livekit_revocation_scheduler_health_v1
  to service_role;

insert into public.room_livekit_revocation_scheduler_health_v1 (
  singleton,
  scheduler_status,
  scheduler_mode,
  reason_code,
  detail,
  cadence_seconds,
  cron_job_name,
  updated_at
) values (
  true,
  'pending',
  'unconfigured',
  'installation_pending',
  'LiveKit revocation scheduler installation has not completed.',
  15,
  'rooms-livekit-revocation-worker-v1',
  now()
)
on conflict (singleton) do update
set scheduler_status = excluded.scheduler_status,
    scheduler_mode = excluded.scheduler_mode,
    reason_code = excluded.reason_code,
    detail = excluded.detail,
    cadence_seconds = excluded.cadence_seconds,
    cron_job_name = excluded.cron_job_name,
    last_install_attempt_at = now(),
    updated_at = now();

-- This function is the only database-to-worker bridge. It reads the full Edge
-- Function URL and its shared secret from Vault at execution time, then queues
-- an asynchronous pg_net request. Secret values are never stored in SQL, the
-- health table, a browser response or an iOS payload.
create or replace function public.rooms_tick_livekit_revocation_worker_v1(
  p_batch_size integer default 20
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_worker_url text;
  v_worker_secret text;
  v_request_id bigint;
  v_reason text;
  v_detail text;
  v_checked_at timestamptz := clock_timestamp();
  v_batch_size integer := greatest(1, least(coalesce(p_batch_size, 20), 50));
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    v_reason := 'missing_pg_net';
    v_detail := 'pg_net with net.http_post is unavailable; a trusted external 15-second scheduler is required.';
  elsif pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    v_reason := 'missing_vault';
    v_detail := 'Vault decrypted_secrets is unavailable; a trusted external 15-second scheduler is required.';
  else
    execute $vault_url$
      select nullif(btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_url$
    into v_worker_url
    using 'meewav_livekit_revocation_worker_url';

    execute $vault_secret$
      select nullif(btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_secret$
    into v_worker_secret
    using 'meewav_livekit_revocation_worker_secret';

    if v_worker_url is null then
      v_reason := 'missing_worker_url_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_url is missing.';
    elsif v_worker_url !~ '^https?://[^[:space:]]+/functions/v1/livekit-revocation-worker/?$' then
      v_reason := 'invalid_worker_url_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_url must be the full http(s) Edge Function URL.';
    elsif v_worker_secret is null then
      v_reason := 'missing_worker_shared_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_secret is missing.';
    elsif char_length(v_worker_secret) < 32 then
      v_reason := 'invalid_worker_shared_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_secret must contain at least 32 characters.';
    end if;
  end if;

  if v_reason is not null then
    update public.room_livekit_revocation_scheduler_health_v1
    set scheduler_status = 'degraded',
        scheduler_mode = 'external_scheduler_required',
        reason_code = v_reason,
        detail = v_detail,
        last_error = v_detail,
        updated_at = v_checked_at
    where singleton;

    return pg_catalog.jsonb_build_object(
      'accepted', false,
      'status', 'degraded',
      'reasonCode', v_reason,
      'checkedAt', v_checked_at
    );
  end if;

  begin
    execute $pg_net$
      select net.http_post(
        url := $1,
        body := pg_catalog.jsonb_build_object('batchSize', $2),
        params := '{}'::jsonb,
        headers := pg_catalog.jsonb_build_object(
          'content-type', 'application/json',
          'x-meewav-worker-secret', $3
        ),
        timeout_milliseconds := 8000
      )
    $pg_net$
    into v_request_id
    using rtrim(v_worker_url, '/'), v_batch_size, v_worker_secret;

    if v_request_id is null then
      raise exception 'pg_net did not return a request id.';
    end if;

    update public.room_livekit_revocation_scheduler_health_v1
    set scheduler_status = case
          when cron_job_id is not null then 'healthy'
          else scheduler_status
        end,
        scheduler_mode = case
          when cron_job_id is not null then 'pg_cron_pg_net'
          else scheduler_mode
        end,
        reason_code = case
          when cron_job_id is not null then 'scheduled'
          else reason_code
        end,
        detail = case
          when cron_job_id is not null
            then 'pg_cron queues an authenticated pg_net worker request every 15 seconds.'
          else detail
        end,
        last_request_enqueued_at = v_checked_at,
        last_request_id = v_request_id,
        last_error = null,
        updated_at = v_checked_at
    where singleton;

    return pg_catalog.jsonb_build_object(
      'accepted', true,
      'status', 'queued',
      'requestId', v_request_id,
      'batchSize', v_batch_size,
      'checkedAt', v_checked_at
    );
  exception
    when others then
      v_detail := left('pg_net worker request could not be queued: ' || sqlerrm, 1000);
      update public.room_livekit_revocation_scheduler_health_v1
      set scheduler_status = 'degraded',
          scheduler_mode = 'external_scheduler_required',
          reason_code = 'pg_net_request_failed',
          detail = v_detail,
          last_error = v_detail,
          updated_at = v_checked_at
      where singleton;

      return pg_catalog.jsonb_build_object(
        'accepted', false,
        'status', 'degraded',
        'reasonCode', 'pg_net_request_failed',
        'checkedAt', v_checked_at
      );
  end;
end;
$function$;

alter function public.rooms_tick_livekit_revocation_worker_v1(integer) owner to postgres;
revoke all on function public.rooms_tick_livekit_revocation_worker_v1(integer)
  from public, anon, authenticated;
grant execute on function public.rooms_tick_livekit_revocation_worker_v1(integer)
  to service_role;

-- Deployment entry point. It is safe to call repeatedly after installing an
-- extension or creating/rotating either named Vault value. cron.schedule uses
-- a stable job name, so a re-install updates the existing job instead of
-- creating duplicate delivery loops.
create or replace function public.rooms_install_livekit_revocation_scheduler_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_worker_url text;
  v_worker_secret text;
  v_job_id bigint;
  v_reason text;
  v_detail text;
  v_checked_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is null then
    v_reason := 'missing_pg_cron';
    v_detail := 'pg_cron with second-level interval scheduling is unavailable; configure a trusted external 15-second scheduler.';
  elsif pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    v_reason := 'missing_pg_net';
    v_detail := 'pg_net with net.http_post is unavailable; configure a trusted external 15-second scheduler.';
  elsif pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    v_reason := 'missing_vault';
    v_detail := 'Vault decrypted_secrets is unavailable; configure a trusted external 15-second scheduler.';
  else
    execute $vault_url$
      select nullif(btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_url$
    into v_worker_url
    using 'meewav_livekit_revocation_worker_url';

    execute $vault_secret$
      select nullif(btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_secret$
    into v_worker_secret
    using 'meewav_livekit_revocation_worker_secret';

    if v_worker_url is null then
      v_reason := 'missing_worker_url_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_url is missing.';
    elsif v_worker_url !~ '^https?://[^[:space:]]+/functions/v1/livekit-revocation-worker/?$' then
      v_reason := 'invalid_worker_url_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_url must be the full http(s) Edge Function URL.';
    elsif v_worker_secret is null then
      v_reason := 'missing_worker_shared_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_secret is missing.';
    elsif char_length(v_worker_secret) < 32 then
      v_reason := 'invalid_worker_shared_secret';
      v_detail := 'Named Vault value meewav_livekit_revocation_worker_secret must contain at least 32 characters.';
    end if;
  end if;

  if v_reason is null then
    begin
      execute 'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'rooms-livekit-revocation-worker-v1',
          '15 seconds',
          'select public.rooms_tick_livekit_revocation_worker_v1(20);';

      update public.room_livekit_revocation_scheduler_health_v1
      set scheduler_status = 'healthy',
          scheduler_mode = 'pg_cron_pg_net',
          reason_code = 'scheduled',
          detail = 'pg_cron queues an authenticated pg_net worker request every 15 seconds.',
          cadence_seconds = 15,
          cron_job_id = v_job_id,
          last_install_attempt_at = v_checked_at,
          last_error = null,
          updated_at = v_checked_at
      where singleton;
    exception
      when others then
        v_reason := 'pg_cron_schedule_failed';
        v_detail := left('pg_cron could not install the 15-second worker tick: ' || sqlerrm, 1000);
    end;
  end if;

  if v_reason is not null then
    update public.room_livekit_revocation_scheduler_health_v1
    set scheduler_status = 'degraded',
        scheduler_mode = 'external_scheduler_required',
        reason_code = v_reason,
        detail = v_detail,
        cron_job_id = null,
        last_install_attempt_at = v_checked_at,
        last_error = v_detail,
        updated_at = v_checked_at
    where singleton;
  end if;

  return (
    select pg_catalog.jsonb_build_object(
      'status', health.scheduler_status,
      'mode', health.scheduler_mode,
      'reasonCode', health.reason_code,
      'cadenceSeconds', health.cadence_seconds,
      'cronJobName', health.cron_job_name,
      'cronJobId', health.cron_job_id,
      'checkedAt', health.updated_at
    )
    from public.room_livekit_revocation_scheduler_health_v1 health
    where health.singleton
  );
end;
$function$;

alter function public.rooms_install_livekit_revocation_scheduler_v1() owner to postgres;
revoke all on function public.rooms_install_livekit_revocation_scheduler_v1()
  from public, anon, authenticated;
grant execute on function public.rooms_install_livekit_revocation_scheduler_v1()
  to service_role;

-- Combined private health joins scheduler installation/runtime state with the
-- durable queue snapshot. It intentionally returns no Vault value or worker
-- credential and cannot be called with an end-user JWT.
create or replace function public.rooms_livekit_revocation_delivery_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_scheduler public.room_livekit_revocation_scheduler_health_v1%rowtype;
  v_queue jsonb;
  v_status text;
begin
  perform public.rooms_livekit_require_service_role_v1();

  select *
    into v_scheduler
  from public.room_livekit_revocation_scheduler_health_v1
  where singleton;

  v_queue := public.rooms_livekit_revocation_health_v1();
  v_status := case
    when v_queue ->> 'status' = 'blocked' then 'blocked'
    when v_scheduler.scheduler_status <> 'healthy'
      or v_queue ->> 'status' = 'degraded' then 'degraded'
    else 'healthy'
  end;

  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'scheduler', pg_catalog.jsonb_build_object(
      'status', v_scheduler.scheduler_status,
      'mode', v_scheduler.scheduler_mode,
      'reasonCode', v_scheduler.reason_code,
      'detail', v_scheduler.detail,
      'cadenceSeconds', v_scheduler.cadence_seconds,
      'cronJobName', v_scheduler.cron_job_name,
      'cronJobId', v_scheduler.cron_job_id,
      'lastInstallAttemptAt', v_scheduler.last_install_attempt_at,
      'lastRequestEnqueuedAt', v_scheduler.last_request_enqueued_at,
      'lastRequestId', v_scheduler.last_request_id,
      'lastError', v_scheduler.last_error,
      'checkedAt', v_scheduler.updated_at
    ),
    'queue', v_queue,
    'checkedAt', clock_timestamp()
  );
end;
$function$;

alter function public.rooms_livekit_revocation_delivery_health_v1() owner to postgres;
revoke all on function public.rooms_livekit_revocation_delivery_health_v1()
  from public, anon, authenticated;
grant execute on function public.rooms_livekit_revocation_delivery_health_v1()
  to service_role;

comment on function public.rooms_tick_livekit_revocation_worker_v1(integer) is
  'Server-only pg_net tick. Reads named Vault values and asynchronously POSTs one bounded worker batch.';
comment on function public.rooms_install_livekit_revocation_scheduler_v1() is
  'Idempotently installs the private 15-second pg_cron worker tick or records an explicit degraded state.';
comment on function public.rooms_livekit_revocation_delivery_health_v1() is
  'Service-role-only machine-readable scheduler plus durable queue health; never returns worker credentials.';

-- Automatic installation is deliberately non-fatal. A local or self-hosted
-- database without the optional extensions/Vault values still migrates, while
-- its private health endpoint clearly reports that an external runner is
-- required. Re-run the installer after provisioning missing dependencies.
do $install$
declare
  v_health jsonb;
begin
  v_health := public.rooms_install_livekit_revocation_scheduler_v1();
  if v_health ->> 'status' <> 'healthy' then
    raise warning 'rooms_livekit_revocation_scheduler_degraded: %', v_health ->> 'reasonCode';
  end if;
end;
$install$;
