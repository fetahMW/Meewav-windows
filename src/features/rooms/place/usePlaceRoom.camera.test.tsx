import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePlaceRoom } from "./usePlaceRoom";

afterEach(cleanup);

describe("usePlaceRoom camera moderation", () => {
  it("coupe une caméra invitée puis retire la restriction sans forcer son appareil", async () => {
    const { result } = renderHook(() => usePlaceRoom({ demoRole: "host" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const guest = result.current.room.participants.find((participant) => participant.id === "guest-a")!;
    expect(guest.isCameraEnabled).toBe(true);

    act(() => result.current.setParticipantCameraEnabled(guest.profile.id, false));
    let updatedGuest = result.current.room.participants.find((participant) => participant.id === "guest-a")!;
    expect(updatedGuest.isCameraEnabled).toBe(false);
    expect(updatedGuest.isSelfCameraEnabled).toBe(true);
    expect(updatedGuest.isHostForcedCameraOff).toBe(true);

    act(() => result.current.setParticipantCameraEnabled(guest.profile.id, true));
    updatedGuest = result.current.room.participants.find((participant) => participant.id === "guest-a")!;
    expect(updatedGuest.isCameraEnabled).toBe(true);
    expect(updatedGuest.isHostForcedCameraOff).toBe(false);
  });

  it("permet au Host de couper et réactiver sa propre caméra", async () => {
    const { result } = renderHook(() => usePlaceRoom({ demoRole: "host" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const host = result.current.room.participants.find((participant) => participant.status === "host")!;
    act(() => result.current.setParticipantCameraEnabled(host.profile.id, false));
    expect(result.current.room.participants.find((participant) => participant.status === "host")?.isCameraEnabled).toBe(false);

    act(() => result.current.setParticipantCameraEnabled(host.profile.id, true));
    expect(result.current.room.participants.find((participant) => participant.status === "host")?.isCameraEnabled).toBe(true);
  });
});
