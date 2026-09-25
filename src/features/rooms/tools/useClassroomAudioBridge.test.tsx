import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomLiveCallInvitation } from "../live-call/roomLiveCall.service";
import type { RoomPerson, RoomToolsCommand } from "./roomTools.types";
import { useClassroomAudioBridge } from "./useClassroomAudioBridge";

const useOptionalRoomLiveCall = vi.hoisted(() => vi.fn());

vi.mock("../live-call/RoomLiveCallProvider", () => ({ useOptionalRoomLiveCall }));

const student: RoomPerson = {
  id: "class-student-live",
  name: "Sofia",
  role: "Élève premium",
  avatarUrl: "/sofia.jpg",
  microphone: "ready",
  camera: "ready",
};

function liveContext(mode: "private" | "public", endCall = vi.fn(async () => undefined)) {
  const invitation: RoomLiveCallInvitation = {
    invitationId: `invitation-${mode}`,
    roomId: "room-classe-live",
    roomTitle: "La Classe",
    hostProfileId: "host",
    hostUsername: null,
    hostDisplayName: "Professeur",
    hostAvatarUrl: null,
    contactProfileId: student.id,
    contactUsername: null,
    contactDisplayName: student.name,
    contactAvatarUrl: student.avatarUrl,
    partyRole: "host",
    status: "accepted",
    callMode: mode,
    routeMode: mode === "public" ? "public" : "preview",
    isOnAir: mode === "public",
    routeRevision: 2,
    invitationExpiresAt: "2099-01-01T00:00:00.000Z",
    sessionExpiresAt: "2099-01-01T00:10:00.000Z",
    createdAt: "2026-08-21T17:00:00.000Z",
  };
  const disconnect = vi.fn(async () => undefined);
  const setRegieContact = vi.fn();
  const setRegieTalkbackActive = vi.fn(async (_roomId: string, _enabled: boolean) => true);
  return {
    invitations: [invitation],
    mediaSessions: [{
      invitationId: invitation.invitationId,
      status: "connected" as const,
      peerPresent: true,
      remoteTrack: { kind: "audio", readyState: "live" } as MediaStreamTrack,
      remoteMuted: false,
      remotePlaybackSuppressed: false,
      localAudible: true,
      disconnect,
    }],
    regieTalkbackActiveRoomIds: mode === "private" ? new Set([invitation.roomId]) : new Set<string>(),
    onAirInvitationIds: mode === "public" ? new Set([invitation.invitationId]) : new Set<string>(),
    audibleOnAirInvitationIds: mode === "public" ? new Set([invitation.invitationId]) : new Set<string>(),
    requestLiveCall: vi.fn(async () => undefined),
    requestLiveCallTracked: vi.fn(async () => [invitation.invitationId]),
    setRegieContact,
    setRegieTalkbackActive,
    setCallRoute: vi.fn(async () => undefined),
    confirmCallOnAir: vi.fn(async () => undefined),
    takeCallOffAir: vi.fn(async () => undefined),
    endCall,
  };
}

afterEach(() => {
  cleanup();
  useOptionalRoomLiveCall.mockReset();
});

