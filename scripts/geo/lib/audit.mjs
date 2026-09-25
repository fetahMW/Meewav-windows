import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const TERRITORIAL_NAMES = [
  "paris",
  "grand_paris",
  "saint_denis",
  "trappes",
  "nice",
  "lyon",
  "nantes",
  "marseille",
  "lille",
];

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const EXCLUDED_DIRECTORIES = new Set(["data", "guide-alpha"]);

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) files.push(...(await listSourceFiles(absolutePath)));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) files.push(absolutePath);
  }
  return files;
}

function countMatches(content, expression) {
  return [...content.matchAll(expression)].length;
}

export async function auditFrontendTerritorialCoupling(rootDirectory) {
  const sourceRoot = path.join(rootDirectory, "src", "features", "globe");
  const files = await listSourceFiles(sourceRoot);
  const territorialExpression = new RegExp(`\\b(?:${TERRITORIAL_NAMES.join("|")})[_-][a-z0-9]`, "gi");
  const prefixBranchExpression = new RegExp(`(?:startsWith|includes|===)\\s*\\(?(?:[\"'\\x60])(?:${TERRITORIAL_NAMES.join("|")})[_-]`, "gi");
  const perFile = [];

  for (const absolutePath of files) {
    const content = await readFile(absolutePath, "utf8");
    const metrics = {
      cityIdLiterals: countMatches(content, /\bcity-[a-z0-9-]+\b/gi),
      communeIdLiterals: countMatches(content, /\bcommune-[a-z0-9-]+\b/gi),
      territorialPrefixLiterals: countMatches(content, territorialExpression),
      prefixBranches: countMatches(content, prefixBranchExpression),
    };
    const total = Object.values(metrics).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      perFile.push({
        file: path.relative(rootDirectory, absolutePath).replaceAll("\\", "/"),
        ...metrics,
        total,
      });
    }
  }

  const totals = perFile.reduce(
    (result, entry) => {
      for (const key of ["cityIdLiterals", "communeIdLiterals", "territorialPrefixLiterals", "prefixBranches", "total"]) {
        result[key] += entry[key];
      }
      return result;
    },
    { cityIdLiterals: 0, communeIdLiterals: 0, territorialPrefixLiterals: 0, prefixBranches: 0, total: 0 },
  );

  return {
    schemaVersion: 1,
    scannedRoot: "src/features/globe",
    scannedFileCount: files.length,
    territorialNames: TERRITORIAL_NAMES,
    totals,
    files: perFile.sort((first, second) => second.total - first.total || first.file.localeCompare(second.file)),
  };
}

export function compareAuditToBaseline(audit, baseline) {
  const regressions = [];
  for (const key of ["cityIdLiterals", "communeIdLiterals", "territorialPrefixLiterals", "prefixBranches", "total"]) {
    const currentValue = audit.totals[key] ?? 0;
    const baselineValue = baseline.totals?.[key] ?? 0;
    if (currentValue > baselineValue) {
      regressions.push({ metric: key, baseline: baselineValue, current: currentValue, increase: currentValue - baselineValue });
    }
  }
  return regressions;
}
