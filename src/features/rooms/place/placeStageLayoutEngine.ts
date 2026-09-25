import type { PlaceParticipant, PlaceParticipantVideoSourceDto } from "./place.types";

export type PlaceStageMode = "auto" | "stage" | "grid" | "solo";
export type PlaceStageComposition = "ensemble" | "focus" | "solo";
export type PlaceStageDisplaySize = "normal" | "expanded" | "fullscreen";
export type PlaceStageAspectRatio = "16:9" | "9:16" | "4:3";
export type PlaceStageFilmstripPosition = "right" | "bottom";
export type PlaceStageTransition = "cut" | "dissolve";
export type PlaceAutoDirectorProfile = "calm" | "dynamic" | "manual";
export type PlaceStagePreset = "performance" | "discussion" | "collaboration";
export type PlaceVideoTransport = "rtc" | "hls" | "file" | "image" | "screen";
export const PLACE_STAGE_MAX_SMART_ZOOM = 1.18;

export type SafeVideoRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export type ParticipantDirectorSignals = {
  role?: "host" | "performer" | "guest" | "musician" | "producer" | "speaker";
  audioActivity?: number;
  sustainedAudioActivity?: number;
  manualPriority?: number;
  interactionContext?: number;
  shotStability?: number;
  isScreenSharing?: boolean;
  connectionQuality?: number;
};

export type PlaceParticipantVideoSource = {
  id: string;
  type: "front_camera" | "rear_camera" | "screen" | "desktop_composite" | "portrait_composite";
  aspectRatio: PlaceStageAspectRatio;
  transport: PlaceVideoTransport;
  /** Stable SFU publication identifier. Null is reserved for the explicit local demo fallback. */
  publicationSid: string | null;
  /** Inactive publications are never returned to either the director or a viewer. */
  active: boolean;
  /** The host may use this publication in the official Program composition. */
  programEligible: boolean;
  /** A viewer is allowed to receive and select this publication locally. */
  viewerSelectable: boolean;
  authorization: "publication" | "legacy-demo";
  preferredForDesktop?: boolean;
  videoUrl?: string;
  imageUrl?: string;
  safeRegion?: SafeVideoRegion;
};

/**
 * Input boundary kept compatible with the existing local fixtures. A source is
 * normalized to the strict contract above before it can leave the layout
 * engine. Missing authorization fields are accepted only for same-origin
 * `/media` or `/images` file/image demo assets; RTC, screen, HLS and arbitrary
 * remote URLs fail closed.
 */
export type PlaceParticipantVideoSourceInput = PlaceParticipantVideoSourceDto;

export type PlaceVideoSourceAudience = "program" | "viewer";

export type PlaceStageParticipant = PlaceParticipant & {
  /** Optional media-plane signals. The fallback only uses declared role/activity already present in the DTO. */
  directorSignals?: ParticipantDirectorSignals;
};

export type PlaceProgramLayoutState = {
  mode: PlaceStageMode;
  primaryParticipantId: string;
  lockedParticipantId?: string;
  participantOrder: string[];
  selectedSourceByParticipant: Record<string, string>;
  transition?: PlaceStageTransition;
  preset?: PlaceStagePreset;
  autoDirectorProfile?: PlaceAutoDirectorProfile;
  safeFramingByParticipant?: Record<string, {
    enabled: boolean;
    locked: boolean;
    maxZoom: number;
    sourceId?: string;
    safeRegion?: SafeVideoRegion;
  }>;
  updatedBy: string;
  updatedAt: number;
};

