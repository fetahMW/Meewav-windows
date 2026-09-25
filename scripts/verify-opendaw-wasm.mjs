import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const ASSET_VERSION = "0.0.11";
const DEFAULT_ASSET_ROOT = resolve(PROJECT_ROOT, "audio-lab-public");
const VERSIONED_DIRECTORY = `opendaw-wasm/${ASSET_VERSION}`;
const SOURCE_WASM_PACKAGE = "@opendaw/studio-core-wasm";
const PACKAGE_NAMES = [
  "@opendaw/studio-sdk",
  SOURCE_WASM_PACKAGE,
  "@opendaw/studio-boxes",
  "@opendaw/studio-core",
];
const PACKAGE_ROOTS = Object.fromEntries(PACKAGE_NAMES.map((packageName) => {
  const [, unscopedName] = packageName.split("/");
  return [packageName, resolve(PROJECT_ROOT, "node_modules", "@opendaw", unscopedName)];
}));
const STATIC_ASSETS = [
  {
    path: "wasm-processor.js",
    packageName: SOURCE_WASM_PACKAGE,
    packagePath: "dist/wasm-processor.js",
    mediaType: "text/javascript",
  },
  {
    path: "wasm-offline-worker.js",
    packageName: SOURCE_WASM_PACKAGE,
    packagePath: "dist/wasm-offline-worker.js",
    mediaType: "text/javascript",
  },
  {
    path: "processors.js",
    packageName: "@opendaw/studio-core",
    packagePath: "dist/processors.js",
    mediaType: "text/javascript",
  },
];
const COMMERCIAL_EXCLUSION_PATHS = [
  "wasm/plugins/device_compressor.wasm",
  "wasm/plugins/device_neural_amp.wasm",
];
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

function packageSource(packageName, packagePath) {
  return `${packageName}/${packagePath}`;
}

function resolveContainedPath(root, manifestPath) {
  if (typeof manifestPath !== "string" || !manifestPath || isAbsolute(manifestPath)) {
    throw new Error(`Chemin d’asset openDAW invalide : ${String(manifestPath)}`);
  }
  const target = resolve(root, ...manifestPath.split("/"));
  const relativeTarget = relative(root, target);
  if (!relativeTarget || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
    throw new Error(`Chemin d’asset openDAW hors du dossier autorisé : ${manifestPath}`);
  }
  return target;
}

async function readRequiredFile(path, label) {
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

async function readJson(path, label) {
  const buffer = await readRequiredFile(path, label);
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} n’est pas un JSON valide : ${path}`, { cause: error });
  }
}

async function listFilesRecursively(root, relativeDirectory = "") {
  const directory = relativeDirectory
    ? resolveContainedPath(root, relativeDirectory)
    : root;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Dossier d’assets openDAW absent : ${directory}`, { cause: error });
  }
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFilesRecursively(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

export async function readOpenDawPackageVersions() {
  const entries = await Promise.all(PACKAGE_NAMES.map(async (packageName) => {
    const manifest = await readJson(resolve(PACKAGE_ROOTS[packageName], "package.json"), `Manifest npm ${packageName}`);
    if (manifest.name !== packageName || typeof manifest.version !== "string" || !manifest.version) {
      throw new Error(`Identité npm invalide pour ${packageName}`);
    }
    return [packageName, manifest.version];
  }));
  return Object.fromEntries(entries);
}

export async function discoverOpenDawWasmAssets() {
  const wasmPackageRoot = PACKAGE_ROOTS[SOURCE_WASM_PACKAGE];
  const wasmFiles = await listFilesRecursively(resolve(wasmPackageRoot, "dist", "wasm"));
  return [
    ...STATIC_ASSETS.map((asset) => ({
      ...asset,
      source: packageSource(asset.packageName, asset.packagePath),
      sourcePath: resolve(PACKAGE_ROOTS[asset.packageName], ...asset.packagePath.split("/")),
    })),
    ...wasmFiles.map((wasmPath) => ({
      path: `wasm/${wasmPath}`,
      packageName: SOURCE_WASM_PACKAGE,
      packagePath: `dist/wasm/${wasmPath}`,
      mediaType: wasmPath.endsWith(".wasm") ? "application/wasm" : "application/octet-stream",
      source: packageSource(SOURCE_WASM_PACKAGE, `dist/wasm/${wasmPath}`),
      sourcePath: resolve(wasmPackageRoot, "dist", "wasm", ...wasmPath.split("/")),
    })),
  ];
}

function validateManifest(manifest, expectedAssets, installedVersions) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifest openDAW invalide.");
  if (manifest.schemaVersion !== 1) throw new Error(`Version de schéma openDAW inattendue : ${String(manifest.schemaVersion)}`);
  if (manifest.assetVersion !== ASSET_VERSION) {
    throw new Error(`Version d’assets inattendue : ${String(manifest.assetVersion)} (attendu ${ASSET_VERSION})`);
  }
  if (manifest.sourcePackage?.name !== SOURCE_WASM_PACKAGE || manifest.sourcePackage?.version !== ASSET_VERSION) {
    throw new Error(`Le manifest ne référence pas ${SOURCE_WASM_PACKAGE}@${ASSET_VERSION}.`);
  }
  for (const packageName of PACKAGE_NAMES) {
    if (manifest.packages?.[packageName] !== installedVersions[packageName]) {
      throw new Error(`Version de package incohérente dans le manifest : ${packageName}`);
    }
  }
  if (manifest.licensing?.usage !== "internal-prototype-only" || manifest.licensing?.productionApproved !== false) {
    throw new Error("Le manifest doit marquer explicitement ce bundle comme prototype interne non approuvé en production.");
  }
  const commercialExclusions = manifest.licensing?.bundledButExcludedFromCommercialUse;
  if (!Array.isArray(commercialExclusions)
    || commercialExclusions.length !== COMMERCIAL_EXCLUSION_PATHS.length
    || COMMERCIAL_EXCLUSION_PATHS.some((path) => !commercialExclusions.includes(path))) {
    throw new Error("Les modules exclus de l’usage commercial ne sont pas explicitement consignés.");
  }
  if (!Array.isArray(manifest.files)) throw new Error("La liste des fichiers openDAW est absente du manifest.");
  const manifestPaths = manifest.files.map((file) => file?.path);
  if (new Set(manifestPaths).size !== manifestPaths.length) throw new Error("Le manifest openDAW contient un chemin dupliqué.");
  const expectedPaths = new Set(expectedAssets.map((asset) => asset.path));
  if (manifestPaths.length !== expectedPaths.size || manifestPaths.some((path) => !expectedPaths.has(path))) {
    throw new Error(`Le manifest openDAW ne reproduit pas exactement les ${expectedPaths.size} assets requis par la version installée.`);
  }
}

