import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260815171000_rooms_host_public_chat_v1.sql?raw";

describe("Room Host public chat SQL contract", () => {
  it("keeps the canonical cross-client RPC and derives Host authority server-side", () => {
    expect(sql).toContain("create or replace function public.rooms_send_message_v2(");
    expect(sql).toContain("p_room_id uuid");
    expect(sql).toContain("p_content text");
    expect(sql).toContain("v_is_host := v_room.host_id = auth.uid()");
    expect(sql).toMatch(/if not v_is_host and not exists \([\s\S]*?room_participants_v2[\s\S]*?left_at is null/);
    expect(sql).toContain("values (p_room_id, auth.uid(), v_content)");
    expect(sql).not.toMatch(/p_(?:host|user|author)_id/i);
  });

  it("lets the Host publish live instructions without weakening audience slow mode", () => {
    const slowModeBlock = sql.slice(
      sql.indexOf("if not v_is_host then"),
      sql.indexOf("insert into public.room_messages_v2"),
    );
    expect(slowModeBlock).toContain("v_room.slow_mode_delay");
    expect(slowModeBlock).toContain("room_user_slow_modes_v2");
    expect(slowModeBlock).toContain("Slow mode actif");
    expect(sql).toContain("if exists (");
    expect(sql).toContain("room_bans_v2");
  });

  it("does not open a direct-insert path and preserves the hardened RPC grant", () => {
    expect(sql).not.toContain("create policy");
    expect(sql).not.toMatch(/grant (?:insert|all) on (?:table )?public\.room_messages_v2/i);
    expect(sql).toContain("revoke all privileges on function public.rooms_send_message_v2(uuid, text)");
    expect(sql).toContain("to authenticated, service_role");
  });
});
