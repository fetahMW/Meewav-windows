import { AudioPresets, Room, Track } from "../../lib/byteplusRtc";
import {
  PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
  PLACE_LIVEKIT_VOICE_TRACK_NAME,
  requestPlaceLiveKitAccess,
  type PlaceLiveKitAccess,
} from "../rooms/place/placeLiveKit.service";
import { readRoomDevicePreferences } from "../rooms/place/roomDevicePreferences";

const ROOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StudioMediaPhase = "idle" | "preparing" | "private" | "connecting" | "live" | "error";
export type StudioMediaSnapshot = {
  phase: StudioMediaPhase;
  stream: MediaStream | null;
  roomId: string | null;
  error: string | null;
};

type Dependencies = {
  capture: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  access: (roomId: string) => Promise<PlaceLiveKitAccess>;
  room: () => Room;
};

const defaults: Dependencies = {
  capture: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  access: requestPlaceLiveKitAccess,
  room: () => new Room({
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    stopLocalTrackOnUnpublish: false,
  }),
};

/** Owns capture and transport outside React. Capture is local until publish() is called. */
export class StudioMediaEngine {
  private readonly dependencies: Dependencies;
  private readonly listeners = new Set<() => void>();
  private snapshot: StudioMediaSnapshot = { phase: "idle", stream: null, roomId: null, error: null };
  private transport: Room | null = null;
  private generation = 0;

  constructor(dependencies: Partial<Dependencies> = {}) {
    this.dependencies = { ...defaults, ...dependencies };
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<StudioMediaSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async prepare() {
    await this.stop();
    const generation = ++this.generation;
    this.update({ phase: "preparing", error: null });
    const devices = readRoomDevicePreferences();
    try {
      const stream = await this.dependencies.capture({
        video: devices.cameraId ? { deviceId: { ideal: devices.cameraId } } : true,
        audio: devices.microphoneId ? { deviceId: { ideal: devices.microphoneId } } : true,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (stream.getVideoTracks().length !== 1 || stream.getAudioTracks().length !== 1) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("La caméra et le microphone sont tous deux nécessaires.");
      }
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (this.snapshot.stream === stream) void this.stop();
        }, { once: true });
      });
      this.update({ phase: "private", stream, roomId: null, error: null });
    } catch (error) {
      if (generation === this.generation) {
        this.update({ phase: "error", error: error instanceof Error ? error.message : "Capture indisponible." });
      }
    }
  }

  async publish(roomId: string) {
    if (this.snapshot.phase !== "private" || !this.snapshot.stream) {
      throw new Error("Prépare d’abord la caméra et le microphone en privé.");
    }
    if (!ROOM_ID.test(roomId)) throw new Error("Identifiant de Room QA invalide.");
    const stream = this.snapshot.stream;
    const [video] = stream.getVideoTracks();
    const [audio] = stream.getAudioTracks();
    if (video?.readyState !== "live" || audio?.readyState !== "live") {
      throw new Error("Une source locale a été déconnectée. Relance l’aperçu.");
    }
    const generation = ++this.generation;
    this.update({ phase: "connecting", error: null });
    let room: Room | null = null;
    try {
      const access = await this.dependencies.access(roomId);
      if (generation !== this.generation) return;
      if (access.role !== "host" || !access.canPublish) {
        throw new Error("Ce compte n’a pas le droit de publier dans cette Room.");
      }
      room = this.dependencies.room();
      this.transport = room;
      await room.connect(access.appId, access.token, { access, refreshAccess: () => this.dependencies.access(roomId) });
      if (generation !== this.generation) return;
      await room.localParticipant.publishTrack(video, {
        source: Track.Source.Camera,
        name: "meewav.camera",
        stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
      });
      if (generation !== this.generation) return;
      await room.localParticipant.publishTrack(audio, {
        source: Track.Source.Microphone,
        name: PLACE_LIVEKIT_VOICE_TRACK_NAME,
        stream: PLACE_LIVEKIT_PROGRAM_STREAM_NAME,
        audioPreset: AudioPresets.musicHighQuality,
        dtx: false,
        red: true,
      });
      if (generation !== this.generation) return;
      room.on("disconnected", () => {
        if (generation === this.generation) void this.stop();
      });
      this.update({ phase: "live", roomId, error: null });
    } catch (error) {
      if (generation === this.generation) {
        await this.stop();
        this.update({ phase: "error", error: error instanceof Error ? error.message : "Publication impossible." });
      }
      throw error;
    } finally {
      if (generation !== this.generation && room && room !== this.transport) {
        await room.disconnect().catch(() => undefined);
      }
    }
  }

  async stop() {
    ++this.generation;
    const room = this.transport;
    const stream = this.snapshot.stream;
    this.transport = null;
    this.update({ phase: "idle", stream: null, roomId: null, error: null });
    // Leaving the RTC room can wait on the network. Release capture immediately
    // so navigation cannot leave this studio's microphone publishing behind it.
    stream?.getTracks().forEach((track) => track.stop());
    if (room) await room.disconnect().catch(() => undefined);
  }
}