export type PlaceViewerLayoutState = {
  followingProgram: boolean;
  focusedParticipantId?: string;
  soloParticipantId?: string;
  fullscreenParticipantId?: string;
  gridEnabled: boolean;
  selectedSourceByParticipant: Record<string, string>;
  filmstripPosition: PlaceStageFilmstripPosition | "auto";
  pipCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

/**
 * Event contract for the future ISO/replay compositor. Personal viewer focus
 * is intentionally excluded: only official Program decisions belong here.
 */
export type PlaceProgramLayoutEvent = {
  timestampMs: number;
  action: "primary_changed" | "layout_changed" | "source_changed" | "participant_joined" | "participant_left";
  participantId?: string;
  layoutMode?: PlaceStageMode;
  sourceId?: string;
};

export type PlaceStageLayoutRecipe =
  | "solo"
  | "stage-pip"
  | "stage-plus-two"
  | "stage-plus-three"
  | "grid-two"
  | "grid-three"
  | "grid-2x2"
  | "mixed-grid"
  | "vertical-gallery";

export type PlaceStageLayoutScore = {
  primaryArea: number;
  visibleArea: number;
  ratioFidelity: number;
  waste: number;
  crop: number;
  overlap: number;
  total: number;
};

const SOURCE_PRIORITY: Record<PlaceParticipantVideoSource["type"], number> = {
  desktop_composite: 0,
  screen: 1,
  front_camera: 2,
  rear_camera: 3,
  portrait_composite: 4,
};

export function isValidSafeVideoRegion(region: SafeVideoRegion | undefined): region is SafeVideoRegion {
  if (!region) return false;
  const values = [region.x, region.y, region.width, region.height, region.confidence];
  if (!values.every(Number.isFinite)) return false;
  return region.x >= 0
    && region.y >= 0
    && region.width > 0
    && region.height > 0
    && region.x <= 1
    && region.y <= 1
    && region.width <= 1
    && region.height <= 1
    && region.x + region.width <= 1
    && region.y + region.height <= 1
    && region.confidence >= 0
    && region.confidence <= 1;
}

export function inferParticipantAspectRatio(participant: PlaceStageParticipant): PlaceStageAspectRatio {
  const source = resolveParticipantSource(participant);
  if (source) return source.aspectRatio;
  const value = `${participant.videoUrl ?? ""} ${participant.imageUrl ?? ""}`.toLocaleLowerCase();
  return /(portrait|vertical|9x16|9-16)/.test(value) ? "9:16" : "16:9";
}

export function classifyStageAspectRatio(width: number, height: number): PlaceStageAspectRatio | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  if (height > width * 1.18) return "9:16";
  return Math.abs(width / height - 4 / 3) < 0.12 ? "4:3" : "16:9";
}

export function stageModeToComposition(mode: PlaceStageMode): PlaceStageComposition {
  if (mode === "solo") return "solo";
  if (mode === "stage") return "focus";
  return "ensemble";
}

export function compositionToStageMode(composition: PlaceStageComposition): PlaceStageMode {
  if (composition === "solo") return "solo";
  if (composition === "focus") return "stage";
  return "grid";
}

export function resolveStageDisplaySize({
  panelCollapsed,
  fullscreen,
}: {
  panelCollapsed: boolean;
  fullscreen: boolean;
}): PlaceStageDisplaySize {
  if (fullscreen) return "fullscreen";
  return panelCollapsed ? "expanded" : "normal";
}

function isValidPublicationSid(value: string | undefined): value is string {
  return Boolean(value && value.length <= 256 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value));
}

function isLegacyDemoAssetUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value, "https://legacy-demo.invalid");
    const decodedPath = decodeURIComponent(url.pathname);
    return url.origin === "https://legacy-demo.invalid"
      && /^\/(?:media|images)\//.test(decodedPath)
      && !decodedPath.split("/").includes("..");
  } catch {
    return false;
  }
}

function normalizeParticipantSource(
  source: PlaceParticipantVideoSourceInput,
): PlaceParticipantVideoSource | undefined {
  const transport = source.type === "screen"
    ? "screen"
    : source.transport ?? inferVideoTransport(source.videoUrl, source.imageUrl);
  const hasAnyAuthorizationField = source.publicationSid !== undefined
    || source.active !== undefined
    || source.programEligible !== undefined
    || source.viewerSelectable !== undefined;
  const publicationSid = source.publicationSid;
  const active = source.active;
  const programEligible = source.programEligible;
  const viewerSelectable = source.viewerSelectable;
  if (isValidPublicationSid(publicationSid)
    && typeof active === "boolean"
    && typeof programEligible === "boolean"
    && typeof viewerSelectable === "boolean") {
    return {
      ...source,
      transport,
      publicationSid,
      active,
      programEligible,
      viewerSelectable,
      authorization: "publication",
    };
  }

  // A partial security contract is never upgraded to a permissive legacy source.
  if (hasAnyAuthorizationField || (transport !== "file" && transport !== "image")) return undefined;
  if (!source.videoUrl && !source.imageUrl) return undefined;
  if (!isLegacyDemoAssetUrl(source.videoUrl) || !isLegacyDemoAssetUrl(source.imageUrl)) return undefined;

  return {
    ...source,
    transport,
    publicationSid: null,
    active: true,
    programEligible: true,
    viewerSelectable: true,
    authorization: "legacy-demo",
  };
}

