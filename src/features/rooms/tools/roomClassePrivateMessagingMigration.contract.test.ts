import { describe, expect, it } from "vitest";
import migration from "../../../../supabase/migrations/20260904123000_rooms_classe_private_messaging_v1.sql?raw";

describe("Classe private Messaging migration contract", () => {
  it("exposes one authenticated security-definer RPC without widening generic profile discovery", () => {
    expect(migration).toMatch(/create or replace function public\.rooms_get_or_create_classe_direct_conversation_v1\([\s\S]*security definer[\s\S]*set search_path = pg_catalog, public, pg_temp/iu);
    expect(migration).not.toContain("create or replace function public.get_or_create_direct_conversation_v1");
    expect(migration).toMatch(/revoke all on function public\.rooms_get_or_create_classe_direct_conversation_v1\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated, service_role/iu);
    expect(migration).toMatch(/grant execute on function public\.rooms_get_or_create_classe_direct_conversation_v1\(uuid, uuid, text\)\s+to authenticated/iu);
  });

  it("revalidates the live Classe Host and the current entitled Viewer before every replay", () => {
    const roomProof = migration.indexOf("from public.rooms_v2 room");
    const canonicalReplay = migration.indexOf("from public.messaging_idempotency_keys ledger");
    expect(roomProof).toBeGreaterThan(0);
    expect(roomProof).toBeLessThan(canonicalReplay);
    expect(migration).toContain("room.host_id = v_user_id");
    expect(migration).toContain("room.type = 'place'");
    expect(migration).toContain("room.status = 'live'");
    expect(migration).toContain("specialized.room_type = 'classe'");
    expect(migration).toContain("for share of room, specialized");
    expect(migration).toContain("room_classe_seat_entitlements_v1 entitlement");
    expect(migration).toContain("participant.role = 'viewer'");
    expect(migration).toContain("participant.left_at is null");
    expect(migration).toContain("for share of entitlement, participant");
    expect(migration).toContain("rooms_classe_active_seat_v1(p_room_id, p_student_profile_id)");
    expect(migration).toContain("classe_message_host_required");
    expect(migration).toContain("classe_message_active_seat_required");
  });

  it("preserves blocking, pair uniqueness and Messaging idempotency for private students", () => {
    expect(migration).toContain("messaging_profiles_blocked_v1(v_user_id, p_student_profile_id)");
    expect(migration).toContain("'messaging:classe-conversation-key:'");
    expect(migration).toContain("'messaging:classe-conversation-key:' || v_user_id::text || ':' || v_idempotency_key");
    expect(migration).toContain("'messaging:direct-pair:'");
    expect(migration).toContain("ledger.operation = 'classe_direct_conversation.create'");
    expect(migration).toContain("p_room_id::text || ':' || p_student_profile_id::text");
    expect(migration).toContain("idempotency_conflict");
    expect(migration).toContain("insert into public.messaging_direct_pairs");
    expect(migration).toContain("insert into public.messaging_conversation_members");
    expect(migration).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?public\.messaging_/iu);
  });
});
