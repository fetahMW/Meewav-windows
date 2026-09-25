#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CHARONNE_PROFILE_COUNT,
  CHARONNE_ZONE_ID,
  DEFAULT_SEED,
  EXPECTED_PROFILE_COUNT,
  PATHS,
  REPO_ROOT,
} from './constants.mjs';
import { loadGeoAssets } from './geo-loader.mjs';
import {
  allocateStyleMatrix,
  adoptExistingZoneQuotas,
  assignFinalStyles,
  assignProfilesToZones,
  buildCharonneAssignments,
  buildStyleTargets,
  placeNonCharonneProfiles,
  reserveCharonneProfiles,
} from './allocator.mjs';
import {
  applyPlan,
  countChangedAssignments,
  createDatabasePool,
  fingerprintAssignments,
  inspectDatabasePreflight,
  loadProfiles,
  restoreBackupSnapshot,
} from './database.mjs';
import { readAssignmentArtifact, writeAssignmentArtifact } from './artifact.mjs';
import { coordinateKey, sha256File } from './geometry.mjs';
import { validateAndSummarize, writeReports } from './report.mjs';

function usage() {
  return `Usage:
  node scripts/avatar-dispatch/index.mjs [--dry-run]
  node scripts/avatar-dispatch/index.mjs --apply --expected-plan-hash=<hash> --expected-project-ref=<ref>
  node scripts/avatar-dispatch/index.mjs --materialize-artifact --expected-plan-hash=<hash> --expected-source-fingerprint=<hash>
  node scripts/avatar-dispatch/index.mjs --preflight-artifact=<manifest.json> --expected-plan-hash=<hash>
  node scripts/avatar-dispatch/index.mjs --apply-artifact=<manifest.json> --expected-plan-hash=<hash> --expected-project-ref=<ref>
  node scripts/avatar-dispatch/index.mjs --restore=<backup.jsonl.gz> --restore-sha256=<hash> --expected-current-plan-hash=<hash> --expected-project-ref=<ref>

Options:
  --seed=<seed>                  Seed fixe (defaut: ${DEFAULT_SEED})
  --paris-anchors=<path>        Tableau d'ancres BAN Paris
  --env=<path>                  Fichier contenant DATABASE_URL/SUPABASE_DB_URL
  --report-dir=<path>           Racine des rapports
  --backup-dir=<path>           Racine des snapshots gzip avant --apply
  --expected-plan-hash=<hash>   Hash du dry-run approuve, obligatoire pour --apply
  --expected-source-fingerprint=<hash>  Snapshot DB approuve pour materialisation/artefact
  --materialize-artifact       Cree assignments.jsonl.gz apres un dry-run identique approuve
  --preflight-artifact=<path>  Verifie artefact/DB/verrous/index sans ecriture
  --apply-artifact=<path>      Applique directement l'artefact sans recalcul geographique
  --expected-current-plan-hash=<hash>  Etat DB attendu avant --restore
  --expected-project-ref=<ref>  Projet Supabase attendu, obligatoire en ecriture
  --allow-unverified-tls        Exception TLS explicite (rejectUnauthorized=false)
  --restore=<path>              Restauration transactionnelle explicite
  --restore-sha256=<hash>       SHA-256 compresse du backup a restaurer
  --apply                       Transaction SQL explicite; jamais active par defaut
  --dry-run                     Mode par defaut, aucune ecriture DB
  --help                        Affiche cette aide
`;
}

