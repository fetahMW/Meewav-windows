export const CREPUSCULE_URBAIN_GROUND = {
  V01: "#211146",
  V02: "#281655",
  V03: "#301B63",
  V04: "#38216F",
  V05: "#43277B",
  V06: "#4C2D86",
  V07: "#563493",
  V08: "#603B9D",
  V09: "#402461",
  V10: "#4B286F",
  G01: "#35245B",
  G02: "#2B1F4F",
  P01: "#5E2D6E",
  P02: "#6A3479",
  VIVIENNE: "#402461",
} as const;

export const CREPUSCULE_URBAIN_STROKES = {
  parisOuter: "#D8C8FF",
  parisDistrict: "#9B7AE8",
  parisDistrictSoft: "#745DC0",
  grandParisCommune: "#B18EFF",
  grandParisCommuneSoft: "#9270E4",
  hover: "#C4A8FF",
  selected: "#E4D7FF",
} as const;

// The water surface must not change color when navigation switches between
// globe, country and local projections. A single source of truth prevents the
// blue frame that used to flash during long flies and wheel transitions.
export const PERMANENT_WATER_COLOR = "#0B0330";

export const WATER_COLORS = {
  main: PERMANENT_WATER_COLOR,
  bright: PERMANENT_WATER_COLOR,
  glow: PERMANENT_WATER_COLOR,
  soft: PERMANENT_WATER_COLOR,
} as const;

export const WORLD_LAND_COLOR = "#4D25A3";

export const GLOBE_PRESENTATION_COLORS = {
  land: "#3A167F",
  water: PERMANENT_WATER_COLOR,
} as const;

export const LABEL_COLORS = {
  primary: "#F4F0FF",
  secondary: "#D8CFFF",
  muted: "#A99BCB",
  halo: "#140D24",
} as const;

export const CREPUSCULE_URBAIN_GROUND_ROTATION = [
  CREPUSCULE_URBAIN_GROUND.V01,
  CREPUSCULE_URBAIN_GROUND.V02,
  CREPUSCULE_URBAIN_GROUND.V03,
  CREPUSCULE_URBAIN_GROUND.V04,
  CREPUSCULE_URBAIN_GROUND.V05,
  CREPUSCULE_URBAIN_GROUND.V06,
  CREPUSCULE_URBAIN_GROUND.V07,
  CREPUSCULE_URBAIN_GROUND.V08,
  CREPUSCULE_URBAIN_GROUND.V09,
  CREPUSCULE_URBAIN_GROUND.V10,
  CREPUSCULE_URBAIN_GROUND.G01,
  CREPUSCULE_URBAIN_GROUND.G02,
] as const;

export const GRAND_PARIS_CREPUSCULE_GROUND = [
  "#855DDD",
  "#6B4BC4",
  "#7B5BD2",
  "#8B63E6",
  "#8060D8",
  "#6E55C6",
  "#7456D4",
  "#5F4AB2",
  "#9B78F2",
  "#8F70E6",
  "#B18EFF",
  "#A47BEE",
  "#9270E4",
] as const;

export const GRAND_PARIS_FIGMA_STROKES = {
  soft: "#9270E4",
  line: "#B18EFF",
  hover: "#A47BEE",
  selected: "#B18EFF",
  glow: "#9B78F2",
} as const;

export const GRAND_PARIS_LEGACY_GROUND_COLOR_REPLACEMENTS: Record<string, string> = {
  "#211146": "#855DDD",
  "#27164F": "#6B4BC4",
  "#2D2458": "#7B5BD2",
  "#301B5D": "#8B63E6",
  "#312D45": "#8060D8",
  "#36245E": "#6E55C6",
  "#36285A": "#7456D4",
  "#392169": "#5F4AB2",
  "#403A58": "#9B78F2",
  "#413066": "#8F70E6",
  "#422969": "#B18EFF",
  "#432875": "#A47BEE",
  "#4B2D72": "#9270E4",
  "#4B3972": "#855DDD",
  "#4D2E80": "#6B4BC4",
  "#56358B": "#7B5BD2",
  "#57447F": "#8B63E6",
} as const;

export const CREPUSCULE_ACCENTS = [
  CREPUSCULE_URBAIN_GROUND.P01,
  CREPUSCULE_URBAIN_GROUND.P02,
] as const;

