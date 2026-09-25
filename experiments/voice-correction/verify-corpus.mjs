#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const experimentDirectory = fileURLToPath(new URL("./", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(experimentDirectory, "corpus.manifest.json"), "utf8"));
const generatedArgument = process.argv.find((argument) => argument.startsWith("--generated-dir="));
const generatedDirectory = generatedArgument
  ? path.resolve(generatedArgument.slice("--generated-dir=".length))
  : path.join(experimentDirectory, "generated");

const failures = [];
if (manifest.schemaVersion !== 1) failures.push(`unsupported schemaVersion: ${manifest.schemaVersion}`);
if (manifest.hashAlgorithm !== "sha256") failures.push(`unsupported hashAlgorithm: ${manifest.hashAlgorithm}`);
const ids = new Set();
const requiredCases = [
  "manual-low-voice",
  "manual-high-voice",
  "manual-soft-voice",
  "manual-powerful-voice",
  "manual-vibrato",
  "manual-melodic-rap",
  "manual-slightly-out-of-tune",
  "manual-very-out-of-tune",
  "manual-background-noise",
  "manual-music-bleed",
  "manual-normal-speech",
  "manual-multiple-voices",
  "manual-instrument-and-voice",
  "manual-strong-reverb",
  "synthetic-silence",
  "synthetic-major-chord",
  "synthetic-impulse",
  "synthetic-log-sweep",
  "synthetic-note-sequence"
];
for (const entry of manifest.entries ?? []) {
  if (!entry.id || ids.has(entry.id)) failures.push(`duplicate or missing id: ${entry.id ?? "<missing>"}`);
  ids.add(entry.id);
  if (!entry.format || !entry.integrity || !entry.rights) failures.push(`${entry.id}: format, integrity and rights are required`);
  if (entry.availability === "manual_required") {
    if (entry.file !== null) failures.push(`${entry.id}: manual file must stay null before controlled ingest`);
    if (entry.integrity?.value !== null || entry.integrity?.status !== "pending_manual_ingest") failures.push(`${entry.id}: manual hash must be pending`);
    if (entry.rights?.status !== "manual_required") failures.push(`${entry.id}: manual rights must be explicit`);
    continue;
  }
  if (entry.availability !== "generated_on_demand") failures.push(`${entry.id}: unknown availability ${entry.availability}`);
  if (!String(entry.purpose).includes("not_human_voice")) failures.push(`${entry.id}: generated purpose must explicitly say not_human_voice`);
  if (entry.rights?.status !== "cleared_internal") failures.push(`${entry.id}: generated rights are not cleared_internal`);
  const filename = path.basename(entry.file ?? "");
  try {
    const bytes = await readFile(path.join(generatedDirectory, filename));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== entry.integrity.bytes) failures.push(`${entry.id}: expected ${entry.integrity.bytes} bytes, got ${bytes.length}`);
    if (hash !== entry.integrity.value) failures.push(`${entry.id}: sha256 mismatch`);
  } catch (error) {
    failures.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const requiredCase of requiredCases) {
  if (!ids.has(requiredCase)) failures.push(`required case missing: ${requiredCase}`);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  const manualCount = manifest.entries.filter((entry) => entry.availability === "manual_required").length;
  const generatedCount = manifest.entries.length - manualCount;
  process.stdout.write(`Corpus valid: ${manifest.entries.length} cases (${manualCount} manual_required, ${generatedCount} generated and hash-verified).\n`);
}
