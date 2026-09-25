import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AudioPresets,
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from "livekit-client";
import { supabase } from "../../../lib/supabaseClient";

export const PLACE_LIVE_CALL_HOST_TRACK_NAME = "meewav.call.return";
export const PLACE_LIVE_CALL_CONTACT_TRACK_NAME = "meewav.call.input";
export const PLACE_LIVE_CALL_STREAM_NAME = "meewav.call";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

export type PlaceLiveCallMediaRole = "host" | "contact";

export type PlaceLiveCallMediaStatus =
  | "idle"
  | "requesting_token"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type PlaceLiveCallMediaAccess = {
  token: string;
  serverUrl: string;
  participantIdentity: string;
  peerIdentity: string;
  role: PlaceLiveCallMediaRole;
  /** The invitation is also the stable client-side call identifier today. */
  invitationId: string;
  callId: string;
  publicRoomId: string;
};

export type PlaceLiveCallRemoteAudio = {
  key: string;
  publicationSid: string;
  participantIdentity: string;
  track: RemoteAudioTrack;
  muted: boolean;
  purpose: "return" | "input";
};

export type PlaceLiveCallMediaSnapshot = {
  callId: string | null;
  invitationId: string | null;
  publicRoomId: string | null;
  status: PlaceLiveCallMediaStatus;
  role: PlaceLiveCallMediaRole | null;
  participantIdentity: string | null;
  peerIdentity: string | null;
  error: string | null;
  autoplayBlocked: boolean;
  localPublished: boolean;
  localAudible: boolean;
  localTrackName: string | null;
  peerPresent: boolean;
  remoteAudio: PlaceLiveCallRemoteAudio | null;
};

type PlaceLiveCallMediaListener = () => void;

export type PlaceLiveCallMediaServiceOptions = {
  requestAccess?: (invitationId: string) => Promise<PlaceLiveCallMediaAccess>;
  createRoom?: () => Room;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseAliasedUuid(
  record: Record<string, unknown>,
  primary: string,
  alias: string,
  label: string,
) {
  const primaryValue = optionalString(record, primary);
  const aliasValue = optionalString(record, alias);
  if (primaryValue && aliasValue && primaryValue !== aliasValue) {
    throw new Error(`${label} incohérent.`);
  }
  const value = primaryValue ?? aliasValue;
  if (!value || !UUID_PATTERN.test(value)) throw new Error(`${label} invalide.`);
  return value;
}

function parseSecureLiveKitUrl(value: string | null) {
  if (!value) throw new Error("Adresse de l’appel absente.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Adresse de l’appel invalide.");
  }
  const loopback = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]";
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && loopback)) {
    throw new Error("L’appel doit utiliser un transport sécurisé.");
  }
  return url.toString();
}

function normalizeRole(value: unknown): PlaceLiveCallMediaRole | null {
  if (value === "host") return "host";
  if (value === "contact" || value === "callee") return "contact";
  return null;
}

function normalizeMetadataRole(value: unknown): PlaceLiveCallMediaRole | null {
  if (value === "phone_host") return "host";
  if (value === "phone_contact") return "contact";
  return normalizeRole(value);
}

export function parsePlaceLiveCallMediaAccess(value: unknown): PlaceLiveCallMediaAccess {
  const record = asRecord(value);
  const token = optionalString(record, "token");
  const participantIdentity = optionalString(record, "participantIdentity");
  const peerIdentity = optionalString(record, "peerIdentity");
  const role = normalizeRole(record.role);
  const invitationId = parseAliasedUuid(
    record,
    "invitationId",
    "callId",
    "Identifiant de l’invitation d’appel",
  );
  const callId = parseAliasedUuid(
    record,
    "callId",
    "invitationId",
    "Identifiant de l’appel",
  );
  const publicRoomId = parseAliasedUuid(
    record,
    "publicRoomId",
    "roomId",
    "Identifiant de la Room publique",
  );

  if (!token || token.length < 32 || token.length > 32_768 || token.split(".").length !== 3) {
    throw new Error("Jeton de l’appel invalide.");
  }
  if (!participantIdentity
    || !peerIdentity
    || !SAFE_IDENTITY_PATTERN.test(participantIdentity)
    || !SAFE_IDENTITY_PATTERN.test(peerIdentity)
    || participantIdentity === peerIdentity) {
    throw new Error("Identité de l’appel invalide.");
  }
  if (!role) throw new Error("Rôle de l’appel invalide.");

  return {
    token,
    serverUrl: parseSecureLiveKitUrl(optionalString(record, "serverUrl")),
    participantIdentity,
    peerIdentity,
    role,
    invitationId,
    callId,
    publicRoomId,
  };
}

