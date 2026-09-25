export function resolvePrimaryChromeTopbarHeight(configuredHeight: number, railTop: number) {
  return configuredHeight > 0 ? configuredHeight : railTop;
}
