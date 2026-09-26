import type { RoomVotingPolicy } from "../voting/roomVoting";
import type { CageCompetitionCommand, CageCompetitionRuntime } from "./cageCompetition.types";
export type { CageCompetitionConfig, CageCompetitionRuntime, CageCompetitionMatch, CageCompetitionCommand, CageCompetitionAction, CageCompetitionPayload, TournamentParticipant, CageReadiness } from "./cageCompetition.types";
export type { CageOpenMicPassage, CageOpenMicAction } from "./cageCompetition.types";
import type { RoomGiftCode } from "../place/placeGiftCatalog";

export type SpecializedRoomId = "scene" | "classe" | "wave" | "cage" | "loge";

export type RoomActorRole =
  | "host"
  | "regisseur"
  | "artist"
  | "teacher"
  | "premium_participant"
  | "competitor"
  | "contributor"
  | "viewer"
  | "visitor";

export type RoomToolId =
  | "scene-program" | "scene-prompter" | "scene-evaluation" | "scene-fundraiser"
  | "classe-screen" | "classe-room" | "classe-questions" | "classe-hands" | "classe-seats"
  | "wave-screen" | "wave-gate" | "wave-quarantine" | "wave-sequencer" | "wave-orchestra"
  | "cage-regie" | "cage-competition" | "cage-battle" | "cage-vote"
  | "loge-preview" | "loge-face-to-face" | "loge-dedication" | "loge-questions" | "loge-audience-choice"
  | "gift";

export type RoomToolConfig = {
  id: RoomToolId;
  label: string;
  shortLabel?: string;
  eyebrow: string;
  description: string;
  icon: "text" | "list" | "evaluation" | "fundraiser" | "focus" | "screen" | "hand" | "seats" | "audio" | "sequence" | "trophy" | "battle" | "vote" | "preview" | "face" | "dedication" | "question" | "audience" | "poll" | "gift";
  controlRoles: readonly RoomActorRole[];
};

export type RoomPerson = {
  id: string;
  name: string;
  avatarUrl: string;
  role: string;
  place?: number;
  access?: "Premium" | "Payant" | "Invité privé" | "Accordé manuellement";
  gradeLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  microphone: "ready" | "muted" | "off";
  camera: "ready" | "off";
};

export type PrompterMarker = { id: string; label: string; kind: "Intro" | "Couplet" | "Refrain" | "Pont" | "Outro" | "Repère"; line: number };
export type PrompterText = { id: string; title: string; artistId: string; body: string; markers: PrompterMarker[] };
export type PrompterState = {
  texts: PrompterText[];
  activeTextId: string;
  playing: boolean;
  line: number;
  speed: number;
  fontSize: number;
  lineHeight: number;
  alignment: "left" | "center" | "right";
  countdown: 0 | 3 | 5 | 10;
  controller: "artist" | "regie";
  mirrored: boolean;
  readingMode: "compact" | "expanded";
};

export type PerformanceStatus = "upcoming" | "ready" | "live" | "done" | "skipped" | "cancelled";
export type PerformanceEntry = {
  id: string;
  description?: string;
  title: string;
  artistId: string;
  artistName: string;
  kind: "Morceau" | "Freestyle" | "Danse" | "DJ set" | "Beatbox" | "Instrumental" | "Présentation" | "Collaboration" | "Autre";
  durationMinutes: number;
  prompterTextId?: string;
  backstagePersonId?: string;
  status: PerformanceStatus;
  scheduledAt?: string;
  actualStartedAt?: string;
  actualEndedAt?: string;
  delayMinutes?: number;
  participantStatus?: "connected" | "backstage" | "absent";
  evaluationEnabled: boolean;
};

export type SceneEvaluationReaction = "energy" | "presence" | "originality" | "mastery";
export type SceneEvaluationResponse = {
  rating: 1 | 2 | 3 | 4 | 5;
  reactions: SceneEvaluationReaction[];
  submittedAt: string;
};
export type PerformanceEvaluation = {
  performanceId: string;
  open: boolean;
  publicMinimumResponses?: number;
  minimumResponses: number;
  resultsVisibility: "private" | "public";
  responseCount: number;
  ratingTotal: number;
  weightedAverage?: number | null;
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  reactionCounts: Record<SceneEvaluationReaction, number>;
  responses: Record<string, SceneEvaluationResponse>;
};
export type SceneEvaluationState = {
  defaultEnabled: boolean;
  defaultMinimumResponses: number;
  defaultResultsVisibility: "private" | "public";
  byPerformance: Record<string, PerformanceEvaluation>;
  viewerCompletedPerformanceIds: string[];
};

