import type { IRTCEngine } from "@byteplus/rtc";
import { supabase } from "../../lib/supabaseClient";
type SdkEvents = typeof import("@byteplus/rtc").default.events;
const sdkEvent = <Name extends keyof SdkEvents>(name: Name) => name as unknown as SdkEvents[Name];

export type DirectCall = {
  id: string; conversationId: string; status: "ringing" | "accepted" | "declined" | "ended" | "missed";
  incoming: boolean; kind: "audio" | "video"; peerId: string; peerName: string; roomId: string;
  createdAt: string; answeredAt: string | null;
};
type Action = "peek" | "sync" | "start" | "start_audio" | "accept" | "decline" | "end";
export const isActiveDirectCall = (call: DirectCall | null): boolean => Boolean(call && ["ringing", "accepted"].includes(call.status));
export async function directCallAction(action: Action, callId?: string, conversationId?: string): Promise<DirectCall | null> {
  const { data, error } = await supabase.rpc("messaging_video_call_v1", {
    p_action: action, p_call_id: callId ?? null, p_conversation_id: conversationId ?? null,
  });
  if (error) {
    if (error.message.includes("call_busy")) throw new Error("Un des participants est déjà en appel.");
    if (error.message.includes("call_rate_limited")) throw new Error("Patiente un instant avant de rappeler.");
    if (error.message.includes("call_not_allowed") || error.message.includes("direct_conversation_required")) throw new Error("Cette conversation ne permet pas les appels directs.");
    throw new Error("Le service d’appel est indisponible. Réessaie dans un instant.");
  }
  if (!data) return null;
  if (!data.id || !data.peerId || !["audio", "video"].includes(data.kind)
    || !["ringing", "accepted", "declined", "ended", "missed"].includes(data.status)) throw new Error("Réponse du service d’appel invalide.");
  return data as DirectCall;
}

type Access = { appId: string; token: string; identity: string; roomId: string; peerId: string; kind: DirectCall["kind"]; expiresAt: number };
export async function directCallAccess(call: DirectCall, identity: string): Promise<Access> {
  const { data, error } = await supabase.functions.invoke("messaging-call-token", { body: { callId: call.id } });
  if (error || !data || typeof data.appId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.appId)
    || typeof data.token !== "string" || !data.token.startsWith(`001${data.appId}`)
    || data.roomId !== `mw-call-${call.id}` || data.roomId !== call.roomId
    || data.identity !== identity || data.peerId !== call.peerId || data.kind !== call.kind
    || !Number.isFinite(data.expiresAt) || data.expiresAt * 1000 <= Date.now()) {
    throw new Error("L’autorisation de cet appel n’est plus valide.");
  }
  return data;
}

/** A direct call owns its engine and capture devices; no Room audio routing is reused. */
export class DirectCallTransport {
  private engine?: IRTCEngine;
  private sdk?: typeof import("@byteplus/rtc")["default"];
  private disposed = false;
  private timer?: ReturnType<typeof setInterval>;
  private connection?: Promise<void>;
  private disposal?: Promise<void>;
  private failureSent = false;
  private renewalBusy = false;
  private microphoneEpoch = 0;
  private cameraEpoch = 0;
  constructor(private call: DirectCall, private identity: string, private local: HTMLElement, private remote: HTMLElement,
    private events: { ready(): void; failed(message: string): void; autoplay(resume: () => Promise<unknown>): void }) {}

