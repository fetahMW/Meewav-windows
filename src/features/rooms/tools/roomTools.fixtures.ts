import { PLACE_DEMO_PROFILES } from "../place/place.fixtures";
import type {
  CageState,
  ClasseState,
  GiftState,
  LogeState,
  RoomPerson,
  RoomToolsState,
  SceneState,
  SpecializedRoomId,
  WaveState,
} from "./roomTools.types";

const AVATARS = [
  "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=160&q=82",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=82",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=82",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=82",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=82",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=82",
] as const;

function person(id: string, name: string, role: string, index: number, patch: Partial<RoomPerson> = {}): RoomPerson {
  return {
    id,
    name,
    role,
    avatarUrl: AVATARS[index % AVATARS.length],
    microphone: "ready",
    camera: "ready",
    ...patch,
  };
}

const CLASS_PORTRAIT_IDS = [2, 3, 4, 6, 7, 14, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 31, 28, 35, 38, 37, 32, 36] as const;

function classPerson(id: string, name: string, role: string, index: number, patch: Partial<RoomPerson> = {}): RoomPerson {
  const portraitId = CLASS_PORTRAIT_IDS[index % CLASS_PORTRAIT_IDS.length];
  return person(id, name, role, index, {
    avatarUrl: `/images/preprofile/portraits/profile-${String(portraitId).padStart(2, "0")}.webp`,
    gradeLevel: ((index % 6) + 1) as RoomPerson["gradeLevel"],
    ...patch,
  });
}

