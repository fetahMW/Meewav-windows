export function getUrlFlag(name: string): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(name) === "1";
}

export function isMeewavCleanPerfMode(): boolean {
  if (typeof window !== "undefined" && (window as any).__MEEWAV_PERF_CLEAN_MODE__ === true) {
    return true;
  }

  return (
    getUrlFlag("cleanPerf") ||
    import.meta.env.VITE_MEEWAV_CLEAN_PERF_MODE === "true"
  );
}

export function isMeewavDebugMode(): boolean {
  return Boolean(import.meta.env.DEV && getUrlFlag("debug") && !isMeewavCleanPerfMode());
}

export function perfLog(...args: unknown[]) {
  if (!isMeewavDebugMode()) return;
  console.log(...args);
}

export function perfWarn(...args: unknown[]) {
  if (!isMeewavDebugMode()) return;
  console.warn(...args);
}

export function perfTable(data: unknown) {
  if (!isMeewavDebugMode()) return;
  console.table(data);
}
