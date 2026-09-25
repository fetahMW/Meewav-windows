import assert from "node:assert/strict";
import test from "node:test";
import { applyCurationOverride, createCurationTemplate } from "../../scripts/geo/lib/curate.mjs";
import { convertExistingGroup } from "../../scripts/geo/lib/migrate-existing.mjs";

const rootDirectory = process.cwd();

test("exports a commune curation template without frontend identifiers", async () => {
  const conversion = await convertExistingGroup(rootDirectory, "trappes");
  const template = createCurationTemplate(conversion.dataset, "78621");
  assert.equal(template.scope, "trappes");
  assert.equal(template.communeName, "Trappes");
  assert.equal(template.decisions.length, 12);
  assert.ok(template.decisions.every((decision) => decision.operation === "update"));
});

test("renames and merges zones into a validated deterministic dataset", async () => {
  const conversion = await convertExistingGroup(rootDirectory, "trappes");
  const [first, second, third] = conversion.dataset.musicZones;
  const override = {
    schemaVersion: 1,
    scope: "trappes",
    sourceVintage: "2015",
    decisions: [
      {
        operation: "update",
        zoneId: third.zoneId,
        displayName: "Zone renommée",
        aliases: [third.displayName, "Nom local"],
        labelPoint: third.labelPoint,
        cameraOverride: { pitch: 58, bearing: -12 },
        status: "validated",
      },
      {
        operation: "merge",
        decisionId: "test-merge-centre",
        zoneIds: [first.zoneId, second.zoneId],
        displayName: "Centre réuni",
        aliases: [first.displayName, second.displayName],
        status: "validated",
      },
    ],
  };
  const result = applyCurationOverride(conversion.dataset, override, { version: "trappes-curated-test" });
  assert.equal(result.validation.valid, true);
  assert.equal(result.dataset.musicZones.length, 11);
  assert.equal(result.dataset.musicZones.find((zone) => zone.zoneId === third.zoneId).displayName, "Zone renommée");
  const merged = result.dataset.musicZones.find((zone) => zone.displayName === "Centre réuni");
  assert.equal(merged.sourceType, "merged");
  assert.equal(merged.quality, "curated");
  assert.equal(merged.sourceZoneIds.length, 2);
  assert.equal(
    applyCurationOverride(conversion.dataset, override).dataset.musicZones.find((zone) => zone.displayName === "Centre réuni").zoneId,
    merged.zoneId,
  );
  assert.equal(conversion.dataset.musicZones.length, 12);
});