export const ROOM_TOOL_PEOPLE = {
  scene: [
    person("scene-a", "Naya Oris", "Chanteuse", 2, { avatarUrl: PLACE_DEMO_PROFILES.host.avatarUrl, gradeLevel: PLACE_DEMO_PROFILES.host.gradeLevel as RoomPerson["gradeLevel"] }),
    person("scene-b", "Lior Benali", "Guitariste", 5, { avatarUrl: PLACE_DEMO_PROFILES.guestA.avatarUrl, gradeLevel: PLACE_DEMO_PROFILES.guestA.gradeLevel as RoomPerson["gradeLevel"] }),
    person("scene-c", "Malik Soren", "Chanteur Soul", 6, { avatarUrl: PLACE_DEMO_PROFILES.guestB.avatarUrl, gradeLevel: PLACE_DEMO_PROFILES.guestB.gradeLevel as RoomPerson["gradeLevel"] }),
    person("scene-d", "Collectif Neon", "Collectif de danse", 0, { avatarUrl: "/images/tremplin/artists/generated/sekou-mare-danseur-choregraphe-marseille-v1.webp", gradeLevel: 3 }),
    person("scene-e", "June Kairo", "DJ Drum & Bass", 0, { avatarUrl: PLACE_DEMO_PROFILES.viewerB.avatarUrl, gradeLevel: PLACE_DEMO_PROFILES.viewerB.gradeLevel as RoomPerson["gradeLevel"] }),
    person("scene-duo", "Naya Oris × Malik Soren", "Duo soul", 2, { avatarUrl: PLACE_DEMO_PROFILES.host.avatarUrl, gradeLevel: PLACE_DEMO_PROFILES.host.gradeLevel as RoomPerson["gradeLevel"] }),
  ],
  classe: [
    classPerson("class-teacher", "Maya Laurent", "Professeure", 22),
    classPerson("class-01", "Sofia N.", "Place premium", 0, { place: 1, access: "Premium" }),
    classPerson("class-02", "Noé Rivière", "Place payante", 1, { place: 2, access: "Payant", camera: "off" }),
    classPerson("class-03", "Inès K.", "Invitation privée", 2, { place: 3, access: "Invité privé" }),
    classPerson("class-04", "Sam Bako", "Accès accordé", 3, { place: 4, access: "Accordé manuellement" }),
    classPerson("class-05", "Lina Parks", "Place premium", 4, { place: 5, access: "Premium" }),
    classPerson("class-06", "Téo Mars", "Place payante", 5, { place: 6, access: "Payant" }),
    classPerson("class-07", "Mélissa Sun", "Invitation privée", 6, { place: 7, access: "Invité privé" }),
    classPerson("class-08", "Ilyes Beat", "Place premium", 7, { place: 8, access: "Premium", camera: "off" }),
    classPerson("class-09", "Ana Sol", "Place premium", 8, { place: 9, access: "Premium" }),
    classPerson("class-10", "Yuna K.", "Place payante", 9, { place: 10, access: "Payant" }),
    classPerson("class-11", "Adam Lyric", "Place premium", 10, { place: 11, access: "Premium" }),
    classPerson("class-12", "Maëlle R.", "Accès accordé", 11, { place: 12, access: "Accordé manuellement", microphone: "muted" }),
    classPerson("class-13", "Sacha Beat", "Place premium", 12, { place: 13, access: "Premium" }),
    classPerson("class-14", "Jade Moon", "Invitation privée", 13, { place: 14, access: "Invité privé" }),
    classPerson("class-15", "Léo Keys", "Place payante", 14, { place: 15, access: "Payant" }),
    classPerson("class-16", "Nour A.", "Place premium", 15, { place: 16, access: "Premium" }),
    classPerson("class-17", "Alex R.", "Place premium", 16, { place: 17, access: "Premium", camera: "off" }),
    classPerson("class-18", "Maya D.", "Accès accordé", 17, { place: 18, access: "Accordé manuellement" }),
    classPerson("class-19", "Lucas V.", "Place payante", 18, { place: 19, access: "Payant" }),
    classPerson("class-20", "Zoe M.", "Place premium", 19, { place: 20, access: "Premium" }),
    classPerson("class-21", "Emma L.", "Place premium", 20, { place: 21, access: "Premium" }),
    classPerson("class-22", "Yannis B.", "Place payante", 21, { place: 22, access: "Payant" }),
    classPerson("class-23", "Clara P.", "Invitation privée", 22, { place: 23, access: "Invité privé" }),
    classPerson("class-24", "Raphaël T.", "Place premium", 23, { place: 24, access: "Premium" }),
  ],
  wave: [
    person("wave-a", "Eliott Waves", "Bassiste", 2, { avatarUrl: "/images/preprofile/portraits/profile-02.webp" }),
    person("wave-b", "Koda Sweep", "Producteur", 3, { avatarUrl: "/images/preprofile/portraits/profile-08.webp" }),
    person("wave-c", "Mina Lune", "Batteuse", 0, { avatarUrl: "/avatars/batteur-batteuse.png" }),
    person("wave-d", "BeatBuilder", "Beatmaker", 5, { avatarUrl: "/images/preprofile/portraits/profile-10.webp" }),
    person("wave-e", "Luca Maris", "Compositeur", 2, { avatarUrl: "/images/preprofile/portraits/profile-13.webp" }),
    person("wave-f", "Solstice", "Pianiste", 4, { avatarUrl: "/avatars/pianiste.png" }),
    person("wave-g", "Nyla Vox", "Chanteuse", 0, { avatarUrl: "/images/preprofile/portraits/profile-07.webp" }),
    person("wave-h", "June Kairo", "Percussionniste", 1, { avatarUrl: "/images/preprofile/portraits/profile-20.webp" }),
    person("wave-i", "Ayo Chrome", "Guitariste", 3, { avatarUrl: "/images/preprofile/portraits/profile-14.webp" }),
    person("wave-j", "Mira Flux", "Sound designer", 4, { avatarUrl: "/avatars/sound-designer.png" }),
    person("wave-k", "Soren Blue", "DJ", 5, { avatarUrl: "/images/preprofile/portraits/profile-05.webp" }),
    person("wave-l", "Iris Motion", "Autrice", 0, { avatarUrl: "/images/preprofile/portraits/profile-17.webp" }),
    person("wave-m", "Noam Brass", "Cuivres", 2, { avatarUrl: "/images/preprofile/portraits/profile-22.webp" }),
    person("wave-n", "Lena Air", "Instrumentiste", 1, { avatarUrl: "/images/preprofile/portraits/profile-27.webp" }),
    person("wave-o", "Romy Tape", "Ingénieure son", 4, { avatarUrl: "/images/preprofile/portraits/profile-30.webp" }),
  ],
  cage: [
    person("cage-a", "Riko North", "Rappeur", 2),
    person("cage-b", "Sasha Blaze", "Rappeuse", 0),
    person("cage-c", "Ayo K", "Beatboxer", 3),
    person("cage-d", "Lynx", "Freestyle", 5),
    person("cage-e", "Miko Seven", "Danseur", 1),
    person("cage-f", "Nox", "Rappeuse", 4),
    person("cage-g", "B-Kick", "Beatboxer", 3),
    person("cage-h", "Aya Tone", "Chanteuse", 0),
    person("cage-i", "Rook", "Producteur", 2),
    person("cage-j", "Zélie", "Violoniste", 1),
    person("cage-k", "K-Mel", "Freestyle", 4),
    person("cage-l", "Nova", "DJ", 5),
    person("cage-m", "Yoko", "Danseuse", 0),
    person("cage-n", "T-Jay", "Rappeur", 2),
    person("cage-o", "Sena", "Chanteuse", 1),
    person("cage-p", "Beat Léo", "Producteur", 3),
  ],
  loge: [
    person("loge-host", "Naya Oris", "Artiste légendaire", 0),
    person("loge-a", "Lou V.", "Membre VIP", 1, { avatarUrl: "/images/tremplin/artists/generated/ilyne-k-rappeuse-drill-lille-v1.webp" }),
    person("loge-b", "Yanis Flow", "Membre VIP", 2, { avatarUrl: "/images/tremplin/artists/generated/ilyes-pulse-beatboxer-cergy-v1.webp" }),
    person("loge-c", "Sofia Elan", "Membre VIP", 4, { avatarUrl: "/images/tremplin/artists/generated/miko-reve-productrice-hyperpop-paris-v1.webp" }),
    person("loge-d", "Maya Nox", "Membre de la Loge", 0, { avatarUrl: "/images/tremplin/artists/generated/naya-oris-boom-bap-rapper-grenoble-v1.webp" }),
    person("loge-e", "Léo Mar", "Membre de la Loge", 3, { avatarUrl: "/images/tremplin/artists/generated/adrien-kora-afro-jazz-saint-denis-v1.webp" }),
    person("loge-f", "Nina Vale", "Membre VIP", 5, { avatarUrl: "/images/tremplin/artists/generated/ai-rap-artist-samra-flux.webp" }),
  ],
} as const;

