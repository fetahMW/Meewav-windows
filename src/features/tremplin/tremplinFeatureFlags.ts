import { getDesktopApplicationMode } from "../../runtime/applicationMode";
export const TREMPLIN_FEATURE_FLAGS = {
  demoMode: getDesktopApplicationMode() !== "live",
  apiTransactions: false,
  reciprocalArtistDiscovery: false,
  reciprocalSupportIdentityConsent: false,
  sponsoredEditorialModules: false,
  productAnalytics: true,
  tokenSuspensionState: false,
} as const;

export type TremplinFeatureFlag = keyof typeof TREMPLIN_FEATURE_FLAGS;

export function isTremplinFeatureEnabled(flag: TremplinFeatureFlag) {
  return TREMPLIN_FEATURE_FLAGS[flag];
}
