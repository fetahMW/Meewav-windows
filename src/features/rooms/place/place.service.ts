import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import type { RoomPresentation } from "../roomPresentation";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";
import type {
  PlaceAudioPlaybackState,
  PlaceAudioPreviewInput,
  PlaceAudioRoute,
  PlaceHostAudioStateCommitInput,
  PlaceHostAudioStateCommitResult,
  PlaceMessage,
  PlaceMixerChannel,
  PlacePollDuration,
  PlacePollOption,
  PlacePollOptionInput,
  PlaceProfile,
  PlacePublicStageEntry,
  PlaceRealtimeEvent,
  PlaceRoomState,
  PlaceSubscription,
  RoomGiftCandidate,
  RoomGiftDelivery,
  RoomGiftDeliveryInput,
  RoomGiftDraw,
  RoomGiftDrawInput,
} from "./place.types";

type RoomRow = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: "live" | "scheduled" | "ended";
  participants_count: number | null;
  created_at: string;
  queue_open: boolean | null;
  now_playing_title: string | null;
  now_playing_artist: string | null;
};

type PublicProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_image_url: string | null;
  primary_role_key: string | null;
  city: string | null;
  grade: number | string | null;
};

type ParticipantRow = { user_id: string; role: string; joined_at: string; left_at: string | null };
type PublicStageRow = {
  room_id: string;
  participant_id: string;
  stage_role: "host" | "guest";
  joined_at: string;
  stage_position: number;
  is_camera_enabled: boolean;
  is_microphone_enabled: boolean;
};
type PublicAudioChannelRow = {
  participant_id: string;
  public_mic_gain: number;
  is_routed_to_public: boolean;
};
type InvitationRow = { id: string; guest_id: string; status: string; created_at: string };
type QueueRow = {
  id: string;
  user_id: string;
  preview_url: string | null;
  joined_queue_at: string;
  removed_at: string | null;
};
type MessageRow = { id: string; user_id: string; content: string; created_at: string; is_system: boolean; is_highlighted: boolean };
type MixerRow = {
  guest_id: string;
  is_mic_muted: boolean;
  is_music_muted: boolean;
  is_video_off: boolean;
  self_video_off?: boolean;
  host_video_forced_off?: boolean;
  mic_gain: number;
  local_mic_gain?: number;
  music_gain: number;
  host_music_gain?: number;
  host_mic_forced_muted?: boolean;
  audio_live_enabled?: boolean;
  audio_preview_ready?: boolean;
  audio_playback_state?: PlaceAudioPlaybackState;
  audio_track_title?: string | null;
  audio_track_artist?: string | null;
  audio_track_duration_seconds?: number | null;
  audio_route?: PlaceAudioRoute;
  audio_generation?: string | null;
  audio_revision?: number | string;
};
type PublicAudioStateRow = {
  audio_track_title: string | null;
  audio_track_artist: string | null;
  audio_track_duration_seconds: number | null;
  audio_route: PlaceAudioRoute;
  audio_playback_state: PlaceAudioPlaybackState;
};
type BroadcastRow = {
  mux_playback_id: string | null;
  mux_status: PlaceRoomState["broadcastStatus"];
  started_at: string | null;
};
type PollRow = { id: string; question: string; options: unknown; duration_seconds: number | null; show_results?: boolean | null; is_active: boolean; created_at: string };
type PollAggregateRow = {
  counts?: Array<{ option_index?: number; votes?: number; weighted_percent?: number }>;
  current_user_vote_index?: number | null;
};
type PinnedItemRow = { id: string; content: string; expires_at: string | null; source_message_id: string | null };
type GiftDrawRow = {
  id: string;
  gift_code: RoomGiftDraw["giftCode"];
  gift_label: string;
  pool_mode: RoomGiftDraw["poolMode"];
  status: RoomGiftDraw["status"];
  eligible_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  reveal_at: string | null;
  revealed_at: string | null;
  winner_profile_id: string | null;
  winner_display_name: string | null;
  winner_avatar_url: string | null;
  winner_source: RoomGiftCandidate["source"] | null;
  created_at: string;
};
type GiftDeliveryRow = {
  id: string;
  room_id_snapshot: string;
  gift_code: RoomGiftDelivery["giftCode"];
  gift_label: string;
  action: RoomGiftDelivery["action"];
  status: RoomGiftDelivery["status"];
  round_label: string | null;
  recipient_profile_id_snapshot: string;
  recipient_display_name_snapshot: string;
  recipient_avatar_url_snapshot: string | null;
  recipient_source: RoomGiftDelivery["recipientSource"];
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
};

const ROOM_SELECT = "id,host_id,title,description,cover_url,status,participants_count,created_at,queue_open,now_playing_title,now_playing_artist";
const PROFILE_SELECT = "id,username,display_name,avatar_url,profile_image_url,primary_role_key,city,grade";
const GIFT_DRAW_SELECT = "id,gift_code,gift_label,pool_mode,status,eligible_count,scheduled_at,started_at,reveal_at,revealed_at,winner_profile_id,winner_display_name,winner_avatar_url,winner_source,created_at";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMissingPublicStageProjection(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return Boolean(
    error.message?.includes("rooms_public_stage_v1")
    && (error.message.includes("schema cache") || error.message.includes("does not exist")),
  );
}

function pollOptionFromValue(value: unknown, votes: number): PlacePollOption {
  if (typeof value === "string") {
    return { label: value, votes, imageUrl: null, mediaId: null, durationLabel: null };
  }
  const option = asRecord(value);
  return {
    label: typeof option.label === "string" ? option.label : "Option",
    votes,
    imageUrl: typeof option.imageUrl === "string" ? option.imageUrl : null,
    mediaId: typeof option.mediaId === "string" ? option.mediaId : null,
    durationLabel: typeof option.durationLabel === "string" ? option.durationLabel : null,
  };
}

function isMissingPublicAudioChannelsProjection(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return Boolean(
    error.message?.includes("rooms_public_audio_channels_v1")
    && (error.message.includes("schema cache") || error.message.includes("does not exist")),
  );
}

function isMissingGiftDrawInfrastructure(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return Boolean(
    error.message?.includes("room_gift_draws_v1")
    && (error.message.includes("schema cache") || error.message.includes("does not exist")),
  );
}

function isMissingPublicAudioInfrastructure(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return Boolean(
    error.message?.includes("room_public_audio_state_v1")
    && (error.message.includes("schema cache") || error.message.includes("does not exist")),
  );
}

function isMissingHostAudioCommitRpc(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return Boolean(
    error.message?.includes("rooms_commit_host_audio_state_v1")
    && (error.message.includes("schema cache") || error.message.includes("does not exist")),
  );
}

