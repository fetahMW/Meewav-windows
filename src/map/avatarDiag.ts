export type AvatarDiagStage =
  | "none"
  | "icons-450-shared"
  | "icons-450-diverse"
  | "icons-450-diverse-names"
  | "icons-450-diverse-hover"
  | "icons-450-real-images"
  | "icons-450-current-user"
  | "icons-450-names"
  | "icons-450-hit-hover"
  | "icons-450-prepopup"
  | "icons-2000-shared"
  | "icons-2000-real-images"
  | "full";

const AVATAR_DIAG_STAGES = new Set<AvatarDiagStage>([
  "none",
  "icons-450-shared",
  "icons-450-diverse",
  "icons-450-diverse-names",
  "icons-450-diverse-hover",
  "icons-450-real-images",
  "icons-450-current-user",
  "icons-450-names",
  "icons-450-hit-hover",
  "icons-450-prepopup",
  "icons-2000-shared",
  "icons-2000-real-images",
  "full",
]);

export type AvatarDiagCapabilities = {
  stage: AvatarDiagStage;
  enabled: boolean;
  forceMvt: boolean;
  featureLimit: 450 | 2000 | null;
  sharedIcon: boolean;
  realImages: boolean;
  currentUser: boolean;
  names: boolean;
  hitLayer: boolean;
  hover: boolean;
  prepopup: boolean;
  pinnedProfileSource: boolean;
};

export function getAvatarDiagStage(search = typeof window !== "undefined" ? window.location.search : ""): AvatarDiagStage {
  const value = new URLSearchParams(search).get("avatarDiag");
  return AVATAR_DIAG_STAGES.has(value as AvatarDiagStage) ? value as AvatarDiagStage : "full";
}

export function getAvatarDiagCapabilities(search = typeof window !== "undefined" ? window.location.search : ""): AvatarDiagCapabilities {
  const stage = getAvatarDiagStage(search);
  const explicitDiag = new URLSearchParams(search).has("avatarDiag");
  const enabled = explicitDiag && stage !== "full";
  const is450 = stage.startsWith("icons-450");
  const is2000 = stage.startsWith("icons-2000");
  const realImages = stage !== "none" && !stage.endsWith("-shared");
  const currentUser = [
    "icons-450-current-user",
    "icons-450-names",
    "icons-450-hit-hover",
    "icons-450-prepopup",
  ].includes(stage);
  const names = [
    "icons-450-diverse-names",
    "icons-450-diverse-hover",
    "icons-450-names",
    "icons-450-hit-hover",
    "icons-450-prepopup",
  ].includes(stage);
  const hitLayer = stage === "icons-450-diverse-hover" || stage === "icons-450-hit-hover" || stage === "icons-450-prepopup";
  const prepopup = stage === "icons-450-prepopup";

  return {
    stage,
    enabled,
    forceMvt: enabled && stage !== "none",
    featureLimit: is450 ? 450 : is2000 ? 2000 : null,
    sharedIcon: enabled && stage.endsWith("-shared"),
    realImages,
    currentUser,
    names,
    hitLayer,
    hover: hitLayer,
    prepopup,
    pinnedProfileSource: !enabled,
  };
}

export function areAvatarsDisabledByDiag(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search);
  return getAvatarDiagStage(search) === "none" || params.get("disableAvatars") === "1";
}
