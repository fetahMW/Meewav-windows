import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceLiveCallContact, PlaceLiveCallRequest } from "../place/placeLiveCall";
import {
  RoomLiveCallProvider,
  useRoomLiveCall,
} from "./RoomLiveCallProvider";
import type {
  RoomLiveCallInviteResult,
  RoomLiveCallInvitation,
  RoomLiveCallRepository,
  RoomLiveCallStateResult,
} from "./roomLiveCall.service";

const authHarness = vi.hoisted(() => ({
  userId: "13000000-0000-4000-8000-000000000001",
}));

const mediaHarness = vi.hoisted(() => {
  const nativeTrack = {
    id: "private-contact-track",
    kind: "audio",
    readyState: "live",
  } as unknown as MediaStreamTrack;
  const remoteTrack = {
    mediaStreamTrack: nativeTrack,
    attach: vi.fn(),
    detach: vi.fn(),
  };
  return {
    nativeTrack,
    snapshot: {
      status: "connected" as const,
      role: "host" as const,
      remoteAudio: { track: remoteTrack, muted: false, purpose: "input" as const },
      peerPresent: true,
      autoplayBlocked: false,
      localPublished: true,
      localAudible: true,
      error: null,
      startAudio: vi.fn().mockResolvedValue(true),
      resumeCall: vi.fn().mockResolvedValue(true),
      setLocalEnabled: vi.fn().mockResolvedValue(true),
      disconnect: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("../../auth", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { id: authHarness.userId },
  }),
}));

vi.mock("../place/usePlaceLiveCallMedia", () => ({
  default: () => mediaHarness.snapshot,
}));

const ROOM_ID = "13000000-0000-4000-8000-000000000002";
const HOST_ID = "13000000-0000-4000-8000-000000000003";
const CONTACT_A = "13000000-0000-4000-8000-000000000004";
const CONTACT_B = "13000000-0000-4000-8000-000000000005";
const INVITATION_ID = "13000000-0000-4000-8000-000000000006";
const ORIGINAL_MEDIA_DEVICES = navigator.mediaDevices;

let latestContext: ReturnType<typeof useRoomLiveCall> | null = null;

function ContextProbe() {
  latestContext = useRoomLiveCall();
  return null;
}

function contact(profileId: string): PlaceLiveCallContact {
  return {
    profileId,
    conversationId: "13000000-0000-4000-8000-000000000007",
    displayName: `Contact ${profileId.slice(-1)}`,
    username: null,
    avatarUrl: "/avatars/utilisateur.png",
    isVerified: false,
  };
}

function request(contacts: PlaceLiveCallContact[], mode: "private" | "public" = "private"): PlaceLiveCallRequest {
  return { roomId: ROOM_ID, contacts, mode };
}

function incomingInvitation(): RoomLiveCallInvitation {
  return {
    invitationId: INVITATION_ID,
    roomId: ROOM_ID,
    roomTitle: "La Place de Naya",
    hostProfileId: HOST_ID,
    hostUsername: "naya",
    hostDisplayName: "Naya Oris",
    hostAvatarUrl: null,
    contactProfileId: authHarness.userId,
    contactUsername: "malik",
    contactDisplayName: "Malik",
    contactAvatarUrl: null,
    partyRole: "contact",
    status: "pending",
    callMode: "private",
    routeMode: "preview",
    isOnAir: false,
    routeRevision: 1,
    invitationExpiresAt: "2099-08-15T18:01:30.000Z",
    sessionExpiresAt: null,
    createdAt: "2026-08-15T18:00:00.000Z",
  };
}

function acceptedPublicHostInvitation(): RoomLiveCallInvitation {
  return {
    ...incomingInvitation(),
    hostProfileId: authHarness.userId,
    contactProfileId: CONTACT_A,
    contactDisplayName: "Amel",
    partyRole: "host",
    status: "accepted",
    callMode: "public",
    routeMode: "public",
    isOnAir: false,
    routeRevision: 2,
    sessionExpiresAt: "2099-08-15T19:00:00.000Z",
  };
}

function acceptedPrivateHostInvitation(): RoomLiveCallInvitation {
  return {
    ...acceptedPublicHostInvitation(),
    callMode: "private",
    routeMode: "preview",
    isOnAir: false,
  };
}

