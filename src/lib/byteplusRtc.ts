import type { IRTCEngine, StreamIndex, MediaType } from "@byteplus/rtc";
type SdkEvents = typeof import("@byteplus/rtc").default.events;
// SDK event enums have identical wire values; avoid loading the browser SDK
// until connect() so SSR and unit tests remain independent of WebRTC globals.
const sdkEvent = <Name extends keyof SdkEvents>(name: Name) => name as unknown as SdkEvents[Name];

/** Trusted policy returned by our authenticated token endpoint, never by a peer. */
export type BytePlusMember = {
  identity: string;
  role: string;
  canPublish: boolean;
  canReceive: boolean;
  audioTrackName?: string;
  metadata?: Record<string, unknown>;
};
export type BytePlusAccess = {
  appId: string;
  token: string;
  roomName: string;
  roomId: string;
  identity: string;
  canPublish: boolean;
  role: string;
  expiresAt: string;
  members: BytePlusMember[];
};

export enum ConnectionState {
  Disconnected = "disconnected", Connecting = "connecting", Connected = "connected",
  Reconnecting = "reconnecting", SignalReconnecting = "signalReconnecting",
}
export enum RoomEvent {
  SignalReconnecting = "signalReconnecting", TrackPublished = "trackPublished", TrackUnpublished = "trackUnpublished",
  Connected = "connected", Disconnected = "disconnected", Reconnecting = "reconnecting", Reconnected = "reconnected",
  ConnectionStateChanged = "connectionStateChanged", AudioPlaybackStatusChanged = "audioPlaybackStatusChanged",
  ParticipantConnected = "participantConnected", ParticipantDisconnected = "participantDisconnected",
  ParticipantMetadataChanged = "participantMetadataChanged", ParticipantPermissionsChanged = "participantPermissionsChanged",
  LocalTrackPublished = "localTrackPublished", LocalTrackUnpublished = "localTrackUnpublished",
  TrackSubscribed = "trackSubscribed", TrackUnsubscribed = "trackUnsubscribed",
  TrackMuted = "trackMuted", TrackUnmuted = "trackUnmuted",
}
export const AudioPresets = {
  speech: { maxBitrate: 32_000 },
  musicHighQuality: { maxBitrate: 128_000 }, musicHighQualityStereo: { maxBitrate: 192_000 },
};

/** The presentation API is deliberately independent of the SDK's hidden players. */
export class Track {
  readonly kind: Track.Kind;
  readonly attachedElements = new Set<HTMLMediaElement>();
  sid = "";
  constructor(public mediaStreamTrack: MediaStreamTrack) {
    this.kind = mediaStreamTrack.kind === "video" ? Track.Kind.Video : Track.Kind.Audio;
  }
  get isMuted() { return !this.mediaStreamTrack.enabled; }
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    const target = element ?? document.createElement(this.kind === Track.Kind.Video ? "video" : "audio");
    target.srcObject = new MediaStream([this.mediaStreamTrack]);
    target.autoplay = true;
    if (target instanceof HTMLVideoElement) target.playsInline = true;
    this.attachedElements.add(target);
    return target;
  }
  detach(element?: HTMLMediaElement): HTMLMediaElement[] {
    const targets = element ? [element] : [...this.attachedElements];
    for (const target of targets) {
      if (this.attachedElements.delete(target)) { target.pause(); target.srcObject = null; }
    }
    return targets;
  }
  stop() { this.detach(); this.mediaStreamTrack.stop(); }
}
export namespace Track {
  export enum Kind { Audio = "audio", Video = "video", Unknown = "unknown" }
  export enum Source { Camera = "camera", Microphone = "microphone", ScreenShare = "screen_share", ScreenShareAudio = "screen_share_audio", Unknown = "unknown" }
}
export class RemoteAudioTrack extends Track {}
export class RemoteVideoTrack extends Track {}
export class LocalAudioTrack extends Track {}
export class LocalVideoTrack extends Track {}
export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack;

