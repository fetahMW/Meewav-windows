export type VoiceCorrectionTrackRoute = "dry" | "processed";

export type VoiceCorrectionFallbackReason =
  | "processed_missing"
  | "processed_ended"
  | "processed_replace_failed"
  | "dry_ended"
  | "dry_replace_failed";

export type VoiceCorrectionTrackRouterDiagnostics = {
  requestedRoute: VoiceCorrectionTrackRoute;
  activeRoute: VoiceCorrectionTrackRoute | null;
  dryTrackId: string;
  processedTrackId: string | null;
  dryTrackState: MediaStreamTrackState;
  processedTrackState: MediaStreamTrackState | null;
  fallbackActive: boolean;
  routeFailed: boolean;
  fallbackReason: VoiceCorrectionFallbackReason | null;
  lastError: string | null;
  replaceAttemptCount: number;
  successfulSwitchCount: number;
  switching: boolean;
  disposed: boolean;
};

type TrackSender = Pick<RTCRtpSender, "replaceTrack">;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function assertAudioTrack(track: MediaStreamTrack, label: string) {
  if (track.kind !== "audio") {
    throw new TypeError(`${label} doit être une piste audio.`);
  }
}

/**
 * Owns the one audio slot of an existing RTCRtpSender.
 *
 * The router never publishes an additional track: every transition goes
 * through the same `replaceTrack` method. Track lifetime remains owned by the
 * capture/processing layers, so disposing the router never stops either track.
 */
export class VoiceCorrectionTrackRouter {
  private readonly sender: TrackSender;
  private dryTrack: MediaStreamTrack;
  private processedTrack: MediaStreamTrack | null;
  private activeTrack: MediaStreamTrack | null = null;
  private activeRoute: VoiceCorrectionTrackRoute | null = null;
  private requestedRoute: VoiceCorrectionTrackRoute = "dry";
  private fallbackReason: VoiceCorrectionFallbackReason | null = null;
  private lastError: string | null = null;
  private replaceAttemptCount = 0;
  private successfulSwitchCount = 0;
  private switching = false;
  private disposeRequested = false;
  private disposed = false;
  private operationQueue: Promise<void> = Promise.resolve();
  private processedEndedListener: (() => void) | null = null;

  constructor(options: {
    sender: TrackSender;
    dryTrack: MediaStreamTrack;
    processedTrack?: MediaStreamTrack | null;
  }) {
    assertAudioTrack(options.dryTrack, "La piste sèche");
    if (options.processedTrack) assertAudioTrack(options.processedTrack, "La piste corrigée");
    this.sender = options.sender;
    this.dryTrack = options.dryTrack;
    this.processedTrack = options.processedTrack ?? null;
    this.bindProcessedEndedListener();
  }

  getDiagnostics(): VoiceCorrectionTrackRouterDiagnostics {
    return {
      requestedRoute: this.requestedRoute,
      activeRoute: this.activeRoute,
      dryTrackId: this.dryTrack.id,
      processedTrackId: this.processedTrack?.id ?? null,
      dryTrackState: this.dryTrack.readyState,
      processedTrackState: this.processedTrack?.readyState ?? null,
      fallbackActive: this.requestedRoute === "processed" && this.activeRoute !== "processed",
      routeFailed: this.fallbackReason === "dry_ended" || this.fallbackReason === "dry_replace_failed",
      fallbackReason: this.fallbackReason,
      lastError: this.lastError,
      replaceAttemptCount: this.replaceAttemptCount,
      successfulSwitchCount: this.successfulSwitchCount,
      switching: this.switching,
      disposed: this.disposed,
    };
  }

  /** Resolves after every transition already submitted to the router. */
  async whenIdle() {
    await this.operationQueue;
    return this.getDiagnostics();
  }

  async useDry() {
    this.assertAvailable();
    this.requestedRoute = "dry";
    return this.enqueue(async () => {
      await this.switchToDry(null);
    });
  }

  async useProcessed() {
    this.assertAvailable();
    this.requestedRoute = "processed";
    return this.enqueue(async () => {
      await this.applyRequestedRoute();
    });
  }

  async setDryTrack(track: MediaStreamTrack) {
    this.assertAvailable();
    assertAudioTrack(track, "La piste sèche");
    const previousDryTrack = this.dryTrack;
    this.dryTrack = track;
    if (this.activeTrack === previousDryTrack) {
      this.activeTrack = null;
      this.activeRoute = null;
    }
    return this.enqueue(async () => {
      if (this.requestedRoute === "dry" || this.activeRoute !== "processed") {
        await this.switchToDry(this.requestedRoute === "processed" ? this.fallbackReason : null);
      }
    });
  }

