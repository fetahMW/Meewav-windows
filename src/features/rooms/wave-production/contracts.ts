import type {
  ProgramAudioState,
  SwitchProgramAudioCommand,
  WaveAuthoritativeResult,
  WaveEventCursor,
  WaveInfraAdapter,
  WaveRecoveryBundle,
} from "../wave-infra";

export type WaveSessionStatus = "DRAFT" | "READY" | "LIVE" | "PAUSED" | "ENDED" | "CANCELLED";
export type WaveLoopStatus =
  | "UPLOADING"
  | "PROCESSING"
  | "RECEIVED"
  | "NEEDS_REVIEW"
  | "NEEDS_CORRECTION"
  | "READY_FOR_VOTE"
  | "VOTING"
  | "ACCEPTED"
  | "NOT_SELECTED"
  | "REJECTED"
  | "SUPERSEDED"
  | "REMOVED"
  | "PROCESSING_FAILED";
export type WaveVoteKind = "ADMISSION" | "REPLACEMENT";
export type WaveVoteStatus = "LISTENING" | "OPEN" | "FINALIZED" | "CANCELLED" | "SUSPENDED";
export type WaveVoteChoice = "APPROVE" | "CONTINUE";
export type WaveCompatibility = "COMPATIBLE" | "NEEDS_REVIEW" | "INCOMPATIBLE";
export type WaveRenderStatus = "IDLE" | "REQUESTED" | "PROCESSING" | "READY" | "FAILED";
export type WaveProgramSource = "HOST_DAW" | "SERVER_RENDER" | "SILENCE";
export type WaveEffectsPolicy = "DRY" | "PROCESSED" | "EITHER";
export type WaveLifecycleState =
  | "PREPARING"
  | "LIVE_ACTIVE"
  | "PAUSED"
  | "INTERMISSION"
  | "CLOSURE_VOTE"
  | "FINALIZING"
  | "ENDED";

export type WaveSessionSnapshot = {
  id: string;
  roomId: string;
  status: WaveSessionStatus;
  rulesVersion: number;
  bpm: number;
  musicalKey: string;
  timeSignature: string;
  expectedBars: number;
  maxDurationMs: number;
  acceptedMimeTypes: string[];
  desiredLoopTypes: string[];
  effectsPolicy: WaveEffectsPolicy;
  recommendedLufs: number | null;
  rulesLockedAt: string | null;
  cursor: number;
};

export type WaveSlotSnapshot = {
  id: string;
  index: number;
  label: string;
  state: "OPEN" | "OCCUPIED" | "LOCKED";
  acceptedVersionId: string | null;
};

export type WaveCategorySnapshot = {
  id: string;
  code: string;
  label: string;
  position: number;
  minSlots: number;
  maxSlots: number;
  required: boolean;
  slots: WaveSlotSnapshot[];
};

export type WaveLoopAnalysisSnapshot = {
  compatibility: WaveCompatibility;
  estimatedBpm: number | null;
  estimatedKey: string | null;
  estimatedBars: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  loudnessLufs: number | null;
  peakDbfs: number | null;
  clipped: boolean;
  excessiveSilence: boolean;
  corrupt: boolean;
  analyzedAt: string;
};

export type WaveLoopVersionSnapshot = {
  id: string;
  versionNumber: number;
  assetId: string;
  supersedesVersionId: string | null;
  declaredBpm: number | null;
  declaredKey: string | null;
  declaredBars: number | null;
  analysis: WaveLoopAnalysisSnapshot | null;
  createdAt: string;
};

export type WaveSubmissionSnapshot = {
  id: string;
  categoryId: string;
  requestedSlotId: string | null;
  contributorId: string;
  creditName: string;
  title: string;
  status: WaveLoopStatus;
  statusReason: string | null;
  currentVersionNumber: number;
  submittedAt: string;
  versions: WaveLoopVersionSnapshot[];
};