export class TrackPublication {
  isMuted: boolean;
  isSubscribed = true;
  readonly kind: Track.Kind;
  constructor(public trackSid: string, public trackName: string, public source: Track.Source, public track?: Track) {
    this.kind = track?.kind ?? Track.Kind.Unknown;
    this.isMuted = track?.isMuted ?? true;
    if (track) track.sid = trackSid;
  }
}
export class RemoteTrackPublication extends TrackPublication {}
export class LocalTrackPublication extends TrackPublication {
  constructor(sid: string, name: string, source: Track.Source, track: Track, private readonly setGate: (publication: LocalTrackPublication, muted: boolean) => Promise<void>) {
    super(sid, name, source, track);
  }
  mute() { return this.setGate(this, true); }
  unmute() { return this.setGate(this, false); }
}
export class Participant {
  metadata = "{}";
  permissions = { canPublish: false, canSubscribe: true };
  trackPublications = new Map<string, TrackPublication>();
  constructor(public identity = "") {}
  get audioTrackPublications() { return new Map([...this.trackPublications].filter(([, p]) => p.kind === Track.Kind.Audio)); }
  get videoTrackPublications() { return new Map([...this.trackPublications].filter(([, p]) => p.kind === Track.Kind.Video)); }
  getTrackPublicationByName(name: string) { return [...this.trackPublications.values()].find((p) => p.trackName === name); }
  getTrackPublication(source: Track.Source) { return [...this.trackPublications.values()].find((p) => p.source === source); }
}
export class RemoteParticipant extends Participant {}
type PublishOptions = {
  name?: string; source?: Track.Source; stream?: string; audioPreset?: unknown;
  dtx?: boolean; red?: boolean; simulcast?: boolean; videoEncoding?: unknown; forceStereo?: boolean;
};
export class LocalParticipant extends Participant {
  constructor(private readonly owner: Room) { super(); }
  get isCameraEnabled() { return [...this.videoTrackPublications.values()].some((p) => p.source === Track.Source.Camera && !p.isMuted); }
  publishTrack(track: MediaStreamTrack | Track, options: PublishOptions = {}) { return this.owner.publishTrack(track instanceof Track ? track.mediaStreamTrack : track, options); }
  unpublishTrack(track: MediaStreamTrack | Track, stopOnUnpublish = false) { return this.owner.unpublishTrack(track instanceof Track ? track.mediaStreamTrack : track, stopOnUnpublish); }
  setCameraEnabled(enabled: boolean, constraints?: MediaTrackConstraints) { return this.owner.setCameraEnabled(enabled, constraints); }
}

type RoomOptions = {
  adaptiveStream?: boolean; dynacast?: boolean; disconnectOnPageLeave?: boolean; stopLocalTrackOnUnpublish?: boolean;
  /** Test injection. Production always imports the official BytePlus Web SDK. */
  engineFactory?: (appId: string) => Promise<{ engine: IRTCEngine; destroy: () => void }>;
  audioContextFactory?: () => AudioContext;
};
type ConnectOptions = { autoSubscribe?: boolean; access: BytePlusAccess; refreshAccess?: () => Promise<BytePlusAccess>; policyRefreshIntervalMs?: number };
type Listener = (...args: any[]) => void;
type AudioInput = { source: MediaStreamAudioSourceNode; gain: GainNode };
const MAIN = 0 as StreamIndex;
const SCREEN = 1 as StreamIndex;
const AUDIO = 1 as MediaType;
const VIDEO = 2 as MediaType;
// BytePlus 4.69: EXTERNAL is 0; INTERNAL is 1 (the inverse of many RTC SDKs).
const EXTERNAL = 0;

/**
 * One BytePlus engine per session (public Room or private call). Logical studio
 * audio inputs are mixed into MAIN, matching Android's external PCM program.
 * SCREEN stays separate. This module never accepts a LiveKit URL/JWT.
 */
