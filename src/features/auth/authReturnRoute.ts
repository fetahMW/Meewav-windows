import { MON_GLOBE_ROUTE } from "../globe/monGlobeContract";

type AuthNavigationState = {
  returnTo?: unknown;
} | null | undefined;

export function getSafeAuthReturnRoute(
  state: AuthNavigationState,
  fallback = MON_GLOBE_ROUTE,
) {
  const candidate = typeof state?.returnTo === "string" ? state.returnTo.trim() : "";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (candidate === "/auth" || candidate.startsWith("/auth?")) return fallback;
  return candidate;
}