export function resolveParticipantSources(
  participant: PlaceStageParticipant,
  audience: PlaceVideoSourceAudience = "viewer",
): PlaceParticipantVideoSource[] {
  if (participant.videoSources?.length) {
    return participant.videoSources
      .map(normalizeParticipantSource)
      .filter((source): source is PlaceParticipantVideoSource => Boolean(source))
      .filter((source) => source.active && (
        audience === "program" ? source.programEligible : source.viewerSelectable
      ))
      .sort((left, right) => {
        if (left.preferredForDesktop !== right.preferredForDesktop) return left.preferredForDesktop ? -1 : 1;
        return SOURCE_PRIORITY[left.type] - SOURCE_PRIORITY[right.type];
      });
  }

  const transport = inferVideoTransport(participant.videoUrl, participant.imageUrl);
  if ((transport !== "file" && transport !== "image") || (!participant.videoUrl && !participant.imageUrl)) {
    return [];
  }
  if (!isLegacyDemoAssetUrl(participant.videoUrl) || !isLegacyDemoAssetUrl(participant.imageUrl)) {
    return [];
  }

  return [{
    id: `${participant.id}-primary`,
    type: inferLegacySourceType(participant),
    aspectRatio: /(portrait|vertical|9x16|9-16)/.test(participant.videoUrl?.toLocaleLowerCase() ?? "") ? "9:16" : "16:9",
    transport,
    publicationSid: null,
    active: true,
    programEligible: true,
    viewerSelectable: true,
    authorization: "legacy-demo",
    preferredForDesktop: true,
    videoUrl: participant.videoUrl,
    imageUrl: participant.imageUrl,
  }];
}

function inferVideoTransport(videoUrl?: string, imageUrl?: string): PlaceVideoTransport {
  if (videoUrl?.toLocaleLowerCase().includes(".m3u8")) return "hls";
  if (videoUrl) return "file";
  if (imageUrl) return "image";
  return "image";
}

function inferLegacySourceType(participant: PlaceStageParticipant): PlaceParticipantVideoSource["type"] {
  return /(portrait|vertical)/.test(participant.videoUrl?.toLocaleLowerCase() ?? "") ? "front_camera" : "desktop_composite";
}

export function resolveParticipantSource(
  participant: PlaceStageParticipant,
  selectedSourceId?: string,
  audience: PlaceVideoSourceAudience = "viewer",
): PlaceParticipantVideoSource | undefined {
  const sources = resolveParticipantSources(participant, audience);
  return sources.find((source) => source.id === selectedSourceId) ?? sources[0];
}

export function createInitialProgramLayout(
  participants: PlaceStageParticipant[],
  hostId: string,
): PlaceProgramLayoutState {
  const primaryParticipantId = participants.find((participant) => participant.profile.id === hostId || participant.status === "host")?.id
    ?? participants[0]?.id
    ?? "";
  return {
    mode: "solo",
    primaryParticipantId,
    participantOrder: participants.map((participant) => participant.id),
    selectedSourceByParticipant: {},
    transition: "dissolve",
    preset: "performance",
    autoDirectorProfile: "manual",
    updatedBy: hostId,
    updatedAt: Date.now(),
  };
}

export function createInitialViewerLayout(): PlaceViewerLayoutState {
  return {
    followingProgram: true,
    gridEnabled: false,
    selectedSourceByParticipant: {},
    filmstripPosition: "auto",
    pipCorner: "bottom-right",
  };
}

export function resolvePrimaryParticipantId({
  viewer,
  program,
  participants,
  hostId,
}: {
  viewer: PlaceViewerLayoutState;
  program: PlaceProgramLayoutState;
  participants: PlaceStageParticipant[];
  hostId: string;
}): string {
  const available = new Set(participants.map((participant) => participant.id));
  const candidates = [
    viewer.fullscreenParticipantId,
    viewer.soloParticipantId,
    viewer.focusedParticipantId,
    program.lockedParticipantId,
    program.primaryParticipantId,
    participants.find((participant) => participant.profile.id === hostId || participant.status === "host")?.id,
    participants[0]?.id,
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && available.has(candidate))) ?? "";
}