const PARIS_QUARTIER_GROUND_COLORS_BY_KEY: Record<string, string> = {
  saintgermainlauxerrois: CREPUSCULE_URBAIN_GROUND.V03,
  halles: CREPUSCULE_URBAIN_GROUND.V05,
  palaisroyal: CREPUSCULE_URBAIN_GROUND.V02,
  placevendome: CREPUSCULE_URBAIN_GROUND.V04,

  gaillon: CREPUSCULE_URBAIN_GROUND.G01,
  vivienne: CREPUSCULE_URBAIN_GROUND.VIVIENNE,
  mail: CREPUSCULE_URBAIN_GROUND.V06,
  bonnenouvelle: CREPUSCULE_URBAIN_GROUND.V07,

  artsetmetiers: CREPUSCULE_URBAIN_GROUND.V05,
  enfantsrouges: CREPUSCULE_URBAIN_GROUND.V07,
  archives: CREPUSCULE_URBAIN_GROUND.V04,
  sainteavoye: CREPUSCULE_URBAIN_GROUND.V03,

  saintmerri: CREPUSCULE_URBAIN_GROUND.V06,
  saintgervais: CREPUSCULE_URBAIN_GROUND.G02,
  arsenal: CREPUSCULE_URBAIN_GROUND.V04,
  notredame: CREPUSCULE_URBAIN_GROUND.V02,

  saintvictor: CREPUSCULE_URBAIN_GROUND.V05,
  jardindesplantes: CREPUSCULE_URBAIN_GROUND.G01,
  valdegrace: CREPUSCULE_URBAIN_GROUND.V06,
  sorbonne: CREPUSCULE_URBAIN_GROUND.V07,
  sorbonnequartierlatin: CREPUSCULE_URBAIN_GROUND.V07,

  monnaie: CREPUSCULE_URBAIN_GROUND.V04,
  odeon: CREPUSCULE_URBAIN_GROUND.V08,
  notredamedeschamps: CREPUSCULE_URBAIN_GROUND.G02,
  saintgermaindespres: CREPUSCULE_URBAIN_GROUND.V06,
  saintthomasdaquin: CREPUSCULE_URBAIN_GROUND.G01,
  invalides: CREPUSCULE_URBAIN_GROUND.V02,
  ecolemilitaire: CREPUSCULE_URBAIN_GROUND.V04,
  groscaillou: CREPUSCULE_URBAIN_GROUND.V06,
  champselysees: CREPUSCULE_URBAIN_GROUND.V05,
  faubourgduroule: CREPUSCULE_URBAIN_GROUND.V07,
  madeleine: CREPUSCULE_URBAIN_GROUND.V04,
  europe: CREPUSCULE_URBAIN_GROUND.G02,
  saintgeorges: CREPUSCULE_URBAIN_GROUND.V06,
  chausseedantin: CREPUSCULE_URBAIN_GROUND.G01,
  faubourgmontmartre: CREPUSCULE_URBAIN_GROUND.V07,
  sentier: CREPUSCULE_URBAIN_GROUND.V07,
  rochechouart: CREPUSCULE_URBAIN_GROUND.V01,
  saintvincentdepaul: CREPUSCULE_URBAIN_GROUND.V05,
  portesaintdenis: CREPUSCULE_URBAIN_GROUND.V07,
  faubourgsaintdenis: CREPUSCULE_URBAIN_GROUND.V07,
  portesaintmartin: CREPUSCULE_URBAIN_GROUND.V06,
  hopitalsaintlouis: CREPUSCULE_URBAIN_GROUND.V04,
  foliemericourt: CREPUSCULE_URBAIN_GROUND.V01,
  saintambroise: CREPUSCULE_URBAIN_GROUND.V06,
  roquette: CREPUSCULE_URBAIN_GROUND.V07,
  saintemarguerite: CREPUSCULE_URBAIN_GROUND.V05,
  belair: CREPUSCULE_URBAIN_GROUND.V04,
  picpus: CREPUSCULE_URBAIN_GROUND.V06,
  bercy: CREPUSCULE_URBAIN_GROUND.V04,
  quinzevingts: CREPUSCULE_URBAIN_GROUND.V07,
  salpetriere: CREPUSCULE_URBAIN_GROUND.G02,
  gare: CREPUSCULE_URBAIN_GROUND.V06,
  maisonblanche: CREPUSCULE_URBAIN_GROUND.V07,
  croulebarbe: CREPUSCULE_URBAIN_GROUND.V04,
  montparnasse: CREPUSCULE_URBAIN_GROUND.V07,
  parcdemontsouris: CREPUSCULE_URBAIN_GROUND.V04,
  petitmontrouge: CREPUSCULE_URBAIN_GROUND.V06,
  plaisance: CREPUSCULE_URBAIN_GROUND.V05,
  saintlambert: CREPUSCULE_URBAIN_GROUND.V04,
  necker: CREPUSCULE_URBAIN_GROUND.V06,
  grenelle: CREPUSCULE_URBAIN_GROUND.V08,
  javel: CREPUSCULE_URBAIN_GROUND.V07,
  auteuil: CREPUSCULE_URBAIN_GROUND.V03,
  muette: CREPUSCULE_URBAIN_GROUND.G02,
  portedauphine: CREPUSCULE_URBAIN_GROUND.V02,
  chaillot: CREPUSCULE_URBAIN_GROUND.V04,
  ternes: CREPUSCULE_URBAIN_GROUND.G01,
  plainedemonceaux: CREPUSCULE_URBAIN_GROUND.V04,
  batignolles: CREPUSCULE_URBAIN_GROUND.V07,
  epinettes: CREPUSCULE_URBAIN_GROUND.V06,
  grandescarrieres: CREPUSCULE_URBAIN_GROUND.V05,
  clignancourt: CREPUSCULE_URBAIN_GROUND.V04,
  gouttedor: CREPUSCULE_URBAIN_GROUND.V01,
  lachapelle: CREPUSCULE_URBAIN_GROUND.V06,
  villette: CREPUSCULE_URBAIN_GROUND.G01,
  pontdeflandre: CREPUSCULE_URBAIN_GROUND.V03,
  amerique: CREPUSCULE_URBAIN_GROUND.V04,
  combat: CREPUSCULE_URBAIN_GROUND.V07,
  belleville: CREPUSCULE_URBAIN_GROUND.V06,
  saintfargeau: CREPUSCULE_URBAIN_GROUND.V04,
  perelachaise: CREPUSCULE_URBAIN_GROUND.V04,
  charonne: CREPUSCULE_URBAIN_GROUND.V05,

  alfortville: CREPUSCULE_URBAIN_GROUND.V04,
  arcueil: CREPUSCULE_URBAIN_GROUND.V05,
  argenteuil: CREPUSCULE_URBAIN_GROUND.V06,
  asnieressurseine: CREPUSCULE_URBAIN_GROUND.V07,
  aubervilliers: "#4B3972",
  aulnaysousbois: CREPUSCULE_URBAIN_GROUND.V05,
  bagneux: CREPUSCULE_URBAIN_GROUND.V04,
  bagnolet: CREPUSCULE_URBAIN_GROUND.V06,
  bobigny: CREPUSCULE_URBAIN_GROUND.V05,
  bondy: CREPUSCULE_URBAIN_GROUND.V04,
  boulognebillancourt: CREPUSCULE_URBAIN_GROUND.V06,
  cachan: CREPUSCULE_URBAIN_GROUND.G01,
  champignysurmarne: "#4B3972",
  charentonlepont: CREPUSCULE_URBAIN_GROUND.G02,
  chatillon: CREPUSCULE_URBAIN_GROUND.V04,
  clamart: CREPUSCULE_URBAIN_GROUND.V05,
  clichy: CREPUSCULE_URBAIN_GROUND.V07,
  colombes: CREPUSCULE_URBAIN_GROUND.V06,
  courbevoie: "#4B3972",
  creteil: CREPUSCULE_URBAIN_GROUND.V06,
  drancy: "#4B3972",
  fontenaysousbois: CREPUSCULE_URBAIN_GROUND.V05,
  gennevilliers: CREPUSCULE_URBAIN_GROUND.V04,
  gentilly: CREPUSCULE_URBAIN_GROUND.G02,
  issylesmoulineaux: CREPUSCULE_URBAIN_GROUND.V01,
  ivrysurseine: CREPUSCULE_URBAIN_GROUND.V07,
  lacourneuve: CREPUSCULE_URBAIN_GROUND.V06,
} as const;