export async function verifyOpenDawWasmAssets({ assetRoot = DEFAULT_ASSET_ROOT } = {}) {
  const versionedRoot = resolve(assetRoot, VERSIONED_DIRECTORY);
  const manifestPath = resolve(versionedRoot, "manifest.json");
  const [manifest, expectedAssets, installedVersions] = await Promise.all([
    readJson(manifestPath, "Manifest openDAW"),
    discoverOpenDawWasmAssets(),
    readOpenDawPackageVersions(),
  ]);
  validateManifest(manifest, expectedAssets, installedVersions);

  const expectedByPath = new Map(expectedAssets.map((asset) => [asset.path, asset]));
  let totalBytes = 0;
  for (const file of manifest.files) {
    const expected = expectedByPath.get(file.path);
    if (!expected || file.source !== expected.source || file.mediaType !== expected.mediaType) {
      throw new Error(`Provenance ou MIME incohérent pour ${file.path}`);
    }
    const [targetBuffer, sourceBuffer] = await Promise.all([
      readRequiredFile(resolveContainedPath(versionedRoot, file.path), `Asset openDAW ${file.path}`),
      readRequiredFile(expected.sourcePath, `Asset source ${file.path}`),
    ]);
    if (file.path.endsWith(".wasm")) {
      if (!targetBuffer.subarray(0, WASM_MAGIC.length).equals(WASM_MAGIC)) throw new Error(`Magic bytes WASM invalides : ${file.path}`);
      if (!sourceBuffer.subarray(0, WASM_MAGIC.length).equals(WASM_MAGIC)) throw new Error(`Magic bytes WASM invalides dans la source : ${file.path}`);
    }
    if (!Number.isInteger(file.bytes) || file.bytes !== targetBuffer.length) {
      throw new Error(`Taille incohérente pour ${file.path} : ${targetBuffer.length} octets, manifest=${String(file.bytes)}`);
    }
    const targetDigest = sha256(targetBuffer);
    const sourceDigest = sha256(sourceBuffer);
    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(file.sha256) || file.sha256 !== targetDigest) {
      throw new Error(`SHA-256 incohérent pour ${file.path}`);
    }
    if (targetDigest !== sourceDigest) throw new Error(`L’asset publié diffère de node_modules : ${file.path}`);
    totalBytes += targetBuffer.length;
  }

  return {
    assetVersion: ASSET_VERSION,
    fileCount: manifest.files.length,
    totalBytes,
    manifestPath,
  };
}

function parseAssetRoot(args) {
  const rootIndex = args.indexOf("--root");
  if (rootIndex === -1) return DEFAULT_ASSET_ROOT;
  const value = args[rootIndex + 1];
  if (!value) throw new Error("La valeur de --root est absente.");
  return resolve(PROJECT_ROOT, value);
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const result = await verifyOpenDawWasmAssets({ assetRoot: parseAssetRoot(process.argv.slice(2)) });
    console.log(`[openDAW] Vérification OK : ${result.fileCount} fichiers, ${result.totalBytes} octets, version ${result.assetVersion}.`);
  } catch (error) {
    console.error(`[openDAW] Vérification échouée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