export type SceneFundraiserStatus = "draft" | "live" | "closed";
export type SceneFundraiserState = {
  id: string;
  title: string;
  beneficiary: string;
  targetAmount: number;
  currency: "EUR";
  description: string;
  imageUrl: string;
  endAt: string | null;
  status: SceneFundraiserStatus;
  visibleInLive: boolean;
  highlighted: boolean;
  collectedAmount: number;
  contributionCount: number;
  paymentAvailable: boolean;
  demoContributionIds?: string[];
};
export type SceneState = {
  people: RoomPerson[];
  prompter: PrompterState;
  program: PerformanceEntry[];
  evaluation: SceneEvaluationState;
  fundraiser: SceneFundraiserState;
};

export type RaisedHand = { personId: string; raisedAt: string };
export type ClassSeat = {
  number: number;
  person?: RoomPerson;
  status:
    | "free"
    | "reserved"
    | "connected"
    | "absent"
    | "speaking"
    | "listening"
    | "suspended"
    | "hand-raised"
    | "private"
    | "muted"
    | "disconnected";
  canSpeak: boolean;
  canShareScreen: boolean;
  handRaised: boolean;
};
export type ClassQuestionStatus = "pending" | "displayed" | "answered";
export type ClassQuestion = {
  id: string;
  author: RoomPerson;
  text: string;
  status: ClassQuestionStatus;
  sentAt: string;
  supports: number;
  supporterIds: string[];
};
export type ClassResource = {
  id: string;
  name: string;
  kind: "image" | "audio";
  mimeType: string;
  size: number;
  addedAt: string;
  /** Demo-only object URL. Live rooms persist only the opaque Storage path. */
  mediaUrl?: string;
  mediaPath?: string;
};
export type ClasseState = {
  /** Canonical live floor eligibility, independent of a paid seat. */
  floorEligible?: boolean;
  people: RoomPerson[];
  handsOpen: boolean;
  raisedHands: RaisedHand[];
  activeSpeakerId: string | null;
  /** Server-authoritative accepted public Classe call, including pre-air preview. */
  publicCallStudentId?: string | null;
  seatsLocked: boolean;
  seatPriceCents?: number;
  seats: ClassSeat[];
  screenShareOwnerId: string | null;
  /** Demo mirror only. Live privacy is derived from the authoritative RTC session. */
  privateTalkStudentId?: string | null;
  questionsOpen?: boolean;
  questions?: ClassQuestion[];
  featuredQuestionId?: string | null;
  resources?: ClassResource[];
};

/**
 * Legacy presentation status persisted by the first Wave prototype.
 *
 * `lifecycleStatus` below is the authoritative workflow status. This mirror is
 * intentionally retained while old Rooms and the current panels are migrated.
 */
