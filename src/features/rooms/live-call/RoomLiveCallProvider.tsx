import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoaderCircle, PhoneCall, PhoneOff, Volume2 } from "lucide-react";
import { useAuth } from "../../auth";
import type { PlaceLiveCallRequest } from "../place/placeLiveCall";
import usePlaceLiveCallMedia from "../place/usePlaceLiveCallMedia";
import type {
  PlaceLiveCallMediaRole,
  PlaceLiveCallMediaStatus,
} from "../place/placeLiveCallMedia.service";
import RoomLiveCallIncoming from "./RoomLiveCallIncoming";
import { readRegieTalkbackTarget, writeRegieTalkbackTarget } from "./regieTalkbackStorage";
import {
  createRoomLiveCallClientRequestId,
  ROOM_LIVE_CALL_MAX_CONTACTS,
  RoomLiveCallServiceError,
  roomLiveCallErrorMessage,
  roomLiveCallRepository,
  type RoomLiveCallInvitation,
  type RoomLiveCallRealtimeStatus,
  type RoomLiveCallRepository,
  type RoomLiveCallRoute,
} from "./roomLiveCall.service";

type RoomLiveCallAction = {
  invitationId: string;
  kind: "accept" | "decline" | "route" | "on_air" | "end";
} | null;

type RegieTalkbackPublicGate = {
  closePublic: () => boolean | Promise<boolean>;
  restorePublic: () => void | Promise<void>;
};

type RoomLiveCallContextValue = {
  invitations: RoomLiveCallInvitation[];
  incomingInvitations: RoomLiveCallInvitation[];
  outgoingInvitations: RoomLiveCallInvitation[];
  acceptedInvitations: RoomLiveCallInvitation[];
  loading: boolean;
  realtimeStatus: RoomLiveCallRealtimeStatus;
  errorMessage: string | null;
  activeAction: RoomLiveCallAction;
  mediaSessions: RoomLiveCallMediaSession[];
  onAirInvitationIds: ReadonlySet<string>;
  audibleOnAirInvitationIds: ReadonlySet<string>;
  /** Rooms where a called contact is listening to the public programme instead of the private Host return. */
  contactPublicProgramRoomIds: ReadonlySet<string>;
  regieTalkbackActiveRoomIds: ReadonlySet<string>;
  requestLiveCall: (request: PlaceLiveCallRequest) => Promise<void>;
  requestLiveCallTracked: (request: PlaceLiveCallRequest) => Promise<string[]>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  setCallRoute: (invitationId: string, routeMode: RoomLiveCallRoute) => Promise<void>;
  confirmCallOnAir: (invitationId: string) => Promise<void>;
  takeCallOffAir: (invitationId: string) => Promise<void>;
  authorizeCallProgram: (invitationIds: string[], enabled: boolean) => Promise<boolean>;
  setCallProgramAudible: (invitationIds: string[], audible: boolean) => void;
  setContactPublicProgramActive: (roomId: string, active: boolean) => void;
  endCall: (invitationId: string) => Promise<void>;
  setContactReturnLevel: (roomId: string, level: number) => void;
  setHostVoiceTrack: (roomId: string, track: MediaStreamTrack | null) => void;
  setContactMix: (roomId: string, mix: { track: MediaStreamTrack | null; prepare: () => Promise<MediaStreamTrack | null> } | null) => void;
  setCallProgramPreflight: (roomId: string, preflight: (() => Promise<boolean>) | null) => void;
  setRegieContact: (roomId: string, profileId: string | null) => void;
  setRegieTalkbackPublicGate: (roomId: string, gate: RegieTalkbackPublicGate | null) => void;
  setRegieTalkbackActive: (roomId: string, enabled: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
};

export type RoomLiveCallMediaSession = {
  invitationId: string;
  roomId: string;
  status: PlaceLiveCallMediaStatus;
  role: PlaceLiveCallMediaRole | null;
  remoteTrack: MediaStreamTrack | null;
  remoteMuted: boolean;
  remotePlaybackSuppressed: boolean;
  peerPresent: boolean;
  autoplayBlocked: boolean;
  localPublished: boolean;
  localAudible: boolean;
  error: string | null;
  startAudio: () => Promise<boolean>;
  resumeCall: () => Promise<boolean>;
  setLocalEnabled: (enabled: boolean) => Promise<boolean>;
  disconnect: () => Promise<void>;
};

type RetryRequest = {
  clientRequestId: string;
  createdAt: number;
};

type RoomLiveCallProviderProps = {
  children: ReactNode;
  repository?: RoomLiveCallRepository;
  pollIntervalMs?: number;
};

const RoomLiveCallContext = createContext<RoomLiveCallContextValue | null>(null);
const RETRY_REQUEST_TTL_MS = 5 * 60_000;

function errorMessage(error: unknown) {
  if (error instanceof RoomLiveCallServiceError) return error.message;
  return roomLiveCallErrorMessage("live_call_failed");
}

function requestSignature(roomId: string, profileIds: string[], mode: "private" | "public") {
  return `${roomId}:${mode}:${[...profileIds].sort().join(",")}`;
}

function sortNewestFirst(invitations: RoomLiveCallInvitation[]) {
  return [...invitations].sort((left, right) => (
    Date.parse(right.createdAt) - Date.parse(left.createdAt)
  ));
}

function sameMediaSession(left: RoomLiveCallMediaSession | undefined, right: RoomLiveCallMediaSession) {
  return Boolean(left
    && left.invitationId === right.invitationId
    && left.roomId === right.roomId
    && left.status === right.status
    && left.role === right.role
    && left.remoteTrack === right.remoteTrack
    && left.remoteMuted === right.remoteMuted
    && left.remotePlaybackSuppressed === right.remotePlaybackSuppressed
    && left.peerPresent === right.peerPresent
    && left.autoplayBlocked === right.autoplayBlocked
    && left.localPublished === right.localPublished
    && left.localAudible === right.localAudible
    && left.error === right.error
    && left.startAudio === right.startAudio
    && left.resumeCall === right.resumeCall
    && left.setLocalEnabled === right.setLocalEnabled
    && left.disconnect === right.disconnect);
}

function RoomLiveCallMediaBinding({
  invitation,
  localTrack,
  onSnapshot,
  onDispose,
  onRequestLocalTrack,
  remotePlaybackSuppressed,
  returnLevel = 1,
  localEnabled,
}: {
  invitation: RoomLiveCallInvitation;
  localTrack: MediaStreamTrack | null;
  onSnapshot: (snapshot: RoomLiveCallMediaSession) => void;
  onDispose: (invitationId: string) => void;
  onRequestLocalTrack?: (roomId?: string) => Promise<MediaStreamTrack>;
  remotePlaybackSuppressed: boolean;
  returnLevel?: number;
  localEnabled: boolean;
}) {
  const media = usePlaceLiveCallMedia(
    invitation.invitationId,
    localTrack,
    Boolean(localTrack && localTrack.readyState === "live" && localEnabled),
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [elementPlaybackBlocked, setElementPlaybackBlocked] = useState(false);
  const remoteTrack = media.remoteAudio?.track ?? null;
  const nativeRemoteTrack = remoteTrack?.mediaStreamTrack ?? null;

  useEffect(() => {
    const element = audioRef.current;
    if (!element || !remoteTrack) {
      setElementPlaybackBlocked(false);
      return undefined;
    }
    remoteTrack.attach(element);
    return () => {
      remoteTrack.detach(element);
      element.srcObject = null;
    };
  }, [remoteTrack]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element || !remoteTrack) {
      setElementPlaybackBlocked(false);
      return;
    }
    // This prop and the public programme suppression are driven by the same
    // Provider state. React therefore closes one path in the same commit in
    // which it opens the other, instead of relying on two independent effects.
    element.volume = returnLevel;
    element.muted = remotePlaybackSuppressed;
    const attempt = element.play();
    if (!attempt) return;
    void attempt.then(
      () => setElementPlaybackBlocked(false),
      () => setElementPlaybackBlocked(!remotePlaybackSuppressed),
    );
  }, [remotePlaybackSuppressed, remoteTrack, returnLevel]);

  const startAudio = useCallback(async () => {
    const transportReady = await media.startAudio();
    const element = audioRef.current;
    if (!element) return transportReady;
    try {
      await element.play();
      setElementPlaybackBlocked(false);
      return transportReady;
    } catch {
      setElementPlaybackBlocked(true);
      return false;
    }
  }, [media.startAudio]);

  const resumeCall = useCallback(async () => {
    try {
      const nextTrack = localTrack?.kind === "audio" && localTrack.readyState === "live"
        ? localTrack
        : await onRequestLocalTrack?.(invitation.roomId) ?? null;
      return media.resumeCall(nextTrack);
    } catch {
      return false;
    }
  }, [localTrack, media.resumeCall, onRequestLocalTrack, invitation.roomId]);

  useEffect(() => {
    onSnapshot({
      invitationId: invitation.invitationId,
      roomId: invitation.roomId,
      status: media.status,
      role: media.role,
      remoteTrack: nativeRemoteTrack,
      remoteMuted: media.remoteAudio?.muted ?? true,
      remotePlaybackSuppressed,
      peerPresent: media.peerPresent,
      autoplayBlocked: media.autoplayBlocked || elementPlaybackBlocked,
      localPublished: media.localPublished,
      localAudible: media.localAudible,
      error: media.error,
      startAudio,
      resumeCall,
      setLocalEnabled: media.setLocalEnabled,
      disconnect: media.disconnect,
    });
  }, [
    elementPlaybackBlocked,
    invitation.invitationId,
    invitation.roomId,
    media.autoplayBlocked,
    media.error,
    media.localAudible,
    media.localPublished,
    media.peerPresent,
    media.remoteAudio?.muted,
    media.role,
    media.status,
    media.setLocalEnabled,
    nativeRemoteTrack,
    onSnapshot,
    remotePlaybackSuppressed,
    resumeCall,
    startAudio,
    media.disconnect,
  ]);

  useEffect(() => () => onDispose(invitation.invitationId), [invitation.invitationId, onDispose]);

  return (
    <audio
      ref={audioRef}
      className="room-live-call-remote-audio"
      autoPlay
      muted={remotePlaybackSuppressed}
      playsInline
      aria-hidden="true"
    />
  );
}

