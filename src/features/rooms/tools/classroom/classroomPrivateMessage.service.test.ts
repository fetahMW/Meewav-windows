import { describe, expect, it, vi } from "vitest";
import type { MessagingRepository } from "../../../messaging/messaging.service";
import { createClassroomPrivateMessageAttempt, sendClassroomPrivateMessage } from "./classroomPrivateMessage.service";

const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const RECIPIENT_ID = "20000000-0000-4000-8000-000000000002";

function repository() {
  return {
    getOrCreateClassroomDirectConversation: vi.fn().mockResolvedValue({
      ok: true,
      conversation_id: "30000000-0000-4000-8000-000000000003",
      kind: "direct",
      idempotent: false,
    }),
    sendTextMessage: vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      message_id: "40000000-0000-4000-8000-000000000004",
      sequence: 1,
      created_at: "2026-09-04T18:00:00.000Z",
    }),
  } satisfies Pick<MessagingRepository, "getOrCreateClassroomDirectConversation" | "sendTextMessage">;
}

describe("sendClassroomPrivateMessage", () => {
  it("keeps demo messages local and never touches the real Messaging account", async () => {
    const repo = repository();
    const input = {
      roomId: "classe-demo",
      recipientId: "class-02",
      body: "  Reprends doucement la mesure 12.  ",
      source: "demo" as const,
    };
    const result = await sendClassroomPrivateMessage(input, createClassroomPrivateMessageAttempt(input.roomId, input.recipientId, input.body), repo);

    expect(result.demo).toBe(true);
    expect(repo.getOrCreateClassroomDirectConversation).not.toHaveBeenCalled();
    expect(repo.sendTextMessage).not.toHaveBeenCalled();
  });

  it("creates a direct conversation then sends a room-scoped text message", async () => {
    const repo = repository();
    const input = {
      roomId: ROOM_ID,
      recipientId: RECIPIENT_ID,
      body: "  Reprends doucement la mesure 12.  ",
      source: "live" as const,
    };
    const result = await sendClassroomPrivateMessage(input, createClassroomPrivateMessageAttempt(input.roomId, input.recipientId, input.body), repo);

    expect(repo.getOrCreateClassroomDirectConversation).toHaveBeenCalledWith(
      ROOM_ID,
      RECIPIENT_ID,
      expect.stringMatching(/^classe-direct:/),
    );
    expect(repo.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "30000000-0000-4000-8000-000000000003",
      body: "Reprends doucement la mesure 12.",
      payload: { context: "room_classe", room_id: ROOM_ID },
    }));
    expect(result).toMatchObject({ demo: false, messageId: "40000000-0000-4000-8000-000000000004" });
  });

  it("rejects empty and oversized messages before any network call", async () => {
    const repo = repository();
    const empty = { roomId: ROOM_ID, recipientId: RECIPIENT_ID, body: "   ", source: "live" as const };
    const oversized = { roomId: ROOM_ID, recipientId: RECIPIENT_ID, body: "x".repeat(281), source: "live" as const };
    await expect(sendClassroomPrivateMessage(empty, createClassroomPrivateMessageAttempt(empty.roomId, empty.recipientId, empty.body), repo))
      .rejects.toThrow("class_private_message_invalid");
    await expect(sendClassroomPrivateMessage(oversized, createClassroomPrivateMessageAttempt(oversized.roomId, oversized.recipientId, oversized.body), repo))
      .rejects.toThrow("class_private_message_invalid");
    expect(repo.getOrCreateClassroomDirectConversation).not.toHaveBeenCalled();
  });

  it("reuses the same conversation and message identifiers after a lost response", async () => {
    const repo = repository();
    repo.sendTextMessage.mockRejectedValueOnce(new Error("network_lost"));
    const input = { roomId: ROOM_ID, recipientId: RECIPIENT_ID, body: "À toi.", source: "live" as const };
    const attempt = createClassroomPrivateMessageAttempt(input.roomId, input.recipientId, input.body);

    await expect(sendClassroomPrivateMessage(input, attempt, repo)).rejects.toThrow("network_lost");
    await sendClassroomPrivateMessage(input, attempt, repo);

    expect(repo.getOrCreateClassroomDirectConversation).toHaveBeenCalledTimes(1);
    expect(repo.sendTextMessage).toHaveBeenCalledTimes(2);
    expect(repo.sendTextMessage.mock.calls[0]).toEqual(repo.sendTextMessage.mock.calls[1]);
  });

  it("never reuses an idempotency attempt in another Room", async () => {
    const repo = repository();
    const input = { roomId: ROOM_ID, recipientId: RECIPIENT_ID, body: "À toi.", source: "live" as const };
    const attempt = createClassroomPrivateMessageAttempt("another-room", input.recipientId, input.body);

    await expect(sendClassroomPrivateMessage(input, attempt, repo))
      .rejects.toThrow("class_private_message_attempt_mismatch");
    expect(repo.getOrCreateClassroomDirectConversation).not.toHaveBeenCalled();
    expect(repo.sendTextMessage).not.toHaveBeenCalled();
  });
});