function acceptedContactInvitation(): RoomLiveCallInvitation {
  return {
    ...incomingInvitation(),
    status: "accepted",
    callMode: "public",
    routeMode: "public",
    isOnAir: true,
    routeRevision: 3,
    sessionExpiresAt: "2099-08-15T19:00:00.000Z",
  };
}

function repositoryFixture(overrides: Partial<RoomLiveCallRepository> = {}) {
  return {
    listContacts: vi.fn().mockResolvedValue([]),
    listMine: vi.fn().mockResolvedValue([]),
    inviteContact: vi.fn().mockResolvedValue({
      invitationId: INVITATION_ID,
      status: "pending",
      callMode: "private",
      routeMode: "preview",
      isOnAir: false,
      routeRevision: 1,
      invitationExpiresAt: "2099-08-15T18:01:30.000Z",
      sessionExpiresAt: null,
      idempotent: false,
    }),
    respond: vi.fn(),
    setRoute: vi.fn(),
    setOnAir: vi.fn(),
    end: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    ...overrides,
  } as unknown as RoomLiveCallRepository;
}

afterEach(() => {
  cleanup();
  latestContext = null;
  vi.restoreAllMocks();
  mediaHarness.snapshot.disconnect.mockClear();
  mediaHarness.snapshot.setLocalEnabled.mockClear();
  window.localStorage.clear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: ORIGINAL_MEDIA_DEVICES,
  });
});

