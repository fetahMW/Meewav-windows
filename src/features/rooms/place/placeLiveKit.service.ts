import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AudioPresets,
  ConnectionState,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
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
import { readRoomDevicePreferences } from "./roomDevicePreferences";

export const PLACE_LIVEKIT_MUSIC_TRACK_NAME = "meewav.music";
export const PLACE_LIVEKIT_VOICE_TRACK_NAME = "meewav.voice";
export const PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME = "meewav.call.program";
export const PLACE_LIVEKIT_SCREEN_VIDEO_TRACK_NAME = "meewav.screen";
export const PLACE_LIVEKIT_SCREEN_AUDIO_TRACK_NAME = "meewav.screen.audio";
export const PLACE_LIVEKIT_PROGRAM_STREAM_NAME = "meewav.program";
export const PLACE_LIVEKIT_SCREEN_STREAM_NAME = "meewav.screen";

const ROOM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const GENERATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type PlaceLiveKitRole = "host" | "guest" | "viewer";

export type PlaceLiveKitStatus =
  | "idle"
  | "requesting_token"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed";

export type PlaceLiveKitAccess = {
  url: string;
  token: string;
  identity: string;
  role: PlaceLiveKitRole;
  canPublish: boolean;
  /** Server-authoritative identity allowed to own the public Room music. */
  programAudioPublisherIdentity: string;
};

export type PlaceRemoteAudioPurpose = "music" | "voice" | "phone_call" | "screen_share_audio";

export type PlaceRemoteAudioTrack = {
  key: string;
  publicationSid: string;
  participantIdentity: string;
  track: RemoteAudioTrack;
  muted: boolean;
  purpose: PlaceRemoteAudioPurpose;
};

export type PlaceRemoteMusicTrack = PlaceRemoteAudioTrack & { purpose: "music" };

export type PlaceLiveKitVideoTrack = {
  key: string;
  publicationSid: string;
  participantIdentity: string;
  track: RemoteVideoTrack | LocalVideoTrack;
  muted: boolean;
  local: boolean;
  source: "camera" | "screen_share";
};

export type PlaceLiveKitSnapshot = {
  roomId: string | null;
  status: PlaceLiveKitStatus;
  role: PlaceLiveKitRole | null;
  identity: string | null;
  canPublish: boolean;
  error: string | null;
  autoplayBlocked: boolean;
  musicPublished: boolean;
  musicAudible: boolean;
  musicGeneration: string | null;
  voicePublished: boolean;
  voiceAudible: boolean;
  voiceGeneration: string | null;
  callProgramPublished: boolean;
  callProgramAudible: boolean;
  callProgramGeneration: string | null;
  screenSharePublished: boolean;
  screenShareGeneration: string | null;
  remoteMusicTracks: PlaceRemoteMusicTrack[];
  remoteAudioTracks: PlaceRemoteAudioTrack[];
  videoTracks: PlaceLiveKitVideoTrack[];
};

type PlaceLiveKitListener = () => void;

type PlaceLiveKitServiceOptions = {
  requestAccess?: (roomId: string) => Promise<PlaceLiveKitAccess>;
  createRoom?: () => Room;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function isSafeIdentity(value: string | null): value is string {
  return Boolean(value && SAFE_ID_PATTERN.test(value));
}

function parseLiveKitUrl(value: string | null) {
  if (!value) throw new Error("Adresse du transport Room absente.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Adresse du transport Room invalide.");
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "wss:" && !(url.protocol === "ws:" && isLoopback)) {
    throw new Error("Le transport Room doit utiliser une connexion sécurisée.");
  }
  return url.toString();
}

export function parsePlaceLiveKitAccess(value: unknown): PlaceLiveKitAccess {
  const record = asRecord(value);
  const token = stringValue(record, ["token", "accessToken"]);
  const identity = stringValue(record, ["identity", "participantIdentity"]);
  const programAudioPublisherIdentity = stringValue(record, [
    "programAudioPublisherIdentity",
    "hostIdentity",
    "hostId",
  ]);
  const role = record.role;
  const canPublish = record.canPublish;
  if (!token || token.length < 32 || token.length > 32_768 || token.split(".").length !== 3) {
    throw new Error("Jeton du transport Room invalide.");
  }
  if (!isSafeIdentity(identity) || !isSafeIdentity(programAudioPublisherIdentity)) {
    throw new Error("Identité du transport Room invalide.");
  }
  if (role !== "host" && role !== "guest" && role !== "viewer") {
    throw new Error("Rôle du transport Room invalide.");
  }
  if (typeof canPublish !== "boolean") {
    throw new Error("Droit de publication Room absent.");
  }
  if (role === "viewer" && canPublish) {
    throw new Error("Droit de publication Room incohérent.");
  }
  return {
    url: parseLiveKitUrl(stringValue(record, ["url", "serverUrl", "wsUrl", "livekitUrl"])),
    token,
    identity,
    role,
    canPublish,
    programAudioPublisherIdentity,
  };
}

/**
 * Requests a short-lived grant. The browser supplies only the Room id: role,
 * identity and publication rights are always derived by the authenticated
 * backend.
 */
export async function requestPlaceLiveKitAccess(
  roomId: string,
  client: SupabaseClient = supabase,
): Promise<PlaceLiveKitAccess> {
  if (!ROOM_ID_PATTERN.test(roomId)) {
    throw new Error("Connexion média refusée : identifiant de Room invalide.");
  }
  const { data, error } = await client.functions.invoke("livekit-token", {
    body: { roomId },
  });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && response instanceof Response && response.status === 400) {
      const detail = await response.clone().json().catch(() => null) as { error?: unknown } | null;
      if (detail?.error === "roomName et identity requis") {
        throw new Error("La vidéo LIVE attend une mise à jour du serveur MeeWav. Ta caméra reste locale ; arrête la diffusion et réessaie après correction.");
      }
    }
    throw new Error("Le transport temps réel de la Room est indisponible.");
  }
  return parsePlaceLiveKitAccess(data);
}

function createDefaultRoom() {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    stopLocalTrackOnUnpublish: false,
  });
}

