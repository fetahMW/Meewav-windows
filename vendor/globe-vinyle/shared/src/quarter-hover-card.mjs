import { formatAvatarCount } from "./paris-avatar-population.mjs";

// One DOM card reuses the engine's existing geographic hover result.
export function createQuarterHoverCard(host) {
  const card = document.createElement("div");
  card.className = "quarter-hover-card";
  card.setAttribute("role", "tooltip");
  card.hidden = true;
  const name = document.createElement("strong");
  const count = document.createElement("span");
  count.className = "quarter-hover-card__count";
  count.textContent = formatAvatarCount(0);
  card.append(name, count);
  host.append(card);
  return {
    show(feature, x, y, avatarCount = 0) {
      if (feature?.properties.kind !== "quartier") { card.hidden = true; return; }
      const label = feature.properties.name || "Quartier";
      if (name.textContent !== label) name.textContent = label;
      count.textContent = formatAvatarCount(avatarCount);
      card.hidden = false;
      const w = card.offsetWidth, h = card.offsetHeight;
      const right = document.documentElement.clientWidth;
      const bottom = document.documentElement.clientHeight;
      const left = x + 18 + w <= right - 12 ? x + 18 : x - w - 18;
      const top = y + 18 + h <= bottom - 12 ? y + 18 : y - h - 18;
      card.style.transform = `translate(${Math.max(12, Math.min(left, right - w - 12))}px, ${Math.max(12, Math.min(top, bottom - h - 12))}px)`;
    },
    hide() { card.hidden = true; },
    dispose() { card.remove(); },
  };
}