export function normalizePaletteKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "et")
    .replace(/[^a-z0-9]+/g, "");
}

export function getCrepusculeGroundColor(params: {
  label?: unknown;
  zoneId?: unknown;
  colorIndex?: unknown;
}) {
  const labelKey = normalizePaletteKey(params.label);
  const zoneKey = normalizePaletteKey(params.zoneId);
  const explicitColor = PARIS_QUARTIER_GROUND_COLORS_BY_KEY[labelKey] ?? PARIS_QUARTIER_GROUND_COLORS_BY_KEY[zoneKey];
  if (explicitColor) return explicitColor;

  const rawIndex = Number(params.colorIndex);
  const colorIndex = Number.isFinite(rawIndex) ? Math.abs(Math.trunc(rawIndex)) : 0;
  return CREPUSCULE_URBAIN_GROUND_ROTATION[colorIndex % CREPUSCULE_URBAIN_GROUND_ROTATION.length];
}

export function getGrandParisCrepusculeGroundColor(params: {
  label?: unknown;
  zoneId?: unknown;
  colorIndex?: unknown;
  legacyGroundColor?: unknown;
}) {
  const legacyGroundColor = typeof params.legacyGroundColor === "string"
    ? GRAND_PARIS_LEGACY_GROUND_COLOR_REPLACEMENTS[params.legacyGroundColor.toUpperCase()]
    : undefined;
  if (legacyGroundColor) return legacyGroundColor;

  const rawIndex = Number(params.colorIndex);
  if (Number.isFinite(rawIndex)) {
    const colorIndex = Math.abs(Math.trunc(rawIndex));
    return GRAND_PARIS_CREPUSCULE_GROUND[colorIndex % GRAND_PARIS_CREPUSCULE_GROUND.length];
  }

  const stableKey = normalizePaletteKey(params.zoneId) || normalizePaletteKey(params.label);
  let hash = 0;
  for (let index = 0; index < stableKey.length; index += 1) {
    hash = ((hash * 31) + stableKey.charCodeAt(index)) >>> 0;
  }
  return GRAND_PARIS_CREPUSCULE_GROUND[hash % GRAND_PARIS_CREPUSCULE_GROUND.length];
}