describe("useClassroomAudioBridge", () => {
  it("never advertises a private channel when the canonical provider is absent", async () => {
    useOptionalRoomLiveCall.mockReturnValue(null);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await act(() => result.current.startPrivate(student));
    expect(result.current.phase).toBe("unavailable");
    expect(result.current.error).toMatch(/transport audio privé/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps the target closed when END is not confirmed", async () => {
    const context = liveContext("private", vi.fn(async () => { throw new Error("network_lost"); }));
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result, unmount } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await act(() => result.current.startPrivate(student));
    await waitFor(() => expect(result.current.phase).toBe("active"));
    await act(() => result.current.stop());

    expect(result.current.phase).toBe("error");
    expect(result.current.studentId).toBe(student.id);
    expect(context.setRegieTalkbackActive).toHaveBeenCalledWith("room-classe-live", false);
    expect(context.setRegieContact).not.toHaveBeenCalledWith("room-classe-live", null);
    unmount();
  });

  it("never reopens a late invitation after the Host requested Stop", async () => {
    let context = liveContext("private");
    const invitation = context.invitations[0];
    const session = context.mediaSessions[0];
    context = {
      ...context,
      invitations: [],
      mediaSessions: [],
      regieTalkbackActiveRoomIds: new Set<string>(),
      requestLiveCallTracked: vi.fn(async () => { throw new Error("network_lost"); }),
    };
    useOptionalRoomLiveCall.mockImplementation(() => context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result, rerender } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await act(() => result.current.startPrivate(student));
    await act(() => result.current.stop());
    context = { ...context, invitations: [invitation], mediaSessions: [session] };
    rerender();

    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(context.endCall).toHaveBeenCalledWith("invitation-private");
    expect(context.setRegieTalkbackActive).not.toHaveBeenCalledWith("room-classe-live", true);
  });

  it("treats a bound invitation disappearing from the production list as terminal", async () => {
    let context = liveContext("private");
    useOptionalRoomLiveCall.mockImplementation(() => context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result, rerender } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await act(() => result.current.startPrivate(student));
    await waitFor(() => expect(result.current.phase).toBe("active"));
    context = { ...context, invitations: [] };
    rerender();

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.studentId).toBeNull();
    expect(context.setRegieContact).toHaveBeenCalledWith("room-classe-live", null);
  });

  it("ends a private call when the bidirectional media gate cannot open", async () => {
    const context = liveContext("private");
    context.regieTalkbackActiveRoomIds = new Set<string>();
    context.setRegieTalkbackActive = vi.fn(async (_roomId: string, enabled: boolean) => !enabled);
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await act(() => result.current.startPrivate(student));
    await waitFor(() => expect(result.current.phase).toBe("error"));

    expect(context.mediaSessions[0].disconnect).toHaveBeenCalled();
    expect(context.endCall).toHaveBeenCalledWith("invitation-private");
    expect(result.current.phase).not.toBe("active");
  });

  it("fails closed if the student track is muted during an active private call", async () => {
    let context = liveContext("private");
    useOptionalRoomLiveCall.mockImplementation(() => context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result, rerender } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await act(() => result.current.startPrivate(student));
    await waitFor(() => expect(result.current.phase).toBe("active"));
    context = { ...context, mediaSessions: [{ ...context.mediaSessions[0], remoteMuted: true }] };
    rerender();

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(context.setRegieTalkbackActive).toHaveBeenCalledWith("room-classe-live", false);
    expect(context.endCall).toHaveBeenCalledWith("invitation-private");
  });

  it("restores a server-projected private call after remount", async () => {
    const context = liveContext("private");
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result } = renderHook(() => useClassroomAudioBridge({
      roomId: "room-classe-live",
      source: "live",
      execute,
      privateStudentId: student.id,
    }));

    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(result.current.mode).toBe("private");
    expect(context.setRegieContact).toHaveBeenCalledWith("room-classe-live", student.id);
  });

  it("publishes the Class speaker only after the public leg is audible", async () => {
    const context = liveContext("public");
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result, unmount } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await act(() => result.current.startPublic(student));
    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(execute).toHaveBeenCalledWith({ type: "classe.speaker", personId: student.id });

    unmount();
    await waitFor(() => expect(context.takeCallOffAir).toHaveBeenCalledWith("invitation-public"));
    expect(context.endCall).toHaveBeenCalledWith("invitation-public");
  });

  it("owns the single start and stop speaker commits in the demo transport", async () => {
    useOptionalRoomLiveCall.mockReturnValue(null);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-demo", source: "demo", execute }));

    await act(() => result.current.startPublic(student));
    await act(() => result.current.stop());

    expect(execute.mock.calls.map(([command]) => command)).toEqual([
      { type: "classe.speaker", personId: student.id },
      { type: "classe.speaker", personId: null },
    ]);
  });

  it("removes the public media leg and compensates a possibly-applied speaker commit", async () => {
    const context = liveContext("public");
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (command: RoomToolsCommand) => {
      if (command.type === "classe.speaker" && command.personId === student.id) throw new Error("revision_conflict");
      return undefined;
    });
    const { result } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(context.takeCallOffAir).toHaveBeenCalledWith("invitation-public");
    expect(context.endCall).toHaveBeenCalledWith("invitation-public");
    expect(execute.mock.calls.map(([command]) => command)).toEqual([
      { type: "classe.speaker", personId: student.id },
      { type: "classe.speaker", personId: null },
    ]);
  });

  it("clears the projected speaker when the public invitation ends remotely", async () => {
    let context = liveContext("public");
    useOptionalRoomLiveCall.mockImplementation(() => context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result, rerender } = renderHook(() => useClassroomAudioBridge({
      roomId: "room-classe-live",
      source: "live",
      execute,
      publicSpeakerStudentId: student.id,
    }));

    await waitFor(() => expect(result.current.phase).toBe("active"));
    context = {
      ...context,
      invitations: [{ ...context.invitations[0], status: "ended" as const, isOnAir: false }],
      onAirInvitationIds: new Set<string>(),
      audibleOnAirInvitationIds: new Set<string>(),
    };
    rerender();

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(execute).toHaveBeenCalledWith({ type: "classe.speaker", personId: null });
  });

  it("restores control of an accepted public preview/on-air call after remount", async () => {
    const context = liveContext("public");
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result } = renderHook(() => useClassroomAudioBridge({
      roomId: "room-classe-live",
      source: "live",
      execute,
      publicSpeakerStudentId: student.id,
    }));

    await waitFor(() => expect(result.current.phase).toBe("active"));
    await act(() => result.current.stop());
    expect(context.takeCallOffAir).toHaveBeenCalledWith("invitation-public");
    expect(context.endCall).toHaveBeenCalledWith("invitation-public");
  });

  it("restores and cancels an unprojected pending public invitation exactly once", async () => {
    const context = liveContext("public");
    context.invitations = [{
      ...context.invitations[0],
      status: "pending" as const,
      routeMode: "preview" as const,
      isOnAir: false,
    }];
    context.mediaSessions = [];
    context.onAirInvitationIds = new Set<string>();
    context.audibleOnAirInvitationIds = new Set<string>();
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (_command: RoomToolsCommand) => undefined);
    const { result } = renderHook(() => useClassroomAudioBridge({ roomId: "room-classe-live", source: "live", execute }));

    await waitFor(() => expect(result.current.phase).toBe("waiting"));
    expect(result.current.studentId).toBe(student.id);
    await act(() => Promise.all([result.current.stop(), result.current.stop()]));

    expect(context.endCall).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: "classe.speaker", personId: null });
    expect(result.current.phase).toBe("idle");
  });

  it("surfaces a failed final speaker commit after the public media leg is closed", async () => {
    const context = liveContext("public");
    useOptionalRoomLiveCall.mockReturnValue(context);
    const execute = vi.fn(async (command: RoomToolsCommand) => {
      if (command.type === "classe.speaker" && command.personId === null) throw new Error("revision_conflict");
      return undefined;
    });
    const { result } = renderHook(() => useClassroomAudioBridge({
      roomId: "room-classe-live",
      source: "live",
      execute,
      publicSpeakerStudentId: student.id,
    }));

    await waitFor(() => expect(result.current.phase).toBe("active"));
    await act(async () => {
      await expect(result.current.stop()).rejects.toThrow("revision_conflict");
    });

    expect(context.endCall).toHaveBeenCalledTimes(1);
    expect(result.current.studentId).toBeNull();
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toMatch(/mise en écoute/i);
  });
});
