import type { VoiceCorrectionPresetId } from "../voice-correction/voiceCorrection.types";
import type { RoomGiftCode } from "./placeGiftCatalog";

export type PlaceRuntimeSource = "live" | "demo";
export type PlaceDemoRole = "host" | "viewer" | "guest";

export type PlaceInvitationStatus =
  | "pending"
  | "accepted"
  | "ready"
  | "backstage"
  | "onstage"
  | "cancelled"
  | "declined"
  | "ended"
  | "kicked";

export type PlaceStudioSurface = "chat" | "mixer" | "tools" | "guests";
export type PlaceMixerView = "volumes" | "voice_fx" | "twists" | "time";

export type PlaceProfile = {
  id: string;
  displayName: string;
  handle: string;
  role: string;
  city: string;
  avatarUrl: string;
  gradeLevel: number;
};

export type PlaceParticipantVideoSourceDto = {
  id: string;
  type: "front_camera" | "rear_camera" | "screen" | "desktop_composite" | "portrait_composite";
  aspectRatio: "16:9" | "9:16" | "4:3";
  transport?: "rtc" | "hls" | "file" | "image" | "screen";
  publicationSid?: string;
  active?: boolean;
  programEligible?: boolean;
  viewerSelectable?: boolean;
  preferredForDesktop?: boolean;
  videoUrl?: string;
  imageUrl?: string;
  safeRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
};

export type PlaceParticipant = {
  id: string;
  queueEntryId?: string;
  invitationId?: string;
  profile: PlaceProfile;
  joinedAt: string;
  status: "host" | PlaceInvitationStatus;
  videoUrl?: string;
  imageUrl?: string;
  /** Server-authorized publications. The Stage rejects partial contracts. */
  videoSources?: PlaceParticipantVideoSourceDto[];
  isCameraEnabled: boolean;
  /** Camera intent owned by the participant, before Host moderation. */
  isSelfCameraEnabled?: boolean;
  /** The Host can force a camera off, but never force the device back on. */
  isHostForcedCameraOff?: boolean;
  isMicrophoneEnabled: boolean;
  isSpeaking: boolean;
  latencyMs: number;
};

/**
 * Safe audience projection of the public stage. It deliberately excludes
 * invitation identifiers, Green House/backstage state and private mixer data.
 */
export type PlacePublicStageEntry = {
  participantId: string;
  stageRole: "host" | "guest";
  joinedAt: string;
  stagePosition: number;
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
};

export type PlaceMessage = {
  id: string;
  author: PlaceProfile | null;
  content: string;
  createdAt: string;
  isSystem?: boolean;
  isPinned?: boolean;
};

export type PlaceMixerChannelKind = "microphone" | "audio" | "guest" | "master";
export type PlaceMixerSignalState = "active" | "silent" | "muted" | "clipping" | "connecting" | "disconnected";

export type PlaceMixerChannel = {
  id: string;
  participantId?: string;
  label: string;
  detail: string;
  kind: PlaceMixerChannelKind;
  gain: number;
  level: number;
  isMuted: boolean;
  /** Mute chosen by the participant on their own input. */
  isSelfMuted?: boolean;
  isSolo: boolean;
  isHostForcedMuted?: boolean;
  /** Host-owned public routing. Personal FX never travel through this flag. */
  isRoutedToPublic?: boolean;
  /** True only when gain/routing came from a private owner row or safe public projection. */
  publicMixAuthoritative?: boolean;
  signalState: PlaceMixerSignalState;
  accent: string;
};

export type PlaceVocalPreset = "Clean" | "Warm" | "Rap" | "Trap" | "Radio";
export type PlaceMusicalScale =
  | "Chromatique"
  | "Majeure"
  | "Mineure"
  | "Pentatonique majeure"
  | "Pentatonique mineure"
  | "Blues"
  | "Dorienne"
  | "Mixolydienne";