function giftState(roomId: string): GiftState {
  return {
    purchaseEnabled: false,
    transactions: [
      { id: "gift-demo-completed", idempotencyKey: "demo-completed", giftCode: "force-card", senderId: "meewav", recipientId: "demo-recipient", roomId, createdAt: "2026-08-16T21:45:00.000Z", mode: "direct", origin: "SYSTEM", status: "COMPLETED" },
      { id: "gift-demo-pending", idempotencyKey: "demo-pending", giftCode: "vip-pass", senderId: "demo-owner", recipientId: "demo-recipient", roomId, createdAt: "2026-08-16T23:05:00.000Z", mode: "direct", origin: "EARNED", status: "PENDING" },
    ],
    redemptions: [
      { id: "redemption-gift-demo-pending", transactionId: "gift-demo-pending", roomId, ownerId: "demo-recipient", kind: "vip-moment", status: "pending" },
    ],
    stock: [
      { giftCode: "force-card", quantity: 3, reserved: 0, origin: "SYSTEM", ownerId: null, expiresAt: null },
      { giftCode: "golden-like", quantity: 1, reserved: 0, origin: "SYSTEM", ownerId: null, expiresAt: null },
      { giftCode: "la-certif", quantity: 1, reserved: 0, origin: "SYSTEM", ownerId: null, expiresAt: null },
      { giftCode: "vip-pass", quantity: 2, reserved: 0, origin: "EARNED", ownerId: "host-profile", expiresAt: null },
      { giftCode: "private-access", quantity: 1, reserved: 0, origin: "EARNED", ownerId: "host-profile", expiresAt: "2026-12-31T23:59:59.000Z" },
      { giftCode: "supporter-bonus", quantity: 4, reserved: 0, origin: "EARNED", ownerId: "host-profile", expiresAt: null },
      { giftCode: "supporter-bonus", quantity: 1, reserved: 0, origin: "EARNED", ownerId: "fan", expiresAt: null },
      { giftCode: "vip-pass", quantity: 1, reserved: 0, origin: "EARNED", ownerId: "vip-fan", expiresAt: null },
      { giftCode: "private-access", quantity: 1, reserved: 0, origin: "EARNED", ownerId: "vip-fan", expiresAt: "2026-12-31T23:59:59.000Z" },
      { giftCode: "force-card", quantity: 0, reserved: 0, origin: "PURCHASED", ownerId: "host-profile", expiresAt: null },
    ],
  };
}

