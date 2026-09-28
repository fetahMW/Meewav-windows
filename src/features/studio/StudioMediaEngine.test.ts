import { describe, expect, it, vi } from "vitest";
import type { Room } from "../../lib/byteplusRtc";
import { StudioMediaEngine } from "./StudioMediaEngine";
import type { PlaceLiveKitAccess } from "../rooms/place/placeLiveKit.service";

const roomId = "48b7bbdf-0567-4c68-8e59-f8802c802e09";
const access: PlaceLiveKitAccess = {
  appId: "testapp", roomName: "mw-test", roomId,
  expiresAt: new Date(Date.now()+120_000).toISOString(), members: [],
  token: `001testapp${"a".repeat(80)}`,
  identity: "qa-host",
  role: "host",
  canPublish: true,
  programAudioPublisherIdentity: "qa-host",
};

function fixture() {
  const video = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn() } as unknown as MediaStreamTrack;
  const audio = { readyState: "live", stop: vi.fn(), addEventListener: vi.fn() } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  const publishTrack = vi.fn().mockResolvedValue({});
  const connect = vi.fn().mockResolvedValue(undefined);
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const on = vi.fn();
  const room = { connect, disconnect, on, localParticipant: { publishTrack } } as unknown as Room;
  const capture = vi.fn().mockResolvedValue(stream);
  const requestAccess = vi.fn().mockResolvedValue(access);
  const engine = new StudioMediaEngine({ capture, access: requestAccess, room: () => room });
  return { engine, video, audio, capture, requestAccess, publishTrack, connect, disconnect };
}

describe("StudioMediaEngine", () => {
  it("keeps local preview private, then publishes only on explicit action and releases everything", async () => {
    const test = fixture();
    await test.engine.prepare();
    expect(test.engine.getSnapshot().phase).toBe("private");
    expect(test.requestAccess).not.toHaveBeenCalled();
    expect(test.connect).not.toHaveBeenCalled();
    expect(test.publishTrack).not.toHaveBeenCalled();

    await test.engine.publish(roomId);
    expect(test.requestAccess).toHaveBeenCalledWith(roomId);
    expect(test.connect).toHaveBeenCalledTimes(1);
    expect(test.publishTrack).toHaveBeenCalledTimes(2);
    expect(test.engine.getSnapshot().phase).toBe("live");

    await test.engine.stop();
    expect(test.disconnect).toHaveBeenCalledTimes(1);
    expect(test.video.stop).toHaveBeenCalledTimes(1);
    expect(test.audio.stop).toHaveBeenCalledTimes(1);
    expect(test.engine.getSnapshot().phase).toBe("idle");
  });

  it("refuses a viewer token before any transport or track is published", async () => {
    const test = fixture();
    test.requestAccess.mockResolvedValueOnce({ ...access, role: "viewer", canPublish: false });
    await test.engine.prepare();
    await expect(test.engine.publish(roomId)).rejects.toThrow("droit de publier");
    expect(test.connect).not.toHaveBeenCalled();
    expect(test.publishTrack).not.toHaveBeenCalled();
    expect(test.video.stop).toHaveBeenCalledTimes(1);
    expect(test.audio.stop).toHaveBeenCalledTimes(1);
  });

  it("releases camera and microphone before a slow network disconnect completes", async () => {
    const test = fixture();
    await test.engine.prepare(); await test.engine.publish(roomId);
    let finishDisconnect!: () => void;
    test.disconnect.mockImplementation(() => new Promise<void>(resolve => { finishDisconnect = resolve; }));
    const stopping = test.engine.stop();
    expect(test.video.stop).toHaveBeenCalledOnce();
    expect(test.audio.stop).toHaveBeenCalledOnce();
    expect(test.engine.getSnapshot().stream).toBeNull();
    finishDisconnect(); await stopping;
  });
});
