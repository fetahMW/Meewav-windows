import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolNames = [
  "apply-france-city-wave-plan.mjs",
  "validate-france-city-wave-audits.mjs",
];

function createBatch(count, wave) {
  const cities = Array.from({ length: count }, (_, index) => {
    const communeCode = String(10000 + index);
    const id = `batch_city_${index + 1}`;
    const name = `Ville Test ${index + 1}`;
    const sourceId = `${communeCode}0101`;
    return {
      planned: {
        rank: index + 1,
        id,
        name,
        communeCode,
        population: count - index,
        sourceFeatureCount: 1,
        sourceIris: [{ id: sourceId, label: "Centre Historique", type: "H" }],
      },
      audited: {
        id,
        name,
        code: communeCode,
        status: "ready",
        officialLabels: [{ sourceId, label: "Centre Historique" }],
        guideAlphaRule: {
          type: "explicit",
          operations: [{
            id: `${id}-accept-centre-historique`,
            type: "accept",
            sourceId,
            expectedLabel: "Centre Historique",
          }],
        },
      },
    };
  });
  return {
    plan: {
      schemaVersion: 1,
      wave,
      totals: { cities: count },
      cities: cities.map(({ planned }) => planned),
    },
    audit: {
      schemaVersion: 1,
      wave,
      cities: cities.map(({ audited }) => audited),
    },
  };
}

async function createToolSandbox(batch) {
  const sandbox = await mkdtemp(path.join(tmpdir(), "meewav-wave-tools-"));
  await Promise.all([
    mkdir(path.join(sandbox, "scripts"), { recursive: true }),
    mkdir(path.join(sandbox, "fixtures"), { recursive: true }),
    mkdir(path.join(sandbox, "geo", "catalog"), { recursive: true }),
    mkdir(path.join(sandbox, "geo", "work"), { recursive: true }),
  ]);
  await Promise.all(toolNames.map((toolName) => copyFile(
    path.join(projectRoot, "scripts", toolName),
    path.join(sandbox, "scripts", toolName),
  )));
  await Promise.all([
    writeFile(path.join(sandbox, "fixtures", "plan.json"), `${JSON.stringify(batch.plan)}\n`, "utf8"),
    writeFile(path.join(sandbox, "fixtures", "audit.json"), `${JSON.stringify(batch.audit)}\n`, "utf8"),
    writeFile(path.join(sandbox, "geo", "catalog", "france-city-iris.json"), '{"cities":[]}\n', "utf8"),
    writeFile(path.join(sandbox, "geo", "catalog", "france-city-curation.json"), `${JSON.stringify({
      sources: [
        { id: "ign-insee-contours-iris-2026" },
        { id: "ign-geoplateforme-toponymy-2026" },
        { id: "guide-alpha-editorial-recovery-2026-07-14" },
      ],
      cities: [],
    })}\n`, "utf8"),
  ]);
  return sandbox;
}

async function runTool(sandbox, toolName, wave) {
  return execFileAsync(process.execPath, [
    path.join(sandbox, "scripts", toolName),
    `--wave=${wave}`,
    "--plan=fixtures/plan.json",
    "--audit=fixtures/audit.json",
  ], { cwd: sandbox, maxBuffer: 10 * 1024 * 1024 });
}

async function captureFailure(promise) {
  try {
    await promise;
    assert.fail("the wave tool should have rejected the invalid contract");
  } catch (error) {
    return `${error.stderr ?? ""}\n${error.stdout ?? ""}\n${error.message ?? ""}`;
  }
}

