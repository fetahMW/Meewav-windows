import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), createEngine: vi.fn(), destroyEngine: vi.fn() }));
vi.mock("../../lib/supabaseClient", () => ({ supabase: { rpc: mock.rpc, functions: { invoke: mock.invoke } } }));
vi.mock("@byteplus/rtc", () => ({ default: { createEngine: mock.createEngine, destroyEngine: mock.destroyEngine }, RoomProfileType: { chat: 0 } }));
import { directCallAction, directCallAccess, DirectCallTransport, type DirectCall } from "./messaging.calls";
const call: DirectCall = { id: "51000000-0000-4000-8000-000000000099", conversationId: "conversation", roomId: "mw-call-51000000-0000-4000-8000-000000000099",
  status: "accepted", kind: "audio", incoming: false, peerId: "peer", peerName: "Contact", createdAt: "", answeredAt: null };
const credential = () => ({ appId: "app1", token: "001app1signed", roomId: call.roomId, identity: "self", peerId: "peer", kind: call.kind, expiresAt: Math.floor(Date.now() / 1000) + 60 });
beforeEach(() => { vi.clearAllMocks(); mock.invoke.mockResolvedValue({ data: credential(), error: null }); });
afterEach(() => { vi.useRealTimers(); });

describe("server-authorized direct calls", () => {
  it("starts audio with only the conversation ID, never a client-selected peer", async () => {
    mock.rpc.mockResolvedValue({ data: call, error: null });
    await directCallAction("start_audio", undefined, "conversation");
    expect(mock.rpc).toHaveBeenCalledWith("messaging_video_call_v1", { p_action: "start_audio", p_call_id: null, p_conversation_id: "conversation" });
  });
  it("reports busy without inventing a successful call", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "call_busy" } });
    await expect(directCallAction("start_audio", undefined, "conversation")).rejects.toThrow("déjà en appel");
  });
  it.each(["identity", "peerId", "roomId", "kind", "token"])("rejects credentials whose %s does not match the accepted call", async field => {
    mock.invoke.mockResolvedValue({ data: { ...credential(), [field]: "wrong" }, error: null });
    await expect(directCallAccess(call, "self")).rejects.toThrow("plus valide");
  });
  it("does not accept expired tokens", async () => {
    mock.invoke.mockResolvedValue({ data: { ...credential(), expiresAt: 1 }, error: null });
    await expect(directCallAccess(call, "self")).rejects.toThrow("plus valide");
  });
});

function setup() {
  const listeners = new Map<string, (...args: any[]) => void>();
  const engine = { on: vi.fn((name, listener) => listeners.set(name, listener)), setRemoteVideoPlayer: vi.fn(), setLocalVideoPlayer: vi.fn(),
    startAudioCapture: vi.fn().mockResolvedValue(undefined), stopAudioCapture: vi.fn().mockResolvedValue(undefined),
    startVideoCapture: vi.fn().mockResolvedValue(undefined), stopVideoCapture: vi.fn().mockResolvedValue(undefined),
    setVideoCaptureConfig: vi.fn().mockResolvedValue(undefined), joinRoom: vi.fn().mockResolvedValue(undefined),
    updateToken: vi.fn().mockResolvedValue(undefined), play: vi.fn().mockResolvedValue(undefined), leaveRoom: vi.fn().mockResolvedValue(undefined), removeAllListeners: vi.fn() };
  mock.createEngine.mockReturnValue(engine);
  const events = { ready: vi.fn(), failed: vi.fn(), autoplay: vi.fn() };
  const transport = new DirectCallTransport(call, "self", document.createElement("div"), document.createElement("div"), events);
  return { engine, events, listeners, transport };
}
describe("BytePlus direct-call device lifecycle", () => {
  it("waits for the user gesture before retrying SDK autoplay", async () => {
    const { transport, engine, events, listeners } = setup(); await transport.connect();
    listeners.get("onAutoplayFailed")?.({ userId: call.peerId, kind: "audio", streamIndex: 0 });
    expect(engine.play).not.toHaveBeenCalled();
    await events.autoplay.mock.calls[0][0]();
    expect(engine.play).toHaveBeenCalledWith(call.peerId, 1, 0); await transport.dispose();
  });
  it("never opens or subscribes to video for an audio call", async () => {
    const { transport, engine } = setup();
    await transport.connect(); await transport.camera(true);
    expect(engine.startVideoCapture).not.toHaveBeenCalled();
    expect(engine.joinRoom).toHaveBeenCalledWith(expect.any(String), call.roomId, { userId: "self" }, expect.objectContaining({ isAutoSubscribeVideo: false }));
    await transport.dispose();
    expect(engine.stopAudioCapture).toHaveBeenCalled(); expect(engine.leaveRoom).toHaveBeenCalledOnce(); expect(mock.destroyEngine).toHaveBeenCalledWith(engine);
  });
  it("stops capture after an in-flight microphone grant resolves following hang-up", async () => {
    const { transport, engine } = setup();
    let release!: () => void;
    engine.startAudioCapture.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const connecting = transport.connect();
    await vi.waitFor(() => expect(engine.startAudioCapture).toHaveBeenCalled());
    const disposing = transport.dispose();
    expect(transport.dispose()).toBe(disposing);
    expect(mock.destroyEngine).not.toHaveBeenCalled();
    release(); await connecting; await disposing;
    expect(engine.joinRoom).not.toHaveBeenCalled(); expect(engine.stopAudioCapture).toHaveBeenCalled(); expect(mock.destroyEngine).toHaveBeenCalledOnce();
  });
  it("disconnects and releases devices when token renewal is denied", async () => {
    vi.useFakeTimers();
    const { transport, engine, events } = setup();
    await transport.connect(); mock.invoke.mockResolvedValue({ data: null, error: new Error("revoked") });
    await vi.advanceTimersByTimeAsync(26_000);
    expect(events.failed).toHaveBeenCalledOnce(); expect(engine.stopAudioCapture).toHaveBeenCalled();
    expect(engine.leaveRoom).toHaveBeenCalled(); expect(mock.destroyEngine).toHaveBeenCalledOnce();
  });
  it("ignores RTC identities other than the authorized peer", async () => {
    const { transport, engine, events, listeners } = setup(); await transport.connect();
    listeners.get("onUserPublishStream")?.({ userId: "stranger" });
    expect(engine.setRemoteVideoPlayer).not.toHaveBeenCalled(); expect(events.ready).not.toHaveBeenCalled();
    listeners.get("onUserPublishStream")?.({ userId: call.peerId }); expect(events.ready).toHaveBeenCalledOnce();
    await transport.dispose();
  });
});
