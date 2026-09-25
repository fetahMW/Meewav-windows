import assert from "node:assert/strict";
import test from "node:test";
import {
  createStableAdministrativeZoneId,
  createStableDatasetId,
  createStableZoneId,
  isUuid,
} from "../../scripts/geo/lib/id.mjs";
import { compareAuditToBaseline } from "../../scripts/geo/lib/audit.mjs";

test("stable zone IDs are deterministic opaque UUIDs", () => {
  const first = createStableZoneId("legacy:paris_20e_charonne");
  const second = createStableZoneId("legacy:paris_20e_charonne");
  assert.equal(first, second);
  assert.equal(isUuid(first), true);
  assert.equal(first.includes("paris"), false);
  assert.equal(first.includes("charonne"), false);
});

test("administrative, product and dataset namespaces cannot collide", () => {
  const key = "source:7512057";
  const values = new Set([
    createStableAdministrativeZoneId(key),
    createStableZoneId(key),
    createStableDatasetId(key),
  ]);
  assert.equal(values.size, 3);
});

test("the coupling gate rejects additions but accepts reductions", () => {
  const baseline = { totals: { cityIdLiterals: 10, communeIdLiterals: 20, territorialPrefixLiterals: 5, prefixBranches: 2, total: 37 } };
  const reduction = { totals: { cityIdLiterals: 9, communeIdLiterals: 20, territorialPrefixLiterals: 4, prefixBranches: 2, total: 35 } };
  assert.deepEqual(compareAuditToBaseline(reduction, baseline), []);

  const increase = { totals: { ...baseline.totals, prefixBranches: 3, total: 38 } };
  const regressions = compareAuditToBaseline(increase, baseline);
  assert.equal(regressions.some((entry) => entry.metric === "prefixBranches"), true);
  assert.equal(regressions.some((entry) => entry.metric === "total"), true);
});
