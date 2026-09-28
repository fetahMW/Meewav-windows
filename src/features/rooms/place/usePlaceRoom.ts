import { useRoomVotingPolicy } from "../voting/useRoomVotingPolicy";
import { canCastRoomVote } from "../voting/roomVoting";
import { castDemoPollVote, projectDemoPoll } from "../voting/demoPollVoting";
import type { PlaceProfile } from "./place.types";
import { roomToolsRepository } from "../tools/roomTools.service";
import { liveRoomToolsRepository } from "../tools/roomTools.supabase";
import { stageCageOpenMicGuest } from "../tools/stageCageOpenMicGuest";
import { projectCageDemoGuests } from "../tools/cageGuestProjection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomPresentation } from "../roomPresentation";
import { createPlaceDemoState, PLACE_DEMO_POLL_VOTE_COUNTS, PLACE_DEMO_PROFILES } from "./place.fixtures";
import { placeRepository, type PlaceRepository } from "./place.service";
import { canonicalRoomGift } from "./placeGiftCatalog";
import { createPlaceClientId } from "./placeClientId";
import type {
  PlaceAudioPlaybackState,
  PlaceAudioPreviewInput,
  PlaceAudioRoute,
  PlaceHostAudioStateCommitInput,
  PlaceHostAudioStateCommitResult,
  PlaceMixerChannel,
  PlacePollDuration,
  PlacePollOptionInput,
  PlaceDemoRole,
  PlaceMusicalScale,
  PlaceParticipant,
  PlaceRoomState,
  PlaceStudioSurface,
  RoomGiftCandidate,
  RoomGiftDelivery,
  RoomGiftDeliveryInput,
  RoomGiftDraw,
  RoomGiftDrawInput,
} from "./place.types";

type UsePlaceRoomOptions = {
  requestedRoomId?: string | null;
  currentUserId?: string | null;
  demoRole?: PlaceDemoRole;
  demoRoom?: PlaceRoomState | null;
  repository?: PlaceRepository;
  roomType?: RoomPresentation["id"];
};

type PlaceHostAudioCommandState = Omit<
  PlaceHostAudioStateCommitInput,
  "expectedRevision" | "idempotencyKey"
>;

function audioStateFromRoom(room: PlaceRoomState): PlaceHostAudioStateCommitResult & { roomId: string } {
  const route = room.track.audioRoute
    ?? (room.channels.some((channel) => channel.kind === "audio" && channel.isRoutedToPublic)
      ? "public"
      : "preview");
  return {
    roomId: room.id,
    route,
    playbackState: room.track.audioPlaybackState ?? (room.track.isPlaying
      ? (route === "public" ? "playing" : "previewing")
      : "idle"),
    previewReady: room.track.audioPreviewReady === true,
    generation: room.track.audioGeneration ?? null,
    revision: Math.max(0, Number(room.track.audioRevision) || 0),
    title: room.track.title || null,
    artist: room.track.artist || null,
    durationSeconds: room.track.durationSeconds > 0 ? Math.round(room.track.durationSeconds) : null,
    transport: "atomic",
  };
}

function audioCommandSignature(roomId: string, input: PlaceHostAudioStateCommitInput) {
  return JSON.stringify({
    roomId,
    route: input.route,
    playbackState: input.playbackState,
    previewReady: input.previewReady,
    generation: input.generation,
    expectedRevision: input.expectedRevision,
    title: input.title,
    artist: input.artist,
    durationSeconds: input.durationSeconds,
  });
}

function engagementPatch(value: unknown) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    likesCount: Math.max(0, Number(record.likes_count) || 0),
    goldenLikesCount: Math.max(0, Number(record.golden_likes_count) || 0),
    currentUserHasLiked: record.current_user_has_liked === true,
    currentUserHasGoldenLiked: record.current_user_has_golden_liked === true,
    goldenLikeAvailableAt: typeof record.golden_like_available_at === "string"
      ? record.golden_like_available_at
      : null,
  };
}

function goldenLikeIsCoolingDown(availableAt: string | null) {
  if (!availableAt) return false;
  const availableAtMs = new Date(availableAt).getTime();
  return Number.isFinite(availableAtMs) && availableAtMs > Date.now();
}

const GIFT_DRAW_RETRY_INITIAL_MS = 500;
const GIFT_DRAW_RETRY_MAX_MS = 10_000;

function giftDrawRetryDelay(attempt: number) {
  return Math.min(
    GIFT_DRAW_RETRY_MAX_MS,
    GIFT_DRAW_RETRY_INITIAL_MS * (2 ** Math.min(Math.max(0, attempt), 8)),
  );
}

function normalizedGiftCandidates(candidates: readonly RoomGiftCandidate[]) {
  const unique = new Map<string, RoomGiftCandidate>();
  for (const candidate of candidates) {
    const displayName = candidate.displayName.trim().slice(0, 120);
    if (!displayName) continue;
    const profileId = candidate.profileId?.trim() || null;
    const key = candidate.key.trim() || profileId || `manual:${displayName.toLocaleLowerCase("fr-FR")}`;
    const dedupeKey = profileId ? `profile:${profileId}` : `entry:${key.toLocaleLowerCase("fr-FR")}`;
    if (unique.has(dedupeKey)) continue;
    unique.set(dedupeKey, {
      ...candidate,
      key,
      profileId,
      displayName,
      avatarUrl: candidate.avatarUrl?.trim() || null,
    });
  }
  return [...unique.values()].slice(0, 5_000);
}

function giftDeliveryRequestSignature(input: RoomGiftDeliveryInput) {
  return JSON.stringify({
    giftCode: input.giftCode,
    giftLabel: input.giftLabel,
    recipientProfileId: input.recipientProfileId,
    action: input.action,
    scheduledAt: input.scheduledAt,
    roundLabel: input.roundLabel,
  });
}

function isValidGiftIdempotencyKey(value: string) {
  const key = value.trim();
  return key.length >= 8
    && key.length <= 128
    && new TextEncoder().encode(key).length <= 128;
}

function participantGiftCandidate(participant: PlaceParticipant): RoomGiftCandidate {
  return {
    key: participant.profile.id,
    profileId: participant.profile.id,
    displayName: participant.profile.displayName,
    avatarUrl: participant.profile.avatarUrl || null,
    source: participant.status === "backstage"
      ? "backstage"
      : participant.queueEntryId
        ? "queue"
        : "stage",
  };
}

function giftDrawCandidates(room: PlaceRoomState, input: RoomGiftDrawInput) {
  if (input.poolMode === "queue") {
    return normalizedGiftCandidates(room.queue.map(participantGiftCandidate));
  }
  if (input.poolMode === "room") {
    // A demo has no identity list for its numeric audience counter. Stage,
    // backstage and queue fixtures therefore form its honest selectable pool.
    return normalizedGiftCandidates([
      ...room.participants
        .filter((participant) => participant.profile.id !== room.host.id)
        .map((participant) => ({ ...participantGiftCandidate(participant), source: "room" as const })),
      ...room.queue.map((participant) => ({ ...participantGiftCandidate(participant), source: "room" as const })),
    ]);
  }
  return normalizedGiftCandidates(input.candidates ?? []);
}

function secureGiftWinner(candidates: readonly RoomGiftCandidate[]) {
  if (candidates.length === 0) return null;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure random generator unavailable");
  }
  // Rejection sampling avoids the small modulo bias of uint32 % length.
  const values = new Uint32Array(1);
  const range = 0x1_0000_0000;
  const ceiling = range - (range % candidates.length);
  do {
    cryptoApi.getRandomValues(values);
  } while (values[0] >= ceiling);
  return candidates[values[0] % candidates.length] ?? null;
}

function createUnavailableRoomState(roomId: string): PlaceRoomState {
  const base = createPlaceDemoState(null);
  return {
    ...base,
    id: roomId,
    source: "live",
    title: "Room indisponible",
    description: "Cette Room est terminée ou n’est plus accessible.",
    status: "ended",
    participantsCount: 0,
    peakViewers: 0,
    likesCount: 0,
    goldenLikesCount: 0,
    hatTotalAmount: null,
    currentUserHasLiked: false,
    currentUserHasGoldenLiked: false,
    goldenLikeAvailableAt: null,
    currentUserProfile: null,
    currentUserIsActiveParticipant: false,
    queueOpen: false,
    connectionLabel: "Antenne fermée",
    broadcastStatus: "stopped",
    participants: [],
    queue: [],
    messages: [],
    channels: base.channels.map((channel) => ({
      ...channel,
      gain: channel.kind === "master" ? 1 : 0,
      level: 0,
      isMuted: channel.kind !== "master",
      signalState: "disconnected",
    })),
    poll: null,
    giftDraw: null,
    pinnedMessageId: null,
    highlightText: null,
  };
}