export function resolveLayoutRecipe({
  participantCount,
  mode,
  viewer,
  allVertical,
  participantAspectRatios,
}: {
  participantCount: number;
  mode: PlaceStageMode;
  viewer: PlaceViewerLayoutState;
  allVertical: boolean;
  participantAspectRatios?: PlaceStageAspectRatio[];
}): PlaceStageLayoutRecipe {
  const programMode: PlaceStageMode = mode === "auto" ? "grid" : mode;
  const effectiveMode: PlaceStageMode = viewer.followingProgram ? programMode : viewer.gridEnabled ? "grid" : "stage";
  if (participantCount <= 1 || viewer.soloParticipantId || effectiveMode === "solo") return "solo";
  const grid = effectiveMode === "grid";
  if (grid) {
    const baseline = participantCount >= 4
      ? "grid-2x2"
      : participantCount === 3
        ? "grid-three"
        : "grid-two";
    const ratios = participantAspectRatios?.slice(0, participantCount);
    const hasCompleteRatioSet = Boolean(ratios && ratios.length === participantCount);
    const verticalOnly = ratios && ratios.length === participantCount
      ? ratios.every((ratio) => ratio === "9:16")
      : allVertical;
    if (verticalOnly && participantCount >= 2) return "vertical-gallery";
    if (!hasCompleteRatioSet || !ratios) return baseline;

    const hasVertical = ratios.some((ratio) => ratio === "9:16");
    const hasWide = ratios.some((ratio) => ratio !== "9:16");
    if (!hasVertical || !hasWide) return baseline;
    return "mixed-grid";
  }
  if (participantCount === 2) return "stage-pip";
  if (participantCount === 3) return "stage-plus-two";
  return "stage-plus-three";
}

export function resolveFilmstripPosition({
  preference,
  stageWidth,
  stageHeight = stageWidth * 0.5625,
  primaryAspectRatio,
  participantAspectRatios = [primaryAspectRatio],
}: {
  preference: PlaceViewerLayoutState["filmstripPosition"];
  stageWidth: number;
  stageHeight?: number;
  primaryAspectRatio: PlaceStageAspectRatio;
  participantAspectRatios?: PlaceStageAspectRatio[];
}): PlaceStageFilmstripPosition {
  if (preference !== "auto") return preference;
  const right = scoreStageOrientation({
    orientation: "right",
    stageWidth,
    stageHeight,
    aspectRatios: participantAspectRatios,
  });
  const bottom = scoreStageOrientation({
    orientation: "bottom",
    stageWidth,
    stageHeight,
    aspectRatios: participantAspectRatios,
  });
  return right.total >= bottom.total ? "right" : "bottom";
}

function ratioValue(ratio: PlaceStageAspectRatio): number {
  if (ratio === "9:16") return 9 / 16;
  if (ratio === "4:3") return 4 / 3;
  return 16 / 9;
}

function containUtilization(frameWidth: number, frameHeight: number, ratio: PlaceStageAspectRatio): number {
  if (frameWidth <= 0 || frameHeight <= 0) return 0;
  const frameRatio = frameWidth / frameHeight;
  const mediaRatio = ratioValue(ratio);
  return frameRatio > mediaRatio ? mediaRatio / frameRatio : frameRatio / mediaRatio;
}

type NormalizedLayoutFrame = {
  width: number;
  height: number;
};

const GRID_STAGE_WIDTH = 16 / 9;
const GRID_STAGE_HEIGHT = 1;

function baselineGridFrames(
  recipe: Extract<PlaceStageLayoutRecipe, "grid-two" | "grid-three" | "grid-2x2">,
  count: number,
): NormalizedLayoutFrame[] {
  if (recipe === "grid-two") {
    return Array.from({ length: count }, () => ({
      width: GRID_STAGE_WIDTH / 2,
      height: GRID_STAGE_HEIGHT,
    }));
  }
  if (recipe === "grid-three") {
    const primaryWidth = GRID_STAGE_WIDTH * (1.35 / 2.35);
    const secondaryWidth = GRID_STAGE_WIDTH - primaryWidth;
    return Array.from({ length: count }, (_, index) => index === 0
      ? { width: primaryWidth, height: GRID_STAGE_HEIGHT }
      : { width: secondaryWidth, height: GRID_STAGE_HEIGHT / 2 });
  }
  return Array.from({ length: count }, () => ({
    width: GRID_STAGE_WIDTH / 2,
    height: GRID_STAGE_HEIGHT / 2,
  }));
}

/**
 * A mixed grid gives wide and portrait sources independent columns. Each
 * column is split vertically by the number of sources it owns. Column widths
 * are derived from the native ratios, so every source receives the same scale
 * pressure instead of forcing portrait media into landscape-shaped cells.
 */
