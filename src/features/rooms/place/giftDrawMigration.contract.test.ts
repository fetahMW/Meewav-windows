import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260814113000_rooms_gift_draws_v1.sql?raw";

describe("Room gift draw SQL security contract", () => {
  it("keeps the pre-reveal choice, Host identity and idempotency token server-only", () => {
    const publicDraw = sql.match(/create table if not exists public\.room_gift_draws_v1 \([\s\S]*?\n\);/)?.[0] ?? "";
    const privateDraw = sql.match(/create table if not exists public\.room_gift_draw_private_v1 \([\s\S]*?\n\);/)?.[0] ?? "";

    expect(publicDraw).not.toContain("selected_entry_id");
    expect(publicDraw).not.toContain("idempotency_key");
    expect(publicDraw).not.toContain("request_hash");
    expect(publicDraw).not.toContain("host_id");
    expect(privateDraw).toContain("selected_entry_id");
    expect(privateDraw).toContain("idempotency_key");
    expect(privateDraw).toContain("request_hash text not null");
    expect(privateDraw).toContain("host_id");
    expect(sql).toContain("revoke all on table public.room_gift_draw_private_v1 from public, anon, authenticated");
    expect(sql).toContain("revoke all on table public.room_gift_draw_entries_v1 from public, anon, authenticated");
    expect(sql).not.toMatch(/grant select on table public\.room_gift_draw_entries_v1 to authenticated/i);
  });

  it("exposes a draw only while its Room is live and never accepts Messaging contacts", () => {
    const createDrawRpc = sql.slice(
      sql.indexOf("create or replace function public.rooms_create_gift_draw_v1"),
      sql.indexOf("create or replace function public.rooms_start_gift_draw_v1"),
    );
    expect(sql).toMatch(/room\.id = room_gift_draws_v1\.room_id\s+and room\.status = 'live'/);
    expect(createDrawRpc).not.toContain("messaging_conversation_members");
    expect(createDrawRpc).not.toContain("messaging_conversations");
    expect(createDrawRpc).not.toMatch(/source[^\n]*'messaging'/);
  });

  it("removes the public winner projection no later than two minutes after reveal", () => {
    const publicPolicy = sql.slice(
      sql.indexOf("create policy room_gift_draws_v1_public_read"),
      sql.indexOf("drop policy if exists room_gift_awards_v1_owner_read"),
    );
    expect(publicPolicy).toContain("status in ('ready', 'scheduled', 'spinning')");
    expect(publicPolicy).toContain("status = 'revealed'");
    expect(publicPolicy).toContain("revealed_at <= now()");
    expect(publicPolicy).toContain("revealed_at > now() - interval '2 minutes'");
  });

  it("uses the six canonical gift codes and a real five-second scheduler contract", () => {
    for (const code of ["force-card", "vip-pass", "private-access", "golden-like", "supporter-bonus", "la-certif"]) {
      expect(sql).toContain(`when '${code}'`);
    }
    expect(sql).toContain("to_regprocedure('cron.schedule(text,text,text)')");
    expect(sql).toContain("'rooms-gift-draws-v1', '5 seconds'");
    expect(sql).toContain("select public.rooms_advance_due_gift_draws_v1(100)");
    expect(sql).toContain("room_gift_draw_scheduler_health_v1");
    expect(sql).toContain("degraded_external_scheduler_required");
    expect(sql).toContain("rooms_gift_draw_scheduler_degraded");
    expect(sql).not.toContain("'rooms-gift-draws-v1', '* * * * *'");
  });

  it("cancels due work when the Room is no longer live and preserves award snapshots", () => {
    const scheduler = sql.slice(sql.indexOf("create or replace function public.rooms_advance_due_gift_draws_v1"));
    expect(scheduler.match(/room\.status = 'live'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(scheduler.match(/status = 'cancelled'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("draw_id_snapshot uuid not null unique");
    expect(sql).toContain("room_id_snapshot uuid not null");
    expect(sql).toContain("awarded_by_snapshot uuid not null");
    expect(sql).toContain("references public.rooms_v2(id) on delete set null");
  });

  it("indexes award history for recipient Profile reads and Host RLS checks", () => {
    expect(sql).toContain(
      "on public.room_gift_awards_v1(recipient_profile_id, created_at desc)",
    );
    expect(sql).toContain(
      "on public.room_gift_awards_v1(awarded_by, created_at desc)",
    );
  });

  it("samples oversized pools fairly instead of failing above 2,000 people", () => {
    expect(sql).toContain("eligible_count between 0 and 5000");
    expect(sql).toContain("rooms_gift_draw_candidate_input_cap_10000");
    expect(sql.match(/order by gen_random_uuid\(\)\s+limit 5000/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).not.toMatch(/jsonb_array_length\([^)]*\)\s*>\s*2000/);
  });

  it("bounds candidate bytes, names, identifiers and HTTPS avatar URLs", () => {
    expect(sql).toContain("octet_length(v_candidates::text) > 1048576");
    expect(sql).toContain("rooms_gift_draw_candidates_payload_exceeds_1_mib");
    expect(sql).toContain("octet_length(btrim(coalesce(candidate.value ->> 'display_name', ''))) > 480");
    expect(sql).toContain("octet_length(btrim(coalesce(candidate.value ->> 'avatar_url', ''))) > 2048");
    expect(sql).toContain("'^https://[^[:space:]]+$'");
    expect(sql).toContain("rooms_gift_draw_candidate_shape_invalid");
    expect(sql).toMatch(/octet_length\(idempotency_key\) <= 128/);
    expect(sql).toMatch(/octet_length\(display_name_snapshot\) <= 480/);
  });

  it("authorizes the live Host before scanning or hashing candidate payloads", () => {
    const createRpc = sql.slice(
      sql.indexOf("create or replace function public.rooms_create_gift_draw_v1"),
      sql.indexOf("create or replace function public.rooms_start_gift_draw_v1"),
    );
    const authIndex = createRpc.indexOf("rooms_gift_draw_authentication_required");
    const roomRequiredIndex = createRpc.indexOf("rooms_gift_draw_room_required");
    const typeIndex = createRpc.indexOf("rooms_gift_draw_candidates_must_be_array");
    const liveHostIndex = createRpc.indexOf("rooms_gift_draw_live_host_required");
    const bytesIndex = createRpc.indexOf("octet_length(v_candidates::text)");
    const traversalIndex = createRpc.indexOf("jsonb_array_elements(v_candidates)");
    const hashIndex = createRpc.indexOf("v_request_hash := encode(extensions.digest");

    expect(authIndex).toBeGreaterThan(0);
    expect(roomRequiredIndex).toBeGreaterThan(authIndex);
    expect(typeIndex).toBeGreaterThan(roomRequiredIndex);
    expect(liveHostIndex).toBeGreaterThan(typeIndex);
    expect(bytesIndex).toBeGreaterThan(liveHostIndex);
    expect(traversalIndex).toBeGreaterThan(bytesIndex);
    expect(hashIndex).toBeGreaterThan(traversalIndex);
  });

  it("never persists a Host-provided candidate avatar URL", () => {
    const createRpc = sql.slice(
      sql.indexOf("create or replace function public.rooms_create_gift_draw_v1"),
      sql.indexOf("create or replace function public.rooms_start_gift_draw_v1"),
    );
    const entryInsert = createRpc.slice(
      createRpc.lastIndexOf("insert into public.room_gift_draw_entries_v1"),
      createRpc.lastIndexOf("on conflict do nothing"),
    );

    expect(createRpc).toMatch(
      /v_pool_mode = 'manual'\s+and \([\s\S]{0,600}candidate\.value \? 'avatar_url'[\s\S]{0,200}candidate\.value -> 'avatar_url' <> 'null'::jsonb/,
    );
    expect(entryInsert).toContain("when sampled.profile_id is null then null");
    expect(entryInsert).toContain("profile.profile_image_url");
    expect(entryInsert).toContain("profile.avatar_url");
    expect(entryInsert).not.toContain("sampled.value ->> 'avatar_url'");
  });

  it("binds every idempotency key to the exact Room payload", () => {
    const createRpc = sql.slice(
      sql.indexOf("create or replace function public.rooms_create_gift_draw_v1"),
      sql.indexOf("create or replace function public.rooms_start_gift_draw_v1"),
    );
    expect(createRpc).toContain("v_request_hash := encode(extensions.digest");
    for (const field of ["'room_id'", "'gift_code'", "'gift_label'", "'pool_mode'", "'candidates'", "'scheduled_at_epoch'"]) {
      expect(createRpc).toContain(field);
    }
    expect(createRpc).toContain("v_draw.room_id is distinct from p_room_id");
    expect(createRpc).toContain("v_secret.request_hash <> v_request_hash");
    expect(createRpc).toContain("rooms_gift_draw_idempotency_conflict");
    expect(createRpc).toContain("'rooms-gift-draw-host:' || v_host_id::text");
    expect(createRpc).toContain("'rooms-gift-draw-room:' || p_room_id::text");
  });

  it("enforces serialized Host and Room quotas without charging idempotent retries", () => {
    const createRpc = sql.slice(
      sql.indexOf("create or replace function public.rooms_create_gift_draw_v1"),
      sql.indexOf("create or replace function public.rooms_start_gift_draw_v1"),
    );
    const replayIndex = createRpc.indexOf("return next v_draw");
    for (const error of [
      "rooms_gift_draw_host_hourly_rate_limit",
      "rooms_gift_draw_host_daily_quota",
      "rooms_gift_draw_room_hourly_rate_limit",
      "rooms_gift_draw_room_daily_quota",
      "rooms_gift_draw_host_scheduled_quota",
    ]) {
      expect(createRpc).toContain(error);
      expect(createRpc.indexOf(error)).toBeGreaterThan(replayIndex);
    }
    expect(createRpc).toContain(">= 30");
    expect(createRpc).toContain(">= 200");
    expect(createRpc).toContain(">= 12");
    expect(createRpc).toContain(">= 50");
  });

  it("purges private snapshots durably while preserving award snapshots", () => {
    const purge = sql.slice(
      sql.indexOf("create or replace function public.rooms_purge_gift_draw_snapshots_v1"),
      sql.indexOf("create or replace function public.rooms_advance_due_gift_draws_v1"),
    );
    expect(purge).toContain("delete from public.room_gift_draw_entries_v1");
    expect(purge).toContain("interval '48 hours'");
    expect(purge).toContain("interval '7 days'");
    expect(purge).toContain("interval '35 days'");
    expect(purge).toContain("interval '90 days'");
    expect(purge).toContain("interval '180 days'");
    expect(sql).toContain("'rooms-gift-draw-snapshots-purge-v1', '1 hour'");
    expect(sql).toContain("grant execute on function public.rooms_purge_gift_draw_snapshots_v1(integer) to service_role");
    expect(sql).toContain("draw_id uuid unique references public.room_gift_draws_v1(id) on delete set null");
  });
});

describe("Room direct gift SQL contract", () => {
  const submitRpc = sql.slice(
    sql.indexOf("create or replace function public.rooms_submit_gift_v1"),
    sql.indexOf("-- Private entrant snapshots"),
  );

  it("keeps direct delivery idempotency secrets outside the participant ledger", () => {
    const delivery = sql.match(/create table if not exists public\.room_gift_deliveries_v1 \([\s\S]*?\n\);/)?.[0] ?? "";
    const privateDelivery = sql.match(/create table if not exists public\.room_gift_delivery_private_v1 \([\s\S]*?\n\);/)?.[0] ?? "";
    expect(delivery).not.toContain("idempotency_key");
    expect(delivery).not.toContain("request_hash");
    expect(privateDelivery).toContain("idempotency_key text not null");
    expect(privateDelivery).toContain("request_hash text not null");
    expect(sql).toContain("revoke all on table public.room_gift_delivery_private_v1 from public, anon, authenticated");
    expect(sql).not.toMatch(/grant select on table public\.room_gift_delivery_private_v1 to authenticated/i);
  });

  it("supports only the canonical actions, states and six Room gifts", () => {
    expect(sql).toContain("action in ('send_now', 'schedule', 'round')");
    expect(sql).toContain("status in ('sent', 'scheduled', 'ready')");
    for (const code of ["force-card", "vip-pass", "private-access", "golden-like", "supporter-bonus", "la-certif"]) {
      expect(submitRpc).toContain(`when '${code}'`);
    }
    expect(submitRpc).toContain("rooms_gift_delivery_gift_label_mismatch");
    expect(submitRpc).toContain("p_scheduled_at > now() + interval '30 days'");
    expect(submitRpc).toContain("octet_length(v_round_label) > 320");
  });

  it("accepts only stage, backstage, queue or a mutual active direct Messaging contact", () => {
    expect(submitRpc).toContain("invitation.status = 'onstage'");
    expect(submitRpc).toContain("invitation.status = 'backstage'");
    expect(submitRpc).toContain("queued.removed_at is null");
    expect(submitRpc).toContain("conversation.kind = 'direct'");
    expect(submitRpc.match(/membership_status = 'active'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(submitRpc.match(/left_at is null/g)?.length).toBeGreaterThanOrEqual(2);
    expect(submitRpc).toContain("messaging_direct_pairs");
    expect(submitRpc).toContain("not public.messaging_profiles_blocked_v1");
    expect(submitRpc).toContain("rooms_gift_delivery_recipient_not_eligible");
  });

  it("stores complete immutable snapshots without leaking private full names", () => {
    for (const column of [
      "room_id_snapshot",
      "room_title_snapshot",
      "sender_profile_id_snapshot",
      "sender_display_name_snapshot",
      "recipient_profile_id_snapshot",
      "recipient_display_name_snapshot",
    ]) {
      expect(sql).toContain(column);
    }
    expect(submitRpc).toContain("v_sender.display_name");
    expect(submitRpc).toContain("v_recipient.display_name");
    expect(submitRpc).not.toContain(".full_name");
  });

  it("binds idempotency to the complete semantic delivery payload before quotas", () => {
    expect(submitRpc).toContain("v_request_hash := encode(extensions.digest");
    for (const field of [
      "'room_id'",
      "'gift_code'",
      "'gift_label'",
      "'recipient_profile_id'",
      "'action'",
      "'scheduled_at_epoch'",
      "'round_label'",
    ]) {
      expect(submitRpc).toContain(field);
    }
    expect(submitRpc).toContain("v_delivery.room_id_snapshot is distinct from p_room_id");
    expect(submitRpc).toContain("v_secret.request_hash <> v_request_hash");
    expect(submitRpc).toContain("rooms_gift_delivery_idempotency_conflict");
    const replayIndex = submitRpc.indexOf("return next v_delivery");
    expect(replayIndex).toBeGreaterThan(0);
    expect(submitRpc.indexOf("rooms_gift_delivery_host_hourly_rate_limit")).toBeGreaterThan(replayIndex);
  });

  it("enforces serialized Host and Room quotas and participant-only reads", () => {
    for (const error of [
      "rooms_gift_delivery_host_hourly_rate_limit",
      "rooms_gift_delivery_host_daily_quota",
      "rooms_gift_delivery_room_hourly_rate_limit",
      "rooms_gift_delivery_room_daily_quota",
      "rooms_gift_delivery_host_scheduled_quota",
    ]) {
      expect(submitRpc).toContain(error);
    }
    expect(submitRpc).toContain("'rooms-gift-draw-host:' || v_host_id::text");
    expect(submitRpc).toContain("'rooms-gift-draw-room:' || p_room_id::text");
    expect(sql).toMatch(/sender_profile_id = auth\.uid\(\)[\s\S]*recipient_profile_id = auth\.uid\(\) and status = 'sent'/);
    expect(sql).toContain("grant select on table public.room_gift_deliveries_v1 to authenticated");
  });

  it("moves due scheduled gifts to sent through the same five-second worker", () => {
    const scheduler = sql.slice(sql.indexOf("create or replace function public.rooms_advance_due_gift_draws_v1"));
    expect(scheduler).toContain("with due_deliveries as materialized");
    expect(scheduler).toContain("delivery.status = 'scheduled'");
    expect(scheduler).toContain("delivery.scheduled_at <= now()");
    expect(scheduler).toContain("set status = 'sent', sent_at = now(), updated_at = now()");
    expect(scheduler).toContain("Eligibility is intentionally frozen when the Host submits the gift");
    expect(sql).toContain("'rooms-gift-draws-v1', '5 seconds'");
  });

  it("expires direct-delivery secrets after 35 days without deleting the public ledger", () => {
    const purge = sql.slice(
      sql.indexOf("create or replace function public.rooms_purge_gift_draw_snapshots_v1"),
      sql.indexOf("create or replace function public.rooms_advance_due_gift_draws_v1"),
    );
    expect(purge).toContain("delete from public.room_gift_delivery_private_v1");
    expect(purge).toContain("secret.created_at < now() - interval '35 days'");
    expect(purge).not.toContain("delete from public.room_gift_deliveries_v1");
  });
});