export function usePlaceRoom({
  requestedRoomId,
  currentUserId,
  demoRole,
  demoRoom,
  repository = placeRepository,
  roomType = "place",
}: UsePlaceRoomOptions = {}) {
  const demoUserId = demoRole === "host"
    ? PLACE_DEMO_PROFILES.host.id
    : demoRole === "guest"
      ? PLACE_DEMO_PROFILES.guestA.id
      : demoRole === "viewer"
        ? PLACE_DEMO_PROFILES.viewerA.id
        : currentUserId;
  const resolvedLiveRoomId = useRef(requestedRoomId);
  const [room, setRoom] = useState<PlaceRoomState>(() => demoRoom ?? createPlaceDemoState(demoUserId, roomType));
  const [experienceType,setExperienceType]=useState(roomType);
  const [surface, setSurface] = useState<PlaceStudioSurface>((roomType === "scene" || roomType === "loge") && demoRole !== "host" ? "tools" : "chat");
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const gainTimers = useRef(new Map<string, number>());
  const gainCommitChains = useRef(new Map<string, Promise<void>>());
  const audioCommitChain = useRef<Promise<void>>(Promise.resolve());
  const audioServerState = useRef(audioStateFromRoom(room));
  const pendingAudioCommit = useRef<{
    signature: string;
    idempotencyKey: string;
  } | null>(null);
  const demoGiftCandidates = useRef(new Map<string, RoomGiftCandidate[]>());
  const demoGiftWinners = useRef(new Map<string, RoomGiftCandidate>());
  const demoGiftDurations = useRef(new Map<string, number>());
  const demoGiftDrawsByIdempotency = useRef(new Map<string, RoomGiftDraw>());
  const demoGiftSequence = useRef(0);
  const demoSupportOperations = useRef(new Set<string>());
  const demoGiftDeliveriesByIdempotency = useRef(new Map<string, {
    signature: string;
    delivery: RoomGiftDelivery;
  }>());
  const demoGiftDeliverySequence = useRef(0);
  const guestChannelMemory = useRef(new Map<string, PlaceMixerChannel>());
  const demoMeterProfiles = useRef(new Map<string, { signalRatio: number }>());
  const effectiveUserId = room.source === "demo" ? demoUserId : currentUserId;
  // A requested demo role is authoritative. This keeps the Host production
  // surface available even while React preserves older state during HMR.
  const isHost = demoRole === "host"
    || Boolean(effectiveUserId && effectiveUserId === room.host.id);
  const currentUserParticipant = effectiveUserId
    ? room.participants.find((participant) => participant.profile.id === effectiveUserId)
      ?? room.queue.find((participant) => participant.profile.id === effectiveUserId)
    : undefined;
  const isGuest = !isHost && Boolean(currentUserParticipant
    && (currentUserParticipant.status === "ready"
      || currentUserParticipant.status === "backstage"
      || currentUserParticipant.status === "onstage"));
  const isViewer = !isHost && !isGuest;
  const canEngage = room.status === "live" && (room.source === "demo"
    ? Boolean(effectiveUserId)
    : isHost || room.currentUserIsActiveParticipant);
  const goldenLikeUnavailable = room.currentUserHasGoldenLiked
    || goldenLikeIsCoolingDown(room.goldenLikeAvailableAt);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3_200);
  }, []);

  const load = useCallback(async () => {
    if (demoRole || demoRoom) {
      // The development preview must stay deterministic: the requested role
      // owns its fixture and cannot be replaced by a stale/live room response.
      setRoom(demoRoom ?? createPlaceDemoState(demoUserId, roomType));
      setIsLoading(false);
      return;
    }
    try {
      const liveRoom = await repository.load(resolvedLiveRoomId.current, currentUserId, roomType);
      if (liveRoom) {
        resolvedLiveRoomId.current = liveRoom.id;
        setRoom((current) => current.source === "live" && current.id === liveRoom.id
          ? {
              ...liveRoom,
              // Personal FX and the local transport are device-owned. A chat,
              // vote or audience realtime refresh must never reset them.
              personalVocal: current.personalVocal,
              track: {
                ...liveRoom.track,
                currentSeconds: current.track.currentSeconds,
                isLooping: current.track.isLooping,
                waveform: current.track.waveform,
              },
            }
          : liveRoom);
      } else {
        const unavailableRoomId = requestedRoomId ?? "rooms-latest";
        setRoom((current) => current.source === "live" && (current.id === unavailableRoomId || !requestedRoomId)
          ? {
              ...current,
              status: "ended",
              queueOpen: false,
              currentUserIsActiveParticipant: false,
              connectionLabel: "Antenne fermée",
              broadcastStatus: "stopped",
              poll: null,
              giftDraw: null,
              highlightText: null,
            }
          : createUnavailableRoomState(unavailableRoomId));
      }
    } catch {
      // A requested live Room must never silently turn into a fictional live.
      // The no-id entry remains the explicit investor/demo fallback.
      const unavailableRoomId = requestedRoomId ?? "rooms-latest";
      setRoom((current) => current.source === "live" && (current.id === unavailableRoomId || !requestedRoomId)
          ? { ...current, connectionLabel: "Connexion indisponible" }
          : createUnavailableRoomState(unavailableRoomId));
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, demoRole, demoRoom, demoUserId, repository, requestedRoomId, roomType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = audioStateFromRoom(room);
    const current = audioServerState.current;
    if (current.roomId !== next.roomId) {
      audioServerState.current = next;
      pendingAudioCommit.current = null;
      audioCommitChain.current = Promise.resolve();
      return;
    }
    // Never let a delayed aggregate refresh move the optimistic command
    // cursor backwards. Realtime catches it up only with a newer revision.
    if (next.revision > current.revision
      || (current.generation === null && next.generation !== null && next.revision === current.revision)) {
      audioServerState.current = next;
      pendingAudioCommit.current = null;
    }
  }, [
    room.channels,
    room.id,
    room.track.artist,
    room.track.audioGeneration,
    room.track.audioPlaybackState,
    room.track.audioPreviewReady,
    room.track.audioRevision,
    room.track.audioRoute,
    room.track.durationSeconds,
    room.track.isPlaying,
    room.track.title,
  ]);

  useEffect(() => {
    if (room.source !== "live" || room.status !== "live") return;
    const subscription = repository.subscribe(room.id, () => {
      // Throttle the aggregate refresh instead of a trailing debounce: a busy
      // chat must not postpone the update forever.
      if (refreshTimer.current) return;
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        void load();
      }, 180);
    }, room.poll?.id);
    return () => subscription.unsubscribe();
  }, [load, repository, room.id, room.poll?.id, room.source, room.status]);

  useEffect(() => {
    if (!room.poll?.isActive || !room.poll.endsAt) return;
    const pollId = room.poll.id;
    const expirePoll = () => {
      setRoom((current) => ({ ...current, poll: current.poll?.id === pollId ? { ...current.poll, isActive: false } : current.poll }));
      if (isHost && room.source === "live") {
        void repository.stopPoll(pollId).catch(() => showNotice("Le sondage est terminé localement, mais son arrêt serveur doit être resynchronisé."));
      }
    };
    const remaining = new Date(room.poll.endsAt).getTime() - Date.now();
    if (remaining <= 0) {
      expirePoll();
      return;
    }
    const timer = window.setTimeout(expirePoll, remaining);
    return () => window.clearTimeout(timer);
  }, [isHost, repository, room.poll?.endsAt, room.poll?.id, room.poll?.isActive, room.source, showNotice]);

  useEffect(() => {
    if (room.source !== "live" || room.status !== "live" || !currentUserId || isHost) return;
    let entered = false;
    void repository.enterRoom(room.id).then(() => {
      entered = true;
      void load();
    }).catch(() => showNotice("Connexion à la Room limitée : les interactions restent indisponibles."));
    return () => {
      if (entered) void repository.leaveRoom(room.id).catch(() => undefined);
    };
  }, [currentUserId, isHost, load, repository, room.id, room.source, room.status, showNotice]);

  useEffect(() => {
    demoMeterProfiles.current.clear();
    if (room.source !== "demo") return;

    const meterTimer = window.setInterval(() => {
      setRoom((current) => {
        // Live levels must come from the media plane. Synthetic meters are
        // deliberately restricted to the investor/demo fixture.
        if (current.source !== "demo") return current;
        const currentChannelIds = new Set(current.channels.map((channel) => channel.id));
        for (const channelId of demoMeterProfiles.current.keys()) {
          if (!currentChannelIds.has(channelId)) demoMeterProfiles.current.delete(channelId);
        }
        return {
          ...current,
          channels: current.channels.map((channel, index) => {
            if (channel.isMuted) return { ...channel, level: 0, signalState: "muted" };
            if (channel.signalState === "disconnected" || channel.signalState === "connecting") return channel;
            let profile = demoMeterProfiles.current.get(channel.id);
            if (!profile || typeof profile !== "object" || typeof profile.signalRatio !== "number") {
              const measuredRatio = channel.gain > 0.02 && channel.level > 0.02
                ? channel.level / channel.gain
                : 0.82;
              profile = {
                signalRatio: Math.min(1.16, Math.max(0.42, measuredRatio)),
              };
              demoMeterProfiles.current.set(channel.id, profile);
            }

            // A continuous source keeps its illuminated LED bed. Only the
            // last one or two segments move, as on a real compact mixer.
            const now = Date.now();
            const fineMotion = Math.sin(now / 340 + index * 1.47) * 0.012
              + Math.sin(now / 137 + index * 0.79) * 0.006;
            const sourceEnvelope = Math.min(1.16, Math.max(0, profile.signalRatio + fineMotion));
            const target = Math.min(0.94, Math.max(0, channel.gain * sourceEnvelope));
            const previous = Math.min(1, Math.max(0, channel.level));
            const coefficient = target > previous ? 0.68 : 0.16;
            let level = previous + (target - previous) * coefficient;
            if (target === 0 && level < 0.006) level = 0;
            const signalState = level >= 0.94 ? "clipping" : level <= 0.006 ? "silent" : "active";
            return { ...channel, level, signalState };
          }),
        };
      });
    }, 140);
    return () => window.clearInterval(meterTimer);
  }, [room.id, room.source]);

  useEffect(() => {
    const playbackTimer = window.setInterval(() => {
      setRoom((current) => {
        if (!current.track.isPlaying) return current;
        const next = current.track.currentSeconds + 1;
        return {
          ...current,
          track: {
            ...current.track,
            currentSeconds: next >= current.track.durationSeconds
              ? (current.track.isLooping ? 0 : current.track.durationSeconds)
              : next,
            isPlaying: next < current.track.durationSeconds || current.track.isLooping,
          },
        };
      });
    }, 1_000);
    return () => window.clearInterval(playbackTimer);
  }, []);

  useEffect(() => () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    gainTimers.current.forEach((timer) => window.clearTimeout(timer));
    gainTimers.current.clear();
  }, []);

  const updateChannel = useCallback((channelId: string, update: (channel: PlaceMixerChannel) => PlaceMixerChannel) => {
    setRoom((current) => ({
      ...current,
      channels: current.channels.map((channel) => channel.id === channelId ? update(channel) : channel),
    }));
  }, []);

  const setChannelGain = useCallback((channelId: string, gain: number) => {
    const safeGain = Math.min(1, Math.max(0, gain));
    const changedChannel = room.channels.find((channel) => channel.id === channelId);
    updateChannel(channelId, (channel) => ({ ...channel, gain: safeGain }));
    if (room.source !== "live" || !changedChannel || !effectiveUserId) return;
    const previousTimer = gainTimers.current.get(channelId);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      gainTimers.current.delete(channelId);
      const commit = async () => {
        if (changedChannel.kind === "audio") {
          if (isHost && changedChannel.participantId && changedChannel.participantId !== room.host.id) {
            await repository.setHostGuestMusicGain(room.id, changedChannel.participantId, safeGain);
          } else {
            await repository.setOwnMusicGain(room.id, safeGain);
          }
        } else if (isHost && changedChannel.kind === "microphone" && changedChannel.participantId === room.host.id) {
          await repository.setOwnMicGain(room.id, safeGain);
        } else if (changedChannel.participantId === effectiveUserId) {
          await repository.setOwnMicGain(room.id, safeGain);
        } else if (isHost && changedChannel.kind === "guest" && changedChannel.participantId) {
          await repository.setHostGuestMicGain(room.id, changedChannel.participantId, safeGain);
        }
      };
      const previousCommit = gainCommitChains.current.get(channelId) ?? Promise.resolve();
      const nextCommit = previousCommit
        .catch(() => undefined)
        .then(commit)
        .catch(() => showNotice("Le niveau reste local : synchronisation indisponible."));
      gainCommitChains.current.set(channelId, nextCommit);
    }, 120);
    gainTimers.current.set(channelId, timer);
  }, [effectiveUserId, isHost, repository, room.channels, room.id, room.source, showNotice, updateChannel]);

  const toggleChannelMute = useCallback((channelId: string) => {
    const changedChannel = room.channels.find((channel) => channel.id === channelId);
    if (changedChannel?.kind === "guest" && changedChannel.participantId !== effectiveUserId && !isHost) {
      showNotice("Seul le Host peut couper le micro d’un autre participant.");
      return;
    }
    if (!changedChannel) return;
    const hostControlsRemoteGuest = isHost
      && changedChannel.kind === "guest"
      && changedChannel.participantId !== effectiveUserId;
    if (!hostControlsRemoteGuest && changedChannel.isHostForcedMuted) {
      showNotice("Le Host doit d’abord autoriser ce micro à l’antenne.");
      return;
    }
    const previousSelfMuted = changedChannel.isSelfMuted
      ?? (changedChannel.isMuted && !changedChannel.isHostForcedMuted);
    const nextHostForcedMuted = hostControlsRemoteGuest
      ? !changedChannel.isHostForcedMuted
      : changedChannel.isHostForcedMuted === true;
    const nextSelfMuted = hostControlsRemoteGuest ? previousSelfMuted : !previousSelfMuted;
    const nextMuted = nextSelfMuted || nextHostForcedMuted;
    updateChannel(channelId, (channel) => ({
      ...channel,
      isSelfMuted: nextSelfMuted,
      isHostForcedMuted: nextHostForcedMuted,
      isMuted: nextMuted,
      signalState: nextMuted ? "muted" : channel.signalState === "muted" ? "active" : channel.signalState,
    }));
    if (changedChannel?.participantId && changedChannel.kind !== "audio") {
      const nextEnabled = !nextMuted;
      setRoom((current) => ({
        ...current,
        participants: current.participants.map((participant) => (
          participant.id === changedChannel.participantId || participant.profile.id === changedChannel.participantId
            ? { ...participant, isMicrophoneEnabled: nextEnabled }
            : participant
        )),
      }));
    }
    if (room.source !== "live") return;
    const operation = changedChannel.kind === "audio" && (changedChannel.participantId === effectiveUserId || isHost)
      ? repository.setOwnMusicMuted(room.id, nextSelfMuted)
      : changedChannel.participantId === effectiveUserId
        ? repository.setOwnMicMuted(room.id, nextSelfMuted)
      : changedChannel.kind === "guest" && changedChannel.participantId && isHost
        ? repository.setHostForcedMute(room.id, changedChannel.participantId, nextHostForcedMuted)
        : null;
    void operation?.catch(() => {
      updateChannel(channelId, () => changedChannel);
      if (changedChannel.participantId && changedChannel.kind !== "audio") {
        setRoom((current) => ({
          ...current,
          participants: current.participants.map((participant) => (
            participant.id === changedChannel.participantId || participant.profile.id === changedChannel.participantId
              ? { ...participant, isMicrophoneEnabled: !changedChannel.isMuted }
              : participant
          )),
        }));
      }
      showNotice("Le mute public n’a pas pu être synchronisé.");
    });
  }, [effectiveUserId, isHost, repository, room.channels, room.id, room.source, showNotice, updateChannel]);

  const setOwnCameraEnabled = useCallback((enabled: boolean) => {
    if (!effectiveUserId || (!isHost && !isGuest)) return;
    const previous = room.participants;
    setRoom((current) => ({
      ...current,
      participants: current.participants.map((participant) => (
        participant.profile.id === effectiveUserId
          ? {
              ...participant,
              isSelfCameraEnabled: enabled,
              isCameraEnabled: enabled && !participant.isHostForcedCameraOff,
            }
          : participant
      )),
    }));
    if (room.source !== "live") return;
    void repository.setOwnCameraEnabled(room.id, enabled).catch(() => {
      setRoom((current) => current.id === room.id ? { ...current, participants: previous } : current);
      showNotice("L’état de la caméra n’a pas pu être synchronisé.");
    });
  }, [effectiveUserId, isGuest, isHost, repository, room.id, room.participants, room.source, showNotice]);

  const setParticipantCameraEnabled = useCallback((participantId: string, enabled: boolean) => {
    const participant = room.participants.find((item) => (
      item.id === participantId || item.profile.id === participantId
    ));
    if (!participant) return;

    const controlsOwnCamera = participant.id === effectiveUserId || participant.profile.id === effectiveUserId;
    const hostControlsGuest = isHost && !controlsOwnCamera;
    if (!controlsOwnCamera && !hostControlsGuest) {
      showNotice("Seul le Host peut couper la caméra d’un autre participant.");
      return;
    }
    if (hostControlsGuest && enabled && !participant.isHostForcedCameraOff) {
      showNotice("Cette caméra a déjà été coupée par le participant.");
      return;
    }

    const previous = room.participants;
    const nextHostForcedOff = hostControlsGuest
      ? !enabled
      : participant.isHostForcedCameraOff === true;
    const nextSelfCameraEnabled = hostControlsGuest
      ? participant.isSelfCameraEnabled ?? participant.isCameraEnabled
      : enabled;
    const nextCameraEnabled = nextSelfCameraEnabled && !nextHostForcedOff;
    setRoom((current) => ({
      ...current,
      participants: current.participants.map((item) => (
        item.id === participant.id || item.profile.id === participant.profile.id
          ? {
              ...item,
              isCameraEnabled: nextCameraEnabled,
              isSelfCameraEnabled: nextSelfCameraEnabled,
              isHostForcedCameraOff: nextHostForcedOff,
            }
          : item
      )),
    }));

    if (room.source !== "live") return;
    const operation = controlsOwnCamera
      ? repository.setOwnCameraEnabled(room.id, enabled)
      : repository.setHostCameraForcedOff(room.id, participant.profile.id, nextHostForcedOff);
    void operation.catch(() => {
      setRoom((current) => current.id === room.id ? { ...current, participants: previous } : current);
      showNotice("L’état de la caméra n’a pas pu être synchronisé.");
    });
  }, [effectiveUserId, isHost, repository, room.id, room.participants, room.source, showNotice]);

  const updateVocal = useCallback((patch: Partial<PlaceRoomState["personalVocal"]>) => {
    setRoom((current) => ({
      ...current,
      personalVocal: { ...current.personalVocal, ...patch },
    }));
  }, []);

  const setTune = useCallback((key: string, scale: PlaceMusicalScale) => {
    updateVocal({ tuneKey: key, tuneScale: scale, tuneEnabled: true, enabled: true });
  }, [updateVocal]);

  const sendMessage = useCallback(async (content: string) => {
    const cleanContent = content.trim();
    if (!cleanContent) return;
    if (cleanContent.length > 1_000) {
      showNotice("Le message ne peut pas dépasser 1 000 caractères.");
      return;
    }
    const author = room.currentUserProfile
      ?? (effectiveUserId === room.host.id ? room.host : null)
      ?? (room.source === "demo" ? Object.values(PLACE_DEMO_PROFILES).find(profile => profile.id === effectiveUserId) : null);
    if (!effectiveUserId || !author || !canEngage) {
      const message = canEngage ? "Connecte-toi pour écrire dans la Room." : "Le chat devient disponible après une entrée active dans la Room.";
      showNotice(message);
      throw new Error(message);
    }
    const optimisticId = `local-${Date.now()}`;
    setRoom((current) => ({
      ...current,
      messages: [...current.messages, {
        id: optimisticId,
        author,
        content: cleanContent,
        createdAt: new Date().toISOString(),
      }],
    }));
    if (room.source === "live") {
      try {
        await repository.sendMessage(room.id, cleanContent);
      } catch {
        setRoom((current) => ({
          ...current,
          messages: current.messages.filter((message) => message.id !== optimisticId),
        }));
        showNotice("Le message n’a pas pu être envoyé.");
        throw new Error("Le message n’a pas pu être envoyé. Réessayez.");
      }
    }
  }, [canEngage, effectiveUserId, repository, room.currentUserProfile, room.host, room.id, room.source, showNotice]);

  const recordDemoSupport = useCallback((cents: number, operationId: string) => {
    if (room.source !== "demo" || !canEngage || isHost || !Number.isSafeInteger(cents) || cents <= 0) return;
    const key = `${room.id}:${operationId}`;
    if (demoSupportOperations.current.has(key)) return;
    demoSupportOperations.current.add(key);
    setRoom((current) => current.id === room.id && current.source === "demo"
      ? { ...current, hatTotalAmount: (Math.round((current.hatTotalAmount ?? 0) * 100) + cents) / 100 }
      : current);
  }, [room.id, room.source, canEngage, isHost]);

  const likePending = useRef(false);
  const toggleLike = useCallback(async () => {
    if (isHost || likePending.current) return;
    if (!effectiveUserId || !room.currentUserProfile || !canEngage) {
      showNotice(canEngage
        ? "Connecte-toi pour aimer cette Room."
        : "Les réactions deviennent disponibles après une entrée active dans la Room.");
      return;
    }
    const rollback = {
      currentUserHasLiked: room.currentUserHasLiked,
      likesCount: room.likesCount,
    };
    const liked = !room.currentUserHasLiked;
    setRoom((current) => ({ ...current, currentUserHasLiked: liked, likesCount: Math.max(0, current.likesCount + (liked ? 1 : -1)) }));
    if (room.source !== "live") return;
    likePending.current = true;
    try {
      const result = await repository.like(room.id, liked);
      setRoom((current) => current.id === room.id ? { ...current, ...engagementPatch(result) } : current);
    } catch {
      setRoom((current) => current.id === room.id ? { ...current, ...rollback } : current);
      showNotice("Le Like n’a pas pu être synchronisé.");
    } finally {
      likePending.current = false;
    }
  }, [canEngage, effectiveUserId, isHost, repository, room.currentUserHasLiked, room.currentUserProfile, room.id, room.likesCount, room.source, showNotice]);

  const giveGoldenLike = useCallback(async () => {
    if (isHost || room.currentUserHasGoldenLiked) return false;
    if (!effectiveUserId || !room.currentUserProfile || !canEngage) {
      showNotice(canEngage
        ? "Connecte-toi pour offrir un Golden Like."
        : "Les réactions deviennent disponibles après une entrée active dans la Room.");
      return false;
    }
    if (goldenLikeIsCoolingDown(room.goldenLikeAvailableAt)) {
      showNotice("Ton Golden Like quotidien n’est pas encore disponible.");
      return false;
    }
    const rollback = {
      currentUserHasGoldenLiked: room.currentUserHasGoldenLiked,
      goldenLikesCount: room.goldenLikesCount,
      goldenLikeAvailableAt: room.goldenLikeAvailableAt,
    };
    setRoom((current) => ({ ...current, currentUserHasGoldenLiked: true, goldenLikesCount: current.goldenLikesCount + 1 }));
    if (room.source !== "live") return true;
    try {
      const result = await repository.goldenLike(room.id);
      setRoom((current) => ({ ...current, ...engagementPatch(result) }));
      return true;
    } catch {
      setRoom((current) => current.id === room.id ? { ...current, ...rollback } : current);
      showNotice("Golden Like indisponible pour le moment.");
      return false;
    }
  }, [canEngage, effectiveUserId, isHost, repository, room.currentUserHasGoldenLiked, room.currentUserProfile, room.goldenLikeAvailableAt, room.goldenLikesCount, room.id, room.source, showNotice]);

  const enqueueAudioCommit = useCallback(<T,>(operation: () => Promise<T>) => {
    const result = audioCommitChain.current
      .catch(() => undefined)
      .then(operation);
    audioCommitChain.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const commitHostAudioCommand = useCallback((
    roomId: string,
    participantId: string,
    createCommand: (current: PlaceHostAudioStateCommitResult) => PlaceHostAudioCommandState,
  ) => enqueueAudioCommit(async () => {
    const current = audioServerState.current.roomId === roomId
      ? audioServerState.current
      : audioStateFromRoom(room);
    const command = createCommand(current);
    const draft: PlaceHostAudioStateCommitInput = {
      ...command,
      expectedRevision: current.revision,
      idempotencyKey: "pending",
    };
    const signature = audioCommandSignature(roomId, draft);
    const idempotencyKey = pendingAudioCommit.current?.signature === signature
      ? pendingAudioCommit.current.idempotencyKey
      : createPlaceClientId();
    const input = { ...draft, idempotencyKey };
    pendingAudioCommit.current = { signature, idempotencyKey };

    const committed = await repository.commitHostAudioState(roomId, participantId, input);
    audioServerState.current = { roomId, ...committed };
    pendingAudioCommit.current = null;
    setRoom((currentRoom) => currentRoom.id !== roomId ? currentRoom : {
      ...currentRoom,
      track: {
        ...currentRoom.track,
        title: committed.title ?? currentRoom.track.title,
        artist: committed.artist ?? currentRoom.track.artist,
        durationSeconds: committed.durationSeconds ?? 0,
        isPlaying: committed.playbackState === "playing",
        audioRoute: committed.route,
        audioPlaybackState: committed.playbackState,
        audioPreviewReady: committed.previewReady,
        audioGeneration: committed.generation,
        audioRevision: committed.revision,
      },
      channels: currentRoom.channels.map((channel) => channel.kind === "audio"
        ? { ...channel, isRoutedToPublic: committed.route === "public" }
        : channel),
    });
    return committed;
  }), [enqueueAudioCommit, repository, room]);

  const prepareTrackPreview = useCallback(async (preview: PlaceAudioPreviewInput) => {
    if (!isHost) return false;
    const roomId = room.id;
    const participantId = effectiveUserId ?? room.host.id;
    const previousTrack = room.track;
    const previousChannels = room.channels;
    setRoom((current) => current.id !== roomId ? current : {
      ...current,
      track: {
        ...current.track,
        title: preview.title ?? current.track.title,
        artist: preview.artist ?? current.track.artist,
        durationSeconds: preview.durationSeconds ?? 0,
        currentSeconds: 0,
        isPlaying: false,
      },
      channels: current.channels.map((channel) => channel.kind === "audio"
        ? { ...channel, isRoutedToPublic: false }
        : channel),
    });
    if (room.source !== "live") return true;
    try {
      await commitHostAudioCommand(roomId, participantId, () => ({
        route: "preview",
        playbackState: preview.ready ? "ready" : "idle",
        previewReady: preview.ready,
        generation: preview.generation,
        title: preview.title,
        artist: preview.artist,
        durationSeconds: preview.durationSeconds,
      }));
      return true;
    } catch {
      setRoom((current) => current.id === roomId
        ? { ...current, track: previousTrack, channels: previousChannels }
        : current);
      showNotice("La préécoute n’a pas pu être préparée.");
      return false;
    }
  }, [commitHostAudioCommand, effectiveUserId, isHost, room.channels, room.host.id, room.id, room.source, room.track, showNotice]);

  const updateTrackPreviewMetadata = useCallback(async (preview: PlaceAudioPreviewInput) => {
    if (!isHost || preview.durationSeconds === null || preview.durationSeconds <= 0) return false;
    const roomId = room.id;
    const durationSeconds = Math.max(1, Math.round(preview.durationSeconds));
    if (room.source !== "live") {
      setRoom((current) => current.id === roomId
        ? { ...current, track: { ...current.track, durationSeconds } }
        : current);
      return true;
    }

    let staleGeneration = false;
    try {
      await commitHostAudioCommand(roomId, effectiveUserId ?? room.host.id, (current) => {
        // Metadata is an amendment of the validated local preview, not a route
        // or transport command. Never let a late media event revive an older
        // generation or alter the current playback state.
        if (current.route !== "preview" || current.generation !== preview.generation) {
          staleGeneration = true;
          throw new Error("stale_audio_metadata_generation");
        }
        return {
          route: current.route,
          playbackState: current.playbackState,
          previewReady: current.previewReady,
          generation: current.generation,
          title: current.title,
          artist: current.artist,
          durationSeconds,
        };
      });
      return true;
    } catch {
      if (!staleGeneration) showNotice("La durée de la préécoute n’a pas pu être synchronisée.");
      return false;
    }
  }, [commitHostAudioCommand, effectiveUserId, isHost, room.host.id, room.id, room.source, showNotice]);

  const setTrackRoute = useCallback(async (route: PlaceAudioRoute, generation: string) => {
    if (!isHost) return false;
    const roomId = room.id;
    const participantId = effectiveUserId ?? room.host.id;
    const isPublic = route === "public";
    const previousChannels = room.channels;
    setRoom((current) => current.id !== roomId ? current : {
      ...current,
      track: { ...current.track, isPlaying: false },
      channels: current.channels.map((channel) => channel.kind === "audio"
        ? { ...channel, isRoutedToPublic: isPublic }
        : channel),
    });
    if (room.source !== "live") return true;
    try {
      await commitHostAudioCommand(roomId, participantId, (current) => ({
        route,
        playbackState: "ready",
        previewReady: current.previewReady,
        generation,
        title: current.title,
        artist: current.artist,
        durationSeconds: current.durationSeconds,
      }));
      return true;
    } catch {
      setRoom((current) => current.id === roomId
        ? { ...current, channels: previousChannels }
        : current);
      showNotice(isPublic
        ? "Le routage Public n’a pas pu être préparé."
        : "Le retour en Préécoute n’a pas pu être synchronisé.");
      return false;
    }
  }, [commitHostAudioCommand, effectiveUserId, isHost, room.channels, room.host.id, room.id, room.source, showNotice]);

  const setTrackPlaybackState = useCallback(async (state: PlaceAudioPlaybackState, generation: string) => {
    if (!isHost) return false;
    const roomId = room.id;
    const wasPlaying = room.track.isPlaying;
    const isPlaying = state === "playing";
    setRoom((current) => current.id === roomId
      ? { ...current, track: { ...current.track, isPlaying } }
      : current);
    if (room.source !== "live") return true;
    try {
      await commitHostAudioCommand(roomId, effectiveUserId ?? room.host.id, (current) => ({
        route: current.route,
        playbackState: state,
        previewReady: current.previewReady,
        generation,
        title: current.title,
        artist: current.artist,
        durationSeconds: current.durationSeconds,
      }));
      return true;
    } catch {
      setRoom((current) => current.id === roomId
        ? { ...current, track: { ...current.track, isPlaying: wasPlaying } }
        : current);
      showNotice("L’état du lecteur n’a pas pu être synchronisé.");
      return false;
    }
  }, [commitHostAudioCommand, effectiveUserId, isHost, room.host.id, room.id, room.source, room.track.isPlaying, showNotice]);

  const toggleTrackLoop = useCallback(() => {
    setRoom((current) => ({ ...current, track: { ...current.track, isLooping: !current.track.isLooping } }));
  }, []);

  const seekTrack = useCallback((ratio: number) => {
    setRoom((current) => ({
      ...current,
      track: {
        ...current.track,
        currentSeconds: Math.round(current.track.durationSeconds * Math.min(1, Math.max(0, ratio))),
      },
    }));
  }, []);

  const submitGift = useCallback(async (input: RoomGiftDeliveryInput): Promise<RoomGiftDelivery | null> => {
    if (!isHost) return null;
    const canonicalGift = canonicalRoomGift(input.giftCode, input.giftLabel);
    const recipientProfileId = input.recipientProfileId.trim();
    const recipientDisplayName = input.recipientDisplayName.trim().slice(0, 120);
    const idempotencyKey = input.idempotencyKey.trim();
    if (!canonicalGift || !recipientProfileId || recipientProfileId === room.host.id) {
      showNotice("Choisis un cadeau et un destinataire valides.");
      return null;
    }
    if (!isValidGiftIdempotencyKey(idempotencyKey)) {
      showNotice("La validation sécurisée du cadeau a expiré. Réessaie.");
      return null;
    }

    let scheduledAt: string | null = null;
    let roundLabel: string | null = null;
    if (input.action === "schedule") {
      const scheduledAtMs = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Number.NaN;
      if (!Number.isFinite(scheduledAtMs)
        || scheduledAtMs <= Date.now()
        || scheduledAtMs > Date.now() + 30 * 24 * 60 * 60 * 1_000) {
        showNotice("Choisis une programmation située dans les 30 prochains jours.");
        return null;
      }
      scheduledAt = new Date(scheduledAtMs).toISOString();
    } else if (input.action === "round") {
      roundLabel = input.roundLabel?.trim() || null;
      if (!roundLabel
        || roundLabel.length > 80
        || new TextEncoder().encode(roundLabel).length > 320
        || Array.from(roundLabel).some((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint <= 31 || codePoint === 127;
        })) {
        showNotice("Choisis une ronde valide.");
        return null;
      }
    } else if (input.action !== "send_now") {
      showNotice("Ce mode d’envoi n’est pas disponible.");
      return null;
    }

    const canonicalInput: RoomGiftDeliveryInput = {
      ...input,
      giftCode: canonicalGift.code,
      giftLabel: canonicalGift.label,
      recipientProfileId,
      recipientDisplayName: recipientDisplayName || "Membre MeeWav",
      recipientAvatarUrl: input.recipientAvatarUrl?.trim() || null,
      scheduledAt,
      roundLabel,
      idempotencyKey,
    };
    const signature = giftDeliveryRequestSignature(canonicalInput);

    if (room.source === "demo") {
      const existing = demoGiftDeliveriesByIdempotency.current.get(idempotencyKey);
      if (existing) {
        if (existing.signature !== signature) {
          showNotice("Cette validation a déjà servi pour un autre cadeau.");
          return null;
        }
        return existing.delivery;
      }
      demoGiftDeliverySequence.current += 1;
      const createdAt = new Date().toISOString();
      const delivery: RoomGiftDelivery = {
        id: `gift-delivery-demo-${Date.now()}-${demoGiftDeliverySequence.current}`,
        roomId: room.id,
        giftCode: canonicalInput.giftCode,
        giftLabel: canonicalInput.giftLabel,
        action: canonicalInput.action,
        status: canonicalInput.action === "send_now"
          ? "sent"
          : canonicalInput.action === "schedule"
            ? "scheduled"
            : "ready",
        roundLabel,
        recipientProfileId,
        recipientDisplayName: canonicalInput.recipientDisplayName,
        recipientAvatarUrl: canonicalInput.recipientAvatarUrl,
        recipientSource: canonicalInput.recipientSource,
        scheduledAt,
        sentAt: canonicalInput.action === "send_now" ? createdAt : null,
        createdAt,
      };
      demoGiftDeliveriesByIdempotency.current.set(idempotencyKey, { signature, delivery });
      return delivery;
    }

    try {
      const delivery = await repository.submitGift(room.id, canonicalInput);
      if (!delivery) {
        showNotice("Le serveur n’a pas confirmé le cadeau.");
        return null;
      }
      return delivery;
    } catch (error) {
      showNotice("Le cadeau n’a pas pu être validé sur le serveur.");
      throw error;
    }
  }, [isHost, repository, room.host.id, room.id, room.source, showNotice]);

  const createGiftDraw = useCallback(async (input: RoomGiftDrawInput): Promise<RoomGiftDraw | null> => {
    if (!isHost) return null;
    const canonicalGift = canonicalRoomGift(input.giftCode, input.giftLabel);
    if (!canonicalGift) {
      showNotice("Choisis un cadeau avant de préparer le tirage.");
      return null;
    }
    const giftCode = canonicalGift.code;
    const giftLabel = canonicalGift.label;
    const scheduledAtMs = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Number.NaN;
    const scheduledAt = Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.now()
      ? new Date(scheduledAtMs).toISOString()
      : null;
    const candidates = giftDrawCandidates(room, input);
    if (room.source === "demo") {
      if (input.idempotencyKey) {
        const existing = demoGiftDrawsByIdempotency.current.get(input.idempotencyKey);
        if (existing) {
          setRoom((current) => ({ ...current, giftDraw: existing }));
          return existing;
        }
      }
      if (candidates.length === 0) {
        showNotice("Ajoute au moins une personne au tirage.");
        return null;
      }
      demoGiftSequence.current += 1;
      const now = new Date().toISOString();
      const draw: RoomGiftDraw = {
        id: `gift-draw-demo-${Date.now()}-${demoGiftSequence.current}`,
        giftCode,
        giftLabel,
        poolMode: input.poolMode,
        status: scheduledAt ? "scheduled" : "ready",
        eligibleCount: candidates.length,
        scheduledAt,
        startedAt: null,
        revealAt: null,
        revealedAt: null,
        winner: null,
        createdAt: now,
      };
      demoGiftCandidates.current.set(draw.id, candidates);
      demoGiftDurations.current.set(
        draw.id,
        Math.min(20, Math.max(3, Math.round(input.animationDurationSeconds ?? 7))),
      );
      if (input.idempotencyKey) demoGiftDrawsByIdempotency.current.set(input.idempotencyKey, draw);
      setRoom((current) => ({ ...current, giftDraw: draw }));
      return draw;
    }
    try {
      const liveCandidates = input.poolMode === "manual" || input.poolMode === "selected"
        ? candidates
        : [];
      const draw = await repository.createGiftDraw(room.id, {
        ...input,
        giftCode,
        giftLabel,
        // Queue and whole-Room pools are authoritative server snapshots.
        // Sending the locally reconstructed demo list would both leak stale
        // identities and violate the live RPC contract.
        candidates: liveCandidates,
        scheduledAt,
      });
      if (draw) setRoom((current) => ({ ...current, giftDraw: draw }));
      return draw;
    } catch (error) {
      showNotice("Le tirage n’a pas pu être préparé sur le serveur.");
      throw error;
    }
  }, [isHost, repository, room, showNotice]);

  const scheduleGiftDraw = useCallback(async (
    input: RoomGiftDrawInput & { scheduledAt: string },
  ): Promise<RoomGiftDraw | null> => {
    const scheduledAtMs = new Date(input.scheduledAt).getTime();
    if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
      showNotice("Choisis une heure future pour programmer le tirage.");
      return null;
    }
    return createGiftDraw(input);
  }, [createGiftDraw, showNotice]);

  const startGiftDraw = useCallback(async (
    drawId?: string,
    suppressNotice = false,
  ): Promise<RoomGiftDraw | null> => {
    if (!isHost) return null;
    const draw = room.giftDraw;
    if (!draw || (drawId && draw.id !== drawId) || !["ready", "scheduled"].includes(draw.status)) return draw;
    if (draw.status === "scheduled" && draw.scheduledAt && new Date(draw.scheduledAt).getTime() > Date.now() + 250) {
      return draw;
    }
    if (room.source === "demo") {
      const candidates = demoGiftCandidates.current.get(draw.id) ?? [];
      let winner: RoomGiftCandidate | null = null;
      try {
        winner = secureGiftWinner(candidates);
      } catch {
        showNotice("Le tirage sécurisé n’est pas disponible sur cet appareil.");
        return null;
      }
      if (!winner) {
        showNotice("Le tirage ne contient aucune personne éligible.");
        return null;
      }
      const duration = demoGiftDurations.current.get(draw.id) ?? 7;
      const startedAt = new Date();
      const started: RoomGiftDraw = {
        ...draw,
        status: "spinning",
        startedAt: startedAt.toISOString(),
        revealAt: new Date(startedAt.getTime() + duration * 1_000).toISOString(),
        winner: null,
      };
      demoGiftWinners.current.set(draw.id, winner);
      setRoom((current) => current.giftDraw?.id === draw.id ? { ...current, giftDraw: started } : current);
      return started;
    }
    try {
      const started = await repository.startGiftDraw(draw.id);
      if (started) setRoom((current) => ({ ...current, giftDraw: started }));
      return started;
    } catch {
      if (!suppressNotice) showNotice("Le tirage n’a pas pu démarrer.");
      return null;
    }
  }, [isHost, repository, room.giftDraw, room.source, showNotice]);

  const revealGiftDraw = useCallback(async (drawId?: string): Promise<RoomGiftDraw | null> => {
    if (!isHost) return null;
    const draw = room.giftDraw;
    if (!draw || (drawId && draw.id !== drawId)) return draw;
    if (draw.status === "revealed") return draw;
    if (draw.status !== "spinning") return null;
    const revealAtMs = draw.revealAt ? new Date(draw.revealAt).getTime() : Number.POSITIVE_INFINITY;
    if (revealAtMs > Date.now() + 100) return draw;
    if (room.source === "demo") {
      const winner = demoGiftWinners.current.get(draw.id) ?? null;
      if (!winner) return null;
      const revealed: RoomGiftDraw = { ...draw, status: "revealed", revealedAt: new Date().toISOString(), winner };
      setRoom((current) => current.giftDraw?.id === draw.id ? { ...current, giftDraw: revealed } : current);
      return revealed;
    }
    try {
      const revealed = await repository.revealGiftDraw(draw.id);
      if (revealed) setRoom((current) => ({ ...current, giftDraw: revealed }));
      return revealed;
    } catch {
      // Realtime or another participant can still publish the idempotent reveal.
      return null;
    }
  }, [isHost, repository, room.giftDraw, room.source]);

  const cancelGiftDraw = useCallback(async (drawId?: string): Promise<RoomGiftDraw | null> => {
    if (!isHost) return null;
    const draw = room.giftDraw;
    if (!draw || (drawId && draw.id !== drawId) || ["revealed", "cancelled"].includes(draw.status)) return draw;
    if (room.source === "demo") {
      const cancelled: RoomGiftDraw = { ...draw, status: "cancelled", winner: null };
      demoGiftCandidates.current.delete(draw.id);
      demoGiftWinners.current.delete(draw.id);
      demoGiftDurations.current.delete(draw.id);
      setRoom((current) => current.giftDraw?.id === draw.id ? { ...current, giftDraw: cancelled } : current);
      return cancelled;
    }
    try {
      const cancelled = await repository.cancelGiftDraw(draw.id);
      if (cancelled) setRoom((current) => ({ ...current, giftDraw: cancelled }));
      return cancelled;
    } catch {
      showNotice("Le tirage n’a pas pu être annulé.");
      return null;
    }
  }, [isHost, repository, room.giftDraw, room.source, showNotice]);

  useEffect(() => {
    const draw = room.giftDraw;
    if (!isHost || !draw || draw.status !== "scheduled" || !draw.scheduledAt) return;
    let cancelled = false;
    let timer: number | null = null;
    let retryAttempt = 0;
    const schedule = (delay: number) => {
      if (cancelled) return;
      timer = window.setTimeout(checkSchedule, delay);
    };
    const checkSchedule = () => {
      if (cancelled) return;
      const remaining = new Date(draw.scheduledAt!).getTime() - Date.now();
      if (remaining <= 0) {
        void startGiftDraw(draw.id, true).then((started) => {
          if (cancelled) return;
          if (started && !["ready", "scheduled"].includes(started.status)) return;
          schedule(giftDrawRetryDelay(retryAttempt));
          retryAttempt += 1;
        });
        return;
      }
      // Browser timers overflow above ~24.8 days. Hourly rechecks also absorb
      // sleep/wake and wall-clock changes for the supported 30-day window.
      schedule(Math.min(remaining, 60 * 60 * 1_000));
    };
    checkSchedule();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isHost, room.giftDraw, startGiftDraw]);

  useEffect(() => {
    const draw = room.giftDraw;
    if (!isHost || !draw || draw.status !== "spinning" || !draw.revealAt) return;
    let cancelled = false;
    let timer: number | null = null;
    let retryAttempt = 0;
    const schedule = (delay: number) => {
      if (cancelled) return;
      timer = window.setTimeout(checkReveal, delay);
    };
    const checkReveal = () => {
      if (cancelled) return;
      const remaining = new Date(draw.revealAt!).getTime() - Date.now();
      if (remaining > 0) {
        schedule(remaining);
        return;
      }
      void revealGiftDraw(draw.id).then((revealed) => {
        if (cancelled) return;
        if (revealed && ["revealed", "cancelled"].includes(revealed.status)) return;
        schedule(giftDrawRetryDelay(retryAttempt));
        retryAttempt += 1;
      });
    };
    checkReveal();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [isHost, revealGiftDraw, room.giftDraw]);

  const launchPoll = useCallback(async (question: string, options: PlacePollOptionInput[], durationSeconds: PlacePollDuration, resultsVisible = true) => {
    const cleanOptions = options.map((option) => typeof option === "string"
      ? option.trim()
      : { ...option, label: option.label.trim() }).filter((option) => typeof option === "string" ? Boolean(option) : Boolean(option.label)).slice(0, 6);
    if (!question.trim() || cleanOptions.length < 2) return;
    const previousPoll = room.poll;
    setRoom((current) => ({
      ...current,
      poll: {
        id: `poll-${Date.now()}`,
        question: question.trim(),
        options: cleanOptions.map((option, index) => typeof option === "string"
          ? { label: option, votes: room.source === "demo" ? PLACE_DEMO_POLL_VOTE_COUNTS[index] ?? 0 : 0, imageUrl: null, mediaId: null, durationLabel: null }
          : { label: option.label, votes: room.source === "demo" ? PLACE_DEMO_POLL_VOTE_COUNTS[index] ?? 0 : 0, imageUrl: option.imageUrl ?? null, mediaId: option.mediaId ?? null, durationLabel: option.durationLabel ?? null }),
        durationSeconds,
        endsAt: durationSeconds === null ? null : new Date(Date.now() + durationSeconds * 1_000).toISOString(),
        isActive: true,
        resultsVisible,
        currentUserVoteIndex: null,
      },
    }));
    if (room.source === "live") {
      try {
        await repository.createPoll(room.id, question.trim(), cleanOptions, durationSeconds, resultsVisible);
        await load();
      } catch {
        setRoom((current) => ({ ...current, poll: previousPoll }));
        showNotice("Le vote n’a pas pu être ouvert. Vérifie la connexion puis réessaie.");
      }
    }
  }, [load, repository, room.id, room.poll, room.source, showNotice]);

  const stopPoll = useCallback(async () => {
    if (!isHost || !room.poll) return;
    const pollId = room.poll.id;
    setRoom((current) => ({ ...current, poll: current.poll ? { ...current.poll, isActive: false } : null }));
    if (room.source === "live") {
      try {
        await repository.stopPoll(pollId);
      } catch {
        setRoom((current) => ({ ...current, poll: current.poll?.id === pollId ? { ...current.poll, isActive: true } : current.poll }));
        showNotice("Le sondage n’a pas pu être arrêté sur le serveur.");
      }
    }
  }, [isHost, repository, room.poll, room.source, showNotice]);

  const {policy: roomVotingPolicy} = useRoomVotingPolicy(room.id,room.source);
  useEffect(()=>{
    const update=(event?:Event)=>{
      if(event instanceof StorageEvent && event.key !== `meewav:poll-ballots:v1:${room.id}:${room.poll?.id}`) return;
      setRoom(current=>{
        if(current.source!=="demo"||!current.poll)return current;
        const poll=projectDemoPoll(current.id,current.poll,roomVotingPolicy,current.currentUserProfile?.id??"");
        if(poll.currentUserVoteIndex===current.poll.currentUserVoteIndex && poll.options.every((option,index)=>option.votes===current.poll!.options[index]?.votes && option.weightedPercent===current.poll!.options[index]?.weightedPercent))return current;
        return {...current,poll};
      });
    };
    if(room.source==="demo")update();else if(roomVotingPolicy.revision>0)void load();
    window.addEventListener("storage",update);window.addEventListener("meewav-poll-vote",update);
    return()=>{window.removeEventListener("storage",update);window.removeEventListener("meewav-poll-vote",update);};
  },[room.id,room.source,room.poll?.id,roomVotingPolicy.revision]);

  const votePoll = useCallback(async (optionIndex: number) => {
    if (isHost || !canEngage || !room.poll?.isActive || room.poll.currentUserVoteIndex !== null) return;
    const voterId = room.currentUserProfile?.id ?? "";
    if (!canCastRoomVote(roomVotingPolicy, voterId)) { showNotice("Ce vote est réservé au jury."); return; }
    if (room.source === "demo") {
      try { await castDemoPollVote(room.id, room.poll, roomVotingPolicy, voterId, optionIndex); }
      catch (reason) { showNotice(reason instanceof Error ? reason.message : "Ton vote n’a pas pu être enregistré."); }
      return;
    }
    const pollId = room.poll.id;
    setRoom((current) => {
      if (!current.poll || current.poll.id !== pollId) return current;
      return {
        ...current,
        poll: {
          ...current.poll,
          currentUserVoteIndex: optionIndex,
          options: current.poll.options.map((option, index) => index === optionIndex
            ? { ...option, votes: option.votes + 1 }
            : option),
        },
      };
    });
    if (room.source === "live") {
      try {
        await repository.votePoll(pollId, optionIndex);
      } catch {
        await load();
        showNotice("Ton vote n’a pas pu être enregistré.");
      }
    }
  }, [canEngage, isHost, load, repository, room.id, room.poll, room.source, room.currentUserProfile?.id, roomVotingPolicy, showNotice]);

  const pinHighlight = useCallback(async (content: string, durationSeconds: 10 | 20 | 30) => {
    const cleanContent = content.trim().slice(0, 500);
    if (!isHost || !cleanContent) return;
    setRoom((current) => ({ ...current, pinnedMessageId: null, highlightText: cleanContent }));
    if (room.source === "live") {
      try {
        await repository.pinHighlight(room.id, cleanContent, durationSeconds);
      } catch {
        showNotice("La mise en avant reste locale : synchronisation indisponible.");
      }
    }
  }, [isHost, repository, room.id, room.source, showNotice]);

  const pinMessage = useCallback(async (messageId: string, durationSeconds: 10 | 20 | 30 = 20) => {
    if (!isHost) return;
    const message = room.messages.find((item) => item.id === messageId);
    if (!message) return;
    setRoom((current) => ({ ...current, pinnedMessageId: messageId, highlightText: message.content }));
    if (room.source === "live") {
      try {
        await repository.pinMessage(room.id, messageId, durationSeconds);
      } catch {
        showNotice("Le message reste mis en avant localement : synchronisation indisponible.");
      }
    }
  }, [isHost, repository, room.id, room.messages, room.source, showNotice]);

  const clearHighlight = useCallback(async () => {
    if (!isHost) return;
    setRoom((current) => ({ ...current, pinnedMessageId: null, highlightText: null }));
    if (room.source === "live") {
      try {
        await repository.clearHighlight(room.id);
      } catch {
        showNotice("Impossible de retirer la mise en avant sur le serveur.");
      }
    }
  }, [isHost, repository, room.id, room.source, showNotice]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!isHost) return;
    const previousMessages = room.messages;
    setRoom((current) => ({
      ...current,
      messages: current.messages.filter((message) => message.id !== messageId),
      pinnedMessageId: current.pinnedMessageId === messageId ? null : current.pinnedMessageId,
      highlightText: current.pinnedMessageId === messageId ? null : current.highlightText,
    }));
    if (room.source === "live") {
      try {
        await repository.deleteMessage(room.id, messageId);
      } catch {
        setRoom((current) => ({ ...current, messages: previousMessages }));
        showNotice("Le message n’a pas pu être supprimé.");
      }
    }
  }, [isHost, repository, room.id, room.messages, room.source, showNotice]);

  const endRoom = useCallback(async () => {
    if (!isHost) return;
    if (room.source === "demo") {
      setRoom((current) => ({ ...current, status: "ended" }));
      showNotice("La démonstration du live est terminée.");
      return;
    }
    try {
      await repository.endRoom(room.id);
      setRoom((current) => ({ ...current, status: "ended" }));
    } catch {
      showNotice("Impossible de terminer la Room pour le moment.");
    }
  }, [isHost, repository, room.id, room.source, showNotice]);

  const joinQueue = useCallback(async () => {
    if (isHost) {
      showNotice("Le Host ne peut pas rejoindre sa propre file.");
      return;
    }
    if (!effectiveUserId || !room.currentUserProfile) {
      showNotice("Connecte-toi pour rejoindre la file.");
      return;
    }
    if (!room.queueOpen) {
      showNotice("La file d’attente est fermée.");
      return;
    }
    if (room.queue.some((participant) => participant.profile.id === effectiveUserId)) {
      showNotice("Tu es déjà dans le parcours d’invitation.");
      return;
    }
    if (room.source === "demo") {
      setRoom((current) => ({
        ...current,
        queue: [...current.queue, {
          id: effectiveUserId,
          queueEntryId: `local-queue-${Date.now()}`,
          profile: room.currentUserProfile as NonNullable<PlaceRoomState["currentUserProfile"]>,
          joinedAt: new Date().toISOString(),
          status: "pending",
          imageUrl: room.currentUserProfile?.avatarUrl,
          isCameraEnabled: false,
          isMicrophoneEnabled: false,
          isSpeaking: false,
          latencyMs: 0,
        }],
      }));
      showNotice("Tu as rejoint la file d’attente de démonstration.");
      return;
    }
    try {
      await repository.joinQueue(room.id);
      await load();
      showNotice("Tu as rejoint la file d’attente.");
    } catch {
      showNotice("Impossible de rejoindre la file pour le moment.");
    }
  }, [effectiveUserId, isHost, load, repository, room.currentUserProfile, room.id, room.queue, room.queueOpen, room.source, showNotice]);

  const leaveCurrentQueue = useCallback(async () => {
    const entry = effectiveUserId
      ? room.queue.find((participant) => participant.profile.id === effectiveUserId && participant.queueEntryId)
      : undefined;
    if (!entry?.queueEntryId) return;
    if (room.source === "demo") {
      setRoom((current) => ({ ...current, queue: current.queue.filter((item) => item.id !== entry.id) }));
      return;
    }
    try {
      await repository.leaveQueue(entry.queueEntryId);
      await load();
    } catch {
      showNotice("Impossible de quitter la file pour le moment.");
    }
  }, [effectiveUserId, load, repository, room.queue, room.source, showNotice]);

  const declineCurrentInvitation = useCallback(async () => {
    const invitation = effectiveUserId
      ? room.queue.find((participant) => participant.profile.id === effectiveUserId && participant.status === "pending" && participant.invitationId)
      : undefined;
    if (!invitation?.invitationId) return;
    if (room.source === "demo") {
      setRoom((current) => ({ ...current, queue: current.queue.filter((item) => item.id !== invitation.id) }));
      return;
    }
    try {
      await repository.declineInvitation(invitation.invitationId);
      await load();
    } catch {
      showNotice("Impossible de refuser l’invitation pour le moment.");
    }
  }, [effectiveUserId, load, repository, room.queue, room.source, showNotice]);

  const setQueueOpen = useCallback(async (open: boolean) => {
    if (!isHost) return;
    setRoom((current) => ({ ...current, queueOpen: open }));
    if (room.source === "live") {
      try {
        await repository.setQueueOpen(room.id, open);
      } catch {
        setRoom((current) => ({ ...current, queueOpen: !open }));
        showNotice("L’état de la file n’a pas pu être synchronisé.");
      }
    }
  }, [isHost, repository, room.id, room.source, showNotice]);

  const acceptCurrentInvitation = useCallback(async () => {
    const invitation = effectiveUserId
      ? room.queue.find((participant) => participant.profile.id === effectiveUserId && participant.status === "pending")
      : undefined;
    if (!invitation) {
      showNotice("Aucune invitation à accepter.");
      return;
    }
    if (room.source === "demo") {
      setRoom((current) => ({
        ...current,
        queue: current.queue.map((participant) => participant.id === invitation.id
          ? { ...participant, status: "accepted" }
          : participant),
      }));
      return;
    }
    if (!invitation.invitationId) {
      showNotice("L’invitation serveur n’est pas encore disponible.");
      return;
    }
    try {
      await repository.acceptInvitation(invitation.invitationId);
      await load();
      showNotice("Invitation acceptée. Prépare ton son et ta caméra dans OBS MeeWav.");
    } catch {
      showNotice("Impossible d’accepter cette invitation pour le moment.");
    }
  }, [effectiveUserId, load, repository, room.id, room.queue, room.source, showNotice]);

  const markCurrentInvitationReady = useCallback(async () => {
    const invitation = effectiveUserId
      ? room.queue.find((participant) => participant.profile.id === effectiveUserId && participant.status === "accepted")
      : undefined;
    if (!invitation) {
      showNotice("Aucune préparation OBS MeeWav prête à valider.");
      return;
    }
    if (room.source === "demo") {
      setRoom((current) => ({
        ...current,
        queue: current.queue.map((participant) => participant.id === invitation.id
          ? { ...participant, status: "ready" }
          : participant),
      }));
      return;
    }
    if (!invitation.invitationId) {
      showNotice("L’invitation serveur n’est pas encore disponible.");
      return;
    }
    try {
      await repository.markInvitationReady(invitation.invitationId);
      await load();
      showNotice("Préparation OBS MeeWav validée : le host peut maintenant t’ouvrir les coulisses.");
    } catch {
      showNotice("Impossible de confirmer la préparation OBS MeeWav pour le moment.");
    }
  }, [effectiveUserId, load, repository, room.queue, room.source, showNotice]);

  const cageStagePending = useRef(false);
  const moveGuest = useCallback(async (participant: PlaceParticipant, destination: "backstage" | "onstage" | "accepted" | "ready") => {
    if (!isHost) {
      showNotice("Cette action est réservée au Host.");
      return;
    }

    if (experienceType === "cage" && destination === "onstage") {
      if (cageStagePending.current) return;
      cageStagePending.current = true;
      try {
        const tools = room.source === "demo" ? roomToolsRepository : liveRoomToolsRepository;
        const actorId = effectiveUserId ?? room.host.id;
        const state = await tools.projectionForRole("cage", room.id, "host", actorId);
        if (state.cage?.runtime?.config.format === "open-mic") {
          const updated = await stageCageOpenMicGuest(tools, state, actorId, participant.profile.id, room.source);
          if (room.source === "demo") setRoom((current) => current.id === room.id ? projectCageDemoGuests(current, updated.cage!.runtime!) : current);
          else await load();
          showNotice(`${participant.profile.displayName} est sur scène. Démarre son passage dans la Cage.`);
          return;
        }
      } catch (error) {
        showNotice(error instanceof Error ? error.message : "Impossible de monter cet artiste.");
        return;
      } finally { cageStagePending.current = false; }
    }

    if (experienceType === "cage" && room.source === "demo") {
      try {
        const target = destination;
        const updated = await roomToolsRepository.execute("cage", room.id, "host", {
          type: "cage.demo.guest.move", participantId: participant.profile.id, destination: target,
        }, effectiveUserId ?? undefined);
        if (updated.cage?.runtime) setRoom((current) => current.id === room.id ? projectCageDemoGuests(current, updated.cage!.runtime!) : current);
        showNotice(target === "ready" ? "Simulation : préparation OBS MeeWav validée." : `${participant.profile.displayName} rejoint ${target === "onstage" ? "la scène" : target === "backstage" ? "les Coulisses" : ["backstage", "onstage"].includes(participant.status) ? "la file d’attente" : "la préparation OBS MeeWav"}.`);
      } catch (error) {
        showNotice(error instanceof Error ? error.message : "Impossible de déplacer cet invité.");
      }
      return;
    }



    if (destination === "ready") {
      showNotice("La préparation doit être confirmée par l’invité dans son OBS MeeWav.");
      return;
    }
    let effectiveDestination = destination;
    let isQueueInvitation = false;
    let serverMutation: (() => Promise<void>) | null = null;
    const previousGuestChannel = room.channels.find((channel) => (
      channel.kind === "guest"
      && (channel.participantId === participant.id || channel.participantId === participant.profile.id)
    ));
    if (previousGuestChannel) guestChannelMemory.current.set(participant.profile.id, previousGuestChannel);

    if (participant.queueEntryId) {
      if (room.source === "live") {
        if (destination !== "accepted") {
          showNotice("Cette personne doit d’abord accepter l’invitation et préparer son OBS MeeWav.");
          return;
        }
        isQueueInvitation = true;
        serverMutation = () => repository.inviteFromQueue(participant.queueEntryId as string);
      } else {
        // The investor fixture demonstrates the compact product transition
        // directly. Live Rooms keep the consent + Green House server flow.
        effectiveDestination = "backstage";
      }
    } else if (room.source === "live") {
      if (!participant.invitationId) {
        showNotice("Invitation serveur introuvable : recharge la file avant de réessayer.");
        return;
      } else if (destination === "accepted") {
        if (participant.status === "ready") {
          // The UI's queue action means “continue the workflow”. Once the
          // Guest is ready, the only Host-authorized next step is Backstage.
          effectiveDestination = "backstage";
          serverMutation = () => repository.moveInvitation(participant.invitationId as string, "backstage");
        } else if (participant.status === "backstage" || participant.status === "onstage") {
          serverMutation = () => repository.moveInvitation(participant.invitationId as string, "accepted");
        } else {
          showNotice(participant.status === "pending"
            ? "Invitation envoyée : en attente de la réponse de l’invité."
            : "L’invité doit terminer sa préparation OBS MeeWav avant de rejoindre les coulisses.");
          return;
        }
      } else if (destination === "backstage") {
        if (participant.status !== "ready" && participant.status !== "onstage") {
          showNotice("Seul un invité prêt ou déjà sur Scène peut rejoindre les Coulisses.");
          return;
        }
        serverMutation = () => repository.moveInvitation(participant.invitationId as string, "backstage");
      } else {
        if (participant.status !== "backstage") {
          showNotice("Seul un invité en Coulisses peut monter sur Scène.");
          return;
        }
        serverMutation = () => repository.moveInvitation(participant.invitationId as string, "onstage");
      }
    }

    const destinationLabel = isQueueInvitation
      ? "les invitations"
      : effectiveDestination === "onstage"
        ? "la Scène"
        : effectiveDestination === "backstage"
          ? "les Coulisses"
          : "la préparation OBS MeeWav";
    if (effectiveDestination === "onstage" && room.participants.filter((item) => item.status === "onstage" && item.id !== participant.id).length >= 3) {
      showNotice("La Scène accueille au maximum trois invités simultanément.");
      return;
    }

    const rollback = {
      participants: room.participants,
      queue: room.queue,
      channels: room.channels,
    };
    setRoom((current) => {
      if (isQueueInvitation) {
        return {
          ...current,
          queue: current.queue.map((item) => item.id === participant.id
            ? {
                ...item,
                queueEntryId: undefined,
                invitationId: current.source === "demo" ? `local-invitation-${Date.now()}` : item.invitationId,
                status: "pending",
              }
            : item),
        };
      }
      const withoutParticipant = current.participants.filter((item) => item.id !== participant.id);
      const withoutQueue = current.queue.filter((item) => item.id !== participant.id);
      if (effectiveDestination === "accepted") {
        return {
          ...current,
          participants: withoutParticipant,
          queue: [...withoutQueue, { ...participant, status: "accepted" }],
          channels: current.channels.filter((channel) => (
            channel.kind !== "guest"
            || (channel.participantId !== participant.id && channel.participantId !== participant.profile.id)
          )),
        };
      }
      const channelsWithoutGuest = current.channels.filter((channel) => (
        channel.kind !== "guest"
        || (channel.participantId !== participant.id && channel.participantId !== participant.profile.id)
      ));
      const rememberedChannel = guestChannelMemory.current.get(participant.profile.id);
      const nextChannels = effectiveDestination === "onstage"
        ? [
            ...channelsWithoutGuest.filter((channel) => channel.kind === "microphone"),
            ...channelsWithoutGuest.filter((channel) => channel.kind === "guest"),
            {
              ...rememberedChannel,
              id: rememberedChannel?.id ?? `guest-${participant.profile.id}`,
              participantId: participant.profile.id,
              label: rememberedChannel?.label ?? participant.profile.displayName.split(" ")[0] ?? "Invité",
              detail: "Invité",
              kind: "guest" as const,
              gain: rememberedChannel?.gain ?? 0.74,
              level: rememberedChannel?.level ?? 0.18,
              isMuted: rememberedChannel?.isMuted ?? !participant.isMicrophoneEnabled,
              isSolo: rememberedChannel?.isSolo ?? false,
              signalState: rememberedChannel?.signalState ?? (participant.isMicrophoneEnabled ? "active" as const : "muted" as const),
              accent: "#a578ff",
            },
            ...channelsWithoutGuest.filter((channel) => channel.kind === "audio"),
            ...channelsWithoutGuest.filter((channel) => channel.kind === "master"),
          ]
        : channelsWithoutGuest;
      return {
        ...current,
        queue: withoutQueue,
        participants: [...withoutParticipant, {
          ...participant,
          queueEntryId: undefined,
          invitationId: participant.invitationId ?? (current.source === "demo" ? `local-invitation-${Date.now()}` : undefined),
          status: effectiveDestination,
        }],
        channels: nextChannels,
      };
    });

    if (serverMutation) {
      try {
        await serverMutation();
        await load();
      } catch {
        setRoom((current) => current.id === room.id ? { ...current, ...rollback } : current);
        showNotice(`Impossible de synchroniser le passage vers ${destinationLabel}.`);
        return;
      }
    }
    showNotice(isQueueInvitation
      ? `Invitation envoyée à ${participant.profile.displayName}.`
      : `${participant.profile.displayName} rejoint ${destinationLabel}.`);
  }, [experienceType, effectiveUserId, isHost, load, repository, room.channels, room.host.id, room.id, room.participants, room.queue, room.source, showNotice]);

  const inviteProfile = useCallback(async (profileId: string) => {
    if (!isHost) throw new Error("room_invitation_host_only");
    try {
      await repository.inviteProfile(room.id, profileId);
      await load();
      showNotice("Invitation envoyée. L’artiste peut maintenant préparer son OBS MeeWav.");
    } catch (error) {
      showNotice("Cette personne ne peut pas être invitée pour le moment.");
      throw error;
    }
  }, [isHost, load, repository, room.id, showNotice]);

  const removeGuest = useCallback(async (participant: PlaceParticipant) => {
    if (!isHost) return;
    const removeLocally = () => setRoom((current) => ({
      ...current,
      participants: current.participants.filter((item) => item.id !== participant.id),
      queue: current.queue.filter((item) => item.id !== participant.id),
      channels: current.channels.filter((channel) => channel.participantId !== participant.id && channel.participantId !== participant.profile.id),
    }));
    if (room.source === "demo") {
      guestChannelMemory.current.delete(participant.profile.id);
      removeLocally();
      showNotice(`${participant.profile.displayName} a quitté le parcours invité.`);
      return;
    }
    try {
      if (participant.queueEntryId) {
        await repository.leaveQueue(participant.queueEntryId);
      } else if (participant.invitationId && (participant.status === "pending" || participant.status === "accepted" || participant.status === "ready")) {
        await repository.cancelInvitation(participant.invitationId);
      } else if (participant.invitationId) {
        await repository.endGuestPassage(participant.invitationId);
      }
      await load();
      guestChannelMemory.current.delete(participant.profile.id);
      showNotice(`Passage de ${participant.profile.displayName} terminé.`);
    } catch {
      showNotice("Impossible de terminer ce passage pour le moment.");
    }
  }, [isHost, load, repository, room.source, showNotice]);

  const setClassroomSpotlight = useCallback(async (profile: PlaceProfile, enabled: boolean) => {
    if (!isHost) throw new Error("Seul le Host peut mettre un élève à l’écran.");
    const participant = [...room.participants, ...room.queue].find((item) => item.profile.id === profile.id);
    if (room.source === "live") {
      if (!enabled) {
        if (participant?.status === "onstage" && participant.invitationId) {
          await repository.moveInvitation(participant.invitationId, "backstage");
          await load();
        }
        return;
      }
      if (participant?.status === "onstage") return;
      if (!participant?.invitationId || !["ready", "backstage"].includes(participant.status)) {
        const pending = [...room.participants, ...room.queue].some((item) => item.profile.id === profile.id && ["pending", "accepted"].includes(item.status));
        if (!pending) await repository.inviteProfile(room.id, profile.id);
        await load();
        showNotice("Invitation envoyée. L’élève doit accepter et préparer sa caméra avant sa mise à l’écran.");
        return;
      }
      if (room.participants.filter((item) => item.status === "onstage").length >= 3) {
        throw new Error("La scène est complète. Remettez un invité en coulisses avant de faire monter cet élève.");
      }
      if (participant.status === "ready") await repository.moveInvitation(participant.invitationId, "backstage");
      await repository.moveInvitation(participant.invitationId, "onstage");
      await load();
      return;
    }
    if (enabled && !["ready", "backstage", "onstage"].includes(participant?.status ?? "")) {
      if (!participant?.invitationId) setRoom((current) => ({ ...current, queue: [
        ...current.queue.filter((item) => item.profile.id !== profile.id),
        { id: participant?.id ?? `classroom-${profile.id}`, profile, joinedAt: new Date().toISOString(),
          ...participant, queueEntryId: undefined, invitationId: `classroom-invitation-${profile.id}`,
          status: "accepted", isCameraEnabled: false, isMicrophoneEnabled: false, isSpeaking: false, latencyMs: 0 },
      ] }));
      showNotice("L’élève prépare son OBS MeeWav. Valide ses tests dans Invités avant sa mise à l’écran.");
      return;
    }
    if (enabled && participant?.status !== "onstage" && room.participants.filter((item) => item.status === "onstage").length >= 3) {
      throw new Error("La scène est complète. Remettez un invité en coulisses avant de faire monter cet élève.");
    }
    setRoom((current) => {
      const existing = [...current.participants, ...current.queue].find((item) => item.profile.id === profile.id);
      if (!enabled) return {
        ...current,
        participants: current.participants.map((item) => item.profile.id === profile.id ? { ...item, status: "backstage" as const } : item),
        channels: current.channels.filter((channel) => channel.kind !== "guest" || (channel.participantId !== profile.id && channel.participantId !== existing?.id)),
      };
      const next: PlaceParticipant = {
        id: existing?.id ?? `classroom-${profile.id}`, profile,
        joinedAt: existing?.joinedAt ?? new Date().toISOString(),
        imageUrl: profile.avatarUrl,
        videoSources: [{ id: `classroom-preview-${profile.id}`, type: "front_camera", transport: "image", aspectRatio: "9:16", imageUrl: profile.avatarUrl }],
        isCameraEnabled: existing?.isCameraEnabled ?? true,
        isMicrophoneEnabled: existing?.isMicrophoneEnabled ?? false,
        isSpeaking: false, latencyMs: 0, ...existing, status: "onstage",
      };
      return {
        ...current,
        queue: current.queue.filter((item) => item.profile.id !== profile.id),
        participants: [
          ...current.participants.filter((item) => item.profile.id !== profile.id),
          next,
        ],
        channels: [
          ...current.channels.filter((channel) => channel.kind !== "guest" || ![profile.id, existing?.id].includes(channel.participantId)),
          { id: `classroom-mic-${profile.id}`, participantId: profile.id, label: profile.displayName, detail: "Élève", kind: "guest" as const, gain: .74, level: 0, isMuted: !next.isMicrophoneEnabled, isSolo: false, signalState: "silent" as const, accent: "#a578ff" },
        ],
      };
    });
  }, [isHost, load, repository, room.id, room.participants, room.queue, room.source, showNotice]);

  const onStage = useMemo(() => room.participants.filter((participant) => participant.status === "host" || participant.status === "onstage"), [room.participants]);
  useEffect(() => {
    if (experienceType !== "cage" || room.source !== "demo") return;
    let active = true;
    const sync = () => { void roomToolsRepository.load("cage", room.id).then((toolsState) => {
      const runtime = toolsState.cage?.runtime;
      if (active && runtime && runtime.participants.length) setRoom((current) => current.id === room.id ? projectCageDemoGuests(current, runtime) : current);
    }).catch(() => { /* The shared competition tools display the loading error. */ }); };
    sync();
    const subscription = roomToolsRepository.subscribe("cage", room.id, sync);
    return () => { active = false; subscription.unsubscribe(); };
  }, [room.id, room.source, experienceType]);
  const backstage = useMemo(() => room.participants.filter((participant) => participant.status === "backstage"), [room.participants]);

  return {
    setExperienceType,
    room,
    activeUserId: effectiveUserId,
    recordDemoSupport,
    isHost,
    isGuest,
    isViewer,
    canEngage,
    goldenLikeUnavailable,
    surface,
    setSurface,
    isLoading,
    notice,
    onStage,
    backstage,
    setChannelGain,
    toggleChannelMute,
    setOwnCameraEnabled,
    setParticipantCameraEnabled,
    updateVocal,
    setTune,
    sendMessage,
    toggleLike,
    giveGoldenLike,
    prepareTrackPreview,
    updateTrackPreviewMetadata,
    setTrackRoute,
    setTrackPlaybackState,
    toggleTrackLoop,
    seekTrack,
    launchPoll,
    stopPoll,
    votePoll,
    submitGift,
    createGiftDraw,
    scheduleGiftDraw,
    startGiftDraw,
    revealGiftDraw,
    cancelGiftDraw,
    pinHighlight,
    pinMessage,
    clearHighlight,
    deleteMessage,
    endRoom,
    joinQueue,
    leaveCurrentQueue,
    declineCurrentInvitation,
    setQueueOpen,
    acceptCurrentInvitation,
    markCurrentInvitationReady,
    moveGuest,
    setClassroomSpotlight,
    inviteProfile,
    removeGuest,
    showNotice,
  };
}
