import { getDesktopApplicationMode } from "../../runtime/applicationMode";
const LOCAL_AUTH_PREVIEW_STORAGE_KEY = "meewav:local-auth-preview";
const LOCAL_AUTH_PREVIEW_FOLLOWS_STORAGE_KEY = "meewav:local-auth-preview:fetah:follows:v1";

export const IS_TREMPLIN_WORKSPACE_PREVIEW_MODE = import.meta.env.DEV
  && import.meta.env.MODE === "tremplin";

/**
 * Single deterministic owner used by the local, authentication-free preview.
 * Keeping this identity in one contract prevents the Auth, Globe and Profile
 * surfaces from each inventing a different demo account.
 */
export const LOCAL_PREVIEW_FETAH_HOST = Object.freeze({
  profileId: "current_user_fetah",
  displayName: "Fetah",
  username: "Fetah",
  handle: "@fetah",
  role: "Beatmaker",
  roleKey: "beatmaker",
  avatarFile: "Beatmaker.png",
  avatarIconId: "avatar_25",
  portraitUrl: "/assets/orbit/founder-puff.png",
});

export function isLocalDevHost(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return true;
  }

  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4
    || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function isLocalAuthPreviewAvailable() {
  if (getDesktopApplicationMode() === "demo") return true;
  return typeof window !== "undefined"
    && window.meewavDesktop?.version !== 1
    && (
      IS_TREMPLIN_WORKSPACE_PREVIEW_MODE
      || (import.meta.env.DEV && isLocalDevHost(window.location.hostname))
    );
}

export function enableLocalAuthPreview() {
  if (!isLocalAuthPreviewAvailable()) return false;
  window.sessionStorage.setItem(LOCAL_AUTH_PREVIEW_STORAGE_KEY, "enabled");
  return true;
}

export function isLocalAuthPreviewEnabled() {
  const mode = getDesktopApplicationMode();
  if (mode) return mode === "demo";
  if (!isLocalAuthPreviewAvailable()) return false;
  if (IS_TREMPLIN_WORKSPACE_PREVIEW_MODE) return true;
  return window.sessionStorage.getItem(LOCAL_AUTH_PREVIEW_STORAGE_KEY) === "enabled";
}

function readLocalPreviewFollows() {
  if (!isLocalAuthPreviewEnabled()) return new Set<string>();
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(LOCAL_AUTH_PREVIEW_FOLLOWS_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.map(String).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

export function getLocalPreviewFollowState(profileId: string) {
  return readLocalPreviewFollows().has(profileId);
}

export function setLocalPreviewFollowState(profileId: string, following: boolean) {
  if (!isLocalAuthPreviewEnabled()) throw new Error("local_preview_disabled");
  const follows = readLocalPreviewFollows();
  if (following) follows.add(profileId);
  else follows.delete(profileId);
  window.sessionStorage.setItem(LOCAL_AUTH_PREVIEW_FOLLOWS_STORAGE_KEY, JSON.stringify([...follows]));
  return following;
}

export function disableLocalAuthPreview() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LOCAL_AUTH_PREVIEW_STORAGE_KEY);
  window.sessionStorage.removeItem(LOCAL_AUTH_PREVIEW_FOLLOWS_STORAGE_KEY);
}
