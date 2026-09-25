import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const registryPath = fileURLToPath(new URL('./candidates.json', import.meta.url));
const windowsEvidencePath = fileURLToPath(new URL('./windows-evidence.json', import.meta.url));
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const windowsEvidence = JSON.parse(await readFile(windowsEvidencePath, 'utf8'));

const expectedIds = [
  'spoton',
  'openvoxtuner',
  'graillon-3-free',
  'qpitch',
  'silvertune',
  'autotune-2026',
  'opendaw-autotune',
  'libsonare',
  'autotone-alex-crist',
  'autotalent',
  'talentedhack',
  'x42-fat1',
  'mxtune',
  'musicai-ruvnet',
  'loukai',
  'bert-apc'
];

const allowedStatuses = new Set([
  'TESTÉ',
  'TESTÉ_PARTIELLEMENT',
  'BLOQUÉ_PAR_ENVIRONNEMENT',
  'BLOQUÉ_PAR_LICENCE_OU_ACTIVATION',
  'NON_TEMPS_RÉEL_CONFIRMÉ',
  'NON_REPRODUCTIBLE'
]);

assert.equal(registry.schemaVersion, 1, 'schemaVersion must be 1');
assert.match(registry.resolvedAt, /^\d{4}-\d{2}-\d{2}$/u, 'resolvedAt must be an ISO date');
assert.equal(registry.scope.productionApproved, false, 'the registry must not approve production');
assert.equal(registry.candidates.length, 16, 'exactly sixteen mandatory candidates are required');
assert.deepEqual(
  registry.candidates.map(({ id }) => id),
  expectedIds,
  'candidate IDs/order must match the master prompt'
);

const ids = new Set();
const ordinals = new Set();