function RoomLiveCallMediaNotice({
  invitation,
  session,
  ending,
  routePending,
  onAir,
  onAirPending,
  onPreparePublic,
  onConfirmOnAir,
  onTakeOffAir,
  onEnd,
}: {
  invitation: RoomLiveCallInvitation;
  session: RoomLiveCallMediaSession | null;
  ending: boolean;
  routePending: boolean;
  onAir: boolean;
  onAirPending: boolean;
  onPreparePublic: () => void;
  onConfirmOnAir: () => void;
  onTakeOffAir: () => void;
  onEnd: () => void;
}) {
  const peerName = invitation.partyRole === "host"
    ? invitation.contactDisplayName
    : invitation.hostDisplayName;
  const statusLabel = !session || session.status === "requesting_token" || session.status === "connecting"
    ? "Connexion audio privée…"
    : session.status === "reconnecting"
      ? "Reconnexion de l’appel…"
      : session.status === "failed"
        ? "Audio privé indisponible"
        : session.status === "connected" && session.peerPresent
          ? session.remoteMuted ? "Le contact est en sourdine" : "Appel privé connecté"
          : session.status === "connected"
            ? `En attente de ${peerName}`
            : "Appel privé en attente";

  return (
    <aside className="room-live-call-media-notice" aria-live="polite">
      <span className="room-live-call-media-notice__icon" aria-hidden="true"><PhoneCall /></span>
      <span className="room-live-call-media-notice__copy">
        <small>
          {invitation.callMode === "public" ? "APPEL PUBLIC" : "APPEL PRIVÉ"} · {onAir
            ? "À L’ANTENNE"
            : onAirPending
              ? "CONNEXION ANTENNE"
              : invitation.routeMode === "public"
                ? "PRÊT PUBLIC"
                : "PRÉÉCOUTE"}
        </small>
        <strong>{peerName}</strong>
        <em>{statusLabel}</em>
      </span>
      {session?.autoplayBlocked ? (
        <button type="button" className="is-audio" onClick={() => { void session.startAudio(); }}>
          <Volume2 aria-hidden="true" /> Activer le son
        </button>
      ) : null}
      {session && (session.status === "disconnected"
        || session.status === "failed"
        || (session.status === "connected" && (!session.localPublished || !session.localAudible))) ? (
        <button type="button" className="is-audio" onClick={() => { void session.resumeCall(); }}>
          <PhoneCall aria-hidden="true" /> {invitation.partyRole === "contact" ? "Activer mon micro" : "Reprendre l’appel"}
        </button>
      ) : null}
      {invitation.partyRole === "host" && invitation.callMode === "public" && invitation.routeMode === "preview" ? (
        <button type="button" className="is-route" disabled={routePending} onClick={onPreparePublic}>
          {routePending ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
          Préparer Public
        </button>
      ) : null}
      {invitation.partyRole === "host" && invitation.routeMode === "public" && !onAir && !onAirPending ? (
        <button
          type="button"
          className="is-route is-confirm"
          disabled={routePending || !session || session.status !== "connected" || !session.peerPresent || !session.remoteTrack || session.remoteMuted}
          onClick={onConfirmOnAir}
        >
          {routePending ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
          Passer à l’antenne
        </button>
      ) : null}
      {invitation.partyRole === "host" && onAirPending ? (
        <button type="button" className="is-route is-confirm" disabled>
          <LoaderCircle className="is-spinning" aria-hidden="true" /> Connexion antenne…
        </button>
      ) : null}
      {invitation.partyRole === "host" && onAir ? (
        <button type="button" className="is-route is-on-air" disabled={routePending} onClick={onTakeOffAir}>
          {routePending ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
          Retirer du public
        </button>
      ) : null}
      <button type="button" className="is-end" disabled={ending} onClick={onEnd}>
        {ending ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <PhoneOff aria-hidden="true" />}
        Raccrocher
      </button>
      {session?.error ? <small className="room-live-call-media-notice__error" role="alert">{session.error}</small> : null}
    </aside>
  );
}

export function RoomLiveCallProvider({
  children,
  repository = roomLiveCallRepository,
  pollIntervalMs = 30_000,
}: RoomLiveCallProviderProps) {
  const { status: authStatus, user } = useAuth();
  const [invitations, setInvitations] = useState<RoomLiveCallInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RoomLiveCallRealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<RoomLiveCallAction>(null);
  const [hostVoiceTracks, setHostVoiceTracks] = useState<Map<string, MediaStreamTrack>>(() => new Map());
  const [contactReturnLevels, setContactReturnLevels] = useState<Map<string, number>>(() => new Map());
  const setContactReturnLevel = useCallback((roomId: string, level: number) => {
    setContactReturnLevels(current => new Map(current).set(roomId, Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0))));
  }, []);
  const contactMixes = useRef(new Map<string, { track: MediaStreamTrack | null; prepare: () => Promise<MediaStreamTrack | null> }>());
  const setContactMix = useCallback((roomId: string, mix: { track: MediaStreamTrack | null; prepare: () => Promise<MediaStreamTrack | null> } | null) => {
    if (mix) contactMixes.current.set(roomId, mix); else contactMixes.current.delete(roomId);
  }, []);
  const [contactMicrophoneTrack, setContactMicrophoneTrack] = useState<MediaStreamTrack | null>(null);
  const [mediaSessionsById, setMediaSessionsById] = useState<Map<string, RoomLiveCallMediaSession>>(() => new Map());
  const [onAirInvitationIds, setOnAirInvitationIds] = useState<Set<string>>(() => new Set());
  const [audibleOnAirInvitationIds, setAudibleOnAirInvitationIds] = useState<Set<string>>(() => new Set());
  const [contactPublicProgramRoomIds, setContactPublicProgramRoomIds] = useState<Set<string>>(() => new Set());
  const [regieContactByRoom, setRegieContactByRoom] = useState<Map<string, string>>(() => new Map());
  const [regieTalkbackActiveRoomIds, setRegieTalkbackActiveRoomIds] = useState<Set<string>>(() => new Set());
  const invitationsRef = useRef(invitations);
  const onAirInvitationIdsRef = useRef(onAirInvitationIds);
  const regieContactByRoomRef = useRef(regieContactByRoom);
  const mediaSessionsByIdRef = useRef(mediaSessionsById);
  invitationsRef.current = invitations;
  onAirInvitationIdsRef.current = onAirInvitationIds;
  regieContactByRoomRef.current = regieContactByRoom;
  mediaSessionsByIdRef.current = mediaSessionsById;
  const retryRequestsRef = useRef(new Map<string, RetryRequest>());
  const trackedInvitationIdsRef = useRef(new Set<string>());
  const refreshSequenceRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactMicrophoneRef = useRef<MediaStreamTrack | null>(null);
  const contactMicrophoneRequestRef = useRef<Promise<MediaStreamTrack> | null>(null);
  const regieTalkbackPublicGatesRef = useRef(new Map<string, RegieTalkbackPublicGate>());
  const regieTalkbackIntentRevisionRef = useRef(new Map<string, number>());
  const contactMicrophoneEndedCleanupRef = useRef<(() => void) | null>(null);
  const hostProgramPreflightRef = useRef(new Map<string, () => Promise<boolean>>());

  const setContactPublicProgramActive = useCallback((roomId: string, active: boolean) => {
    setContactPublicProgramRoomIds((current) => {
      // Never silence a private return for an unrelated viewer. The public
      // handoff is valid only while this account owns an accepted contact leg.
      const hasAcceptedContactLeg = invitationsRef.current.some((invitation) => (
        invitation.partyRole === "contact"
        && invitation.status === "accepted"
        && invitation.roomId === roomId
      ));
      if (active && !hasAcceptedContactLeg) return current;
      if (active === current.has(roomId)) return current;
      const next = new Set(current);
      if (active) next.add(roomId);
      else next.delete(roomId);
      return next;
    });
  }, []);

  const refreshInternal = useCallback(async (showLoading: boolean) => {
    if (authStatus !== "authenticated" || !user?.id) {
      invitationsRef.current = [];
      setInvitations([]);
      return [] as RoomLiveCallInvitation[];
    }

    const sequence = ++refreshSequenceRef.current;
    if (showLoading) setLoading(true);
    try {
      const rows = sortNewestFirst(await repository.listMine(50));
      if (sequence !== refreshSequenceRef.current) return null;
      // Keep imperative teardown/recovery paths aligned before React commits
      // the state update. This closes the response-lost window after INVITE.
      invitationsRef.current = rows;
      setInvitations(rows);
      setError(null);
      return rows;
    } catch (nextError) {
      if (sequence !== refreshSequenceRef.current) return null;
      setError(errorMessage(nextError));
      return null;
    } finally {
      if (showLoading && sequence === refreshSequenceRef.current) setLoading(false);
    }
  }, [authStatus, repository, user?.id]);

  const refresh = useCallback(async () => { await refreshInternal(true); }, [refreshInternal]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshInternal(false);
    }, 80);
  }, [refreshInternal]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user?.id) {
      refreshSequenceRef.current += 1;
      setInvitations([]);
      setLoading(false);
      setRealtimeStatus("idle");
      setError(null);
      setActiveAction(null);
      setOnAirInvitationIds(new Set());
      retryRequestsRef.current.clear();
      return undefined;
    }

    void refreshInternal(true);
    const subscription = repository.subscribe(scheduleRefresh, setRealtimeStatus);
    const pollTimer = window.setInterval(scheduleRefresh, Math.max(10_000, pollIntervalMs));

    return () => {
      subscription.unsubscribe();
      window.clearInterval(pollTimer);
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [authStatus, pollIntervalMs, refreshInternal, repository, scheduleRefresh, user?.id]);

  const releaseContactMicrophone = useCallback(() => {
    const track = contactMicrophoneRef.current;
    contactMicrophoneEndedCleanupRef.current?.();
    contactMicrophoneEndedCleanupRef.current = null;
    contactMicrophoneRef.current = null;
    contactMicrophoneRequestRef.current = null;
    setContactMicrophoneTrack(null);
    // This track was created by this Provider. Host Room tracks are kept in a
    // separate map and are never stopped here.
    track?.stop();
  }, []);

  const ensureContactMicrophone = useCallback(async (roomId?: string) => {
    const existing = contactMicrophoneRef.current;
    if (existing?.kind === "audio" && existing.readyState === "live") return existing;
    if (contactMicrophoneRequestRef.current) return contactMicrophoneRequestRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new RoomLiveCallServiceError(
        "microphone_unavailable",
        "Aucun microphone compatible n’est disponible. L’appel n’a pas été accepté.",
      );
    }

    const personalMix = roomId ? contactMixes.current.get(roomId) : undefined;
    const captureRequest = personalMix ? personalMix.prepare().then(track => {
      if (!track || track.readyState !== "live") throw new Error("personal_mix_unavailable");
      return new MediaStream([track.clone()]);
    }) : navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const request = captureRequest.then((stream) => {
      const track = stream.getAudioTracks()[0] ?? null;
      stream.getTracks().forEach((candidate) => {
        if (candidate !== track) candidate.stop();
      });
      if (!track || track.readyState !== "live") {
        track?.stop();
        throw new RoomLiveCallServiceError(
          "microphone_unavailable",
          "Le microphone n’a pas pu démarrer. L’appel n’a pas été accepté.",
        );
      }
      contactMicrophoneEndedCleanupRef.current?.();
      contactMicrophoneRef.current = track;
      setContactMicrophoneTrack(track);
      const onEnded = () => {
        if (contactMicrophoneRef.current !== track) return;
        contactMicrophoneEndedCleanupRef.current?.();
        contactMicrophoneEndedCleanupRef.current = null;
        contactMicrophoneRef.current = null;
        setContactMicrophoneTrack(null);
        setError("Le microphone de l’appel s’est arrêté.");
      };
      track.addEventListener("ended", onEnded, { once: true });
      contactMicrophoneEndedCleanupRef.current = () => track.removeEventListener("ended", onEnded);
      return track;
    }).catch((nextError: unknown) => {
      if (nextError instanceof RoomLiveCallServiceError) throw nextError;
      const permissionDenied = nextError instanceof DOMException
        && (nextError.name === "NotAllowedError" || nextError.name === "SecurityError");
      throw new RoomLiveCallServiceError(
        permissionDenied ? "microphone_permission_denied" : "microphone_unavailable",
        permissionDenied
          ? "Autorisation du microphone refusée. L’appel n’a pas été accepté."
          : "Le microphone est indisponible. L’appel n’a pas été accepté.",
      );
    }).finally(() => {
      contactMicrophoneRequestRef.current = null;
    });
    contactMicrophoneRequestRef.current = request;
    return request;
  }, []);

  const setHostVoiceTrack = useCallback((roomId: string, track: MediaStreamTrack | null) => {
    setHostVoiceTracks((current) => {
      const next = new Map(current);
      if (!track || track.kind !== "audio" || track.readyState !== "live") next.delete(roomId);
      else next.set(roomId, track);
      return next;
    });
  }, []);

  const setRegieTalkbackPublicGate = useCallback((
    roomId: string,
    gate: RegieTalkbackPublicGate | null,
  ) => {
    if (gate) regieTalkbackPublicGatesRef.current.set(roomId, gate);
    else regieTalkbackPublicGatesRef.current.delete(roomId);
  }, []);

  const setRegieTalkbackActive = useCallback(async (roomId: string, enabled: boolean) => {
    const intentRevision = (regieTalkbackIntentRevisionRef.current.get(roomId) ?? 0) + 1;
    regieTalkbackIntentRevisionRef.current.set(roomId, intentRevision);
    const targetProfileId = regieContactByRoomRef.current.get(roomId)
      ?? readRegieTalkbackTarget(roomId);
    const invitation = invitationsRef.current.find((item) => (
      item.roomId === roomId
      && item.partyRole === "host"
      && item.status === "accepted"
      && item.callMode === "private"
      && item.contactProfileId === targetProfileId
    ));
    const session = invitation
      ? mediaSessionsByIdRef.current.get(invitation.invitationId)
      : null;
    const gate = regieTalkbackPublicGatesRef.current.get(roomId);

    if (!enabled) {
      // Closing talkback is synchronous at both local media gates. Network
      // acknowledgements are deliberately awaited only after the privacy
      // boundary has already been closed.
      setRegieTalkbackActiveRoomIds((current) => {
        if (!current.has(roomId)) return current;
        const next = new Set(current);
        next.delete(roomId);
        return next;
      });
      if (session) await Promise.resolve(session.setLocalEnabled(false)).catch(() => false);
      try {
        await gate?.restorePublic();
      } catch {
        // The private track is already closed. A failed public restore must
        // never reopen talkback or weaken that privacy boundary.
      }
      return true;
    }

    const ready = Boolean(
      invitation
      && session?.status === "connected"
      && session.peerPresent
      && gate,
    );
    if (!ready || !session || !gate) return false;

    // The public Room microphone is closed first. Only after that boundary is
    // confirmed do we open the private cloned track towards the régisseur.
    const publicClosed = await gate.closePublic();
    if (!publicClosed || regieTalkbackIntentRevisionRef.current.get(roomId) !== intentRevision) return false;
    setRegieTalkbackActiveRoomIds((current) => {
      if (current.has(roomId)) return current;
      const next = new Set(current);
      next.add(roomId);
      return next;
    });
    const privateOpened = await Promise.resolve(session.setLocalEnabled(true)).catch(() => false);
    if (regieTalkbackIntentRevisionRef.current.get(roomId) !== intentRevision) return false;
    if (privateOpened) return true;

    setRegieTalkbackActiveRoomIds((current) => {
      if (!current.has(roomId)) return current;
      const next = new Set(current);
      next.delete(roomId);
      return next;
    });
    await Promise.resolve(session.setLocalEnabled(false)).catch(() => false);
    await gate.restorePublic();
    return false;
  }, []);

  const setRegieContact = useCallback((roomId: string, profileId: string | null) => {
    const normalizedProfileId = profileId?.trim() || null;
    const currentProfileId = regieContactByRoomRef.current.get(roomId)
      ?? readRegieTalkbackTarget(roomId);
    if (currentProfileId !== normalizedProfileId) {
      void setRegieTalkbackActive(roomId, false);
    }
    writeRegieTalkbackTarget(roomId, normalizedProfileId);
    setRegieContactByRoom((current) => {
      if ((current.get(roomId) ?? null) === normalizedProfileId) return current;
      const next = new Map(current);
      if (normalizedProfileId) next.set(roomId, normalizedProfileId);
      else next.delete(roomId);
      return next;
    });
  }, [setRegieTalkbackActive]);

  const setCallProgramPreflight = useCallback((roomId: string, preflight: (() => Promise<boolean>) | null) => {
    if (preflight) hostProgramPreflightRef.current.set(roomId, preflight);
    else hostProgramPreflightRef.current.delete(roomId);
  }, []);

  const publishMediaSession = useCallback((session: RoomLiveCallMediaSession) => {
    setMediaSessionsById((current) => {
      if (sameMediaSession(current.get(session.invitationId), session)) return current;
      const next = new Map(current);
      next.set(session.invitationId, session);
      return next;
    });
  }, []);

  const disposeMediaSession = useCallback((invitationId: string) => {
    setMediaSessionsById((current) => {
      if (!current.has(invitationId)) return current;
      const next = new Map(current);
      next.delete(invitationId);
      return next;
    });
  }, []);

  const requestLiveCallTracked = useCallback(async (request: PlaceLiveCallRequest) => {
    if (authStatus !== "authenticated" || !user?.id) {
      const nextError = new RoomLiveCallServiceError("authentication_required", roomLiveCallErrorMessage("authentication_required"));
      setError(nextError.message);
      throw nextError;
    }

    const profileIds = [...new Set(request.contacts.map((contact) => contact.profileId.trim()).filter(Boolean))];
    if (profileIds.length === 0) {
      const nextError = new RoomLiveCallServiceError("selection_empty", roomLiveCallErrorMessage("selection_empty"));
      setError(nextError.message);
      throw nextError;
    }
    if (profileIds.length > ROOM_LIVE_CALL_MAX_CONTACTS) {
      const nextError = new RoomLiveCallServiceError("selection_too_large", roomLiveCallErrorMessage("selection_too_large"));
      setError(nextError.message);
      throw nextError;
    }

    const now = Date.now();
    for (const [key, retry] of retryRequestsRef.current) {
      if (now - retry.createdAt > RETRY_REQUEST_TTL_MS) retryRequestsRef.current.delete(key);
    }

    const signature = requestSignature(request.roomId, profileIds, request.mode);
    const retry = retryRequestsRef.current.get(signature) ?? {
      clientRequestId: createRoomLiveCallClientRequestId(),
      createdAt: now,
    };
    // Keep one UUID for the complete checkbox selection. If only part of the
    // batch reaches the server, the next click safely replays the same intent.
    retryRequestsRef.current.set(signature, retry);
    setError(null);

    const initialResults = await Promise.allSettled(profileIds.map((profileId) => (
      repository.inviteContact(request.roomId, profileId, retry.clientRequestId, request.mode)
    )));
    const resolvedByProfile = new Map<string, string>();
    initialResults.forEach((result, index) => {
      if (result.status === "fulfilled") resolvedByProfile.set(profileIds[index], result.value.invitationId);
    });

    // A transport error can hide a committed INVITE response. Replay only the
    // failed contact with the exact same server idempotency key: this returns
    // the precise UUID and can never bind the bridge to an older invitation.
    const failedProfiles = profileIds.filter((_, index) => initialResults[index].status === "rejected");
    const replayResults = await Promise.allSettled(failedProfiles.map((profileId) => (
      repository.inviteContact(request.roomId, profileId, retry.clientRequestId, request.mode)
    )));
    replayResults.forEach((result, index) => {
      if (result.status === "fulfilled") resolvedByProfile.set(failedProfiles[index], result.value.invitationId);
    });
    await refreshInternal(false);

    const unresolvedFailure = replayResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (unresolvedFailure) {
      const message = errorMessage(unresolvedFailure.reason);
      setError(message);
      throw unresolvedFailure.reason instanceof Error
        ? unresolvedFailure.reason
        : new RoomLiveCallServiceError("live_call_failed", message);
    }

    const resolvedInvitationIds = [...new Set(resolvedByProfile.values())];
    resolvedInvitationIds.forEach((invitationId) => trackedInvitationIdsRef.current.add(invitationId));
    retryRequestsRef.current.delete(signature);
    setError(null);
    return resolvedInvitationIds;
  }, [authStatus, refreshInternal, repository, user?.id]);

  const requestLiveCall = useCallback(async (request: PlaceLiveCallRequest) => {
    await requestLiveCallTracked(request);
  }, [requestLiveCallTracked]);

  const respond = useCallback(async (invitationId: string, accept: boolean) => {
    const invitation = invitations.find((item) => item.invitationId === invitationId);
    if (!invitation || invitation.partyRole !== "contact" || invitation.status !== "pending") {
      const nextError = new RoomLiveCallServiceError("live_call_invitation_not_found", roomLiveCallErrorMessage("live_call_invitation_not_found"));
      setError(nextError.message);
      throw nextError;
    }

    const kind = accept ? "accept" : "decline";
    setActiveAction({ invitationId, kind });
    setError(null);
    const hadSharedMicrophone = Boolean(
      contactMicrophoneRef.current?.kind === "audio"
      && contactMicrophoneRef.current.readyState === "live",
    );
    let preparedMicrophone: MediaStreamTrack | null = null;
    try {
      // Asking for capture is deliberately inside the click gesture and before
      // the server transition. A denied permission therefore leaves the
      // invitation pending instead of pretending an audio call was accepted.
      if (accept) preparedMicrophone = await ensureContactMicrophone(invitation.roomId);
      const result = await repository.respond(invitationId, accept);
      if (accept && preparedMicrophone) {
        setInvitations((current) => current.map((item) => (
          item.invitationId === invitationId
            ? {
                ...item,
                status: "accepted",
                callMode: result.callMode,
                routeMode: result.routeMode,
                isOnAir: result.isOnAir,
                routeRevision: result.routeRevision,
                sessionExpiresAt: result.sessionExpiresAt,
              }
            : item
        )));
        setContactMicrophoneTrack(preparedMicrophone);
      }
      await refreshInternal(false);
    } catch (nextError) {
      const message = errorMessage(nextError);
      setError(message);
      if (accept && preparedMicrophone && !hadSharedMicrophone
          && !invitations.some((item) => item.partyRole === "contact" && item.status === "accepted")) {
        releaseContactMicrophone();
      }
      await refreshInternal(false);
      throw nextError;
    } finally {
      setActiveAction(null);
    }
  }, [ensureContactMicrophone, invitations, refreshInternal, releaseContactMicrophone, repository]);

  const acceptInvitation = useCallback((invitationId: string) => respond(invitationId, true), [respond]);
  const declineInvitation = useCallback((invitationId: string) => respond(invitationId, false), [respond]);

  const setCallRoute = useCallback(async (invitationId: string, routeMode: RoomLiveCallRoute) => {
    if (routeMode === "preview") {
      // Fail closed before waiting for the server: the public bridge consumer
      // loses this input synchronously even on a slow or failed network.
      setOnAirInvitationIds((current) => {
        if (!current.has(invitationId)) return current;
        const next = new Set(current);
        next.delete(invitationId);
        return next;
      });
      setAudibleOnAirInvitationIds((current) => {
        if (!current.has(invitationId)) return current;
        const next = new Set(current);
        next.delete(invitationId);
        return next;
      });
    }
    const invitation = invitations.find((item) => item.invitationId === invitationId);
    if (!invitation || invitation.partyRole !== "host" || invitation.status !== "accepted") {
      const nextError = new RoomLiveCallServiceError("live_call_not_active", roomLiveCallErrorMessage("live_call_not_active"));
      setError(nextError.message);
      throw nextError;
    }

    setActiveAction({ invitationId, kind: "route" });
    setError(null);
    try {
      const result = await repository.setRoute(invitationId, routeMode, invitation.routeRevision);
      setInvitations((current) => current.map((item) => item.invitationId === invitationId
        ? {
            ...item,
            callMode: result.callMode,
            routeMode: result.routeMode ?? routeMode,
            isOnAir: result.isOnAir,
            routeRevision: result.routeRevision,
          }
        : item));
      await refreshInternal(false);
    } catch (nextError) {
      setError(errorMessage(nextError));
      await refreshInternal(false);
      throw nextError;
    } finally {
      setActiveAction(null);
    }
  }, [invitations, refreshInternal, repository]);

  const confirmCallOnAir = useCallback(async (invitationId: string) => {
    const invitation = invitations.find((item) => item.invitationId === invitationId);
    const media = mediaSessionsById.get(invitationId);
    const ready = invitation?.partyRole === "host"
      && invitation.status === "accepted"
      && invitation.callMode === "public"
      && invitation.routeMode === "public"
      && media?.status === "connected"
      && media.peerPresent
      && !media.remoteMuted
      && media.remoteTrack?.kind === "audio"
      && media.remoteTrack.readyState === "live";
    if (!ready) {
      const nextError = new RoomLiveCallServiceError(
        "live_call_media_not_ready",
        "L’appel doit être connecté et préparé en Public avant le passage à l’antenne.",
      );
      setError(nextError.message);
      throw nextError;
    }
    const preflight = hostProgramPreflightRef.current.get(invitation.roomId);
    if (!preflight || !await preflight()) {
      const nextError = new RoomLiveCallServiceError(
        "live_call_media_not_ready",
        "Le navigateur n’a pas autorisé la sortie audio de l’appel vers l’antenne.",
      );
      setError(nextError.message);
      throw nextError;
    }
    setActiveAction({ invitationId, kind: "on_air" });
    setError(null);
    try {
      // Server authorization is the first public boundary. The local program
      // gate is added only after this CAS succeeds, so an already-published
      // aggregate track cannot leak a newly selected caller while we wait.
      const result = invitation.isOnAir
        ? {
            callMode: invitation.callMode,
            routeMode: invitation.routeMode,
            isOnAir: true,
            routeRevision: invitation.routeRevision,
          }
        : await repository.setOnAir(invitationId, true, invitation.routeRevision);
      if (!result.isOnAir || result.callMode !== "public") {
        throw new RoomLiveCallServiceError(
          "live_call_on_air_not_ready",
          roomLiveCallErrorMessage("live_call_on_air_not_ready"),
        );
      }
      setInvitations((current) => current.map((item) => item.invitationId === invitationId
        ? {
            ...item,
            callMode: result.callMode,
            routeMode: result.routeMode ?? invitation.routeMode,
            isOnAir: true,
            routeRevision: result.routeRevision,
          }
        : item));
      setOnAirInvitationIds((current) => {
        if (current.has(invitationId)) return current;
        const next = new Set(current);
        next.add(invitationId);
        return next;
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
      await refreshInternal(false);
      throw nextError;
    } finally {
      setActiveAction(null);
    }
  }, [invitations, mediaSessionsById, refreshInternal, repository]);

  const takeCallOffAir = useCallback(async (invitationId: string) => {
    setOnAirInvitationIds((current) => {
      if (!current.has(invitationId)) return current;
      const next = new Set(current);
      next.delete(invitationId);
      return next;
    });
    setAudibleOnAirInvitationIds((current) => {
      if (!current.has(invitationId)) return current;
      const next = new Set(current);
      next.delete(invitationId);
      return next;
    });
    await setCallRoute(invitationId, "preview");
  }, [setCallRoute]);

  const authorizeCallProgram = useCallback(async (invitationIds: string[], audible: boolean) => {
    const requestedIds = new Set(invitationIds);
    const targets = invitationsRef.current.filter((invitation) => (
      invitation.partyRole === "host"
      && invitation.status === "accepted"
      && (requestedIds.size > 0 ? requestedIds.has(invitation.invitationId) : !audible && invitation.isOnAir)
    ));
    if (audible && targets.length !== requestedIds.size) {
      return false;
    }
    if (targets.length === 0) {
      return true;
    }
    if (!audible) {
      // Close both local gates before the first await. A slow network or a
      // stale CAS can never leave the caller audible while rollback retries.
      setOnAirInvitationIds((current) => {
        if (requestedIds.size === 0) return current.size > 0 ? new Set() : current;
        const next = new Set(current);
        let changed = false;
        requestedIds.forEach((invitationId) => {
          if (next.delete(invitationId)) changed = true;
        });
        return changed ? next : current;
      });
      setAudibleOnAirInvitationIds((current) => {
        if (requestedIds.size === 0) return current.size > 0 ? new Set() : current;
        const next = new Set(current);
        let changed = false;
        requestedIds.forEach((invitationId) => {
          if (next.delete(invitationId)) changed = true;
        });
        return changed ? next : current;
      });
    }
    if (audible && targets.some((invitation) => (
      invitation.callMode !== "public"
      || invitation.routeMode !== "public"
      || !onAirInvitationIdsRef.current.has(invitation.invitationId)
    ))) return false;

    const committed: Array<{ invitationId: string; revision: number }> = [];
    try {
      for (const invitation of targets) {
        // Re-authorizing `true` is intentional: the RPC rechecks Room, contact,
        // ban/kick and stage state under the shared program lock immediately
        // before the public media gate opens. Disabling an already-off call is
        // idempotent and can be skipped.
        if (!audible && !invitation.isOnAir) continue;
        const result = await repository.setOnAir(
          invitation.invitationId,
          audible,
          invitation.routeRevision,
        );
        committed.push({ invitationId: invitation.invitationId, revision: result.routeRevision });
        setInvitations((current) => current.map((item) => item.invitationId === invitation.invitationId
          ? {
              ...item,
              callMode: result.callMode,
              routeMode: result.routeMode ?? item.routeMode,
              isOnAir: result.isOnAir,
              routeRevision: result.routeRevision,
            }
          : item));
      }
      await refreshInternal(false);
      return true;
    } catch (nextError) {
      if (audible) {
        // If a batch partially committed, revoke every successful member before
        // the caller can keep the aggregate public track open.
        await Promise.all(committed.map(({ invitationId, revision }) => (
          repository.setOnAir(invitationId, false, revision).catch(() => undefined)
        )));
      }
      setError(errorMessage(nextError));
      await refreshInternal(false);
      return false;
    }
  }, [refreshInternal, repository]);

  const setCallProgramAudible = useCallback((invitationIds: string[], audible: boolean) => {
    const targets = new Set(invitationIds);
    setAudibleOnAirInvitationIds((current) => {
      if (!audible && targets.size === 0) return current.size > 0 ? new Set() : current;
      const next = new Set(current);
      let changed = false;
      targets.forEach((invitationId) => {
        if (audible) {
          const authorized = invitationsRef.current.some((invitation) => (
            invitation.invitationId === invitationId
            && invitation.partyRole === "host"
            && invitation.callMode === "public"
            && invitation.routeMode === "public"
            && invitation.isOnAir
          ));
          if (authorized && onAirInvitationIdsRef.current.has(invitationId) && !next.has(invitationId)) {
            next.add(invitationId);
            changed = true;
          }
        } else if (next.delete(invitationId)) changed = true;
      });
      return changed ? next : current;
    });
  }, []);

  const endCall = useCallback(async (invitationId: string) => {
    const invitation = invitationsRef.current.find((item) => item.invitationId === invitationId);
    if (!invitation && !trackedInvitationIdsRef.current.has(invitationId)) {
      const nextError = new RoomLiveCallServiceError(
        "live_call_invitation_not_found",
        roomLiveCallErrorMessage("live_call_invitation_not_found"),
      );
      setError(nextError.message);
      throw nextError;
    }

    setOnAirInvitationIds((current) => {
      if (!current.has(invitationId)) return current;
      const next = new Set(current);
      next.delete(invitationId);
      return next;
    });
    setAudibleOnAirInvitationIds((current) => {
      if (!current.has(invitationId)) return current;
      const next = new Set(current);
      next.delete(invitationId);
      return next;
    });
    // A tracked INVITE response may reach its caller before React commits the
    // refreshed list. Only that explicit UUID bypasses the rendered projection.

    // Hang-up is a local privacy boundary, not a network acknowledgement.
    // The private clone closes synchronously before the RPC; a contact-owned
    // capture is stopped too. A failed RPC may be retried, but media never
    // resumes without the explicit "Reprendre l’appel" action.
    void mediaSessionsById.get(invitationId)?.disconnect();
    if (invitation?.partyRole === "contact") releaseContactMicrophone();

    setActiveAction({ invitationId, kind: "end" });
    setError(null);
    try {
      await repository.end(invitationId);
      trackedInvitationIdsRef.current.delete(invitationId);
      await refreshInternal(false);
    } catch (nextError) {
      setError(errorMessage(nextError));
      await refreshInternal(false);
      throw nextError;
    } finally {
      setActiveAction(null);
    }
  }, [mediaSessionsById, refreshInternal, releaseContactMicrophone, repository]);

  const incomingInvitations = useMemo(() => invitations.filter((invitation) => (
    invitation.partyRole === "contact" && invitation.status === "pending"
  )), [invitations]);
  const outgoingInvitations = useMemo(() => invitations.filter((invitation) => (
    invitation.partyRole === "host"
  )), [invitations]);
  const acceptedInvitations = useMemo(() => invitations.filter((invitation) => (
    invitation.status === "accepted"
  )), [invitations]);
  const acceptedContactCount = useMemo(() => acceptedInvitations.filter((invitation) => (
    invitation.partyRole === "contact"
  )).length, [acceptedInvitations]);
  const acceptedIds = useMemo(() => new Set(acceptedInvitations.map((invitation) => (
    invitation.invitationId
  ))), [acceptedInvitations]);
  const mediaSessions = useMemo(() => [...mediaSessionsById.values()].filter((session) => (
    acceptedIds.has(session.invitationId)
  )), [acceptedIds, mediaSessionsById]);

  useEffect(() => {
    if (acceptedContactCount === 0 && contactMicrophoneRef.current) releaseContactMicrophone();
  }, [acceptedContactCount, releaseContactMicrophone]);

  useEffect(() => {
    setContactPublicProgramRoomIds((current) => {
      const acceptedContactRooms = new Set(acceptedInvitations.flatMap((invitation) => (
        invitation.partyRole === "contact" ? [invitation.roomId] : []
      )));
      const next = new Set([...current].filter((roomId) => acceptedContactRooms.has(roomId)));
      return next.size === current.size ? current : next;
    });
  }, [acceptedInvitations]);

  useEffect(() => {
    setOnAirInvitationIds((current) => {
      let changed = false;
      const next = new Set<string>();
      current.forEach((invitationId) => {
        const invitation = invitations.find((item) => item.invitationId === invitationId);
        const media = mediaSessionsById.get(invitationId);
        const remainsSafe = invitation?.partyRole === "host"
          && invitation.status === "accepted"
          && invitation.callMode === "public"
          && invitation.routeMode === "public"
          && invitation.isOnAir
          && media?.status === "connected"
          && media.peerPresent
          && !media.remoteMuted
          && media.remoteTrack?.kind === "audio"
          && media.remoteTrack.readyState === "live";
        if (remainsSafe) next.add(invitationId);
        else changed = true;
      });
      return changed ? next : current;
    });
  }, [invitations, mediaSessionsById]);

  useEffect(() => {
    setAudibleOnAirInvitationIds((current) => {
      const next = new Set([...current].filter((invitationId) => (
        onAirInvitationIds.has(invitationId)
        && invitations.some((invitation) => invitation.invitationId === invitationId && invitation.isOnAir)
      )));
      return next.size === current.size ? current : next;
    });
  }, [invitations, onAirInvitationIds]);

  useEffect(() => {
    const staleHostBroadcasts = invitations.filter((invitation) => (
      invitation.partyRole === "host"
      && invitation.isOnAir
      && !onAirInvitationIds.has(invitation.invitationId)
    ));
    if (staleHostBroadcasts.length === 0) return;
    let current = true;
    void Promise.all(staleHostBroadcasts.map((invitation) => (
      repository.setOnAir(invitation.invitationId, false, invitation.routeRevision).catch(() => undefined)
    ))).then(() => {
      if (current) scheduleRefresh();
    });
    return () => { current = false; };
  }, [invitations, onAirInvitationIds, repository, scheduleRefresh]);

  useEffect(() => () => {
    releaseContactMicrophone();
  }, [releaseContactMicrophone]);

  const value = useMemo<RoomLiveCallContextValue>(() => ({
    invitations,
    incomingInvitations,
    outgoingInvitations,
    acceptedInvitations,
    loading,
    realtimeStatus,
    errorMessage: error,
    activeAction,
    mediaSessions,
    onAirInvitationIds,
    audibleOnAirInvitationIds,
    contactPublicProgramRoomIds,
    regieTalkbackActiveRoomIds,
    requestLiveCall,
    requestLiveCallTracked,
    acceptInvitation,
    declineInvitation,
    setCallRoute,
    confirmCallOnAir,
    takeCallOffAir,
    authorizeCallProgram,
    setCallProgramAudible,
    setContactPublicProgramActive,
    endCall,
    setHostVoiceTrack,
    setContactMix,
    setContactReturnLevel,
    setCallProgramPreflight,
    setRegieContact,
    setRegieTalkbackPublicGate,
    setRegieTalkbackActive,
    refresh,
  }), [
    acceptInvitation,
    acceptedInvitations,
    activeAction,
    declineInvitation,
    endCall,
    error,
    incomingInvitations,
    invitations,
    loading,
    mediaSessions,
    onAirInvitationIds,
    audibleOnAirInvitationIds,
    contactPublicProgramRoomIds,
    regieTalkbackActiveRoomIds,
    outgoingInvitations,
    realtimeStatus,
    refresh,
    requestLiveCall,
    requestLiveCallTracked,
    confirmCallOnAir,
    authorizeCallProgram,
    setCallRoute,
    setHostVoiceTrack,
    setContactMix,
    setContactReturnLevel,
    setCallProgramPreflight,
    setRegieContact,
    setRegieTalkbackPublicGate,
    setRegieTalkbackActive,
    setContactPublicProgramActive,
    takeCallOffAir,
    setCallProgramAudible,
  ]);

  const visibleIncoming = incomingInvitations[incomingInvitations.length - 1] ?? null;
  const visiblePendingAction = activeAction
    && visibleIncoming
    && activeAction.invitationId === visibleIncoming.invitationId
    && (activeAction.kind === "accept" || activeAction.kind === "decline")
    ? activeAction.kind
    : null;
  return (
    <RoomLiveCallContext.Provider value={value}>
      {children}
      {acceptedInvitations.map((invitation) => {
        const localTrack = invitation.partyRole === "host"
          ? hostVoiceTracks.get(invitation.roomId) ?? null
          : contactMicrophoneTrack;
        const regieProfileId = regieContactByRoom.get(invitation.roomId)
          ?? readRegieTalkbackTarget(invitation.roomId);
        const isRegieTalkback = invitation.partyRole === "host"
          && invitation.callMode === "private"
          && invitation.contactProfileId === regieProfileId;
        return (
          <RoomLiveCallMediaBinding
            key={invitation.invitationId}
            invitation={invitation}
            localTrack={localTrack}
            returnLevel={invitation.partyRole === "contact" ? contactReturnLevels.get(invitation.roomId) ?? 1 : 1}
            remotePlaybackSuppressed={(invitation.partyRole === "contact"
              && contactPublicProgramRoomIds.has(invitation.roomId))
              || (isRegieTalkback && !regieTalkbackActiveRoomIds.has(invitation.roomId))}
            localEnabled={!isRegieTalkback || regieTalkbackActiveRoomIds.has(invitation.roomId)}
            onSnapshot={publishMediaSession}
            onDispose={disposeMediaSession}
            onRequestLocalTrack={invitation.partyRole === "contact" ? ensureContactMicrophone : undefined}
          />
        );
      })}
      <RoomLiveCallIncoming
        invitation={visibleIncoming}
        queuedCount={Math.max(0, incomingInvitations.length - 1)}
        pendingAction={visiblePendingAction}
        errorMessage={visibleIncoming ? error : null}
        onAccept={() => {
          if (visibleIncoming) void acceptInvitation(visibleIncoming.invitationId).catch(() => undefined);
        }}
        onDecline={() => {
          if (visibleIncoming) void declineInvitation(visibleIncoming.invitationId).catch(() => undefined);
        }}
      />
      {acceptedInvitations.length > 0 ? (
        <div className="room-live-call-media-stack" aria-label="Appels en cours">
          {acceptedInvitations.map((invitation) => (
            <RoomLiveCallMediaNotice
              key={`notice:${invitation.invitationId}`}
              invitation={invitation}
              session={mediaSessionsById.get(invitation.invitationId) ?? null}
              ending={activeAction?.invitationId === invitation.invitationId && activeAction.kind === "end"}
              routePending={activeAction?.invitationId === invitation.invitationId
                && (activeAction.kind === "route" || activeAction.kind === "on_air")}
              onAir={invitation.partyRole === "contact"
                ? invitation.isOnAir
                : audibleOnAirInvitationIds.has(invitation.invitationId)}
              onAirPending={invitation.partyRole === "host"
                && onAirInvitationIds.has(invitation.invitationId)
                && !audibleOnAirInvitationIds.has(invitation.invitationId)}
              onPreparePublic={() => { void setCallRoute(invitation.invitationId, "public").catch(() => undefined); }}
              onConfirmOnAir={() => { void confirmCallOnAir(invitation.invitationId).catch(() => undefined); }}
              onTakeOffAir={() => { void takeCallOffAir(invitation.invitationId).catch(() => undefined); }}
              onEnd={() => { void endCall(invitation.invitationId).catch(() => undefined); }}
            />
          ))}
        </div>
      ) : null}
    </RoomLiveCallContext.Provider>
  );
}

export function useRoomLiveCall() {
  const context = useContext(RoomLiveCallContext);
  if (!context) throw new Error("useRoomLiveCall doit être utilisé dans RoomLiveCallProvider.");
  return context;
}

export function useOptionalRoomLiveCall() {
  return useContext(RoomLiveCallContext);
}