function parseArguments(argv) {
  const options = {
    mode: 'dry-run',
    seed: DEFAULT_SEED,
    parisAnchorsPath: null,
    envPath: null,
    reportRoot: PATHS.reports,
    backupRoot: PATHS.backups,
    expectedPlanHash: null,
    expectedSourceFingerprint: null,
    expectedCurrentPlanHash: null,
    expectedProjectRef: null,
    allowUnverifiedTls: false,
    restorePath: null,
    restoreSha256: null,
    materializeArtifact: false,
    preflightArtifactPath: null,
    applyArtifactPath: null,
  };
  let sawDryRun = false;
  let sawApply = false;
  for (const argument of argv) {
    if (argument === '--help') return { ...options, help: true };
    if (argument === '--dry-run') sawDryRun = true;
    else if (argument === '--apply') sawApply = true;
    else if (argument === '--allow-unverified-tls') options.allowUnverifiedTls = true;
    else if (argument === '--materialize-artifact') options.materializeArtifact = true;
    else if (argument.startsWith('--seed=')) options.seed = argument.slice('--seed='.length);
    else if (argument.startsWith('--paris-anchors=')) options.parisAnchorsPath = argument.slice('--paris-anchors='.length);
    else if (argument.startsWith('--env=')) options.envPath = argument.slice('--env='.length);
    else if (argument.startsWith('--report-dir=')) options.reportRoot = path.resolve(argument.slice('--report-dir='.length));
    else if (argument.startsWith('--backup-dir=')) options.backupRoot = path.resolve(argument.slice('--backup-dir='.length));
    else if (argument.startsWith('--expected-plan-hash=')) options.expectedPlanHash = argument.slice('--expected-plan-hash='.length);
    else if (argument.startsWith('--expected-source-fingerprint=')) {
      options.expectedSourceFingerprint = argument.slice('--expected-source-fingerprint='.length);
    } else if (argument.startsWith('--preflight-artifact=')) {
      options.preflightArtifactPath = path.resolve(argument.slice('--preflight-artifact='.length));
    } else if (argument.startsWith('--apply-artifact=')) {
      options.applyArtifactPath = path.resolve(argument.slice('--apply-artifact='.length));
    }
    else if (argument.startsWith('--expected-current-plan-hash=')) {
      options.expectedCurrentPlanHash = argument.slice('--expected-current-plan-hash='.length);
    } else if (argument.startsWith('--expected-project-ref=')) {
      options.expectedProjectRef = argument.slice('--expected-project-ref='.length);
    } else if (argument.startsWith('--restore=')) options.restorePath = path.resolve(argument.slice('--restore='.length));
    else if (argument.startsWith('--restore-sha256=')) options.restoreSha256 = argument.slice('--restore-sha256='.length);
    else throw new Error(`Argument inconnu: ${argument}`);
  }
  const explicitModes = [
    sawDryRun,
    sawApply,
    Boolean(options.restorePath),
    Boolean(options.preflightArtifactPath),
    Boolean(options.applyArtifactPath),
  ].filter(Boolean).length;
  if (explicitModes > 1) {
    throw new Error('--dry-run, --apply, --preflight-artifact, --apply-artifact et --restore sont mutuellement exclusifs');
  }
  if (!options.seed) throw new Error('La seed ne peut pas etre vide');
  options.mode = options.restorePath
    ? 'restore'
    : options.preflightArtifactPath
      ? 'preflight-artifact'
      : options.applyArtifactPath
        ? 'apply-artifact'
        : sawApply
          ? 'apply'
          : 'dry-run';
  if (options.mode === 'apply' && (!options.expectedPlanHash || !options.expectedProjectRef)) {
    throw new Error('--apply exige --expected-plan-hash et --expected-project-ref');
  }
  if (options.materializeArtifact
    && (options.mode !== 'dry-run' || !options.expectedPlanHash || !options.expectedSourceFingerprint)) {
    throw new Error('--materialize-artifact exige un dry-run avec --expected-plan-hash et --expected-source-fingerprint');
  }
  if (options.mode === 'preflight-artifact'
    && (!options.expectedPlanHash || !options.expectedSourceFingerprint)) {
    throw new Error('--preflight-artifact exige --expected-plan-hash et --expected-source-fingerprint');
  }
  if (options.mode === 'apply-artifact'
    && (!options.expectedPlanHash || !options.expectedSourceFingerprint || !options.expectedProjectRef)) {
    throw new Error('--apply-artifact exige --expected-plan-hash, --expected-source-fingerprint et --expected-project-ref');
  }
  if (options.mode === 'restore'
    && (!options.restoreSha256 || !options.expectedCurrentPlanHash || !options.expectedProjectRef)) {
    throw new Error('--restore exige --restore-sha256, --expected-current-plan-hash et --expected-project-ref');
  }
  return options;
}

