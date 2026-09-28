import { describe, expect, it, vi } from "vitest";
import { RoomEvent, type Room } from "../../../lib/byteplusRtc";
import {
  PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME,
  PlaceLiveKitService,
  type PlaceLiveKitAccess,
} from "./placeLiveKit.service";

const ROOM_ID = "78c1d981-71a6-4ef3-aa59-32800cb856b2";
const HOST_ID = "f12a0714-3a04-45d0-8c62-c0dd439680b1";

function accessFixture(): PlaceLiveKitAccess {
  return {
    token: `001testapp${"a".repeat(80)}`,
    appId: "testapp", roomName: "mw-test", roomId: ROOM_ID,
    expiresAt: new Date(Date.now()+120_000).toISOString(), members: [],
    identity: HOST_ID,
    role: "host",
    canPublish: true,
    programAudioPublisherIdentity: HOST_ID,
  };
}

function fakeAudioTrack() {
  const target = new EventTarget() as EventTarget & {
    id: string;
    kind: "audio";
    readyState: MediaStreamTrackState;
    enabled: boolean;
    stop: ReturnType<typeof vi.fn>;
  };
  Object.assign(target, {
    id: "call-program-track",
    kind: "audio" as const,
    readyState: "live" as MediaStreamTrackState,
    enabled: true,
    stop: vi.fn(),
  });
  return target;
}

function fakeRoom() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const publication = {
    trackSid: "TR_call_program",
    track: null as unknown,
    trackName: PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME,
    isMuted: false,
    mute: vi.fn(async function mute(this: { isMuted: boolean }) {
      this.isMuted = true;
    }),
    unmute: vi.fn(async function unmute(this: { isMuted: boolean }) {
      this.isMuted = false;
    }),
  };
  const trackPublications = new Map<string, typeof publication>();
  const localParticipant = {
    identity: HOST_ID,
    permissions: { canPublish: true },
    isCameraEnabled: false,
    trackPublications,
    videoTrackPublications: new Map(),
    publishTrack: vi.fn(async (track: MediaStreamTrack, options: { name: string }) => {
      publication.track = track;
      publication.trackName = options.name;
      trackPublications.set(publication.trackSid, publication);
      return publication;
    }),
    unpublishTrack: vi.fn(async () => {
      trackPublications.clear();
    }),
    getTrackPublicationByName: vi.fn((name: string) => (
      [...trackPublications.values()].find((candidate) => candidate.trackName === name)
    )),
    setCameraEnabled: vi.fn(async () => undefined),
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

describe("PlaceLiveKitService — pont téléphone public", () => {
  it('cancels a Program publication that completes after leaving the Room', async () => {
    const transport = fakeRoom();
    const clone = Object.assign(fakeAudioTrack(), { kind: 'video' });
    const source = Object.assign(fakeAudioTrack(), { kind: 'video', clone: () => clone });
    let finish!: () => void;
    transport.localParticipant.publishTrack.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve(transport.publication);
    }));
    const service = new PlaceLiveKitService({ requestAccess: async () => accessFixture(), createRoom: () => transport.room });
    await service.connect(ROOM_ID);
    const publishing = service.publishProgramVideo(source as unknown as MediaStreamTrack);
    await vi.waitFor(() => expect(transport.localParticipant.publishTrack).toHaveBeenCalled());
    await service.disconnect();
    finish();
    expect(await publishing).toBe(false);
    expect(clone.enabled).toBe(false);
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(transport.publication.unmute).not.toHaveBeenCalled();
  });
  it('publishes Program through the existing host connection and releases its clone', async () => {
    const transport = fakeRoom();
    const clone = Object.assign(fakeAudioTrack(), { kind: 'video' });
    const source = Object.assign(fakeAudioTrack(), { kind: 'video', clone: () => clone });
    const service = new PlaceLiveKitService({ requestAccess: async () => accessFixture(), createRoom: () => transport.room });
    expect(await service.connect(ROOM_ID)).toBe(true);
    expect(await service.publishProgramVideo(source as unknown as MediaStreamTrack)).toBe(true);
    expect(await service.publishProgramVideo(source as unknown as MediaStreamTrack)).toBe(true);
    expect(transport.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    expect(transport.localParticipant.publishTrack).toHaveBeenCalledWith(clone, expect.objectContaining({ name: 'meewav.video.program' }));
    expect(clone.enabled).toBe(true);
    await service.setCameraEnabled(false);
    expect(clone.enabled).toBe(false);
    await service.disconnect();
    expect(clone.stop).toHaveBeenCalledOnce();
    expect(source.stop).not.toHaveBeenCalled();
  });
  it("prépare toujours la piste muette puis exige une confirmation distincte", async () => {
    const transport = fakeRoom();
    const track = fakeAudioTrack();
    const service = new PlaceLiveKitService({
      requestAccess: async () => accessFixture(),
      createRoom: () => transport.room,
    });

    expect(await service.connect(ROOM_ID)).toBe(true);
    expect(await service.prepareCallProgramTrack(track as unknown as MediaStreamTrack, "call-gen-1")).toBe(true);
    expect(transport.localParticipant.publishTrack).toHaveBeenCalledWith(
      track,
      expect.objectContaining({ name: PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME }),
    );
    expect(track.enabled).toBe(false);
    expect(transport.publication.isMuted).toBe(true);
    expect(service.getSnapshot()).toMatchObject({
      callProgramPublished: true,
      callProgramAudible: false,
      callProgramGeneration: "call-gen-1",
    });

    expect(await service.setCallProgramEnabled(true)).toBe(true);
    expect(track.enabled).toBe(true);
    expect(transport.publication.isMuted).toBe(false);
    expect(service.getSnapshot().callProgramAudible).toBe(true);

    transport.emit(RoomEvent.Reconnecting);
    expect(track.enabled).toBe(false);
    expect(service.getSnapshot().callProgramAudible).toBe(false);

    await service.disconnect();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("la coupure la plus récente annule un unmute encore en vol", async () => {
    const transport = fakeRoom();
    const track = fakeAudioTrack();
    const service = new PlaceLiveKitService({
      requestAccess: async () => accessFixture(),
      createRoom: () => transport.room,
    });
    expect(await service.connect(ROOM_ID)).toBe(true);
    expect(await service.prepareCallProgramTrack(track as unknown as MediaStreamTrack, "call-gen-race")).toBe(true);

    let releaseUnmute!: () => void;
    transport.publication.unmute.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseUnmute = () => {
        transport.publication.isMuted = false;
        resolve();
      };
    }));
    const enabling = service.setCallProgramEnabled(true);
    await vi.waitFor(() => expect(transport.publication.unmute).toHaveBeenCalled());
    const disabling = service.setCallProgramEnabled(false);
    expect(track.enabled).toBe(false);
    expect(service.getSnapshot().callProgramAudible).toBe(false);

    releaseUnmute();
    await expect(enabling).resolves.toBe(false);
    await expect(disabling).resolves.toBe(true);
    expect(track.enabled).toBe(false);
    expect(transport.publication.isMuted).toBe(true);
  });
});