  async setProcessedTrack(track: MediaStreamTrack | null) {
    this.assertAvailable();
    if (track) assertAudioTrack(track, "La piste corrigée");
    const previousProcessedTrack = this.processedTrack;
    this.unbindProcessedEndedListener();
    this.processedTrack = track;
    this.bindProcessedEndedListener();
    if (this.activeTrack === previousProcessedTrack) {
      this.activeTrack = null;
      this.activeRoute = null;
    }
    return this.enqueue(async () => {
      if (this.requestedRoute === "processed") await this.applyRequestedRoute();
    });
  }

  /**
   * Restores the dry track before releasing listeners. This is best-effort:
   * diagnostics retain a replacement failure instead of hiding it.
   */
  async dispose() {
    if (this.disposed) return this.getDiagnostics();
    if (this.disposeRequested) return this.whenIdle();
    this.disposeRequested = true;
    const result = await this.enqueue(async () => {
      this.requestedRoute = "dry";
      await this.switchToDry(null);
      this.unbindProcessedEndedListener();
      this.disposed = true;
    });
    return result;
  }

  private assertAvailable() {
    if (this.disposeRequested || this.disposed) {
      throw new Error("Le routeur Autotune est fermé.");
    }
  }

  private enqueue(operation: () => Promise<void>) {
    const run = this.operationQueue.then(async () => {
      this.switching = true;
      try {
        await operation();
      } finally {
        this.switching = false;
      }
    });
    this.operationQueue = run.catch(() => undefined);
    return run.then(() => this.getDiagnostics());
  }

  private async applyRequestedRoute() {
    if (this.requestedRoute !== "processed") {
      await this.switchToDry(null);
      return;
    }
    const processedTrack = this.processedTrack;
    if (!processedTrack) {
      await this.switchToDry("processed_missing");
      return;
    }
    if (processedTrack.readyState === "ended") {
      await this.switchToDry("processed_ended");
      return;
    }
    if (this.activeTrack === processedTrack && this.activeRoute === "processed") {
      this.fallbackReason = null;
      this.lastError = null;
      return;
    }
    try {
      await this.replaceTrack(processedTrack, "processed");
      this.fallbackReason = null;
      this.lastError = null;
    } catch (error) {
      this.lastError = errorMessage(error);
      await this.switchToDry("processed_replace_failed");
    }
  }

  private async switchToDry(reason: VoiceCorrectionFallbackReason | null) {
    if (this.dryTrack.readyState === "ended") {
      this.fallbackReason = "dry_ended";
      this.lastError ??= "La piste sèche de secours est terminée.";
      return;
    }
    if (this.activeTrack === this.dryTrack && this.activeRoute === "dry") {
      this.fallbackReason = reason;
      if (!reason) this.lastError = null;
      return;
    }
    try {
      await this.replaceTrack(this.dryTrack, "dry");
      this.fallbackReason = reason;
      if (!reason) this.lastError = null;
    } catch (error) {
      this.fallbackReason = "dry_replace_failed";
      this.lastError = errorMessage(error);
    }
  }

  private async replaceTrack(track: MediaStreamTrack, route: VoiceCorrectionTrackRoute) {
    this.replaceAttemptCount += 1;
    await this.sender.replaceTrack(track);
    if (this.activeTrack !== track || this.activeRoute !== route) this.successfulSwitchCount += 1;
    this.activeTrack = track;
    this.activeRoute = route;
  }

  private bindProcessedEndedListener() {
    const track = this.processedTrack;
    if (!track) return;
    const listener = () => {
      if (this.disposeRequested || this.processedTrack !== track || this.requestedRoute !== "processed") return;
      void this.enqueue(async () => {
        if (this.processedTrack !== track || this.requestedRoute !== "processed") return;
        await this.switchToDry("processed_ended");
      });
    };
    this.processedEndedListener = listener;
    track.addEventListener("ended", listener, { once: true });
  }

  private unbindProcessedEndedListener() {
    if (this.processedTrack && this.processedEndedListener) {
      this.processedTrack.removeEventListener("ended", this.processedEndedListener);
    }
    this.processedEndedListener = null;
  }
}
