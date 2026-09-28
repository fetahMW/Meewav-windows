import { SCENE_DEMO_ARTISTS } from "./reference/features/shorts/sceneArtistPortraits";

// Editorial demo order, independent of grades and of the map's active filters.
// Replace this fixture when the national ranking service is connected.
const DEMO_ORDER = ["NOVA KEYS", "MALIK NOX", "JUNE VELVET", "NAYA K.", "KORA N.",
  "AMIRA SEN", "ELIO M.", "SAYA RHYTHM", "TESSA WAVE", "INES K."];
export const ARTISTS = DEMO_ORDER.flatMap(name => {
  const artist = SCENE_DEMO_ARTISTS.find(item => item.name === name);
  if (!artist) return [];
  const file = artist.portrait.split("/").pop()!;
  return [{ ...artist, slug: file.replace(/\.webp$/, ""),
    portraitUrl: new URL(`ui/ring-portraits/${file}`, document.baseURI).href }];
});

export const NATIONAL_TOP_ONE = ARTISTS[0];