export class Room {
  readonly localParticipant = new LocalParticipant(this);
  readonly remoteParticipants = new Map<string, RemoteParticipant>();
  state = ConnectionState.Disconnected;
  canPlaybackAudio = true;
  private listeners = new Map<string, Set<Listener>>();
  private engine: IRTCEngine | null = null;
  private destroyEngine: (() => void) | null = null;
  private access: BytePlusAccess | null = null;
  private refreshAccess: (() => Promise<BytePlusAccess>) | undefined;
  private refreshPromise: Promise<void> | null = null;
  private epoch = 0;
  private serial = 0;
  private commits: Promise<unknown> = Promise.resolve();
  private policyTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private inputs = new Map<string, AudioInput>();
  private published = new Map<StreamIndex, number>();
  private announced = new Map<string, { userId: string; index: StreamIndex; mediaType: number }>();
  private subscribing = new Map<string, Promise<void>>();
  private cameraStream: MediaStream | null = null;
  private cameraRequest = 0;
  constructor(private readonly options: RoomOptions = {}) {}
  on(event: RoomEvent | string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener); this.listeners.set(event, listeners); return this;
  }
  off(event: RoomEvent | string, listener: Listener) { this.listeners.get(event)?.delete(listener); return this; }
  private emit(event: RoomEvent, ...args: unknown[]) { this.listeners.get(event)?.forEach((listener) => listener(...args)); }
  private setState(state: ConnectionState) { this.state = state; this.emit(RoomEvent.ConnectionStateChanged, state); }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.commits.catch(() => undefined).then(operation); this.commits = result; return result;
  }
  async connect(appId: string, token: string, options: ConnectOptions): Promise<void> {
    if (!options?.access || options.access.appId !== appId || options.access.token !== token) throw new Error("Autorisation BytePlus absente ou incohérente.");
    const epoch = ++this.epoch;
    this.access = options.access; this.refreshAccess = options.refreshAccess;
    this.localParticipant.identity = options.access.identity;
    this.localParticipant.permissions.canPublish = options.access.canPublish;
    this.setState(ConnectionState.Connecting);
    const created = this.options.engineFactory ? await this.options.engineFactory(appId) : await (async () => {
      const { default: sdk } = await import("@byteplus/rtc");
      const engine = sdk.createEngine(appId);
      return { engine, destroy: () => sdk.destroyEngine(engine) };
    })();
    if (epoch !== this.epoch) { created.destroy(); throw new Error("Connexion annulée."); }
    const engine = this.engine = created.engine;
    this.destroyEngine = created.destroy;
    const current = () => this.engine === engine && epoch === this.epoch;
    const announce = (index: StreamIndex) => (event: { userId: string; mediaType: MediaType }) => {
      if (!current()) return;
      const key = `${event.userId}:${index}`;
      this.announced.set(key, { userId: event.userId, index, mediaType: (this.announced.get(key)?.mediaType ?? 0) | event.mediaType });
      void this.refreshPolicy().then(() => this.subscribeRemote(key)).catch(() => undefined);
    };
    const unannounce = (index: StreamIndex) => (event: { userId: string; mediaType: MediaType }) => {
      if (!current()) return;
      const key = `${event.userId}:${index}`;
      const entry = this.announced.get(key);
      if (entry) { entry.mediaType &= ~event.mediaType; if (!entry.mediaType) this.announced.delete(key); }
      this.removeRemoteTracks(event.userId, index, event.mediaType);
      void (index === MAIN ? engine.unsubscribeStream(event.userId, event.mediaType) : engine.unsubscribeScreen(event.userId, event.mediaType)).catch(() => undefined);
    };
    engine.on(sdkEvent("onUserPublishStream"), announce(MAIN));
    engine.on(sdkEvent("onUserPublishScreen"), announce(SCREEN));
    engine.on(sdkEvent("onUserUnpublishStream"), unannounce(MAIN));
    engine.on(sdkEvent("onUserUnpublishScreen"), unannounce(SCREEN));
    engine.on(sdkEvent("onUserLeave"), ({ userInfo }) => {
      if (!current()) return;
      const participant = this.remoteParticipants.get(userInfo.userId);
      this.removeRemoteTracks(userInfo.userId, MAIN, 3); this.removeRemoteTracks(userInfo.userId, SCREEN, 3);
      this.announced.delete(`${userInfo.userId}:0`); this.announced.delete(`${userInfo.userId}:1`);
      this.remoteParticipants.delete(userInfo.userId);
      if (participant) this.emit(RoomEvent.ParticipantDisconnected, participant);
    });
    engine.on(sdkEvent("onTokenWillExpire"), () => { void this.refreshPolicy().catch(() => this.disconnect()); });
    engine.on(sdkEvent("onConnectionStateChanged"), ({ state }) => {
      if (!current()) return;
      if (state === 4 || state === 6) { this.setState(ConnectionState.Reconnecting); this.emit(RoomEvent.Reconnecting); }
      if (state === 5) { this.setState(ConnectionState.Connected); void this.refreshPolicy().then(() => this.emit(RoomEvent.Reconnected)).catch(() => this.disconnect()); }
      if (state === 1 && this.state !== ConnectionState.Connecting) { this.setState(ConnectionState.Reconnecting); this.emit(RoomEvent.Reconnecting); }
    });
    engine.on(sdkEvent("onAutoplayFailed"), () => { this.canPlaybackAudio = false; this.emit(RoomEvent.AudioPlaybackStatusChanged); });
    try {
      // Musical profile: stereo, 48 kHz, 128 kbit/s, configured before capture.
      await engine.setAudioProfile(3);
      await engine.joinRoom(token, options.access.roomName, { userId: options.access.identity }, {
        isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false,
      });
      if (!current()) throw new Error("Connexion annulée.");
      this.setState(ConnectionState.Connected);
      this.emit(RoomEvent.Connected);
      // Same membership cadence as Android, also closes revoked media gates.
      this.policyTimer = setInterval(() => { void this.refreshPolicy().catch(() => undefined); }, options.policyRefreshIntervalMs ?? 2_000);
    } catch (error) { if (current()) await this.disconnect(); throw error; }
  }
  private refreshPolicy(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    if (!this.refreshAccess || !this.engine || !this.access) return Promise.resolve();
    const epoch = this.epoch, engine = this.engine, previous = this.access;
    const operation = (async () => {
      const next = await this.refreshAccess!();
      if (epoch !== this.epoch) return;
      if (next.appId !== previous.appId || next.roomName !== previous.roomName || next.identity !== previous.identity) {
        throw Object.assign(new Error("L’autorisation BytePlus a changé de session."), { accessDenied: true });
      }
      const previousPermission = this.localParticipant.permissions.canPublish;
      if (!next.canPublish) {
        this.localParticipant.permissions.canPublish = false;
        for (const p of this.localParticipant.trackPublications.values()) {
          p.isMuted = true; if (p.track) p.track.mediaStreamTrack.enabled = false;
          const input = this.inputs.get(p.trackSid); if (input) input.gain.gain.value = 0;
        }
      }
      if (next.token !== previous.token) {
        try { await engine.updateToken(next.token); }
        catch { throw Object.assign(new Error("Le renouvellement BytePlus a été refusé."), { accessDenied: true }); }
      }
      if (epoch !== this.epoch) return;
      this.access = next;
      this.localParticipant.permissions.canPublish = next.canPublish;
      if (previousPermission !== next.canPublish) this.emit(RoomEvent.ParticipantPermissionsChanged, { canPublish: previousPermission }, this.localParticipant);
      for (const [key, entry] of this.announced) {
        if (!this.allowedMember(entry.userId, entry.index)) {
          const subscribed = this.remoteParticipants.get(entry.userId)?.trackPublications;
          if (subscribed && [...subscribed.keys()].some((sid) => sid.startsWith(`${entry.userId}:${entry.index}:`))) {
            this.removeRemoteTracks(entry.userId, entry.index, 3);
            await (entry.index === MAIN ? engine.unsubscribeStream(entry.userId, 3) : engine.unsubscribeScreen(entry.userId, 3)).catch(() => undefined);
          }
        } else { await this.subscribeRemote(key); }
      }
    })().catch(async (error) => {
      // A denied/expired authorization must never leave a public microphone open.
      if (epoch === this.epoch && ((error as { accessDenied?: boolean })?.accessDenied || Date.parse(this.access?.expiresAt ?? "") <= Date.now())) await this.disconnect();
      throw error;
    }).finally(() => { if (this.refreshPromise === operation) this.refreshPromise = null; });
    this.refreshPromise = operation;
    return operation;
  }
  private allowedMember(identity: string, index: StreamIndex) {
    const member = this.access?.members.find((m) => m.identity === identity && m.canPublish && m.canReceive);
    return member && (index === MAIN || member.role === "host") ? member : null;
  }
  private subscribeRemote(key: string): Promise<void> {
    const existing = this.subscribing.get(key); if (existing) return existing;
    const entry = this.announced.get(key), engine = this.engine, epoch = this.epoch;
    if (!entry || !engine) return Promise.resolve();
    const member = this.allowedMember(entry.userId, entry.index); if (!member) return Promise.resolve();
    const participant = this.remoteParticipants.get(entry.userId) ?? new RemoteParticipant(entry.userId);
    const existed = this.remoteParticipants.has(entry.userId);
    participant.permissions.canPublish = true;
    participant.metadata = JSON.stringify({ ...member.metadata, roomId: this.access!.roomId, role: member.role });
    this.remoteParticipants.set(entry.userId, participant);
    if (!existed) this.emit(RoomEvent.ParticipantConnected, participant);
    this.emit(RoomEvent.ParticipantMetadataChanged, "", participant);
    const requestedMedia = entry.mediaType;
    const missing = [AUDIO, VIDEO].filter((kind) => (requestedMedia & kind) && !participant.trackPublications.has(`${key}:${kind}`));
    if (!missing.length) return Promise.resolve();
    const operation = (async () => {
      // SDK playback is silenced; exactly one application-owned renderer plays it.
      engine.setPlaybackVolume(entry.userId, entry.index, 0);
      if (entry.index === MAIN) await engine.subscribeStream(entry.userId, requestedMedia);
      else await engine.subscribeScreen(entry.userId, requestedMedia);
      for (const kind of missing) {
        let media: MediaStreamTrack | undefined;
        for (let attempt = 0; attempt < 20 && epoch === this.epoch && this.announced.has(key); attempt++) {
          media = engine.getRemoteStreamTrack(entry.userId, entry.index, kind === AUDIO ? "audio" : "video");
          if (media) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (!media || epoch !== this.epoch || !this.allowedMember(entry.userId, entry.index) || !(this.announced.get(key)?.mediaType! & kind)) continue;
        const sid = `${key}:${kind}`;
        const track = kind === AUDIO ? new RemoteAudioTrack(media) : new RemoteVideoTrack(media);
        const source = entry.index === SCREEN ? (kind === AUDIO ? Track.Source.ScreenShareAudio : Track.Source.ScreenShare) : (kind === AUDIO ? Track.Source.Microphone : Track.Source.Camera);
        const name = entry.index === SCREEN ? (kind === AUDIO ? "meewav.screen.audio" : "meewav.screen") : (kind === AUDIO ? (member.audioTrackName ?? "meewav.voice") : "meewav.video.program");
        const publication = new RemoteTrackPublication(sid, name, source, track);
        publication.isMuted = false;
        participant.trackPublications.set(sid, publication);
        this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
      }
    })().finally(() => {
      this.subscribing.delete(key);
      if (epoch === this.epoch && this.announced.has(key) && this.announced.get(key)!.mediaType !== requestedMedia) {
        void this.subscribeRemote(key).catch(() => undefined);
      }
    });
    this.subscribing.set(key, operation); return operation;
  }
  private removeRemoteTracks(userId: string, index: StreamIndex, mediaType: number) {
    const participant = this.remoteParticipants.get(userId); if (!participant) return;
    for (const kind of [AUDIO, VIDEO]) {
      if (!(mediaType & kind)) continue;
      const sid = `${userId}:${index}:${kind}`, publication = participant.trackPublications.get(sid);
      if (!publication) continue;
      publication.track?.detach(); participant.trackPublications.delete(sid);
      this.emit(RoomEvent.TrackUnsubscribed, publication.track, publication, participant);
    }
  }
  publishTrack(media: MediaStreamTrack, options: PublishOptions): Promise<LocalTrackPublication> {
    return this.enqueue(async () => {
      const engine = this.engine, epoch = this.epoch;
      if (!engine || this.state !== ConnectionState.Connected || !this.access?.canPublish || media.readyState !== "live") throw new Error("Publication BytePlus non autorisée.");
      const source = options.source ?? (media.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera);
      const index = source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio ? SCREEN : MAIN;
      const kind = media.kind === "audio" ? AUDIO : VIDEO;
      if (index === SCREEN && this.access.role !== "host") throw new Error("Partage d’écran réservé à l’hôte.");
      const name = options.name ?? source;
      const old = this.localParticipant.getTrackPublicationByName(name);
      if (old?.track?.mediaStreamTrack === media) return old as LocalTrackPublication;
      if (old?.track) await this.unpublishInternal(old.track.mediaStreamTrack, false);
      // MAIN audio has a mixer. Other SDK slots carry exactly one source.
      if (kind !== AUDIO || index !== MAIN) {
        for (const existing of [...this.localParticipant.trackPublications.values()]) {
          const existingIndex = existing.source === Track.Source.ScreenShare || existing.source === Track.Source.ScreenShareAudio ? SCREEN : MAIN;
          if (existingIndex === index && existing.kind === (kind === AUDIO ? Track.Kind.Audio : Track.Kind.Video) && existing.track) {
            await this.unpublishInternal(existing.track.mediaStreamTrack, false);
          }
        }
      }
      const sid = `local:${++this.serial}`;
      const track = kind === AUDIO ? new LocalAudioTrack(media) : new LocalVideoTrack(media);
      const publication = new LocalTrackPublication(sid, name, source, track, (p, muted) => this.setGate(p, muted));
      this.localParticipant.trackPublications.set(sid, publication);
      try {
        if (kind === AUDIO && index === MAIN) {
          if (!this.audioContext) {
            this.audioContext = this.options.audioContextFactory?.() ?? new AudioContext({ sampleRate: 48_000, latencyHint: "interactive" });
            this.audioDestination = this.audioContext.createMediaStreamDestination();
          }
          const node = this.audioContext.createMediaStreamSource(new MediaStream([media]));
          const gain = this.audioContext.createGain(); gain.gain.value = publication.isMuted ? 0 : 1;
          node.connect(gain).connect(this.audioDestination!); this.inputs.set(sid, { source: node, gain });
          await this.audioContext.resume();
          if (!(this.published.get(MAIN)! & AUDIO)) {
            await engine.setAudioSourceType(MAIN, EXTERNAL);
            await engine.setExternalAudioTrack(MAIN, this.audioDestination!.stream.getAudioTracks()[0]);
          }
        } else if (kind === AUDIO) {
          await engine.setAudioSourceType(index, EXTERNAL); await engine.setExternalAudioTrack(index, media);
        } else {
          await engine.setVideoSourceType(index, EXTERNAL); await engine.setExternalVideoTrack(index, media);
        }
        if (epoch !== this.epoch) throw new Error("Publication annulée.");
        if (!((this.published.get(index) ?? 0) & kind)) {
          if (index === MAIN) await engine.publishStream(kind); else await engine.publishScreen(kind);
          this.published.set(index, (this.published.get(index) ?? 0) | kind);
        }
        if (epoch !== this.epoch) throw new Error("Publication annulée.");
        this.emit(RoomEvent.LocalTrackPublished, publication, this.localParticipant);
        return publication;
      } catch (error) { if (epoch === this.epoch) await this.unpublishInternal(media, false); throw error; }
    });
  }
  private async setGate(publication: LocalTrackPublication, muted: boolean) {
    if (!this.localParticipant.trackPublications.has(publication.trackSid)) return;
    if (!muted && !this.localParticipant.permissions.canPublish) throw new Error("Publication révoquée.");
    publication.isMuted = muted;
    if (publication.track) publication.track.mediaStreamTrack.enabled = !muted;
    const input = this.inputs.get(publication.trackSid);
    if (input) input.gain.gain.value = muted ? 0 : 1;
    this.emit(muted ? RoomEvent.TrackMuted : RoomEvent.TrackUnmuted, publication, this.localParticipant);
  }
  unpublishTrack(media: MediaStreamTrack, stop = false) { return this.enqueue(() => this.unpublishInternal(media, stop)); }
  private async unpublishInternal(media: MediaStreamTrack, stop: boolean): Promise<void> {
    const publication = [...this.localParticipant.trackPublications.values()].find((p) => p.track?.mediaStreamTrack === media);
    if (!publication) return;
    media.enabled = false;
    const input = this.inputs.get(publication.trackSid); input?.source.disconnect(); input?.gain.disconnect(); this.inputs.delete(publication.trackSid);
    this.localParticipant.trackPublications.delete(publication.trackSid);
    const index = publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio ? SCREEN : MAIN;
    const kind = media.kind === "audio" ? AUDIO : VIDEO;
    const remaining = [...this.localParticipant.trackPublications.values()].some((p) => p.kind === publication.kind && ((p.source === Track.Source.ScreenShare || p.source === Track.Source.ScreenShareAudio) ? SCREEN : MAIN) === index);
    if (!remaining && this.engine && ((this.published.get(index) ?? 0) & kind)) {
      await (index === MAIN ? this.engine.unpublishStream(kind) : this.engine.unpublishScreen(kind));
      this.published.set(index, (this.published.get(index) ?? 0) & ~kind);
    }
    publication.track?.detach(); if (stop) media.stop();
    this.emit(RoomEvent.LocalTrackUnpublished, publication, this.localParticipant);
  }
  async setCameraEnabled(enabled: boolean, constraints?: MediaTrackConstraints) {
    const request = ++this.cameraRequest;
    if (!enabled) {
      const tracks = [...this.localParticipant.videoTrackPublications.values()].filter((p) => p.source === Track.Source.Camera);
      for (const p of tracks) if (p.track) await this.unpublishTrack(p.track.mediaStreamTrack, this.cameraStream?.getTracks().includes(p.track.mediaStreamTrack) ?? false);
      this.cameraStream?.getTracks().forEach((t) => t.stop()); this.cameraStream = null; return;
    }
    if (this.localParticipant.isCameraEnabled) return;
    const epoch = this.epoch;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints ?? true });
    if (epoch !== this.epoch || request !== this.cameraRequest) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.cameraStream = stream;
    try { await this.publishTrack(stream.getVideoTracks()[0], { name: "meewav.camera", source: Track.Source.Camera }); }
    catch (error) {
      stream.getTracks().forEach((t) => t.stop());
      if (this.cameraStream === stream) this.cameraStream = null;
      if (request === this.cameraRequest && epoch === this.epoch) throw error;
    }
  }
  async startAudio() {
    await this.audioContext?.resume();
    const elements = [...this.remoteParticipants.values()].flatMap((p) => [...p.audioTrackPublications.values()].flatMap((publication) => [...(publication.track?.attachedElements ?? [])]));
    const results = await Promise.allSettled(elements.map((element) => element.play()));
    this.canPlaybackAudio = results.every((result) => result.status === "fulfilled");
    this.emit(RoomEvent.AudioPlaybackStatusChanged);
    if (!this.canPlaybackAudio) throw new Error("Active le son pour écouter la room.");
  }
  async disconnect(_stopTracks = false): Promise<void> {
    if (!this.engine && this.state === ConnectionState.Disconnected) return;
    ++this.epoch;
    ++this.cameraRequest;
    if (this.policyTimer) clearInterval(this.policyTimer); this.policyTimer = null;
    const engine = this.engine, destroy = this.destroyEngine;
    this.engine = null; this.destroyEngine = null; this.refreshAccess = undefined; this.access = null; this.refreshPromise = null;
    for (const p of this.localParticipant.trackPublications.values()) { if (p.track) { p.track.mediaStreamTrack.enabled = false; p.track.detach(); } }
    this.localParticipant.trackPublications.clear();
    for (const p of this.remoteParticipants.values()) for (const publication of p.trackPublications.values()) publication.track?.detach();
    this.remoteParticipants.clear(); this.announced.clear(); this.subscribing.clear(); this.published.clear();
    for (const input of this.inputs.values()) { input.source.disconnect(); input.gain.disconnect(); } this.inputs.clear();
    this.cameraStream?.getTracks().forEach((t) => t.stop()); this.cameraStream = null;
    this.audioDestination?.stream.getTracks().forEach((t) => t.stop()); this.audioDestination = null;
    const context = this.audioContext; this.audioContext = null; await context?.close().catch(() => undefined);
    try { await engine?.leaveRoom(); } finally { destroy?.(); }
    this.localParticipant.permissions.canPublish = false;
    this.setState(ConnectionState.Disconnected); this.emit(RoomEvent.Disconnected);
  }
}