export type WaveSubmissionStatus = "received" | "analysis" | "to-review" | "accepted" | "rejected" | "rework";
export const WAVE_LOOP_STATUSES = [
  "UPLOADING",
  "PROCESSING",
  "RECEIVED",
  "NEEDS_REVIEW",
  "NEEDS_CORRECTION",
  "READY_FOR_VOTE",
  "VOTING",
  "ACCEPTED",
  "NOT_SELECTED",
  "REJECTED",
  "SUPERSEDED",
  "REMOVED",
  "PROCESSING_FAILED",
] as const;
export type WaveLoopStatus = (typeof WAVE_LOOP_STATUSES)[number];
export type WaveStatusHistoryEntry = {
  id: string;
  sequence: number;
  status: WaveLoopStatus;
  at: string;
  version: number;
  actorId?: string;
  reason?: string;
};
export type WaveReviewReason = "format" | "timing" | "key" | "quality" | "fit" | "rights" | "duplicate" | "other" | "public";
export type WaveDecisionSource = "host" | "public";
export type WaveLoopCategory = "bass" | "drums" | "melody" | "chords" | "pad" | "acapella" | "fx";
export type WaveBaseLoop = {
  title: string;
  bars: 4 | 8 | 16;
  format?: "loop" | "long";
  bpm: number;
  key: string;
  kind: string;
  durationSeconds?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  mediaUrl?: string;
  mediaPath?: string;
};
export type WaveSubmission = {
  id: string;
  /** Private host workbench; replacement files stay here until explicitly released. */
  quarantined?: boolean;
  contributor: RoomPerson;
  title: string;
  instrument: string;
  category?: WaveLoopCategory;
  bpm: number;
  key: string;
  bars: 4 | 8 | 16;
  durationSeconds: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  mediaUrl?: string;
  mediaPath?: string;
  submittedAt?: string;
  /** Server-authoritative lifecycle. Missing values are normalized from `status`. */
  lifecycleStatus?: WaveLoopStatus;
  /** Append-only audit trail for authoritative lifecycle transitions. */
  statusHistory?: WaveStatusHistoryEntry[];
  /** Root contributor remains stable across every corrected version. */
  originalContributorId?: string;
  status: WaveSubmissionStatus;
  rightsConfirmed: boolean;
  version: number;
  privateNotes: string;
  creditPublic: boolean;
  reviewReason?: WaveReviewReason;
  reviewFeedback?: string;
  decisionSource?: WaveDecisionSource;
  versions: Array<{
    version: number;
    receivedAt: string;
    note: string;
    /** A previous immutable version becomes SUPERSEDED; it is never overwritten. */
    status?: WaveLoopStatus;
    contributorId?: string;
    correctedBy?: string;
    correctionReason?: string;
    technicalFingerprint?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    mediaUrl?: string;
    mediaPath?: string;
    bpm?: number;
    key?: string;
    bars?: 4 | 8 | 16;
    durationSeconds?: number;
  }>;
  vote?: {
    /** Stable server round identity. */
    roundId?: string;
    open: boolean;
    hidden: boolean;
    durationSeconds: number;
    /** Official preview heard by the public for this locked round. */
    listeningMode?: "solo" | "beat";
    /** Existing collective layer challenged by this replacement round. */
    replacesLayerId?: string;
    thresholdPercent: number;
    submissionVersion: number;
    /** Optional fingerprint of the exact immutable audio preview heard publicly. */
    lockedPreviewFingerprint?: string;
    votes: Record<string, "yes" | "no">;
    weightedApprovalPercent?: number;
    totalVotes?: number;
    yesCount?: number;
    noCount?: number;
    openedAt?: string | null;
    endsAt?: string | null;
    finalizedAt?: string | null;
    /** Makes repeated close commands a no-op instead of a second finalization. */
    finalizationKey?: string | null;
    outcome?: "accepted" | "rejected" | null;
  };
};
export type WaveLayer = { id: string; submissionId?: string; submissionVersion?: number; title: string; author: string; active: boolean; solo: boolean; muted: boolean; gain?: number };
export type WaveState = {
  maxSubmissionBars?: 4 | 8 | 16;
  votingPolicy?: RoomVotingPolicy;
  title: string;
  baseLoop: WaveBaseLoop;
  /** Missing on legacy rooms means open for backward compatibility. */
  submissionsOpen?: boolean;
  /** Missing on legacy rooms accepts every category; closing preserves this selection. */
  acceptedCategories?: WaveLoopCategory[];
  submissions: WaveSubmission[];
  activeSubmissionId: string | null;
  layers: WaveLayer[];
  playing: boolean;
  looping: boolean;
  history: string[];
};