export type PlaceReverbType = "Room" | "Plate" | "Hall";
/** Device-local correction path. This is deliberately not synchronized with remote guests. */
export type PlaceWebPitchProvider = "opendaw" | "meewav_test";
export type PlaceNativePitchProvider =
  | "antares.autotune"
  | "sixthsample.spoton"
  | "auburnsounds.graillon3";
export type PlacePitchProvider = "none" | PlaceWebPitchProvider | PlaceNativePitchProvider;

export type PlaceVocalState = {
  enabled: boolean;
  monitoring: boolean;
  preset: PlaceVocalPreset;
  tuneEnabled: boolean;
  tuneKey: string;
  tuneScale: PlaceMusicalScale;
  tuneAmount: number;
  tuneSpeed: number;
  tuneHumanize: number;
  tuneSmooth: number;
  tuneShift: number;
  tunePreset: VoiceCorrectionPresetId;
  reverbEnabled: boolean;
  reverbAmount: number;
  reverbType: PlaceReverbType;
  reverbDuration: number;
  reverbPreDelayMs: number;
  eqEnabled: boolean;
  compEnabled: boolean;
  compAmount: number;
  compThresholdDb: number;
  compRatio: number;
  compAttackMs: number;
  compReleaseMs: number;
  compMakeupDb: number;
  delayEnabled: boolean;
  delayAmount: number;
  delayTimeMs: number;
  delayFeedback: number;
};

export type PlaceTrack = {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  currentSeconds: number;
  bpm?: number;
  musicalKey?: string;
  isPlaying: boolean;
  isLooping: boolean;
  waveform: number[];
  /** Optional server snapshot used by the live Host player command stream. */
  audioRoute?: PlaceAudioRoute;
  audioPlaybackState?: PlaceAudioPlaybackState;
  audioPreviewReady?: boolean;
  audioGeneration?: string | null;
  audioRevision?: number;
};

export type PlaceAudioRoute = "preview" | "public";

export type PlaceAudioPlaybackState =
  | "idle"
  | "ready"
  | "previewing"
  | "playing"
  | "paused"
  | "ended";

export type PlaceAudioPreviewInput = {
  ready: boolean;
  title: string | null;
  artist: string | null;
  durationSeconds: number | null;
  /** UUID owned by the player for this exact imported/selected track. */
  generation: string;
};

export type PlaceHostAudioStateCommitInput = {
  route: PlaceAudioRoute;
  playbackState: PlaceAudioPlaybackState;
  previewReady: boolean;
  generation: string;
  expectedRevision: number;
  /** Stable for retries of the same logical player command. */
  idempotencyKey: string;
  title: string | null;
  artist: string | null;
  durationSeconds: number | null;
};

export type PlaceHostAudioStateCommitResult = {
  route: PlaceAudioRoute;
  playbackState: PlaceAudioPlaybackState;
  previewReady: boolean;
  generation: string | null;
  revision: number;
  title: string | null;
  artist: string | null;
  durationSeconds: number | null;
  transport: "atomic" | "legacy";
};

export type PlacePollDuration = 15 | 30 | 60 | 120 | null;

export type PlacePollOptionInput = string | {
  label: string;
  imageUrl?: string | null;
  mediaId?: string | null;
  durationLabel?: string | null;
};

export type PlacePollOption = {
  weightedPercent?: number;
  label: string;
  votes: number;
  imageUrl?: string | null;
  mediaId?: string | null;
  durationLabel?: string | null;
};

export type PlacePoll = {
  id: string;
  question: string;
  options: PlacePollOption[];
  durationSeconds: PlacePollDuration;
  endsAt: string | null;
  isActive: boolean;
  resultsVisible: boolean;
  currentUserVoteIndex: number | null;
};

/**
 * A stable, privacy-aware identity snapshot used by the Room gift workflow.
 * `profileId` is intentionally nullable so a Host can include a name entered
 * by hand without pretending that it owns a MeeWav account.
 */
