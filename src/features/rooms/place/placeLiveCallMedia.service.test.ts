import { describe, expect, it, vi } from "vitest";
import { RoomEvent, type Room } from "livekit-client";
import {
  PLACE_LIVE_CALL_HOST_TRACK_NAME,
  PlaceLiveCallMediaService,
  parsePlaceLiveCallMediaAccess,
  type PlaceLiveCallMediaAccess,
} from "./placeLiveCallMedia.service";

const CALL_ID = "0d8e2999-9ba6-47da-902b-b3e0b5f340ad";
const PUBLIC_ROOM_ID = "78c1d981-71a6-4ef3-aa59-32800cb856b2";
const HOST_IDENTITY = `${PUBLIC_ROOM_ID}:call:${CALL_ID}`;
const CONTACT_IDENTITY = `f12a0714-3a04-45d0-8c62-c0dd439680b1:call:${CALL_ID}`;
const TOKEN = `${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`;

function accessFixture(overrides: Partial<PlaceLiveCallMediaAccess> = {}): PlaceLiveCallMediaAccess {
  return {
    token: TOKEN,
    serverUrl: "wss://rtc.meewav.test/",
    participantIdentity: HOST_IDENTITY,
    peerIdentity: CONTACT_IDENTITY,
    role: "host",
    invitationId: CALL_ID,
    callId: CALL_ID,
    publicRoomId: PUBLIC_ROOM_ID,
    ...overrides,
  };
}

function fakeAudioTrack(label: string) {
  const target = new EventTarget() as EventTarget & {
    kind: "audio";
    readyState: MediaStreamTrackState;
    enabled: boolean;
    label: string;
    clone: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  Object.assign(target, {
    kind: "audio" as const,
    readyState: "live" as MediaStreamTrackState,
    enabled: true,
    label,
    clone: vi.fn(),
    stop: vi.fn(),
  });
  return target;
}

function fakeRoom(identity = HOST_IDENTITY) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const publication = {
    trackSid: "TR_call_audio",
    track: null as unknown,
    isMuted: true,
    mute: vi.fn(async function mute(this: { isMuted: boolean }) {
      this.isMuted = true;
    }),
    unmute: vi.fn(async function unmute(this: { isMuted: boolean }) {
      this.isMuted = false;
    }),
  };
  const published = new Map<string, typeof publication>();
  const localParticipant = {
    identity,
    permissions: { canPublish: true },
    publishTrack: vi.fn(async (track: MediaStreamTrack, options: { name: string }) => {
      publication.track = { mediaStreamTrack: track };
      published.set(options.name, publication);
      return publication;
    }),
    unpublishTrack: vi.fn(async () => undefined),
    getTrackPublicationByName: vi.fn((name: string) => published.get(name)),
  };
  const room = {
    localParticipant,
    remoteParticipants: new Map(),
    canPlaybackAudio: true,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    startAudio: vi.fn(async () => undefined),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(listener);
      listeners.set(event, bucket);
    }),
    off: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(listener);
    }),
  };
  return {
    room: room as unknown as Room,
    localParticipant,
    publication,
    emit(event: RoomEvent, ...args: unknown[]) {
      listeners.get(event)?.forEach((listener) => listener(...args));
    },
  };
}

