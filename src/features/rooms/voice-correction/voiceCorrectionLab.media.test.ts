import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateVoiceCorrectionRtpProgress,
  startPairedVoiceCorrectionRecording,
  type VoiceCorrectionRtpCounters,
} from "./voiceCorrectionLab.media";

const before: VoiceCorrectionRtpCounters = {
  packetsSent: 10,
  bytesSent: 800,
  packetsReceived: 9,
  bytesReceived: 720,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("calculateVoiceCorrectionRtpProgress", () => {
  it("exposes the counters before, after and their positive deltas", () => {
    const after: VoiceCorrectionRtpCounters = {
      packetsSent: 27,
      bytesSent: 2_040,
      packetsReceived: 26,
      bytesReceived: 1_960,
    };

    expect(calculateVoiceCorrectionRtpProgress(before, after)).toEqual({
      before,
      after,
      delta: {
        packetsSent: 17,
        bytesSent: 1_240,
        packetsReceived: 17,
        bytesReceived: 1_240,
      },
    });
  });

  it.each([
    ["outbound packets", { packetsSent: 10, bytesSent: 900, packetsReceived: 10, bytesReceived: 800 }],
    ["outbound bytes", { packetsSent: 11, bytesSent: 800, packetsReceived: 10, bytesReceived: 800 }],
    ["inbound packets", { packetsSent: 11, bytesSent: 900, packetsReceived: 9, bytesReceived: 800 }],
    ["inbound bytes", { packetsSent: 11, bytesSent: 900, packetsReceived: 10, bytesReceived: 720 }],
  ] satisfies Array<[string, VoiceCorrectionRtpCounters]>) (
    "rejects a proof when %s did not progress",
    (_label, after) => {
      expect(() => calculateVoiceCorrectionRtpProgress(before, after)).toThrow(/n’a pas progressé/u);
    },
  );
});

describe("startPairedVoiceCorrectionRecording", () => {
  it("starts and stops the dry and processed recorders as one paired session", async () => {
    const calls: string[] = [];
    class FakeMediaStream {
      constructor(readonly tracks: MediaStreamTrack[]) {}
      getAudioTracks() { return this.tracks; }
    }
    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(type: string) { return type === "audio/webm"; }
      readonly mimeType = "audio/webm";
      state: RecordingState = "inactive";
      private readonly trackId: string;

      constructor(stream: FakeMediaStream) {
        super();
        this.trackId = stream.getAudioTracks()[0]?.id ?? "unknown";
      }

      start() {
        this.state = "recording";
        calls.push(`start:${this.trackId}`);
      }

      stop() {
        this.state = "inactive";
        calls.push(`stop:${this.trackId}`);
        const dataEvent = new Event("dataavailable") as BlobEvent;
        Object.defineProperty(dataEvent, "data", { value: new Blob([this.trackId], { type: this.mimeType }) });
        this.dispatchEvent(dataEvent);
        this.dispatchEvent(new Event("stop"));
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    const dryTrack = { id: "dry", readyState: "live" } as MediaStreamTrack;
    const processedTrack = { id: "processed", readyState: "live" } as MediaStreamTrack;
    const stream = (track: MediaStreamTrack) => ({ getAudioTracks: () => [track] }) as MediaStream;

    const session = startPairedVoiceCorrectionRecording({
      dryStream: stream(dryTrack),
      processedStream: stream(processedTrack),
      maximumDurationMs: 5_000,
    });
    expect(calls).toEqual(["start:dry", "start:processed"]);

    const result = await session.stop();

    expect(calls).toEqual(["start:dry", "start:processed", "stop:dry", "stop:processed"]);
    expect(result.dry.type).toBe("audio/webm");
    expect(result.processed.type).toBe("audio/webm");
    expect(result.dry.size).toBeGreaterThan(0);
    expect(result.processed.size).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects a recorder error raised before stop instead of publishing a false comparison", async () => {
    const recorders: FakeFailingMediaRecorder[] = [];
    class FakeMediaStream {
      constructor(readonly tracks: MediaStreamTrack[]) {}
      getAudioTracks() { return this.tracks; }
    }
    class FakeFailingMediaRecorder extends EventTarget {
      static isTypeSupported() { return true; }
      readonly mimeType = "audio/webm";
      state: RecordingState = "inactive";

      constructor(_stream: FakeMediaStream) {
        super();
        recorders.push(this);
      }

      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.dispatchEvent(new Event("stop"));
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("MediaRecorder", FakeFailingMediaRecorder);
    const stream = (id: string) => ({
      getAudioTracks: () => [{ id, readyState: "live" } as MediaStreamTrack],
    }) as MediaStream;
    const session = startPairedVoiceCorrectionRecording({
      dryStream: stream("dry"),
      processedStream: stream("processed"),
      maximumDurationMs: 5_000,
    });
    const errorEvent = new Event("error");
    Object.defineProperty(errorEvent, "error", { value: new DOMException("encodeur arrêté") });
    recorders[0]?.dispatchEvent(errorEvent);

    await expect(session.stop()).rejects.toThrow(/encodeur arrêté/u);
  });

  it("rejects two empty recordings instead of enabling a meaningless ABX trial", async () => {
    class FakeMediaStream {
      constructor(readonly tracks: MediaStreamTrack[]) {}
      getAudioTracks() { return this.tracks; }
    }
    class EmptyMediaRecorder extends EventTarget {
      static isTypeSupported() { return true; }
      readonly mimeType = "audio/webm";
      state: RecordingState = "inactive";
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.dispatchEvent(new Event("stop"));
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("MediaRecorder", EmptyMediaRecorder);
    const stream = (id: string) => ({
      getAudioTracks: () => [{ id, readyState: "live" } as MediaStreamTrack],
    }) as MediaStream;
    const session = startPairedVoiceCorrectionRecording({
      dryStream: stream("dry"),
      processedStream: stream("processed"),
      maximumDurationMs: 5_000,
    });

    await expect(session.stop()).rejects.toThrow(/vide ou incomplète/u);
  });
});