for (const candidate of registry.candidates) {
  assert(!ids.has(candidate.id), `duplicate candidate id: ${candidate.id}`);
  assert(!ordinals.has(candidate.ordinal), `duplicate ordinal: ${candidate.ordinal}`);
  ids.add(candidate.id);
  ordinals.add(candidate.ordinal);

  assert.equal(candidate.ordinal, expectedIds.indexOf(candidate.id) + 1, `${candidate.id}: bad ordinal`);
  assert(candidate.name && candidate.vendor, `${candidate.id}: name/vendor required`);
  assert.match(candidate.officialUrl, /^https?:\/\//u, `${candidate.id}: official URL required`);
  assert(allowedStatuses.has(candidate.status), `${candidate.id}: invalid status ${candidate.status}`);
  assert.equal(candidate.resolution.resolvedAt, registry.resolvedAt, `${candidate.id}: stale resolution date`);
  assert(candidate.resolution.version, `${candidate.id}: resolved version or explicit unreleased marker required`);
  if (candidate.resolution.commitSha !== null) {
    assert.match(candidate.resolution.commitSha, /^[0-9a-f]{40}$/u, `${candidate.id}: invalid commit SHA`);
  }

  for (const field of ['code', 'binaryOrModel', 'redistribution', 'commercialIntegration']) {
    assert(candidate.licensing[field], `${candidate.id}: licensing.${field} required`);
  }
  assert(Array.isArray(candidate.availability.formats) && candidate.availability.formats.length > 0, `${candidate.id}: formats required`);
  assert(Array.isArray(candidate.availability.os) && candidate.availability.os.length > 0, `${candidate.id}: OS required`);
  assert(candidate.installation.method, `${candidate.id}: installation method required`);
  assert(candidate.installation.localState, `${candidate.id}: local state required`);
  assert(candidate.meewavLoading.method, `${candidate.id}: MeeWav loading method required`);
  assert(Object.hasOwn(candidate.audioContract, 'sampleRatesHz'), `${candidate.id}: sample rates field required`);
  assert(Object.hasOwn(candidate.audioContract, 'bufferSizesSamples'), `${candidate.id}: buffer sizes field required`);
  assert(Object.hasOwn(candidate.audioContract, 'declaredLatency'), `${candidate.id}: declared latency field required`);
  assert(Object.hasOwn(candidate.audioContract, 'measuredLatency'), `${candidate.id}: measured latency field required`);
  assert(Array.isArray(candidate.testEvidence), `${candidate.id}: testEvidence must be an array`);
  assert(Array.isArray(candidate.sources) && candidate.sources.length > 0, `${candidate.id}: source evidence required`);

  for (const source of candidate.sources) {
    assert(source.url && source.checkedAt && source.supports, `${candidate.id}: incomplete source record`);
    assert.equal(source.checkedAt, registry.resolvedAt, `${candidate.id}: source date mismatch`);
  }

  if (candidate.status === 'TESTÉ') {
    assert(
      candidate.testEvidence.some((evidence) => evidence.realAudioSignalProcessed === true),
      `${candidate.id}: TESTÉ requires explicit real-audio evidence`
    );
  }

  if (candidate.status === 'TESTÉ_PARTIELLEMENT') {
    assert(candidate.testEvidence.length > 0, `${candidate.id}: partial status requires evidence`);
  }

  if (candidate.status !== 'TESTÉ') {
    assert(candidate.blockingReason, `${candidate.id}: non-final status requires a precise reason`);
  }

  if (candidate.audioContract.measuredLatency !== null) {
    assert.equal(typeof candidate.audioContract.measuredLatency, 'object', `${candidate.id}: measured latency must carry structured evidence`);
    assert(candidate.audioContract.measuredLatency.method, `${candidate.id}: latency measurement method required`);
  }
}

assert.deepEqual([...ordinals].sort((a, b) => a - b), Array.from({ length: 16 }, (_, index) => index + 1));

const evidenceById = new Map(windowsEvidence.candidates.map((candidate) => [candidate.id, candidate]));
const builtCandidateContracts = [
  {
    registryId: 'spoton',
    evidenceId: 'spoton-1.1.2',
    artifactType: 'VST3',
    revision: 'installed VST3 1.1.2 / ABCDEF019182FAEB536978744C737733'
  },
  {
    registryId: 'graillon-3-free',
    evidenceId: 'graillon-3-free-3.2.0',
    artifactType: 'VST3',
    revision: 'installed VST3 3.2.0 / 0B20BA920CE0B1456E62754133317340'
  },
  {
    registryId: 'openvoxtuner',
    evidenceId: 'openvoxtuner-v0.1.67',
    artifactType: 'VST3',
    revision: 'v0.1.67 / 5570e8a6bf8e686c33c7971563c3d757f9c394d6'
  },
  {
    registryId: 'qpitch',
    evidenceId: 'qpitch-v1.3.1',
    artifactType: 'VST3',
    revision: 'v1.3.1 / a0a95f103d2715650462344c1be3dfad4e2e9290'
  },
  {
    registryId: 'silvertune',
    evidenceId: 'silvertune-companion-v0.4.0',
    artifactType: 'Companion executable (primary build, not launched)',
    revision: 'companion-v0.4.0 / 7b9be1fb65e71eff2f274ddafbd12868c27bc171'
  }
];

for (const contract of builtCandidateContracts) {
  const candidate = registry.candidates.find(({ id }) => id === contract.registryId);
  const evidence = evidenceById.get(contract.evidenceId);
  const artifact = evidence?.artifacts?.find(({ type }) => type === contract.artifactType);
  assert(candidate && evidence && artifact, `${contract.registryId}: matching Windows evidence is required`);
  assert.equal(candidate.resolution.testedRevision, contract.revision, `${contract.registryId}: tested revision mismatch`);
  assert(candidate.installation.paths.includes(artifact.path), `${contract.registryId}: evidence path is attached to the wrong candidate`);
  assert.equal(candidate.installation.artifactSha256, artifact.sha256, `${contract.registryId}: artifact hash mismatch`);
}

const statusCounts = registry.candidates.reduce((counts, candidate) => {
  counts[candidate.status] = (counts[candidate.status] ?? 0) + 1;
  return counts;
}, {});

console.log(`Candidate registry valid: ${registry.candidates.length} candidates resolved at ${registry.resolvedAt}`);
console.log(JSON.stringify(statusCounts, null, 2));
