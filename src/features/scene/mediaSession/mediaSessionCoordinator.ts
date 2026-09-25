export const MEEWAV_MEDIA_SOURCE_KINDS = [
  "scene_video",
  "scene_audio",
  "scene_tv",
  "room",
  "global_audio",
] as const;

export type MeeWavMediaSourceKind = typeof MEEWAV_MEDIA_SOURCE_KINDS[number];

export type MeeWavMediaPauseReason =
  | "superseded"
  | "user"
  | "route_change"
  | "released"
  | "system"
  | (string & {});

export type MeeWavMediaSource = Readonly<{
  kind: MeeWavMediaSourceKind;
  /** Stable identifier for the playback instance, not only the media asset. */
  id: string;
  mediaId?: string;
  label?: string;
}>;

export type MeeWavMediaPauseContext = Readonly<{
  reason: MeeWavMediaPauseReason;
  source: MeeWavMediaSource;
  nextSource?: MeeWavMediaSource;
}>;

export type MeeWavMediaPauseHandler = (
  context: MeeWavMediaPauseContext,
) => void | PromiseLike<void>;

export type MeeWavMediaClaimInput = {
  source: MeeWavMediaSourceKind;
  /** Use a unique player/transport id when the same asset can exist twice. */
  id: string;
  mediaId?: string;
  label?: string;
  pause: MeeWavMediaPauseHandler;
};

export type MeeWavMediaSessionState = "active" | "paused";

export type MeeWavMediaSessionSnapshot = Readonly<{
  revision: number;
  active: Readonly<{
    token: string;
    source: MeeWavMediaSource;
    state: MeeWavMediaSessionState;
    claimedAt: number;
  }> | null;
}>;

export type MeeWavMediaReleaseOptions = {
  /** Defaults to true. Use false after a natural `ended` event. */
  pause?: boolean;
  reason?: MeeWavMediaPauseReason;
};

export type MeeWavMediaSessionLease = Readonly<{
  token: string;
  source: MeeWavMediaSource;
  isCurrent: () => boolean;
  pause: (reason?: MeeWavMediaPauseReason) => boolean;
  release: (options?: MeeWavMediaReleaseOptions) => boolean;
}>;

type ActiveClaim = {
  token: string;
  source: MeeWavMediaSource;
  state: MeeWavMediaSessionState;
  claimedAt: number;
  pauseHandler: MeeWavMediaPauseHandler;
};

export type MeeWavMediaCoordinatorErrorContext = Readonly<{
  phase: "pause" | "listener";
  source?: MeeWavMediaSource;
  reason?: MeeWavMediaPauseReason;
}>;

export type CreateMeeWavMediaSessionCoordinatorOptions = {
  now?: () => number;
  onError?: (error: unknown, context: MeeWavMediaCoordinatorErrorContext) => void;
};

function normalizeRequiredId(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new TypeError("Un identifiant de session média est obligatoire.");
  return normalized;
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function sameSource(left: MeeWavMediaSource, right: MeeWavMediaSource) {
  return left.kind === right.kind && left.id === right.id;
}

function createSnapshot(active: ActiveClaim | null, revision: number): MeeWavMediaSessionSnapshot {
  return Object.freeze({
    revision,
    active: active
      ? Object.freeze({
        token: active.token,
        source: active.source,
        state: active.state,
        claimedAt: active.claimedAt,
      })
      : null,
  });
}

export class MeeWavMediaSessionCoordinator {
  private activeClaim: ActiveClaim | null = null;
  private revision = 0;
  private sequence = 0;
  private snapshot: MeeWavMediaSessionSnapshot = createSnapshot(null, 0);
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly onError?: CreateMeeWavMediaSessionCoordinatorOptions["onError"];

  constructor(options: CreateMeeWavMediaSessionCoordinatorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.onError = options.onError;
  }

  /**
   * Claims the single MeeWav playback slot. Claiming another source asks the
   * former owner to pause synchronously before control returns to the caller.
   */
  claim(input: MeeWavMediaClaimInput): MeeWavMediaSessionLease {
    const source = Object.freeze({
      kind: input.source,
      id: normalizeRequiredId(input.id),
      mediaId: normalizeOptionalText(input.mediaId),
      label: normalizeOptionalText(input.label),
    });
    const previous = this.activeClaim;
    const token = `${source.kind}:${source.id}:${++this.sequence}`;

    this.activeClaim = {
      token,
      source,
      state: "active",
      claimedAt: this.now(),
      pauseHandler: input.pause,
    };
    this.publishSnapshot();

    if (previous && !sameSource(previous.source, source) && previous.state === "active") {
      this.invokePause(previous, "superseded", source);
    }

    return Object.freeze({
      token,
      source,
      isCurrent: () => this.activeClaim?.token === token,
      pause: (reason = "user") => this.pauseClaim(token, reason),
      release: (options) => this.release(token, options),
    });
  }

  /** Pauses the current source while retaining its ownership for a resume. */
  pause(reason: MeeWavMediaPauseReason = "system") {
    const active = this.activeClaim;
    if (!active) return false;
    return this.pauseClaim(active.token, reason);
  }

  /** Releases only the matching lease; stale cleanup callbacks are harmless. */
  release(
    leaseOrToken: Pick<MeeWavMediaSessionLease, "token"> | string,
    options: MeeWavMediaReleaseOptions = {},
  ) {
    const token = typeof leaseOrToken === "string" ? leaseOrToken : leaseOrToken.token;
    const active = this.activeClaim;
    if (!active || active.token !== token) return false;

    this.activeClaim = null;
    this.publishSnapshot();
    if (options.pause !== false && active.state === "active") {
      this.invokePause(active, options.reason ?? "released");
    }
    return true;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private pauseClaim(token: string, reason: MeeWavMediaPauseReason) {
    const active = this.activeClaim;
    if (!active || active.token !== token || active.state === "paused") return false;

    active.state = "paused";
    this.publishSnapshot();
    this.invokePause(active, reason);
    return true;
  }

  private publishSnapshot() {
    this.revision += 1;
    this.snapshot = createSnapshot(this.activeClaim, this.revision);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        this.reportError(error, { phase: "listener" });
      }
    }
  }

  private invokePause(
    claim: ActiveClaim,
    reason: MeeWavMediaPauseReason,
    nextSource?: MeeWavMediaSource,
  ) {
    const context = Object.freeze({ reason, source: claim.source, nextSource });
    try {
      const result = claim.pauseHandler(context);
      if (result && typeof result.then === "function") {
        void Promise.resolve(result).catch((error: unknown) => {
          this.reportError(error, { phase: "pause", source: claim.source, reason });
        });
      }
    } catch (error) {
      this.reportError(error, { phase: "pause", source: claim.source, reason });
    }
  }

  private reportError(error: unknown, context: MeeWavMediaCoordinatorErrorContext) {
    try {
      this.onError?.(error, Object.freeze(context));
    } catch {
      // Diagnostics must never interrupt playback arbitration.
    }
  }
}

export function createMeeWavMediaSessionCoordinator(
  options?: CreateMeeWavMediaSessionCoordinatorOptions,
) {
  return new MeeWavMediaSessionCoordinator(options);
}

/** Shared application instance. The implementation itself remains SSR-safe. */
export const meewavMediaSession = createMeeWavMediaSessionCoordinator();
