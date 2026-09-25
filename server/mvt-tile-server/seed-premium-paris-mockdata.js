import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("CRITICAL ERROR: SUPABASE_DB_URL or DATABASE_URL is missing in .env.local");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false }
});

// 0 means: one stable mock artist for every real BAN address in Paris.
const ARTIST_LIMIT = Math.max(parseInt(process.env.PARIS_MOCK_ARTIST_LIMIT || "0", 10) || 0, 0);
const BATCH_SIZE = 1000;
const MAX_NANO_SIZE = 40;
const AVATAR_COUNT = 32;

const INSTRUMENTS = [
  "Singer",
  "Guitarist",
  "Pianist",
  "Drummer",
  "DJ",
  "Producer",
  "Violinist",
  "Saxophonist",
  "Bassist",
  "Rapper",
  "Cellist",
  "Flutist",
  "Trumpeter",
  "Beatmaker",
  "Composer",
  "Vocalist"
];

const STAGE_NAME_PREFIXES = [
  "Alma", "Noe", "Mila", "Sacha", "Nina", "Eden", "Lio", "Maya",
  "Zelie", "Nolan", "Iris", "Nael", "Lina", "Elio", "June", "Ari"
];

const STAGE_NAME_SUFFIXES = [
  "Wave", "Pulse", "Nova", "Echo", "Keys", "Verse", "Loop", "Chord",
  "Tone", "Bass", "Muse", "Track", "Flow", "Signal", "Velvet", "Brass"
];

const RANK_TIERS = [
  { minScore: 94, label: "featured" },
  { minScore: 78, label: "pro" },
  { minScore: 52, label: "confirmed" },
  { minScore: 0, label: "emerging" }
];

const PARIS_BOUNDS = {
  minLng: 2.224,
  maxLng: 2.469,
  minLat: 48.815,
  maxLat: 48.902
};

