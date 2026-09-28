export type ApplicationMode = "demo" | "live";
const MODE_KEY = "meewav:desktop:application-mode:v1";

export function getDesktopApplicationMode(): ApplicationMode | null {
  if (typeof window === "undefined" || window.meewavDesktop?.version !== 1) return null;
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (["/auth/callback", "/auth/update-password"].includes(window.location.pathname)
    && (query.has("code") || query.has("error") || fragment.has("access_token") || fragment.has("error"))) {
    window.sessionStorage.setItem(MODE_KEY, "live");
    return "live";
  }
  const value = window.sessionStorage.getItem(MODE_KEY);
  return value === "demo" || value === "live" ? value : null;
}

export function chooseDesktopApplicationMode(mode: ApplicationMode) {
  window.sessionStorage.setItem(MODE_KEY, mode);
  // A document reload also recreates repositories and clears in-memory fixtures.
  window.location.assign(mode === "demo" ? "/globe" : "/auth");
}

export function resetDesktopApplicationMode() {
  window.sessionStorage.removeItem(MODE_KEY);
  window.location.assign("/");
}
