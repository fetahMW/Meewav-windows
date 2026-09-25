import fs from 'node:fs';
import path from 'node:path';

import { PATHS, REPO_ROOT } from './constants.mjs';

const OUTPUT_PATH = path.resolve(REPO_ROOT, '.codex-artifacts/grand-paris-commune-presentation-audit.json');
const CONTROLLER_PATH = path.resolve(
  REPO_ROOT,
  'src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts',
);
const STYLE_PATH = path.resolve(REPO_ROOT, 'src/features/globe/maplibre/meewavMapLibreStyle.ts');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ringArea(ring) {
  let total = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    total += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
  }
  return Math.abs(total) / 2;
}

function geometryArea(geometry) {
  const polygonArea = (polygon) => (
    ringArea(polygon[0]) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0)
  );
  return geometry.type === 'Polygon'
    ? polygonArea(geometry.coordinates)
    : geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

function main() {
  const communes = readJson(PATHS.grandParisCommunes).features;
  const subzones = readJson(PATHS.grandParisSubzones).features;
  const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const styleSource = fs.readFileSync(STYLE_PATH, 'utf8');
  const communeByCode = new Map(communes.map((feature) => [String(feature.properties?.code), feature]));
  const subzonesByParent = new Map();
  const zoneIds = new Set();
  const duplicateZoneIds = [];
  const orphanZoneIds = [];

  for (const feature of subzones) {
    const zoneId = String(feature.properties?.zoneId ?? '');
    const parentCode = String(feature.properties?.parentCode ?? '');
    if (zoneIds.has(zoneId)) duplicateZoneIds.push(zoneId);
    zoneIds.add(zoneId);
    if (!communeByCode.has(parentCode)) orphanZoneIds.push(zoneId);
    const rows = subzonesByParent.get(parentCode) ?? [];
    rows.push(feature);
    subzonesByParent.set(parentCode, rows);
  }

  const communeRows = communes.map((commune) => {
    const code = String(commune.properties?.code ?? '');
    const zones = subzonesByParent.get(code) ?? [];
    const parentArea = geometryArea(commune.geometry);
    const subzoneArea = zones.reduce((sum, zone) => sum + geometryArea(zone.geometry), 0);
    return {
      code,
      label: commune.properties?.label ?? code,
      subzoneCount: zones.length,
      rawCoverageRatio: parentArea > 0 ? Number((subzoneArea / parentArea).toFixed(6)) : 0,
    };
  });
  const missingParents = communeRows.filter((row) => row.subzoneCount === 0);
  const sourceContracts = {
    adaptiveCenteredFly: controllerSource.includes('getGrandParisFocusedCommuneFlyTarget'),
    persistentActiveOutline: styleSource.includes('GRAND_PARIS_ACTIVE_OUTLINE_LINE_LAYER_ID')
      && /GRAND_PARIS_ACTIVE_OUTLINE_LINE_LAYER_ID[\s\S]*?maxzoom:\s*24/.test(styleSource),
    parentBackdropForIrisGaps: controllerSource.includes('activeParentBackdrop'),
    distinctFocusedColors: controllerSource.includes('usedFocusedColors'),
    cameraFrameCollectionGuard: controllerSource.includes('this.baseRenderZoneScopeKey === scopeKey'),
    physicalScreenCenterReset: controllerSource.includes('this.map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 })'),
  };
  const failures = [
    ...(communes.length === 123 ? [] : [`expected 123 communes, got ${communes.length}`]),
    ...(subzones.length === 904 ? [] : [`expected 904 subzones, got ${subzones.length}`]),
    ...duplicateZoneIds.map((zoneId) => `duplicate zoneId ${zoneId}`),
    ...orphanZoneIds.map((zoneId) => `orphan zoneId ${zoneId}`),
    ...missingParents.map((row) => `commune without subzones ${row.code}`),
    ...Object.entries(sourceContracts).filter(([, passed]) => !passed).map(([name]) => `missing source contract ${name}`),
  ];
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      communeCount: communes.length,
      subzoneCount: subzones.length,
      missingParentCount: missingParents.length,
      orphanZoneCount: orphanZoneIds.length,
      duplicateZoneIdCount: duplicateZoneIds.length,
      minSubzonesPerCommune: Math.min(...communeRows.map((row) => row.subzoneCount)),
      maxSubzonesPerCommune: Math.max(...communeRows.map((row) => row.subzoneCount)),
      sourceContractsPassed: Object.values(sourceContracts).filter(Boolean).length,
      sourceContractsTotal: Object.keys(sourceContracts).length,
      passed: failures.length === 0,
    },
    sourceContracts,
    knownDataVintageCompensations: communeRows
      .filter((row) => row.rawCoverageRatio < 0.95)
      .map((row) => ({ ...row, compensatedByParentBackdrop: true })),
    failures,
    communes: communeRows,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ summary: report.summary, output: OUTPUT_PATH }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main();