export type WaveBeatTrackSnapshot = {
  id: string;
  categoryId: string | null;
  slotId: string | null;
  loopVersionId: string;
  position: number;
  gain: number;
  muted: boolean;
  isHostBase: boolean;
  creditName: string;
  contributorId: string;
};

export type WaveBeatSnapshot = {
  id: string;
  revisionNumber: number;
  parentRevisionId: string | null;
  reason: "INITIAL" | "ADMISSION" | "REPLACEMENT" | "REMOVAL" | "ROLLBACK";
  renderAssetId: string | null;
  renderStatus: WaveRenderStatus;
  tracks: WaveBeatTrackSnapshot[];
  createdAt: string;
};

export type WaveVoteSnapshot = {
  id: string;
  kind: WaveVoteKind;
  status: WaveVoteStatus;
  candidateVersionId: string;
  targetSlotId: string;
  replacesTrackId: string | null;
  referenceBeatRevisionId: string;
  previewAssetId: string | null;
  listeningStartedAt: string;
  opensAt: string;
  closesAt: string;
  quorum: number;
  approvalThreshold: number;
  totalVotes: number;
  approveCount: number | null;
  continueCount: number | null;
  approved: boolean | null;
};

export type WaveProgramAudioSnapshot = {
  source: WaveProgramSource;
  sourceRevisionId: string | null;
  sourceAssetId: string | null;
  sourceRtcPublicationId: string | null;
  renderStatus: WaveRenderStatus;
  generation: number;
  changedAt: string;
};

export type WaveProductionSnapshot = {
  session: WaveSessionSnapshot;
  categories: WaveCategorySnapshot[];
  submissions: WaveSubmissionSnapshot[];
  beat: WaveBeatSnapshot | null;
  vote: WaveVoteSnapshot | null;
  programAudio: WaveProgramAudioSnapshot | null;
};

export type WaveSessionLookup = {
  sessionId: string;
  roomId: string;
  lifecycleState: WaveLifecycleState;
  status: WaveSessionStatus;
};

export type WaveCategoryRule = {
  code: string;
  label: string;
  position?: number;
  minSlots?: number;
  maxSlots: number;
  required?: boolean;
};

export type InitializeWaveProductionInput = {
  roomId: string;
  bpm: number;
  musicalKey: string;
  timeSignature: string;
  expectedBars: number;
  maxDurationMs: number;
  acceptedMimeTypes: string[];
  desiredLoopTypes: string[];
  effectsPolicy: WaveEffectsPolicy;
  recommendedLufs?: number | null;
  categories: WaveCategoryRule[];
  idempotencyKey: string;
};

export type StartWaveVoteInput = {
  sessionId: string;
  kind: WaveVoteKind;
  candidateVersionId: string;
  targetSlotId: string;
  replacesTrackId?: string | null;
  referenceBeatRevisionId: string;
  listenSeconds: number;
  voteSeconds: number;
  quorum: number;
  approvalThreshold: number;
  idempotencyKey: string;
};

export type StartWaveVoteResult = {
  roundId: string;
  status: "LISTENING";
  kind: WaveVoteKind;
  candidateVersionId: string;
  referenceBeatRevisionId: string;
  serverNow: string;
};

export type CastWaveVoteInput = {
  roundId: string;
  choice: WaveVoteChoice;
  idempotencyKey: string;
};

export type CastWaveVoteResult = {
  roundId: string;
  accepted: true;
  serverCastAt: string;
};

export type FinalizeWaveVoteInput = { roundId: string; idempotencyKey: string };
export type FinalizeWaveVoteResult = {
  roundId: string;
  approved: boolean;
  approveCount: number;
  continueCount: number;
  totalVotes: number;
  beatRevisionId: string | null;
  activationId: string | null;
  serverFinalizedAt: string;
};

export type PrivateAuditionInput = {
  sessionId: string;
  candidateVersionId: string;
  referenceBeatRevisionId: string;
  mode: "SOLO" | "WITH_BEAT";
  renderAvailable: boolean;
  correlationId: string;
};

