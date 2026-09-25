const DEFAULT_API_PORT = 5000;
const LOOPBACK_SERVICE_URL = /^(https?:\/\/)(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i;

function formatUrlHostname(hostname: string) {
  return hostname.includes(":") && !hostname.startsWith("[")
    ? `[${hostname}]`
    : hostname;
}

export function rewriteLoopbackServiceUrl(serviceUrl: string, browserHostname: string) {
  const hostname = formatUrlHostname(browserHostname.trim());
  if (!hostname) return serviceUrl;
  return serviceUrl.replace(LOOPBACK_SERVICE_URL, `$1${hostname}`);
}

export function getRuntimeApiBaseUrl(configuredBaseUrl?: string) {
  const fallbackBase = typeof window === "undefined"
    ? `http://localhost:${DEFAULT_API_PORT}`
    : `${window.location.protocol}//${formatUrlHostname(window.location.hostname)}:${DEFAULT_API_PORT}`;
  const configured = String(configuredBaseUrl ?? "").trim();
  const candidate = configured || fallbackBase;
  const runtimeCandidate = typeof window === "undefined"
    ? candidate
    : rewriteLoopbackServiceUrl(candidate, window.location.hostname);
  return runtimeCandidate.replace(/\/+$/, "");
}

export function getRuntimeApiUrl(configuredUrl: string | undefined, fallbackPath: string) {
  const configured = String(configuredUrl ?? "").trim();
  if (configured) {
    return typeof window === "undefined"
      ? configured
      : rewriteLoopbackServiceUrl(configured, window.location.hostname);
  }

  const normalizedPath = fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`;
  return `${getRuntimeApiBaseUrl()}${normalizedPath}`;
}
