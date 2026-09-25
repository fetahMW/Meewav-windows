import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip, createGzip } from 'node:zlib';

import { EXPECTED_PROFILE_COUNT } from './constants.mjs';
import {
  TEMP_COLUMNS,
  TEMP_COLUMN_NAMES,
  assignmentFromValues,
  assignmentValues,
  fingerprintAssignments,
  sha256FileStream,
} from './database.mjs';

const ARTIFACT_SCHEMA_VERSION = 1;

function writeJsonAtomic(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, resolved);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

function validateMetadata(metadata, expectedCount) {
  if (metadata?.schemaVersion !== ARTIFACT_SCHEMA_VERSION
    || metadata?.kind !== 'meewav-avatar-dispatch-assignments'
    || metadata?.rowCount !== expectedCount
    || JSON.stringify(metadata?.columns) !== JSON.stringify(TEMP_COLUMN_NAMES)
    || typeof metadata?.seed !== 'string'
    || typeof metadata?.databaseFingerprint !== 'string'
    || typeof metadata?.assignmentPlanHash !== 'string') {
    throw new Error(`Metadata artefact invalide: ${JSON.stringify(metadata)}`);
  }
}

export async function writeAssignmentArtifact({
  assignments,
  seed,
  databaseFingerprint,
  assignmentPlanHash,
  reportRunId,
  reportDir,
  auditEvidence = [],
  expectedCount = EXPECTED_PROFILE_COUNT,
}) {
  if (assignments.length !== expectedCount) {
    throw new Error(`Artefact refuse: ${assignments.length}/${expectedCount} assignments`);
  }
  const calculatedPlanHash = fingerprintAssignments(assignments);
  if (calculatedPlanHash !== assignmentPlanHash) {
    throw new Error(`Artefact refuse: plan ${calculatedPlanHash} != ${assignmentPlanHash}`);
  }

  const resolvedReportDir = path.resolve(reportDir);
  fs.mkdirSync(resolvedReportDir, { recursive: true });
  const artifactPath = path.join(resolvedReportDir, 'assignments.jsonl.gz');
  const manifestPath = path.join(resolvedReportDir, 'artifact-manifest.json');
  if (fs.existsSync(artifactPath) || fs.existsSync(manifestPath)) {
    throw new Error(`Artefact deja present dans ${resolvedReportDir}; verification manuelle requise`);
  }

  const metadata = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    kind: 'meewav-avatar-dispatch-assignments',
    generatedAt: new Date().toISOString(),
    rowCount: expectedCount,
    seed,
    databaseFingerprint,
    assignmentPlanHash,
    reportRunId,
    columns: TEMP_COLUMN_NAMES,
    auditEvidence,
  };
  const ordered = [...assignments].sort((left, right) => String(left.id).localeCompare(String(right.id)));

  function* lines() {
    yield `${JSON.stringify(metadata)}\n`;
    for (const assignment of ordered) yield `${JSON.stringify(assignmentValues(assignment))}\n`;
  }

  try {
    await pipeline(
      Readable.from(lines()),
      createGzip({ level: 9 }),
      fs.createWriteStream(artifactPath, { flags: 'wx' }),
    );
    const compressedSha256 = await sha256FileStream(artifactPath);
    const bytes = fs.statSync(artifactPath).size;
    const manifest = {
      ...metadata,
      artifactFile: path.basename(artifactPath),
      compressedSha256,
      bytes,
    };
    writeJsonAtomic(manifestPath, manifest);
    const verified = await readAssignmentArtifact({
      manifestPath,
      expectedPlanHash: assignmentPlanHash,
      expectedDatabaseFingerprint: databaseFingerprint,
      expectedCount,
      collectAssignments: false,
    });
    return { manifestPath, artifactPath, ...verified };
  } catch (error) {
    if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    throw error;
  }
}

export async function readAssignmentArtifact({
  manifestPath,
  expectedPlanHash,
  expectedDatabaseFingerprint,
  expectedCount = EXPECTED_PROFILE_COUNT,
  collectAssignments = true,
}) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf8'));
  validateMetadata(manifest, expectedCount);
  if (expectedPlanHash && manifest.assignmentPlanHash !== expectedPlanHash) {
    throw new Error(`Plan manifeste ${manifest.assignmentPlanHash} != attendu ${expectedPlanHash}`);
  }
  if (expectedDatabaseFingerprint && manifest.databaseFingerprint !== expectedDatabaseFingerprint) {
    throw new Error(
      `Source manifeste ${manifest.databaseFingerprint} != attendue ${expectedDatabaseFingerprint}`,
    );
  }

  const artifactPath = path.resolve(path.dirname(resolvedManifestPath), manifest.artifactFile);
  const compressedSha256 = await sha256FileStream(artifactPath);
  if (compressedSha256 !== manifest.compressedSha256) {
    throw new Error(`SHA artefact ${compressedSha256} != manifeste ${manifest.compressedSha256}`);
  }

  const assignments = collectAssignments ? [] : null;
  const uniqueIds = new Set();
  let metadata = null;
  let buffered = '';
  let rowCount = 0;
  let previousId = null;
  const decoder = new StringDecoder('utf8');
  const planDigest = crypto.createHash('sha256');
  planDigest.update('meewav-avatar-dispatch-assignment-plan-v2\n');
  planDigest.update(JSON.stringify(TEMP_COLUMNS)).update('\n');
  const gunzip = createGunzip();
  fs.createReadStream(artifactPath).pipe(gunzip);

  function consumeLine(line) {
    if (!line) return;
    const parsed = JSON.parse(line);
    if (!metadata) {
      metadata = parsed;
      validateMetadata(metadata, expectedCount);
      if (metadata.assignmentPlanHash !== manifest.assignmentPlanHash
        || metadata.databaseFingerprint !== manifest.databaseFingerprint
        || metadata.seed !== manifest.seed) {
        throw new Error('Metadata compressee et manifeste divergent');
      }
      return;
    }
    const assignment = assignmentFromValues(parsed);
    planDigest.update(JSON.stringify(assignmentValues(assignment))).update('\n');
    const id = String(assignment.id);
    if (previousId && previousId.localeCompare(id) >= 0) {
      throw new Error(`Artefact non strictement trie: ${previousId} puis ${id}`);
    }
    if (uniqueIds.has(id)) throw new Error(`UUID duplique dans artefact: ${id}`);
    uniqueIds.add(id);
    previousId = id;
    if (assignments) assignments.push(assignment);
    rowCount += 1;
  }

  for await (const chunk of gunzip) {
    buffered += decoder.write(chunk);
    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      consumeLine(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
    }
  }
  buffered += decoder.end();
  if (buffered) consumeLine(buffered);
  if (!metadata || rowCount !== expectedCount || uniqueIds.size !== expectedCount) {
    throw new Error(`Artefact incomplet: rows=${rowCount}, UUID=${uniqueIds.size}, attendu=${expectedCount}`);
  }
  const calculatedPlanHash = planDigest.digest('hex');
  if (calculatedPlanHash !== manifest.assignmentPlanHash) {
    throw new Error(`Hash contenu ${calculatedPlanHash} != manifeste ${manifest.assignmentPlanHash}`);
  }
  return {
    manifest,
    manifestPath: resolvedManifestPath,
    artifactPath,
    compressedSha256,
    rowCount,
    assignments,
  };
}
