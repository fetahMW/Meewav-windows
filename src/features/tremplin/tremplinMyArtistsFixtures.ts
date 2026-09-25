import type { TremplinArtist } from "./tremplinArtistData";

export type MyArtistsFixtureId = "populated" | "followingOnly" | "empty";

export type MyArtistsHoldingFixture = {
  artistId: string;
  ticker: string;
  tokenPrice: string;
  change24hPercent: number;
  quantityHeld: string;
  estimatedValue: string;
  purchaseCost: string;
  estimatedDifference: string;
  latestProjectUpdate: string;
  updatedAt: string;
};

export type MyArtistsActivityFixture = {
  id: string;
  artistId: string;
  type: "creation" | "project" | "grade" | "room" | "token" | "verification";
  dateLabel: string;
  title: string;
  description: string;
  anchorId: string;
};

export type MyArtistsRoomFixture = {
  id: string;
  artistId: string;
  title: string;
  dateLabel: string;
  interestedCount: number;
};

export type MyArtistsWatchFixture = {
  artistId: string;
  label: string;
  detail: string;
  action: string;
  anchorId: string;
};

export type MyArtistsFixture = {
  id: MyArtistsFixtureId;
  summary: {
    estimatedCurrentValue: string;
    totalPurchaseCost: string;
    estimatedDifference: string;
    change24hPercent: number;
    activeTokenCount: number;
    followedArtistsCount: number;
    unreadUpdatesCount: number;
    upcomingRoomsCount: number;
  };
  holdings: readonly MyArtistsHoldingFixture[];
  followedArtistIds: readonly string[];
  activities: readonly MyArtistsActivityFixture[];
  rooms: readonly MyArtistsRoomFixture[];
  watch: readonly MyArtistsWatchFixture[];
};

const DEMO_ACTIVITIES: readonly MyArtistsActivityFixture[] = [
  { id: "activity-lunae-harmonies", artistId: "lunae", type: "project", dateLabel: "Aujourd’hui · 08:20", title: "Les harmonies de l’EP sont enregistrées.", description: "Une nouvelle étape du premier EP vient d’être documentée.", anchorId: "profile-journey" },
  { id: "activity-maya-collaboration", artistId: "maya-chen", type: "project", dateLabel: "Aujourd’hui · 08:18", title: "Une collaboration vient d’être confirmée.", description: "Le projet accueille une nouvelle voix pour la prochaine session.", anchorId: "profile-project" },
  { id: "activity-maia-session", artistId: "maia-kuroda", type: "creation", dateLabel: "Hier · 19:40", title: "Une session audiovisuelle a été publiée.", description: "Le nouveau format relie performance de cordes et création visuelle.", anchorId: "profile-creations" },
  { id: "activity-mina-launch", artistId: "mina-roze", type: "token", dateLabel: "Hier · 15:10", title: "Le lancement de son jeton se prépare.", description: "Aucune opération n’est encore disponible.", anchorId: "profile-support" },
  { id: "activity-neo-review", artistId: "neo-sillage", type: "verification", dateLabel: "4 août · 11:30", title: "La demande est toujours en vérification.", description: "Aucun prix n’est affiché avant une éventuelle activation.", anchorId: "profile-support" },
];

const DEMO_ROOMS: readonly MyArtistsRoomFixture[] = [
  { id: "room-maia-studio", artistId: "maia-kuroda", title: "Cordes et images en direct", dateLabel: "12 août · 20 h", interestedCount: 284 },
  { id: "room-maya-production", artistId: "maya-chen", title: "De la boucle brute au morceau", dateLabel: "14 août · 18 h", interestedCount: 806 },
];