function stableHash(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function stableInt(input, modulo) {
  const hex = stableHash(input).slice(0, 8);
  return parseInt(hex, 16) % modulo;
}

function getAvatarId(seed) {
  return `avatar_${stableInt(`avatar_${seed}`, AVATAR_COUNT) + 1}`;
}

function getInstrument(seed) {
  return INSTRUMENTS[stableInt(`instrument_${seed}`, INSTRUMENTS.length)];
}

function isInsideParis(lat, lng) {
  return (
    lat >= PARIS_BOUNDS.minLat &&
    lat <= PARIS_BOUNDS.maxLat &&
    lng >= PARIS_BOUNDS.minLng &&
    lng <= PARIS_BOUNDS.maxLng
  );
}

function getAnchorTypeAndQuality(anchor) {
  const label = anchor.label || "";
  const exceptionalKeywords = [
    "Opéra", "Philharmonie", "Pleyel", "Maison de la Radio", "Radio France",
    "Olympia", "Zénith", "Bataclan", "Châtelet", "Mogador", "Accor Arena", "Bercy"
  ];
  const culturalKeywords = [
    "Musée", "Théâtre", "Salle", "Studio", "Conservatoire", "Médiathèque",
    "Bibliothèque", "Centre Culturel", "Grand Palais", "Palais", "Cité de la musique",
    "Espace", "Carreau", "Bellevilloise", "Gaîté", "La Cigale", "Maroquinerie",
    "Trabendo", "Trianon", "Cabaret", "Casino", "Gaveau", "Cortot", "Radio",
    "UNESCO", "Sorbonne", "Beaux-Arts", "IRCAM", "Bastille"
  ];

  if (exceptionalKeywords.some(kw => label.toLowerCase().includes(kw.toLowerCase()))) {
    return { type: "cultural_address", quality: "high" };
  }
  if (culturalKeywords.some(kw => label.toLowerCase().includes(kw.toLowerCase()))) {
    return { type: "cultural_address", quality: "high" };
  }
  return { type: "ban_address", quality: "high" };
}

function createRankScore(addressId) {
  return stableInt(`rank_score_${addressId}`, 100) + 1;
}

function createRenderRank(addressId, rankScore) {
  return (100 - rankScore) * 10000 + stableInt(`rank_tiebreak_${addressId}`, 10000);
}

function getRankTier(rankScore) {
  return RANK_TIERS.find(tier => rankScore >= tier.minScore)?.label || "emerging";
}

function getGradeTier(gradeStars) {
  if (gradeStars === 1) return "rookie";
  if (gradeStars === 2) return "rising";
  if (gradeStars === 3) return "confirmed";
  if (gradeStars === 4) return "premium";
  return "legendary";
}

function createGrade(addressId) {
  const roll = stableInt(`grade_${addressId}`, 10000) / 10000;
  let gradeStars = 5;

  if (roll < 0.30) gradeStars = 1;
  else if (roll < 0.60) gradeStars = 2;
  else if (roll < 0.82) gradeStars = 3;
  else if (roll < 0.95) gradeStars = 4;

  return {
    gradeStars,
    gradeTier: getGradeTier(gradeStars),
    gradeColor: "#8B5CF6",
    gradeSource: "random_seed_v1"
  };
}

function createIdentity(anchor) {
  const seed = anchor.id;
  const prefix = STAGE_NAME_PREFIXES[stableInt(`name_prefix_${seed}`, STAGE_NAME_PREFIXES.length)];
  const suffix = STAGE_NAME_SUFFIXES[stableInt(`name_suffix_${seed}`, STAGE_NAME_SUFFIXES.length)];
  const code = stableHash(seed).slice(0, 4).toUpperCase();
  return {
    identitySeed: stableHash(seed).slice(0, 16),
    displayName: `${prefix} ${suffix} ${code}`,
    profileSlug: `paris-${String(seed).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  };
}

function hashCell(lat, lng, precision) {
  const y = Math.floor(lat * precision);
  const x = Math.floor(lng * precision);
  return `${x}_${y}`;
}

function loadAnchors() {
  const pathFile = path.resolve(__dirname, '../../data/paris_anchors.json');
  console.log(`[seed] Loading anchors from: ${pathFile}`);
  if (!fs.existsSync(pathFile)) {
    throw new Error("Missing data/paris_anchors.json. Please generate anchors first by running download-ban-75.js");
  }

  const unique = new Map();
  const anchors = JSON.parse(fs.readFileSync(pathFile, "utf8"));
  for (const anchor of anchors) {
    if (!anchor?.id || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lng)) continue;
    if (!isInsideParis(anchor.lat, anchor.lng)) continue;
    if (!unique.has(anchor.id)) unique.set(anchor.id, anchor);
  }
  return [...unique.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function capNanoGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.nano_cluster_id)) groups.set(row.nano_cluster_id, []);
    groups.get(row.nano_cluster_id).push(row);
  }

  for (const [key, group] of groups) {
    if (group.length <= MAX_NANO_SIZE) continue;
    const bucketCount = Math.ceil(group.length / MAX_NANO_SIZE);
    group.forEach((row, idx) => {
      row.nano_cluster_id = `${key}_b${idx % bucketCount}`;
    });
  }
}

async function runSchemaAlters(client) {
  console.log("[schema] Altering table public.mock_artists if needed...");
  await client.query(`
    ALTER TABLE public.mock_artists
    ADD COLUMN IF NOT EXISTS anchor_type text,
    ADD COLUMN IF NOT EXISTS anchor_id text,
    ADD COLUMN IF NOT EXISTS render_rank integer,
    ADD COLUMN IF NOT EXISTS source_quality text,
    ADD COLUMN IF NOT EXISTS placement_quality text,
    ADD COLUMN IF NOT EXISTS address_id text,
    ADD COLUMN IF NOT EXISTS identity_seed text,
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS profile_slug text,
    ADD COLUMN IF NOT EXISTS artist_rank text,
    ADD COLUMN IF NOT EXISTS rank_score integer,
    ADD COLUMN IF NOT EXISTS grade_stars integer CHECK (grade_stars BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS grade_tier text,
    ADD COLUMN IF NOT EXISTS grade_color text,
    ADD COLUMN IF NOT EXISTS grade_assigned_at timestamptz,
    ADD COLUMN IF NOT EXISTS grade_source text;
  `);
  await client.query("CREATE INDEX IF NOT EXISTS mock_artists_address_id_idx ON public.mock_artists(address_id)");
  await client.query("CREATE INDEX IF NOT EXISTS mock_artists_render_rank_idx ON public.mock_artists(render_rank)");
  await client.query("CREATE INDEX IF NOT EXISTS mock_artists_rank_score_idx ON public.mock_artists(rank_score)");
  console.log("[schema] Columns and indexes verified successfully.");
}

function createArtistFromAddress(anchor) {
  const { type: anchorType, quality } = getAnchorTypeAndQuality(anchor);
  const rankScore = createRankScore(anchor.id);
  const identity = createIdentity(anchor);
  const grade = createGrade(anchor.id);
  const lat = Number(anchor.lat.toFixed(7));
  const lng = Number(anchor.lng.toFixed(7));

  const macro = hashCell(lat, lng, 18);
  const mid = hashCell(lat, lng, 35);
  const local = hashCell(lat, lng, 75);
  const micro = hashCell(lat, lng, 160);
  const nano = hashCell(lat, lng, 420);

  return {
    city: "Paris",
    district: anchor.district || "Paris",
    zone_name: anchor.zone_name || anchor.district || "Paris",
    address_label: anchor.label || "Adresse Paris",
    lat,
    lng,
    instrument: getInstrument(anchor.id),
    avatar_id: getAvatarId(anchor.id),
    country_cluster_id: "country_france",
    city_cluster_id: "city_paris",
    macro_cluster_id: `paris_macro_${macro}`,
    mid_cluster_id: `paris_mid_${mid}`,
    local_cluster_id: `paris_local_${local}`,
    micro_cluster_id: `paris_micro_${micro}`,
    nano_cluster_id: `paris_nano_${nano}`,
    anchor_type: anchorType,
    anchor_id: anchor.id,
    render_rank: createRenderRank(anchor.id, rankScore),
    source_quality: quality,
    placement_quality: "exact_ban_address",
    address_id: anchor.id,
    identity_seed: identity.identitySeed,
    display_name: identity.displayName,
    profile_slug: identity.profileSlug,
    artist_rank: getRankTier(rankScore),
    rank_score: rankScore,
    grade_stars: grade.gradeStars,
    grade_tier: grade.gradeTier,
    grade_color: grade.gradeColor,
    grade_assigned_at: new Date(),
    grade_source: grade.gradeSource
  };
}

async function insertArtists(client, artists) {
  console.log(`[seed] Inserting exact-address mock data in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < artists.length; i += BATCH_SIZE) {
    const batch = artists.slice(i, i + BATCH_SIZE);
    const valueStrings = [];
    const values = [];
    let paramIdx = 1;

    for (const row of batch) {
      valueStrings.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12}, $${paramIdx + 13}, $${paramIdx + 14}, $${paramIdx + 15}, $${paramIdx + 16}, $${paramIdx + 17}, $${paramIdx + 18}, $${paramIdx + 19}, $${paramIdx + 20}, $${paramIdx + 21}, $${paramIdx + 22}, $${paramIdx + 23}, $${paramIdx + 24}, $${paramIdx + 25}, $${paramIdx + 26}, $${paramIdx + 27}, $${paramIdx + 28}, $${paramIdx + 29}, $${paramIdx + 30})`);
      values.push(
        row.city, row.district, row.zone_name, row.address_label,
        row.lat, row.lng, row.instrument, row.avatar_id,
        row.country_cluster_id, row.city_cluster_id, row.macro_cluster_id,
        row.mid_cluster_id, row.local_cluster_id, row.micro_cluster_id,
        row.nano_cluster_id, row.anchor_type, row.anchor_id,
        row.render_rank, row.source_quality, row.placement_quality,
        row.address_id, row.identity_seed, row.display_name, row.profile_slug,
        row.artist_rank, row.rank_score, row.grade_stars, row.grade_tier,
        row.grade_color, row.grade_assigned_at, row.grade_source
      );
      paramIdx += 31;
    }

    await client.query(`
      INSERT INTO public.mock_artists (
        city, district, zone_name, address_label, lat, lng, instrument, avatar_id,
        country_cluster_id, city_cluster_id, macro_cluster_id, mid_cluster_id,
        local_cluster_id, micro_cluster_id, nano_cluster_id, anchor_type, anchor_id,
        render_rank, source_quality, placement_quality, address_id, identity_seed,
        display_name, profile_slug, artist_rank, rank_score,
        grade_stars, grade_tier, grade_color, grade_assigned_at, grade_source
      ) VALUES ${valueStrings.join(', ')}
    `, values);
    console.log(`[seed] Inserted ${Math.min(i + BATCH_SIZE, artists.length)} / ${artists.length}`);
  }
}

async function validateSeed(client, expectedTotal) {
  const totalParisRes = await client.query("SELECT count(*)::int as total FROM public.mock_artists WHERE city = 'Paris'");
  console.log(`[validation] Total Paris artists: ${totalParisRes.rows[0].total} (Expected: ${expectedTotal})`);

  const exactAddressRes = await client.query(`
    SELECT
      count(*)::int as total,
      count(distinct address_id)::int as addresses,
      count(distinct (lat::text || ',' || lng::text))::int as distinct_coords,
      min(rank_score)::int as min_rank_score,
      max(rank_score)::int as max_rank_score
    FROM public.mock_artists
    WHERE city = 'Paris'
  `);
  console.log("[validation] Address identity stats:");
  console.table(exactAddressRes.rows);

  const rankRes = await client.query(`
    SELECT artist_rank, count(*)::int as total
    FROM public.mock_artists
    WHERE city = 'Paris'
    GROUP BY artist_rank
    ORDER BY total DESC
  `);
  console.log("[validation] Rank tier distribution:");
  console.table(rankRes.rows);

  const gradeRes = await client.query(`
    SELECT
      count(*)::int as total_artists,
      count(*) filter (where grade_stars is null)::int as missing_grade_count,
      count(*) filter (where grade_stars = 1)::int as grade_1_count,
      count(*) filter (where grade_stars = 2)::int as grade_2_count,
      count(*) filter (where grade_stars = 3)::int as grade_3_count,
      count(*) filter (where grade_stars = 4)::int as grade_4_count,
      count(*) filter (where grade_stars = 5)::int as grade_5_count
    FROM public.mock_artists
    WHERE city = 'Paris'
  `);
  console.log("[MEEWAV_ARTIST_GRADES_AUDIT]");
  console.table(gradeRes.rows);

  const nanoClustersRes = await client.query(`
    SELECT nano_cluster_id, count(*)::int as total
    FROM public.mock_artists
    WHERE city = 'Paris'
    GROUP BY nano_cluster_id
    ORDER BY total DESC
    LIMIT 10
  `);
  console.log("[validation] Top 10 largest Nano Clusters (Max should be <= 40):");
  console.table(nanoClustersRes.rows);
}

async function main() {
  const anchors = loadAnchors();
  const selectedAnchors = ARTIST_LIMIT > 0 ? anchors.slice(0, ARTIST_LIMIT) : anchors;
  console.log(`[seed] Loaded ${anchors.length} valid Paris BAN addresses.`);
  console.log(`[seed] Generating ${selectedAnchors.length} stable exact-address artists.`);

  if (selectedAnchors.length === 0) {
    throw new Error("No Paris BAN addresses loaded.");
  }

  const artists = selectedAnchors.map(createArtistFromAddress);
  capNanoGroups(artists);

  const localBackupPath = path.resolve(__dirname, '../../data/paris_mock_artists_v2.json');
  fs.writeFileSync(localBackupPath, JSON.stringify(artists, null, 2), "utf8");
  console.log(`[seed] Saved local backup JSON copy to: ${localBackupPath}`);

  const client = await pool.connect();
  try {
    await runSchemaAlters(client);

    console.log("[seed] Deleting old Paris mock artists...");
    const deleteRes = await client.query("DELETE FROM public.mock_artists WHERE city = $1", ["Paris"]);
    console.log(`[seed] Deleted ${deleteRes.rowCount} old rows.`);

    await insertArtists(client, artists);
    await validateSeed(client, artists.length);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("ERROR running exact-address Paris seed script:", err);
  process.exit(1);
});
