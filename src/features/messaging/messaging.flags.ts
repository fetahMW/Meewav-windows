import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import { isLocalAuthPreviewEnabled } from "../auth/localAuthPreview";

export type MessagingRuntimeMode = "supabase" | "demo";

type MessagingRuntimeOptions = {
  isDev?: boolean;
  demoFlag?: string | boolean | null;
  localPreview?: boolean;
};

function configuredDemoFlag() {
  const environment = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  return environment.VITE_MESSAGING_DEMO_FALLBACK;
}

export function resolveMessagingRuntimeMode(options: MessagingRuntimeOptions = {}): MessagingRuntimeMode {
  const desktopMode = getDesktopApplicationMode();
  if (desktopMode) return desktopMode === "demo" ? "demo" : "supabase";
  const isDev = options.isDev ?? import.meta.env.DEV;
  const localPreview = options.localPreview ?? isLocalAuthPreviewEnabled();
  const demoFlag = options.demoFlag ?? configuredDemoFlag();

  if (localPreview) return "demo";
  if (isDev && (demoFlag === true || demoFlag === "true")) return "demo";
  return "supabase";
}

export function isMessagingDemoEnabled() {
  return resolveMessagingRuntimeMode() === "demo";
}

export function mayUseMessagingDemoFallback() {
  // Never use demo data as an automatic catch-path after a Supabase failure.
  // This flag only selects the explicit local development data source.
  return (getDesktopApplicationMode() === "demo" || import.meta.env.DEV) && isMessagingDemoEnabled();
}
