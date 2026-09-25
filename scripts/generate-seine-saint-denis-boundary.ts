import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "seine-saint-denis-boundary.geojson");
const SOURCE_URL = "https://france-geojson.gregoiredavid.fr/repo/departements/93-seine-saint-denis/departement-93-seine-saint-denis.geojson";

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Meewav-Web Seine-Saint-Denis boundary generator/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch Seine-Saint-Denis boundary: HTTP ${response.status}`);
  }

  const feature = await response.json();
  if (!feature?.geometry) {
    throw new Error("Missing Seine-Saint-Denis boundary geometry");
  }

  feature.id = "seine_saint_denis_boundary_93";
  feature.properties = {
    id: "seine_saint_denis_boundary_93",
    code: "93",
    name: "Seine-Saint-Denis",
    label: "Seine-Saint-Denis",
    source: SOURCE_URL,
  };

  const collection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: SOURCE_URL,
      featureCount: 1,
    },
    features: [feature],
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Generated Seine-Saint-Denis boundary at ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