function sceneState(): SceneState {
  const people = [...ROOM_TOOL_PEOPLE.scene];
  return {
    people,
    prompter: {
      texts: [
        {
          id: "text-1",
          title: "Lumière noire",
          artistId: people[0].id,
          body: "La ville s'endort sous les néons\nJe garde le tempo, je garde le nom\n\nOn lève les yeux, la nuit nous ressemble\nLa lumière noire nous rassemble\n\nReviens au signal, retrouve ma voix\nLe public respire au même pas",
          markers: [
            { id: "m-1", label: "Intro", kind: "Intro", line: 0 },
            { id: "m-2", label: "Couplet 1", kind: "Couplet", line: 2 },
            { id: "m-3", label: "Refrain", kind: "Refrain", line: 4 },
            { id: "m-4", label: "Outro", kind: "Outro", line: 6 },
          ],
        },
        {
          id: "text-3",
          title: "Soul Transit",
          artistId: people[2].id,
          body: "Intro parlée\nPremier couplet\nMontée du refrain\nRefrain final\nRemerciements",
          markers: [
            { id: "m-6", label: "Intro parlée", kind: "Intro", line: 0 },
            { id: "m-7", label: "Refrain final", kind: "Refrain", line: 3 },
          ],
        },
        {
          id: "text-2",
          title: "Interlude guitare",
          artistId: people[1].id,
          body: "Entrée guitare seule\nBoucle quatre mesures\nRegarder la régie\nFinal sur accord suspendu",
          markers: [{ id: "m-5", label: "Final", kind: "Repère", line: 3 }],
        },
      ],
      activeTextId: "text-1",
      playing: false,
      line: 0,
      speed: 42,
      fontSize: 30,
      lineHeight: 1.55,
      alignment: "center",
      countdown: 3,
      controller: "regie",
      mirrored: false,
      readingMode: "expanded",
    },
    program: [
      { id: "perf-1", description: "Naya ouvre le show avec une création soul aux textures électroniques. Une voix intime, des nappes progressives et un refrain repris avec le public.", title: "Lumière noire", artistId: people[0].id, artistName: people[0].name, kind: "Morceau", durationMinutes: 4, prompterTextId: "text-1", backstagePersonId: people[0].id, status: "live", actualStartedAt: new Date(Date.now() - 90_000).toISOString(), participantStatus: "connected", evaluationEnabled: true },
      { id: "perf-2", description: "Lior propose une parenthèse instrumentale à la guitare : arpèges acoustiques, variations improvisées et une montée rythmique jouée en direct.", title: "Nuit acoustique", artistId: people[1].id, artistName: people[1].name, kind: "Instrumental", durationMinutes: 6, prompterTextId: "text-2", backstagePersonId: people[1].id, status: "ready", scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(), participantStatus: "backstage", evaluationEnabled: true },
      { id: "perf-3", description: "Malik interprète un morceau soul entre groove chaleureux et voix habitée. Il alterne couplets intimistes, envolées vocales et improvisation sur le dernier refrain.", title: "Soul Transit", artistId: people[2].id, artistName: people[2].name, kind: "Morceau", durationMinutes: 5, backstagePersonId: people[2].id, status: "upcoming", scheduledAt: new Date(Date.now() + 13 * 60_000).toISOString(), participantStatus: "connected", evaluationEnabled: true },
      { id: "perf-4", description: "Le Collectif Neon présente une chorégraphie collective mêlant danse urbaine, jeux de synchronisation et solos sur une composition électronique.", title: "Corps électrique", artistId: people[3].id, artistName: people[3].name, kind: "Danse", durationMinutes: 7, status: "upcoming", scheduledAt: new Date(Date.now() + 21 * 60_000).toISOString(), participantStatus: "connected", evaluationEnabled: false },
      { id: "perf-5", description: "June construit un DJ set Drum & Bass : transitions rapides, basses profondes et montée en énergie pour faire bouger la salle.", title: "Minuit 140", artistId: people[4].id, artistName: people[4].name, kind: "DJ set", durationMinutes: 12, status: "upcoming", scheduledAt: new Date(Date.now() + 31 * 60_000).toISOString(), participantStatus: "backstage", evaluationEnabled: true },
      { id: "perf-6", description: "Naya et Malik réunissent leurs voix pour un duo soul : harmonies croisées, échanges improvisés et final commun.", title: "Deux voix", artistId: people[5].id, artistName: people[5].name, kind: "Collaboration", durationMinutes: 6, prompterTextId: "text-3", status: "done", actualStartedAt: new Date(Date.now() - 18 * 60_000).toISOString(), actualEndedAt: new Date(Date.now() - 12 * 60_000).toISOString(), participantStatus: "connected", evaluationEnabled: true },
    ],
    evaluation: {
      defaultEnabled: true,
      defaultMinimumResponses: 5,
      defaultResultsVisibility: "private",
      viewerCompletedPerformanceIds: [],
      byPerformance: {
        "perf-6": {
          performanceId: "perf-6",
          open: true,
          minimumResponses: 5,
          resultsVisibility: "private",
          responseCount: 8,
          ratingTotal: 36,
          ratingCounts: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 5 },
          reactionCounts: { energy: 6, presence: 7, originality: 4, mastery: 5 },
          responses: {
            "demo-fan-1": { rating: 5, reactions: ["energy", "presence", "mastery"], submittedAt: new Date(Date.now() - 11 * 60_000).toISOString() },
          },
        },
      },
    },
    fundraiser: {
      id: "fundraiser-scene-1",
      title: "Financer la captation du live",
      beneficiary: "Collectif Neon",
      targetAmount: 2500,
      currency: "EUR",
      description: "Une captation multicaméra et un mix professionnel pour publier le concert dans les meilleures conditions.",
      imageUrl: "",
      endAt: new Date(Date.now() + 6 * 24 * 60 * 60_000).toISOString(),
      status: "live",
      visibleInLive: true,
      highlighted: false,
      collectedAmount: 860,
      contributionCount: 27,
      paymentAvailable: false,
    },
  };
}