describe("parsePlaceLiveCallMediaAccess", () => {
  it("normalise le contrat canonique host/contact sans élargir les identités", () => {
    expect(parsePlaceLiveCallMediaAccess({
      token: TOKEN,
      serverUrl: "wss://rtc.meewav.test",
      participantIdentity: HOST_IDENTITY,
      peerIdentity: CONTACT_IDENTITY,
      role: "host",
      invitationId: CALL_ID,
      publicRoomId: PUBLIC_ROOM_ID,
    })).toEqual(accessFixture());
  });

  it("accepte les alias de transition callee/callId/roomId puis les normalise", () => {
    const access = parsePlaceLiveCallMediaAccess({
      token: TOKEN,
      serverUrl: "ws://127.0.0.1:7880",
      participantIdentity: CONTACT_IDENTITY,
      peerIdentity: HOST_IDENTITY,
      role: "callee",
      callId: CALL_ID,
      roomId: PUBLIC_ROOM_ID,
    });
    expect(access.role).toBe("contact");
    expect(access.invitationId).toBe(CALL_ID);
    expect(access.callId).toBe(CALL_ID);
    expect(access.publicRoomId).toBe(PUBLIC_ROOM_ID);
  });

  it("refuse un transport non sécurisé ou des alias d’appel contradictoires", () => {
    expect(() => parsePlaceLiveCallMediaAccess({
      ...accessFixture(),
      serverUrl: "ws://rtc.meewav.test",
    })).toThrow(/transport sécurisé/u);
    expect(() => parsePlaceLiveCallMediaAccess({
      ...accessFixture(),
      callId: "b24146f2-c79f-4523-9333-6eefc6a64289",
    })).toThrow(/incohérent/u);
  });
});

describe("PlaceLiveCallMediaService", () => {
  it("publie seulement un clone nommé et ne stoppe jamais la source du Host", async () => {
    const transport = fakeRoom();
    const source = fakeAudioTrack("source");
    const clone = fakeAudioTrack("clone");
    source.clone.mockReturnValue(clone);
    const service = new PlaceLiveCallMediaService({
      requestAccess: async () => accessFixture(),
      createRoom: () => transport.room,
    });

    expect(await service.connect(CALL_ID)).toBe(true);
    expect(await service.setLocalTrack(source as unknown as MediaStreamTrack)).toBe(true);
    expect(transport.localParticipant.publishTrack).toHaveBeenCalledWith(
      clone,
      expect.objectContaining({ name: PLACE_LIVE_CALL_HOST_TRACK_NAME }),
    );
    expect(service.getSnapshot().localAudible).toBe(false);
    expect(await service.setEnabled(true)).toBe(true);
    expect(clone.enabled).toBe(true);

    transport.emit(RoomEvent.Reconnecting);
    expect(clone.enabled).toBe(false);
    expect(service.getSnapshot().localAudible).toBe(false);
    expect(service.getSnapshot().status).toBe("reconnecting");

    await service.disconnect();
    expect(clone.stop).toHaveBeenCalledTimes(1);
    expect(source.stop).not.toHaveBeenCalled();
  });

  it("laisse toujours OFF gagner contre un unmute ON encore en attente", async () => {
    const transport = fakeRoom();
    const source = fakeAudioTrack("source-race");
    const clone = fakeAudioTrack("clone-race");
    source.clone.mockReturnValue(clone);
    let releaseUnmute!: () => void;
    const deferredUnmute = new Promise<void>((resolve) => {
      releaseUnmute = resolve;
    });
    transport.publication.unmute.mockImplementationOnce(async () => {
      await deferredUnmute;
      transport.publication.isMuted = false;
    });
    const service = new PlaceLiveCallMediaService({
      requestAccess: async () => accessFixture(),
      createRoom: () => transport.room,
    });

    expect(await service.connect(CALL_ID)).toBe(true);
    expect(await service.setLocalTrack(source as unknown as MediaStreamTrack)).toBe(true);
    const enabling = service.setEnabled(true);
    await vi.waitFor(() => expect(transport.publication.unmute).toHaveBeenCalledTimes(1));

    const disabling = service.setEnabled(false);
    expect(clone.enabled).toBe(false);
    expect(service.getSnapshot().localAudible).toBe(false);
    releaseUnmute();

    expect(await enabling).toBe(false);
    expect(await disabling).toBe(true);
    expect(clone.enabled).toBe(false);
    expect(transport.publication.isMuted).toBe(true);
    expect(service.getSnapshot().localAudible).toBe(false);
    await service.disconnect();
    expect(source.stop).not.toHaveBeenCalled();
  });
});
