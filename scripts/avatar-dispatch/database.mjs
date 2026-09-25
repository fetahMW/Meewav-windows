import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip, createGzip } from 'node:zlib';

import {
  CHARONNE_PROFILE_COUNT,
  CHARONNE_ZONE_ID,
  EXPECTED_PROFILE_COUNT,
  PARIS_PROFILE_TARGET,
  PATHS,
  REPO_ROOT,
  STYLE_IDS,
  USER_STYLE_TARGET,
} from './constants.mjs';

const serverRequire = createRequire(path.resolve(REPO_ROOT, 'server/mvt-tile-server/package.json'));
const { Pool } = serverRequire('pg');
const { from: copyFrom } = serverRequire('pg-copy-streams');
const dotenv = serverRequire('dotenv');

export const TEMP_COLUMNS = Object.freeze([
  ['id', 'uuid'],
  ['city', 'text'],
  ['lat', 'double precision'],
  ['lng', 'double precision'],
  ['private_mock_lat', 'double precision'],
  ['private_mock_lng', 'double precision'],
  ['public_display_lat', 'double precision'],
  ['public_display_lng', 'double precision'],
  ['instrument', 'text'],
  ['avatar_id', 'text'],
  ['display_name', 'text'],
  ['profile_slug', 'text'],
  ['artist_rank', 'text'],
  ['rank_score', 'integer'],
  ['render_rank', 'integer'],
  ['district', 'text'],
  ['zone_name', 'text'],
  ['address_label', 'text'],
  ['district_id', 'text'],
  ['district_name', 'text'],
  ['city_id', 'text'],
  ['city_name', 'text'],
  ['anchor_id', 'text'],
  ['anchor_type', 'text'],
  ['address_id', 'text'],
  ['mock_address_id', 'text'],
  ['source_quality', 'text'],
  ['placement_quality', 'text'],
  ['mock_seed_version', 'text'],
  ['country_cluster_id', 'text'],
  ['city_cluster_id', 'text'],
  ['macro_cluster_id', 'text'],
  ['mid_cluster_id', 'text'],
  ['local_cluster_id', 'text'],
  ['micro_cluster_id', 'text'],
  ['nano_cluster_id', 'text'],
  ['density_tier', 'text'],
  ['density_weight', 'double precision'],
  ['avatar_url', 'text'],
]);

export const PROFILE_COLUMN_DEFINITIONS = Object.freeze([
  ...TEMP_COLUMNS,
  ['identity_seed', 'text'],
]);
export const PROFILE_COLUMNS = Object.freeze(PROFILE_COLUMN_DEFINITIONS.map(([name]) => name));
export const TEMP_COLUMN_NAMES = Object.freeze(TEMP_COLUMNS.map(([name]) => name));

export const ASSIGNMENT_VALUE_FIELDS = Object.freeze([
  'id',
  'city',
  'lat',
  'lng',
  'privateLat',
  'privateLng',
  'publicLat',
  'publicLng',
  'instrument',
  'avatarId',
  'displayName',
  'profileSlug',
  'artistRank',
  'rankScore',
  'renderRank',
  'district',
  'zoneName',
  'addressLabel',
  'districtId',
  'districtName',
  'cityId',
  'cityName',
  'anchorId',
  'anchorType',
  'addressId',
  'addressId',
  'sourceQuality',
  'placementQuality',
  'mockSeedVersion',
  'countryClusterId',
  'cityClusterId',
  'macroClusterId',
  'midClusterId',
  'localClusterId',
  'microClusterId',
  'nanoClusterId',
  'densityTier',
  'densityWeight',
  'avatarUrl',
]);

if (ASSIGNMENT_VALUE_FIELDS.length !== TEMP_COLUMNS.length) {
  throw new Error('Schema assignment/temporaire incoherent');
}

function parseEnvFile(filePath) {
  return dotenv.parse(fs.readFileSync(filePath));
}

function resolveEnvironment(explicitEnvPath) {
  if (explicitEnvPath) {
    const resolved = path.resolve(explicitEnvPath);
    if (!fs.existsSync(resolved)) throw new Error(`--env introuvable: ${resolved}`);
    return { config: parseEnvFile(resolved), loadedEnvFiles: [resolved], explicit: true };
  }

  const candidates = [
    path.resolve(REPO_ROOT, 'server/mvt-tile-server/.env'),
    path.resolve(REPO_ROOT, '.env.local'),
    path.resolve(REPO_ROOT, '../../.env.local'),
  ].filter((candidate) => fs.existsSync(candidate));
  const config = {};
  for (const candidate of candidates) {
    const parsed = parseEnvFile(candidate);
    for (const [key, value] of Object.entries(parsed)) {
      if (config[key] == null) config[key] = value;
    }
  }
  Object.assign(config, process.env);
  return { config, loadedEnvFiles: candidates, explicit: false };
}

function selectConnectionString(config, explicit) {
  const databaseUrl = String(config.DATABASE_URL ?? '').trim();
  const supabaseDbUrl = String(config.SUPABASE_DB_URL ?? '').trim();
  if (databaseUrl && supabaseDbUrl && databaseUrl !== supabaseDbUrl) {
    throw new Error('DATABASE_URL et SUPABASE_DB_URL ciblent deux connexions differentes');
  }
  const connectionString = databaseUrl || supabaseDbUrl;
  if (!connectionString) {
    throw new Error(explicit
      ? 'Le fichier --env explicite ne contient ni DATABASE_URL ni SUPABASE_DB_URL'
      : 'DATABASE_URL/SUPABASE_DB_URL absent');
  }
  return connectionString;
}

function projectRefFromSupabaseUrl(value) {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname;
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function deriveProjectRef(url, config) {
  const candidates = new Set();
  const hostMatch = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (hostMatch) candidates.add(hostMatch[1]);
  const userMatch = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/i);
  if (userMatch) candidates.add(userMatch[1]);
  for (const value of [config.SUPABASE_URL, config.VITE_SUPABASE_URL]) {
    const projectRef = projectRefFromSupabaseUrl(value);
    if (projectRef) candidates.add(projectRef);
  }
  if (candidates.size > 1) throw new Error(`References projet Supabase incoherentes: ${[...candidates].join(', ')}`);
  return [...candidates][0] ?? null;
}