function mixedGridFrames(ratios: PlaceStageAspectRatio[]): NormalizedLayoutFrame[] {
  const verticalCount = ratios.filter((ratio) => ratio === "9:16").length;
  const wideRatios = ratios.filter((ratio) => ratio !== "9:16");
  const wideCount = wideRatios.length;
  if (!verticalCount || !wideCount) return [];

  const averageWideRatio = wideRatios.reduce((sum, ratio) => sum + ratioValue(ratio), 0) / wideCount;
  const desiredWideWidth = averageWideRatio / wideCount;
  const desiredVerticalWidth = ratioValue("9:16") / verticalCount;
  const desiredTotal = desiredWideWidth + desiredVerticalWidth;
  const wideWidth = GRID_STAGE_WIDTH * desiredWideWidth / desiredTotal;
  const verticalWidth = GRID_STAGE_WIDTH - wideWidth;

  return ratios.map((ratio) => ratio === "9:16"
    ? { width: verticalWidth, height: GRID_STAGE_HEIGHT / verticalCount }
    : { width: wideWidth, height: GRID_STAGE_HEIGHT / wideCount });
}

/**
 * Scores candidate grids using media area after `contain`, ratio fidelity and
 * wasted frame area. Crop and overlap remain hard zero by design.
 */
export function scoreGridLayoutCandidate(
  recipe: Extract<PlaceStageLayoutRecipe, "grid-two" | "grid-three" | "grid-2x2" | "mixed-grid">,
  ratios: PlaceStageAspectRatio[],
): PlaceStageLayoutScore {
  if (!ratios.length) {
    return { primaryArea: 0, visibleArea: 0, ratioFidelity: 0, waste: 1, crop: 0, overlap: 0, total: 0 };
  }
  const frames = recipe === "mixed-grid"
    ? mixedGridFrames(ratios)
    : baselineGridFrames(recipe, ratios.length);
  if (frames.length !== ratios.length) {
    return { primaryArea: 0, visibleArea: 0, ratioFidelity: 0, waste: 1, crop: 0, overlap: 0, total: 0 };
  }

  const stageArea = GRID_STAGE_WIDTH * GRID_STAGE_HEIGHT;
  const fits = frames.map((frame, index) => containUtilization(frame.width, frame.height, ratios[index]));
  const mediaAreas = frames.map((frame, index) => frame.width * frame.height * fits[index] / stageArea);
  const visibleArea = Math.min(1, mediaAreas.reduce((sum, area) => sum + area, 0));
  const averageFidelity = fits.reduce((sum, fit) => sum + fit, 0) / fits.length;
  const minimumFidelity = Math.min(...fits);
  const ratioFidelity = averageFidelity * 0.62 + minimumFidelity * 0.38;
  const primaryArea = mediaAreas[0] ?? 0;
  const waste = Math.max(0, 1 - visibleArea);
  const crop = 0;
  const overlap = 0;
  const total = primaryArea * 0.12
    + visibleArea * 0.48
    + ratioFidelity * 0.4
    - waste * 0.15;
  return { primaryArea, visibleArea, ratioFidelity, waste, crop, overlap, total };
}

function clampSignal(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value ?? fallback));
}

function inferDirectorRole(participant: PlaceStageParticipant): NonNullable<ParticipantDirectorSignals["role"]> {
  if (participant.status === "host") return "host";
  const role = participant.profile.role.toLocaleLowerCase();
  if (/(chante|perform|danse|rappe|artiste)/.test(role)) return "performer";
  if (/(guitar|piano|saxo|batter|drum|musicien|instrument)/.test(role)) return "musician";
  if (/(prod|beatmaker|dj|réalis|ingenieur|ingénieur)/.test(role)) return "producer";
  if (/(coach|présent|animate|interview)/.test(role)) return "speaker";
  return "guest";
}

/**
 * Stable musical direction score. It is deliberately fed only by explicit
 * media-plane/role signals and never pretends to run vocal or instrument AI.
 */
