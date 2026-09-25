import { describe, expect, it } from "vitest";
import {
  messagingRealtimeDeduplicationKey,
  parseMessagingRealtimeChange,
  type MessagingRealtimeChange,
} from "./useMessagingRealtime";

describe("parseMessagingRealtimeChange", () => {
  it("accepts a metadata-only private invalidation", () => {
    expect(parseMessagingRealtimeChange({
      version: 1,
      domain: "conversation",
      entity_id: "11111111-1111-4111-8111-111111111111",
      operation: "INSERT",
      source_table: "messaging_messages",
      occurred_at: "2026-07-18T20:00:00.000Z",
    })).toEqual({
      version: 1,
      domain: "conversation",
      entityId: "11111111-1111-4111-8111-111111111111",
      operation: "insert",
      sourceTable: "messaging_messages",
      occurredAt: "2026-07-18T20:00:00.000Z",
    });
  });

  it("rejects unknown domains and malformed identifiers", () => {
    expect(parseMessagingRealtimeChange({
      version: 1,
      domain: "rooms",
      entity_id: "not-a-uuid",
      operation: "insert",
      source_table: "rooms_v2",
    })).toBeNull();
  });

  it("does not accept payloads carrying no valid operation", () => {
    expect(parseMessagingRealtimeChange({
      version: 1,
      domain: "project",
      entity_id: "22222222-2222-4222-8222-222222222222",
      operation: "snapshot",
      source_table: "creative_projects",
    })).toBeNull();
  });

  it("ne confond pas le contenu et le curseur membre d'une même conversation", () => {
    const common = {
      version: 1,
      domain: "conversation",
      entityId: "11111111-1111-4111-8111-111111111111",
      operation: "update",
      occurredAt: "2026-07-18T20:00:00.000Z",
    } satisfies Omit<MessagingRealtimeChange, "sourceTable">;
    const contentChange: MessagingRealtimeChange = {
      ...common,
      sourceTable: "messaging_messages",
    };
    const memberChange: MessagingRealtimeChange = {
      ...common,
      sourceTable: "messaging_conversation_members",
    };
    const pending = new Map<string, MessagingRealtimeChange>();

    pending.set(messagingRealtimeDeduplicationKey(contentChange), contentChange);
    pending.set(messagingRealtimeDeduplicationKey(memberChange), memberChange);

    expect([...pending.values()]).toEqual([contentChange, memberChange]);
  });
});
