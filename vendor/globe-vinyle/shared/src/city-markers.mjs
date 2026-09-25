import * as T from "three";
import { xyz, RADIUS } from "./geo.mjs";
import { territoryReveal, territoryStyle, METRES_TO_WORLD } from "./territory-style.mjs";
import { layoutCityMarkers, LOCAL_CITY_REVEAL } from "./city-label-layout.mjs";
import { formatAvatarCount } from "./paris-avatar-population.mjs";

export const cityMarkersVisible = height => height <= 55;

export function createCityMarkers(host, labels, regions, onSelect, invalidate = () => {}, focus = null, occludesLabel = null, avatarCountFor = () => 0, align = null) {
  const layer = document.createElement("div");
  layer.className = "city-marker-layer";
  layer.setAttribute("role", "group");
  layer.setAttribute("aria-label", "Villes et communes — cliquer pour visiter");
  const cities = labels.filter(label => label.kind === "city");
  const major = cities.filter(city => city.major);
  const regional = cities.filter(city => city.regional);
  const textContext = document.createElement("canvas").getContext("2d");
  if (textContext) textContext.font = "600 13px Arial, sans-serif";
  const textWidths = new Map();
  const regionByCode = new Map(regions.map(region => [region.properties.code, region]));
  const cells = new Map();
  for (const city of cities) {
    const key = Math.floor(city.center[0]) + ":" + Math.floor(city.center[1]);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(city);
  }
  const items = new Map();
  let pointerCityId = null, focusedCityId = null;
  const getHoveredId = () => pointerCityId || focusedCityId;
  function setInteraction(kind, id) {
    const previous = getHoveredId();
    if (kind === 'pointer') pointerCityId = id;
    else focusedCityId = id;
    if (getHoveredId() !== previous) invalidate();
  }
  function clearHover() {
    const hadHover = getHoveredId() !== null;
    pointerCityId = focusedCityId = null;
    if (hadHover) invalidate();
  }
  function removeItem(item) {
    if (pointerCityId === item.city.id) setInteraction('pointer', null);
    if (focusedCityId === item.city.id) setInteraction('focus', null);
    item.button.remove();
  }
  let previous = new Set();
  let localTier = 0, showing = false, showingRegional = false, admissionTimer = null;
  const pendingSince = new Map(), blockedUntil = new Map();
  const getItem = city => {
    if (items.has(city.id)) return items.get(city.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "city-marker";
    button.hidden = true;
    button.setAttribute("aria-label", `Visiter ${city.name} · ${formatAvatarCount(avatarCountFor(city))}`);
    const point = document.createElement("span");
    point.className = "city-marker__point";
    const name = document.createElement("span");
    name.className = "city-marker__name";
    name.textContent = city.name;
    const hint = document.createElement("span");
    hint.className = "city-marker__hint";
    const heading = document.createElement("strong");
    heading.textContent = city.name;
    const avatarCount = document.createElement("span");
    avatarCount.className = "city-marker__count";
    avatarCount.textContent = formatAvatarCount(avatarCountFor(city));
    const action = document.createElement("span");
    action.className = "city-marker__action";
    action.textContent = "Cliquez pour visiter";
    hint.append(heading, avatarCount, action);
    for (const element of [point, name, hint]) element.setAttribute("aria-hidden", "true");
    button.append(point, name, hint);
    button.addEventListener("pointerenter", () => setInteraction('pointer', city.id));
    button.addEventListener("pointerleave", () => {
      if (pointerCityId === city.id) setInteraction('pointer', null);
    });
    button.addEventListener("focus", () => {
      if (button.matches(':focus-visible')) setInteraction('focus', city.id);
    });
    button.addEventListener("blur", () => {
      if (focusedCityId === city.id) setInteraction('focus', null);
    });
    let press = null;
    button.addEventListener("pointerdown", event => { press = { x: event.clientX, y: event.clientY }; });
    button.addEventListener("pointercancel", () => {
      press = null;
      if (pointerCityId === city.id) setInteraction('pointer', null);
    });
    button.addEventListener("click", event => {
      if (event.detail !== 0 && (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5)) return;
      press = null;
      clearHover();
      onSelect(city);
    });
    layer.append(button);
    const item = { city, button };
    items.set(city.id, item);
    return item;
  };
  host.append(layer);
  const anchor = new T.Vector3(), direction = new T.Vector3(), projected = new T.Vector3();
  return {
    getHoveredId,
    clearHover,
    update(camera, height, width, viewportHeight, bounds, mosaicDepartments, hoveredTerritoryId = null) {
      if (admissionTimer !== null) clearTimeout(admissionTimer);
      admissionTimer = null;
      showing = showing ? height <= 60 : cityMarkersVisible(height);
      layer.hidden = !showing;
      if (layer.hidden) {
        clearHover();
        for (const item of items.values()) removeItem(item);
        items.clear(); previous.clear(); pendingSince.clear(); blockedUntil.clear(); localTier = 0; showingRegional = false;
        return;
      }
      const reveal = territoryReveal(height);
      // Regional reference towns appear well before the commune mosaic, with
      // the same hysteresis as the local tiers and no dependency on tile loads.
      showingRegional = showingRegional ? height <= 26 : height <= 22;
      // Separate entry/exit thresholds prevent zoom-boundary oscillation.
      if (localTier === 0 && reveal.commune >= 0.32) localTier = 1;
      if (localTier > 0 && reveal.commune < LOCAL_CITY_REVEAL) localTier = 0;
      if (localTier === 1 && height <= 0.7) localTier = 2;
      if (localTier === 2 && height <= 0.2) localTier = 3;
      if (localTier === 3 && height > 0.25) localTier = 2;
      if (localTier === 2 && height > 0.85) localTier = 1;
      let candidates = showingRegional ? [...major, ...regional] : major;
      if (localTier > 0 && bounds) {
        candidates = [...candidates];
        for (const [key, group] of cells) {
          const [lon, lat] = key.split(":").map(Number);
          if (lat + 1 < bounds[1] || lat > bounds[3]) continue;
          if (![0, -360, 360].some(offset => lon + 1 + offset >= bounds[0] && lon + offset <= bounds[2])) continue;
          candidates.push(...group.filter(city => !city.major && !city.regional && mosaicDepartments.has(city.department)));
        }
      }
      const visible = [];
      for (const city of candidates) {
        const plate = regionByCode.get(city.region);
        const altitude = plate ? territoryStyle(plate).height * METRES_TO_WORLD * reveal.region : 0;
        anchor.set(...xyz(...city.center, RADIUS + altitude));
        if (align) anchor.applyQuaternion(align);
        direction.copy(camera.position).sub(anchor);
        projected.copy(anchor).project(camera);
        const facing = anchor.dot(direction) / (anchor.length() * direction.length());
        const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * viewportHeight / 2;
        if (facing < 0.08 || projected.z < -1 || projected.z > 1 || x < 16 || y < 16 || x > width - 16 || y > viewportHeight - 16) continue;
        if ((x < 110 && y > 100) || (y < 115 && x < 640) || (y > viewportHeight - 85 && Math.abs(x - width / 2) < 225)) continue;
        if (!textWidths.has(city.id)) textWidths.set(city.id, textContext ? textContext.measureText(city.name).width : city.name.length * 8);
        // Include the point and its name below it; neither should float over
        // the ring when their geographic position is hidden behind its floor.
        if (occludesLabel?.(camera, anchor, Math.max(24, textWidths.get(city.id)), 42, viewportHeight, 12)) continue;
        visible.push({ city, x, y, labelWidth: textWidths.get(city.id) });
      }
      const now = performance.now(), pendingThisFrame = new Set();
      let nextAdmission = Infinity;
      for (const [id, until] of blockedUntil) if (until <= now) blockedUntil.delete(id);
      const canEnter = item => {
        const id = item.city.id;
        pendingThisFrame.add(id);
        if (!pendingSince.has(id)) pendingSince.set(id, Math.max(now, blockedUntil.get(id) || 0));
        const remaining = pendingSince.get(id) + 180 - now;
        if (remaining > 0) { nextAdmission = Math.min(nextAdmission, remaining); return false; }
        return true;
      };
      const selected = layoutCityMarkers(visible, width, viewportHeight, previous, localTier, canEnter);
      const next = new Set();
      for (const item of selected) {
        const marker = getItem(item.city);
        marker.button.hidden = false;
        const people = formatAvatarCount(avatarCountFor(item.city));
        const countNode = marker.button.querySelector(".city-marker__count");
        if (countNode && countNode.textContent !== people) countNode.textContent = people;
        const label = `Visiter ${item.city.name} · ${people}`;
        if (marker.button.getAttribute("aria-label") !== label) marker.button.setAttribute("aria-label", label);
        const highlighted = item.city.id === hoveredTerritoryId || item.city.id === getHoveredId()
          || item.city.id === focus?.flightTerritoryId;
        const emphasis = focus && !highlighted ? 1 - 0.7 * focus.strength * (1 - focus.brightness({ id: item.city.id,
          properties: { kind: 'commune', code: item.city.code } })) : 1;
        marker.button.style.setProperty('--city-focus-opacity', String(emphasis));
        marker.button.style.transform = "translate(" + (item.x - 12) + "px, " + (item.y - 12) + "px)";
        next.add(item.city.id);
      }
      // Keep only the current small set of buttons, not a DOM node per commune.
      for (const [id, item] of items) if (!next.has(id)) {
        removeItem(item); items.delete(id); blockedUntil.set(id, now + 500);
      }
      for (const id of pendingSince.keys()) if (!pendingThisFrame.has(id) || next.has(id)) pendingSince.delete(id);
      // Wake the demand-driven renderer once at admission, including when the
      // user has stopped dragging. No permanent animation loop is needed.
      if (Number.isFinite(nextAdmission)) admissionTimer = setTimeout(() => {
        admissionTimer = null; invalidate();
      }, Math.max(16, Math.ceil(nextAdmission)));
      previous = next;
    },
    dispose() { if (admissionTimer !== null) clearTimeout(admissionTimer); clearHover(); layer.remove(); },
  };
}