export type RoomGiftCandidate = {
  key: string;
  profileId: string | null;
  displayName: string;
  avatarUrl: string | null;
  source: "stage" | "backstage" | "queue" | "manual" | "room";
};

export type RoomGiftDrawPoolMode = "manual" | "queue" | "room" | "selected";
export type RoomGiftDrawStatus = "ready" | "scheduled" | "spinning" | "revealed" | "cancelled";

/**
 * Public projection of a draw. The candidate list and the chosen candidate
 * remain server/private state until `status` becomes `revealed`.
 */
export type RoomGiftDraw = {
  id: string;
  giftCode: RoomGiftCode;
  giftLabel: string;
  poolMode: RoomGiftDrawPoolMode;
  status: RoomGiftDrawStatus;
  eligibleCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  revealAt: string | null;
  revealedAt: string | null;
  winner: RoomGiftCandidate | null;
  createdAt: string;
};

export type RoomGiftDrawInput = {
  giftCode: RoomGiftCode;
  giftLabel: string;
  poolMode: RoomGiftDrawPoolMode;
  candidates?: readonly RoomGiftCandidate[];
  scheduledAt?: string | null;
  animationDurationSeconds?: number;
  /** Stable for the same user operation so a network retry cannot duplicate a draw. */
  idempotencyKey?: string;
};

export type RoomGiftDeliveryAction = "send_now" | "schedule" | "round";
export type RoomGiftDeliveryStatus = "sent" | "scheduled" | "ready";
export type RoomGiftRecipientSource = "stage" | "backstage" | "queue" | "messaging";

/**
 * Canonical direct-gift command. Recipient display fields are used only by
 * the deterministic demo receipt; the live RPC resolves its own trusted
 * profile snapshot and ignores those client-side labels.
 */
export type RoomGiftDeliveryInput = {
  giftCode: RoomGiftCode;
  giftLabel: string;
  recipientProfileId: string;
  recipientDisplayName: string;
  recipientAvatarUrl: string | null;
  recipientSource: RoomGiftRecipientSource;
  action: RoomGiftDeliveryAction;
  scheduledAt: string | null;
  roundLabel: string | null;
  /** Stable across a retry of the same Host operation. */
  idempotencyKey: string;
};

export type RoomGiftDelivery = {
  id: string;
  roomId: string;
  giftCode: RoomGiftCode;
  giftLabel: string;
  action: RoomGiftDeliveryAction;
  status: RoomGiftDeliveryStatus;
  roundLabel: string | null;
  recipientProfileId: string;
  recipientDisplayName: string;
  recipientAvatarUrl: string | null;
  recipientSource: RoomGiftRecipientSource;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type PlaceRoomState = {
  id: string;
  source: PlaceRuntimeSource;
  title: string;
  description: string;
  status: "live" | "scheduled" | "ended";
  startedAt: string;
  host: PlaceProfile;
  participantsCount: number;
  peakViewers: number;
  likesCount: number;
  goldenLikesCount: number;
  hatTotalAmount: number | null;
  currentUserHasLiked: boolean;
  currentUserHasGoldenLiked: boolean;
  goldenLikeAvailableAt: string | null;
  currentUserProfile: PlaceProfile | null;
  currentUserIsActiveParticipant: boolean;
  queueOpen: boolean;
  connectionLabel: string;
  broadcastStatus: "idle" | "starting" | "active" | "stopped" | "failed";
  participants: PlaceParticipant[];
  queue: PlaceParticipant[];
  messages: PlaceMessage[];
  channels: PlaceMixerChannel[];
  /** Local vocal chain owned by the current Host or Guest. Never a remote Guest FX state. */
  personalVocal: PlaceVocalState;
  track: PlaceTrack;
  poll: PlacePoll | null;
  giftDraw: RoomGiftDraw | null;
  pinnedMessageId: string | null;
  highlightText: string | null;
};

export type PlaceRealtimeEvent = {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE" | "*";
};

export type PlaceSubscription = { unsubscribe: () => void };