export type CageEventFormat = "tournament" | "championship" | "open-mic" | "open-mic-battle";
export type CageEventStatus = "draft" | "ready" | "published" | "live" | "completed";
export type CageSeedingMode = "ranking" | "random" | "manual";
export type CageOpenMicEntryStatus = "scheduled" | "ready" | "live" | "done" | "absent";
export type CageMatch = { id: string; round: number; competitorA: RoomPerson; competitorB: RoomPerson; status: "scheduled" | "ready" | "live" | "done"; scoreA: number; scoreB: number; winnerId?: string };
export type CageOpenMicEntry = {
  id: string;
  personId: string;
  order: number;
  status: CageOpenMicEntryStatus;
  slot: string;
  score?: number;
};
export type CageState = {
  runtime?: CageCompetitionRuntime;
  /** Local presentation only. Never created or executed by the live repository. */
  demoPresentation?: { version: 1; playing: boolean; nextCueAt: string | null; remainingCueMs: number; lastMatchId: string | null } | { version: 2 };

  /** `face-to-face` and `custom` remain readable for legacy persisted rooms. */
  format: CageEventFormat | "face-to-face" | "custom";
  event?: {
    title: string;
    discipline: string;
    status: CageEventStatus;
    seeding: CageSeedingMode;
    updatedAt: string;
  };
  matches: CageMatch[];
  openMicEntries?: CageOpenMicEntry[];
  currentMatchId: string;
  /** Selected competition round. Kept for backward-compatible persisted state. */
  currentRound: number;
  /** Round inside one live battle, independent from the bracket round. */
  battleRound?: number;
  battleRoundCount?: 1 | 2 | 3 | 5;
  passageDurationSeconds?: 60 | 90 | 120 | 180;
  battleStartedAt?: string | null;
  battleElapsedSeconds?: number;
  /** Last side sent on air. Preserved through pause/incident for the video return. */
  battleActiveSide?: "A" | "B" | null;
  /** Three-second visual countdown shared by the Régie and the public programme. */
  battleCountdownEndsAt?: string | null;
  battleStatus: "ready" | "countdown" | "live-a" | "live-b" | "paused" | "incident" | "done";
  votingMode: "public" | "jury" | "weighted";
  votingOpen: boolean;
  votingDurationSeconds: number;
  votingEndsAt: string | null;
  resultsHidden: boolean;
  votes: Record<string, "A" | "B">;
  resultHistory: Array<{ matchId: string; winnerId: string; scoreA: number; scoreB: number; validatedAt: string }>;
};

export type VipQuestion = { id: string; author: RoomPerson; text: string; status: "pending" | "selected" | "answered" | "rejected"; invited: boolean; sentAt?: string; supports?: number };
export type VipMoment = { id: string; kind: "face-to-face" | "dedication" | "gift-redemption"; title: string; beneficiary: RoomPerson; status: "pending" | "scheduled" | "accepted" | "declined" | "live" | "completed" | "cancelled"; format?: "video" | "audio" | "text"; privateContent?: string; requested?: boolean };
export type LogePreviewTransportStatus = "idle" | "playing" | "paused" | "finished";
export type LogeState = {
  requestQueues?: Partial<Record<VipMoment["kind"], boolean>>;
  legendaryHost: boolean;
  questionsOpen: boolean;
  preview: {
    title: string;
    description: string;
    mediaName: string;
    mediaKind?: "audio" | "video" | "image";
    /** Opaque private Storage object path. Signed URLs are never persisted. */
    mediaPath: string | null;
    /** Legacy mirror kept for backward-compatible persisted Room state. */
    playing: boolean;
    transportStatus?: LogePreviewTransportStatus;
    sessionId?: string | null;
    startedAt?: string | null;
    positionSeconds?: number;
    volume?: number;
    replayIncluded: boolean;
    liveOnly: boolean;
    expiresAt: string | null;
    /** Duration returned by the decoded PCM buffer, in seconds. */
    durationSeconds: number | null;
    /** Number of decoded PCM channels. */
    channels: number | null;
    /** PCM sample rate in hertz. */
    sampleRate: number | null;
    /**
     * Interleaved min/max bins quantized as signed int16 values:
     * [min0, max0, min1, max1, ...]. Capped at 512 bins.
     */
    waveformPeaks: number[];
  };
  questions: VipQuestion[];
  moments: VipMoment[];
};

export type GiftOrigin = "SYSTEM" | "EARNED" | "PURCHASED";
export type RoomGiftStock = { giftCode: RoomGiftCode; quantity: number; reserved: number; origin: GiftOrigin; ownerId: string | null; expiresAt: string | null };
export type RoomGiftTransaction = {
  id: string;
  idempotencyKey: string;
  giftCode: RoomGiftCode;
  senderId: string;
  recipientId: string;
  roomId: string;
  createdAt: string;
  mode: "direct" | "raffle";
  origin: GiftOrigin;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  eligibleRecipientIds?: string[];
};
export type RoomGiftRedemption = { id: string; transactionId: string; roomId: string; ownerId: string; kind: "future-class-seat" | "vip-moment" | "standard"; status: "pending" | "scheduled" | "redeemed" | "cancelled" };
export type GiftState = { stock: RoomGiftStock[]; transactions: RoomGiftTransaction[]; redemptions: RoomGiftRedemption[]; purchaseEnabled: false };

