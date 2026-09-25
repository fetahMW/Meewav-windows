import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePlaceLiveCallRoomCleanup } from "./usePlaceLiveCallRoomCleanup";

describe("usePlaceLiveCallRoomCleanup", () => {
  it("keeps a call stable on ordinary renders and closes it on a Room switch", async () => {
    const authorize = vi.fn(async () => true);
    const setAudible = vi.fn();
    const setProgramEnabled = vi.fn(async () => true);
    const { rerender } = renderHook(
      ({ roomId, ids }) => usePlaceLiveCallRoomCleanup({
        roomId,
        onAirInvitationIds: ids,
        authorize,
        setAudible,
        setProgramEnabled,
      }),
      { initialProps: { roomId: "room-a", ids: ["call-a"] } },
    );

    rerender({ roomId: "room-a", ids: ["call-a"] });
    expect(setProgramEnabled).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();

    rerender({ roomId: "room-b", ids: [] });
    await act(async () => Promise.resolve());

    expect(setAudible).toHaveBeenCalledWith(["call-a"], false);
    expect(setProgramEnabled).toHaveBeenCalledWith(false);
    expect(authorize).toHaveBeenCalledWith(["call-a"], false);
  });

  it("uses the latest gates while preserving the Room-scoped cleanup", async () => {
    const authorizeA = vi.fn(async () => true);
    const authorizeLatest = vi.fn(async () => true);
    const setAudible = vi.fn();
    const setProgramEnabled = vi.fn(async () => true);
    const { rerender, unmount } = renderHook(
      ({ ids, authorize }) => usePlaceLiveCallRoomCleanup({
        roomId: "room-a",
        onAirInvitationIds: ids,
        authorize,
        setAudible,
        setProgramEnabled,
      }),
      { initialProps: { ids: ["call-a"], authorize: authorizeA } },
    );

    rerender({ ids: ["call-a", "call-b"], authorize: authorizeLatest });
    unmount();
    await act(async () => Promise.resolve());

    expect(setAudible).toHaveBeenCalledWith(["call-a", "call-b"], false);
    expect(authorizeA).not.toHaveBeenCalled();
    expect(authorizeLatest).toHaveBeenCalledWith(["call-a", "call-b"], false);
  });

  it("does not clear another Room's audible calls when this Room has none", async () => {
    const authorize = vi.fn(async () => true);
    const setAudible = vi.fn();
    const setProgramEnabled = vi.fn(async () => true);
    const { unmount } = renderHook(() => usePlaceLiveCallRoomCleanup({
      roomId: "room-without-call",
      onAirInvitationIds: [],
      authorize,
      setAudible,
      setProgramEnabled,
    }));

    unmount();
    await act(async () => Promise.resolve());

    expect(setProgramEnabled).toHaveBeenCalledWith(false);
    expect(setAudible).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });
});
