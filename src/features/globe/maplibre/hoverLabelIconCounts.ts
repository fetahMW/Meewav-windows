const HOVER_LABEL_ICON_COUNTS = [
  { id: "microphone", label: "Microphone", iconSrc: "/assets/globe-labels/microphone-svgrepo-com.svg" },
  { id: "guitar", label: "Guitare", iconSrc: "/assets/globe-labels/guitar-solid-svgrepo-com.svg" },
  { id: "piano", label: "Piano", iconSrc: "/assets/globe-labels/piano-svgrepo-com.svg" },
  { id: "producer", label: "Producteur", iconSrc: "/assets/globe-labels/music-controllers-svgrepo-com.svg" },
] as const;

export type HoverLabelIconCountId = typeof HOVER_LABEL_ICON_COUNTS[number]["id"];
export type HoverLabelIconCounts = Partial<Record<HoverLabelIconCountId, number>>;

function formatHoverLabelCount(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "0";
  return String(Math.max(0, Math.round(numericValue)));
}

export function createHoverLabelIconCountsElement(ownerDocument: Document) {
  const listElement = ownerDocument.createElement("div");
  listElement.className = "city-zone-hover-card__icon-counts";

  for (const item of HOVER_LABEL_ICON_COUNTS) {
    const itemElement = ownerDocument.createElement("div");
    itemElement.className = `city-zone-hover-card__icon-count city-zone-hover-card__icon-count--${item.id}`;
    itemElement.dataset.countId = item.id;
    itemElement.setAttribute("aria-label", `${item.label}: 0`);

    const iconElement = ownerDocument.createElement("img");
    iconElement.src = item.iconSrc;
    iconElement.alt = "";
    iconElement.draggable = false;
    iconElement.setAttribute("aria-hidden", "true");

    const countElement = ownerDocument.createElement("b");
    countElement.textContent = "0";

    itemElement.append(iconElement, countElement);
    listElement.append(itemElement);
  }

  return listElement;
}

export function updateHoverLabelIconCountsElement(
  listElement: HTMLElement,
  counts: HoverLabelIconCounts = {},
) {
  for (const item of HOVER_LABEL_ICON_COUNTS) {
    const itemElement = listElement.querySelector<HTMLElement>(`[data-count-id="${item.id}"]`);
    const countElement = itemElement?.querySelector("b");
    const count = formatHoverLabelCount(counts[item.id]);

    if (countElement) countElement.textContent = count;
    itemElement?.setAttribute("aria-label", `${item.label}: ${count}`);
  }
}