function resolveTlsFile(value, envPath) {
  if (!value) return null;
  const base = envPath ? path.dirname(envPath) : process.cwd();
  const resolved = path.isAbsolute(value) ? value : path.resolve(base, value);
  if (!fs.existsSync(resolved)) throw new Error(`Fichier TLS introuvable: ${resolved}`);
  return fs.readFileSync(resolved);
}

function buildConnectionConfig({
  connectionString,
  environment,
  allowUnverifiedTls,
}) {
  const url = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const sslMode = url.searchParams.get('sslmode') || environment.config.PGSSLMODE || (local ? 'disable' : 'verify-full');
  const explicitEnvPath = environment.explicit ? environment.loadedEnvFiles[0] : null;
  const ca = resolveTlsFile(url.searchParams.get('sslrootcert') || environment.config.PGSSLROOTCERT, explicitEnvPath);
  const cert = resolveTlsFile(url.searchParams.get('sslcert') || environment.config.PGSSLCERT, explicitEnvPath);
  const key = resolveTlsFile(url.searchParams.get('sslkey') || environment.config.PGSSLKEY, explicitEnvPath);

  for (const keyName of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(keyName);
  let ssl = false;
  let tlsMode = 'disabled-local';
  if (!local) {
    if (sslMode === 'disable') throw new Error('TLS distant ne peut pas utiliser sslmode=disable');
    if (allowUnverifiedTls) {
      ssl = { rejectUnauthorized: false };
      tlsMode = 'encrypted-unverified-explicit';
    } else {
      ssl = { rejectUnauthorized: true };
      if (ca) ssl.ca = ca;
      if (cert) ssl.cert = cert;
      if (key) ssl.key = key;
      tlsMode = ca ? 'verify-ca-explicit' : 'verify-system-ca';
    }
  }
  return {
    connectionConfig: {
      connectionString: url.toString(),
      ssl,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    },
    tlsMode,
    url,
  };
}

export function resolveDatabaseConfig({
  envPath,
  expectedProjectRef,
  writeIntent = false,
  allowUnverifiedTls = false,
} = {}) {
  const environment = resolveEnvironment(envPath);
  const connectionString = selectConnectionString(environment.config, environment.explicit);
  const built = buildConnectionConfig({ connectionString, environment, allowUnverifiedTls });
  const projectRef = deriveProjectRef(built.url, environment.config);
  const configuredProjectRef = String(environment.config.AVATAR_DISPATCH_EXPECTED_PROJECT_REF ?? '').trim() || null;
  if (configuredProjectRef && projectRef !== configuredProjectRef) {
    throw new Error(`Projet DB ${projectRef ?? 'inconnu'} != AVATAR_DISPATCH_EXPECTED_PROJECT_REF ${configuredProjectRef}`);
  }
  if (writeIntent && !expectedProjectRef) {
    throw new Error('Operation en ecriture refusee sans --expected-project-ref=<ref>');
  }
  if (expectedProjectRef && projectRef !== expectedProjectRef) {
    throw new Error(`Projet DB ${projectRef ?? 'inconnu'} != --expected-project-ref ${expectedProjectRef}`);
  }
  return {
    ...built,
    environment,
    safeTarget: {
      host: built.url.hostname,
      port: built.url.port || '5432',
      database: decodeURIComponent(built.url.pathname.replace(/^\//, '')),
      projectRef,
      tlsMode: built.tlsMode,
    },
  };
}

export function createDatabasePool(options = {}) {
  const resolved = resolveDatabaseConfig(options);
  return {
    pool: new Pool(resolved.connectionConfig),
    connectionConfig: resolved.connectionConfig,
    loadedEnvFiles: resolved.environment.loadedEnvFiles,
    safeTarget: resolved.safeTarget,
  };
}

function updateProfileDigest(digest, values) {
  for (const value of values) digest.update(String(value ?? '')).update('\x1f');
  digest.update('\x1e');
}

export function fingerprintProfiles(profiles) {
  const digest = crypto.createHash('sha256');
  const ordered = [...profiles].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  for (const profile of ordered) updateProfileDigest(digest, PROFILE_COLUMNS.map((column) => profile[column]));
  return digest.digest('hex');
}

async function verifySchema(client) {
  const result = await client.query(`
    SELECT column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mock_artists'
  `);
  const present = new Map(result.rows.map((row) => [row.column_name, row.udt_name]));
  const missing = PROFILE_COLUMNS.filter((column) => !present.has(column));
  if (missing.length) throw new Error(`Colonnes mock_artists absentes: ${missing.join(', ')}`);
  const expectedUdt = { uuid: 'uuid', text: 'text', 'double precision': 'float8', integer: 'int4' };
  const invalidTypes = PROFILE_COLUMN_DEFINITIONS.filter(
    ([name, type]) => present.get(name) !== expectedUdt[type],
  ).map(([name, type]) => `${name}:${present.get(name)}!=${expectedUdt[type]}`);
  if (invalidTypes.length) throw new Error(`Types mock_artists incompatibles: ${invalidTypes.join(', ')}`);

  const primaryKey = await client.query(`
    SELECT attribute.attname
    FROM pg_index AS index
    JOIN pg_class AS table_class ON table_class.oid = index.indrelid
    JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = table_class.oid AND attribute.attnum = ANY(index.indkey)
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'mock_artists'
      AND index.indisprimary
    ORDER BY array_position(index.indkey, attribute.attnum)
  `);
  if (primaryKey.rows.length !== 1 || primaryKey.rows[0].attname !== 'id') {
    throw new Error(`Cle primaire mock_artists inattendue: ${primaryKey.rows.map((row) => row.attname).join(', ') || 'absente'}`);
  }

  const triggers = await client.query(`
    SELECT trigger.tgname
    FROM pg_trigger AS trigger
    JOIN pg_class AS table_class ON table_class.oid = trigger.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = 'mock_artists'
      AND NOT trigger.tgisinternal
  `);
  if (triggers.rows.length) {
    throw new Error(`Triggers utilisateur inattendus sur mock_artists: ${triggers.rows.map((row) => row.tgname).join(', ')}`);
  }
}

async function selectProfiles(client) {
  await client.query('SET extra_float_digits = 3');
  const result = await client.query(`
    SELECT ${PROFILE_COLUMNS.join(', ')}
    FROM public.mock_artists
    ORDER BY id
  `);
  return result.rows.map((row) => ({ ...row, id: String(row.id) }));
}

export async function loadProfiles(pool) {
  const client = await pool.connect();
  try {
    await verifySchema(client);
    const profiles = await selectProfiles(client);
    if (profiles.length !== EXPECTED_PROFILE_COUNT) {
      throw new Error(`mock_artists contient ${profiles.length} lignes au lieu de ${EXPECTED_PROFILE_COUNT}`);
    }
    const uniqueIds = new Set(profiles.map((profile) => profile.id));
    if (uniqueIds.size !== EXPECTED_PROFILE_COUNT) throw new Error(`UUID distincts: ${uniqueIds.size}/200000`);
    const missingIdentity = profiles.filter((profile) => !profile.instrument || !profile.avatar_id || !profile.display_name).length;
    if (missingIdentity) throw new Error(`${missingIdentity} profils sans instrument/avatar/display_name`);
    return { profiles, fingerprint: fingerprintProfiles(profiles) };
  } finally {
    client.release();
  }
}

function equivalentColumnValue(type, left, right) {
  if (left == null || right == null) return left == null && right == null;
  if (type === 'double precision' || type === 'integer') return Number(left) === Number(right);
  return String(left) === String(right);
}

export function countChangedAssignments(assignments, profiles) {
  const profilesById = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const changedCellsByColumn = Object.fromEntries(TEMP_COLUMN_NAMES.map((column) => [column, 0]));
  let rowsChanged = 0;
  for (const assignment of assignments) {
    const profile = profilesById.get(String(assignment.id));
    if (!profile) throw new Error(`Preflight: UUID absent de la DB ${assignment.id}`);
    const values = assignmentValues(assignment);
    let changed = false;
    for (let index = 1; index < TEMP_COLUMNS.length; index += 1) {
      const [column, type] = TEMP_COLUMNS[index];
      if (!equivalentColumnValue(type, profile[column], values[index])) {
        changed = true;
        changedCellsByColumn[column] += 1;
      }
    }
    if (changed) rowsChanged += 1;
  }
  if (assignments.length !== profiles.length || profilesById.size !== assignments.length) {
    throw new Error(`Preflight incomplet: assignments=${assignments.length}, DB=${profiles.length}`);
  }
  return {
    rowsStaged: assignments.length,
    rowsChanged,
    rowsUnchanged: assignments.length - rowsChanged,
    changedCellsByColumn,
  };
}

export async function inspectDatabasePreflight(pool) {
  const client = await pool.connect();
  try {
    await verifySchema(client);
    const locks = await client.query(`
        SELECT lock.mode, lock.granted, count(*)::integer AS count
        FROM pg_locks AS lock
        JOIN pg_class AS relation ON relation.oid = lock.relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relname = 'mock_artists'
        GROUP BY lock.mode, lock.granted
        ORDER BY lock.mode, lock.granted
      `);
    const triggers = await client.query(`
        SELECT trigger_name, action_timing, event_manipulation, action_orientation
        FROM information_schema.triggers
        WHERE event_object_schema = 'public' AND event_object_table = 'mock_artists'
        ORDER BY trigger_name, event_manipulation
      `);
    const indexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'mock_artists'
        ORDER BY indexname
      `);
    const activity = await client.query(`
        SELECT pid, state, wait_event_type, wait_event,
               extract(epoch FROM now() - xact_start)::integer AS transaction_seconds,
               extract(epoch FROM now() - query_start)::integer AS query_seconds,
               left(regexp_replace(query, '\\s+', ' ', 'g'), 160) AS query
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND (xact_start IS NOT NULL OR state <> 'idle')
        ORDER BY xact_start NULLS LAST, query_start
      `);
    const tableStats = await client.query(`
        SELECT n_live_tup::bigint::text, n_tup_ins::bigint::text, n_tup_upd::bigint::text,
               n_tup_del::bigint::text, n_mod_since_analyze::bigint::text,
               last_analyze, last_autoanalyze
        FROM pg_stat_user_tables
        WHERE schemaname = 'public' AND relname = 'mock_artists'
      `);
    const rls = await client.query(`
        SELECT relation.relrowsecurity AS rls_enabled, relation.relforcerowsecurity AS rls_forced
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relname = 'mock_artists'
      `);
    return {
      inspectedAt: new Date().toISOString(),
      locks: locks.rows,
      triggers: triggers.rows,
      indexes: indexes.rows,
      activeSessions: activity.rows,
      tableStats: tableStats.rows[0] ?? null,
      rowLevelSecurity: rls.rows[0] ?? null,
    };
  } finally {
    client.release();
  }
}

export async function sha256FileStream(filePath) {
  const digest = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) digest.update(chunk);
  return digest.digest('hex');
}

export async function readBackupSnapshot({
  filePath,
  expectedFingerprint,
  expectedSha256,
  expectedCount = EXPECTED_PROFILE_COUNT,
  collectProfiles = false,
}) {
  const resolvedPath = path.resolve(filePath);
  const compressedSha256 = await sha256FileStream(resolvedPath);
  if (expectedSha256 && compressedSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`SHA-256 backup ${compressedSha256} != attendu ${expectedSha256}`);
  }

  const gunzip = createGunzip();
  fs.createReadStream(resolvedPath).pipe(gunzip);
  const contentDigest = crypto.createHash('sha256');
  const profiles = collectProfiles ? [] : null;
  const uniqueIds = collectProfiles ? new Set() : null;
  let buffered = '';
  let metadata = null;
  let rowCount = 0;
  const decoder = new StringDecoder('utf8');

  function consumeLine(line) {
    if (!line) return;
    const parsed = JSON.parse(line);
    if (!metadata) {
      metadata = parsed;
      if (metadata.schemaVersion !== 1
        || metadata.rowCount !== expectedCount
        || JSON.stringify(metadata.columns) !== JSON.stringify(PROFILE_COLUMNS)) {
        throw new Error(`Metadata backup invalide: ${JSON.stringify(metadata)}`);
      }
      return;
    }
    if (!Array.isArray(parsed) || parsed.length !== PROFILE_COLUMNS.length) {
      throw new Error(`Ligne backup invalide a l'index ${rowCount + 1}`);
    }
    updateProfileDigest(contentDigest, parsed);
    if (profiles) {
      const profile = Object.fromEntries(PROFILE_COLUMNS.map((column, index) => [column, parsed[index]]));
      profiles.push(profile);
      uniqueIds.add(String(profile.id));
    }
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
  const contentFingerprint = contentDigest.digest('hex');
  if (!metadata
    || rowCount !== expectedCount
    || metadata.databaseFingerprint !== contentFingerprint
    || (expectedFingerprint && contentFingerprint !== expectedFingerprint)
    || (uniqueIds && uniqueIds.size !== expectedCount)) {
    throw new Error(
      `Verification backup echouee: rows=${rowCount}/${expectedCount}, fingerprint=${contentFingerprint}, metadata=${metadata?.databaseFingerprint}`,
    );
  }
  return {
    filePath: resolvedPath,
    compressedSha256,
    contentFingerprint,
    rowCount,
    metadata,
    profiles,
  };
}

export async function createBackupSnapshot({
  profiles,
  databaseFingerprint,
  backupRoot = PATHS.backups,
  expectedCount = EXPECTED_PROFILE_COUNT,
}) {
  if (profiles.length !== expectedCount || fingerprintProfiles(profiles) !== databaseFingerprint) {
    throw new Error('Snapshot rollback refuse: les donnees source ne correspondent pas au fingerprint du dry-run');
  }
  fs.mkdirSync(backupRoot, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
  const filePath = path.resolve(
    backupRoot,
    `mock-artists-before-dispatch-${timestamp}-${databaseFingerprint.slice(0, 12)}.jsonl.gz`,
  );
  const metadata = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    table: 'public.mock_artists',
    rowCount: expectedCount,
    databaseFingerprint,
    columns: PROFILE_COLUMNS,
  };

  function* lines() {
    yield `${JSON.stringify(metadata)}\n`;
    for (const profile of [...profiles].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
      yield `${JSON.stringify(PROFILE_COLUMNS.map((column) => profile[column] ?? null))}\n`;
    }
  }

  try {
    await pipeline(
      Readable.from(lines()),
      createGzip({ level: 9 }),
      fs.createWriteStream(filePath, { flags: 'wx' }),
    );
    const verified = await readBackupSnapshot({
      filePath,
      expectedFingerprint: databaseFingerprint,
      expectedCount,
    });
    const bytes = fs.statSync(filePath).size;
    return {
      filePath,
      sha256: verified.compressedSha256,
      contentFingerprint: verified.contentFingerprint,
      bytes,
      rowCount: verified.rowCount,
      columns: PROFILE_COLUMNS,
    };
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw new Error(`Snapshot rollback impossible; --apply refuse: ${error.message}`, { cause: error });
  }
}

export function assignmentValues(assignment) {
  return ASSIGNMENT_VALUE_FIELDS.map((field) => assignment[field] ?? null);
}

export function assignmentFromValues(values) {
  if (!Array.isArray(values) || values.length !== ASSIGNMENT_VALUE_FIELDS.length) {
    throw new Error(`Ligne assignment invalide: ${Array.isArray(values) ? values.length : typeof values} champs`);
  }
  const assignment = {};
  for (let index = 0; index < ASSIGNMENT_VALUE_FIELDS.length; index += 1) {
    assignment[ASSIGNMENT_VALUE_FIELDS[index]] = values[index];
  }
  return assignment;
}

function updatePlanDigest(digest, values) {
  digest.update(JSON.stringify(values)).update('\n');
}

export function fingerprintAssignments(assignments) {
  const digest = crypto.createHash('sha256');
  digest.update('meewav-avatar-dispatch-assignment-plan-v2\n');
  digest.update(JSON.stringify(TEMP_COLUMNS)).update('\n');
  const ordered = [...assignments].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  for (const assignment of ordered) updatePlanDigest(digest, assignmentValues(assignment));
  return digest.digest('hex');
}

export function fingerprintStagedRows(rows) {
  const digest = crypto.createHash('sha256');
  digest.update('meewav-avatar-dispatch-assignment-plan-v2\n');
  digest.update(JSON.stringify(TEMP_COLUMNS)).update('\n');
  for (const row of rows) updatePlanDigest(digest, TEMP_COLUMN_NAMES.map((column) => row[column] ?? null));
  return digest.digest('hex');
}

async function createTempTable(client, tableName, columns) {
  await client.query(`
    CREATE TEMP TABLE ${tableName} (
      ${columns.map(([name, type]) => `${name} ${type}`).join(',\n      ')},
      PRIMARY KEY (id)
    ) ON COMMIT DROP
  `);
}

function copyTextValue(value) {
  if (value == null) return '\\N';
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r');
}

export async function copyRecordsToTempTable({
  client,
  tableName,
  columnNames,
  records,
  toValues,
  onProgress,
}) {
  let copied = 0;
  function* lines() {
    for (const record of records) {
      const values = toValues(record);
      if (!Array.isArray(values) || values.length !== columnNames.length) {
        throw new Error(`${tableName}: ligne ${copied + 1} avec ${values?.length ?? 'aucun'} champs/${columnNames.length}`);
      }
      copied += 1;
      if (copied % 20_000 === 0 || copied === records.length) {
        onProgress?.(`${tableName}: ${copied}/${records.length} lignes COPY`);
      }
      yield `${values.map(copyTextValue).join('\t')}\n`;
    }
  }

  const copyStream = client.query(copyFrom(
    `COPY ${tableName} (${columnNames.join(', ')}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`,
  ));
  await pipeline(Readable.from(lines()), copyStream);
  if (copied !== records.length) throw new Error(`${tableName}: COPY incomplet ${copied}/${records.length}`);
  return copied;
}

export function buildFieldMismatchPredicate(columns, targetAlias = 'target', sourceAlias = 'source') {
  return columns
    .map(([name]) => `${targetAlias}.${name} IS DISTINCT FROM ${sourceAlias}.${name}`)
    .join('\n        OR ');
}

function buildUpdateSql(tableName, sourceTable, columns) {
  const mutable = columns.filter(([name]) => name !== 'id');
  return `
    UPDATE ${tableName} AS target
    SET ${mutable.map(([name]) => `${name} = source.${name}`).join(',\n        ')}
    FROM ${sourceTable} AS source
    WHERE target.id = source.id
      AND (${buildFieldMismatchPredicate(mutable)})
  `;
}

async function countStageChanges(client, stageTable, columns) {
  const mutable = columns.filter(([name]) => name !== 'id');
  const result = await client.query(`
    SELECT count(*)::integer AS count
    FROM ${stageTable} AS source
    JOIN public.mock_artists AS target ON target.id = source.id
    WHERE ${buildFieldMismatchPredicate(mutable)}
  `);
  return result.rows[0].count;
}

async function assertStageMatchesTable(client, stageTable, columns, expectedCount) {
  const mismatch = await client.query(`
    SELECT count(*)::integer AS count
    FROM ${stageTable} AS source
    LEFT JOIN public.mock_artists AS target ON target.id = source.id
    WHERE target.id IS NULL
       OR ${buildFieldMismatchPredicate(columns)}
  `);
  if (mismatch.rows[0].count !== 0) {
    throw new Error(`Comparaison staging/table: ${mismatch.rows[0].count} ligne(s) differente(s)`);
  }
  const staged = await client.query(`SELECT count(*)::integer AS count FROM ${stageTable}`);
  if (staged.rows[0].count !== expectedCount) throw new Error(`Stage incomplet: ${staged.rows[0].count}/${expectedCount}`);
}

async function queryDistributionChecks(client) {
  const verification = await client.query(`
    WITH privacy AS (
      SELECT
        source.*,
        sqrt(
          power((private_mock_lng - public_display_lng) * 111320 * cos(radians((private_mock_lat + public_display_lat) / 2)), 2)
          + power((private_mock_lat - public_display_lat) * 110574, 2)
        ) AS private_distance_m
      FROM public.mock_artists AS source
    )
    SELECT
      count(*)::integer AS total,
      count(DISTINCT id)::integer AS unique_ids,
      count(DISTINCT (round(lng::numeric, 7), round(lat::numeric, 7)))::integer AS unique_coordinates,
      count(DISTINCT (round(private_mock_lng::numeric, 7), round(private_mock_lat::numeric, 7)))::integer AS unique_private_coordinates,
      count(*) FILTER (
        WHERE lat IS NOT DISTINCT FROM public_display_lat
          AND lng IS NOT DISTINCT FROM public_display_lng
      )::integer AS public_coordinate_matches,
      count(*) FILTER (
        WHERE (round(private_mock_lng::numeric, 7), round(private_mock_lat::numeric, 7))
          IS DISTINCT FROM (round(public_display_lng::numeric, 7), round(public_display_lat::numeric, 7))
      )::integer AS private_coordinate_distinct,
      (
        SELECT count(*)::integer
        FROM public.mock_artists AS private_row
        JOIN public.mock_artists AS public_row
          ON (round(private_row.private_mock_lng::numeric, 7), round(private_row.private_mock_lat::numeric, 7))
           = (round(public_row.public_display_lng::numeric, 7), round(public_row.public_display_lat::numeric, 7))
      ) AS private_public_collisions,
      count(*) FILTER (WHERE private_distance_m < 45)::integer AS privacy_too_close,
      count(*) FILTER (WHERE private_distance_m > 650)::integer AS privacy_too_far,
      count(*) FILTER (WHERE private_distance_m >= 70 AND private_distance_m <= 330)::integer AS privacy_preferred,
      min(private_distance_m)::double precision AS privacy_min_m,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY private_distance_m)::double precision AS privacy_median_m,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY private_distance_m)::double precision AS privacy_p95_m,
      max(private_distance_m)::double precision AS privacy_max_m,
      count(*) FILTER (WHERE avatar_id = ANY($1::text[]))::integer AS canonical_avatars,
      count(*) FILTER (WHERE city = 'Paris')::integer AS paris_profiles,
      count(*) FILTER (WHERE city = 'Grand Paris')::integer AS grand_paris_profiles,
      count(*) FILTER (WHERE avatar_id = 'avatar_3')::integer AS utilisatrice_profiles,
      count(*) FILTER (WHERE avatar_id = 'avatar_4')::integer AS utilisateur_profiles,
      count(DISTINCT district_id)::integer AS leaf_district_ids,
      count(*) FILTER (WHERE district_id = $2)::integer AS charonne_reserved,
      count(*) FILTER (
        WHERE instrument IS NULL OR avatar_id IS NULL OR display_name IS NULL
           OR private_mock_lat IS NULL OR private_mock_lng IS NULL
           OR public_display_lat IS NULL OR public_display_lng IS NULL
           OR country_cluster_id IS NULL OR city_cluster_id IS NULL
           OR macro_cluster_id IS NULL OR mid_cluster_id IS NULL OR local_cluster_id IS NULL
           OR micro_cluster_id IS NULL OR nano_cluster_id IS NULL
           OR density_tier IS NULL OR density_weight IS NULL OR avatar_url IS NULL
      )::integer AS incomplete
    FROM privacy
  `, [STYLE_IDS, CHARONNE_ZONE_ID]);
  return verification.rows[0];
}

function assertDistributionChecks(checks) {
  const grandParisTarget = EXPECTED_PROFILE_COUNT - PARIS_PROFILE_TARGET;
  if (checks.total !== EXPECTED_PROFILE_COUNT
    || checks.unique_ids !== EXPECTED_PROFILE_COUNT
    || checks.unique_coordinates !== EXPECTED_PROFILE_COUNT
    || checks.unique_private_coordinates !== EXPECTED_PROFILE_COUNT
    || checks.public_coordinate_matches !== EXPECTED_PROFILE_COUNT
    || checks.private_coordinate_distinct !== EXPECTED_PROFILE_COUNT
    || checks.private_public_collisions !== 0
    || checks.privacy_too_close !== 0
    || checks.privacy_too_far !== 0
    || checks.canonical_avatars !== EXPECTED_PROFILE_COUNT
    || checks.paris_profiles !== PARIS_PROFILE_TARGET
    || checks.grand_paris_profiles !== grandParisTarget
    || checks.utilisatrice_profiles !== USER_STYLE_TARGET
    || checks.utilisateur_profiles !== USER_STYLE_TARGET
    || checks.leaf_district_ids !== 984
    || checks.charonne_reserved !== CHARONNE_PROFILE_COUNT
    || checks.incomplete !== 0) {
    throw new Error(`Verification SQL echouee: ${JSON.stringify(checks)}`);
  }
}

async function verifyAppliedPlanOnNewConnection(connectionConfig, expectedAssignmentPlanHash) {
  const verificationPool = new Pool({ ...connectionConfig, max: 1 });
  try {
    const client = await verificationPool.connect();
    try {
      await client.query('SET extra_float_digits = 3');
      const checks = await queryDistributionChecks(client);
      assertDistributionChecks(checks);
      const result = await client.query(`SELECT ${TEMP_COLUMN_NAMES.join(', ')} FROM public.mock_artists ORDER BY id`);
      if (result.rows.length !== EXPECTED_PROFILE_COUNT) throw new Error(`Lecture post-COMMIT: ${result.rows.length}/200000`);
      const assignmentPlanHash = fingerprintStagedRows(result.rows);
      if (assignmentPlanHash !== expectedAssignmentPlanHash) {
        throw new Error(`Hash table post-COMMIT ${assignmentPlanHash} != plan ${expectedAssignmentPlanHash}`);
      }
      return { checks, assignmentPlanHash };
    } finally {
      client.release();
    }
  } finally {
    await verificationPool.end();
  }
}

async function determineApplyStateOnNewConnection(
  connectionConfig,
  expectedAssignmentPlanHash,
  expectedPreviousFingerprint,
) {
  const verificationPool = new Pool({ ...connectionConfig, max: 1 });
  try {
    const client = await verificationPool.connect();
    try {
      await client.query('SET extra_float_digits = 3');
      const result = await client.query(`SELECT ${TEMP_COLUMN_NAMES.join(', ')} FROM public.mock_artists ORDER BY id`);
      const assignmentPlanHash = result.rows.length === EXPECTED_PROFILE_COUNT
        ? fingerprintStagedRows(result.rows)
        : null;
      if (assignmentPlanHash === expectedAssignmentPlanHash) {
        const checks = await queryDistributionChecks(client);
        assertDistributionChecks(checks);
        return { state: 'committed', assignmentPlanHash, checks };
      }
      const previous = await selectProfiles(client);
      const previousFingerprint = previous.length === EXPECTED_PROFILE_COUNT
        ? fingerprintProfiles(previous)
        : null;
      if (previousFingerprint === expectedPreviousFingerprint) {
        return { state: 'not_applied', previousFingerprint };
      }
      return {
        state: 'unknown',
        assignmentPlanHash,
        previousFingerprint,
        rowCount: result.rows.length,
      };
    } finally {
      client.release();
    }
  } finally {
    await verificationPool.end();
  }
}

export async function applyPlan({
  pool,
  connectionConfig,
  assignments,
  originalProfiles,
  expectedFingerprint,
  expectedAssignmentPlanHash,
  backupRoot = PATHS.backups,
  blockers,
  onProgress,
}) {
  if (blockers.length) throw new Error(`Application bloquee:\n- ${blockers.join('\n- ')}`);
  if (assignments.length !== EXPECTED_PROFILE_COUNT) throw new Error(`Plan incomplet: ${assignments.length}/200000`);
  const initialPlanHash = fingerprintAssignments(assignments);
  if (!expectedAssignmentPlanHash || initialPlanHash !== expectedAssignmentPlanHash) {
    throw new Error(`--expected-plan-hash ${expectedAssignmentPlanHash ?? 'absent'} != plan ${initialPlanHash}`);
  }

  const backup = await createBackupSnapshot({
    profiles: originalProfiles,
    databaseFingerprint: expectedFingerprint,
    backupRoot,
  });
  onProgress?.(`Snapshot rollback: ${backup.filePath}`);
  onProgress?.(`Snapshot SHA-256: ${backup.sha256}; contenu=${backup.contentFingerprint}`);

  const client = await pool.connect();
  let commitAttempted = false;
  let commitError = null;
  let transactionChecks = null;
  let rowsToChange = null;
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '20min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('meewav-avatar-dispatch-v1'))");
    await client.query('LOCK TABLE public.mock_artists IN SHARE ROW EXCLUSIVE MODE');
    await verifySchema(client);
    const currentProfiles = await selectProfiles(client);
    const currentFingerprint = fingerprintProfiles(currentProfiles);
    if (currentProfiles.length !== EXPECTED_PROFILE_COUNT || currentFingerprint !== expectedFingerprint) {
      throw new Error(
        `Snapshot DB modifie depuis le dry-run: count=${currentProfiles.length}, fingerprint=${currentFingerprint}, attendu=${expectedFingerprint}`,
      );
    }

    await createTempTable(client, 'avatar_dispatch_updates', TEMP_COLUMNS);
    const assignmentPlanHash = fingerprintAssignments(assignments);
    if (assignmentPlanHash !== expectedAssignmentPlanHash) {
      throw new Error(`Plan modifie avant INSERT: ${assignmentPlanHash}, attendu=${expectedAssignmentPlanHash}`);
    }
    onProgress?.(`Assignment plan SHA-256 verifie avant INSERT: ${assignmentPlanHash}`);
    const orderedAssignments = [...assignments].sort((left, right) => String(left.id).localeCompare(String(right.id)));
    await copyRecordsToTempTable({
      client,
      tableName: 'avatar_dispatch_updates',
      columnNames: TEMP_COLUMN_NAMES,
      records: orderedAssignments,
      toValues: assignmentValues,
      onProgress,
    });
    rowsToChange = await countStageChanges(client, 'avatar_dispatch_updates', TEMP_COLUMNS);
    onProgress?.(`Lignes reellement differentes avant UPDATE: ${rowsToChange}`);
    const updateResult = await client.query(buildUpdateSql('public.mock_artists', 'avatar_dispatch_updates', TEMP_COLUMNS));
    if (updateResult.rowCount !== rowsToChange) {
      throw new Error(`UPDATE incoherent: ${updateResult.rowCount}/${rowsToChange} lignes differentes`);
    }
    await assertStageMatchesTable(client, 'avatar_dispatch_updates', TEMP_COLUMNS, EXPECTED_PROFILE_COUNT);
    transactionChecks = await queryDistributionChecks(client);
    assertDistributionChecks(transactionChecks);
    commitAttempted = true;
    try {
      await client.query('COMMIT');
    } catch (error) {
      commitError = error;
    }
  } catch (error) {
    if (!commitAttempted) await Promise.resolve(client.query('ROLLBACK')).catch(() => {});
    throw error;
  } finally {
    client.release(Boolean(commitError));
  }

  if (commitError) {
    try {
      const determined = await determineApplyStateOnNewConnection(
        connectionConfig,
        expectedAssignmentPlanHash,
        expectedFingerprint,
      );
      if (determined.state === 'committed') {
        return {
          status: 'commit_response_lost_but_committed_verified',
          committed: true,
          postCommitVerified: true,
          transactionChecks,
          postCommitChecks: determined.checks,
          backup,
          rowsChanged: rowsToChange,
          assignmentPlanHash: determined.assignmentPlanHash,
          commitError: commitError.message,
        };
      }
      if (determined.state === 'not_applied') {
        return {
          status: 'commit_failed_not_applied_verified',
          committed: false,
          postCommitVerified: true,
          transactionChecks,
          backup,
          rowsChanged: 0,
          assignmentPlanHash: expectedAssignmentPlanHash,
          commitError: commitError.message,
        };
      }
      return {
        status: 'commit_state_unknown',
        committed: null,
        postCommitVerified: false,
        transactionChecks,
        backup,
        rowsChanged: null,
        assignmentPlanHash: expectedAssignmentPlanHash,
        commitError: commitError.message,
        observedState: determined,
      };
    } catch (verificationError) {
      return {
        status: 'commit_state_unknown',
        committed: null,
        postCommitVerified: false,
        transactionChecks,
        backup,
        rowsChanged: null,
        assignmentPlanHash: expectedAssignmentPlanHash,
        commitError: commitError.message,
        postCommitError: verificationError.message,
      };
    }
  }

  try {
    const postCommit = await verifyAppliedPlanOnNewConnection(connectionConfig, expectedAssignmentPlanHash);
    return {
      status: 'committed_verified',
      committed: true,
      postCommitVerified: true,
      transactionChecks,
      postCommitChecks: postCommit.checks,
      backup,
      rowsChanged: rowsToChange,
      assignmentPlanHash: postCommit.assignmentPlanHash,
    };
  } catch (error) {
    return {
      status: 'committed_verification_failed',
      committed: true,
      postCommitVerified: false,
      transactionChecks,
      backup,
      rowsChanged: rowsToChange,
      assignmentPlanHash: expectedAssignmentPlanHash,
      postCommitError: error.message,
    };
  }
}

export async function restoreProfilesTransaction({
  client,
  profiles,
  backupFingerprint,
  expectedCurrentPlanHash,
  expectedCount = EXPECTED_PROFILE_COUNT,
  onProgress,
}) {
  let commitAttempted = false;
  try {
    await client.query('SET extra_float_digits = 3');
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '20min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('meewav-avatar-dispatch-v1'))");
    await client.query('LOCK TABLE public.mock_artists IN SHARE ROW EXCLUSIVE MODE');
    await verifySchema(client);
    const currentStageRows = await client.query(
      `SELECT ${TEMP_COLUMN_NAMES.join(', ')} FROM public.mock_artists ORDER BY id`,
    );
    const currentPlanHash = fingerprintStagedRows(currentStageRows.rows);
    if (currentStageRows.rows.length !== expectedCount || currentPlanHash !== expectedCurrentPlanHash) {
      throw new Error(
        `Etat DB avant restore ${currentPlanHash} (${currentStageRows.rows.length} lignes) != attendu ${expectedCurrentPlanHash}`,
      );
    }
    await createTempTable(client, 'avatar_dispatch_restore', PROFILE_COLUMN_DEFINITIONS);
    const orderedProfiles = [...profiles].sort((left, right) => String(left.id).localeCompare(String(right.id)));
    await copyRecordsToTempTable({
      client,
      tableName: 'avatar_dispatch_restore',
      columnNames: PROFILE_COLUMNS,
      records: orderedProfiles,
      toValues: (profile) => PROFILE_COLUMNS.map((column) => profile[column] ?? null),
      onProgress,
    });
    const rowsToChange = await countStageChanges(
      client,
      'avatar_dispatch_restore',
      PROFILE_COLUMN_DEFINITIONS,
    );
    onProgress?.(`Lignes reellement differentes avant RESTORE: ${rowsToChange}`);
    const updateResult = await client.query(
      buildUpdateSql('public.mock_artists', 'avatar_dispatch_restore', PROFILE_COLUMN_DEFINITIONS),
    );
    if (updateResult.rowCount !== rowsToChange) {
      throw new Error(`RESTORE incoherent: ${updateResult.rowCount}/${rowsToChange} lignes differentes`);
    }
    await assertStageMatchesTable(client, 'avatar_dispatch_restore', PROFILE_COLUMN_DEFINITIONS, expectedCount);
    const restoredProfiles = await selectProfiles(client);
    if (restoredProfiles.length !== expectedCount || fingerprintProfiles(restoredProfiles) !== backupFingerprint) {
      throw new Error(`Fingerprint restore invalide: ${fingerprintProfiles(restoredProfiles)} != ${backupFingerprint}`);
    }
    commitAttempted = true;
    try {
      await client.query('COMMIT');
      return { status: 'committed', committed: true, restoredRows: rowsToChange, databaseFingerprint: backupFingerprint };
    } catch (error) {
      return {
        status: 'commit_response_unknown',
        committed: null,
        restoredRows: rowsToChange,
        databaseFingerprint: backupFingerprint,
        commitError: error.message,
      };
    }
  } catch (error) {
    if (!commitAttempted) await Promise.resolve(client.query('ROLLBACK')).catch(() => {});
    throw error;
  }
}

async function verifyRestoreOnNewConnection(connectionConfig, expectedFingerprint) {
  const verificationPool = new Pool({ ...connectionConfig, max: 1 });
  try {
    const profiles = await loadProfiles(verificationPool);
    if (profiles.fingerprint !== expectedFingerprint) {
      throw new Error(`Fingerprint post-restore ${profiles.fingerprint} != ${expectedFingerprint}`);
    }
    return { rowCount: profiles.profiles.length, databaseFingerprint: profiles.fingerprint };
  } finally {
    await verificationPool.end();
  }
}

async function determineRestoreStateOnNewConnection(
  connectionConfig,
  expectedBackupFingerprint,
  expectedCurrentPlanHash,
) {
  const verificationPool = new Pool({ ...connectionConfig, max: 1 });
  try {
    const client = await verificationPool.connect();
    try {
      const profiles = await selectProfiles(client);
      const databaseFingerprint = profiles.length === EXPECTED_PROFILE_COUNT
        ? fingerprintProfiles(profiles)
        : null;
      if (databaseFingerprint === expectedBackupFingerprint) {
        return { state: 'committed', databaseFingerprint };
      }
      const current = await client.query(`SELECT ${TEMP_COLUMN_NAMES.join(', ')} FROM public.mock_artists ORDER BY id`);
      const assignmentPlanHash = current.rows.length === EXPECTED_PROFILE_COUNT
        ? fingerprintStagedRows(current.rows)
        : null;
      if (assignmentPlanHash === expectedCurrentPlanHash) {
        return { state: 'not_applied', assignmentPlanHash };
      }
      return { state: 'unknown', databaseFingerprint, assignmentPlanHash, rowCount: profiles.length };
    } finally {
      client.release();
    }
  } finally {
    await verificationPool.end();
  }
}

export async function restoreBackupSnapshot({
  pool,
  connectionConfig,
  filePath,
  expectedSha256,
  expectedCurrentPlanHash,
  onProgress,
}) {
  if (!expectedSha256) throw new Error('Restauration refusee sans --restore-sha256=<hash>');
  if (!expectedCurrentPlanHash) {
    throw new Error('Restauration refusee sans --expected-current-plan-hash=<hash>');
  }
  const backup = await readBackupSnapshot({
    filePath,
    expectedSha256,
    expectedCount: EXPECTED_PROFILE_COUNT,
    collectProfiles: true,
  });
  onProgress?.(`Backup verifie: sha256=${backup.compressedSha256}; contenu=${backup.contentFingerprint}`);
  const client = await pool.connect();
  let transactionResult;
  try {
    transactionResult = await restoreProfilesTransaction({
      client,
      profiles: backup.profiles,
      backupFingerprint: backup.contentFingerprint,
      expectedCurrentPlanHash,
      onProgress,
    });
  } finally {
    client.release(transactionResult?.status === 'commit_response_unknown');
  }
  if (transactionResult.status === 'commit_response_unknown') {
    try {
      const determined = await determineRestoreStateOnNewConnection(
        connectionConfig,
        backup.contentFingerprint,
        expectedCurrentPlanHash,
      );
      if (determined.state === 'committed') {
        return {
          status: 'restore_commit_response_lost_but_committed_verified',
          committed: true,
          postCommitVerified: true,
          backup: {
            filePath: backup.filePath,
            sha256: backup.compressedSha256,
            contentFingerprint: backup.contentFingerprint,
          },
          transactionResult,
          postCommit: determined,
        };
      }
      if (determined.state === 'not_applied') {
        return {
          status: 'restore_commit_failed_not_applied_verified',
          committed: false,
          postCommitVerified: true,
          backup: {
            filePath: backup.filePath,
            sha256: backup.compressedSha256,
            contentFingerprint: backup.contentFingerprint,
          },
          transactionResult,
          observedState: determined,
        };
      }
      return {
        status: 'restore_commit_state_unknown',
        committed: null,
        postCommitVerified: false,
        backup: {
          filePath: backup.filePath,
          sha256: backup.compressedSha256,
          contentFingerprint: backup.contentFingerprint,
        },
        transactionResult,
        observedState: determined,
      };
    } catch (error) {
      return {
        status: 'restore_commit_state_unknown',
        committed: null,
        postCommitVerified: false,
        backup: {
          filePath: backup.filePath,
          sha256: backup.compressedSha256,
          contentFingerprint: backup.contentFingerprint,
        },
        transactionResult,
        postCommitError: error.message,
      };
    }
  }
  try {
    const postCommit = await verifyRestoreOnNewConnection(connectionConfig, backup.contentFingerprint);
    return {
      status: 'restore_committed_verified',
      committed: true,
      postCommitVerified: true,
      backup: {
        filePath: backup.filePath,
        sha256: backup.compressedSha256,
        contentFingerprint: backup.contentFingerprint,
      },
      transactionResult,
      postCommit,
    };
  } catch (error) {
    return {
      status: 'restore_committed_verification_failed',
      committed: true,
      postCommitVerified: false,
      backup: {
        filePath: backup.filePath,
        sha256: backup.compressedSha256,
        contentFingerprint: backup.contentFingerprint,
      },
      transactionResult,
      postCommitError: error.message,
    };
  }
}