describe("RoomLiveCallProvider", () => {
  it("accepts with the prepared personal Master instead of opening a second raw microphone", async () => {
    const invitation = incomingInvitation();
    const ownedClone = Object.assign(new EventTarget(), { kind: "audio", readyState: "live", stop: vi.fn() });
    const master = { kind: "audio", readyState: "live", clone: vi.fn(() => ownedClone), stop: vi.fn() } as unknown as MediaStreamTrack;
    const prepare = vi.fn(async () => master);
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const OriginalStream = globalThis.MediaStream;
    Object.defineProperty(globalThis, "MediaStream", { configurable: true, value: class {
      constructor(private tracks: MediaStreamTrack[]) {}
      getAudioTracks() { return this.tracks; }
      getTracks() { return this.tracks; }
    } });
    const repository = repositoryFixture({ listMine: vi.fn().mockResolvedValue([invitation]), respond: vi.fn().mockResolvedValue({ ...invitation, status: "accepted" }) });
    const mounted = render(<MemoryRouter><RoomLiveCallProvider repository={repository}><ContextProbe /></RoomLiveCallProvider></MemoryRouter>);
    try {
      await waitFor(() => expect(latestContext?.incomingInvitations.length).toBe(1));
      act(() => latestContext!.setContactMix(ROOM_ID, { track: master, prepare }));
      expect(prepare).not.toHaveBeenCalled();
      await act(async () => { await latestContext!.acceptInvitation(INVITATION_ID); });
      expect(prepare).toHaveBeenCalledOnce();
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(repository.respond).toHaveBeenCalledWith(INVITATION_ID, true);
    } finally {
      mounted.unmount();
      Object.defineProperty(globalThis, "MediaStream", { configurable: true, value: OriginalStream });
    }
    expect(master.stop).not.toHaveBeenCalled();
  });

  it("changes only the contact's local return element volume", async () => {
    const repository = repositoryFixture({ listMine: vi.fn().mockResolvedValue([acceptedContactInvitation()]) });
    const { container } = render(<MemoryRouter><RoomLiveCallProvider repository={repository}><ContextProbe /></RoomLiveCallProvider></MemoryRouter>);
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    const audio = container.querySelector("audio")!;
    act(() => latestContext!.setContactReturnLevel(ROOM_ID, .25));
    await waitFor(() => expect(audio.volume).toBe(.25));
    act(() => latestContext!.setContactReturnLevel(ROOM_ID, 0));
    await waitFor(() => expect(audio.volume).toBe(0));
    expect(repository.setOnAir).not.toHaveBeenCalled();
    expect(repository.setRoute).not.toHaveBeenCalled();
  });

  it("closes the public Room before opening Regie talkback and closes private audio before restoring", async () => {
    mediaHarness.snapshot.setLocalEnabled.mockResolvedValue(true);
    const invitation = acceptedPrivateHostInvitation();
    const closePublic = vi.fn().mockResolvedValue(true);
    const restorePublic = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryFixture({
      listMine: vi.fn().mockResolvedValue([invitation]),
    });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext?.mediaSessions).toHaveLength(1));

    act(() => {
      latestContext!.setRegieContact(ROOM_ID, CONTACT_A);
      latestContext!.setRegieTalkbackPublicGate(ROOM_ID, { closePublic, restorePublic });
    });
    await waitFor(() => expect(latestContext!.mediaSessions[0]?.remotePlaybackSuppressed).toBe(true));

    let opened = false;
    await act(async () => {
      opened = await latestContext!.setRegieTalkbackActive(ROOM_ID, true);
    });
    expect(opened).toBe(true);
    await waitFor(() => expect(latestContext!.mediaSessions[0]?.remotePlaybackSuppressed).toBe(false));
    expect(closePublic).toHaveBeenCalledTimes(1);
    expect(mediaHarness.snapshot.setLocalEnabled).toHaveBeenCalledWith(true);
    expect(closePublic.mock.invocationCallOrder[0]).toBeLessThan(
      mediaHarness.snapshot.setLocalEnabled.mock.invocationCallOrder[0],
    );

    await act(async () => {
      await latestContext!.setRegieTalkbackActive(ROOM_ID, false);
    });
    expect(mediaHarness.snapshot.setLocalEnabled).toHaveBeenLastCalledWith(false);
    expect(restorePublic).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(latestContext!.mediaSessions[0]?.remotePlaybackSuppressed).toBe(true));
    const privateCallOrders = mediaHarness.snapshot.setLocalEnabled.mock.invocationCallOrder;
    const privateCloseOrder = privateCallOrders[privateCallOrders.length - 1] ?? 0;
    expect(privateCloseOrder).toBeLessThan(restorePublic.mock.invocationCallOrder[0]);
  });

  it("keeps Regie closed when the Host releases before the public mute finishes", async () => {
    mediaHarness.snapshot.setLocalEnabled.mockResolvedValue(true);
    let confirmPublicClosed: ((value: boolean) => void) | null = null;
    const closePublic = vi.fn(() => new Promise<boolean>((resolve) => {
      confirmPublicClosed = resolve;
    }));
    const restorePublic = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryFixture({
      listMine: vi.fn().mockResolvedValue([acceptedPrivateHostInvitation()]),
    });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext?.mediaSessions).toHaveLength(1));
    act(() => {
      latestContext!.setRegieContact(ROOM_ID, CONTACT_A);
      latestContext!.setRegieTalkbackPublicGate(ROOM_ID, { closePublic, restorePublic });
    });

    let opening!: Promise<boolean>;
    act(() => {
      opening = latestContext!.setRegieTalkbackActive(ROOM_ID, true);
    });
    await act(async () => {
      await latestContext!.setRegieTalkbackActive(ROOM_ID, false);
    });
    await act(async () => {
      confirmPublicClosed?.(true);
      await opening;
    });

    expect(mediaHarness.snapshot.setLocalEnabled).not.toHaveBeenCalledWith(true);
    expect(latestContext!.regieTalkbackActiveRoomIds.has(ROOM_ID)).toBe(false);
    expect(restorePublic).toHaveBeenCalledTimes(1);
  });

  it("allows teardown for an explicitly tracked invite during the render gap", async () => {
    const end = vi.fn().mockResolvedValue({
      invitationId: INVITATION_ID,
      status: "ended",
      callMode: "private",
      routeMode: "preview",
      isOnAir: false,
      routeRevision: 2,
      invitationExpiresAt: null,
      sessionExpiresAt: null,
      idempotent: false,
    });
    const repository = repositoryFixture({ listMine: vi.fn().mockResolvedValue([]), end });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext).not.toBeNull());

    await act(async () => {
      await latestContext!.requestLiveCallTracked(request([contact(CONTACT_A)]));
    });
    await act(async () => latestContext!.endCall(INVITATION_ID));
    expect(end).toHaveBeenCalledWith(INVITATION_ID);
  });

  it("rejects teardown for an invitation absent from both projection and tracked responses", async () => {
    const end = vi.fn();
    const repository = repositoryFixture({ listMine: vi.fn().mockResolvedValue([]), end });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext).not.toBeNull());

    let caught: unknown;
    await act(async () => {
      try {
        await latestContext!.endCall(INVITATION_ID);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toMatchObject({ code: "live_call_invitation_not_found" });
    expect(end).not.toHaveBeenCalled();
  });

  it("never binds an older matching invitation when the exact idempotent replay also fails", async () => {
    const older = {
      ...acceptedPrivateHostInvitation(),
      status: "pending" as const,
      sessionExpiresAt: null,
      createdAt: "2026-08-14T18:00:00.000Z",
    };
    const inviteContact = vi.fn().mockRejectedValue(new Error("response lost"));
    const repository = repositoryFixture({
      listMine: vi.fn().mockResolvedValue([older]),
      inviteContact,
    });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext?.outgoingInvitations).toHaveLength(1));

    let caught: unknown;
    await act(async () => {
      try {
        await latestContext!.requestLiveCallTracked(request([contact(CONTACT_A)]));
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toMatchObject({ message: "response lost" });
    const requestIds = inviteContact.mock.calls.map((call) => call[2]);
    expect(requestIds).toHaveLength(2);
    expect(new Set(requestIds).size).toBe(1);
  });

  it("recovers a lost INVITE response by replaying the exact server idempotency key", async () => {
    let attempts = 0;
    const inviteContact = vi.fn(async (_roomId: string, _profileId: string, _requestId: string, callMode = "private" as const) => {
      if (attempts++ === 0) throw new Error("response lost");
      return {
        invitationId: INVITATION_ID,
        status: "pending" as const,
        callMode,
        routeMode: "preview" as const,
        isOnAir: false,
        routeRevision: 1,
        invitationExpiresAt: "2099-08-15T18:01:30.000Z",
        sessionExpiresAt: null,
        idempotent: true,
      };
    });
    const repository = repositoryFixture({ inviteContact });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext).not.toBeNull());

    let invitationIds: string[] = [];
    await act(async () => {
      invitationIds = await latestContext!.requestLiveCallTracked(request([contact(CONTACT_A)]));
    });

    expect(invitationIds).toEqual([INVITATION_ID]);
    expect(inviteContact).toHaveBeenCalledTimes(2);
    expect(inviteContact.mock.calls[0][2]).toBe(inviteContact.mock.calls[1][2]);
  });

  it("reuses one stable UUID when a multi-contact request is retried after a partial failure", async () => {
    let contactBFailures = 0;
    const inviteContact = vi.fn(async (_roomId: string, profileId: string, _requestId: string, callMode = "private" as const) => {
      if (profileId === CONTACT_B && contactBFailures++ < 2) throw new Error("temporary");
      return {
        invitationId: INVITATION_ID,
        status: "pending" as const,
        callMode,
        routeMode: "preview" as const,
        isOnAir: false,
        routeRevision: 1,
        invitationExpiresAt: "2099-08-15T18:01:30.000Z",
        sessionExpiresAt: null,
        idempotent: contactBFailures > 1,
      };
    });
    const repository = repositoryFixture({ inviteContact });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext).not.toBeNull());

    let firstError: unknown;
    await act(async () => {
      try {
        await latestContext!.requestLiveCall(request([contact(CONTACT_A), contact(CONTACT_B)]));
      } catch (error) {
        firstError = error;
      }
    });
    expect(firstError).toBeInstanceOf(Error);

    await act(async () => {
      await latestContext!.requestLiveCall(request([contact(CONTACT_A), contact(CONTACT_B)]));
    });

    const requestIds = inviteContact.mock.calls.map((call) => call[2]);
    expect(requestIds).toHaveLength(5);
    expect(new Set(requestIds).size).toBe(1);
  });

  it("does not accept server-side when microphone permission is denied", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const respond = vi.fn();
    const repository = repositoryFixture({
      listMine: vi.fn().mockResolvedValue([incomingInvitation()]),
      respond,
    });
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext?.incomingInvitations).toHaveLength(1));

    let acceptanceError: unknown;
    await act(async () => {
      try {
        await latestContext!.acceptInvitation(INVITATION_ID);
      } catch (error) {
        acceptanceError = error;
      }
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(respond).not.toHaveBeenCalled();
    expect(acceptanceError).toMatchObject({
      code: "microphone_permission_denied",
      message: "Autorisation du microphone refusée. L’appel n’a pas été accepté.",
    });
  });

  it("never stops a Host Room voice track owned by the public media layer", async () => {
    const repository = repositoryFixture();
    const hostTrack = {
      kind: "audio",
      readyState: "live",
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    const view = render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext).not.toBeNull());

    act(() => latestContext!.setHostVoiceTrack(ROOM_ID, hostTrack));
    view.unmount();

    expect(hostTrack.stop).not.toHaveBeenCalled();
  });

  it("waits for the server on-air CAS before opening the local public intent gate", async () => {
    let resolveAuthorization!: (value: RoomLiveCallStateResult) => void;
    const setOnAir = vi.fn((_invitationId: string, _enabled: boolean, _revision: number) => new Promise<RoomLiveCallStateResult>((resolve) => {
      resolveAuthorization = resolve;
    }));
    const repository = repositoryFixture({
      listMine: vi.fn().mockResolvedValue([acceptedPublicHostInvitation()]),
      setOnAir,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext?.mediaSessions[0]?.remoteTrack).toBe(mediaHarness.nativeTrack));
    const preflight = vi.fn().mockResolvedValue(true);
    act(() => latestContext!.setCallProgramPreflight(ROOM_ID, preflight));

    let confirmation!: Promise<void>;
    act(() => {
      confirmation = latestContext!.confirmCallOnAir(INVITATION_ID);
    });
    await waitFor(() => expect(setOnAir).toHaveBeenCalledWith(INVITATION_ID, true, 2));
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(latestContext!.onAirInvitationIds.has(INVITATION_ID)).toBe(false);

    await act(async () => {
      resolveAuthorization({
        invitationId: INVITATION_ID,
        callMode: "public",
        routeMode: "public",
        isOnAir: true,
        routeRevision: 3,
        idempotent: false,
      });
      await confirmation;
    });
    expect(latestContext!.onAirInvitationIds.has(INVITATION_ID)).toBe(true);
    expect(latestContext!.audibleOnAirInvitationIds.has(INVITATION_ID)).toBe(false);
  });

  it("disconnects the private media gate before a hang-up RPC resolves", async () => {
    let resolveEnd!: (value: RoomLiveCallInviteResult) => void;
    const end = vi.fn((_invitationId: string) => new Promise<RoomLiveCallInviteResult>((resolve) => {
      resolveEnd = resolve;
    }));
    const repository = repositoryFixture({
      listMine: vi.fn()
        .mockResolvedValueOnce([acceptedPublicHostInvitation()])
        .mockResolvedValue([]),
      end,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext?.mediaSessions).toHaveLength(1));

    let ending!: Promise<void>;
    act(() => {
      ending = latestContext!.endCall(INVITATION_ID);
    });
    expect(mediaHarness.snapshot.disconnect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveEnd({
        invitationId: INVITATION_ID,
        status: "ended",
        callMode: "public",
        routeMode: "preview",
        isOnAir: false,
        routeRevision: 3,
        invitationExpiresAt: null,
        sessionExpiresAt: null,
        idempotent: false,
      });
      await ending;
    });
  });

  it("mute le retour Host privé dans le même commit logique que le handoff vers le programme public", async () => {
    const repository = repositoryFixture({
      listMine: vi.fn().mockResolvedValue([acceptedContactInvitation()]),
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const view = render(
      <MemoryRouter>
        <RoomLiveCallProvider repository={repository} pollIntervalMs={60_000}>
          <ContextProbe />
        </RoomLiveCallProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(latestContext?.mediaSessions).toHaveLength(1));
    const privateReturn = view.container.querySelector<HTMLAudioElement>(".room-live-call-remote-audio");
    expect(privateReturn).not.toBeNull();
    expect(privateReturn!.muted).toBe(false);

    act(() => latestContext!.setContactPublicProgramActive(ROOM_ID, true));
    await waitFor(() => {
      expect(latestContext!.contactPublicProgramRoomIds.has(ROOM_ID)).toBe(true);
      expect(latestContext!.mediaSessions[0]?.remotePlaybackSuppressed).toBe(true);
      expect(privateReturn!.muted).toBe(true);
    });

    act(() => latestContext!.setContactPublicProgramActive(ROOM_ID, false));
    await waitFor(() => {
      expect(latestContext!.contactPublicProgramRoomIds.has(ROOM_ID)).toBe(false);
      expect(latestContext!.mediaSessions[0]?.remotePlaybackSuppressed).toBe(false);
      expect(privateReturn!.muted).toBe(false);
    });
  });
});
