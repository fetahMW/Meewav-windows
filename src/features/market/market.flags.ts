import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import { isLocalAuthPreviewEnabled } from "../auth/localAuthPreview";

export type MarketRuntimeMode = "supabase" | "demo";

type MarketRuntimeOptions = {
  isDev?: boolean;
  demoFlag?: string | boolean | null;
  localPreview?: boolean;
};

function configuredDemoFlag() {
  const environment = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  return environment.VITE_MARKET_DEMO_FALLBACK;
}

export function resolveMarketRuntimeMode(options: MarketRuntimeOptions = {}): MarketRuntimeMode {
  const desktopMode = getDesktopApplicationMode();
  if (desktopMode) return desktopMode === "demo" ? "demo" : "supabase";
  const isDev = options.isDev ?? import.meta.env.DEV;
  const localPreview = options.localPreview ?? isLocalAuthPreviewEnabled();
  const demoFlag = options.demoFlag ?? configuredDemoFlag();

  if (localPreview) return "demo";
  if (isDev && (demoFlag === true || demoFlag === "true")) return "demo";
  return "supabase";
}

export function mayUseMarketDemoFallback() {
  return (getDesktopApplicationMode() === "demo" || import.meta.env.DEV) && resolveMarketRuntimeMode() === "demo";
}
