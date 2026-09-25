import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverOpenDawWasmAssets,
  readOpenDawPackageVersions,
  verifyOpenDawWasmAssets,
} from "./verify-opendaw-wasm.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const ASSET_VERSION = "0.0.11";
const SOURCE_PACKAGE = "@opendaw/studio-core-wasm";
const TARGET_ROOT = resolve(PROJECT_ROOT, "audio-lab-public", "opendaw-wasm", ASSET_VERSION);
const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function looksLikeHtml(buffer) {
  const prefix = buffer.subarray(0, 512).toString("utf8").replace(/^\uFEFF/u, "").trimStart().toLowerCase();
  return prefix.startsWith("<!doctype html")
    || prefix.startsWith("<html")
    || prefix.startsWith("<head")
    || prefix.startsWith("<body");
}

async function readRequiredSource(path, label) {
  let buffer;
  try {
    buffer = await readFile(path);
  } catch (error) {
    throw new Error(`${label} absent : ${path}`, { cause: error });
  }
  if (buffer.length === 0) throw new Error(`${label} est vide : ${path}`);
  if (looksLikeHtml(buffer)) throw new Error(`${label} contient du HTML : ${path}`);
  return buffer;
}

async function main() {
  const [packageVersions, assets] = await Promise.all([
    readOpenDawPackageVersions(),
    discoverOpenDawWasmAssets(),
  ]);
  if (packageVersions[SOURCE_PACKAGE] !== ASSET_VERSION) {
    throw new Error(`Version source incompatible : ${packageVersions[SOURCE_PACKAGE]} (attendu ${ASSET_VERSION}).`);
  }

  const files = [];
  for (const asset of assets) {
    const buffer = await readRequiredSource(asset.sourcePath, `Asset source ${asset.path}`);
    if (asset.path.endsWith(".wasm") && !buffer.subarray(0, WASM_MAGIC.length).equals(WASM_MAGIC)) {
      throw new Error(`Magic bytes WASM invalides dans la source : ${asset.source}`);
    }
    const targetPath = resolve(TARGET_ROOT, ...asset.path.split("/"));
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer);
    files.push({
      path: asset.path,
      source: asset.source,
      mediaType: asset.mediaType,
      bytes: buffer.length,
      sha256: sha256(buffer),
    });
  }

  const manifest = {
    schemaVersion: 1,
    assetVersion: ASSET_VERSION,
    generatedBy: "scripts/sync-opendaw-wasm.mjs",
    sourcePackage: {
      name: SOURCE_PACKAGE,
      version: packageVersions[SOURCE_PACKAGE],
    },
    packages: packageVersions,
    licensing: {
      usage: "internal-prototype-only",
      productionApproved: false,
      bundledButExcludedFromCommercialUse: [
        "wasm/plugins/device_compressor.wasm",
        "wasm/plugins/device_neural_amp.wasm",
      ],
      reason: "WasmEngine.ensureReady in 0.0.11 loads the complete hard-coded device module table. These modules are present only so the internal prototype can boot and are not approved for commercial use.",
    },
    files,
  };
  await writeFile(resolve(TARGET_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const verification = await verifyOpenDawWasmAssets({
    assetRoot: resolve(PROJECT_ROOT, "audio-lab-public"),
  });
  console.log(`[openDAW] Synchronisation OK : ${verification.fileCount} fichiers, ${verification.totalBytes} octets, version ${verification.assetVersion}.`);
}

try {
  await main();
} catch (error) {
  console.error(`[openDAW] Synchronisation échouée : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