  connect() { return this.disposed ? Promise.resolve() : this.connection ??= this.connectInternal(); }
  private fail(message: string) {
    if (this.disposed || this.failureSent) return;
    this.failureSent = true;
    this.events.failed(message);
    void this.dispose();
  }
  private async connectInternal() {
    const [credentials, { default: SDK, RoomProfileType }] = await Promise.all([directCallAccess(this.call, this.identity), import("@byteplus/rtc")]);
    if (this.disposed) return;
    this.sdk = SDK;
    const engine = this.engine = SDK.createEngine(credentials.appId);
    engine.on(sdkEvent("onUserJoined"), ({ userInfo }) => { if (!this.disposed && userInfo.userId === this.call.peerId) this.events.ready(); });
    engine.on(sdkEvent("onUserPublishStream"), ({ userId, mediaType }) => {
      if (this.disposed || userId !== this.call.peerId) return;
      if (this.call.kind === "video" && (mediaType === 2 || mediaType === 3)) engine.setRemoteVideoPlayer(0, { userId, renderDom: this.remote });
      this.events.ready();
    });
    engine.on(sdkEvent("onUserLeave"), ({ userInfo }) => { if (userInfo.userId === this.call.peerId) this.fail("Ton contact a quitté l’appel."); });
    engine.on(sdkEvent("onError"), () => this.fail("La connexion de l’appel a été interrompue."));
    engine.on(sdkEvent("onAutoplayFailed"), event => {
      if (!this.disposed && (!event.userId || [this.identity, this.call.peerId].includes(event.userId))) {
        this.events.autoplay(() => engine.play(event.userId || undefined, event.kind === "audio" ? 1 : 2, event.streamIndex));
      }
    });
    await engine.startAudioCapture();
    if (this.disposed) return;
    if (this.call.kind === "video") {
      await engine.setVideoCaptureConfig({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } });
      if (this.disposed) return;
      await engine.startVideoCapture();
      if (this.disposed) return;
      engine.setLocalVideoPlayer(0, { renderDom: this.local });
    }
    await engine.joinRoom(credentials.token, credentials.roomId, { userId: credentials.identity }, {
      roomProfileType: RoomProfileType.chat, isAutoPublish: true, isAutoSubscribeAudio: true,
      isAutoSubscribeVideo: this.call.kind === "video",
    });
    if (this.disposed) return;
    let expiresAt = credentials.expiresAt;
    this.timer = setInterval(async () => {
      if (this.disposed || this.renewalBusy) return;
      if (Date.now() >= expiresAt * 1000) { this.fail("L’autorisation de l’appel a expiré."); return; }
      if (Date.now() < expiresAt * 1000 - 35_000) return;
      this.renewalBusy = true;
      try {
        const next = await directCallAccess(this.call, this.identity);
        if (this.disposed) return;
        if (next.appId !== credentials.appId) throw new Error("call_identity_changed");
        await engine.updateToken(next.token);
        expiresAt = next.expiresAt;
      } catch { this.fail("L’autorisation de l’appel a expiré."); }
      finally { this.renewalBusy = false; }
    }, 1000);
  }
  async microphone(enabled: boolean) {
    const engine = this.engine; const epoch = ++this.microphoneEpoch;
    if (!engine || this.disposed) return;
    await (enabled ? engine.startAudioCapture() : engine.stopAudioCapture());
    if (enabled && (this.disposed || epoch !== this.microphoneEpoch)) await engine.stopAudioCapture();
  }
  async camera(enabled: boolean) {
    const engine = this.engine; const epoch = ++this.cameraEpoch;
    if (!engine || this.disposed || this.call.kind !== "video") return;
    await (enabled ? engine.startVideoCapture() : engine.stopVideoCapture());
    if (enabled && (this.disposed || epoch !== this.cameraEpoch)) await engine.stopVideoCapture();
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true; clearInterval(this.timer);
    if (this.engine) void Promise.allSettled([this.engine.stopAudioCapture(), this.engine.stopVideoCapture()]);
    return this.disposal = this.disposeInternal();
  }
  private async disposeInternal() {
    await this.connection?.catch(() => undefined);
    const engine = this.engine; this.engine = undefined;
    if (engine) {
      engine.removeAllListeners();
      await Promise.allSettled([engine.stopAudioCapture(), engine.stopVideoCapture(), engine.leaveRoom()]);
      this.sdk?.destroyEngine(engine);
    }
  }
}
