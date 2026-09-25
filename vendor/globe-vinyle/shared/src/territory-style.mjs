import reference from "./territory-style-reference.json" with { type: "json" };
import { geographyLevels } from "./geo-index.mjs";
import communeReference from "./commune-style-reference.json" with { type: "json" };
import { CREPUSCULE_URBAIN_GROUND, GRAND_PARIS_CREPUSCULE_GROUND, getCrepusculeGroundColor } from "./reference/crepusculeUrbainPalette.ts";
export const FRANCE_LOCAL_GROUND = CREPUSCULE_URBAIN_GROUND.V05;
export const METRES_TO_WORLD = 100 / 6371008.8;
export function quartierHeight(id) {
  if (!String(id).startsWith('fr-paris-')) {
    let hash = 2166136261;
    for (const c of String(id)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return 0.68 + (hash >>> 0) % 80 * 0.35 / 79;
  }
  const code = Number(String(id).match(/(\d{7})$/)?.[1] || 7510101) % 10000;
  const ordinal = (Math.floor(code / 100) - 1) * 4 + code % 100 - 1;
  // A fixed permutation alternates low/high neighbours, with 80 distinct levels.
  const level = ((ordinal * 37) % 80 + 80) % 80;
  return 0.68 + level * 0.35 / 79;
}
const key = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "et").replace(/[^a-z0-9]/g, "");
export function territoryStyle(feature) {
  const p = feature.properties;
  if (p.kind === "region") {
    const style = reference.regions[p.code] || { color: "#7456D4", height: 3400 };
    return { color: style.color, nearColor: FRANCE_LOCAL_GROUND, height: style.height * 1.12 + Number(p.code) * 2 };
  }
  if (p.kind === "commune") {
    const code = String(p.code || p.sourceCode || feature.id?.replace("fr-commune-", "") || "");
    const source = communeReference.communes[code];
    const colorIndex = source?.colorIndex ?? (Number(code.replace(/\D/g, "")) || 0);
    const nearColor = getCrepusculeGroundColor({ label: p.name, colorIndex });
    return { color: source?.color || GRAND_PARIS_CREPUSCULE_GROUND[colorIndex % GRAND_PARIS_CREPUSCULE_GROUND.length], nearColor, height: 0.18 };
  }
  const quarterColor = p.cityCode
    ? getCrepusculeGroundColor({ label: p.name, colorIndex: p.colorIndex || 0 })
    : reference.quartier[key(p.name)] || "#43277B";
  return { color: quarterColor, height: quartierHeight(p.id || feature.id || p.sourceCode) };
}
// Regional plates lower into a permanent violet floor as local detail appears.
export function territoryReveal(height) {
  const levels = geographyLevels(height);
  const t = Math.max(0, Math.min(1, (height - 2.2) / (8 - 2.2)));
  return { region: t * t * (3 - 2 * t), commune: levels.commune, quartier: levels.quartier };
}
export const localGroundBlend = height => {
  const t = Math.max(0, Math.min(1, (height - 0.2) / (1.2 - 0.2)));
  return 1 - t * t * (3 - 2 * t);
};