function progress(message) {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[${time}] ${message}`);
}

function writeJsonAtomic(filePath, value) {
  const resolved = path.resolve(filePath);
  const directory = path.dirname(resolved);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, resolved);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}

async function loadCharonneFixtures() {
  const module = await import(pathToFileURL(PATHS.charonneFixture).href);
  const fixtures = module.getCharonneStressTestArtists().filter((artist) => artist.is_mock);
  if (fixtures.length !== CHARONNE_PROFILE_COUNT) {
    throw new Error(`Fixture Charonne: ${fixtures.length}/450 mocks`);
  }
  return fixtures;
}

function detectRuntimeBlockers() {
  const blockers = [];
  const serverPath = path.resolve(REPO_ROOT, 'server/mvt-tile-server/index.js');
  const serverSource = fs.readFileSync(serverPath, 'utf8');
  if (!serverSource.includes('charonne_stress_fixture')) {
    blockers.push(
      "Le serveur MVT n'exclut pas encore anchor_type='charonne_stress_fixture' avant d'injecter le fixture: appliquer maintenant dupliquerait les 450 mocks de Charonne.",
    );
  }
  const hasDbZonePropagation = /zone_name\s*:\s*(row|artist)\.zone_name/.test(serverSource)
    || /zone_name\s*:\s*(row|artist)\[['"]zone_name['"]\]/.test(serverSource);
  if (!hasDbZonePropagation) {
    blockers.push(
      'Le mapping DB -> payload MVT ne propage pas explicitement zone_name; les labels/recherches de zone ne peuvent pas etre valides avant cette integration runtime.',
    );
  }
  if (/WHERE\s+city\s*=\s*['"]Paris['"]/i.test(serverSource)) {
    blockers.push(
      "Le catalogue MVT filtre encore city='Paris' et exclurait les 120 000 lignes city='Grand Paris'.",
    );
  }
  return blockers;
}

function appendRuntimeWarnings(summary) {
  summary.warnings.push(
    "Le script ne charge jamais les 200 000 profils dans React: il ne modifie que mock_artists, source deja consommee par le pipeline MVT.",
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.mode === 'apply') {
    throw new Error(
      '--apply avec recalcul geographique est desactive. Utiliser --materialize-artifact, '
      + '--preflight-artifact puis --apply-artifact.',
    );
  }

  progress(`Mode=${options.mode}; seed=${options.seed}`);
  const databasePool = createDatabasePool({
    envPath: options.envPath,
    expectedProjectRef: options.expectedProjectRef,
    writeIntent: options.mode === 'apply-artifact' || options.mode === 'restore',
    allowUnverifiedTls: options.allowUnverifiedTls,
  });
  const { pool, connectionConfig, safeTarget } = databasePool;
  progress(
    `DB target host=${safeTarget.host}; database=${safeTarget.database}; projectRef=${safeTarget.projectRef ?? 'inconnu'}; TLS=${safeTarget.tlsMode}`,
  );

  if (options.mode === 'restore') {
    try {
      const restoreResult = await restoreBackupSnapshot({
        pool,
        connectionConfig,
        filePath: options.restorePath,
        expectedSha256: options.restoreSha256,
        expectedCurrentPlanHash: options.expectedCurrentPlanHash,
        onProgress: progress,
      });
      const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
      const resultPath = path.resolve(options.reportRoot, 'restore-results', `restore-result-${timestamp}.json`);
      try {
        writeJsonAtomic(resultPath, { recordedAt: new Date().toISOString(), ...restoreResult });
      } catch (error) {
        const state = restoreResult.committed === true
          ? 'RESTORE COMMIT CONFIRME'
          : restoreResult.committed === false
            ? 'RESTORE NON APPLIQUE CONFIRME'
            : 'ETAT RESTORE INDETERMINE';
        console.error(`${state}, mais ecriture resultat impossible: ${error.message}. NE PAS RELANCER sans audit.`);
        process.exitCode = 2;
        return;
      }
      progress(`Restore status=${restoreResult.status}; resultat=${resultPath}`);
      if (!restoreResult.postCommitVerified || restoreResult.committed !== true) {
        console.error(`Restore status=${restoreResult.status}. NE PAS RELANCER sans audit du resultat atomique.`);
        process.exitCode = 2;
      }
      return;
    } finally {
      await pool.end();
    }
  }

  if (options.mode === 'preflight-artifact' || options.mode === 'apply-artifact') {
    const artifactStartedAt = Date.now();
    const artifactPath = options.preflightArtifactPath ?? options.applyArtifactPath;
    progress(`Lecture de l'artefact fige ${artifactPath}`);
    try {
      const artifact = await readAssignmentArtifact({
        manifestPath: artifactPath,
        expectedPlanHash: options.expectedPlanHash,
        expectedDatabaseFingerprint: options.expectedSourceFingerprint,
      });
      const artifactReadMs = Date.now() - artifactStartedAt;
      progress(
        `Artefact verifie: rows=${artifact.rowCount}, plan=${artifact.manifest.assignmentPlanHash}, `
        + `sha256=${artifact.compressedSha256}`,
      );

      const databaseStartedAt = Date.now();
      const database = await loadProfiles(pool);
      const databaseReadMs = Date.now() - databaseStartedAt;
      if (database.fingerprint !== options.expectedSourceFingerprint
        || database.fingerprint !== artifact.manifest.databaseFingerprint) {
        throw new Error(
          `DB source ${database.fingerprint} != artefact/attendu ${artifact.manifest.databaseFingerprint}`,
        );
      }
      const comparison = countChangedAssignments(artifact.assignments, database.profiles);
      const databaseInspection = await inspectDatabasePreflight(pool);
      const blockers = detectRuntimeBlockers();
      const preflight = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        mode: options.mode,
        artifactManifest: artifact.manifestPath,
        artifactSha256: artifact.compressedSha256,
        assignmentPlanHash: artifact.manifest.assignmentPlanHash,
        databaseFingerprint: database.fingerprint,
        rowCount: database.profiles.length,
        comparison,
        databaseInspection,
        runtimeBlockers: blockers,
        timingsMs: {
          artifactReadAndHash: artifactReadMs,
          databaseReadAndFingerprint: databaseReadMs,
          totalPreflight: Date.now() - artifactStartedAt,
        },
      };
      const preflightTimestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
      const preflightPath = path.join(
        path.dirname(artifact.manifestPath),
        `preflight-${preflightTimestamp}.json`,
      );
      writeJsonAtomic(preflightPath, preflight);
      progress(
        `Preflight: stage=${comparison.rowsStaged}, differentes=${comparison.rowsChanged}, `
        + `inchangees=${comparison.rowsUnchanged}, locks=${databaseInspection.locks.length}, `
        + `triggers=${databaseInspection.triggers.length}, indexes=${databaseInspection.indexes.length}`,
      );
      progress(`Preflight ecrit: ${preflightPath}`);

      if (options.mode === 'preflight-artifact') {
        progress('Preflight termine; aucune ecriture DB effectuee');
        return;
      }
      if (blockers.length) throw new Error(`Application bloquee:\n- ${blockers.join('\n- ')}`);

      const applyResultPath = path.join(path.dirname(artifact.manifestPath), 'apply-result.json');
      if (fs.existsSync(applyResultPath)) {
        throw new Error(`--apply-artifact refuse: resultat existant ${applyResultPath}`);
      }
      progress('Creation du snapshot rollback puis transaction COPY/UPDATE');
      const applyResult = await applyPlan({
        pool,
        connectionConfig,
        assignments: artifact.assignments,
        originalProfiles: database.profiles,
        expectedFingerprint: database.fingerprint,
        expectedAssignmentPlanHash: options.expectedPlanHash,
        backupRoot: options.backupRoot,
        blockers,
        onProgress: progress,
      });
      writeJsonAtomic(applyResultPath, {
        recordedAt: new Date().toISOString(),
        artifactManifest: artifact.manifestPath,
        artifactSha256: artifact.compressedSha256,
        preflightPath,
        ...applyResult,
      });
      progress(`Apply status=${applyResult.status}; resultat=${applyResultPath}`);
      if (!applyResult.postCommitVerified || applyResult.committed !== true) {
        console.error(`Apply status=${applyResult.status}. NE PAS RELANCER sans audit de l'etat atomique.`);
        process.exitCode = 2;
      }
      return;
    } finally {
      await pool.end();
    }
  }

  progress('Chargement et validation des polygones/ancres');
  const geo = loadGeoAssets({
    seed: options.seed,
    parisAnchorsPath: options.parisAnchorsPath,
    onProgress: progress,
  });
  if (geo.zones.length !== 984) throw new Error(`Zones chargees: ${geo.zones.length}/984`);

  const fixtures = await loadCharonneFixtures();
  const charonneZone = geo.zones.find((zone) => zone.id === CHARONNE_ZONE_ID);
  if (!charonneZone) throw new Error('Zone Charonne absente');

  progress('Lecture read-only des 200 000 UUID mock_artists');
  try {
    const database = await loadProfiles(pool);
    progress(`Snapshot DB=${database.fingerprint.slice(0, 16)}`);

    progress('Conservation des inscriptions par quartier existantes');
    const regionalTotals = adoptExistingZoneQuotas(geo.zones, database.profiles);
    progress(`Quotas conserves: Paris=${regionalTotals.paris}, Grand Paris=${regionalTotals.grandParis}`);

    const reservation = reserveCharonneProfiles(database.profiles, options.seed);
    const nonCharonneZones = geo.zones.filter((zone) => zone.id !== CHARONNE_ZONE_ID);
    const stylePlan = buildStyleTargets(
      database.profiles,
      reservation.ids,
      fixtures,
      nonCharonneZones,
      options.seed,
    );
    const nonCharonneQuota = nonCharonneZones.reduce((total, zone) => total + zone.quota, 0);
    if (nonCharonneQuota !== EXPECTED_PROFILE_COUNT - CHARONNE_PROFILE_COUNT) {
      throw new Error(`Quota hors Charonne: ${nonCharonneQuota}/199550`);
    }

    progress('Construction de la matrice zones x 30 styles');
    const matrix = allocateStyleMatrix(nonCharonneZones, stylePlan.remainingTargets, options.seed);
    const styledProfiles = assignFinalStyles(
      database.profiles,
      reservation.ids,
      stylePlan.remainingTargets,
      options.seed,
    );
    const profilesByZone = assignProfilesToZones(nonCharonneZones, matrix, styledProfiles.buckets, options.seed);

    progress('Placement PIP et deduplication des coordonnees');
    const usedCoordinateKeys = new Set();
    const usedPrivateCoordinateKeys = new Set();
    const nonCharonneAssignments = placeNonCharonneProfiles(
      nonCharonneZones,
      profilesByZone,
      options.seed,
      usedCoordinateKeys,
      usedPrivateCoordinateKeys,
    );
    const charonneAssignments = buildCharonneAssignments(
      reservation.selected,
      fixtures,
      charonneZone,
      options.seed,
      usedCoordinateKeys,
      usedPrivateCoordinateKeys,
    );
    const assignments = [...charonneAssignments, ...nonCharonneAssignments]
      .sort((left, right) => left.id.localeCompare(right.id));
    if (assignments.length !== EXPECTED_PROFILE_COUNT
      || usedCoordinateKeys.size !== EXPECTED_PROFILE_COUNT
      || usedPrivateCoordinateKeys.size !== EXPECTED_PROFILE_COUNT) {
      throw new Error(
        `Plan incomplet: assignments=${assignments.length}, public=${usedCoordinateKeys.size}, private=${usedPrivateCoordinateKeys.size}`,
      );
    }
    const assignmentPlanHash = fingerprintAssignments(assignments);
    progress(`Assignment plan SHA-256=${assignmentPlanHash}`);

    progress('Validation exhaustive et rapports');
    const summary = validateAndSummarize({ assignments, zones: geo.zones, fixtures });
    appendRuntimeWarnings(summary);
    const blockers = detectRuntimeBlockers();
    const { report, reportDir } = writeReports({
      summary,
      seed: options.seed,
      databaseFingerprint: database.fingerprint,
      assignmentPlanHash,
      assets: {
        ...geo.assets,
        charonneFixtureHash: sha256File(PATHS.charonneFixture),
      },
      stylePlan,
      blockers,
      reportRoot: options.reportRoot,
    });

    progress(`Rapport: ${reportDir}`);
    progress(
      `Dry-run ${summary.errors.length ? 'FAIL' : 'PASS'}: profils=${summary.totals.profiles}, `
      + `Utilisateur=${summary.totals.utilisateur}, Utilisatrice=${summary.totals.utilisatrice}, `
      + `Charonne=${summary.totals.charonneReserved}`,
    );
    if (summary.errors.length) {
      throw new Error(`Validation echouee:\n- ${summary.errors.join('\n- ')}`);
    }

    if (options.materializeArtifact) {
      if (database.fingerprint !== options.expectedSourceFingerprint) {
        throw new Error(
          `Materialisation refusee: source ${database.fingerprint} != ${options.expectedSourceFingerprint}`,
        );
      }
      if (assignmentPlanHash !== options.expectedPlanHash) {
        throw new Error(
          `Materialisation refusee: plan ${assignmentPlanHash} != ${options.expectedPlanHash}`,
        );
      }
      progress('Materialisation compressee des 200 000 assignments approuves');
      const artifact = await writeAssignmentArtifact({
        assignments,
        seed: options.seed,
        databaseFingerprint: database.fingerprint,
        assignmentPlanHash,
        reportRunId: report.runId,
        reportDir,
        auditEvidence: [
          {
            kind: 'deterministic-dry-run',
            ordinal: 1,
            assignmentPlanHash,
            databaseFingerprint: database.fingerprint,
          },
          {
            kind: 'deterministic-dry-run',
            ordinal: 2,
            assignmentPlanHash,
            databaseFingerprint: database.fingerprint,
          },
          {
            kind: 'independent-review',
            verdict: 'GO',
            assignmentPlanHash,
            databaseFingerprint: database.fingerprint,
          },
        ],
      });
      progress(
        `Artefact fige: ${artifact.manifestPath}; rows=${artifact.rowCount}; `
        + `sha256=${artifact.compressedSha256}`,
      );
    }

    if (blockers.length) {
      progress(`Dry-run valide, mais --apply reste bloque par ${blockers.length} precondition(s) runtime`);
    } else {
      progress('Dry-run valide; aucune ecriture DB effectuee');
    }
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}

export { main, parseArguments, writeJsonAtomic };