export const populatedMyArtistsFixture: MyArtistsFixture = {
  id: "populated",
  summary: {
    estimatedCurrentValue: "186.06",
    totalPurchaseCost: "160.00",
    estimatedDifference: "26.06",
    change24hPercent: 3.1,
    activeTokenCount: 3,
    followedArtistsCount: 6,
    unreadUpdatesCount: 8,
    upcomingRoomsCount: 2,
  },
  holdings: [
    { artistId: "lunae", ticker: "LUNAE", tokenPrice: "0.84", change24hPercent: 3.2, quantityHeld: "52.40", estimatedValue: "44.02", purchaseCost: "37.50", estimatedDifference: "6.52", latestProjectUpdate: "Les harmonies de l’EP ont été enregistrées.", updatedAt: "2026-08-06T08:20:00+02:00" },
    { artistId: "maya-chen", ticker: "MAYA", tokenPrice: "1.52", change24hPercent: 6.1, quantityHeld: "30.21", estimatedValue: "45.92", purchaseCost: "39.50", estimatedDifference: "6.42", latestProjectUpdate: "Une nouvelle collaboration a été confirmée.", updatedAt: "2026-08-06T08:18:00+02:00" },
    { artistId: "maia-kuroda", ticker: "MAIAK", tokenPrice: "0.54", change24hPercent: -0.8, quantityHeld: "178.00", estimatedValue: "96.12", purchaseCost: "83.00", estimatedDifference: "13.12", latestProjectUpdate: "La prochaine Room a été annoncée.", updatedAt: "2026-08-06T08:15:00+02:00" },
  ],
  followedArtistIds: ["lunae", "maya-chen", "maia-kuroda", "mina-roze", "neo-sillage", "sama-k"],
  activities: DEMO_ACTIVITIES,
  rooms: DEMO_ROOMS,
  watch: [
    { artistId: "mina-roze", label: "Lancement prochain", detail: "Aucune opération n’est encore disponible.", action: "Comprendre le lancement", anchorId: "profile-support" },
    { artistId: "neo-sillage", label: "Vérification en cours", detail: "Aucun prix n’est affiché avant l’activation.", action: "Voir l’état", anchorId: "profile-support" },
    { artistId: "sama-k", label: "Parcours à consulter", detail: "Le projet continue de documenter ses prochaines étapes.", action: "Voir le parcours", anchorId: "profile-journey" },
  ],
};

export const followingOnlyMyArtistsFixture: MyArtistsFixture = {
  ...populatedMyArtistsFixture,
  id: "followingOnly",
  summary: { ...populatedMyArtistsFixture.summary, estimatedCurrentValue: "0.00", totalPurchaseCost: "0.00", estimatedDifference: "0.00", change24hPercent: 0, activeTokenCount: 0 },
  holdings: [],
};

export const emptyMyArtistsFixture: MyArtistsFixture = {
  id: "empty",
  summary: { estimatedCurrentValue: "0.00", totalPurchaseCost: "0.00", estimatedDifference: "0.00", change24hPercent: 0, activeTokenCount: 0, followedArtistsCount: 0, unreadUpdatesCount: 0, upcomingRoomsCount: 0 },
  holdings: [],
  followedArtistIds: [],
  activities: [],
  rooms: [],
  watch: [],
};

export const MY_ARTISTS_FIXTURES: Readonly<Record<MyArtistsFixtureId, MyArtistsFixture>> = {
  populated: populatedMyArtistsFixture,
  followingOnly: followingOnlyMyArtistsFixture,
  empty: emptyMyArtistsFixture,
};

/** Builds the non-financial dashboard from the artist data actually loaded by the page. */
export function buildMyArtistsFixtureFromFollows(artists: readonly TremplinArtist[]): MyArtistsFixture {
  if (artists.length === 0) return emptyMyArtistsFixture;
  const activities = artists.flatMap((artist) => artist.updates.map((update) => ({
    id: `follow-${artist.id}-${update.id}`,
    artistId: artist.id,
    type: "project" as const,
    dateLabel: update.dateLabel,
    title: update.title,
    description: update.summary,
    anchorId: `etape-${update.id}`,
  })));
  return {
    id: "followingOnly",
    summary: {
      estimatedCurrentValue: "0.00",
      totalPurchaseCost: "0.00",
      estimatedDifference: "0.00",
      change24hPercent: 0,
      activeTokenCount: 0,
      followedArtistsCount: artists.length,
      unreadUpdatesCount: activities.length,
      upcomingRoomsCount: 0,
    },
    holdings: [],
    followedArtistIds: artists.map(({ id }) => id),
    activities,
    rooms: [],
    watch: [],
  };
}

export function getMyArtistsFixture(search: string, fallback: MyArtistsFixtureId = "populated"): MyArtistsFixture {
  const requested = new URLSearchParams(search).get("tremplinFixture");
  if (requested === "followingOnly" || requested === "empty" || requested === "populated") {
    return MY_ARTISTS_FIXTURES[requested];
  }
  return MY_ARTISTS_FIXTURES[fallback];
}