export function scoreParticipantForDirection({
  participant,
  currentParticipantId,
}: {
  participant: PlaceStageParticipant;
  currentParticipantId?: string;
}): number {
  const signals = participant.directorSignals ?? {};
  const role = signals.role ?? inferDirectorRole(participant);
  const roleWeight: Record<NonNullable<ParticipantDirectorSignals["role"]>, number> = {
    host: 0.14,
    performer: 0.34,
    guest: 0.08,
    musician: 0.31,
    producer: 0.22,
    speaker: 0.24,
  };
  const audioActivity = clampSignal(signals.audioActivity, participant.isSpeaking ? 0.72 : 0);
  const sustainedActivity = clampSignal(signals.sustainedAudioActivity, participant.isSpeaking ? 0.58 : 0);
  const manualPriority = clampSignal(signals.manualPriority);
  const interactionContext = clampSignal(signals.interactionContext);
  const shotStability = clampSignal(signals.shotStability, participant.id === currentParticipantId ? 0.72 : 0.18);
  const connectionQuality = clampSignal(
    signals.connectionQuality,
    participant.latencyMs <= 0 ? 0.72 : Math.max(0, 1 - participant.latencyMs / 500),
  );
  const screenShare = signals.isScreenSharing ? 0.72 : 0;
  const cameraPenalty = participant.isCameraEnabled || signals.isScreenSharing ? 0 : 0.38;

  return manualPriority * 1.8
    + roleWeight[role]
    + audioActivity * 0.38
    + sustainedActivity * 0.54
    + interactionContext * 0.22
    + shotStability * 0.18
    + connectionQuality * 0.08
    + screenShare
    - cameraPenalty;
}

export function hasMeaningfulDirectorActivity(participant: PlaceStageParticipant): boolean {
  const signals = participant.directorSignals;
  return participant.isSpeaking
    || Boolean(signals?.isScreenSharing)
    || clampSignal(signals?.audioActivity) >= 0.2
    || clampSignal(signals?.sustainedAudioActivity) >= 0.16
    || clampSignal(signals?.manualPriority) > 0;
}

/**
 * Scores right/bottom filmstrips without crop. Crop and overlap remain hard zero
 * until a real safe-framing service explicitly opts in.
 */
export function scoreStageOrientation({
  orientation,
  stageWidth,
  stageHeight,
  aspectRatios,
}: {
  orientation: PlaceStageFilmstripPosition;
  stageWidth: number;
  stageHeight: number;
  aspectRatios: PlaceStageAspectRatio[];
}): PlaceStageLayoutScore {
  const count = Math.max(1, Math.min(4, aspectRatios.length));
  const secondaryCount = Math.max(0, count - 1);
  const gap = 10;
  const railFraction = orientation === "right" ? 0.28 : 0.25;
  const primaryWidth = orientation === "right" && secondaryCount ? stageWidth * (1 - railFraction) - gap : stageWidth;
  const primaryHeight = orientation === "bottom" && secondaryCount ? stageHeight * (1 - railFraction) - gap : stageHeight;
  const railWidth = orientation === "right" ? stageWidth - primaryWidth - gap : stageWidth;
  const railHeight = orientation === "bottom" ? stageHeight - primaryHeight - gap : stageHeight;
  const secondaryWidth = orientation === "bottom" && secondaryCount ? (railWidth - gap * (secondaryCount - 1)) / secondaryCount : railWidth;
  const secondaryHeight = orientation === "right" && secondaryCount ? (railHeight - gap * (secondaryCount - 1)) / secondaryCount : railHeight;
  const stageArea = Math.max(1, stageWidth * stageHeight);
  const primaryArea = (primaryWidth * primaryHeight) / stageArea;
  const primaryFit = containUtilization(primaryWidth, primaryHeight, aspectRatios[0] ?? "16:9");
  const secondaryFits = aspectRatios.slice(1, count).map((ratio) => containUtilization(secondaryWidth, secondaryHeight, ratio));
  const ratioFidelity = (primaryFit * 1.5 + secondaryFits.reduce((sum, value) => sum + value, 0)) / Math.max(1.5 + secondaryFits.length, 1);
  const visibleArea = Math.min(1, primaryArea + secondaryCount * secondaryWidth * secondaryHeight / stageArea);
  const waste = Math.max(0, 1 - ratioFidelity);
  const crop = 0;
  const overlap = 0;
  const total = primaryArea * 0.48 + visibleArea * 0.2 + ratioFidelity * 0.32 - waste * 0.12 - crop * 0.8 - overlap;
  return { primaryArea, visibleArea, ratioFidelity, waste, crop, overlap, total };
}

export function orderParticipants(
  participants: PlaceStageParticipant[],
  primaryParticipantId: string,
  programOrder: string[],
): PlaceStageParticipant[] {
  const order = new Map(programOrder.map((id, index) => [id, index]));
  return [...participants].sort((left, right) => {
    if (left.id === primaryParticipantId) return -1;
    if (right.id === primaryParticipantId) return 1;
    return (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}