export type RoomToolsState = {
  votingPolicy?: RoomVotingPolicy;
  roomId: string;
  roomType: SpecializedRoomId;
  revision: number;
  updatedAt: string;
  audience?: {
    eligible: boolean;
    actorRole?: RoomActorRole | null;
    classeSeatNumber?: number | null;
    classeAccessKind?: "premium_subscription" | "paid_seat" | "private_access" | "manual_grant" | null;
  };
  scene?: SceneState;
  classe?: ClasseState;
  wave?: WaveState;
  cage?: CageState;
  loge?: LogeState;
  gifts: GiftState;
};

export type RoomToolsCommand =
  | CageCompetitionCommand
  | { type: "cage.demo.presentation"; action: "restart" }
  | { type: "cage.demo.guest.move"; participantId: string; destination: "backstage" | "onstage" | "accepted" | "ready" }
  | { type: "scene.prompter.patch"; patch: Partial<PrompterState> }
  | { type: "scene.prompter.add"; text: PrompterText }
  | { type: "scene.prompter.update"; textId: string; patch: Partial<Pick<PrompterText, "title" | "artistId" | "body" | "markers">> }
  | { type: "scene.prompter.select"; textId: string }
  | { type: "scene.prompter.marker"; markerId: string }
  | { type: "scene.program.status"; entryId: string; status: PerformanceStatus }
  | { type: "scene.program.patch"; entryId: string; patch: Partial<Omit<PerformanceEntry, "id">> }
  | { type: "scene.program.add"; entry: PerformanceEntry }
  | { type: "scene.program.remove"; entryId: string }
  | { type: "scene.program.move"; entryId: string; direction: -1 | 1 }
  | { type: "scene.program.reorder"; entryId: string; toIndex: number }
  | { type: "scene.evaluation.configure"; performanceId: string; enabled: boolean; minimumResponses?: number; resultsVisibility?: "private" | "public" }
  | { type: "scene.evaluation.cast"; performanceId: string; accountId: string; rating: 1 | 2 | 3 | 4 | 5; reactions: SceneEvaluationReaction[] }
  | { type: "scene.fundraiser.demo.contribute"; campaignId: string; amountCents: number; contributionId: string }
  | { type: "scene.fundraiser.patch"; patch: Partial<Omit<SceneFundraiserState, "id" | "currency" | "collectedAmount" | "contributionCount" | "paymentAvailable" | "demoContributionIds">> }
  | { type: "classe.hands.open"; open: boolean }
  | { type: "classe.hand.raise"; personId: string }
  | { type: "classe.hand.lower-own"; accountId: string }
  | { type: "classe.hands.lower"; personId?: string }
  | { type: "classe.speaker.end-own"; accountId: string }
  | { type: "classe.speaker"; personId: string | null }
  | { type: "classe.private"; personId: string | null }
  | { type: "classe.seat.patch"; seat: number; patch: Partial<ClassSeat> }
  | { type: "classe.seat.price"; cents: number }
  | { type: "classe.demo.seat.purchase"; seat: number; person: RoomPerson; cents: number }
  | { type: "classe.seats.lock"; locked: boolean }
  | { type: "classe.questions.open"; open: boolean }
  | { type: "classe.question.add"; question: ClassQuestion }
  | { type: "classe.question.support"; questionId: string; accountId: string }
  | { type: "classe.question.status"; questionId: string; status: ClassQuestionStatus }
  | { type: "classe.question.feature"; questionId: string | null }
  | { type: "classe.resource.add"; resource: ClassResource }
  | { type: "wave.base.configure"; waveTitle: string; baseLoop: WaveBaseLoop }
  | { type: "wave.base.replace"; baseLoop: WaveBaseLoop }
  | { type: "wave.rules.update"; patch: Pick<WaveBaseLoop, "bpm" | "key" | "bars" | "kind"> }
  | { type: "wave.submissions.setOpen"; open: boolean; acceptedCategories?: WaveLoopCategory[] }
  | { type: "wave.submissions.quarantine"; submissionIds: string[] }
  | { type: "wave.submission.status"; submissionId: string; status: WaveSubmissionStatus; reason?: WaveReviewReason; feedback?: string }
  | { type: "wave.submission.add"; submission: WaveSubmission }
  | { type: "wave.submission.importToVote"; submission: WaveSubmission }
  | { type: "wave.submission.version"; submissionId: string; note: string; patch: Pick<WaveSubmission, "fileName" | "fileSize" | "mimeType" | "mediaUrl" | "mediaPath" | "bpm" | "key" | "bars" | "durationSeconds"> }
  | { type: "wave.vote.cast"; submissionId: string; accountId: string; choice: "yes" | "no" }
  | { type: "wave.vote.open"; submissionId: string; open: boolean; durationSeconds?: 2 | 30 | 45 | 60; listeningMode?: "solo" | "beat" }
  | { type: "wave.replacement.open"; layerId: string; submissionId: string; durationSeconds?: 2 | 30 | 45 | 60; listeningMode?: "solo" | "beat" }
  | { type: "wave.submission.select"; submissionId: string | null }
  | { type: "wave.sequence.transport"; playing: boolean }
  | { type: "wave.sequence.looping"; looping: boolean }
  | { type: "wave.sequence.layer"; layerId: string; patch: Partial<WaveLayer> }
  | { type: "wave.sequence.remove"; layerId: string }
  | { type: "cage.format"; format: CageState["format"] }
  | { type: "cage.event.patch"; patch: Partial<NonNullable<CageState["event"]>> }
  | { type: "cage.event.status"; status: CageEventStatus }
  | { type: "cage.structure.generate"; format: CageEventFormat; seeding: CageSeedingMode }
  | { type: "cage.match.select"; matchId: string }
  | { type: "cage.open-mic.move"; entryId: string; direction: -1 | 1 }
  | { type: "cage.open-mic.status"; entryId: string; status: CageOpenMicEntryStatus }
  | { type: "cage.open-mic.score"; entryId: string; score: number }
  | { type: "cage.battle"; status: CageState["battleStatus"] }
  | { type: "cage.battle.round"; round: number }
  | { type: "cage.battle.duration"; seconds: 60 | 90 | 120 | 180 }
  | { type: "cage.vote.mode"; mode: CageState["votingMode"] }
  | { type: "cage.vote.duration"; seconds: 30 | 45 | 60 | 90 }
  | { type: "cage.vote.open"; open: boolean }
  | { type: "cage.vote.cast"; accountId: string; choice: "A" | "B" }
  | { type: "cage.vote.reveal"; hidden: boolean }
  | { type: "cage.result"; winnerId: string }
  | {
      type: "loge.preview.patch";
      patch: Partial<LogeState["preview"]>;
      /** Compare-and-set guard for asynchronous analysis tied to one media. */
      expectedMedia?: { mediaName: string; mediaPath: string | null };
    }
  | { type: "loge.preview.launch"; expectedMedia: { mediaName: string; mediaPath: string | null }; sessionId: string; positionSeconds?: number; volume?: number }
  | { type: "loge.preview.pause"; expectedMedia: { mediaName: string; mediaPath: string | null }; sessionId: string }
  | { type: "loge.preview.resume"; expectedMedia: { mediaName: string; mediaPath: string | null }; sessionId: string }
  | { type: "loge.preview.restart"; expectedMedia: { mediaName: string; mediaPath: string | null }; sessionId: string }
  | { type: "loge.preview.volume"; expectedMedia: { mediaName: string; mediaPath: string | null }; sessionId: string; volume: number }
  | { type: "loge.preview.stop"; expectedMedia: { mediaName: string; mediaPath: string | null }; sessionId: string }
  | { type: "loge.preview.finish"; expectedMedia: { mediaName: string; mediaPath: string | null }; sessionId: string }
  | { type: "loge.questions.open"; open: boolean }
  | { type: "loge.question.add"; question: VipQuestion }
  | { type: "loge.question.status"; questionId: string; status: VipQuestion["status"]; invite?: boolean }
  | { type: "loge.queue.setOpen"; kind: VipMoment["kind"]; open: boolean }
  | { type: "loge.request.join"; kind: VipMoment["kind"]; person: RoomPerson }
  | { type: "loge.request.cancel"; momentId: string; accountId: string }
  | { type: "loge.moment.add"; moment: VipMoment }
  | { type: "loge.moment.status"; momentId: string; status: VipMoment["status"] }
  | { type: "loge.moment.respond"; momentId: string; accountId: string; accept: boolean }
  | { type: "gift.send"; accountId: string; recipientId: string; giftCode: RoomGiftCode; origin: GiftOrigin; idempotencyKey: string }
  | { type: "gift.raffle"; accountId: string; eligibleRecipientIds: string[]; giftCode: RoomGiftCode; origin: GiftOrigin; idempotencyKey: string }
  | { type: "gift.redemption.use"; accountId: string; redemptionId: string };
