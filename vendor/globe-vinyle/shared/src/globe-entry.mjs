export const AUTH_GLOBE_ENTRY_DURATION_MS = 1800;

// Prepare a distant first frame, then start the flight when the host reveals it.
// Scene-arrival flights can take over through the engine's normal navigation.
export function prepareGlobeEntry(engine, { fromAuthentication = false, reducedMotion = false } = {}) {
  const overview = engine.getOverviewTarget('globe');
  const animate = fromAuthentication && !reducedMotion;
  engine.flyTo(animate ? { ...overview, height: 400 } : overview, 0);
  let started = false;
  return () => {
    if (!animate || started) return;
    started = true;
    engine.flyTo(overview, AUTH_GLOBE_ENTRY_DURATION_MS);
  };
}
