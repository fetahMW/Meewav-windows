export type BrowserNavigationType = "navigate" | "reload" | "back_forward" | "prerender";

export function getCurrentBrowserNavigationType(): BrowserNavigationType | null {
  if (typeof window === "undefined" || typeof window.performance === "undefined") return null;

  const [navigationEntry] = window.performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  return navigationEntry?.type ?? null;
}

export function shouldReturnToAuthenticationOnGlobeLoad(
  navigationType: BrowserNavigationType | null,
) {
  return navigationType === "reload";
}
