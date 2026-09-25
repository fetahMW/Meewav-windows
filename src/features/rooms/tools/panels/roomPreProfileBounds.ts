/** Shared console boundaries for room pre-profiles, including Wave transport. */
export function getRoomPreProfileBounds(trigger: HTMLElement | null) {
  const bounds = trigger?.closest<HTMLElement>(".place-mixer")
    ?? trigger?.closest<HTMLElement>(".room-tool-panel")
    ?? trigger?.closest<HTMLElement>(".place-studio-panel")
    ?? document.querySelector<HTMLElement>(".place-studio-panel:not(.is-collapsed)");
  return {
    boundsElement: bounds,
    topBoundaryElement: bounds?.querySelector<HTMLElement>(".wave-tools-nav")
      ?? bounds?.querySelector<HTMLElement>(".place-studio-panel__bar"),
    bottomBoundaryElement: trigger?.closest<HTMLElement>(".wave-bottom-bar"),
  };
}