function initialSnapshot(): PlaceLiveKitSnapshot {
  return {
    roomId: null,
    status: "idle",
    role: null,
    identity: null,
    canPublish: false,
    error: null,
    autoplayBlocked: false,
    musicPublished: false,
    musicAudible: false,
    musicGeneration: null,
    voicePublished: false,
    voiceAudible: false,
    voiceGeneration: null,
    callProgramPublished: false,
    callProgramAudible: false,
    callProgramGeneration: null,
    screenSharePublished: false,
    screenShareGeneration: null,
    remoteMusicTracks: [],
    remoteAudioTracks: [],
    videoTracks: [],
  };
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/**
 * Owns exactly one LiveKit Room. All async work is scoped to a monotonically
 * increasing generation so a late token, publish or reconnect can never
 * mutate the next MeeWav Room.
 */
export class PlaceLiveKitService {
  private readonly requestAccess: (roomId: string) => Promise<PlaceLiveKitAccess>;
  private readonly createRoom: () => Room;
  private readonly listeners = new Set<PlaceLiveKitListener>();
  private snapshot = initialSnapshot();
  private room: Room | null = null;
  private access: PlaceLiveKitAccess | null = null;
  private roomGeneration = 0;
  private roomEventCleanups: Array<() => void> = [];
  private connectPromise: Promise<boolean> | null = null;
  private connectPromiseRequest = 0;
  private lifecycleRequest = 0;
  private activeLifecycleRequest = 0;
  private lifecycleChain: Promise<void> = Promise.resolve();
  private mediaCommitChain: Promise<void> = Promise.resolve();
  private musicTrack: MediaStreamTrack | null = null;
  private musicPublication: LocalTrackPublication | null = null;
  private musicGeneration: string | null = null;
  private musicEnabledIntent = false;
  private musicTrackEndedCleanup: (() => void) | null = null;
  private voiceTrack: MediaStreamTrack | null = null;
  private voicePublication: LocalTrackPublication | null = null;
  private voiceGeneration: string | null = null;
  private voiceEnabledIntent = false;
  private voiceTrackEndedCleanup: (() => void) | null = null;
  private callProgramTrack: MediaStreamTrack | null = null;
  private callProgramPublication: LocalTrackPublication | null = null;
  private callProgramGeneration: string | null = null;
  private callProgramEnabledIntent = false;
  private callProgramIntentRevision = 0;
  private callProgramTrackEndedCleanup: (() => void) | null = null;
  private screenSourceStream: MediaStream | null = null;
  private screenVideoTrack: MediaStreamTrack | null = null;
  private screenAudioTrack: MediaStreamTrack | null = null;
  private screenVideoPublication: LocalTrackPublication | null = null;
  private screenAudioPublication: LocalTrackPublication | null = null;
  private screenGeneration: string | null = null;
  private screenEnabledIntent = false;
  private screenSourceEndedCleanup: (() => void) | null = null;
  private programVideoTrack: MediaStreamTrack | null = null;
  private programVideoSource: MediaStreamTrack | null = null;
  private programVideoPublication: LocalTrackPublication | null = null;
  private programVideoEnabledIntent = false;

  publishProgramVideo(source: MediaStreamTrack): Promise<boolean> {
    return this.enqueueMediaCommit(async () => {
      const room = this.room;
      const generation = this.roomGeneration;
      if (!this.canOwnProgramMusic(room) || source.kind !== 'video' || source.readyState !== 'live') return false;
      const enabledIntent = this.programVideoSource === source ? this.programVideoEnabledIntent : true;
      const currentPublication = room!.localParticipant.getTrackPublicationByName('meewav.video.program');
      if (this.programVideoSource === source && this.programVideoPublication && currentPublication?.trackSid === this.programVideoPublication.trackSid && this.programVideoTrack?.readyState === 'live') {
        this.programVideoTrack.enabled = this.programVideoEnabledIntent;
        return true;
      }
      await this.releaseProgramVideoInternal();
      await room!.localParticipant.setCameraEnabled(false);
      if (!this.isCurrent(room!, generation)) return false;
      const track = source.clone();
      track.enabled = false;
      let publication: LocalTrackPublication | null = null;
      try {
        publication = await room!.localParticipant.publishTrack(track, { name: 'meewav.video.program', source: Track.Source.Camera });
        if (!this.isCurrent(room!, generation) || source.readyState !== 'live') {
          await room!.localParticipant.unpublishTrack(publication.track ?? track, false);
          track.stop(); return false;
        }
        this.programVideoTrack = track; this.programVideoSource = source; this.programVideoPublication = publication;
        this.programVideoEnabledIntent = enabledIntent;
        track.enabled = enabledIntent;
        await (enabledIntent ? publication.unmute() : publication.mute());
        if (!this.isCurrent(room!, generation)) { await this.releaseProgramVideoInternal(); return false; }
        this.reconcileMediaTracks(room!);
        return true;
      } catch (error) {
        track.enabled = false;
        if (publication) await room!.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
        track.stop();
        if (this.programVideoTrack === track) { this.programVideoTrack = null; this.programVideoSource = null; this.programVideoPublication = null; }
        if (this.isCurrent(room!, generation)) this.patchSnapshot({ error: readableError(error, 'Publication Program impossible.') });
        return false;
      }
    });
  }

  private async releaseProgramVideoInternal() {
    this.programVideoEnabledIntent = false;
    const track = this.programVideoTrack;
    const publication = this.programVideoPublication;
    this.programVideoTrack = null; this.programVideoSource = null; this.programVideoPublication = null;
    if (track) track.enabled = false;
    if (publication) await publication.mute().catch(() => undefined);
    if (this.room && track) await this.room.localParticipant.unpublishTrack(publication?.track ?? track, false).catch(() => undefined);
    track?.stop();
  }

  constructor(options: PlaceLiveKitServiceOptions = {}) {
    this.requestAccess = options.requestAccess ?? requestPlaceLiveKitAccess;
    this.createRoom = options.createRoom ?? createDefaultRoom;
  }

  subscribe = (listener: PlaceLiveKitListener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  connect(roomId: string): Promise<boolean> {
    if (this.snapshot.roomId === roomId
      && this.snapshot.status === "connected"
      && this.room
      && this.activeLifecycleRequest === this.lifecycleRequest) return Promise.resolve(true);
    if (this.snapshot.roomId === roomId
      && this.connectPromise
      && this.connectPromiseRequest === this.lifecycleRequest) return this.connectPromise;

    const request = ++this.lifecycleRequest;
    const generation = ++this.roomGeneration;
    this.closeLocalMediaGates();
    const operation = this.enqueueLifecycle(async () => {
      if (request !== this.lifecycleRequest || generation !== this.roomGeneration) return false;
      return this.connectFresh(roomId, generation, request);
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
    this.closeLocalMediaGates();
    const room = this.room;
    if (room) void room.localParticipant.setCameraEnabled(false).catch(() => undefined);
    return this.enqueueLifecycle(async () => {
      if (request !== this.lifecycleRequest) return;
      await this.teardownCurrentRoom();
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
        error: readableError(error, "Le navigateur bloque encore le son de la Room."),
      });
      return false;
    }
  }

  prepareMusicTrack(track: MediaStreamTrack, generation: string): Promise<boolean> {
    return this.enqueueMediaCommit(async () => {
      const room = this.room;
      const roomGeneration = this.roomGeneration;
      if (!this.canOwnProgramMusic(room)
        || track.kind !== "audio"
        || track.readyState !== "live"
        || !GENERATION_PATTERN.test(generation)) {
        return false;
      }

      if (this.musicTrack === track
        && this.musicGeneration === generation
        && this.musicPublication) {
        await this.forceMusicMuted(this.musicPublication, track);
        return true;
      }

      await this.releaseMusicTrackInternal();
      if (!this.isCurrent(room, roomGeneration) || !this.canOwnProgramMusic(room)) return false;

      // A custom output must be silent before it exists at the SFU. The Player
      // explicitly unmutes it only after the Public + Play double confirmation.
      track.enabled = false;
      this.musicTrack = track;
      this.musicGeneration = generation;
      this.musicEnabledIntent = false;
      const onEnded = () => {
        if (this.musicTrack !== track || this.musicGeneration !== generation) return;
        void this.releaseMusicTrack();
      };
      track.addEventListener("ended", onEnded, { once: true });
      this.musicTrackEndedCleanup = () => track.removeEventListener("ended", onEnded);

      let publication: LocalTrackPublication | null = null;
      try {
        const channelCount = track.getSettings().channelCount;
        publication = await room!.localParticipant.publishTrack(track, {
          name: PLACE_LIVEKIT_MUSIC_TRACK_NAME,
          stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
          source: Track.Source.Microphone,
          audioPreset: channelCount === 2 ? AudioPresets.musicHighQualityStereo : AudioPresets.musicHighQuality,
          dtx: false,
          red: true,
          forceStereo: channelCount === 2,
        });
        if (!this.isCurrent(room, roomGeneration)
          || this.musicTrack !== track
          || this.musicGeneration !== generation) {
          await room!.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
          return false;
        }
        this.musicPublication = publication;
        await this.forceMusicMuted(publication, track);
        if (!this.isCurrent(room, roomGeneration)
          || this.musicTrack !== track
          || this.musicPublication !== publication) return false;
        this.patchSnapshot({
          musicPublished: true,
          musicAudible: false,
          musicGeneration: generation,
          error: null,
        });
        return true;
      } catch (error) {
        track.enabled = false;
        if (publication) {
          await room!.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
        }
        if (this.musicTrack === track) this.clearMusicReferences();
        if (this.isCurrent(room, roomGeneration)) {
          this.patchSnapshot({
            musicPublished: false,
            musicAudible: false,
            musicGeneration: null,
            error: readableError(error, "La piste musique n’a pas pu être préparée pour la Room."),
          });
        }
        return false;
      }
    });
  }

  setMusicEnabled(enabled: boolean): Promise<boolean> {
    return this.enqueueMediaCommit(async () => {
      const room = this.room;
      const publication = this.musicPublication;
      const track = this.musicTrack;
      const generation = this.roomGeneration;
      if (!room || !publication || !track || !this.canOwnProgramMusic(room)) return false;
      this.musicEnabledIntent = enabled;
      try {
        if (enabled) {
          if (track.readyState !== "live") throw new Error("La piste musique n’est plus disponible.");
          await publication.unmute();
          if (!this.isCurrent(room, generation) || this.musicPublication !== publication) {
            track.enabled = false;
            await publication.mute().catch(() => undefined);
            return false;
          }
          track.enabled = true;
        } else {
          // Fail closed locally before waiting for signaling.
          track.enabled = false;
          await publication.mute();
        }
        if (!this.isCurrent(room, generation) || this.musicPublication !== publication) return false;
        const audible = enabled && track.enabled && !publication.isMuted;
        this.patchSnapshot({
          musicPublished: true,
          musicAudible: audible,
          error: audible === enabled ? null : "Le transport n’a pas confirmé la piste musique.",
        });
        return audible === enabled;
      } catch (error) {
        this.musicEnabledIntent = false;
        track.enabled = false;
        await publication.mute().catch(() => undefined);
        if (this.isCurrent(room, generation)) {
          this.patchSnapshot({
            musicAudible: false,
            error: readableError(error, "Impossible de modifier la diffusion de la musique."),
          });
        }
        return false;
      }
    });
  }

  releaseMusicTrack(): Promise<void> {
    return this.enqueueMediaCommit(() => this.releaseMusicTrackInternal());
  }

  prepareVoiceTrack(track: MediaStreamTrack, generation: string): Promise<boolean> {
    return this.enqueueMediaCommit(async () => {
      const room = this.room;
      const roomGeneration = this.roomGeneration;
      if (!this.canPublishMedia(room)
        || track.kind !== "audio"
        || track.readyState !== "live"
        || !GENERATION_PATTERN.test(generation)) {
        return false;
      }

      if (this.voiceTrack === track
        && this.voiceGeneration === generation
        && this.voicePublication) {
        return true;
      }

      await this.releaseVoiceTrackInternal();
      if (!this.isCurrent(room, roomGeneration) || !this.canPublishMedia(room)) return false;

      // The WebAudio output is owned by the caller. We only gate and publish
      // it; teardown must never stop the processing graph itself.
      track.enabled = false;
      this.voiceTrack = track;
      this.voiceGeneration = generation;
      this.voiceEnabledIntent = false;
      const onEnded = () => {
        if (this.voiceTrack !== track || this.voiceGeneration !== generation) return;
        void this.releaseVoiceTrack();
      };
      track.addEventListener("ended", onEnded, { once: true });
      this.voiceTrackEndedCleanup = () => track.removeEventListener("ended", onEnded);

      let publication: LocalTrackPublication | null = null;
      try {
        publication = await room!.localParticipant.publishTrack(track, {
          name: PLACE_LIVEKIT_VOICE_TRACK_NAME,
          stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
          source: Track.Source.Microphone,
          audioPreset: AudioPresets.musicHighQuality,
          dtx: false,
          red: true,
        });
        if (!this.isCurrent(room, roomGeneration)
          || this.voiceTrack !== track
          || this.voiceGeneration !== generation) {
          await room!.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
          return false;
        }
        this.voicePublication = publication;
        await this.forceVoiceMuted(publication, track);
        if (!this.isCurrent(room, roomGeneration)
          || this.voiceTrack !== track
          || this.voicePublication !== publication) return false;
        this.patchSnapshot({
          voicePublished: true,
          voiceAudible: false,
          voiceGeneration: generation,
          error: null,
        });
        return true;
      } catch (error) {
        track.enabled = false;
        if (publication) {
          await room!.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
        }
        if (this.voiceTrack === track) this.clearVoiceReferences();
        if (this.isCurrent(room, roomGeneration)) {
          this.patchSnapshot({
            voicePublished: false,
            voiceAudible: false,
            voiceGeneration: null,
            error: readableError(error, "La voix traitée n’a pas pu être préparée pour la Room."),
          });
        }
        return false;
      }
    });
  }

  setVoiceEnabled(enabled: boolean): Promise<boolean> {
    return this.enqueueMediaCommit(async () => {
      const room = this.room;
      const publication = this.voicePublication;
      const track = this.voiceTrack;
      const generation = this.roomGeneration;
      if (!enabled) {
        this.voiceEnabledIntent = false;
        if (track) track.enabled = false;
      }
      if (!room || !publication || !track || !this.canPublishMedia(room)) {
        if (!enabled) {
          await publication?.mute().catch(() => undefined);
          this.patchSnapshot({ voiceAudible: false });
          return true;
        }
        return false;
      }
      this.voiceEnabledIntent = enabled;
      try {
        if (enabled) {
          if (track.readyState !== "live") throw new Error("La piste voix n’est plus disponible.");
          await publication.unmute();
          if (!this.isCurrent(room, generation) || this.voicePublication !== publication) {
            track.enabled = false;
            await publication.mute().catch(() => undefined);
            return false;
          }
          track.enabled = true;
        } else {
          track.enabled = false;
          await publication.mute();
        }
        if (!this.isCurrent(room, generation) || this.voicePublication !== publication) return false;
        const audible = enabled && track.enabled && !publication.isMuted;
        this.patchSnapshot({
          voicePublished: true,
          voiceAudible: audible,
          error: audible === enabled ? null : "Le transport n’a pas confirmé la piste voix.",
        });
        return audible === enabled;
      } catch (error) {
        // The remembered intent is also forced off after a signaling failure;
        // a DB/UI reconciliation can explicitly request it again.
        this.voiceEnabledIntent = false;
        track.enabled = false;
        await publication.mute().catch(() => undefined);
        if (this.isCurrent(room, generation)) {
          this.patchSnapshot({
            voiceAudible: false,
            error: readableError(error, "Impossible de modifier la diffusion de la voix."),
          });
        }
        return false;
      }
    });
  }

  releaseVoiceTrack(): Promise<void> {
    return this.enqueueMediaCommit(() => this.releaseVoiceTrackInternal());
  }

  /**
   * Prepares the Host-owned bridge carrying accepted private phone calls to
   * the public Room. Publishing is deliberately muted and disabled: arming a
   * call never puts it on air. `setCallProgramEnabled(true)` is the separate
   * confirmation boundary.
   */
  prepareCallProgramTrack(track: MediaStreamTrack, generation: string): Promise<boolean> {
    return this.enqueueMediaCommit(async () => {
      const room = this.room;
      const roomGeneration = this.roomGeneration;
      if (!this.canOwnProgramMusic(room)
        || track.kind !== "audio"
        || track.readyState !== "live"
        || !GENERATION_PATTERN.test(generation)) return false;

      if (this.callProgramTrack === track
        && this.callProgramGeneration === generation
        && this.callProgramPublication) {
        await this.forceCallProgramMuted(this.callProgramPublication, track);
        return true;
      }

      await this.releaseCallProgramTrackInternal();
      if (!this.isCurrent(room, roomGeneration) || !this.canOwnProgramMusic(room)) return false;

      track.enabled = false;
      this.callProgramTrack = track;
      this.callProgramGeneration = generation;
      this.invalidateCallProgramIntent();
      const onEnded = () => {
        if (this.callProgramTrack !== track || this.callProgramGeneration !== generation) return;
        void this.releaseCallProgramTrack();
      };
      track.addEventListener("ended", onEnded, { once: true });
      this.callProgramTrackEndedCleanup = () => track.removeEventListener("ended", onEnded);

      let publication: LocalTrackPublication | null = null;
      try {
        publication = await room!.localParticipant.publishTrack(track, {
          name: PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME,
          stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
          source: Track.Source.Microphone,
          audioPreset: AudioPresets.musicHighQuality,
          dtx: false,
          red: true,
        });
        if (!this.isCurrent(room, roomGeneration)
          || this.callProgramTrack !== track
          || this.callProgramGeneration !== generation) {
          await room!.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
          return false;
        }
        this.callProgramPublication = publication;
        await this.forceCallProgramMuted(publication, track);
        if (!this.isCurrent(room, roomGeneration)
          || this.callProgramTrack !== track
          || this.callProgramPublication !== publication) return false;
        this.patchSnapshot({
          callProgramPublished: true,
          callProgramAudible: false,
          callProgramGeneration: generation,
          error: null,
        });
        return true;
      } catch (error) {
        track.enabled = false;
        if (publication) {
          await room!.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
        }
        if (this.callProgramTrack === track) this.clearCallProgramReferences();
        if (this.isCurrent(room, roomGeneration)) {
          this.patchSnapshot({
            callProgramPublished: false,
            callProgramAudible: false,
            callProgramGeneration: null,
            error: readableError(error, "L’appel n’a pas pu être préparé pour l’antenne."),
          });
        }
        return false;
      }
    });
  }

  setCallProgramEnabled(enabled: boolean): Promise<boolean> {
    const intentRevision = ++this.callProgramIntentRevision;
    this.callProgramEnabledIntent = enabled;
    if (!enabled) {
      // This is the emergency media gate. Close it synchronously, before the
      // serialized signaling queue, so a slow unmute/publish operation can
      // never keep the phone return audible after consent or route changed.
      this.callProgramEnabledIntent = false;
      if (this.callProgramTrack) this.callProgramTrack.enabled = false;
      this.patchSnapshot({ callProgramAudible: false });
    }
    return this.enqueueMediaCommit(async () => {
      if (intentRevision !== this.callProgramIntentRevision) return !enabled;
      const room = this.room;
      const publication = this.callProgramPublication;
      const track = this.callProgramTrack;
      const generation = this.roomGeneration;
      if (!enabled) {
        if (track) track.enabled = false;
      }
      if (!room || !publication || !track || !this.canOwnProgramMusic(room)) {
        if (!enabled) {
          await publication?.mute().catch(() => undefined);
          this.patchSnapshot({ callProgramAudible: false });
          return true;
        }
        return false;
      }
      try {
        if (enabled) {
          if (track.readyState !== "live") throw new Error("Le retour de l’appel n’est plus disponible.");
          await publication.unmute();
          if (intentRevision !== this.callProgramIntentRevision
            || !this.callProgramEnabledIntent
            || !this.isCurrent(room, generation)
            || this.callProgramPublication !== publication) {
            track.enabled = false;
            await publication.mute().catch(() => undefined);
            return false;
          }
          track.enabled = true;
        } else {
          track.enabled = false;
          await publication.mute();
        }
        if (!this.isCurrent(room, generation) || this.callProgramPublication !== publication) return false;
        const audible = enabled && track.enabled && !publication.isMuted;
        this.patchSnapshot({
          callProgramPublished: true,
          callProgramAudible: audible,
          error: audible === enabled ? null : "Le transport n’a pas confirmé le retour téléphone.",
        });
        return audible === enabled;
      } catch (error) {
        if (intentRevision === this.callProgramIntentRevision) {
          this.callProgramEnabledIntent = false;
        }
        track.enabled = false;
        await publication.mute().catch(() => undefined);
        if (this.isCurrent(room, generation)) {
          this.patchSnapshot({
            callProgramAudible: false,
            error: readableError(error, "Impossible de modifier la diffusion de l’appel."),
          });
        }
        return false;
      }
    });
  }

  releaseCallProgramTrack(): Promise<void> {
    return this.enqueueMediaCommit(() => this.releaseCallProgramTrackInternal());
  }

  publishScreenShareStream(stream: MediaStream, generation: string): Promise<boolean> {
    return this.enqueueMediaCommit(async () => {
      const room = this.room;
      const roomGeneration = this.roomGeneration;
      const sourceVideoTrack = stream.getVideoTracks().find((track) => track.readyState === "live") ?? null;
      const sourceAudioTrack = stream.getAudioTracks().find((track) => track.readyState === "live") ?? null;
      if (!this.canOwnScreenShare(room)
        || !sourceVideoTrack
        || !GENERATION_PATTERN.test(generation)) {
        return false;
      }

      if (this.screenSourceStream === stream
        && this.screenGeneration === generation
        && this.screenVideoPublication) {
        return true;
      }

      await this.releaseScreenShareInternal();
      if (!this.isCurrent(room, roomGeneration) || !this.canOwnScreenShare(room)) return false;

      // Publish clones so RTC teardown never kills the local preview selected
      // by the UI and never opens another getDisplayMedia picker.
      let videoTrack: MediaStreamTrack;
      let audioTrack: MediaStreamTrack | null;
      try {
        videoTrack = sourceVideoTrack.clone();
        audioTrack = sourceAudioTrack?.clone() ?? null;
      } catch (error) {
        this.patchSnapshot({
          error: readableError(error, "La capture sélectionnée ne peut pas être préparée."),
        });
        return false;
      }
      videoTrack.enabled = false;
      if (audioTrack) audioTrack.enabled = false;
      this.screenSourceStream = stream;
      this.screenVideoTrack = videoTrack;
      this.screenAudioTrack = audioTrack;
      this.screenGeneration = generation;
      this.screenEnabledIntent = false;
      const onEnded = () => {
        if (this.screenSourceStream !== stream || this.screenGeneration !== generation) return;
        void this.releaseScreenShare();
      };
      sourceVideoTrack.addEventListener("ended", onEnded, { once: true });
      this.screenSourceEndedCleanup = () => sourceVideoTrack.removeEventListener("ended", onEnded);

      let videoPublication: LocalTrackPublication | null = null;
      let audioPublication: LocalTrackPublication | null = null;
      const rollback = async () => {
        videoTrack.enabled = false;
        if (audioTrack) audioTrack.enabled = false;
        if (videoPublication) await videoPublication.mute().catch(() => undefined);
        if (audioPublication) await audioPublication.mute().catch(() => undefined);
        if (videoPublication) {
          await room!.localParticipant.unpublishTrack(
            videoPublication.track ?? videoTrack,
            false,
          ).catch(() => undefined);
        }
        if (audioPublication && audioTrack) {
          await room!.localParticipant.unpublishTrack(
            audioPublication.track ?? audioTrack,
            false,
          ).catch(() => undefined);
        }
        videoTrack.stop();
        audioTrack?.stop();
        if (this.screenVideoTrack === videoTrack && this.screenGeneration === generation) {
          this.clearScreenReferences();
        }
      };

      try {
        videoPublication = await room!.localParticipant.publishTrack(videoTrack, {
          name: PLACE_LIVEKIT_SCREEN_VIDEO_TRACK_NAME,
          stream: PLACE_LIVEKIT_SCREEN_STREAM_NAME,
          source: Track.Source.ScreenShare,
        });
        if (audioTrack) {
          audioPublication = await room!.localParticipant.publishTrack(audioTrack, {
            name: PLACE_LIVEKIT_SCREEN_AUDIO_TRACK_NAME,
            stream: PLACE_LIVEKIT_SCREEN_STREAM_NAME,
            source: Track.Source.ScreenShareAudio,
            audioPreset: AudioPresets.musicHighQuality,
            dtx: false,
            red: true,
          });
        }
        if (!this.isCurrent(room, roomGeneration)
          || this.screenSourceStream !== stream
          || this.screenGeneration !== generation) {
          await rollback();
          return false;
        }
        this.screenVideoPublication = videoPublication;
        this.screenAudioPublication = audioPublication;
        await this.applyScreenShareIntent(true);
        this.reconcileLocalMediaSnapshot(room!);
        this.patchSnapshot({
          screenSharePublished: true,
          screenShareGeneration: generation,
          error: null,
        });
        return true;
      } catch (error) {
        await rollback();
        if (this.isCurrent(room, roomGeneration)) {
          this.patchSnapshot({
            screenSharePublished: false,
            screenShareGeneration: null,
            error: readableError(error, "Le partage d’écran n’a pas pu être publié."),
          });
        }
        return false;
      }
    });
  }

  releaseScreenShare(): Promise<void> {
    return this.enqueueMediaCommit(() => this.releaseScreenShareInternal());
  }

  async setCameraEnabled(enabled: boolean) {
    const room = this.room;
    const generation = this.roomGeneration;
    if (!room || (!this.canPublishMedia(room) && enabled)) return false;
    if (this.programVideoTrack && this.programVideoPublication) {
      this.programVideoEnabledIntent = enabled;
      this.programVideoTrack.enabled = enabled;
      try {
        await (enabled ? this.programVideoPublication.unmute() : this.programVideoPublication.mute());
        return this.isCurrent(room, generation);
      } catch { if (this.programVideoTrack) this.programVideoTrack.enabled = false; return false; }
    }
    try {
      const { cameraId } = readRoomDevicePreferences();
      await room.localParticipant.setCameraEnabled(enabled, cameraId ? { deviceId: { exact: cameraId } } : undefined);
      if (!this.isCurrent(room, generation)) {
        if (enabled) await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
        return false;
      }
      this.reconcileLocalMediaSnapshot(room);
      return room.localParticipant.isCameraEnabled === enabled;
    } catch (error) {
      if (enabled) await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
      if (this.isCurrent(room, generation)) {
        this.patchSnapshot({ error: readableError(error, "La caméra RTC n’a pas pu être modifiée.") });
      }
      return false;
    }
  }

  private async connectFresh(roomId: string, generation: number, request: number) {
    await this.teardownCurrentRoom();
    if (generation !== this.roomGeneration || request !== this.lifecycleRequest) return false;
    this.replaceSnapshot({ ...initialSnapshot(), roomId, status: "requesting_token" });

    let access: PlaceLiveKitAccess;
    try {
      access = await this.requestAccess(roomId);
    } catch (error) {
      if (generation === this.roomGeneration && request === this.lifecycleRequest) {
        this.patchSnapshot({
          status: "failed",
          error: readableError(error, "Le jeton média de la Room est indisponible."),
        });
      }
      return false;
    }
    if (generation !== this.roomGeneration || request !== this.lifecycleRequest) return false;

    const room = this.createRoom();
    this.room = room;
    this.access = access;
    this.bindRoomEvents(room, generation);
    this.patchSnapshot({
      status: "connecting",
      role: access.role,
      identity: access.identity,
      canPublish: false,
      error: null,
    });
    try {
      await room.connect(access.url, access.token, { autoSubscribe: true });
      if (!this.isCurrent(room, generation) || request !== this.lifecycleRequest) {
        await room.disconnect(false).catch(() => undefined);
        return false;
      }
      if (room.localParticipant.identity !== access.identity) {
        throw new Error("L’identité RTC ne correspond pas à l’identité autorisée par MeeWav.");
      }
      const permissionAllowsPublishing = room.localParticipant.permissions?.canPublish === true;
      const canPublish = access.canPublish && permissionAllowsPublishing;
      // The public music owner is the Host asserted by the server, never an
      // arbitrary publisher that happens to use the same track name.
      if (access.role === "host" && access.identity !== access.programAudioPublisherIdentity) {
        throw new Error("L’identité Host du transport Room est incohérente.");
      }
      this.activeLifecycleRequest = request;
      this.patchSnapshot({
        status: "connected",
        canPublish,
        autoplayBlocked: !room.canPlaybackAudio,
        error: null,
      });
      this.reconcileMediaTracks(room);
      return true;
    } catch (error) {
      if (this.isCurrent(room, generation) && request === this.lifecycleRequest) {
        await this.teardownCurrentRoom();
        if (request !== this.lifecycleRequest) return false;
        this.replaceSnapshot({
          ...initialSnapshot(),
          roomId,
          status: "failed",
          role: access.role,
          identity: access.identity,
          error: readableError(error, "Connexion au transport temps réel impossible."),
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
      if (this.programVideoTrack) this.programVideoTrack.enabled = false;
      // A network recovery never resumes public music by itself.
      this.musicEnabledIntent = false;
      if (this.musicTrack) this.musicTrack.enabled = false;
      // A phone return always drops back to preview after transport recovery.
      this.invalidateCallProgramIntent();
      if (this.callProgramTrack) this.callProgramTrack.enabled = false;
      // Voice and screen remember their upstream intent, but their local media
      // gates close synchronously until permissions/publications are checked.
      if (this.voiceTrack) this.voiceTrack.enabled = false;
      if (this.screenVideoTrack) this.screenVideoTrack.enabled = false;
      if (this.screenAudioTrack) this.screenAudioTrack.enabled = false;
      this.patchSnapshot({
        status: "reconnecting",
        musicAudible: false,
        callProgramAudible: false,
        voiceAudible: false,
        screenSharePublished: false,
        error: null,
      });
    };
    const onReconnected = () => {
      if (!current()) return;
      const canPublish = this.access?.canPublish === true
        && room.localParticipant.permissions?.canPublish === true;
      this.patchSnapshot({
        status: "connected",
        canPublish,
        autoplayBlocked: !room.canPlaybackAudio,
        musicAudible: false,
        callProgramAudible: false,
        voiceAudible: false,
        error: null,
      });
      this.reconcileMediaTracks(room);
      void this.enqueueMediaCommit(() => this.reconcileLocalMediaAfterReconnect(room, generation));
    };
    const onDisconnected = () => {
      if (!current()) return;
      this.programVideoTrack?.stop();
      this.programVideoTrack = null; this.programVideoSource = null; this.programVideoPublication = null;
      this.programVideoEnabledIntent = false;
      this.activeLifecycleRequest = 0;
      if (this.musicTrack) this.musicTrack.enabled = false;
      if (this.voiceTrack) this.voiceTrack.enabled = false;
      if (this.callProgramTrack) this.callProgramTrack.enabled = false;
      if (this.screenVideoTrack) this.screenVideoTrack.enabled = false;
      if (this.screenAudioTrack) this.screenAudioTrack.enabled = false;
      this.snapshot.remoteAudioTracks.forEach(({ track }) => track.detach());
      this.snapshot.videoTracks.forEach(({ track }) => track.detach());
      this.clearMusicReferences();
      this.clearVoiceReferences();
      this.clearCallProgramReferences();
      this.screenVideoTrack?.stop();
      this.screenAudioTrack?.stop();
      this.clearScreenReferences();
      this.patchSnapshot({
        status: "disconnected",
        canPublish: false,
        musicPublished: false,
        musicAudible: false,
        musicGeneration: null,
        voicePublished: false,
        voiceAudible: false,
        voiceGeneration: null,
        callProgramPublished: false,
        callProgramAudible: false,
        callProgramGeneration: null,
        screenSharePublished: false,
        screenShareGeneration: null,
        remoteMusicTracks: [],
        remoteAudioTracks: [],
        videoTracks: [],
      });
    };
    const onConnectionStateChanged = (state: ConnectionState) => {
      if (!current()) return;
      if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) onReconnecting();
    };
    const onRemoteMediaChanged = () => {
      if (!current()) return;
      this.reconcileMediaTracks(room);
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
      if (participant === room.localParticipant && this.snapshot.status !== "reconnecting") {
        if (publication.trackSid === this.musicPublication?.trackSid) {
          this.musicEnabledIntent = false;
          if (this.musicTrack) this.musicTrack.enabled = false;
        }
        if (publication.trackSid === this.voicePublication?.trackSid) {
          this.voiceEnabledIntent = false;
          if (this.voiceTrack) this.voiceTrack.enabled = false;
        }
        if (publication.trackSid === this.callProgramPublication?.trackSid) {
          this.invalidateCallProgramIntent();
          if (this.callProgramTrack) this.callProgramTrack.enabled = false;
        }
        if ((publication.trackSid === this.screenVideoPublication?.trackSid
          || publication.trackSid === this.screenAudioPublication?.trackSid)
          && this.screenEnabledIntent) {
          this.screenEnabledIntent = false;
          if (this.screenVideoTrack) this.screenVideoTrack.enabled = false;
          if (this.screenAudioTrack) this.screenAudioTrack.enabled = false;
          void this.releaseScreenShare();
        }
      }
      this.reconcileLocalMediaSnapshot(room);
    };
    const onTrackUnmuted = () => {
      if (!current()) return;
      this.reconcileLocalMediaSnapshot(room);
    };
    const onLocalTrackPublished = () => {
      if (!current()) return;
      this.reconcileLocalMediaSnapshot(room);
    };
    const onLocalTrackUnpublished = (publication: LocalTrackPublication) => {
      if (!current()) return;
      if (this.snapshot.status !== "reconnecting") {
        if (publication.trackSid === this.musicPublication?.trackSid && this.musicEnabledIntent) {
          this.musicEnabledIntent = false;
          if (this.musicTrack) this.musicTrack.enabled = false;
          void this.releaseMusicTrack();
        }
        if (publication.trackSid === this.voicePublication?.trackSid && this.voiceEnabledIntent) {
          this.voiceEnabledIntent = false;
          if (this.voiceTrack) this.voiceTrack.enabled = false;
          void this.releaseVoiceTrack();
        }
        if (publication.trackSid === this.callProgramPublication?.trackSid
          && this.callProgramEnabledIntent) {
          this.invalidateCallProgramIntent();
          if (this.callProgramTrack) this.callProgramTrack.enabled = false;
          void this.releaseCallProgramTrack();
        }
        if ((publication.trackSid === this.screenVideoPublication?.trackSid
          || publication.trackSid === this.screenAudioPublication?.trackSid)
          && this.screenEnabledIntent) {
          this.screenEnabledIntent = false;
          if (this.screenVideoTrack) this.screenVideoTrack.enabled = false;
          if (this.screenAudioTrack) this.screenAudioTrack.enabled = false;
          void this.releaseScreenShare();
        }
      }
      this.reconcileLocalMediaSnapshot(room);
    };
    const onAudioPlaybackStatusChanged = () => {
      if (!current()) return;
      this.patchSnapshot({ autoplayBlocked: !room.canPlaybackAudio });
    };
    const onParticipantPermissionsChanged = (_previous: unknown, participant: Participant) => {
      if (!current()) return;
      if (participant === room.localParticipant) {
        const canPublish = this.access?.canPublish === true && participant.permissions?.canPublish === true;
        this.patchSnapshot({ canPublish });
        if (!canPublish) {
          this.programVideoEnabledIntent = false;
          if (this.programVideoTrack) this.programVideoTrack.enabled = false;
          this.musicEnabledIntent = false;
          this.voiceEnabledIntent = false;
          this.invalidateCallProgramIntent();
          this.screenEnabledIntent = false;
          if (this.musicTrack) this.musicTrack.enabled = false;
          if (this.voiceTrack) this.voiceTrack.enabled = false;
          if (this.callProgramTrack) this.callProgramTrack.enabled = false;
          if (this.screenVideoTrack) this.screenVideoTrack.enabled = false;
          if (this.screenAudioTrack) this.screenAudioTrack.enabled = false;
          void room.localParticipant.setCameraEnabled(false).catch(() => undefined);
          void this.enqueueMediaCommit(async () => {
            await this.releaseProgramVideoInternal();
            await this.releaseMusicTrackInternal();
            await this.releaseVoiceTrackInternal();
            await this.releaseCallProgramTrackInternal();
            await this.releaseScreenShareInternal();
          });
        }
      }
      this.reconcileMediaTracks(room);
    };
    const onParticipantMetadataChanged = () => onRemoteMediaChanged();

    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected, onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.TrackMuted, onTrackMuted);
    room.on(RoomEvent.TrackUnmuted, onTrackUnmuted);
    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);
    room.on(RoomEvent.AudioPlaybackStatusChanged, onAudioPlaybackStatusChanged);
    room.on(RoomEvent.ParticipantPermissionsChanged, onParticipantPermissionsChanged);
    room.on(RoomEvent.ParticipantMetadataChanged, onParticipantMetadataChanged);

    this.roomEventCleanups = [
      () => room.off(RoomEvent.Reconnecting, onReconnecting),
      () => room.off(RoomEvent.Reconnected, onReconnected),
      () => room.off(RoomEvent.Disconnected, onDisconnected),
      () => room.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged),
      () => room.off(RoomEvent.TrackSubscribed, onTrackSubscribed),
      () => room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed),
      () => room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected),
      () => room.off(RoomEvent.TrackMuted, onTrackMuted),
      () => room.off(RoomEvent.TrackUnmuted, onTrackUnmuted),
      () => room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished),
      () => room.off(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished),
      () => room.off(RoomEvent.AudioPlaybackStatusChanged, onAudioPlaybackStatusChanged),
      () => room.off(RoomEvent.ParticipantPermissionsChanged, onParticipantPermissionsChanged),
      () => room.off(RoomEvent.ParticipantMetadataChanged, onParticipantMetadataChanged),
    ];
  }

  private async reconcileLocalMediaAfterReconnect(room: Room, generation: number) {
    if (!this.isCurrent(room, generation)) return;
    if (!this.canPublishMedia(room)) {
      await this.releaseProgramVideoInternal();
      await this.releaseMusicTrackInternal();
      await this.releaseVoiceTrackInternal();
      await this.releaseCallProgramTrackInternal();
      await this.releaseScreenShareInternal();
      return;
    }

    try {
      await this.reconcileLocalMusicAfterReconnect(room, generation);
    } catch (error) {
      await this.releaseMusicTrackInternal();
      if (this.isCurrent(room, generation)) {
        this.patchSnapshot({ error: readableError(error, "La musique n’a pas pu être restaurée après reconnexion.") });
      }
    }
    try {
      await this.reconcileLocalVoiceAfterReconnect(room, generation);
    } catch (error) {
      await this.releaseVoiceTrackInternal();
      if (this.isCurrent(room, generation)) {
        this.patchSnapshot({ error: readableError(error, "La voix n’a pas pu être restaurée après reconnexion.") });
      }
    }
    try {
      await this.reconcileLocalCallProgramAfterReconnect(room, generation);
    } catch (error) {
      await this.releaseCallProgramTrackInternal();
      if (this.isCurrent(room, generation)) {
        this.patchSnapshot({ error: readableError(error, "L’appel n’a pas pu être restauré en préécoute.") });
      }
    }
    try {
      await this.reconcileLocalScreenAfterReconnect(room, generation);
    } catch (error) {
      await this.releaseScreenShareInternal();
      if (this.isCurrent(room, generation)) {
        this.patchSnapshot({ error: readableError(error, "Le partage d’écran n’a pas pu être restauré après reconnexion.") });
      }
    }
    if (this.isCurrent(room, generation)) {
      this.reconcileLocalMediaSnapshot(room);
      this.reconcileMediaTracks(room);
    }
  }

  private async reconcileLocalMusicAfterReconnect(room: Room, generation: number) {
    if (!this.isCurrent(room, generation)) return;
    this.musicEnabledIntent = false;
    if (this.musicTrack) this.musicTrack.enabled = false;
    let publication = room.localParticipant.getTrackPublicationByName(PLACE_LIVEKIT_MUSIC_TRACK_NAME) as LocalTrackPublication | undefined;
    if (publication && this.musicTrack
      && publication.track?.mediaStreamTrack !== this.musicTrack) {
      await room.localParticipant.unpublishTrack(publication.track!, false).catch(() => undefined);
      publication = undefined;
    }
    if (publication && this.musicTrack) {
      this.musicPublication = publication;
      await this.forceMusicMuted(publication, this.musicTrack);
      return;
    }
    const track = this.musicTrack;
    const musicGeneration = this.musicGeneration;
    if (!track || !musicGeneration || track.readyState !== "live" || !this.canOwnProgramMusic(room)) {
      this.patchSnapshot({ musicPublished: false, musicAudible: false });
      return;
    }
    // Full reconnects may lose the publication. Recreate it muted, but never
    // resume the audible state without a new explicit Play action.
    const channelCount = track.getSettings().channelCount;
    const createdPublication = await room.localParticipant.publishTrack(track, {
      name: PLACE_LIVEKIT_MUSIC_TRACK_NAME,
      stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
      source: Track.Source.Microphone,
      audioPreset: channelCount === 2 ? AudioPresets.musicHighQualityStereo : AudioPresets.musicHighQuality,
      dtx: false,
      red: true,
      forceStereo: channelCount === 2,
    });
    if (!this.isCurrent(room, generation) || this.musicTrack !== track) {
      await room.localParticipant.unpublishTrack(createdPublication.track ?? track, false).catch(() => undefined);
      return;
    }
    this.musicPublication = createdPublication;
    await this.forceMusicMuted(this.musicPublication, track);
  }

  private async reconcileLocalVoiceAfterReconnect(room: Room, generation: number) {
    if (!this.isCurrent(room, generation)) return;
    const track = this.voiceTrack;
    const enabledIntent = this.voiceEnabledIntent;
    if (!track || !this.voiceGeneration || track.readyState !== "live" || !this.canPublishMedia(room)) {
      this.patchSnapshot({ voicePublished: false, voiceAudible: false });
      return;
    }
    let publication = room.localParticipant.getTrackPublicationByName(
      PLACE_LIVEKIT_VOICE_TRACK_NAME,
    ) as LocalTrackPublication | undefined;
    if (publication && publication.track?.mediaStreamTrack !== track) {
      await room.localParticipant.unpublishTrack(publication.track!, false).catch(() => undefined);
      publication = undefined;
    }
    if (!publication) {
      publication = await room.localParticipant.publishTrack(track, {
        name: PLACE_LIVEKIT_VOICE_TRACK_NAME,
        stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
        source: Track.Source.Microphone,
        audioPreset: AudioPresets.musicHighQuality,
        dtx: false,
        red: true,
      });
    }
    if (!this.isCurrent(room, generation) || this.voiceTrack !== track) {
      await room.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
      return;
    }
    this.voicePublication = publication;
    this.voiceEnabledIntent = enabledIntent;
    await this.applyVoiceIntent(enabledIntent);
  }

  private async reconcileLocalCallProgramAfterReconnect(room: Room, generation: number) {
    if (!this.isCurrent(room, generation)) return;
    // Public phone audio is never resumed automatically after a transport
    // interruption. Recreate its publication muted so the Host must confirm
    // the on-air action again.
    this.invalidateCallProgramIntent();
    const track = this.callProgramTrack;
    if (track) track.enabled = false;
    if (!track
      || !this.callProgramGeneration
      || track.readyState !== "live"
      || !this.canOwnProgramMusic(room)) {
      this.patchSnapshot({ callProgramPublished: false, callProgramAudible: false });
      return;
    }
    let publication = room.localParticipant.getTrackPublicationByName(
      PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME,
    ) as LocalTrackPublication | undefined;
    if (publication && publication.track?.mediaStreamTrack !== track) {
      await room.localParticipant.unpublishTrack(publication.track!, false).catch(() => undefined);
      publication = undefined;
    }
    if (!publication) {
      publication = await room.localParticipant.publishTrack(track, {
        name: PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME,
        stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
        source: Track.Source.Microphone,
        audioPreset: AudioPresets.musicHighQuality,
        dtx: false,
        red: true,
      });
    }
    if (!this.isCurrent(room, generation) || this.callProgramTrack !== track) {
      await room.localParticipant.unpublishTrack(publication.track ?? track, false).catch(() => undefined);
      return;
    }
    this.callProgramPublication = publication;
    await this.forceCallProgramMuted(publication, track);
  }

  private async reconcileLocalScreenAfterReconnect(room: Room, generation: number) {
    if (!this.isCurrent(room, generation)) return;
    const videoTrack = this.screenVideoTrack;
    const audioTrack = this.screenAudioTrack;
    const enabledIntent = this.screenEnabledIntent;
    if (!videoTrack
      || !this.screenGeneration
      || videoTrack.readyState !== "live"
      || (audioTrack && audioTrack.readyState !== "live")
      || !this.canOwnScreenShare(room)) {
      this.patchSnapshot({ screenSharePublished: false });
      return;
    }

    let videoPublication = room.localParticipant.getTrackPublicationByName(
      PLACE_LIVEKIT_SCREEN_VIDEO_TRACK_NAME,
    ) as LocalTrackPublication | undefined;
    if (videoPublication && videoPublication.track?.mediaStreamTrack !== videoTrack) {
      await room.localParticipant.unpublishTrack(videoPublication.track!, false).catch(() => undefined);
      videoPublication = undefined;
    }
    if (!videoPublication) {
      videoPublication = await room.localParticipant.publishTrack(videoTrack, {
        name: PLACE_LIVEKIT_SCREEN_VIDEO_TRACK_NAME,
        stream: PLACE_LIVEKIT_SCREEN_STREAM_NAME,
        source: Track.Source.ScreenShare,
      });
    }
    let audioPublication = room.localParticipant.getTrackPublicationByName(
      PLACE_LIVEKIT_SCREEN_AUDIO_TRACK_NAME,
    ) as LocalTrackPublication | undefined;
    if (audioPublication && audioTrack
      && audioPublication.track?.mediaStreamTrack !== audioTrack) {
      await room.localParticipant.unpublishTrack(audioPublication.track!, false).catch(() => undefined);
      audioPublication = undefined;
    }
    if (audioTrack && !audioPublication) {
      audioPublication = await room.localParticipant.publishTrack(audioTrack, {
        name: PLACE_LIVEKIT_SCREEN_AUDIO_TRACK_NAME,
        stream: PLACE_LIVEKIT_SCREEN_STREAM_NAME,
        source: Track.Source.ScreenShareAudio,
        audioPreset: AudioPresets.musicHighQuality,
        dtx: false,
        red: true,
      });
    }
    if (!this.isCurrent(room, generation) || this.screenVideoTrack !== videoTrack) {
      await room.localParticipant.unpublishTrack(videoPublication.track ?? videoTrack, false).catch(() => undefined);
      if (audioPublication && audioTrack) {
        await room.localParticipant.unpublishTrack(audioPublication.track ?? audioTrack, false).catch(() => undefined);
      }
      return;
    }
    this.screenVideoPublication = videoPublication;
    this.screenAudioPublication = audioPublication ?? null;
    this.screenEnabledIntent = enabledIntent;
    await this.applyScreenShareIntent(enabledIntent);
  }

  private reconcileMediaTracks(room: Room) {
    const remoteAudioTracks: PlaceRemoteAudioTrack[] = [];
    const videoTracks: PlaceLiveKitVideoTrack[] = [];
    room.remoteParticipants.forEach((participant) => {
      const claimedAudioPurposes = new Set<PlaceRemoteAudioPurpose>();
      const audioPublications = [...participant.audioTrackPublications.values()].sort((left, right) => {
        const canonical = (publication: TrackPublication) => (
          publication.trackName === PLACE_LIVEKIT_MUSIC_TRACK_NAME
          || publication.trackName === PLACE_LIVEKIT_VOICE_TRACK_NAME
          || publication.trackName === PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME
          || publication.trackName === PLACE_LIVEKIT_SCREEN_AUDIO_TRACK_NAME
        ) ? 0 : 1;
        return canonical(left) - canonical(right);
      });
      audioPublications.forEach((publication) => {
        const track = publication.track;
        if (!(track instanceof RemoteAudioTrack)) return;
        const remotePublication = publication as RemoteTrackPublication;
        const purpose = this.authorizedRemoteAudioPurpose(remotePublication, participant);
        if (!purpose || claimedAudioPurposes.has(purpose)) return;
        claimedAudioPurposes.add(purpose);
        remoteAudioTracks.push(this.remoteAudioItem(track, remotePublication, participant, purpose));
      });
      const role = this.authorizedRemoteRole(participant);
      if (!role) return;
      participant.videoTrackPublications.forEach((publication) => {
        const track = publication.track;
        if (!(track instanceof RemoteVideoTrack)) return;
        const source = this.videoSource(publication.source);
        if (!source) return;
        if (source === "screen_share"
          && (role !== "host" || participant.identity !== this.access?.programAudioPublisherIdentity)) return;
        videoTracks.push({
          key: `${participant.identity}:${publication.trackSid}`,
          publicationSid: publication.trackSid,
          participantIdentity: participant.identity,
          track,
          muted: publication.isMuted,
          local: false,
          source,
        });
      });
    });

    room.localParticipant.videoTrackPublications.forEach((publication) => {
      const track = publication.track;
      if (!(track instanceof LocalVideoTrack)) return;
      const source = this.videoSource(publication.source);
      if (!source) return;
      if (source === "screen_share" && !this.canOwnScreenShare(room)) return;
      videoTracks.push({
        key: `${room.localParticipant.identity}:${publication.trackSid}`,
        publicationSid: publication.trackSid,
        participantIdentity: room.localParticipant.identity,
        track,
        muted: publication.isMuted,
        local: true,
        source,
      });
    });

    remoteAudioTracks.sort((left, right) => left.key.localeCompare(right.key));
    videoTracks.sort((left, right) => left.key.localeCompare(right.key));
    this.patchSnapshot({
      remoteAudioTracks,
      remoteMusicTracks: remoteAudioTracks.filter(
        (item): item is PlaceRemoteMusicTrack => item.purpose === "music",
      ),
      videoTracks,
    });
  }

  private authorizedRemoteRole(participant: RemoteParticipant): "host" | "guest" | null {
    if (!isSafeIdentity(participant.identity)
      || participant.permissions?.canPublish !== true
      || !this.snapshot.roomId) return null;
    try {
      const metadata = asRecord(JSON.parse(participant.metadata ?? "{}"));
      if (metadata.roomId !== this.snapshot.roomId) return null;
      return metadata.role === "host" || metadata.role === "guest" ? metadata.role : null;
    } catch {
      return null;
    }
  }

  private authorizedRemoteAudioPurpose(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): PlaceRemoteAudioPurpose | null {
    const role = this.authorizedRemoteRole(participant);
    if (!role || publication.kind !== Track.Kind.Audio) return null;
    if (publication.trackName === PLACE_LIVEKIT_MUSIC_TRACK_NAME
      && publication.source === Track.Source.Microphone
      && role === "host"
      && participant.identity === this.access?.programAudioPublisherIdentity) {
      return "music";
    }
    if (publication.trackName === PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME
      && publication.source === Track.Source.Microphone
      && role === "host"
      && participant.identity === this.access?.programAudioPublisherIdentity) {
      return "phone_call";
    }
    if (publication.source === Track.Source.Microphone
      && publication.trackName !== PLACE_LIVEKIT_MUSIC_TRACK_NAME
      && publication.trackName !== PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME) {
      return "voice";
    }
    if (publication.source === Track.Source.ScreenShareAudio
      && role === "host"
      && participant.identity === this.access?.programAudioPublisherIdentity) {
      return "screen_share_audio";
    }
    return null;
  }

  private remoteAudioItem(
    track: RemoteAudioTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    purpose: PlaceRemoteAudioPurpose,
  ): PlaceRemoteAudioTrack {
    return {
      key: `${participant.identity}:${publication.trackSid}`,
      publicationSid: publication.trackSid,
      participantIdentity: participant.identity,
      track,
      muted: publication.isMuted,
      purpose,
    };
  }

  private videoSource(source: Track.Source): PlaceLiveKitVideoTrack["source"] | null {
    if (source === Track.Source.Camera) return "camera";
    if (source === Track.Source.ScreenShare) return "screen_share";
    return null;
  }

  private reconcileLocalMediaSnapshot(room: Room) {
    const publication = room.localParticipant.getTrackPublicationByName(PLACE_LIVEKIT_MUSIC_TRACK_NAME) as LocalTrackPublication | undefined;
    if (publication && this.musicTrack && publication.track?.mediaStreamTrack === this.musicTrack) {
      this.musicPublication = publication;
    }
    const activePublication = this.musicPublication;
    const published = Boolean(activePublication && room.localParticipant.trackPublications.has(activePublication.trackSid));
    const audible = Boolean(
      published
      && this.musicEnabledIntent
      && this.musicTrack?.enabled
      && !activePublication?.isMuted,
    );
    const voicePublication = room.localParticipant.getTrackPublicationByName(
      PLACE_LIVEKIT_VOICE_TRACK_NAME,
    ) as LocalTrackPublication | undefined;
    if (voicePublication && this.voiceTrack && voicePublication.track?.mediaStreamTrack === this.voiceTrack) {
      this.voicePublication = voicePublication;
    }
    const activeVoicePublication = this.voicePublication;
    const voicePublished = Boolean(
      activeVoicePublication
      && room.localParticipant.trackPublications.has(activeVoicePublication.trackSid),
    );
    const voiceAudible = Boolean(
      voicePublished
      && this.voiceEnabledIntent
      && this.voiceTrack?.enabled
      && !activeVoicePublication?.isMuted,
    );
    const callProgramPublication = room.localParticipant.getTrackPublicationByName(
      PLACE_LIVEKIT_CALL_PROGRAM_TRACK_NAME,
    ) as LocalTrackPublication | undefined;
    if (callProgramPublication && this.callProgramTrack
      && callProgramPublication.track?.mediaStreamTrack === this.callProgramTrack) {
      this.callProgramPublication = callProgramPublication;
    }
    const activeCallProgramPublication = this.callProgramPublication;
    const callProgramPublished = Boolean(
      activeCallProgramPublication
      && room.localParticipant.trackPublications.has(activeCallProgramPublication.trackSid),
    );
    const callProgramAudible = Boolean(
      callProgramPublished
      && this.callProgramEnabledIntent
      && this.callProgramTrack?.enabled
      && !activeCallProgramPublication?.isMuted,
    );
    const screenVideoPublication = room.localParticipant.getTrackPublicationByName(
      PLACE_LIVEKIT_SCREEN_VIDEO_TRACK_NAME,
    ) as LocalTrackPublication | undefined;
    if (screenVideoPublication && this.screenVideoTrack
      && screenVideoPublication.track?.mediaStreamTrack === this.screenVideoTrack) {
      this.screenVideoPublication = screenVideoPublication;
    }
    const screenSharePublished = Boolean(
      this.screenVideoPublication
      && room.localParticipant.trackPublications.has(this.screenVideoPublication.trackSid)
      && this.screenEnabledIntent
      && this.screenVideoTrack?.enabled
      && !this.screenVideoPublication.isMuted
      && (!this.screenAudioTrack || (
        this.screenAudioPublication
        && room.localParticipant.trackPublications.has(this.screenAudioPublication.trackSid)
        && this.screenAudioTrack.enabled
        && !this.screenAudioPublication.isMuted
      )),
    );
    this.patchSnapshot({
      musicPublished: published,
      musicAudible: audible,
      voicePublished,
      voiceAudible,
      callProgramPublished,
      callProgramAudible,
      screenSharePublished,
    });
    this.reconcileMediaTracks(room);
  }

  private canPublishNow() {
    return Boolean(
      this.room
      && this.snapshot.status === "connected"
      && this.activeLifecycleRequest === this.lifecycleRequest
      && this.snapshot.canPublish
      && this.access?.canPublish,
    );
  }

  private canPublishMedia(room: Room | null) {
    return Boolean(
      room
      && room === this.room
      && this.canPublishNow()
      && (this.access?.role === "host" || this.access?.role === "guest"),
    );
  }

  private canOwnProgramMusic(room: Room | null) {
    return Boolean(
      room
      && this.canPublishNow()
      && this.access?.role === "host"
      && this.access.identity === this.access.programAudioPublisherIdentity,
    );
  }

  private canOwnScreenShare(room: Room | null) {
    return Boolean(
      room
      && room === this.room
      && this.canPublishNow()
      && this.access?.role === "host"
      && this.access.identity === this.access.programAudioPublisherIdentity,
    );
  }

  private isCurrent(room: Room | null, generation: number) {
    return Boolean(room && this.room === room && this.roomGeneration === generation);
  }

  private async forceMusicMuted(publication: LocalTrackPublication, track: MediaStreamTrack) {
    this.musicEnabledIntent = false;
    track.enabled = false;
    await publication.mute();
    if (this.musicPublication !== publication || this.musicTrack !== track) return;
    this.patchSnapshot({
      musicPublished: true,
      musicAudible: false,
      musicGeneration: this.musicGeneration,
    });
  }

  private async forceVoiceMuted(publication: LocalTrackPublication, track: MediaStreamTrack) {
    this.voiceEnabledIntent = false;
    track.enabled = false;
    await publication.mute();
    if (this.voicePublication !== publication || this.voiceTrack !== track) return;
    this.patchSnapshot({
      voicePublished: true,
      voiceAudible: false,
      voiceGeneration: this.voiceGeneration,
    });
  }

  private async forceCallProgramMuted(publication: LocalTrackPublication, track: MediaStreamTrack) {
    this.invalidateCallProgramIntent();
    track.enabled = false;
    await publication.mute();
    if (this.callProgramPublication !== publication || this.callProgramTrack !== track) return;
    this.patchSnapshot({
      callProgramPublished: true,
      callProgramAudible: false,
      callProgramGeneration: this.callProgramGeneration,
    });
  }

  private async applyVoiceIntent(enabled: boolean) {
    const publication = this.voicePublication;
    const track = this.voiceTrack;
    if (!publication || !track) throw new Error("La piste voix n’est pas préparée.");
    const room = this.room;
    const generation = this.roomGeneration;
    this.voiceEnabledIntent = enabled;
    if (enabled) {
      if (track.readyState !== "live") throw new Error("La piste voix n’est plus disponible.");
      await publication.unmute();
      if (!this.isCurrent(room, generation)
        || this.voicePublication !== publication
        || this.voiceTrack !== track) {
        track.enabled = false;
        await publication.mute().catch(() => undefined);
        throw new Error("La Room a changé pendant la restauration de la voix.");
      }
      track.enabled = true;
    } else {
      track.enabled = false;
      await publication.mute();
    }
    if (!this.isCurrent(room, generation)
      || this.voicePublication !== publication
      || this.voiceTrack !== track) return;
    this.patchSnapshot({
      voicePublished: true,
      voiceAudible: enabled && track.enabled && !publication.isMuted,
      voiceGeneration: this.voiceGeneration,
    });
  }

  private async applyScreenShareIntent(enabled: boolean) {
    const videoPublication = this.screenVideoPublication;
    const audioPublication = this.screenAudioPublication;
    const videoTrack = this.screenVideoTrack;
    const audioTrack = this.screenAudioTrack;
    if (!videoPublication || !videoTrack || (audioTrack && !audioPublication)) {
      throw new Error("Le partage d’écran n’est pas préparé.");
    }
    const room = this.room;
    const generation = this.roomGeneration;
    this.screenEnabledIntent = enabled;
    if (enabled) {
      if (videoTrack.readyState !== "live" || (audioTrack && audioTrack.readyState !== "live")) {
        throw new Error("La capture d’écran n’est plus disponible.");
      }
      await videoPublication.unmute();
      if (audioPublication) await audioPublication.unmute();
      if (!this.isCurrent(room, generation)
        || this.screenVideoPublication !== videoPublication
        || this.screenVideoTrack !== videoTrack) {
        videoTrack.enabled = false;
        if (audioTrack) audioTrack.enabled = false;
        await videoPublication.mute().catch(() => undefined);
        await audioPublication?.mute().catch(() => undefined);
        throw new Error("La Room a changé pendant la restauration du partage d’écran.");
      }
      videoTrack.enabled = true;
      if (audioTrack) audioTrack.enabled = true;
    } else {
      videoTrack.enabled = false;
      if (audioTrack) audioTrack.enabled = false;
      await videoPublication.mute();
      if (audioPublication) await audioPublication.mute();
    }
    if (!this.isCurrent(room, generation)
      || this.screenVideoPublication !== videoPublication
      || this.screenVideoTrack !== videoTrack) return;
    this.patchSnapshot({
      screenSharePublished: true,
      screenShareGeneration: this.screenGeneration,
    });
  }

  private async releaseMusicTrackInternal() {
    const room = this.room;
    const publication = this.musicPublication;
    const track = this.musicTrack;
    this.musicEnabledIntent = false;
    if (track) track.enabled = false;
    if (publication) await publication.mute().catch(() => undefined);
    if (room && (publication?.track || track)) {
      await room.localParticipant.unpublishTrack(publication?.track ?? track!, false).catch(() => undefined);
    }
    this.clearMusicReferences();
    this.patchSnapshot({ musicPublished: false, musicAudible: false, musicGeneration: null });
  }

  private clearMusicReferences() {
    this.musicTrackEndedCleanup?.();
    this.musicTrackEndedCleanup = null;
    this.musicTrack = null;
    this.musicPublication = null;
    this.musicGeneration = null;
    this.musicEnabledIntent = false;
  }

  private async releaseVoiceTrackInternal() {
    const room = this.room;
    const publication = this.voicePublication;
    const track = this.voiceTrack;
    this.voiceEnabledIntent = false;
    if (track) track.enabled = false;
    if (publication) await publication.mute().catch(() => undefined);
    if (room && (publication?.track || track)) {
      await room.localParticipant.unpublishTrack(publication?.track ?? track!, false).catch(() => undefined);
    }
    this.clearVoiceReferences();
    this.patchSnapshot({ voicePublished: false, voiceAudible: false, voiceGeneration: null });
  }

  private clearVoiceReferences() {
    this.voiceTrackEndedCleanup?.();
    this.voiceTrackEndedCleanup = null;
    this.voiceTrack = null;
    this.voicePublication = null;
    this.voiceGeneration = null;
    this.voiceEnabledIntent = false;
  }

  private async releaseCallProgramTrackInternal() {
    const room = this.room;
    const publication = this.callProgramPublication;
    const track = this.callProgramTrack;
    this.invalidateCallProgramIntent();
    if (track) track.enabled = false;
    if (publication) await publication.mute().catch(() => undefined);
    if (room && (publication?.track || track)) {
      await room.localParticipant.unpublishTrack(publication?.track ?? track!, false).catch(() => undefined);
    }
    this.clearCallProgramReferences();
    this.patchSnapshot({
      callProgramPublished: false,
      callProgramAudible: false,
      callProgramGeneration: null,
    });
  }

  private clearCallProgramReferences() {
    this.callProgramTrackEndedCleanup?.();
    this.callProgramTrackEndedCleanup = null;
    this.callProgramTrack = null;
    this.callProgramPublication = null;
    this.callProgramGeneration = null;
    this.invalidateCallProgramIntent();
  }

  private invalidateCallProgramIntent() {
    this.callProgramIntentRevision += 1;
    this.callProgramEnabledIntent = false;
    if (this.callProgramTrack) this.callProgramTrack.enabled = false;
  }

  private async releaseScreenShareInternal() {
    const room = this.room;
    const videoPublication = this.screenVideoPublication;
    const audioPublication = this.screenAudioPublication;
    const videoTrack = this.screenVideoTrack;
    const audioTrack = this.screenAudioTrack;
    this.screenEnabledIntent = false;
    if (videoTrack) videoTrack.enabled = false;
    if (audioTrack) audioTrack.enabled = false;
    if (videoPublication) await videoPublication.mute().catch(() => undefined);
    if (audioPublication) await audioPublication.mute().catch(() => undefined);
    if (room && (videoPublication?.track || videoTrack)) {
      await room.localParticipant.unpublishTrack(
        videoPublication?.track ?? videoTrack!,
        false,
      ).catch(() => undefined);
    }
    if (room && (audioPublication?.track || audioTrack)) {
      await room.localParticipant.unpublishTrack(
        audioPublication?.track ?? audioTrack!,
        false,
      ).catch(() => undefined);
    }
    this.screenSourceEndedCleanup?.();
    this.screenSourceEndedCleanup = null;
    // These are our clones, not the source tracks retained by the UI preview.
    videoTrack?.stop();
    audioTrack?.stop();
    this.clearScreenReferences();
    this.patchSnapshot({ screenSharePublished: false, screenShareGeneration: null });
  }

  private clearScreenReferences() {
    this.screenSourceEndedCleanup?.();
    this.screenSourceEndedCleanup = null;
    this.screenSourceStream = null;
    this.screenVideoTrack = null;
    this.screenAudioTrack = null;
    this.screenVideoPublication = null;
    this.screenAudioPublication = null;
    this.screenGeneration = null;
    this.screenEnabledIntent = false;
  }

  private enqueueMediaCommit<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mediaCommitChain.catch(() => undefined).then(operation);
    this.mediaCommitChain = result.then(() => undefined, () => undefined);
    return result;
  }

  private enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleChain.catch(() => undefined).then(operation);
    this.lifecycleChain = result.then(() => undefined, () => undefined);
    return result;
  }

  private closeLocalMediaGates() {
    if (this.programVideoTrack) this.programVideoTrack.enabled = false;
    this.musicEnabledIntent = false;
    this.voiceEnabledIntent = false;
    this.invalidateCallProgramIntent();
    this.screenEnabledIntent = false;
    if (this.musicTrack) this.musicTrack.enabled = false;
    if (this.voiceTrack) this.voiceTrack.enabled = false;
    if (this.callProgramTrack) this.callProgramTrack.enabled = false;
    if (this.screenVideoTrack) this.screenVideoTrack.enabled = false;
    if (this.screenAudioTrack) this.screenAudioTrack.enabled = false;
  }

  private async teardownCurrentRoom() {
    await this.releaseProgramVideoInternal();
    const room = this.room;
    if (!room) {
      this.access = null;
      this.activeLifecycleRequest = 0;
      this.clearMusicReferences();
      this.clearVoiceReferences();
      this.clearCallProgramReferences();
      this.screenVideoTrack?.stop();
      this.screenAudioTrack?.stop();
      this.clearScreenReferences();
      return;
    }
    await this.releaseMusicTrackInternal();
    await this.releaseVoiceTrackInternal();
    await this.releaseCallProgramTrackInternal();
    await this.releaseScreenShareInternal();
    await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
    this.roomEventCleanups.forEach((cleanup) => cleanup());
    this.roomEventCleanups = [];
    if (this.room === room) {
      this.room = null;
      this.access = null;
      this.activeLifecycleRequest = 0;
    }
    this.snapshot.remoteAudioTracks.forEach(({ track }) => track.detach());
    this.snapshot.videoTracks.forEach(({ track }) => track.detach());
    await room.disconnect(false).catch(() => undefined);
  }

  private patchSnapshot(patch: Partial<PlaceLiveKitSnapshot>) {
    this.replaceSnapshot({ ...this.snapshot, ...patch });
  }

  private replaceSnapshot(snapshot: PlaceLiveKitSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