function isMissingPrivateHostAudioState(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return Boolean(
    error.message?.includes("room_mixer_state_v2")
    && (error.message.includes("audio_generation") || error.message.includes("audio_revision") || error.message.includes("audio_route"))
    && (error.message.includes("schema cache") || error.message.includes("does not exist")),
  );
}

function giftDrawFromRow(row: GiftDrawRow | null | undefined): RoomGiftDraw | null {
  if (!row) return null;
  const hasRevealedWinner = row.status === "revealed" && Boolean(row.winner_display_name?.trim());
  return {
    id: row.id,
    giftCode: row.gift_code,
    giftLabel: row.gift_label,
    poolMode: row.pool_mode,
    status: row.status,
    eligibleCount: Math.max(0, numberValue(row.eligible_count)),
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    revealAt: row.reveal_at,
    revealedAt: row.revealed_at,
    winner: hasRevealedWinner ? {
      key: row.winner_profile_id ?? `${row.id}:winner`,
      profileId: row.winner_profile_id,
      displayName: row.winner_display_name!.trim(),
      avatarUrl: row.winner_avatar_url,
      source: row.winner_source ?? "room",
    } : null,
    createdAt: row.created_at,
  };
}

function giftDrawFromRpc(data: unknown): RoomGiftDraw | null {
  const value = Array.isArray(data) ? data[0] : data;
  return giftDrawFromRow(value as GiftDrawRow | null | undefined);
}

function hostAudioCommitResultFromRow(
  data: unknown,
  input: PlaceHostAudioStateCommitInput,
  transport: PlaceHostAudioStateCommitResult["transport"],
): PlaceHostAudioStateCommitResult {
  const raw = Array.isArray(data) ? data[0] : data;
  const row = asRecord(raw);
  const revision = numberValue(row.audio_revision, input.expectedRevision + (transport === "atomic" ? 1 : 0));
  return {
    route: row.audio_route === "public" || row.audio_route === "preview" ? row.audio_route : input.route,
    playbackState: typeof row.audio_playback_state === "string"
      && ["idle", "ready", "previewing", "playing", "paused", "ended"].includes(row.audio_playback_state)
      ? row.audio_playback_state as PlaceAudioPlaybackState
      : input.playbackState,
    previewReady: typeof row.audio_preview_ready === "boolean" ? row.audio_preview_ready : input.previewReady,
    generation: typeof row.audio_generation === "string" ? row.audio_generation : input.generation,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : input.expectedRevision,
    title: typeof row.audio_track_title === "string" ? row.audio_track_title : input.title,
    artist: typeof row.audio_track_artist === "string" ? row.audio_track_artist : input.artist,
    durationSeconds: typeof row.audio_track_duration_seconds === "number"
      ? row.audio_track_duration_seconds
      : input.durationSeconds,
    transport,
  };
}