export async function requestPlaceLiveCallMediaAccess(
  invitationId: string,
  client: SupabaseClient = supabase,
): Promise<PlaceLiveCallMediaAccess> {
  if (!UUID_PATTERN.test(invitationId)) {
    throw new Error("Connexion à l’appel refusée : invitation invalide.");
  }
  const { data, error } = await client.functions.invoke("rooms-live-call-token", {
    body: { invitationId },
  });
  if (error) throw new Error("Le transport privé de l’appel est indisponible.");
  const access = parsePlaceLiveCallMediaAccess(data);
  if (access.invitationId !== invitationId && access.callId !== invitationId) {
    throw new Error("Le jeton reçu ne correspond pas à l’appel demandé.");
  }
  return access;
}

function createDefaultRoom() {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    stopLocalTrackOnUnpublish: false,
  });
}

function initialSnapshot(): PlaceLiveCallMediaSnapshot {
  return {
    callId: null,
    invitationId: null,
    publicRoomId: null,
    status: "idle",
    role: null,
    participantIdentity: null,
    peerIdentity: null,
    error: null,
    autoplayBlocked: false,
    localPublished: false,
    localAudible: false,
    localTrackName: null,
    peerPresent: false,
    remoteAudio: null,
  };
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/**
 * Owns the private, two-person LiveKit room used by one MeeWav live call.
 * It deliberately never publishes into the public Room and never owns the
 * caller-provided MediaStreamTrack: only a disposable clone crosses the SFU.
 */
export class PlaceLiveCallMediaService {
  private readonly requestAccess: (invitationId: string) => Promise<PlaceLiveCallMediaAccess>;
  private readonly createRoom: () => Room;
  private readonly listeners = new Set<PlaceLiveCallMediaListener>();
  private snapshot = initialSnapshot();
  private room: Room | null = null;
  private access: PlaceLiveCallMediaAccess | null = null;
  private roomGeneration = 0;
  private lifecycleRequest = 0;
  private activeLifecycleRequest = 0;
  private connectPromise: Promise<boolean> | null = null;
  private connectPromiseRequest = 0;
  private lifecycleChain: Promise<void> = Promise.resolve();
  private mediaChain: Promise<void> = Promise.resolve();
  private roomEventCleanups: Array<() => void> = [];
  private sourceTrack: MediaStreamTrack | null = null;
  private sourceEndedCleanup: (() => void) | null = null;
  private clonedTrack: MediaStreamTrack | null = null;
  private cloneEndedCleanup: (() => void) | null = null;
  private publication: LocalTrackPublication | null = null;
  private enabledIntent = false;
  /**
   * Monotonic privacy gate. It changes synchronously for every explicit ON/OFF
   * and every fail-closed teardown, so an older async unmute can never win.
   */
  private mediaIntentRevision = 0;

  constructor(options: PlaceLiveCallMediaServiceOptions = {}) {
    this.requestAccess = options.requestAccess ?? requestPlaceLiveCallMediaAccess;
    this.createRoom = options.createRoom ?? createDefaultRoom;
  }

  subscribe = (listener: PlaceLiveCallMediaListener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  connect(invitationId: string): Promise<boolean> {
    if (!UUID_PATTERN.test(invitationId)) {
      const request = ++this.lifecycleRequest;
      this.roomGeneration += 1;
      this.activeLifecycleRequest = 0;
      this.connectPromise = null;
      this.closeLocalGate(true);
      this.clearRemoteAudio();
      return this.enqueueLifecycle(async () => {
        await this.teardownCurrentRoom(true);
        if (request === this.lifecycleRequest) {
          this.replaceSnapshot({
            ...initialSnapshot(),
            callId: invitationId || null,
            invitationId: invitationId || null,
            status: "failed",
            error: "Connexion à l’appel refusée : invitation invalide.",
          });
        }
        return false;
      });
    }
    if (this.snapshot.invitationId === invitationId
      && this.snapshot.status === "connected"
      && this.room
      && this.activeLifecycleRequest === this.lifecycleRequest) return Promise.resolve(true);
    if (this.snapshot.invitationId === invitationId
      && this.connectPromise
      && this.connectPromiseRequest === this.lifecycleRequest) return this.connectPromise;

    const request = ++this.lifecycleRequest;
    const generation = ++this.roomGeneration;
    this.closeLocalGate(true);
    this.clearRemoteAudio();
    const operation = this.enqueueLifecycle(async () => {
      if (request !== this.lifecycleRequest || generation !== this.roomGeneration) return false;
      return this.connectFresh(invitationId, generation, request);
    }).finally(() => {
      if (this.connectPromise === operation) this.connectPromise = null;
    });
    this.connectPromise = operation;
    this.connectPromiseRequest = request;
    return operation;
  }

  disconnect(): Promise<void> {
    const request = ++this.lifecycleRequest;
    this.roomGeneration += 1;
    this.activeLifecycleRequest = 0;
    this.connectPromise = null;
    this.closeLocalGate(true);
    this.clearRemoteAudio();
    return this.enqueueLifecycle(async () => {
      if (request !== this.lifecycleRequest) return;
      await this.teardownCurrentRoom(true);
      if (request === this.lifecycleRequest) this.replaceSnapshot(initialSnapshot());
    });
  }

  async startAudio() {
    const room = this.room;
    const generation = this.roomGeneration;
    if (!room || this.snapshot.status !== "connected") return false;
    try {
      await room.startAudio();
      if (!this.isCurrent(room, generation)) return false;
      this.patchSnapshot({ autoplayBlocked: !room.canPlaybackAudio, error: null });
      return room.canPlaybackAudio;
    } catch (error) {
      if (!this.isCurrent(room, generation)) return false;
      this.patchSnapshot({
        autoplayBlocked: true,
        error: readableError(error, "Le navigateur bloque encore le son de l’appel."),
      });
      return false;
    }
  }

  setLocalTrack(track: MediaStreamTrack | null | undefined): Promise<boolean> {
    const nextTrack = track ?? null;
    if (nextTrack && (nextTrack.kind !== "audio" || nextTrack.readyState !== "live")) {
      return Promise.resolve(false);
    }
    return this.enqueueMedia(async () => {
      if (this.sourceTrack === nextTrack && (!nextTrack || this.clonedTrack)) return true;
      const shouldEnable = this.enabledIntent;
      const intentRevision = this.mediaIntentRevision;
      await this.releaseLocalCloneInternal(false);
      this.clearSourceReference();
      this.sourceTrack = nextTrack;
      if (!nextTrack) {
        this.enabledIntent = false;
        return true;
      }

      const onSourceEnded = () => {
        if (this.sourceTrack !== nextTrack) return;
        this.closeLocalGate(true);
        void this.setLocalTrack(null);
      };
      nextTrack.addEventListener("ended", onSourceEnded, { once: true });
      this.sourceEndedCleanup = () => nextTrack.removeEventListener("ended", onSourceEnded);

      const room = this.room;
      const generation = this.roomGeneration;
      if (!this.canPublish(room)) {
        // The hook may provide its source while the short-lived token is still
        // loading. Preserve that explicit intent until connectFresh can clone.
        this.enabledIntent = shouldEnable && intentRevision === this.mediaIntentRevision;
        return true;
      }
      const prepared = await this.prepareLocalCloneInternal(room!, generation);
      if (!prepared || !shouldEnable || intentRevision !== this.mediaIntentRevision) return prepared;
      this.enabledIntent = true;
      return this.applyEnabledInternal(true, room!, generation, intentRevision);
    });
  }

  setEnabled(enabled: boolean): Promise<boolean> {
    const intentRevision = ++this.mediaIntentRevision;
    this.enabledIntent = enabled;
    if (!enabled) this.closeLocalGate(true, false);
    return this.enqueueMedia(async () => {
      if (intentRevision !== this.mediaIntentRevision) return false;
      // A lifecycle teardown may have closed the remembered gate while this
      // explicit request was waiting in the serialized media queue.
      this.enabledIntent = enabled;
      const room = this.room;
      const generation = this.roomGeneration;
      if (!enabled) return this.applyEnabledInternal(false, room, generation, intentRevision);
      if (!this.sourceTrack) {
        this.closeLocalGate(true);
        return false;
      }
      if (!this.canPublish(room)) {
        // A positive request made while the token/connection is pending is
        // still explicit. It is consumed once, on the first safe publication.
        return this.snapshot.status === "requesting_token"
          || this.snapshot.status === "connecting"
          || this.snapshot.status === "idle";
      }
      if (!this.publication || !this.clonedTrack) {
        const prepared = await this.prepareLocalCloneInternal(room!, generation);
        if (intentRevision !== this.mediaIntentRevision) return false;
        if (!prepared) {
          this.closeLocalGate(true);
          return false;
        }
      }
      if (intentRevision !== this.mediaIntentRevision) return false;
      this.enabledIntent = true;
      return this.applyEnabledInternal(true, room!, generation, intentRevision);
    });
  }

  releaseLocalTrack(): Promise<void> {
    this.closeLocalGate(true);
    return this.enqueueMedia(() => this.releaseLocalCloneInternal(true));
  }

  private async connectFresh(invitationId: string, generation: number, request: number) {
    // A source registered while the token was loading remains caller-owned and
    // is restored after teardown; every old clone is nevertheless discarded.
    await this.teardownCurrentRoom(false);
    if (generation !== this.roomGeneration || request !== this.lifecycleRequest) return false;
    this.replaceSnapshot({
      ...initialSnapshot(),
      callId: invitationId,
      invitationId,
      status: "requesting_token",
    });

    let access: PlaceLiveCallMediaAccess;
    try {
      access = await this.requestAccess(invitationId);
    } catch (error) {
      if (generation === this.roomGeneration && request === this.lifecycleRequest) {
        this.patchSnapshot({
          status: "failed",
          error: readableError(error, "Le jeton privé de l’appel est indisponible."),
        });
      }
      return false;
    }
    if (generation !== this.roomGeneration || request !== this.lifecycleRequest) return false;
    if (access.invitationId !== invitationId && access.callId !== invitationId) {
      this.patchSnapshot({ status: "failed", error: "Le jeton reçu ne correspond pas à cet appel." });
      return false;
    }

    const room = this.createRoom();
    this.room = room;
    this.access = access;
    this.bindRoomEvents(room, generation);
    this.patchSnapshot({
      callId: access.callId,
      invitationId: access.invitationId,
      publicRoomId: access.publicRoomId,
      status: "connecting",
      role: access.role,
      participantIdentity: access.participantIdentity,
      peerIdentity: access.peerIdentity,
      error: null,
    });

    try {
      await room.connect(access.serverUrl, access.token, { autoSubscribe: true });
      if (!this.isCurrent(room, generation) || request !== this.lifecycleRequest) {
        await room.disconnect(false).catch(() => undefined);
        return false;
      }
      if (room.localParticipant.identity !== access.participantIdentity) {
        throw new Error("L’identité RTC de l’appel est incohérente.");
      }
      if (room.localParticipant.permissions?.canPublish !== true) {
        throw new Error("Le droit audio de l’appel a été refusé.");
      }
      this.activeLifecycleRequest = request;
      this.patchSnapshot({
        status: "connected",
        autoplayBlocked: !room.canPlaybackAudio,
        error: null,
      });
      this.reconcileRemoteAudio(room);

      const shouldEnable = this.enabledIntent;
      const intentRevision = this.mediaIntentRevision;
      const prepared = await this.enqueueMedia(() => this.prepareLocalCloneInternal(room, generation));
      if (shouldEnable
        && prepared
        && intentRevision === this.mediaIntentRevision
        && this.isCurrent(room, generation)) {
        this.enabledIntent = true;
        await this.enqueueMedia(() => this.applyEnabledInternal(true, room, generation, intentRevision));
      }
      return this.isCurrent(room, generation) && this.snapshot.status === "connected";
    } catch (error) {
      if (this.isCurrent(room, generation) && request === this.lifecycleRequest) {
        await this.teardownCurrentRoom(false);
        if (request !== this.lifecycleRequest) return false;
        this.replaceSnapshot({
          ...initialSnapshot(),
          callId: access.callId,
          invitationId: access.invitationId,
          publicRoomId: access.publicRoomId,
          status: "failed",
          role: access.role,
          participantIdentity: access.participantIdentity,
          peerIdentity: access.peerIdentity,
          error: readableError(error, "Connexion au transport privé de l’appel impossible."),
        });
      } else {
        await room.disconnect(false).catch(() => undefined);
      }
      return false;
    }
  }

  private bindRoomEvents(room: Room, generation: number) {
    const current = () => this.isCurrent(room, generation);
    const onReconnecting = () => {
      if (!current()) return;
      // Network recovery is intentionally fail-closed: only a later explicit
      // setEnabled(true) may reopen the cloned upstream.
      this.closeLocalGate(true);
      this.clearRemoteAudio();
      this.patchSnapshot({ status: "reconnecting", error: null });
    };
    const onReconnected = () => {
      if (!current()) return;
      if (room.localParticipant.identity !== this.access?.participantIdentity
        || room.localParticipant.permissions?.canPublish !== true) {
        this.closeLocalGate(true);
        this.patchSnapshot({
          status: "failed",
          error: "Les droits média de l’appel ont changé.",
        });
        void room.disconnect(false).catch(() => undefined);
        return;
      }
      this.patchSnapshot({
        status: "connected",
        autoplayBlocked: !room.canPlaybackAudio,
        localAudible: false,
        error: null,
      });
      this.reconcileRemoteAudio(room);
      void this.enqueueMedia(() => this.reconcileLocalAfterReconnect(room, generation));
    };
    const onDisconnected = () => {
      if (!current()) return;
      this.activeLifecycleRequest = 0;
      this.closeLocalGate(true);
      this.clearRemoteAudio();
      const cleanups = this.roomEventCleanups;
      this.roomEventCleanups = [];
      cleanups.forEach((cleanup) => cleanup());
      if (this.room === room) {
        this.room = null;
        this.access = null;
      }
      void this.enqueueMedia(() => this.releaseLocalCloneInternal(false));
      this.patchSnapshot({
        status: "disconnected",
        localPublished: false,
        localTrackName: null,
        peerPresent: false,
      });
    };
    const onConnectionStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
        onReconnecting();
      }
    };
    const onRemoteMediaChanged = () => {
      if (current()) this.reconcileRemoteAudio(room);
    };
    const onTrackSubscribed = (
      _track: RemoteTrack,
      _publication: RemoteTrackPublication,
      _participant: RemoteParticipant,
    ) => onRemoteMediaChanged();
    const onTrackUnsubscribed = onTrackSubscribed;
    const onParticipantDisconnected = (_participant: RemoteParticipant) => onRemoteMediaChanged();
    const onTrackMuted = (publication: TrackPublication, participant: Participant) => {
      if (!current()) return;
      if (participant === room.localParticipant && publication.trackSid === this.publication?.trackSid) {
        this.enabledIntent = false;
        if (this.clonedTrack) this.clonedTrack.enabled = false;
        this.patchSnapshot({ localAudible: false });
      }
      onRemoteMediaChanged();
    };
    const onTrackUnmuted = () => onRemoteMediaChanged();
    const onLocalTrackUnpublished = (publication: LocalTrackPublication) => {
      if (!current() || publication.trackSid !== this.publication?.trackSid) return;
      this.enabledIntent = false;
      if (this.clonedTrack) this.clonedTrack.enabled = false;
      this.publication = null;
      this.patchSnapshot({ localPublished: false, localAudible: false, localTrackName: null });
    };
    const onAudioPlaybackStatusChanged = () => {
      if (current()) this.patchSnapshot({ autoplayBlocked: !room.canPlaybackAudio });
    };
    const onParticipantPermissionsChanged = (_previous: unknown, participant: Participant) => {
      if (!current()) return;
      if (participant === room.localParticipant && participant.permissions?.canPublish !== true) {
        this.closeLocalGate(true);
        this.patchSnapshot({ error: "Le droit audio de l’appel a été retiré." });
      }
      onRemoteMediaChanged();
    };
    const onParticipantMetadataChanged = (_previous: string | undefined, _participant: Participant) => {
      onRemoteMediaChanged();
    };

    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.SignalReconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected, onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.TrackPublished, onRemoteMediaChanged);
    room.on(RoomEvent.TrackUnpublished, onRemoteMediaChanged);
    room.on(RoomEvent.ParticipantConnected, onRemoteMediaChanged);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.TrackMuted, onTrackMuted);
    room.on(RoomEvent.TrackUnmuted, onTrackUnmuted);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);
    room.on(RoomEvent.AudioPlaybackStatusChanged, onAudioPlaybackStatusChanged);
    room.on(RoomEvent.ParticipantPermissionsChanged, onParticipantPermissionsChanged);
    room.on(RoomEvent.ParticipantMetadataChanged, onParticipantMetadataChanged);

    this.roomEventCleanups = [
      () => room.off(RoomEvent.Reconnecting, onReconnecting),
      () => room.off(RoomEvent.SignalReconnecting, onReconnecting),
      () => room.off(RoomEvent.Reconnected, onReconnected),
      () => room.off(RoomEvent.Disconnected, onDisconnected),
      () => room.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged),
      () => room.off(RoomEvent.TrackSubscribed, onTrackSubscribed),
      () => room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed),
      () => room.off(RoomEvent.TrackPublished, onRemoteMediaChanged),
      () => room.off(RoomEvent.TrackUnpublished, onRemoteMediaChanged),
      () => room.off(RoomEvent.ParticipantConnected, onRemoteMediaChanged),
      () => room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected),
      () => room.off(RoomEvent.TrackMuted, onTrackMuted),
      () => room.off(RoomEvent.TrackUnmuted, onTrackUnmuted),
      () => room.off(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished),
      () => room.off(RoomEvent.AudioPlaybackStatusChanged, onAudioPlaybackStatusChanged),
      () => room.off(RoomEvent.ParticipantPermissionsChanged, onParticipantPermissionsChanged),
      () => room.off(RoomEvent.ParticipantMetadataChanged, onParticipantMetadataChanged),
    ];
  }

  private async prepareLocalCloneInternal(room: Room, generation: number) {
    const source = this.sourceTrack;
    if (!source || !this.canPublish(room) || !this.isCurrent(room, generation)) return false;
    if (source.kind !== "audio" || source.readyState !== "live") return false;
    if (this.clonedTrack && this.publication) return true;

    await this.releaseLocalCloneInternal(false);
    if (!this.isCurrent(room, generation) || this.sourceTrack !== source || !this.canPublish(room)) return false;

    let clone: MediaStreamTrack | null = null;
    let publication: LocalTrackPublication | null = null;
    try {
      clone = source.clone();
      clone.enabled = false;
      const trackName = this.localTrackName();
      if (!trackName) throw new Error("Rôle média de l’appel absent.");
      this.clonedTrack = clone;
      const onCloneEnded = () => {
        if (this.clonedTrack !== clone) return;
        this.closeLocalGate(true);
        void this.enqueueMedia(() => this.releaseLocalCloneInternal(false));
      };
      clone.addEventListener("ended", onCloneEnded, { once: true });
      this.cloneEndedCleanup = () => clone?.removeEventListener("ended", onCloneEnded);

      publication = await room.localParticipant.publishTrack(clone, {
        name: trackName,
        stream: PLACE_LIVE_CALL_STREAM_NAME,
        source: Track.Source.Microphone,
        audioPreset: this.access?.role === "host" ? AudioPresets.musicHighQuality : AudioPresets.speech,
        dtx: this.access?.role !== "host",
        red: true,
      });
      if (!this.isCurrent(room, generation)
        || this.sourceTrack !== source
        || this.clonedTrack !== clone) {
        clone.enabled = false;
        await room.localParticipant.unpublishTrack(publication.track ?? clone, false).catch(() => undefined);
        if (this.clonedTrack === clone) {
          this.cloneEndedCleanup?.();
          this.cloneEndedCleanup = null;
          this.clonedTrack = null;
        }
        clone.stop();
        return false;
      }

      this.publication = publication;
      clone.enabled = false;
      await publication.mute();
      if (!this.isCurrent(room, generation)
        || this.clonedTrack !== clone
        || this.publication !== publication) {
        clone.enabled = false;
        await room.localParticipant.unpublishTrack(publication.track ?? clone, false).catch(() => undefined);
        if (this.publication === publication) this.publication = null;
        if (this.clonedTrack === clone) {
          this.cloneEndedCleanup?.();
          this.cloneEndedCleanup = null;
          this.clonedTrack = null;
        }
        clone.stop();
        return false;
      }
      this.patchSnapshot({
        localPublished: true,
        localAudible: false,
        localTrackName: trackName,
        error: null,
      });
      return true;
    } catch (error) {
      if (clone) clone.enabled = false;
      if (publication) {
        await room.localParticipant.unpublishTrack(publication.track ?? clone!, false).catch(() => undefined);
      }
      if (this.clonedTrack === clone) {
        this.cloneEndedCleanup?.();
        this.cloneEndedCleanup = null;
        this.clonedTrack = null;
      }
      clone?.stop();
      if (this.isCurrent(room, generation)) {
        this.patchSnapshot({
          localPublished: false,
          localAudible: false,
          localTrackName: null,
          error: readableError(error, "La piste privée de l’appel n’a pas pu être préparée."),
        });
      }
      return false;
    }
  }

  private async applyEnabledInternal(
    enabled: boolean,
    room: Room | null,
    generation: number,
    intentRevision: number,
  ) {
    const clone = this.clonedTrack;
    const publication = this.publication;
    if (intentRevision !== this.mediaIntentRevision) return false;
    if (!enabled) {
      this.enabledIntent = false;
      if (clone) clone.enabled = false;
      await publication?.mute().catch(() => undefined);
      this.patchSnapshot({ localAudible: false });
      return true;
    }
    if (!room || !clone || !publication || !this.canPublish(room) || !this.isCurrent(room, generation)) {
      return false;
    }
    try {
      if (clone.readyState !== "live") throw new Error("La piste de l’appel n’est plus disponible.");
      await publication.unmute();
      if (intentRevision !== this.mediaIntentRevision
        || !this.enabledIntent
        || !this.isCurrent(room, generation)
        || this.clonedTrack !== clone
        || this.publication !== publication
        || this.snapshot.status !== "connected") {
        clone.enabled = false;
        await publication.mute().catch(() => undefined);
        return false;
      }
      clone.enabled = true;
      const audible = clone.enabled && !publication.isMuted;
      this.patchSnapshot({
        localPublished: true,
        localAudible: audible,
        error: audible ? null : "Le transport n’a pas confirmé la piste privée de l’appel.",
      });
      return audible;
    } catch (error) {
      clone.enabled = false;
      await publication.mute().catch(() => undefined);
      const ownsCurrentIntent = intentRevision === this.mediaIntentRevision;
      if (ownsCurrentIntent) this.closeLocalGate(true);
      if (ownsCurrentIntent && this.isCurrent(room, generation)) {
        this.patchSnapshot({
          localAudible: false,
          error: readableError(error, "Impossible d’activer le retour audio de l’appel."),
        });
      }
      return false;
    }
  }

  private async reconcileLocalAfterReconnect(room: Room, generation: number) {
    if (!this.isCurrent(room, generation)) return;
    this.closeLocalGate(true);
    const clone = this.clonedTrack;
    if (!clone || clone.readyState !== "live" || !this.canPublish(room)) {
      this.patchSnapshot({ localPublished: false, localAudible: false, localTrackName: null });
      return;
    }
    const trackName = this.localTrackName();
    if (!trackName) return;
    let publication = room.localParticipant.getTrackPublicationByName(trackName) as LocalTrackPublication | undefined;
    if (publication?.track && publication.track.mediaStreamTrack !== clone) {
      await room.localParticipant.unpublishTrack(publication.track, false).catch(() => undefined);
      publication = undefined;
    }
    if (!publication) {
      publication = await room.localParticipant.publishTrack(clone, {
        name: trackName,
        stream: PLACE_LIVE_CALL_STREAM_NAME,
        source: Track.Source.Microphone,
        audioPreset: this.access?.role === "host" ? AudioPresets.musicHighQuality : AudioPresets.speech,
        dtx: this.access?.role !== "host",
        red: true,
      });
    }
    if (!this.isCurrent(room, generation) || this.clonedTrack !== clone) {
      await room.localParticipant.unpublishTrack(publication.track ?? clone, false).catch(() => undefined);
      return;
    }
    this.publication = publication;
    clone.enabled = false;
    await publication.mute();
    if (this.isCurrent(room, generation) && this.publication === publication) {
      this.patchSnapshot({
        localPublished: true,
        localAudible: false,
        localTrackName: trackName,
      });
    }
  }

  private reconcileRemoteAudio(room: Room) {
    if (!this.access || room !== this.room || this.snapshot.status === "reconnecting") {
      this.clearRemoteAudio();
      return;
    }
    const participant = room.remoteParticipants.get(this.access.peerIdentity);
    const authorized = participant ? this.authorizedPeer(participant) : false;
    let remoteAudio: PlaceLiveCallRemoteAudio | null = null;
    const expectedName = this.remoteTrackName();

    for (const candidate of room.remoteParticipants.values()) {
      for (const publication of candidate.audioTrackPublications.values()) {
        const track = publication.track;
        if (!(track instanceof RemoteAudioTrack)) continue;
        const accepted = candidate === participant
          && authorized
          && publication.kind === Track.Kind.Audio
          && publication.source === Track.Source.Microphone
          && publication.trackName === expectedName
          && !remoteAudio;
        if (!accepted) {
          track.detach();
          continue;
        }
        remoteAudio = {
          key: `${candidate.identity}:${publication.trackSid}`,
          publicationSid: publication.trackSid,
          participantIdentity: candidate.identity,
          track,
          muted: publication.isMuted,
          purpose: this.access?.role === "host" ? "input" : "return",
        };
      }
    }

    const previous = this.snapshot.remoteAudio;
    if (previous && previous.track !== remoteAudio?.track) previous.track.detach();
    this.patchSnapshot({ peerPresent: authorized, remoteAudio });
  }

  private authorizedPeer(participant: RemoteParticipant) {
    const access = this.access;
    if (!access
      || participant.identity !== access.peerIdentity
      || !SAFE_IDENTITY_PATTERN.test(participant.identity)
      || participant.permissions?.canPublish !== true) return false;
    try {
      const metadata = asRecord(JSON.parse(participant.metadata ?? "{}"));
      const metadataCallId = optionalString(metadata, "callId")
        ?? optionalString(metadata, "invitationId")
        ?? optionalString(metadata, "liveCallInvitationId");
      const metadataRole = normalizeMetadataRole(metadata.role);
      const expectedRole: PlaceLiveCallMediaRole = access.role === "host" ? "contact" : "host";
      if ((metadataCallId !== access.callId && metadataCallId !== access.invitationId)
        || metadataRole !== expectedRole) return false;
      const metadataRoomId = optionalString(metadata, "publicRoomId") ?? optionalString(metadata, "roomId");
      return metadataRoomId === access.publicRoomId;
    } catch {
      return false;
    }
  }

  private localTrackName() {
    if (this.access?.role === "host") return PLACE_LIVE_CALL_HOST_TRACK_NAME;
    if (this.access?.role === "contact") return PLACE_LIVE_CALL_CONTACT_TRACK_NAME;
    return null;
  }

  private remoteTrackName() {
    if (this.access?.role === "host") return PLACE_LIVE_CALL_CONTACT_TRACK_NAME;
    if (this.access?.role === "contact") return PLACE_LIVE_CALL_HOST_TRACK_NAME;
    return null;
  }

  private canPublish(room: Room | null): room is Room {
    return Boolean(
      room
      && room === this.room
      && this.snapshot.status === "connected"
      && this.access
      && this.activeLifecycleRequest === this.lifecycleRequest
      && room.localParticipant.identity === this.access.participantIdentity
      && room.localParticipant.permissions?.canPublish === true,
    );
  }

  private closeLocalGate(clearIntent: boolean, invalidateRevision = clearIntent) {
    if (clearIntent) {
      if (invalidateRevision) this.mediaIntentRevision += 1;
      this.enabledIntent = false;
    }
    if (this.clonedTrack) this.clonedTrack.enabled = false;
    void this.publication?.mute().catch(() => undefined);
    if (this.snapshot.localAudible) this.patchSnapshot({ localAudible: false });
  }

  private clearRemoteAudio() {
    this.snapshot.remoteAudio?.track.detach();
    if (this.snapshot.remoteAudio || this.snapshot.peerPresent) {
      this.patchSnapshot({ remoteAudio: null, peerPresent: false });
    }
  }

  private async releaseLocalCloneInternal(clearSource: boolean) {
    const room = this.room;
    const publication = this.publication;
    const clone = this.clonedTrack;
    this.enabledIntent = false;
    if (clone) clone.enabled = false;
    await publication?.mute().catch(() => undefined);
    if (room && (publication?.track || clone)) {
      await room.localParticipant.unpublishTrack(publication?.track ?? clone!, false).catch(() => undefined);
    }
    this.cloneEndedCleanup?.();
    this.cloneEndedCleanup = null;
    this.publication = null;
    this.clonedTrack = null;
    clone?.stop();
    if (clearSource) this.clearSourceReference();
    this.patchSnapshot({ localPublished: false, localAudible: false, localTrackName: null });
  }

  private clearSourceReference() {
    this.sourceEndedCleanup?.();
    this.sourceEndedCleanup = null;
    this.sourceTrack = null;
  }

  private async teardownCurrentRoom(clearSource: boolean) {
    const room = this.room;
    await this.releaseLocalCloneInternal(clearSource);
    this.clearRemoteAudio();
    this.roomEventCleanups.forEach((cleanup) => cleanup());
    this.roomEventCleanups = [];
    if (!room) {
      this.access = null;
      this.activeLifecycleRequest = 0;
      return;
    }
    if (this.room === room) {
      this.room = null;
      this.access = null;
      this.activeLifecycleRequest = 0;
    }
    await room.disconnect(false).catch(() => undefined);
  }

  private isCurrent(room: Room | null, generation: number) {
    return Boolean(room && this.room === room && this.roomGeneration === generation);
  }

  private enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleChain.then(operation, operation);
    this.lifecycleChain = result.then(() => undefined, () => undefined);
    return result;
  }

  private enqueueMedia<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mediaChain.then(operation, operation);
    this.mediaChain = result.then(() => undefined, () => undefined);
    return result;
  }

  private patchSnapshot(patch: Partial<PlaceLiveCallMediaSnapshot>) {
    this.replaceSnapshot({ ...this.snapshot, ...patch });
  }

  private replaceSnapshot(snapshot: PlaceLiveCallMediaSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

export default PlaceLiveCallMediaService;