function classeState(): ClasseState {
  const people = [...ROOM_TOOL_PEOPLE.classe];
  const occupied = people.slice(1, 20);
  const raisedIds = [occupied[3].id, occupied[9].id, occupied[17].id];
  const now = Date.now();
  return {
    people,
    handsOpen: true,
    raisedHands: raisedIds.map((personId, index) => ({ personId, raisedAt: new Date(now - [188_000, 104_000, 41_000][index]).toISOString() })),
    activeSpeakerId: occupied[0].id,
    publicCallStudentId: occupied[0].id,
    seatsLocked: false,
    seatPriceCents: 499,
    screenShareOwnerId: people[0].id,
    privateTalkStudentId: null,
    questionsOpen: true,
    featuredQuestionId: "class-question-3",
    resources: [],
    questions: [
      { id: "class-question-1", author: occupied[1], text: "Je n’ai pas compris comment tu construis cet accord.", status: "pending", sentAt: new Date(now - 9 * 60_000).toISOString(), supports: 12, supporterIds: occupied.slice(4, 16).map((student) => student.id) },
      { id: "class-question-2", author: occupied[8], text: "Peux-tu rejouer le passage plus lentement ?", status: "pending", sentAt: new Date(now - 4 * 60_000).toISOString(), supports: 8, supporterIds: occupied.slice(11, 19).map((student) => student.id) },
      { id: "class-question-3", author: occupied[3], text: "Où places-tu l’accent sur le deuxième temps ?", status: "displayed", sentAt: new Date(now - 2 * 60_000).toISOString(), supports: 6, supporterIds: occupied.slice(6, 12).map((student) => student.id) },
      { id: "class-question-4", author: occupied[14], text: "Quel doigté conseilles-tu pour garder le mouvement fluide ?", status: "pending", sentAt: new Date(now - 75_000).toISOString(), supports: 4, supporterIds: occupied.slice(2, 6).map((student) => student.id) },
      { id: "class-question-5", author: occupied[6], text: "Est-ce que cette méthode fonctionne aussi en ternaire ?", status: "answered", sentAt: new Date(now - 18 * 60_000).toISOString(), supports: 9, supporterIds: occupied.slice(9, 18).map((student) => student.id) },
      { id: "class-question-6", author: occupied[16], text: "Peux-tu rappeler la tonalité de l’exercice ?", status: "answered", sentAt: new Date(now - 24 * 60_000).toISOString(), supports: 3, supporterIds: occupied.slice(0, 3).map((student) => student.id) },
    ],
    seats: Array.from({ length: 24 }, (_, index) => {
      const occupant = occupied[index];
      const status = !occupant
        ? "free" as const
        : index === 0
          ? "speaking" as const
          : raisedIds.includes(occupant.id)
            ? "hand-raised" as const
            : occupant.microphone !== "ready"
              ? "muted" as const
              : "listening" as const;
      return {
        number: index + 1,
        person: occupant,
        status,
        canSpeak: index === 0,
        canShareScreen: false,
        handRaised: Boolean(occupant && raisedIds.includes(occupant.id)),
      };
    }),
  };
}

