import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import type { PlaceRepository } from "./place.service";
import { usePlaceRoom } from "./usePlaceRoom";

afterEach(cleanup);

describe("usePlaceRoom Host chat", () => {
  it("lets the authenticated Room owner send even without a participant row projection", async () => {
    const room = createPlaceDemoState();
    const hostId = room.host.id;
    room.source = "live";
    room.currentUserProfile = null;
    room.currentUserIsActiveParticipant = false;

    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const repository = {
      load: vi.fn().mockResolvedValue(room),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      sendMessage,
    } as unknown as PlaceRepository;

    const { result } = renderHook(() => usePlaceRoom({
      requestedRoomId: room.id,
      currentUserId: hostId,
      repository,
    }));

    await waitFor(() => expect(result.current.room.source).toBe("live"));
    expect(result.current.isHost).toBe(true);
    expect(result.current.canEngage).toBe(true);

    await act(async () => {
      await result.current.sendMessage("Message public du Host");
    });

    expect(sendMessage).toHaveBeenCalledWith(room.id, "Message public du Host");
    expect(result.current.room.messages[result.current.room.messages.length - 1]).toMatchObject({
      author: room.host,
      content: "Message public du Host",
    });
  });
});