function giftDeliveryFromRpc(data: unknown): RoomGiftDelivery | null {
  const value = Array.isArray(data) ? data[0] : data;
  const row = value as GiftDeliveryRow | null | undefined;
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id_snapshot,
    giftCode: row.gift_code,
    giftLabel: row.gift_label,
    action: row.action,
    status: row.status,
    roundLabel: row.round_label,
    recipientProfileId: row.recipient_profile_id_snapshot,
    recipientDisplayName: row.recipient_display_name_snapshot,
    recipientAvatarUrl: row.recipient_avatar_url_snapshot,
    recipientSource: row.recipient_source,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

function profileFromRow(row: PublicProfileRow | undefined, id: string): PlaceProfile {
  if (!row) {
    return {
      id,
      displayName: "Artiste MeeWav",
      handle: "@meewav",
      role: "Artiste",
      city: "MeeWav",
      avatarUrl: "/avatar/web/carousel/utilisateur.webp",
      gradeLevel: 1,
    };
  }
  const username = row.username?.trim() || "meewav";
  return {
    id,
    displayName: row.display_name?.trim() || username,
    handle: username.startsWith("@") ? username : `@${username}`,
    role: row.primary_role_key?.replace(/_/g, " ") || "Artiste",
    city: row.city?.trim() || "MeeWav",
    avatarUrl: row.profile_image_url || row.avatar_url || "/avatar/web/carousel/utilisateur.webp",
    gradeLevel: Math.min(6, Math.max(1, numberValue(row.grade, 1))),
  };
}

function buildLiveState(
  room: RoomRow,
  profiles: Map<string, PublicProfileRow>,
  participants: ParticipantRow[],
  publicStageRows: PublicStageRow[],
  publicAudioChannelRows: PublicAudioChannelRow[],
  invitations: InvitationRow[],
  queueRows: QueueRow[],
  messages: MessageRow[],
  mixerRows: MixerRow[],
  broadcast: BroadcastRow | null,
  engagement: unknown,
  poll: PollRow | null,
  pollVoteCounts: number[],
  currentUserPollVoteIndex: number | null,
  pinnedItem: PinnedItemRow | null,
  giftDraw: GiftDrawRow | null,
  privateHostAudioState: MixerRow | null,
  publicAudioState: PublicAudioStateRow | null,
  currentUserId?: string | null,
  pollWeightedPercentages: Array<number | undefined> = [],
): PlaceRoomState {
  const demo = createPlaceDemoState(currentUserId);
  const host = profileFromRow(profiles.get(room.host_id), room.host_id);
  const invitationByGuest = new Map(invitations.map((row) => [row.guest_id, row]));
  const activeParticipants = participants
    .filter((row) => !row.left_at && row.user_id !== room.host_id)
    .sort((left, right) => new Date(left.joined_at).getTime() - new Date(right.joined_at).getTime());
  const mixerByGuest = new Map(mixerRows.map((row) => [row.guest_id, row]));
  const publicAudioByParticipant = new Map(
    publicAudioChannelRows.map((row) => [row.participant_id, row]),
  );
  const publicStageEntries: PlacePublicStageEntry[] = publicStageRows
    .filter((row) => row.room_id === room.id && (row.stage_role === "host" || row.stage_role === "guest"))
    .map((row) => ({
      participantId: row.participant_id,
      stageRole: row.stage_role,
      joinedAt: row.joined_at,
      stagePosition: numberValue(row.stage_position),
      isCameraEnabled: row.is_camera_enabled === true,
      isMicrophoneEnabled: row.is_microphone_enabled === true,
    }))
    .sort((left, right) => left.stagePosition - right.stagePosition);
  const publicStageByParticipant = new Map(publicStageEntries.map((entry) => [entry.participantId, entry]));
  const hasPublicProjection = publicStageEntries.some((entry) => entry.stageRole === "host");
  const projectedOnstage = publicStageEntries
    .filter((entry) => entry.stageRole === "guest")
    .slice(0, 3)
    .map((entry) => {
      const mixer = mixerByGuest.get(entry.participantId);
      return {
        id: entry.participantId,
        invitationId: invitationByGuest.get(entry.participantId)?.id,
        profile: profileFromRow(profiles.get(entry.participantId), entry.participantId),
        joinedAt: entry.joinedAt,
        status: "onstage" as const,
        // RTC publication metadata remains a separate media-plane contract.
        videoUrl: undefined,
        isCameraEnabled: entry.isCameraEnabled,
        isSelfCameraEnabled: mixer ? mixer.self_video_off !== true : entry.isCameraEnabled,
        isHostForcedCameraOff: mixer?.host_video_forced_off === true,
        isMicrophoneEnabled: entry.isMicrophoneEnabled,
        isSpeaking: false,
        latencyMs: 0,
      };
    });
  const privateOnstageFallback = activeParticipants
    .filter((participant) => invitationByGuest.get(participant.user_id)?.status === "onstage")
    .slice(0, 3)
    .map((participant) => {
      const invitation = invitationByGuest.get(participant.user_id);
      const mixer = mixerByGuest.get(participant.user_id);
      return {
        id: participant.user_id,
        invitationId: invitation?.id,
        profile: profileFromRow(profiles.get(participant.user_id), participant.user_id),
        joinedAt: participant.joined_at,
        status: "onstage" as const,
        videoUrl: undefined,
        isCameraEnabled: mixer?.is_video_off !== true,
        isSelfCameraEnabled: mixer?.self_video_off !== true,
        isHostForcedCameraOff: mixer?.host_video_forced_off === true,
        isMicrophoneEnabled: mixer?.is_mic_muted !== true && mixer?.host_mic_forced_muted !== true,
        isSpeaking: false,
        latencyMs: 0,
      };
    });
  const privateBackstageParticipants = activeParticipants
    .filter((participant) => invitationByGuest.get(participant.user_id)?.status === "backstage")
    .map((participant) => {
      const invitation = invitationByGuest.get(participant.user_id);
      const mixer = mixerByGuest.get(participant.user_id);
      return {
        id: participant.user_id,
        invitationId: invitation?.id,
        profile: profileFromRow(profiles.get(participant.user_id), participant.user_id),
        joinedAt: participant.joined_at,
        status: "backstage" as const,
        videoUrl: undefined,
        isCameraEnabled: mixer?.is_video_off !== true,
        isSelfCameraEnabled: mixer?.self_video_off !== true,
        isHostForcedCameraOff: mixer?.host_video_forced_off === true,
        isMicrophoneEnabled: mixer?.is_mic_muted !== true && mixer?.host_mic_forced_muted !== true,
        isSpeaking: false,
        latencyMs: 0,
      };
    });
  const stageParticipants = [
    ...(hasPublicProjection ? projectedOnstage : privateOnstageFallback),
    ...privateBackstageParticipants,
  ];
  const invitationQueueParticipants = invitations
    .filter((invitation) => invitation.status === "pending" || invitation.status === "accepted" || invitation.status === "ready")
    .map((invitation) => ({
      id: invitation.guest_id,
      invitationId: invitation.id,
      profile: profileFromRow(profiles.get(invitation.guest_id), invitation.guest_id),
      joinedAt: invitation.created_at,
      status: invitation.status as "pending" | "accepted" | "ready",
      imageUrl: profileFromRow(profiles.get(invitation.guest_id), invitation.guest_id).avatarUrl,
      isCameraEnabled: true,
      isMicrophoneEnabled: invitation.status === "ready",
      isSpeaking: false,
      latencyMs: 0,
    }));
  const invitedGuestIds = new Set(invitationQueueParticipants.map((participant) => participant.profile.id));
  const rawQueueParticipants = queueRows
    .filter((entry) => !entry.removed_at && !invitedGuestIds.has(entry.user_id))
    .map((entry) => ({
      id: entry.user_id,
      queueEntryId: entry.id,
      profile: profileFromRow(profiles.get(entry.user_id), entry.user_id),
      joinedAt: entry.joined_queue_at,
      status: "pending" as const,
      imageUrl: entry.preview_url || profileFromRow(profiles.get(entry.user_id), entry.user_id).avatarUrl,
      isCameraEnabled: Boolean(entry.preview_url),
      isMicrophoneEnabled: false,
      isSpeaking: false,
      latencyMs: 0,
    }));
  const queueParticipants = [...rawQueueParticipants, ...invitationQueueParticipants]
    .sort((left, right) => new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime());

  const mappedMessages: PlaceMessage[] = messages.map((message) => ({
    id: message.id,
    author: message.is_system ? null : profileFromRow(profiles.get(message.user_id), message.user_id),
    content: message.content,
    createdAt: message.created_at,
    isSystem: message.is_system,
    isPinned: message.is_highlighted,
  }));

  const guestChannelParticipants = [
    ...stageParticipants,
    ...invitationQueueParticipants.filter((participant) => participant.status === "ready"),
  ];
  const guestChannels: PlaceMixerChannel[] = guestChannelParticipants
    .map((participant, index) => {
      const mixer = mixerByGuest.get(participant.profile.id);
      const publicStageState = publicStageByParticipant.get(participant.profile.id);
      const publicAudioChannel = publicAudioByParticipant.get(participant.profile.id);
      const privateMixerAuthoritative = Boolean(
        mixer
        && (currentUserId === host.id || participant.profile.id === currentUserId),
      );
      const isPubliclyMuted = publicStageState
        ? !publicStageState.isMicrophoneEnabled
        : mixer?.is_mic_muted === true || mixer?.host_mic_forced_muted === true;
      return {
        id: `guest-${participant.profile.id}`,
        participantId: participant.profile.id,
        label: participant.profile.displayName.split(" ")[0] || `Invité ${index + 1}`,
        detail: "Guest",
        kind: "guest",
        gain: numberValue(
          participant.profile.id === currentUserId
            ? mixer?.local_mic_gain
            : currentUserId === host.id
              ? mixer?.mic_gain ?? publicAudioChannel?.public_mic_gain
              : publicAudioChannel?.public_mic_gain,
          1,
        ),
        level: 0,
        isMuted: isPubliclyMuted,
        isSelfMuted: mixer?.is_mic_muted === true,
        isSolo: false,
        isHostForcedMuted: mixer?.host_mic_forced_muted === true,
        isRoutedToPublic: publicAudioChannel?.is_routed_to_public
          ?? (privateMixerAuthoritative
            ? !isPubliclyMuted && (mixer?.audio_live_enabled ?? true)
            : false),
        publicMixAuthoritative: Boolean(publicAudioChannel || privateMixerAuthoritative),
        signalState: isPubliclyMuted ? "muted" : "active",
        accent: ["#ffb44c", "#5eb8ff", "#ff6ea9"][index] ?? "#a578ff",
      };
    });
  const engagementRecord = asRecord(engagement);
  const hostMixer = mixerByGuest.get(host.id);
  const ownsHostPlayer = currentUserId === host.id;
  const hostPlayerState = ownsHostPlayer ? (privateHostAudioState ?? hostMixer) : null;
  const publicAudioOnAir = publicAudioState?.audio_route === "public";
  const visibleAudioTitle = ownsHostPlayer
    ? hostPlayerState?.audio_track_title
    : publicAudioOnAir ? publicAudioState?.audio_track_title : null;
  const visibleAudioArtist = ownsHostPlayer
    ? hostPlayerState?.audio_track_artist
    : publicAudioOnAir ? publicAudioState?.audio_track_artist : null;
  const visibleAudioDuration = ownsHostPlayer
    ? hostPlayerState?.audio_track_duration_seconds
    : publicAudioOnAir ? publicAudioState?.audio_track_duration_seconds : null;
  const visibleAudioPlaybackState = ownsHostPlayer
    ? hostPlayerState?.audio_playback_state
    : publicAudioOnAir ? publicAudioState?.audio_playback_state : "idle";
  const visibleAudioRoute: PlaceAudioRoute = ownsHostPlayer
    ? hostPlayerState?.audio_route ?? (hostMixer?.audio_live_enabled === true ? "public" : "preview")
    : publicAudioState?.audio_route ?? "preview";
  const publicHostState = publicStageByParticipant.get(host.id);
  const hostPublicAudioChannel = publicAudioByParticipant.get(host.id);
  const hostIsPubliclyMuted = publicHostState
    ? !publicHostState.isMicrophoneEnabled
    : hostMixer?.is_mic_muted === true || hostMixer?.host_mic_forced_muted === true;
  const goldenLikeAvailableAt = typeof engagementRecord.golden_like_available_at === "string"
    ? engagementRecord.golden_like_available_at
    : null;
  const currentUserProfile = currentUserId
    ? profileFromRow(profiles.get(currentUserId), currentUserId)
    : null;
  const currentUserIsActiveParticipant = Boolean(currentUserId && (
    currentUserId === room.host_id
    || activeParticipants.some((participant) => participant.user_id === currentUserId)
  ));
  const muxProgramSource = broadcast?.mux_status === "active" && broadcast.mux_playback_id
    ? {
        id: `mux-program-${broadcast.mux_playback_id}`,
        type: "desktop_composite" as const,
        aspectRatio: "16:9" as const,
        transport: "hls" as const,
        publicationSid: `mux:${broadcast.mux_playback_id}`,
        active: true,
        programEligible: true,
        viewerSelectable: true,
        preferredForDesktop: true,
        videoUrl: `https://stream.mux.com/${broadcast.mux_playback_id}.m3u8`,
        imageUrl: room.cover_url || host.avatarUrl,
      }
    : null;

  return {
    ...demo,
    id: room.id,
    source: "live",
    title: room.title,
    description: room.description || demo.description,
    status: room.status,
    startedAt: broadcast?.started_at || room.created_at,
    host,
    participantsCount: numberValue(room.participants_count),
    peakViewers: numberValue(room.participants_count),
    likesCount: numberValue(engagementRecord.likes_count),
    goldenLikesCount: numberValue(engagementRecord.golden_likes_count),
    hatTotalAmount: null,
    currentUserHasLiked: engagementRecord.current_user_has_liked === true,
    currentUserHasGoldenLiked: engagementRecord.current_user_has_golden_liked === true,
    goldenLikeAvailableAt,
    currentUserProfile,
    currentUserIsActiveParticipant,
    queueOpen: room.queue_open === true,
    connectionLabel: broadcast?.mux_status === "active" ? "Antenne connectée" : "Connexion au transport…",
    broadcastStatus: broadcast?.mux_status ?? "idle",
    participants: [
      {
        id: "host",
        profile: host,
        joinedAt: room.created_at,
        status: "host",
        videoUrl: broadcast?.mux_status === "active" && broadcast.mux_playback_id
          ? `https://stream.mux.com/${broadcast.mux_playback_id}.m3u8`
          : undefined,
        imageUrl: room.cover_url || host.avatarUrl,
        videoSources: muxProgramSource ? [muxProgramSource] : undefined,
        isCameraEnabled: publicHostState?.isCameraEnabled ?? hostMixer?.is_video_off !== true,
        isSelfCameraEnabled: hostMixer?.self_video_off !== true,
        isHostForcedCameraOff: hostMixer?.host_video_forced_off === true,
        isMicrophoneEnabled: publicHostState?.isMicrophoneEnabled ?? hostMixer?.is_mic_muted !== true,
        isSpeaking: false,
        latencyMs: 0,
      },
      ...stageParticipants,
    ],
    queue: queueParticipants,
    messages: mappedMessages,
    channels: [
      {
        ...demo.channels.find((channel) => channel.kind === "microphone")!,
        participantId: host.id,
          label: "Ma voix",
        detail: host.displayName,
        // The Host owns the creative input gain of their own microphone.
        // Public Guest gains remain separate Host-regie controls below.
        gain: numberValue(
          currentUserId === host.id
            ? hostMixer?.local_mic_gain
            : hostPublicAudioChannel?.public_mic_gain,
          1,
        ),
        level: 0,
        isMuted: hostIsPubliclyMuted,
        isSelfMuted: hostMixer?.is_mic_muted === true,
        isHostForcedMuted: hostMixer?.host_mic_forced_muted === true,
        isRoutedToPublic: hostPublicAudioChannel?.is_routed_to_public
          ?? (currentUserId === host.id && hostMixer ? !hostIsPubliclyMuted : false),
        publicMixAuthoritative: Boolean(
          hostPublicAudioChannel || (currentUserId === host.id && hostMixer),
        ),
        signalState: hostIsPubliclyMuted ? "muted" : "active",
      },
      ...guestChannels,
      {
        ...demo.channels.find((channel) => channel.kind === "audio")!,
        participantId: host.id,
        label: "Musique",
        detail: room.now_playing_title || "Source commune",
        gain: numberValue(hostMixer?.music_gain, 1),
        level: 0,
        isMuted: hostMixer?.is_music_muted === true,
        isSelfMuted: hostMixer?.is_music_muted === true,
        isRoutedToPublic: hostMixer?.audio_live_enabled === true,
        signalState: hostMixer?.is_music_muted === true
          ? "muted"
          : room.now_playing_title || room.now_playing_artist
            ? "active"
            : "silent",
      },
      {
        ...demo.channels.find((channel) => channel.kind === "master")!,
        gain: 1,
        level: 0,
        isMuted: false,
        signalState: "silent",
      },
    ],
    // FX are a private, device-local chain. A live Room must never inherit
    // another participant's demo preset or publish remote FX values.
    personalVocal: {
      enabled: false,
      monitoring: false,
      preset: "Clean",
      tuneEnabled: false,
      tuneKey: "C",
      tuneScale: "Chromatique",
      tuneAmount: 0,
      tuneSpeed: 0.5,
      tuneHumanize: 0.5,
      tuneSmooth: 0.6,
      tuneShift: 0,
      tunePreset: "natural",
      reverbEnabled: false,
      reverbAmount: 0,
      reverbType: "Room",
      reverbDuration: 1.2,
      reverbPreDelayMs: 0,
      eqEnabled: false,
      compEnabled: false,
      compAmount: 0,
      compThresholdDb: -18,
      compRatio: 2,
      compAttackMs: 18,
      compReleaseMs: 140,
      compMakeupDb: 0,
      delayEnabled: false,
      delayAmount: 0,
      delayTimeMs: 280,
      delayFeedback: 0.24,
    },
    track: {
      ...demo.track,
      title: visibleAudioTitle || room.now_playing_title || demo.track.title,
      artist: visibleAudioArtist || room.now_playing_artist || host.displayName,
      durationSeconds: numberValue(visibleAudioDuration, 0),
      currentSeconds: 0,
      bpm: undefined,
      musicalKey: undefined,
      isPlaying: visibleAudioPlaybackState === "playing"
        || Boolean(room.now_playing_title || room.now_playing_artist),
      isLooping: false,
      waveform: [],
      audioRoute: visibleAudioRoute,
      audioPlaybackState: visibleAudioPlaybackState ?? "idle",
      audioPreviewReady: ownsHostPlayer ? hostPlayerState?.audio_preview_ready === true : visibleAudioRoute === "public",
      audioGeneration: ownsHostPlayer ? hostPlayerState?.audio_generation ?? null : null,
      audioRevision: Math.max(0, numberValue(
        ownsHostPlayer ? hostPlayerState?.audio_revision : 0,
        0,
      )),
    },
    poll: poll ? {
      id: poll.id,
      question: poll.question,
      options: (Array.isArray(poll.options) ? poll.options : [])
        .map((option, index) => ({...pollOptionFromValue(option, pollVoteCounts[index] ?? 0),weightedPercent:pollWeightedPercentages[index]})),
      durationSeconds: ([15, 30, 60, 120].includes(poll.duration_seconds ?? -1) ? poll.duration_seconds : null) as PlacePollDuration,
      endsAt: poll.duration_seconds === null ? null : new Date(new Date(poll.created_at).getTime() + poll.duration_seconds * 1_000).toISOString(),
      isActive: poll.is_active
        && (poll.duration_seconds === null || new Date(poll.created_at).getTime() + poll.duration_seconds * 1_000 > Date.now()),
      resultsVisible: poll.show_results !== false,
      currentUserVoteIndex: currentUserId ? currentUserPollVoteIndex : null,
    } : null,
    giftDraw: giftDrawFromRow(giftDraw),
    pinnedMessageId: pinnedItem?.source_message_id ?? null,
    highlightText: pinnedItem?.content ?? null,
  };
}

export function createPlaceRepository(client: SupabaseClient = supabase) {
  // Keep a live Room usable while a deployment is rolling out the matching
  // migration. Once the table is observed, Realtime is enabled for it too.
  let giftDrawInfrastructureAvailable = true;
  let publicAudioInfrastructureAvailable = true;
  let publicAudioChannelsProjectionAvailable = true;
  return {
    async load(
      roomId?: string | null,
      currentUserId?: string | null,
      expectedRoomType: RoomPresentation["id"] = "place",
    ): Promise<PlaceRoomState | null> {
      let roomQuery = client
        .from("rooms_v2")
        .select(ROOM_SELECT)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(1);
      if (roomId) roomQuery = roomQuery.eq("id", roomId);
      else roomQuery = roomQuery.eq("type", expectedRoomType);
      const { data: roomData, error: roomError } = await roomQuery.maybeSingle();
      if (roomError) throw roomError;
      if (!roomData) return null;
      const room = roomData as unknown as RoomRow;
      const privateHostAudioQuery = currentUserId === room.host_id
        ? client.from("room_mixer_state_v2")
            .select("guest_id,audio_live_enabled,audio_preview_ready,audio_playback_state,audio_track_title,audio_track_artist,audio_track_duration_seconds,audio_route,audio_generation,audio_revision")
            .eq("room_id", room.id)
            .eq("guest_id", room.host_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [participantsResult, publicStageResult, publicAudioChannelsResult, invitationsResult, queueResult, messagesResult, mixerResult, broadcastResult, engagementResult, pollResult, pinnedResult, giftDrawResult, publicAudioResult, privateHostAudioResult] = await Promise.all([
        client.from("room_participants_v2").select("user_id,role,joined_at,left_at").eq("room_id", room.id).is("left_at", null).order("joined_at", { ascending: true }),
        client.rpc("rooms_public_stage_v1", { p_room_id: room.id }),
        client.rpc("rooms_public_audio_channels_v1", { p_room_id: room.id }),
        client.from("room_invitations_v2").select("id,guest_id,status,created_at").eq("room_id", room.id).in("status", ["accepted", "ready", "backstage", "onstage", "pending"]),
        client.from("room_queue_v2").select("id,user_id,preview_url,joined_queue_at,removed_at").eq("room_id", room.id).is("removed_at", null).order("joined_queue_at", { ascending: true }),
        client.from("room_messages_v2").select("id,user_id,content,created_at,is_system,is_highlighted").eq("room_id", room.id).order("created_at", { ascending: false }).limit(80),
        client.from("room_mixer_state_v2").select("guest_id,is_mic_muted,is_music_muted,is_video_off,self_video_off,host_video_forced_off,mic_gain,local_mic_gain,music_gain,host_music_gain,host_mic_forced_muted,audio_live_enabled,audio_preview_ready,audio_playback_state,audio_track_title,audio_track_artist,audio_track_duration_seconds").eq("room_id", room.id),
        client.from("room_broadcasts_v2").select("mux_playback_id,mux_status,started_at").eq("room_id", room.id).maybeSingle(),
        client.rpc("rooms_engagement_state_v1", { p_room_id: room.id }),
        client.from("room_polls_v2").select("id,question,options,duration_seconds,show_results,is_active,created_at").eq("room_id", room.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("room_pinned_items_v2").select("id,content,expires_at,source_message_id").eq("room_id", room.id).eq("is_active", true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle(),
        client.from("room_gift_draws_v1").select(GIFT_DRAW_SELECT).eq("room_id", room.id).in("status", ["ready", "scheduled", "spinning", "revealed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("room_public_audio_state_v1").select("audio_track_title,audio_track_artist,audio_track_duration_seconds,audio_route,audio_playback_state").eq("room_id", room.id).maybeSingle(),
        privateHostAudioQuery,
      ]);

      giftDrawInfrastructureAvailable = !isMissingGiftDrawInfrastructure(giftDrawResult.error);
      publicAudioInfrastructureAvailable = !isMissingPublicAudioInfrastructure(publicAudioResult.error);
      publicAudioChannelsProjectionAvailable = !isMissingPublicAudioChannelsProjection(publicAudioChannelsResult.error);
      const privateHostAudioAvailable = !isMissingPrivateHostAudioState(privateHostAudioResult.error);

      const queryError = [
        participantsResult.error,
        publicStageResult.error && !isMissingPublicStageProjection(publicStageResult.error)
          ? publicStageResult.error
          : null,
        publicAudioChannelsResult.error && publicAudioChannelsProjectionAvailable
          ? publicAudioChannelsResult.error
          : null,
        invitationsResult.error,
        queueResult.error,
        messagesResult.error,
        mixerResult.error,
        broadcastResult.error,
        engagementResult.error,
        pollResult.error,
        pinnedResult.error,
        giftDrawResult.error && giftDrawInfrastructureAvailable ? giftDrawResult.error : null,
        publicAudioResult.error && publicAudioInfrastructureAvailable ? publicAudioResult.error : null,
        privateHostAudioResult.error && privateHostAudioAvailable ? privateHostAudioResult.error : null,
      ].find(Boolean);
      if (queryError) throw queryError;

      const participantRows = (participantsResult.data ?? []) as unknown as ParticipantRow[];
      const publicStageRows = publicStageResult.error
        ? []
        : (publicStageResult.data ?? []) as unknown as PublicStageRow[];
      const publicAudioChannelRows = publicAudioChannelsProjectionAvailable
        ? (publicAudioChannelsResult.data ?? []) as unknown as PublicAudioChannelRow[]
        : [];
      const invitationRows = (invitationsResult.data ?? []) as unknown as InvitationRow[];
      const activeQueueRows = (queueResult.data ?? []) as unknown as QueueRow[];
      const messageRows = ((messagesResult.data ?? []) as unknown as MessageRow[]).reverse();
      const mixerRows = (mixerResult.data ?? []) as unknown as MixerRow[];
      const activePoll = pollResult.data as unknown as PollRow | null;
      let pollVoteCounts: number[] = [];
      const pollWeightedPercentages: Array<number | undefined> = [];
      let currentUserPollVoteIndex: number | null = null;
      if (activePoll) {
        const pollStateResult = await client.rpc("rooms_poll_state_v3", { p_poll_id: activePoll.id });
        if (pollStateResult.error) throw pollStateResult.error;
        const pollAggregate = asRecord(pollStateResult.data) as PollAggregateRow;
        const counts = Array.isArray(pollAggregate.counts) ? pollAggregate.counts : [];
        pollVoteCounts = counts.reduce<number[]>((result, item) => {
          const optionIndex = numberValue(item.option_index, -1);
          if (optionIndex >= 0) { result[optionIndex] = Math.max(0, numberValue(item.votes, 0));pollWeightedPercentages[optionIndex]=typeof item.weighted_percent === "number" ? item.weighted_percent : undefined; }
          return result;
        }, []);
        currentUserPollVoteIndex = typeof pollAggregate.current_user_vote_index === "number"
          ? pollAggregate.current_user_vote_index
          : null;
      }

      const profileIds = [...new Set([
        room.host_id,
        ...participantRows.map((row) => row.user_id),
        ...publicStageRows.map((row) => row.participant_id),
        ...invitationRows.map((row) => row.guest_id),
        ...activeQueueRows.map((row) => row.user_id),
        ...messageRows.map((row) => row.user_id),
        ...(currentUserId ? [currentUserId] : []),
      ])];
      const profilesResult = await client.from("public_profiles").select(PROFILE_SELECT).in("id", profileIds);
      if (profilesResult.error) throw profilesResult.error;
      const profileRows = (profilesResult.data ?? []) as unknown as PublicProfileRow[];
      const profiles = new Map(profileRows.map((row) => [row.id, row]));

      return buildLiveState(
        room,
        profiles,
        participantRows,
        publicStageRows,
        publicAudioChannelRows,
        invitationRows,
        activeQueueRows,
        messageRows,
        mixerRows,
        broadcastResult.data as unknown as BroadcastRow | null,
        engagementResult.data,
        activePoll,
        pollVoteCounts,
        currentUserPollVoteIndex,
        pinnedResult.data as unknown as PinnedItemRow | null,
        giftDrawInfrastructureAvailable ? giftDrawResult.data as unknown as GiftDrawRow | null : null,
        privateHostAudioAvailable ? privateHostAudioResult.data as unknown as MixerRow | null : null,
        publicAudioInfrastructureAvailable ? publicAudioResult.data as unknown as PublicAudioStateRow | null : null,
        currentUserId,
        pollWeightedPercentages,
      );
    },

    subscribe(roomId: string, onEvent: (event: PlaceRealtimeEvent) => void, pollId?: string | null): PlaceSubscription {
      // The stage membership RPC remains an iOS-compatible snapshot. The
      // narrow public audio projection below is materialized specifically so
      // active Room members receive gain/route refreshes without mixer access.
      const tables = [
        { table: "rooms_v2", filter: `id=eq.${roomId}` },
        { table: "room_participants_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_invitations_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_queue_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_messages_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_mixer_state_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_polls_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_pinned_items_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_reactions_v2", filter: `room_id=eq.${roomId}` },
        { table: "room_broadcasts_v2", filter: `room_id=eq.${roomId}` },
        ...(publicAudioChannelsProjectionAvailable ? [{ table: "room_public_audio_channels_v1", filter: `room_id=eq.${roomId}` }] : []),
        ...(publicAudioInfrastructureAvailable ? [{ table: "room_public_audio_state_v1", filter: `room_id=eq.${roomId}` }] : []),
        ...(giftDrawInfrastructureAvailable ? [{ table: "room_gift_draws_v1", filter: `room_id=eq.${roomId}` }] : []),
        ...(pollId ? [{ table: "room_poll_votes_v2", filter: `poll_id=eq.${pollId}` }] : []),
      ];
      const channel = tables.reduce((realtimeChannel: RealtimeChannel, item) => (
        realtimeChannel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: item.table,
            filter: item.filter,
          },
          (payload) => onEvent({ table: item.table, eventType: payload.eventType as PlaceRealtimeEvent["eventType"] }),
        )
      ), client.channel(`place-room:${roomId}`));
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") onEvent({ table: "realtime", eventType: "*" });
      });
      return { unsubscribe: () => { void client.removeChannel(channel); } };
    },

    async sendMessage(roomId: string, content: string) {
      const { error } = await client.rpc("rooms_send_message_v2", { p_room_id: roomId, p_content: content });
      if (error) throw error;
    },

    async enterRoom(roomId: string) {
      const { error } = await client.rpc("rooms_enter_room_v2", { p_room_id: roomId });
      if (error) throw error;
    },

    async leaveRoom(roomId: string) {
      const { error } = await client.rpc("rooms_leave_room_v2", { p_room_id: roomId });
      if (error) throw error;
    },

    async setOwnMicGain(roomId: string, gain: number) {
      const { error } = await client.rpc("rooms_set_own_mic_gain_v2", { p_room_id: roomId, p_gain: gain });
      if (error) throw error;
    },

    async setOwnMusicGain(roomId: string, gain: number) {
      const { error } = await client.rpc("rooms_set_own_music_gain_v2", { p_room_id: roomId, p_gain: gain });
      if (error) throw error;
    },

    async setOwnMusicMuted(roomId: string, muted: boolean) {
      const { error } = await client.rpc("rooms_set_own_music_muted_v3", { p_room_id: roomId, p_is_muted: muted });
      if (error) throw error;
    },

    async setOwnMicMuted(roomId: string, muted: boolean) {
      const { error } = await client.rpc("rooms_set_own_mic_muted_v2", { p_room_id: roomId, p_is_muted: muted });
      if (error) throw error;
    },

    async setOwnCameraEnabled(roomId: string, enabled: boolean) {
      const { error } = await client.rpc("rooms_set_own_camera_enabled_v1", {
        p_room_id: roomId,
        p_enabled: enabled,
      });
      if (error) throw error;
    },

    async setHostCameraForcedOff(roomId: string, guestId: string, forcedOff: boolean) {
      const { error } = await client.rpc("rooms_set_host_camera_forced_off_v1", {
        p_room_id: roomId,
        p_guest_id: guestId,
        p_is_forced_off: forcedOff,
      });
      if (error) throw error;
    },

    async setHostForcedMute(roomId: string, guestId: string, muted: boolean) {
      const { error } = await client.rpc("rooms_set_host_mic_forced_muted_v2", {
        p_room_id: roomId,
        p_guest_id: guestId,
        p_is_forced_muted: muted,
      });
      if (error) throw error;
    },

    async setHostGuestMicGain(roomId: string, guestId: string, gain: number) {
      const { error } = await client.rpc("rooms_set_host_guest_mic_gain_v3", {
        p_room_id: roomId,
        p_guest_id: guestId,
        p_gain: gain,
      });
      if (error) throw error;
    },

    async setHostGuestMusicGain(roomId: string, guestId: string, gain: number) {
      const { error } = await client.rpc("rooms_set_host_guest_music_gain_v3", {
        p_room_id: roomId,
        p_guest_id: guestId,
        p_gain: gain,
      });
      if (error) throw error;
    },

    async setOwnAudioPreview(roomId: string, preview: PlaceAudioPreviewInput) {
      const { error } = await client.rpc("rooms_set_own_audio_preview_v2", {
        p_room_id: roomId,
        p_preview_ready: preview.ready,
        p_track_title: preview.title,
        p_track_artist: preview.artist,
        p_duration_seconds: preview.durationSeconds,
      });
      if (error) throw error;
    },

    async setAudioLiveEnabled(roomId: string, participantId: string, enabled: boolean) {
      const { error } = await client.rpc("rooms_set_audio_live_enabled_v2", {
        p_room_id: roomId,
        p_guest_id: participantId,
        p_live_enabled: enabled,
      });
      if (error) throw error;
    },

    async setOwnPlaybackState(roomId: string, state: PlaceAudioPlaybackState) {
      const { error } = await client.rpc("rooms_set_own_audio_playback_state_v2", { p_room_id: roomId, p_playback_state: state });
      if (error) throw error;
    },

    async commitHostAudioState(
      roomId: string,
      participantId: string,
      input: PlaceHostAudioStateCommitInput,
    ): Promise<PlaceHostAudioStateCommitResult> {
      const { data, error } = await client.rpc("rooms_commit_host_audio_state_v1", {
        p_room_id: roomId,
        p_route: input.route,
        p_playback_state: input.playbackState,
        p_preview_ready: input.previewReady,
        p_generation: input.generation,
        p_expected_revision: input.expectedRevision,
        p_idempotency_key: input.idempotencyKey,
        p_track_title: input.title,
        p_track_artist: input.artist,
        p_duration_seconds: input.durationSeconds,
      });
      if (!error) return hostAudioCommitResultFromRow(data, input, "atomic");
      if (!isMissingHostAudioCommitRpc(error)) throw error;

      // Rolling-deployment compatibility only. Permission, validation and
      // revision errors from the atomic function are never hidden here.
      const setPlaybackState = async (state: PlaceAudioPlaybackState) => {
        const result = await client.rpc("rooms_set_own_audio_playback_state_v2", {
          p_room_id: roomId,
          p_playback_state: state,
        });
        if (result.error) throw result.error;
      };
      const setLiveRoute = async (enabled: boolean) => {
        const result = await client.rpc("rooms_set_audio_live_enabled_v2", {
          p_room_id: roomId,
          p_guest_id: participantId,
          p_live_enabled: enabled,
        });
        if (result.error) throw result.error;
      };

      await setPlaybackState("paused");
      await setLiveRoute(input.route === "public");
      if (input.route === "preview") {
        const previewResult = await client.rpc("rooms_set_own_audio_preview_v2", {
          p_room_id: roomId,
          p_preview_ready: input.previewReady,
          p_track_title: input.title,
          p_track_artist: input.artist,
          p_duration_seconds: input.durationSeconds,
        });
        if (previewResult.error) throw previewResult.error;
      }
      const fallbackDefaultState: PlaceAudioPlaybackState = input.route === "preview"
        ? (input.previewReady ? "ready" : "idle")
        : "paused";
      if (input.playbackState !== fallbackDefaultState) {
        await setPlaybackState(input.playbackState);
      }
      return hostAudioCommitResultFromRow(null, input, "legacy");
    },

    async like(roomId: string, liked = true) {
      const { data, error } = await client.rpc(liked ? "rooms_like_v1" : "rooms_unlike_v1", { p_room_id: roomId });
      if (error) throw error;
      return data;
    },

    async goldenLike(roomId: string) {
      const { data, error } = await client.rpc("rooms_give_golden_like_v1", { p_room_id: roomId });
      if (error) throw error;
      return data;
    },

    async createPoll(roomId: string, question: string, options: PlacePollOptionInput[], durationSeconds: PlacePollDuration, resultsVisible = true) {
      const { data, error } = await client.rpc("rooms_create_poll_v2", {
        p_room_id: roomId,
        p_question: question,
        p_options: options,
        p_duration_seconds: durationSeconds,
        p_show_results: resultsVisible,
      });
      if (error) throw error;
      return data as unknown as PollRow;
    },

    async stopPoll(pollId: string) {
      const { error } = await client.rpc("rooms_stop_poll_v2", { p_poll_id: pollId });
      if (error) throw error;
    },

    async votePoll(pollId: string, optionIndex: number) {
      const { error } = await client.rpc("rooms_vote_poll_v2", { p_poll_id: pollId, p_option_index: optionIndex });
      if (error) throw error;
    },

    async createGiftDraw(roomId: string, input: RoomGiftDrawInput) {
      const clientCandidates = input.poolMode === "manual" || input.poolMode === "selected"
        ? input.candidates ?? []
        : [];
      const candidates = clientCandidates.map((candidate) => ({
        key: candidate.key,
        profile_id: candidate.profileId,
        display_name: candidate.displayName,
        // Live profile avatars are resolved from the server-side profile
        // snapshot. Never trust or forward a client-provided URL here.
        avatar_url: null,
        source: candidate.source,
      }));
      const { data, error } = await client.rpc("rooms_create_gift_draw_v1", {
        p_room_id: roomId,
        p_gift_code: input.giftCode,
        p_gift_label: input.giftLabel,
        p_pool_mode: input.poolMode,
        p_candidates: candidates,
        p_scheduled_at: input.scheduledAt ?? null,
        p_animation_duration_seconds: input.animationDurationSeconds ?? 7,
        p_idempotency_key: input.idempotencyKey ?? null,
      });
      if (error) throw error;
      return giftDrawFromRpc(data);
    },

    async submitGift(roomId: string, input: RoomGiftDeliveryInput) {
      const { data, error } = await client.rpc("rooms_submit_gift_v1", {
        p_room_id: roomId,
        p_gift_code: input.giftCode,
        p_gift_label: input.giftLabel,
        p_recipient_profile_id: input.recipientProfileId,
        p_action: input.action,
        p_scheduled_at: input.scheduledAt,
        p_round_label: input.roundLabel,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throw error;
      return giftDeliveryFromRpc(data);
    },

    async startGiftDraw(drawId: string) {
      const { data, error } = await client.rpc("rooms_start_gift_draw_v1", { p_draw_id: drawId });
      if (error) throw error;
      return giftDrawFromRpc(data);
    },

    async revealGiftDraw(drawId: string) {
      const { data, error } = await client.rpc("rooms_reveal_gift_draw_v1", { p_draw_id: drawId });
      if (error) throw error;
      return giftDrawFromRpc(data);
    },

    async cancelGiftDraw(drawId: string) {
      const { data, error } = await client.rpc("rooms_cancel_gift_draw_v1", { p_draw_id: drawId });
      if (error) throw error;
      return giftDrawFromRpc(data);
    },

    async pinHighlight(roomId: string, content: string, durationSeconds: 10 | 20 | 30) {
      const { error } = await client.rpc("rooms_pin_custom_item_v2", {
        p_room_id: roomId,
        p_content: content,
        p_expiration_seconds: durationSeconds,
      });
      if (error) throw error;
    },

    async pinMessage(roomId: string, messageId: string, durationSeconds: 10 | 20 | 30) {
      const { error } = await client.rpc("rooms_pin_message_item_v2", {
        p_room_id: roomId,
        p_message_id: messageId,
        p_expiration_seconds: durationSeconds,
      });
      if (error) throw error;
    },

    async clearHighlight(roomId: string) {
      const { error } = await client.rpc("rooms_clear_pinned_item_v2", { p_room_id: roomId });
      if (error) throw error;
    },

    async deleteMessage(roomId: string, messageId: string) {
      const { error } = await client.rpc("rooms_delete_message_v2", { p_room_id: roomId, p_message_id: messageId });
      if (error) throw error;
    },

    async endRoom(roomId: string) {
      const { error } = await client.rpc("rooms_end_place_v3", { p_room_id: roomId });
      if (error) throw error;
    },

    async setQueueOpen(roomId: string, open: boolean) {
      const { error } = await client.rpc("rooms_set_queue_open_v3", { p_room_id: roomId, p_open: open });
      if (error) throw error;
    },

    async joinQueue(roomId: string) {
      const { error } = await client.rpc("rooms_join_queue_v2", { p_room_id: roomId, p_preview_url: null });
      if (error) throw error;
    },

    async leaveQueue(queueEntryId: string) {
      const { error } = await client.rpc("rooms_leave_queue_v2", { p_queue_entry_id: queueEntryId });
      if (error) throw error;
    },

    async inviteFromQueue(queueEntryId: string) {
      const { error } = await client.rpc("rooms_invite_from_queue_v2", { p_queue_entry_id: queueEntryId });
      if (error) throw error;
    },

    async inviteProfile(roomId: string, profileId: string) {
      const { error } = await client.rpc("rooms_invite_profile_v1", {
        p_room_id: roomId,
        p_profile_id: profileId,
      });
      if (error) throw error;
    },

    async acceptInvitation(invitationId: string) {
      const { error } = await client.rpc("rooms_accept_invitation_v2", { p_invitation_id: invitationId });
      if (error) throw error;
    },

    async declineInvitation(invitationId: string) {
      const { error } = await client.rpc("rooms_decline_invitation_v2", { p_invitation_id: invitationId });
      if (error) throw error;
    },

    async cancelInvitation(invitationId: string) {
      const { error } = await client.rpc("rooms_cancel_invitation_v2", { p_invitation_id: invitationId });
      if (error) throw error;
    },

    async endGuestPassage(invitationId: string) {
      const { error } = await client.rpc("rooms_end_guest_passage_v3", { p_invitation_id: invitationId });
      if (error) throw error;
    },

    async markInvitationReady(invitationId: string) {
      const { error } = await client.rpc("rooms_mark_invitation_ready_v2", { p_invitation_id: invitationId });
      if (error) throw error;
    },

    async moveInvitation(invitationId: string, destination: "backstage" | "onstage" | "accepted") {
      const rpc = destination === "backstage"
        ? "rooms_move_invitation_to_backstage_v2"
        : destination === "onstage"
          ? "rooms_move_invitation_to_stage_v2"
          : "rooms_move_invitation_to_invitations_v2";
      const args = destination === "accepted"
        ? { p_invitation_id: invitationId, p_requires_setup: true }
        : { p_invitation_id: invitationId };
      const { error } = await client.rpc(rpc, args);
      if (error) throw error;
    },
  };
}

export type PlaceRepository = ReturnType<typeof createPlaceRepository>;

export const placeRepository = createPlaceRepository();

export function getPlaceProfileFallback(id: string) {
  return Object.values(PLACE_DEMO_PROFILES).find((item) => item.id === id) ?? PLACE_DEMO_PROFILES.viewerA;
}
