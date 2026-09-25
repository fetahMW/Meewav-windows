import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260815160000_profile_gift_inventory_v1.sql?raw";

describe("Profile gift inventory SQL contract", () => {
  it("keeps balances, movements and reservations server-owned", () => {
    for (const table of [
      "profile_gift_inventory_v1",
      "profile_gift_inventory_movements_v1",
      "profile_gift_inventory_reservations_v1",
      "profile_gift_inventory_runtime_v1",
      "profile_gift_inventory_enforced_sources_v1",
    ]) {
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
      expect(sql).not.toMatch(new RegExp(`grant (?:insert|update|delete|all) on table public\\.${table} to authenticated`, "i"));
      expect(sql).not.toMatch(new RegExp(`grant all on table public\\.${table} to service_role`, "i"));
    }
    expect(sql).toContain("profile_id = auth.uid()");
    expect(sql).toContain("grant execute on function public.profile_list_my_gift_inventory_v1() to authenticated");
    expect(sql).toContain("profile_gift_inventory_service_role_required");
  });

  it("uses exactly the six canonical Room gift codes", () => {
    for (const code of [
      "force-card",
      "vip-pass",
      "private-access",
      "golden-like",
      "supporter-bonus",
      "la-certif",
    ]) {
      expect(sql).toContain(`'${code}'`);
    }
    expect(sql).not.toContain("wave-party");
  });

  it("serializes balance mutations and binds replays to their exact payload", () => {
    const applyMovement = sql.slice(
      sql.indexOf("create or replace function public.profile_apply_gift_inventory_movement_v1"),
      sql.indexOf("create or replace function public.profile_try_lock_gift_inventory_pair_v1"),
    );
    expect(applyMovement).toContain("pg_advisory_xact_lock");
    expect(applyMovement).toContain("for update");
    expect(sql).toContain("unique (profile_id, idempotency_key)");
    expect(applyMovement).toContain("profile_gift_inventory_idempotency_conflict");
    expect(applyMovement).toContain("profile_gift_inventory_insufficient_available");
    expect(applyMovement.indexOf("v_existing.id is not null"))
      .toBeLessThan(applyMovement.indexOf("profile_gift_inventory_insufficient_available"));
    expect(sql).toContain("profile_gift_inventory_reservation_missing");
    expect(sql).toContain("enforcement_started_at");
    expect(sql).toContain("for key share");
    expect(sql).toContain("profile_gift_inventory_profile_not_found");
  });

  it("deploys observe-only and makes seed plus cutover an explicit atomic service operation", () => {
    const observeDefault = sql.indexOf("values (true, 'observe')");
    const finalDeliveryTrigger = sql.indexOf("create trigger profile_finalize_room_gift_delivery_inventory_v1");
    const activation = sql.slice(
      sql.indexOf("create or replace function public.profile_activate_gift_inventory_v1"),
      sql.indexOf("create or replace function public.profile_reject_gift_inventory_movement_mutation_v1"),
    );
    const pairLock = sql.slice(
      sql.indexOf("create or replace function public.profile_try_lock_gift_inventory_pair_v1"),
      sql.indexOf("create or replace function public.profile_lock_gift_inventory_pair_v1"),
    );
    const liveDeliveryCredit = sql.slice(
      sql.indexOf("create or replace function public.profile_credit_room_gift_delivery_inventory_v1"),
      sql.indexOf("drop trigger if exists profile_credit_room_gift_award_inventory_v1"),
    );

    expect(observeDefault).toBeGreaterThan(finalDeliveryTrigger);
    expect(sql).toContain("enforcement_mode text not null default 'observe'");
    expect(activation).toContain("lock table public.room_gift_draws_v1 in share row exclusive mode");
    expect(activation).toContain("lock table public.room_gift_awards_v1 in share row exclusive mode");
    expect(activation).toContain("lock table public.room_gift_deliveries_v1 in share row exclusive mode");
    expect(activation).toContain("Observe-mode sends are intentionally not auto-credited");
    expect(activation).toContain("profile_require_gift_inventory_read_committed_v1");
    expect(activation.indexOf("profile_grant_gift_inventory_unit_v1"))
      .toBeLessThan(activation.indexOf("set enforcement_mode = 'enforce'"));
    expect(activation).toContain("v_started_at := clock_timestamp()");
    expect(sql).toContain("grant execute on function public.profile_activate_gift_inventory_v1(text, jsonb)");
    expect(sql).toContain(
      "revoke all on function public.profile_activate_gift_inventory_v1(text, jsonb)\n  from public, anon, authenticated",
    );
    expect(sql).not.toContain("values (true, clock_timestamp())");
    expect(sql).toContain("profile_gift_inventory_read_committed_required");
    expect(pairLock.indexOf("for key share")).toBeLessThan(pairLock.indexOf("pg_advisory_xact_lock"));
    expect(pairLock.indexOf("v_low_profile_id")).toBeLessThan(pairLock.indexOf("v_high_profile_id"));
    expect(liveDeliveryCredit).toContain("profile_gift_inventory_delivery_recipient_missing");
    expect(liveDeliveryCredit).toContain("profile_grant_gift_inventory_unit_v1");
    expect(liveDeliveryCredit).toContain("profile_gift_inventory_is_active_v1()");
    expect(liveDeliveryCredit).toMatch(/if not v_source_enforced then\s+return new;/i);
    expect(liveDeliveryCredit).toContain("v_reservation.status = 'consumed'");
  });

  it("makes movement history append-only", () => {
    expect(sql).toContain("profile_gift_inventory_movements_immutable_v1");
    expect(sql).toMatch(/before update or delete on public\.profile_gift_inventory_movements_v1/i);
    expect(sql).toContain("profile_gift_inventory_movements_are_append_only");
  });

  it("reserves only expediable direct gifts and draws without replacing public RPC signatures", () => {
    const drawReservation = sql.slice(
      sql.indexOf("create or replace function public.profile_reserve_room_gift_draw_inventory_v1"),
      sql.indexOf("create or replace function public.profile_finalize_room_gift_draw_inventory_v1"),
    );
    const deliveryReservation = sql.slice(
      sql.indexOf("create or replace function public.profile_reserve_room_gift_delivery_inventory_v1"),
      sql.indexOf("create or replace function public.profile_finalize_room_gift_delivery_inventory_v1"),
    );
    expect(sql).toContain("after insert on public.room_gift_draws_v1");
    expect(sql).toContain("after update of status or delete on public.room_gift_draws_v1");
    expect(sql).toContain("before insert or update of status on public.room_gift_deliveries_v1");
    expect(sql).toContain("after update of status or delete on public.room_gift_deliveries_v1");
    expect(deliveryReservation.indexOf("new.status = 'ready'"))
      .toBeLessThan(deliveryReservation.indexOf("profile_reserve_gift_inventory_v1"));
    expect(drawReservation).toContain("profile_gift_inventory_is_active_v1()");
    expect(drawReservation).not.toContain("profile_should_enforce_gift_inventory_v1(new.created_at)");
    expect(drawReservation).toContain("profile_mark_gift_inventory_source_enforced_v1");
    expect(deliveryReservation).toContain("if tg_op = 'INSERT' then");
    expect(deliveryReservation.indexOf("profile_gift_inventory_is_active_v1()"))
      .toBeLessThan(deliveryReservation.indexOf("profile_should_enforce_gift_inventory_v1(new.created_at)"));
    expect(deliveryReservation).toContain("profile_should_enforce_gift_inventory_v1(new.created_at)");
    expect(deliveryReservation).toContain("profile_gift_inventory_enforced_sources_v1");
    expect(deliveryReservation).toContain("and not v_source_marked");
    expect(deliveryReservation).toContain("profile_mark_gift_inventory_source_enforced_v1");
    expect(deliveryReservation).toContain("profile_try_lock_gift_inventory_pair_v1");
    expect(deliveryReservation).toContain("'released', 'recipient_deleted'");
    expect(deliveryReservation).toContain("if new.action = 'round' then");
    expect(sql).toContain("'room_draw', new.id, 'consumed'");
    expect(sql).toContain("'room_draw', new.id, 'released'");
    expect(sql).toContain("'room_delivery', new.id, 'consumed'");
    expect(sql).not.toMatch(/create or replace function public\.rooms_(?:create|submit|start|reveal|cancel)/i);
  });

  it("returns the runtime enforcement flag on every owner inventory row", () => {
    const ownerProjection = sql.slice(
      sql.indexOf("create or replace function public.profile_list_my_gift_inventory_v1"),
      sql.indexOf("create or replace function public.profile_grant_gift_inventory_v1"),
    );

    expect(ownerProjection).toContain("enforcement_active boolean");
    expect(ownerProjection).toContain("runtime.enforcement_mode = 'enforce'");
    expect(ownerProjection).toContain("coalesce((");
  });

  it("preserves reservation audit and terminalizes workers after Profile deletion", () => {
    const reservations = sql.slice(
      sql.indexOf("create table if not exists public.profile_gift_inventory_reservations_v1"),
      sql.indexOf("create table if not exists public.profile_gift_inventory_runtime_v1"),
    );
    const finalizer = sql.slice(
      sql.indexOf("create or replace function public.profile_finalize_gift_inventory_reservation_v1"),
      sql.indexOf("create or replace function public.profile_grant_gift_inventory_unit_v1"),
    );

    expect(reservations).toContain("on delete set null");
    expect(reservations).toContain("owner_profile_id_snapshot uuid not null");
    expect(reservations).toContain("owner_deleted_at timestamptz");
    expect(reservations).toContain("finalization_reason text");
    expect(sql).toContain("before delete on public.profiles");
    expect(finalizer).toContain("owner_deleted_committed");
    expect(finalizer).toContain("owner_deleted_cancelled");
    expect(finalizer).toContain("recipient_deleted");
    expect(finalizer).toContain("v_consumer_action = 'round'");
    expect(finalizer).not.toContain("if not found then return false");
    expect(sql).toContain("create or replace function public.profile_try_lock_gift_inventory_pair_v1");
  });

  it("credits immutable Room awards and sent deliveries once, including historical rows", () => {
    const liveAwardCredit = sql.slice(
      sql.indexOf("create or replace function public.profile_credit_room_gift_award_inventory_v1"),
      sql.indexOf("create or replace function public.profile_credit_room_gift_delivery_inventory_v1"),
    );
    expect(sql).toContain("after insert on public.room_gift_awards_v1");
    expect(sql).toContain("after insert or update of status on public.room_gift_deliveries_v1");
    expect(sql).toContain("'room_draw_award', new.id::text");
    expect(sql).toContain("'room_direct_delivery', new.id::text");
    expect(sql).toMatch(/from public\.room_gift_awards_v1 award[\s\S]*award\.recipient_profile_id is not null/i);
    expect(sql).toMatch(/from public\.room_gift_deliveries_v1 delivery[\s\S]*delivery\.status = 'sent'/i);
    expect(sql).toContain("profile_gift_inventory_movements_are_append_only");
    expect(liveAwardCredit).toMatch(/if not v_source_enforced then\s+return new;/i);
    expect(liveAwardCredit).toContain("v_reservation.status = 'consumed'");
  });
});