function waveState(): WaveState {
  const people = [...ROOM_TOOL_PEOPLE.wave];
  const receivedAt = "2026-08-16T22:40:00.000Z";
  const approvedVote = (submissionVersion: number): NonNullable<WaveState["submissions"][number]["vote"]> => ({
    open: false,
    hidden: false,
    durationSeconds: 30,
    thresholdPercent: 60,
    submissionVersion,
    votes: { "wave-voter-a": "yes", "wave-voter-b": "yes", "wave-voter-c": "no" },
    openedAt: receivedAt,
    endsAt: receivedAt,
    finalizedAt: receivedAt,
    outcome: "accepted",
  });
  const makeSubmission = (
    id: string,
    contributorIndex: number,
    title: string,
    instrument: string,
    status: WaveState["submissions"][number]["status"],
    version = 1,
    patch: Partial<WaveState["submissions"][number]> = {},
  ): WaveState["submissions"][number] => ({
    id,
    contributor: people[contributorIndex % people.length],
    title,
    instrument,
    bpm: 124,
    key: "F# mineur",
    bars: 8,
    durationSeconds: 15.48,
    status,
    rightsConfirmed: true,
    version,
    privateNotes: "Analyse privée disponible pour la Régie.",
    creditPublic: true,
    versions: Array.from({ length: version }, (_, index) => ({ version: index + 1, receivedAt, note: index ? "Version retravaillée" : "Version originale" })),
    ...patch,
  });
  const demoAudio = {
    bass: { fileName: "bass-808-reseau.mp3", fileSize: 36_513, mediaUrl: "/audio/rooms/wave-demo/bass-808-reseau.mp3" },
    bassAlt: { fileName: "bass-deep-movement.mp3", fileSize: 39_439, mediaUrl: "/audio/rooms/wave-demo/bass-deep-movement.mp3" },
    drums: { fileName: "drums-groove-foundation.mp3", fileSize: 60_367, mediaUrl: "/audio/rooms/wave-demo/drums-groove-foundation.mp3" },
    drumsAlt: { fileName: "drums-shaker-loop.mp3", fileSize: 125_849, mediaUrl: "/audio/rooms/wave-demo/drums-shaker-loop.mp3" },
    melody: { fileName: "melody-night-drive.mp3", fileSize: 237_444, mediaUrl: "/audio/rooms/wave-demo/melody-night-drive.mp3" },
    melodyAlt: { fileName: "melody-ethereal-keys.mp3", fileSize: 225_324, mediaUrl: "/audio/rooms/wave-demo/melody-ethereal-keys.mp3" },
    vocal: { fileName: "acapella-never-let-go.mp3", fileSize: 241_206, mediaUrl: "/audio/rooms/wave-demo/acapella-never-let-go.mp3" },
  } as const;
  const queueSeeds: Array<{
    title: string;
    instrument: string;
    status: WaveState["submissions"][number]["status"];
    bpm: number;
    durationSeconds: number;
    audio: keyof typeof demoAudio;
  }> = [
    { title: "Low Orbit 808", instrument: "Basse", status: "received", bpm: 124, durationSeconds: 8, audio: "bass" },
    { title: "Velvet Sub", instrument: "Sub Bass", status: "rework", bpm: 122, durationSeconds: 12, audio: "bassAlt" },
    { title: "Metroline Bass", instrument: "Basse", status: "analysis", bpm: 124, durationSeconds: 16, audio: "bass" },
    { title: "Amber Pulse", instrument: "808", status: "to-review", bpm: 126, durationSeconds: 8, audio: "bassAlt" },
    { title: "Kick District", instrument: "Drums", status: "received", bpm: 124, durationSeconds: 8, audio: "drums" },
    { title: "Broken Hats", instrument: "Hi-hat", status: "analysis", bpm: 124, durationSeconds: 8, audio: "drumsAlt" },
    { title: "Rim Glow", instrument: "Percussion", status: "rework", bpm: 126, durationSeconds: 12, audio: "drums" },
    { title: "Neon Clap", instrument: "Clap", status: "to-review", bpm: 124, durationSeconds: 8, audio: "drumsAlt" },
    { title: "Analog Snare", instrument: "Snare", status: "rejected", bpm: 122, durationSeconds: 8, audio: "drums" },
    { title: "Glass Arp", instrument: "Mélodie", status: "received", bpm: 124, durationSeconds: 15, audio: "melody" },
    { title: "Midnight Chords", instrument: "Piano", status: "analysis", bpm: 124, durationSeconds: 15, audio: "melodyAlt" },
    { title: "Aurora Piano", instrument: "Keys", status: "rework", bpm: 126, durationSeconds: 14, audio: "melody" },
    { title: "Chrome Guitar", instrument: "Guitare", status: "to-review", bpm: 124, durationSeconds: 15, audio: "melodyAlt" },
    { title: "Violet Sequence", instrument: "Synthé", status: "rejected", bpm: 120, durationSeconds: 12, audio: "melody" },
    { title: "One More Night Vox", instrument: "Acapella", status: "received", bpm: 124, durationSeconds: 15, audio: "vocal" },
    { title: "Skyline Hook", instrument: "Vocal", status: "analysis", bpm: 124, durationSeconds: 15, audio: "vocal" },
    { title: "Whisper Stack", instrument: "Voix", status: "rework", bpm: 122, durationSeconds: 11, audio: "vocal" },
    { title: "No Signal Choir", instrument: "Chant", status: "to-review", bpm: 126, durationSeconds: 15, audio: "vocal" },
    { title: "Airlock Texture", instrument: "Ambiance", status: "received", bpm: 124, durationSeconds: 10, audio: "melodyAlt" },
    { title: "Tunnel Rain", instrument: "FX", status: "analysis", bpm: 124, durationSeconds: 8, audio: "drumsAlt" },
    { title: "Vinyl Aurora", instrument: "Texture", status: "rework", bpm: 124, durationSeconds: 12, audio: "melody" },
    { title: "Platform Noise", instrument: "Ambiance", status: "to-review", bpm: 124, durationSeconds: 9, audio: "bassAlt" },
    { title: "Distant Siren", instrument: "FX", status: "rejected", bpm: 124, durationSeconds: 11, audio: "vocal" },
  ];
  const additionalQueue = queueSeeds.map((seed, index) => {
    const media = demoAudio[seed.audio];
    return makeSubmission(`loop-${index + 13}`, (index + 3) % people.length, seed.title, seed.instrument, seed.status, 1, {
      bpm: seed.bpm,
      durationSeconds: seed.durationSeconds,
      fileName: media.fileName,
      fileSize: media.fileSize,
      mimeType: "audio/mpeg",
      mediaUrl: media.mediaUrl,
      reviewReason: seed.status === "rework" ? "timing" : seed.status === "rejected" ? "fit" : undefined,
      reviewFeedback: seed.status === "rework"
        ? "La boucle attend une correction légère avant une nouvelle écoute."
        : seed.status === "rejected"
          ? "La proposition ne correspond pas à la direction actuelle."
          : undefined,
      decisionSource: seed.status === "rejected" ? "host" : undefined,
    });
  });
  return {
    title: "Midnight Metro",
    baseLoop: { title: "Metro Base 08", bars: 8, bpm: 124, key: "F# mineur", kind: "Synthwave", durationSeconds: 15.48, fileName: "metro-base-08.mp3", fileSize: 384_000, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/bass-deep-movement.mp3" },
    submissionsOpen: true,
    submissions: [
      makeSubmission("loop-1", 0, "Subway Bass", "Basse", "to-review", 2, { durationSeconds: 2.2, fileName: "bass-808-reseau.mp3", fileSize: 36_513, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/bass-808-reseau.mp3", privateNotes: "Transient propre, légère reprise à 00:02." }),
      makeSubmission("loop-2", 2, "Groove Foundation", "Drums", "analysis", 1, { bpm: 130, key: "Atonal", bars: 4, durationSeconds: 3.69, fileName: "drums-groove-foundation.mp3", fileSize: 60_367, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/drums-groove-foundation.mp3" }),
      makeSubmission("loop-3", 4, "Night Drive", "Mélodie", "rework", 3, { bpm: 124, durationSeconds: 14.78, fileName: "melody-night-drive.mp3", fileSize: 237_444, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/melody-night-drive.mp3", privateNotes: "Réaligner la fin de phrase.", reviewReason: "timing", reviewFeedback: "La fin de phrase doit être recalée sur la base.", decisionSource: "host" }),
      makeSubmission("loop-4", 0, "Tunnel Vox", "Voix", "to-review", 1, { mediaUrl: "/media/preprofile-demo/hazy-after-hours.mp3", vote: { open: true, hidden: true, durationSeconds: 30, thresholdPercent: 60, submissionVersion: 1, votes: { "wave-voter-a": "yes" }, openedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30_000).toISOString(), outcome: null } }),
      makeSubmission("loop-5", 1, "Blue Guitar", "Guitare", "accepted", 2, { ...demoAudio.melody, durationSeconds: 14.78, mimeType: "audio/mpeg", vote: approvedVote(2), decisionSource: "public", reviewFeedback: "Validée par le public — la boucle rejoint la production." }),
      makeSubmission("loop-6", 1, "Deep Movement", "Basse", "received", 1, { bpm: 122, durationSeconds: 2.39, fileName: "bass-deep-movement.mp3", fileSize: 39_439, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/bass-deep-movement.mp3" }),
      makeSubmission("loop-7", 0, "Pulse Kick", "Drums", "accepted", 1, { ...demoAudio.drums, durationSeconds: 3.69, mimeType: "audio/mpeg", vote: approvedVote(1), decisionSource: "public", reviewFeedback: "Validée par le public — la boucle rejoint la production." }),
      makeSubmission("loop-8", 5, "Ethereal Keys", "Mélodie", "rework", 2, { bpm: 126, durationSeconds: 14.01, fileName: "melody-ethereal-keys.mp3", fileSize: 225_324, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/melody-ethereal-keys.mp3" }),
      makeSubmission("loop-9", 2, "Night Synth", "Synthé", "accepted", 1, { ...demoAudio.melodyAlt, durationSeconds: 14.01, mimeType: "audio/mpeg", vote: approvedVote(1), decisionSource: "public", reviewFeedback: "Validée par le public — la boucle rejoint la production." }),
      makeSubmission("loop-10", 6, "Never Let Go (Vocal)", "Acapella", "rejected", 1, { bpm: 120, durationSeconds: 15, fileName: "acapella-never-let-go.mp3", fileSize: 241_206, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/acapella-never-let-go.mp3", reviewReason: "fit", reviewFeedback: "La proposition ne correspond pas à la direction de cette Wave.", decisionSource: "host" }),
      makeSubmission("loop-11", 3, "Shaker Loop 8", "Drums", "analysis", 1, { key: "Atonal", bars: 4, durationSeconds: 7.8, fileName: "drums-shaker-loop.mp3", fileSize: 125_849, mimeType: "audio/mpeg", mediaUrl: "/audio/rooms/wave-demo/drums-shaker-loop.mp3" }),
      makeSubmission("loop-12", 2, "Air Piano", "Piano", "accepted", 1, { ...demoAudio.melody, durationSeconds: 14.78, mimeType: "audio/mpeg", vote: approvedVote(1), decisionSource: "public", reviewFeedback: "Validée par le public — la boucle rejoint la production." }),
      makeSubmission("loop-vox-dream", 6, "Vox Dream", "Acapella", "accepted", 1, { ...demoAudio.vocal, bpm: 124, durationSeconds: 11.42, mimeType: "audio/mpeg", vote: approvedVote(1), decisionSource: "public", reviewFeedback: "Validée par le public — la boucle rejoint la production." }),
      ...additionalQueue,
    ],
    activeSubmissionId: "loop-1",
    layers: [
      { id: "base", title: "Metro Base 08", author: "Puff", active: true, solo: false, muted: false },
    ],
    playing: false,
    looping: true,
    history: [
      "Base importée · 23:41",
      "Blue Guitar v2 validée par le public · 23:49",
      "Pulse Kick validée par le public · 23:53",
    ],
  };
}

function cageState(): CageState {
  const people = [...ROOM_TOOL_PEOPLE.cage];
  const match = (id: string, round: number, a: number, b: number, status: CageState["matches"][number]["status"], scoreA = 0, scoreB = 0, winnerId?: string): CageState["matches"][number] => ({ id, round, competitorA: people[a], competitorB: people[b], status, scoreA, scoreB, winnerId });
  return {
    format: "tournament",
    event: {
      title: "Cage Masters — Paris",
      discipline: "Toutes disciplines",
      status: "live",
      seeding: "ranking",
      updatedAt: "2026-08-21T16:00:00.000Z",
    },
    matches: [
      match("match-1", 1, 0, 1, "done", 48, 52, people[1].id),
      match("match-2", 1, 2, 3, "done", 61, 39, people[2].id),
      match("match-3", 1, 4, 5, "done", 55, 45, people[4].id),
      match("match-4", 1, 6, 7, "done", 42, 58, people[7].id),
      match("match-5", 1, 8, 9, "live", 48, 52),
      match("match-6", 1, 10, 11, "ready"),
      match("match-7", 1, 12, 13, "scheduled"),
      match("match-8", 1, 14, 15, "ready"),
      match("quarter-1", 2, 1, 2, "ready"),
      match("quarter-2", 2, 4, 7, "ready"),
      match("quarter-3", 2, 8, 10, "scheduled"),
      match("quarter-4", 2, 12, 14, "scheduled"),
      match("semi-1", 3, 1, 4, "scheduled"),
      match("semi-2", 3, 8, 12, "scheduled"),
      match("final", 4, 1, 8, "scheduled"),
    ],
    currentMatchId: "match-5",
    currentRound: 1,
    battleRound: 2,
    battleRoundCount: 3,
    passageDurationSeconds: 120,
    battleStartedAt: new Date(Date.now() - 47_000).toISOString(),
    battleElapsedSeconds: 0,
    battleActiveSide: "B",
    battleCountdownEndsAt: null,
    battleStatus: "live-b",
    votingMode: "public",
    votingOpen: true,
    votingDurationSeconds: 30,
    votingEndsAt: new Date(Date.now() + 30_000).toISOString(),
    resultsHidden: true,
    votes: { "demo-a": "A", "demo-b": "B", "demo-c": "B" },
    resultHistory: [
      { matchId: "match-1", winnerId: people[1].id, scoreA: 48, scoreB: 52, validatedAt: "2026-08-16T21:20:00.000Z" },
      { matchId: "match-2", winnerId: people[2].id, scoreA: 61, scoreB: 39, validatedAt: "2026-08-16T21:35:00.000Z" },
      { matchId: "match-3", winnerId: people[4].id, scoreA: 55, scoreB: 45, validatedAt: "2026-08-16T21:50:00.000Z" },
      { matchId: "match-4", winnerId: people[7].id, scoreA: 42, scoreB: 58, validatedAt: "2026-08-16T22:05:00.000Z" },
    ],
  };
}

function logeState(): LogeState {
  const people = [...ROOM_TOOL_PEOPLE.loge];
  return {
    legendaryHost: true,
    requestQueues: { "dedication": true, "face-to-face": true, "gift-redemption": true },
    questionsOpen: true,
    preview: {
      title: "Écoute privée — Éclipse",
      description: "Version non masterisée réservée aux membres de la Loge.",
      mediaName: "eclipse-premix-v7.wav",
      mediaKind: "audio",
      mediaPath: null,
      playing: false,
      transportStatus: "idle",
      sessionId: null,
      startedAt: null,
      positionSeconds: 0,
      volume: 1,
      replayIncluded: true,
      liveOnly: false,
      expiresAt: "2026-09-18T01:30:00.000Z",
      durationSeconds: null,
      channels: null,
      sampleRate: null,
      waveformPeaks: [],
    },
    questions: [
      { id: "q-1", author: people[3], text: "Quand as-tu compris qu’Éclipse devait devenir le premier single ?", status: "selected", invited: false, sentAt: new Date(Date.now() - 2 * 60_000).toISOString(), supports: 186 },
      { id: "q-2", author: people[1], text: "Est-ce qu’on entend encore ta voix de la première maquette dans l’intro ?", status: "pending", invited: false, sentAt: new Date(Date.now() - 60_000).toISOString(), supports: 142 },
      { id: "q-3", author: people[4], text: "Quelle partie du morceau a été la plus difficile à écrire ?", status: "pending", invited: false, sentAt: new Date(Date.now() - 4 * 60_000).toISOString(), supports: 97 },
      { id: "q-4", author: people[2], text: "Tu nous joueras la version acoustique avant la fin du live ?", status: "pending", invited: false, sentAt: new Date(Date.now() - 7 * 60_000).toISOString(), supports: 74 },
      { id: "q-5", author: people[6], text: "Pourquoi as-tu gardé le souffle au début du deuxième couplet ?", status: "answered", invited: false, sentAt: new Date(Date.now() - 11 * 60_000).toISOString(), supports: 63 },
      { id: "q-6", author: people[5], text: "Est-ce que le titre du morceau a changé pendant l’écriture ?", status: "rejected", invited: false, sentAt: new Date(Date.now() - 14 * 60_000).toISOString(), supports: 22 },
    ],
    moments: [
      { id: "moment-1", kind: "face-to-face", title: "Face-à-face 5 minutes", beneficiary: people[1], status: "scheduled" },
      { id: "moment-2", kind: "face-to-face", title: "Rencontre express", beneficiary: people[2], status: "pending" },
      { id: "moment-3", kind: "dedication", title: "Dédicace vocale", beneficiary: people[2], status: "pending" },
      { id: "moment-4", kind: "dedication", title: "Texte personnalisé", beneficiary: people[1], status: "scheduled" },
      { id: "moment-5", kind: "dedication", title: "Courte vidéo souvenir", beneficiary: people[2], status: "pending" },
    ],
  };
}

export function createRoomToolsFixture(roomType: SpecializedRoomId, roomId = `demo-${roomType}`): RoomToolsState {
  return {
    roomId,
    roomType,
    revision: 1,
    updatedAt: new Date().toISOString(),
    scene: roomType === "scene" ? sceneState() : undefined,
    classe: roomType === "classe" ? classeState() : undefined,
    wave: roomType === "wave" ? waveState() : undefined,
    cage: roomType === "cage" ? cageState() : undefined,
    loge: roomType === "loge" ? logeState() : undefined,
    gifts: giftState(roomId),
  };
}
