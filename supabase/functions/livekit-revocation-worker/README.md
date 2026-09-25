# LiveKit revocation worker

This server-only worker drains `room_livekit_revocation_outbox_v1` and calls
LiveKit's Admin API. A legitimate audience member is retained with publishing
permissions removed; kicked, banned or departed participants are removed, and
an ended Room is deleted. It is intentionally not called by the browser or iOS
app.

Deployment order:

1. Apply `20260815150000_rooms_livekit_revocation_outbox_v1.sql`.
2. Deploy the updated `livekit-token` function so publication generations are
   embedded in server-issued participant metadata.
3. Configure and deploy this function.
4. Store the worker configuration in Vault under the exact names
   `meewav_livekit_revocation_worker_url` and
   `meewav_livekit_revocation_worker_secret`. The first value is the full URL
   ending in `/functions/v1/livekit-revocation-worker`; the second is the same
   random value configured as the Edge Function's
   `LIVEKIT_REVOCATION_WORKER_SECRET`. Create or rotate both values through a
   trusted server/admin path. Never put their values in a migration, browser or
   iOS bundle.
5. Apply `20260815154500_rooms_livekit_revocation_scheduler_v1.sql`. When
   `pg_cron` (with second-level intervals), `pg_net`, Vault and both named
   values are present, the migration automatically installs one idempotent
   worker tick every 15 seconds.

Required Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL` (or `LIVEKIT_SERVER_URL`)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_REVOCATION_WORKER_SECRET` (at least 32 random characters)

The scheduler migration is deliberately non-fatal. If an extension or named
Vault value is unavailable, it persists a machine-readable `degraded` state
instead of claiming that delivery is active. After provisioning the missing
dependency, rerun the service-only installer:

```sql
select public.rooms_install_livekit_revocation_scheduler_v1();
```

The service-only health RPC combines installation/runtime state with the
durable queue snapshot:

```sql
select public.rooms_livekit_revocation_delivery_health_v1();
```

Both RPCs are revoked from `anon` and `authenticated`. The installer accepts a
trusted service role or database administration session; the combined health
RPC deliberately requires the service role. Their JSON responses contain
status/reason codes, cadence, last queued request metadata and queue counts,
but never a Vault value. If the database cannot provide the scheduler, invoke
the same authenticated `POST` from a trusted external scheduler every 15
seconds and keep the explicit `external_scheduler_required` state visible to
operations.

`GET` with the same secret returns the private queue health snapshot. No secret
is ever returned to a client. Failed events remain durable with exponential
backoff and become `dead` after eight attempts. A successful initial permission
revocation or removal is followed by one delayed safety sweep for self-hosted
LiveKit, where server-side token invalidation is unavailable; the existing
five-minute token TTL is the bounded fallback.