test("wave validator and applicator accept mini and 500+ batches through --plan", async () => {
  for (const [count, wave] of [[1, 9101], [501, 9102]]) {
    const sandbox = await createToolSandbox(createBatch(count, wave));
    try {
      const validation = await runTool(sandbox, "validate-france-city-wave-audits.mjs", wave);
      assert.match(validation.stdout, new RegExp(`${count} cities, ${count} official IRIS`));

      const application = await runTool(sandbox, "apply-france-city-wave-plan.mjs", wave);
      assert.match(application.stdout, new RegExp(`Applied France wave ${wave}: ${count} cities`));
      const catalog = JSON.parse(await readFile(
        path.join(sandbox, "geo", "catalog", "france-city-iris.json"),
        "utf8",
      ));
      assert.equal(catalog.cities.length, count);
      assert.equal(new Set(catalog.cities.map((city) => city.id)).size, count);
      assert.equal(new Set(catalog.cities.map((city) => city.communeCode)).size, count);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  }
});

test("wave applicator preserves exact semantic evidence and its real source references", async () => {
  const wave = 9150;
  const batch = createBatch(1, wave);
  const plannedCity = batch.plan.cities[0];
  const auditedCity = batch.audit.cities[0];
  plannedCity.sourceIris[0].label = "Nord";
  auditedCity.officialLabels[0].label = "Nord";
  auditedCity.guideAlphaRule = {
    type: "curation",
    sourceRefs: ["guide-alpha-semantic-resolver-v1"],
    operations: [{
      id: "batch-city-1-nord-rename",
      type: "rename",
      sourceId: plannedCity.sourceIris[0].id,
      expectedLabel: "Nord",
      label: "Rue des Lilas",
      evidenceRefs: [
        "ign-insee-contours-iris-2026",
        "ign-bdtopo-named-roads-2026",
        "guide-alpha-semantic-resolver-v1",
      ],
      containmentRule: "strict_point_in_exact_source_polygon",
      containedEvidence: [{
        name: "Rue des Lilas",
        sourceFeatureId: "road-1",
        coordinates: [1.25, 45.5],
        strictContainmentVerified: true,
      }],
      selectionProof: { uniqueFullPrecisionWinner: true },
      topology: { connected: true },
      rationale: "Exact test proof.",
    }],
  };
  batch.audit.evidenceSources = [
    { id: "ign-insee-contours-iris-2026", provider: "IGN / INSEE" },
    { id: "ign-bdtopo-named-roads-2026", provider: "IGN BD TOPO" },
    { id: "guide-alpha-semantic-resolver-v1", provider: "Meewav" },
  ];

  const sandbox = await createToolSandbox(batch);
  try {
    await runTool(sandbox, "validate-france-city-wave-audits.mjs", wave);
    await runTool(sandbox, "apply-france-city-wave-plan.mjs", wave);
    const curation = JSON.parse(await readFile(
      path.join(sandbox, "geo", "catalog", "france-city-curation.json"),
      "utf8",
    ));
    const applied = curation.cities[0];
    const operation = applied.operations[0];
    assert.deepEqual(applied.sourceRefs, [
      "guide-alpha-semantic-resolver-v1",
      "ign-insee-contours-iris-2026",
      "ign-bdtopo-named-roads-2026",
    ]);
    assert.deepEqual(operation.evidenceRefs, auditedCity.guideAlphaRule.operations[0].evidenceRefs);
    assert.equal(operation.containmentRule, "strict_point_in_exact_source_polygon");
    assert.deepEqual(operation.containedEvidence, auditedCity.guideAlphaRule.operations[0].containedEvidence);
    assert.deepEqual(operation.selectionProof, { uniqueFullPrecisionWinner: true });
    assert.deepEqual(operation.topology, { connected: true });
    assert.deepEqual(
      curation.sources.slice(-2).map((source) => source.id),
      ["ign-bdtopo-named-roads-2026", "guide-alpha-semantic-resolver-v1"],
    );
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("wave tools reject an empty plan and a dishonest declared size", async () => {
  for (const [mutate, expected] of [
    [
      (batch) => {
        batch.plan.cities = [];
        batch.plan.totals.cities = 0;
        batch.audit.cities = [];
      },
      /must contain at least one planned city/,
    ],
    [
      (batch) => {
        batch.plan.totals.cities = 2;
      },
      /declares 2 cities but contains 1/,
    ],
  ]) {
    const batch = createBatch(1, 9201);
    mutate(batch);
    const sandbox = await createToolSandbox(batch);
    try {
      for (const toolName of toolNames) {
        assert.match(await captureFailure(runTool(sandbox, toolName, 9201)), expected);
      }
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  }
});

test("wave tools require unique plan identities and exact unique audit coverage", async () => {
  for (const [mutate, expected] of [
    [
      (batch) => {
        batch.plan.cities[1].id = batch.plan.cities[0].id;
      },
      /duplicates planned city id/,
    ],
    [
      (batch) => {
        batch.plan.cities[1].communeCode = batch.plan.cities[0].communeCode;
      },
      /duplicates planned commune code/,
    ],
    [
      (batch) => {
        batch.audit.cities[1].id = batch.audit.cities[0].id;
      },
      /duplicates audited city id/,
    ],
    [
      (batch) => {
        batch.audit.cities[1].code = batch.audit.cities[0].code;
      },
      /duplicates audited commune code/,
    ],
    [
      (batch) => {
        batch.audit.cities.pop();
      },
      /has 1\/2 audited cities/,
    ],
  ]) {
    const batch = createBatch(2, 9301);
    mutate(batch);
    const sandbox = await createToolSandbox(batch);
    try {
      for (const toolName of toolNames) {
        assert.match(await captureFailure(runTool(sandbox, toolName, 9301)), expected);
      }
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  }
});
