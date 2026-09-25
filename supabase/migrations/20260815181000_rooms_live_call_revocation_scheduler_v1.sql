begin;

-- Optional but observable 15-second delivery loop for private-call expiry and
-- LiveKit room deletion. Missing pg_cron/pg_net/Vault never blocks deployment:
-- the service-only health row records that an external runner is required.

create table if not exists public.room_live_call_revocation_scheduler_health_v1 (
  singleton boolean primary key default true check (singleton),
  scheduler_status text not null
    check (scheduler_status in ('pending', 'healthy', 'degraded')),
  scheduler_mode text not null
    check (scheduler_mode in (
      'unconfigured', 'pg_cron_pg_net', 'external_scheduler_required'
    )),
  reason_code text not null check (char_length(reason_code) between 1 and 96),
  detail text not null check (octet_length(detail) <= 1000),
  cadence_seconds integer not null default 15 check (cadence_seconds = 15),
  cron_job_name text not null default 'rooms-live-call-revocation-worker-v1'
    check (cron_job_name = 'rooms-live-call-revocation-worker-v1'),
  cron_job_id bigint,
  last_install_attempt_at timestamptz,
  last_request_enqueued_at timestamptz,
  last_request_id bigint,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.room_live_call_revocation_scheduler_health_v1
  enable row level security;
revoke all on table public.room_live_call_revocation_scheduler_health_v1
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.room_live_call_revocation_scheduler_health_v1
  to service_role;

insert into public.room_live_call_revocation_scheduler_health_v1 (
  singleton, scheduler_status, scheduler_mode, reason_code, detail,
  cadence_seconds, cron_job_name, updated_at
) values (
  true,
  'pending',
  'unconfigured',
  'installation_pending',
  'Private live-call revocation scheduler installation has not completed.',
  15,
  'rooms-live-call-revocation-worker-v1',
  now()
)
on conflict (singleton) do update
set scheduler_status = excluded.scheduler_status,
    scheduler_mode = excluded.scheduler_mode,
    reason_code = excluded.reason_code,
    detail = excluded.detail,
    last_install_attempt_at = now(),
    updated_at = now();

create or replace function public.rooms_tick_live_call_revocation_worker_v1(
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
  v_checked_at timestamptz := pg_catalog.clock_timestamp();
  v_batch_size integer := pg_catalog.greatest(
    1, pg_catalog.least(pg_catalog.coalesce(p_batch_size, 20), 50)
  );
begin
  if pg_catalog.coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if pg_catalog.to_regprocedure(
    'net.http_post(text,jsonb,jsonb,jsonb,integer)'
  ) is null then
    v_reason := 'missing_pg_net';
    v_detail := 'pg_net is unavailable; configure a trusted external 15-second live-call revocation runner.';
  elsif pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    v_reason := 'missing_vault';
    v_detail := 'Vault is unavailable; configure a trusted external 15-second live-call revocation runner.';
  else
    execute $vault_url$
      select pg_catalog.nullif(pg_catalog.btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_url$
    into v_worker_url
    using 'meewav_live_call_revocation_worker_url';

    execute $vault_secret$
      select pg_catalog.nullif(pg_catalog.btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_secret$
    into v_worker_secret
    using 'meewav_live_call_revocation_worker_secret';

    if v_worker_url is null then
      v_reason := 'missing_worker_url_secret';
      v_detail := 'Named Vault value meewav_live_call_revocation_worker_url is missing.';
    elsif v_worker_url !~* '^https://[^[:space:]]+/functions/v1/rooms-live-call-revocation-worker/?$'
      and v_worker_url !~* '^http://(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]{1,5})?/functions/v1/rooms-live-call-revocation-worker/?$' then
      v_reason := 'invalid_worker_url_secret';
      v_detail := 'The live-call worker URL must use HTTPS; HTTP is accepted only for an explicit loopback development host.';
    elsif v_worker_secret is null then
      v_reason := 'missing_worker_shared_secret';
      v_detail := 'Named Vault value meewav_live_call_revocation_worker_secret is missing.';
    elsif pg_catalog.char_length(v_worker_secret) < 32 then
      v_reason := 'invalid_worker_shared_secret';
      v_detail := 'The live-call worker shared secret must contain at least 32 characters.';
    end if;
  end if;

  if v_reason is not null then
    update public.room_live_call_revocation_scheduler_health_v1
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
    using pg_catalog.rtrim(v_worker_url, '/'), v_batch_size, v_worker_secret;

    if v_request_id is null then
      raise exception 'pg_net did not return a request id.';
    end if;

    update public.room_live_call_revocation_scheduler_health_v1
    set last_request_enqueued_at = v_checked_at,
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
      v_detail := pg_catalog.left(
        'pg_net live-call worker request failed: ' || sqlerrm,
        1000
      );
      update public.room_live_call_revocation_scheduler_health_v1
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

alter function public.rooms_tick_live_call_revocation_worker_v1(integer)
  owner to postgres;
revoke all on function public.rooms_tick_live_call_revocation_worker_v1(integer)
  from public, anon, authenticated;
grant execute on function public.rooms_tick_live_call_revocation_worker_v1(integer)
  to service_role;

create or replace function public.rooms_install_live_call_revocation_scheduler_v1()
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
  v_checked_at timestamptz := pg_catalog.clock_timestamp();
begin
  if pg_catalog.coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if pg_catalog.to_regprocedure('cron.schedule(text,text,text)') is null then
    v_reason := 'missing_pg_cron';
    v_detail := 'pg_cron is unavailable; configure a trusted external 15-second live-call revocation runner.';
  elsif pg_catalog.to_regprocedure(
    'net.http_post(text,jsonb,jsonb,jsonb,integer)'
  ) is null then
    v_reason := 'missing_pg_net';
    v_detail := 'pg_net is unavailable; configure a trusted external 15-second live-call revocation runner.';
  elsif pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    v_reason := 'missing_vault';
    v_detail := 'Vault is unavailable; configure a trusted external 15-second live-call revocation runner.';
  else
    execute $vault_url$
      select pg_catalog.nullif(pg_catalog.btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_url$
    into v_worker_url
    using 'meewav_live_call_revocation_worker_url';

    execute $vault_secret$
      select pg_catalog.nullif(pg_catalog.btrim(secret.decrypted_secret), '')
      from vault.decrypted_secrets secret
      where secret.name = $1
      order by secret.created_at desc
      limit 1
    $vault_secret$
    into v_worker_secret
    using 'meewav_live_call_revocation_worker_secret';

    if v_worker_url is null then
      v_reason := 'missing_worker_url_secret';
      v_detail := 'Named Vault value meewav_live_call_revocation_worker_url is missing.';
    elsif v_worker_url !~* '^https://[^[:space:]]+/functions/v1/rooms-live-call-revocation-worker/?$'
      and v_worker_url !~* '^http://(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]{1,5})?/functions/v1/rooms-live-call-revocation-worker/?$' then
      v_reason := 'invalid_worker_url_secret';
      v_detail := 'The live-call worker URL must use HTTPS; HTTP is accepted only for an explicit loopback development host.';
    elsif v_worker_secret is null then
      v_reason := 'missing_worker_shared_secret';
      v_detail := 'Named Vault value meewav_live_call_revocation_worker_secret is missing.';
    elsif pg_catalog.char_length(v_worker_secret) < 32 then
      v_reason := 'invalid_worker_shared_secret';
      v_detail := 'The live-call worker shared secret must contain at least 32 characters.';
    end if;
  end if;

  if v_reason is null then
    begin
      execute 'select cron.schedule($1, $2, $3)'
      into v_job_id
      using
        'rooms-live-call-revocation-worker-v1',
        '15 seconds',
        'select public.rooms_tick_live_call_revocation_worker_v1(20);';

      update public.room_live_call_revocation_scheduler_health_v1
      set scheduler_status = 'pending',
          scheduler_mode = 'pg_cron_pg_net',
          reason_code = 'scheduled_unconfirmed',
          detail = 'pg_cron is installed, but pg_net enqueue does not prove a worker 2xx response; production response monitoring remains required.',
          cron_job_id = v_job_id,
          last_install_attempt_at = v_checked_at,
          last_error = null,
          updated_at = v_checked_at
      where singleton;
    exception
      when others then
        v_reason := 'pg_cron_schedule_failed';
        v_detail := pg_catalog.left(
          'pg_cron could not install the live-call worker tick: ' || sqlerrm,
          1000
        );
    end;
  end if;

  if v_reason is not null then
    update public.room_live_call_revocation_scheduler_health_v1
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
    from public.room_live_call_revocation_scheduler_health_v1 health
    where health.singleton
  );
end;
$function$;

alter function public.rooms_install_live_call_revocation_scheduler_v1()
  owner to postgres;
revoke all on function public.rooms_install_live_call_revocation_scheduler_v1()
  from public, anon, authenticated;
grant execute on function public.rooms_install_live_call_revocation_scheduler_v1()
  to service_role;

create or replace function public.rooms_live_call_revocation_delivery_health_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_health public.room_live_call_revocation_scheduler_health_v1%rowtype;
  v_pending bigint;
  v_dead bigint;
begin
  perform public.rooms_live_call_require_service_role_v1();
  select * into v_health
  from public.room_live_call_revocation_scheduler_health_v1
  where singleton;
  select
    pg_catalog.count(*) filter (where outbox.state in ('pending', 'retry', 'processing')),
    pg_catalog.count(*) filter (where outbox.state = 'dead')
  into v_pending, v_dead
  from public.room_live_call_revocation_outbox_v1 outbox;

  return pg_catalog.jsonb_build_object(
    'status', case
      when v_dead > 0 then 'blocked'
      when v_health.scheduler_status <> 'healthy' then 'degraded'
      else 'healthy'
    end,
    'scheduler', pg_catalog.jsonb_build_object(
      'status', v_health.scheduler_status,
      'mode', v_health.scheduler_mode,
      'reasonCode', v_health.reason_code,
      'detail', v_health.detail,
      'cadenceSeconds', v_health.cadence_seconds,
      'cronJobId', v_health.cron_job_id,
      'lastRequestEnqueuedAt', v_health.last_request_enqueued_at,
      'lastError', v_health.last_error
    ),
    'queue', pg_catalog.jsonb_build_object(
      'pending', v_pending,
      'dead', v_dead
    ),
    'checkedAt', pg_catalog.clock_timestamp()
  );
end;
$function$;

alter function public.rooms_live_call_revocation_delivery_health_v1()
  owner to postgres;
revoke all on function public.rooms_live_call_revocation_delivery_health_v1()
  from public, anon, authenticated;
grant execute on function public.rooms_live_call_revocation_delivery_health_v1()
  to service_role;

do $install$
declare
  v_health jsonb;
begin
  v_health := public.rooms_install_live_call_revocation_scheduler_v1();
  if v_health ->> 'status' <> 'healthy' then
    raise warning 'rooms_live_call_revocation_scheduler_degraded: %',
      v_health ->> 'reasonCode';
  end if;
end;
$install$;

commit;
