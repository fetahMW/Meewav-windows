/**
 * Canonical demo identities used by La Scène.
 *
 * This is the single source of truth for an artist's public identity in the
 * video catalog. Posters remain artwork for a publication; portraits are
 * reused from MeeWav's existing Tremplin portrait bank and never derived from
 * a video thumbnail.
 */

export type SceneDemoArtistGrade = 1 | 2 | 3 | 4 | 5 | 6;

export type SceneDemoArtistProfile = {
  artistId: string;
  name: string;
  portrait: string;
  role: string;
  style: string;
  city: string;
  gradeLevel: SceneDemoArtistGrade;
  isAiArtist?: boolean;
};

type SceneDemoArtistRow = readonly [
  name: string,
  portrait: string,
  role: string,
  style: string,
  city: string,
  gradeLevel: SceneDemoArtistGrade,
  isAiArtist?: boolean,
];

const SCENE_DEMO_ARTIST_ROWS = [
  ["NAYA K.", "/images/tremplin/artists/generated/naya-oris-boom-bap-rapper-grenoble-v1.webp", "Rappeuse · Autrice", "Hip-hop", "Grenoble", 3],
  ["KÉO", "/images/tremplin/artists/generated/artist-modern-rai-singer-nassim-halim.webp", "Chanteur · Interprète", "Raï", "Marseille", 4],
  ["SOLEN", "/images/tremplin/artists/generated/ai-ambient-composer-naoko-serein.webp", "Compositrice · Productrice", "Électro", "Paris", 5, true],
  ["AZUR", "/images/tremplin/artists/generated/idriss-noor-oud-compositeur-paris-v1.webp", "Oudiste · Compositeur", "Gnawa", "Paris", 4],
  ["LORNS", "/images/tremplin/artists/generated/artist-tuareg-rock-singer-bilal-dune.webp", "Chanteur · Guitariste", "Rock", "Montreuil", 3],
  ["YUNA", "/images/tremplin/artists/generated/kelya-v-urban-pop-toulouse-v1.webp", "Chanteuse · Interprète", "Pop", "Toulouse", 2],
  ["MALIK NOX", "/images/tremplin/artists/generated/malik-soren-chanteur-soul-strasbourg-v1.webp", "Chanteur · Auteur", "Soul", "Strasbourg", 4],
  ["ALYA FLOW", "/images/tremplin/artists/generated/ai-afrofuturist-artist-amina-sola.webp", "Chanteuse · Productrice", "Afrobeat", "Dakar", 3, true],
  ["NOAM A.", "/images/tremplin/artists/generated/noa-prism-live-coding-nonbinary-paris-v1.webp", "Live coder · Producteur", "Techno", "Paris", 5],
  ["LINA V.", "/images/tremplin/artists/generated/liora-fado-rappeuse-drill-toulouse-v1.webp", "Rappeuse · Autrice", "Trap", "Toulouse", 2],
  ["MAEVA SOL", "/images/tremplin/artists/generated/mina-roze-pop-soul-lyon-v1.webp", "Chanteuse · Interprète", "R&B", "Lyon", 5],
  ["YASSINE B.", "/images/tremplin/artists/generated/yacine-kermor-accordeoniste-electro-clermont-ferrand-v1.webp", "Accordéoniste · Producteur", "House", "Clermont-Ferrand", 3],
  ["NOVA KEYS", "/images/tremplin/artists/generated/thea-novak-pianist-nancy-v2.webp", "Pianiste · Compositrice", "Classique", "Nancy", 6],
  ["SAYA RHYTHM", "/images/tremplin/artists/generated/mariam-delta-productrice-gqom-roubaix-v1.webp", "Productrice · DJ", "Amapiano", "Roubaix", 4],
  ["ELIO M.", "/images/tremplin/artists/generated/elio-serra-ingenieur-son-montpellier-v1.webp", "Ingénieur son · Producteur", "Drum & Bass", "Montpellier", 5],
  ["JUNE VELVET", "/images/tremplin/artists/generated/june-kairo-dj-drum-bass-amiens-v1.webp", "DJ · Curatrice", "Drum & Bass", "Amiens", 3],
  ["KORA N.", "/images/tremplin/artists/generated/adrien-kora-afro-jazz-saint-denis-v1.webp", "Saxophoniste · Compositeur", "Jazz", "Saint-Denis", 4],
  ["SACHA BEAT", "/images/tremplin/artists/generated/ai-beatmaker-kairo-grid.webp", "Beatmaker · Producteur", "Rap", "Nanterre", 2, true],
  ["MILO S.", "/images/tremplin/artists/generated/milo-kanza-double-bassist-dijon-v1.webp", "Contrebassiste · Compositeur", "Blues", "Dijon", 4],
  ["INES K.", "/images/tremplin/artists/generated/ines-raku-drummer-marseille-v1.webp", "Batteuse · Interprète", "Metal", "Marseille", 3],
  ["AMIRA SEN", "/images/tremplin/artists/generated/anjali-veyra-danseuse-choregraphe-nice-v1.webp", "Danseuse · Chorégraphe", "Reggaeton", "Nice", 4],
  ["TESSA WAVE", "/images/tremplin/artists/generated/tess-aoki-music-video-director-vj-rennes-v1.webp", "VJ · Réalisatrice", "Indie", "Rennes", 5],
  ["LEÏLA R.", "/images/tremplin/artists/wall-2026/leila-nouri-rai-pop-lyon-v1.webp", "Chanteuse · Autrice", "Raï", "Lyon", 3],
  ["ENZO DRUMS", "/images/tremplin/artists/generated/artist-alt-metal-drummer-kenji-ravel.webp", "Batteur · Directeur musical", "Metal", "Lille", 4],
  ["MAYA N.", "/images/tremplin/artists/maya-chen-studio-v1.webp", "Sitariste · Compositrice", "Classique", "Bruxelles", 5],
  ["DARIO BLUE", "/images/tremplin/artists/wall-2026/dario-silva-latin-pop-perpignan-v1.webp", "Chanteur · Guitariste", "Reggaeton", "Perpignan", 2],
  ["NAËL", "/images/tremplin/artists/generated/ai-film-composer-nabil-orsen.webp", "Compositeur à l’image", "Néo-classique", "Genève", 5, true],
  ["MEL ROSE", "/images/tremplin/artists/generated/ai-synth-rnb-singer-luma-vale.webp", "Chanteuse · Topliner", "R&B", "Lille", 3, true],
  ["ISAAC LOW", "/images/tremplin/artists/generated/ilyes-pulse-beatboxer-cergy-v1.webp", "Beatboxer · Performer", "Hip-hop", "Cergy", 2],
  ["ROXANE V.", "/images/tremplin/artists/generated/rania-vox-lyric-electro-singer-avignon-v1.webp", "Chanteuse · Interprète", "Électro", "Avignon", 4],
  ["LÉONIE V.", "/images/tremplin/artists/generated/louna-saphir-violoncelliste-neo-classique-metz-v1.webp", "Violoncelliste · Arrangeuse", "Néo-classique", "Metz", 5],
  ["RAYAN K.", "/images/tremplin/artists/wall-2026/rayan-sable-chanson-soul-toulouse-v1.webp", "Chanteur · Auteur", "Soul", "Toulouse", 3],
  ["MERYEM NOOR", "/images/tremplin/artists/wall-2026/meryem-kaal-indie-rai-montpellier-v1.webp", "Chanteuse · Autrice", "Chaâbi", "Montpellier", 4],
  ["JONAS REED", "/images/tremplin/artists/generated/artist-afrobeat-trumpeter-jonas-reef.webp", "Trompettiste · Compositeur", "Afrobeat", "Dakar", 5],
  ["ANISSA WAVE", "/images/tremplin/artists/generated/aina-sol-dj-productrice-afro-house-bordeaux-v1.webp", "DJ · Productrice", "House", "Bordeaux", 4],
  ["SAMIR KORA", "/images/tremplin/artists/generated/samir-octave-chanteur-funk-orleans-v1.webp", "Chanteur · Auteur", "Funk", "Orléans", 3],
  ["CLAIRE NOVA", "/images/tremplin/artists/generated/clara-volt-sound-design-v1.webp", "Sound designer · Productrice", "Techno", "Paris", 5],
  ["IBRA DRUMS", "/images/tremplin/artists/generated/idriss-ngoma-percussionniste-world-rennes-v1.webp", "Percussionniste · Performer", "Gnawa", "Rennes", 3],
  ["MAÏA SOUL", "/images/tremplin/artists/wall-2026/valerie-dias-soul-jazz-nancy-v1.webp", "Chanteuse · Interprète", "Jazz", "Nancy", 5],
  ["NILS ARCO", "/images/tremplin/artists/generated/nils-bensaid-trompettiste-jazz-paris-v1.webp", "Trompettiste · Improvisateur", "Jazz", "Paris", 6],
  ["KENZA BLUE", "/images/tremplin/artists/generated/kenza-loba-dj-amapiano-aubervilliers-v1.webp", "DJ · Productrice", "Amapiano", "Aubervilliers", 4],
  ["LOÏC TEMPO", "/images/tremplin/artists/generated/leon-vasseur-music-director-rouen-v1.webp", "Directeur musical · Arrangeur", "Pop", "Rouen", 5],
  ["INESA M.", "/images/tremplin/artists/generated/ilyne-k-rappeuse-drill-lille-v1.webp", "Rappeuse · Autrice", "Rap", "Lille", 3],
  ["SOFIANE LOW", "/images/tremplin/artists/generated/oumar-lines-reggae-bassist-fort-de-france-v1.webp", "Bassiste · Compositeur", "Reggae", "Fort-de-France", 4],
  ["ZORA KEYS", "/images/tremplin/artists/generated/cassandre-bleu-harp-strasbourg-v1.webp", "Harpiste · Compositrice", "Classique", "Strasbourg", 5],
  ["MALO BEAT", "/images/tremplin/professions/mael-nox-beatmaker-saint-denis-v1.webp", "Beatmaker · Producteur", "Trap", "Saint-Denis", 2],
  ["HANA BRASS", "/images/tremplin/artists/generated/imani-kader-saxophonist-montpellier-v1.webp", "Saxophoniste · Improvisatrice", "Jazz", "Montpellier", 4],
  ["ELIAS NOX", "/images/tremplin/artists/generated/eliott-marek-modular-producer-poitiers-v1.webp", "Producteur modulaire", "Techno", "Poitiers", 5],
  ["AVA SUNDAY", "/images/tremplin/artists/generated/artist-folk-songwriter-alba-roche.webp", "Autrice · Guitariste", "Indie", "Nantes", 3],
  ["NOÉ RHYTHM", "/images/tremplin/artists/generated/artist-reggae-dub-singer-noah-belair.webp", "Chanteur · Auteur", "Reggae", "Marseille", 3],
  ["SELMA K.", "/images/tremplin/artists/generated/ai-rap-artist-samra-flux.webp", "Rappeuse · Interprète", "Rap", "Paris", 4, true],
  ["ALEX VELVET", "/images/tremplin/artists/wall-2026/alex-serein-art-pop-paris-v1.webp", "Chanteur · Auteur", "Pop", "Paris", 4],
  ["MOUNA FLOW", "/images/tremplin/artists/generated/aicha-sol-coach-vocal-gospel-nimes-v1.webp", "Coach vocal · Chanteuse", "Soul", "Nîmes", 5],
  ["THÉO JUNE", "/images/tremplin/artists/wall-2026/theo-lune-alt-pop-angers-v1.webp", "Chanteur · Compositeur", "Indie", "Angers", 3],
  ["LINA KORA", "/images/tremplin/artists/generated/maia-kuroda-violoniste-neo-classique-nantes-v1.webp", "Violoniste · Arrangeuse", "Néo-classique", "Nantes", 6],
  ["ADAM SILLAGE", "/images/tremplin/artists/generated/hugo-quartz-chanteur-shoegaze-le-mans-v1.webp", "Chanteur · Guitariste", "Rock", "Le Mans", 3],
  ["NORA A.", "/images/tremplin/professions/nora-valen-art-director-lille-v1.webp", "Directrice artistique", "Blues", "Lille", 5],
  ["YASSA GROOVE", "/images/tremplin/artists/wall-2026/yasmine-dune-amapiano-dj-lyon-v1.webp", "DJ · Productrice", "Amapiano", "Lyon", 4],
  ["MILA R.", "/images/tremplin/artists/generated/miko-reve-productrice-hyperpop-paris-v1.webp", "Productrice · Chanteuse", "Électro", "Paris", 3],
  ["KARIM WAVE", "/images/tremplin/artists/generated/gael-ferran-guitariste-flamenco-jazz-perpignan-v1.webp", "Guitariste · Compositeur", "Blues", "Perpignan", 5],
] as const satisfies readonly SceneDemoArtistRow[];

function artistSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const SCENE_DEMO_ARTISTS: readonly SceneDemoArtistProfile[] = SCENE_DEMO_ARTIST_ROWS.map(
  ([name, portrait, role, style, city, gradeLevel, isAiArtist]) => ({
    artistId: `shorts-${artistSlug(name)}`,
    name,
    portrait,
    role,
    style,
    city,
    gradeLevel,
    ...(isAiArtist ? { isAiArtist: true } : {}),
  }),
);

export type SceneDemoArtistName = (typeof SCENE_DEMO_ARTIST_ROWS)[number][0];

export const SCENE_DEMO_ARTIST_BY_NAME = Object.fromEntries(
  SCENE_DEMO_ARTISTS.map((artist) => [artist.name, artist]),
) as Record<SceneDemoArtistName, SceneDemoArtistProfile>;

/** Backwards-compatible portrait lookup consumed by profile and card views. */
export const SCENE_ARTIST_PORTRAITS = Object.fromEntries(
  SCENE_DEMO_ARTISTS.map((artist) => [artist.name, artist.portrait]),
) as Record<SceneDemoArtistName, string>;

export function sceneDemoArtist(artist: string): SceneDemoArtistProfile | undefined {
  return SCENE_DEMO_ARTIST_BY_NAME[artist as SceneDemoArtistName];
}

export function sceneArtistPortrait(artist: string): string | undefined {
  return sceneDemoArtist(artist)?.portrait;
}