export type PrivateAuditionResult = {
  waveId: string;
  requestId: string;
  candidateVersionId: string;
  referenceBeatRevisionId: string;
  mode: "SOLO" | "WITH_BEAT";
  state: "READY" | "PREPARING" | "NOT_CONFIGURED";
  previewAssetId: string | null;
  updatedAt: string;
};

export type MissingWaveCommandInput = {
  sessionId: string;
  idempotencyKey: string;
};

export type WaveCategoryAvailabilityInput = MissingWaveCommandInput & { categoryId: string; open: boolean };
export type WaveSubmissionDecisionInput = MissingWaveCommandInput & { submissionId: string; reason?: string | null };
export type LaunchWaveProductionResult = { waveId: string; state: WaveLifecycleState };
export type WaveCategoryAvailabilityResult = { categoryId: string; open: boolean };
export type WaveSubmissionDecisionResult = { submissionId: string; status: WaveLoopStatus };

export type StartWaveClosingVoteInput = MissingWaveCommandInput & {
  previewAssetId: string;
  listenSeconds: number;
  voteSeconds: number;
};
export type StartWaveClosingVoteResult = { closingVoteId: string; status: "LISTENING" };
export type CastWaveClosingVoteInput = {
  closingVoteId: string;
  choice: WaveVoteChoice;
  idempotencyKey: string;
};
export type CastWaveClosingVoteResult = { closingVoteId: string; accepted: true };
export type FinalizeWaveClosingVoteInput = { closingVoteId: string; idempotencyKey: string };
export type FinalizeWaveClosingVoteResult = {
  closingVoteId: string;
  approved: boolean;
  finalBeatRevisionId: string | null;
};

export interface WaveProductionRepository {
  resolveSessionForRoom(roomId: string): Promise<WaveSessionLookup>;
  getSnapshot(sessionId: string): Promise<WaveProductionSnapshot>;
  recover(sessionId: string, cursor?: WaveEventCursor): Promise<WaveAuthoritativeResult<WaveRecoveryBundle>>;
  initialize(input: InitializeWaveProductionInput): Promise<WaveProductionSnapshot>;
  launch(input: MissingWaveCommandInput): Promise<WaveAuthoritativeResult<LaunchWaveProductionResult>>;
  setCategoryAvailability(input: WaveCategoryAvailabilityInput): Promise<WaveAuthoritativeResult<WaveCategoryAvailabilityResult>>;
  reviewSubmission(input: WaveSubmissionDecisionInput): Promise<WaveAuthoritativeResult<WaveSubmissionDecisionResult>>;
  rejectSubmission(input: WaveSubmissionDecisionInput): Promise<WaveAuthoritativeResult<WaveSubmissionDecisionResult>>;
  requestCorrection(input: WaveSubmissionDecisionInput): Promise<WaveAuthoritativeResult<WaveSubmissionDecisionResult>>;
  markReadyForVote(input: WaveSubmissionDecisionInput): Promise<WaveAuthoritativeResult<WaveSubmissionDecisionResult>>;
  requestPrivateAudition(input: PrivateAuditionInput): Promise<PrivateAuditionResult>;
  startVote(input: StartWaveVoteInput): Promise<StartWaveVoteResult>;
  castVote(input: CastWaveVoteInput): Promise<CastWaveVoteResult>;
  finalizeVote(input: FinalizeWaveVoteInput): Promise<FinalizeWaveVoteResult>;
  startClosingVote(input: StartWaveClosingVoteInput): Promise<WaveAuthoritativeResult<StartWaveClosingVoteResult>>;
  castClosingVote(input: CastWaveClosingVoteInput): Promise<WaveAuthoritativeResult<CastWaveClosingVoteResult>>;
  finalizeClosingVote(input: FinalizeWaveClosingVoteInput): Promise<WaveAuthoritativeResult<FinalizeWaveClosingVoteResult>>;
  switchProgramAudio(command: SwitchProgramAudioCommand): Promise<WaveAuthoritativeResult<ProgramAudioState>>;
}

export type WaveProductionRepositoryDependencies = {
  infra: WaveInfraAdapter;
};
