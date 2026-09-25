import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const COUNT = 50000;
const AVATAR_TYPES = 32;
const SEED = 20260620;

const INSTRUMENTS = [
  "violon",
  "clippeur",
  "user_f",
  "user",
  "studio",
  "synthetiseur",
  "pianiste",
  "percussion",
  "orga_event",
  "manager",
  "label",
  "instr_cuivre",
  "instr_vent",
  "inge_son",
  "guitare_elec",
  "guitariste",
  "dj",
  "danseuse",
  "danseur",
  "compositeur",
  "professeur",
  "chanteur",
  "chanteur",
  "beatmaker",
  "beatboxer",
  "batteur",
  "bassiste",
  "user",
  "accordeon",
  "instr_cordes",
  "instr_cordes",
  "instr_cordes"
];

const PARIS_BOUNDS = {
  minLng: 2.1450,
  maxLng: 2.5850,
  minLat: 48.7450,
  maxLat: 49.0200
};

const GRAND_PARIS_MUSIC_SCENE_CENTERS = [
  { id: "paris-01", name: "Paris 1", lng: 2.3364, lat: 48.8626, radius: 520 },
  { id: "paris-02", name: "Paris 2", lng: 2.3431, lat: 48.8686, radius: 520 },
  { id: "paris-03", name: "Paris 3", lng: 2.3600, lat: 48.8637, radius: 560 },
  { id: "paris-04", name: "Paris 4", lng: 2.3574, lat: 48.8544, radius: 560 },
  { id: "paris-05", name: "Paris 5", lng: 2.3444, lat: 48.8448, radius: 720 },
  { id: "paris-06", name: "Paris 6", lng: 2.3331, lat: 48.8493, radius: 650 },
  { id: "paris-07", name: "Paris 7", lng: 2.3125, lat: 48.8567, radius: 850 },
  { id: "paris-08", name: "Paris 8", lng: 2.3126, lat: 48.8729, radius: 850 },
  { id: "paris-09", name: "Paris 9", lng: 2.3375, lat: 48.8769, radius: 730 },
  { id: "paris-10", name: "Paris 10", lng: 2.3599, lat: 48.8760, radius: 820 },
  { id: "paris-11", name: "Paris 11", lng: 2.3800, lat: 48.8584, radius: 980 },
  { id: "paris-12", name: "Paris 12", lng: 2.4044, lat: 48.8395, radius: 1250 },
  { id: "paris-13", name: "Paris 13", lng: 2.3623, lat: 48.8322, radius: 1180 },
  { id: "paris-14", name: "Paris 14", lng: 2.3265, lat: 48.8316, radius: 1050 },
  { id: "paris-15", name: "Paris 15", lng: 2.2920, lat: 48.8405, radius: 1420 },
  { id: "paris-16", name: "Paris 16", lng: 2.2620, lat: 48.8604, radius: 1500 },
  { id: "paris-17", name: "Paris 17", lng: 2.3075, lat: 48.8870, radius: 1160 },
  { id: "paris-18", name: "Paris 18", lng: 2.3488, lat: 48.8925, radius: 1180 },
  { id: "paris-19", name: "Paris 19", lng: 2.3849, lat: 48.8870, radius: 1200 },
  { id: "paris-20", name: "Paris 20", lng: 2.4010, lat: 48.8630, radius: 1150 },
  { id: "saint-denis", name: "Saint-Denis", lng: 2.3574, lat: 48.9362, radius: 1850 },
  { id: "aubervilliers", name: "Aubervilliers", lng: 2.3831, lat: 48.9123, radius: 1450 },
  { id: "saint-ouen", name: "Saint-Ouen", lng: 2.3336, lat: 48.9119, radius: 1350 },
  { id: "pantin", name: "Pantin", lng: 2.4096, lat: 48.8956, radius: 1500 },
  { id: "bobigny", name: "Bobigny", lng: 2.4397, lat: 48.9086, radius: 1650 },
  { id: "montreuil", name: "Montreuil", lng: 2.4432, lat: 48.8638, radius: 1800 },
  { id: "bagnolet", name: "Bagnolet", lng: 2.4187, lat: 48.8692, radius: 1050 },
  { id: "les-lilas", name: "Les Lilas", lng: 2.4200, lat: 48.8798, radius: 900 },
  { id: "romainville", name: "Romainville", lng: 2.4360, lat: 48.8852, radius: 1250 },
  { id: "noisy-le-sec", name: "Noisy-le-Sec", lng: 2.4590, lat: 48.8917, radius: 1550 },
  { id: "drancy", name: "Drancy", lng: 2.4450, lat: 48.9258, radius: 1700 },
  { id: "clichy", name: "Clichy", lng: 2.3056, lat: 48.9045, radius: 1200 },
  { id: "levallois", name: "Levallois-Perret", lng: 2.2886, lat: 48.8932, radius: 1050 },
  { id: "boulogne", name: "Boulogne-Billancourt", lng: 2.2399, lat: 48.8397, radius: 1800 },
  { id: "issy", name: "Issy-les-Moulineaux", lng: 2.2674, lat: 48.8245, radius: 1300 },
  { id: "montrouge", name: "Montrouge", lng: 2.3197, lat: 48.8172, radius: 1050 },
  { id: "gentilly", name: "Gentilly", lng: 2.3428, lat: 48.8136, radius: 1050 },
  { id: "ivry", name: "Ivry-sur-Seine", lng: 2.3847, lat: 48.8131, radius: 1550 },
  { id: "vitry", name: "Vitry-sur-Seine", lng: 2.3928, lat: 48.7875, radius: 2050 },
  { id: "charenton", name: "Charenton-le-Pont", lng: 2.4145, lat: 48.8219, radius: 1050 },
  { id: "vincennes", name: "Vincennes", lng: 2.4397, lat: 48.8478, radius: 1150 },
  { id: "creteil", name: "Creteil", lng: 2.4545, lat: 48.7904, radius: 2200 }
];

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function jitterAround(center) {
  const angle = random() * Math.PI * 2;
  const distanceMeters = Math.sqrt(random()) * center.radius;
  const latRad = center.lat * Math.PI / 180;
  const lng = center.lng + (Math.cos(angle) * distanceMeters) / (111320 * Math.cos(latRad));
  const lat = center.lat + (Math.sin(angle) * distanceMeters) / 110540;

  return [
    Number(clamp(lng, PARIS_BOUNDS.minLng, PARIS_BOUNDS.maxLng).toFixed(6)),
    Number(clamp(lat, PARIS_BOUNDS.minLat, PARIS_BOUNDS.maxLat).toFixed(6))
  ];
}

const features = [];

for (let i = 0; i < COUNT; i++) {
  const center = GRAND_PARIS_MUSIC_SCENE_CENTERS[i % GRAND_PARIS_MUSIC_SCENE_CENTERS.length];
  const [lng, lat] = jitterAround(center);
  const avatarId = (i % AVATAR_TYPES) + 1;
  const instrument = INSTRUMENTS[avatarId - 1] || "user";

  features.push({
    type: "Feature",
    properties: {
      id: `stress-${i}`,
      musician_id: `stress-${i}`,
      avatar_id: avatarId,
      name: `User ${i}`,
      role: instrument,
      instrument,
      city: center.name,
      zone: center.id,
      cluster_level: "avatar",
      selected: false,
      active: false
    },
    geometry: {
      type: "Point",
      coordinates: [lng, lat]
    }
  });
}

const geojson = {
  type: "FeatureCollection",
  features
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "public/map/avatars-stress-test.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(geojson, null, 2));

console.log(`[Stress Test] Regeneration OK: ${COUNT} points spread across Paris in ${outputPath}`);
