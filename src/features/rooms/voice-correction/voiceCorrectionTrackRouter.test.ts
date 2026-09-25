import { describe, expect, it, vi } from "vitest";
import { VoiceCorrectionTrackRouter } from "./voiceCorrectionTrackRouter";

class FakeAudioTrack extends EventTarget {
  readonly kind = "audio";
  readonly id: string;
  readyState: MediaStreamTrackState = "live";

  constructor(id: string) {
    super();
    this.id = id;
  }

  end() {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

function asTrack(track: FakeAudioTrack) {
  return track as unknown as MediaStreamTrack;
}

describe("VoiceCorrectionTrackRouter", () => {
  it("routes one sender between dry and processed without duplicate replacements", async () => {
    const dry = new FakeAudioTrack("dry");
    const processed = new FakeAudioTrack("processed");
    const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => undefined);
    const router = new VoiceCorrectionTrackRouter({
      sender: { replaceTrack },
      dryTrack: asTrack(dry),
      processedTrack: asTrack(processed),
    });

    await router.useDry();
    await router.useDry();
    await router.useProcessed();
    await router.useProcessed();

    expect(replaceTrack.mock.calls.map(([track]) => track?.id)).toEqual(["dry", "processed"]);
    expect(router.getDiagnostics()).toMatchObject({
      requestedRoute: "processed",
      activeRoute: "processed",
      fallbackActive: false,
      replaceAttemptCount: 2,
      successfulSwitchCount: 2,
    });
  });

  it("falls back to dry when no processed track exists and recovers when one arrives", async () => {
    const dry = new FakeAudioTrack("dry");
    const processed = new FakeAudioTrack("processed");
    const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => undefined);
    const router = new VoiceCorrectionTrackRouter({ sender: { replaceTrack }, dryTrack: asTrack(dry) });

    await router.useProcessed();
    expect(router.getDiagnostics()).toMatchObject({
      requestedRoute: "processed",
      activeRoute: "dry",
      fallbackActive: true,
      fallbackReason: "processed_missing",
    });

    await router.setProcessedTrack(asTrack(processed));
    expect(replaceTrack.mock.calls.map(([track]) => track?.id)).toEqual(["dry", "processed"]);
    expect(router.getDiagnostics()).toMatchObject({
      activeRoute: "processed",
      fallbackActive: false,
      fallbackReason: null,
    });
  });

  it("returns automatically to dry when the active processed track ends", async () => {
    const dry = new FakeAudioTrack("dry");
    const processed = new FakeAudioTrack("processed");
    const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => undefined);
    const router = new VoiceCorrectionTrackRouter({
      sender: { replaceTrack },
      dryTrack: asTrack(dry),
      processedTrack: asTrack(processed),
    });

    await router.useProcessed();
    processed.end();
    await router.whenIdle();

    expect(replaceTrack.mock.calls.map(([track]) => track?.id)).toEqual(["processed", "dry"]);
    expect(router.getDiagnostics()).toMatchObject({
      requestedRoute: "processed",
      activeRoute: "dry",
      fallbackActive: true,
      fallbackReason: "processed_ended",
    });
  });

  it("restores dry when replacing with the processed track fails", async () => {
    const dry = new FakeAudioTrack("dry");
    const processed = new FakeAudioTrack("processed");
    const replaceTrack = vi.fn(async (track: MediaStreamTrack | null) => {
      if (track?.id === "processed") throw new Error("codec refused");
    });
    const router = new VoiceCorrectionTrackRouter({
      sender: { replaceTrack },
      dryTrack: asTrack(dry),
      processedTrack: asTrack(processed),
    });

    await router.useProcessed();

    expect(replaceTrack.mock.calls.map(([track]) => track?.id)).toEqual(["processed", "dry"]);
    expect(router.getDiagnostics()).toMatchObject({
      activeRoute: "dry",
      fallbackActive: true,
      fallbackReason: "processed_replace_failed",
      lastError: "codec refused",
    });
  });

  it("serializes concurrent route changes", async () => {
    const dry = new FakeAudioTrack("dry");
    const processed = new FakeAudioTrack("processed");
    let concurrent = 0;
    let maxConcurrent = 0;
    const releases: Array<() => void> = [];
    const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => releases.push(resolve));
      concurrent -= 1;
    });
    const router = new VoiceCorrectionTrackRouter({
      sender: { replaceTrack },
      dryTrack: asTrack(dry),
      processedTrack: asTrack(processed),
    });

    const dryRequest = router.useDry();
    const processedRequest = router.useProcessed();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await Promise.all([dryRequest, processedRequest]);

    expect(maxConcurrent).toBe(1);
    expect(replaceTrack.mock.calls.map(([track]) => track?.id)).toEqual(["dry", "processed"]);
    expect(router.getDiagnostics().activeRoute).toBe("processed");
  });

  it("restores dry on dispose, removes the ended listener and rejects later changes", async () => {
    const dry = new FakeAudioTrack("dry");
    const processed = new FakeAudioTrack("processed");
    const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => undefined);
    const router = new VoiceCorrectionTrackRouter({
      sender: { replaceTrack },
      dryTrack: asTrack(dry),
      processedTrack: asTrack(processed),
    });

    await router.useProcessed();
    await router.dispose();
    processed.end();
    await router.whenIdle();

    expect(replaceTrack.mock.calls.map(([track]) => track?.id)).toEqual(["processed", "dry"]);
    expect(router.getDiagnostics()).toMatchObject({ activeRoute: "dry", disposed: true });
    await expect(router.useProcessed()).rejects.toThrow("fermé");
  });

  it("reports an ended dry fallback without pretending that routing succeeded", async () => {
    const dry = new FakeAudioTrack("dry");
    dry.end();
    const replaceTrack = vi.fn(async (_track: MediaStreamTrack | null) => undefined);
    const router = new VoiceCorrectionTrackRouter({ sender: { replaceTrack }, dryTrack: asTrack(dry) });

    await router.useProcessed();

    expect(replaceTrack).not.toHaveBeenCalled();
    expect(router.getDiagnostics()).toMatchObject({
      activeRoute: null,
      fallbackActive: true,
      routeFailed: true,
      fallbackReason: "dry_ended",
      lastError: "La piste sèche de secours est terminée.",
    });
  });

  it("reports a failed dry replacement while the processed track remains active", async () => {
    const dry = new FakeAudioTrack("dry");
    const processed = new FakeAudioTrack("processed");
    const replaceTrack = vi.fn(async (track: MediaStreamTrack | null) => {
      if (track?.id === "dry") throw new Error("sender closed");
    });
    const router = new VoiceCorrectionTrackRouter({
      sender: { replaceTrack },
      dryTrack: asTrack(dry),
      processedTrack: asTrack(processed),
    });

    await router.useProcessed();
    const diagnostics = await router.useDry();

    expect(diagnostics).toMatchObject({
      requestedRoute: "dry",
      activeRoute: "processed",
      fallbackActive: false,
      routeFailed: true,
      fallbackReason: "dry_replace_failed",
      lastError: "sender closed",
    });
  });
});
