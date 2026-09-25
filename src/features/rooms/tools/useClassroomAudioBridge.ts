import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalRoomLiveCall } from "../live-call/RoomLiveCallProvider";
import type { PlaceLiveCallContact } from "../place/placeLiveCall";
import type { RoomPerson, RoomToolsCommand } from "./roomTools.types";

export type ClassroomAudioPhase = "idle" | "inviting" | "waiting" | "connecting" | "active" | "stopping" | "error" | "unavailable";

type ClassroomAudioIntent = {
  mode: "private" | "public";
  studentId: string;
};

type UseClassroomAudioBridgeOptions = {
  roomId: string;
  source: "demo" | "live";
  authorized?: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  privateStudentId?: string | null;
  publicSpeakerStudentId?: string | null;
};

const TERMINAL_STATUSES = new Set(["declined", "cancelled", "ended", "expired"]);
const PENDING_PHASES: ClassroomAudioPhase[] = ["inviting", "waiting", "connecting"];
const DEFINITIVE_INVITE_REJECTION_CODES = new Set([
  "authentication_required",
  "selection_empty",
  "selection_too_large",
  "invalid_request",
  "infrastructure_unavailable",
  "live_call_host_required",
  "live_call_direct_contact_required",
  "live_call_contact_blocked",
  "live_call_contact_banned",
  "live_call_contact_room_access_revoked",
  "live_call_contact_busy",
  "live_call_contact_onstage",
  "live_call_already_active",
  "live_call_invitation_rate_limit",
  "live_call_host_active_limit",
  "live_call_contact_invitation_limit",
  "live_call_room_capacity",
  "live_call_contact_no_longer_eligible",
  "42501",
]);

function liveCallContact(person: RoomPerson): PlaceLiveCallContact {
  return {
    profileId: person.id,
    conversationId: "",
    displayName: person.name,
    username: null,
    avatarUrl: person.avatarUrl,
    isVerified: false,
  };
}

function readableAudioError(error: unknown) {
  const message = error instanceof Error ? error.message : "class_audio_unavailable";
  if (/authentication/i.test(message)) return "Connectez-vous pour ouvrir ce canal audio.";
  if (/contact|conversation|participant/i.test(message)) return "Cet élève n’est plus disponible dans les 24 places.";
  if (/microphone|media|audio/i.test(message)) return "Le canal audio n’a pas pu être sécurisé.";
  return "La connexion audio n’a pas abouti. Réessayez.";
}

function inviteWasDefinitelyRejected(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && DEFINITIVE_INVITE_REJECTION_CODES.has(code);
}

/**
 * Classe adapter over the canonical two-person Room live-call transport.
 * Private/public UI state is announced only after the media provider confirms
 * the corresponding gates. Every error path closes local media before network
 * teardown and retains a cancellation tombstone when END is ambiguous.
 */
export function useClassroomAudioBridge({
  roomId,
  source,
  authorized = true,
  execute,
  privateStudentId,
  publicSpeakerStudentId,
}: UseClassroomAudioBridgeOptions) {
  const liveCall = useOptionalRoomLiveCall();
  const [intent, setIntent] = useState<ClassroomAudioIntent | null>(null);
  const [phase, setPhase] = useState<ClassroomAudioPhase>(() => source === "live" && !authorized ? "unavailable" : "idle");
  const [error, setError] = useState<string | null>(() => source === "live" && !authorized
    ? "Seul le Host de la Room peut ouvrir un canal audio avec un élève."
    : null);

  const intentRef = useRef<ClassroomAudioIntent | null>(intent);
  const phaseRef = useRef<ClassroomAudioPhase>(phase);
  const liveCallRef = useRef(liveCall);
  const executeRef = useRef(execute);
  const boundInvitationIdRef = useRef<string | null>(null);
  const publishedSpeakerRef = useRef<string | null>(null);
  const ambiguousRequestRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const processingRef = useRef<string | null>(null);
  const cleanupRef = useRef<string | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const locallyEndedInvitationIdsRef = useRef(new Set<string>());
  const demoHydratedRef = useRef(false);

  intentRef.current = intent;
  phaseRef.current = phase;
  liveCallRef.current = liveCall;
  executeRef.current = execute;

  const clearIntent = useCallback((nextPhase: ClassroomAudioPhase, nextError: string | null) => {
    boundInvitationIdRef.current = null;
    ambiguousRequestRef.current = false;
    cancelRequestedRef.current = false;
    processingRef.current = null;
    intentRef.current = null;
    setIntent(null);
    setError(nextError);
    setPhase(nextPhase);
  }, []);

  const candidates = intent && liveCall
    ? liveCall.invitations
      .filter((invitation) => invitation.roomId === roomId
        && invitation.partyRole === "host"
        && invitation.contactProfileId === intent.studentId
        && invitation.callMode === intent.mode)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];
  const matchingInvitation = candidates.find((invitation) => !TERMINAL_STATUSES.has(invitation.status))
    ?? candidates.find((invitation) => invitation.invitationId === boundInvitationIdRef.current)
    ?? null;

  const stop = useCallback(async () => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    const operation = Promise.resolve().then(async () => {
      const currentIntent = intentRef.current;
      const phaseBeforeStop = phaseRef.current;
      cancelRequestedRef.current = Boolean(currentIntent);
      setError(null);
      setPhase(currentIntent ? "stopping" : "idle");

      if (source === "demo") {
        if (currentIntent?.mode === "private") await execute({ type: "classe.private", personId: null });
        if (currentIntent?.mode === "public") await execute({ type: "classe.speaker", personId: null });
        publishedSpeakerRef.current = null;
        clearIntent("idle", null);
        return;
      }

      const context = liveCallRef.current;
      if (!context) {
        clearIntent("unavailable", "Le transport audio privé n’est pas disponible dans cette session.");
        return;
      }

      await context.setRegieTalkbackActive(roomId, false).catch(() => false);
      const invitation = currentIntent
        ? context.invitations.find((item) => item.invitationId === boundInvitationIdRef.current)
          ?? context.invitations.find((item) => item.roomId === roomId
            && item.partyRole === "host"
            && item.contactProfileId === currentIntent.studentId
            && item.callMode === currentIntent.mode
            && !TERMINAL_STATUSES.has(item.status))
        : null;
      const invitationId = invitation?.invitationId ?? boundInvitationIdRef.current;
      const session = invitationId ? context.mediaSessions.find((item) => item.invitationId === invitationId) : null;
      if (session) await session.disconnect().catch(() => undefined);
      if (currentIntent?.mode === "public" && invitationId) {
        await context.takeCallOffAir(invitationId).catch(() => undefined);
      }

      const endConfirmed = invitationId
        ? await context.endCall(invitationId).then(() => true, () => false)
        : false;
      if (invitationId && endConfirmed) locallyEndedInvitationIdsRef.current.add(invitationId);
      const requestMayExist = Boolean(currentIntent)
        && !invitationId
        && (ambiguousRequestRef.current || PENDING_PHASES.includes(phaseBeforeStop));
      if (currentIntent && ((!invitationId && requestMayExist) || (invitationId && !endConfirmed))) {
        cancelRequestedRef.current = true;
        setError("Le canal reste fermé par sécurité. Réessayez de le terminer.");
        setPhase("error");
        return;
      }

      context.setRegieContact(roomId, null);
      if (currentIntent?.mode === "public") {
        try {
          await execute({ type: "classe.speaker", personId: null });
        } catch (commitError) {
          publishedSpeakerRef.current = null;
          clearIntent("error", "La parole est coupée, mais la mise en écoute n’a pas été confirmée. Réessayez.");
          throw commitError;
        }
        publishedSpeakerRef.current = null;
      }
      clearIntent("idle", null);
    });
    stopPromiseRef.current = operation;
    try {
      await operation;
    } finally {
      if (stopPromiseRef.current === operation) stopPromiseRef.current = null;
    }
  }, [clearIntent, execute, roomId, source]);

  const start = useCallback(async (mode: "private" | "public", person: RoomPerson) => {
    if (source === "live" && !authorized) {
      setPhase("unavailable");
      setError("Seul le Host de la Room peut ouvrir un canal audio avec un élève.");
      return;
    }
    if (intentRef.current) {
      await stop();
      if (intentRef.current) return;
    }

    const nextIntent = { mode, studentId: person.id };
    intentRef.current = nextIntent;
    setIntent(nextIntent);
    setError(null);
    boundInvitationIdRef.current = null;
    ambiguousRequestRef.current = true;
    cancelRequestedRef.current = false;

    if (source === "demo") {
      setPhase("connecting");
      await execute(mode === "private"
        ? { type: "classe.private", personId: person.id }
        : { type: "classe.speaker", personId: person.id });
      if (mode === "public") publishedSpeakerRef.current = person.id;
      ambiguousRequestRef.current = false;
      setPhase("active");
      return;
    }

    if (!liveCall) {
      ambiguousRequestRef.current = false;
      setPhase("unavailable");
      setError("Le transport audio privé n’est pas disponible dans cette session.");
      return;
    }

    try {
      setPhase("inviting");
      if (mode === "private") liveCall.setRegieContact(roomId, person.id);
      const invitationIds = await liveCall.requestLiveCallTracked({
        roomId,
        contacts: [liveCallContact(person)],
        mode,
      });
      boundInvitationIdRef.current = invitationIds[0] ?? null;
      ambiguousRequestRef.current = false;
      setPhase("waiting");
    } catch (requestError) {
      const rejected = inviteWasDefinitelyRejected(requestError);
      ambiguousRequestRef.current = !rejected;
      if (mode === "private") {
        await liveCall.setRegieTalkbackActive(roomId, false).catch(() => false);
        if (rejected) liveCall.setRegieContact(roomId, null);
      }
      setError(readableAudioError(requestError));
      setPhase("error");
    }
  }, [authorized, execute, liveCall, roomId, source, stop]);

  const startPrivate = useCallback((person: RoomPerson) => start("private", person), [start]);
  const startPublic = useCallback((person: RoomPerson) => start("public", person), [start]);

  useEffect(() => {
    if (source !== "live" || authorized) return;
    if (!intentRef.current) {
      setPhase("unavailable");
      setError("Seul le Host de la Room peut ouvrir un canal audio avec un élève.");
      return;
    }
    void stop().finally(() => {
      setPhase("unavailable");
      setError("Le canal audio a été fermé car les droits Host ne sont plus actifs.");
    }).catch(() => undefined);
  }, [authorized, source, stop]);

  useEffect(() => {
    if (source !== "demo" || demoHydratedRef.current || !privateStudentId || intentRef.current) return;
    demoHydratedRef.current = true;
    const demoIntent = { mode: "private" as const, studentId: privateStudentId };
    intentRef.current = demoIntent;
    setIntent(demoIntent);
    setPhase("active");
  }, [privateStudentId, source]);

  useEffect(() => {
    if (source !== "live" || !authorized || !liveCall || intentRef.current) return;
    const targets: ClassroomAudioIntent[] = [];
    if (privateStudentId) targets.push({ mode: "private", studentId: privateStudentId });
    if (publicSpeakerStudentId) targets.push({ mode: "public", studentId: publicSpeakerStudentId });
    const projectedCandidates = targets.flatMap((target) => liveCall.invitations
        .filter((invitation) => invitation.roomId === roomId
          && !locallyEndedInvitationIdsRef.current.has(invitation.invitationId)
          && invitation.partyRole === "host"
          && invitation.contactProfileId === target.studentId
          && invitation.callMode === target.mode
          && (invitation.status === "pending" || invitation.status === "accepted"))
        .map((invitation) => ({ target, invitation })));
    const unprojectedPublicCandidates = liveCall.invitations
      .filter((invitation) => invitation.roomId === roomId
        && !locallyEndedInvitationIdsRef.current.has(invitation.invitationId)
        && invitation.partyRole === "host"
        && invitation.callMode === "public"
        && (invitation.status === "pending" || invitation.status === "accepted"))
      .map((invitation) => ({
        target: { mode: "public" as const, studentId: invitation.contactProfileId },
        invitation,
      }));
    const restored = [...projectedCandidates, ...unprojectedPublicCandidates]
      .sort((a, b) => new Date(b.invitation.createdAt).getTime() - new Date(a.invitation.createdAt).getTime())[0];
    if (!restored) return;
    intentRef.current = restored.target;
    boundInvitationIdRef.current = restored.invitation.invitationId;
    ambiguousRequestRef.current = false;
    cancelRequestedRef.current = false;
    if (restored.target.mode === "private") liveCall.setRegieContact(roomId, restored.target.studentId);
    setIntent(restored.target);
    setError(null);
    setPhase(restored.invitation.status === "pending" ? "waiting" : "connecting");
  }, [authorized, liveCall, privateStudentId, publicSpeakerStudentId, roomId, source]);

  useEffect(() => {
    if (source !== "live" || !intent || !liveCall) return;
    if (stopPromiseRef.current) return;
    const invitation = matchingInvitation;
    if (!invitation) {
      const missingId = boundInvitationIdRef.current;
      if (!missingId) {
        setPhase((current) => current === "error" || current === "unavailable" || current === "inviting" ? current : "waiting");
        return;
      }
      if (cleanupRef.current === missingId) return;
      cleanupRef.current = missingId;
      const wasCancellation = cancelRequestedRef.current;
      void (async () => {
        await liveCall.setRegieTalkbackActive(roomId, false).catch(() => false);
        if (intent.mode === "private") liveCall.setRegieContact(roomId, null);
        if (intent.mode === "public") {
          await execute({ type: "classe.speaker", personId: null }).catch(() => undefined);
          publishedSpeakerRef.current = null;
        }
        clearIntent(wasCancellation ? "idle" : "error", wasCancellation ? null : "L’élève a quitté le canal audio.");
        cleanupRef.current = null;
      })();
      return;
    }

    boundInvitationIdRef.current = invitation.invitationId;
    const session = liveCall.mediaSessions.find((item) => item.invitationId === invitation.invitationId);

    if (cancelRequestedRef.current) {
      if (cleanupRef.current === invitation.invitationId) return;
      cleanupRef.current = invitation.invitationId;
      void (async () => {
        await liveCall.setRegieTalkbackActive(roomId, false).catch(() => false);
        if (session) await session.disconnect().catch(() => undefined);
        if (intent.mode === "public") await liveCall.takeCallOffAir(invitation.invitationId).catch(() => undefined);
        const ended = await liveCall.endCall(invitation.invitationId).then(() => true, () => false);
        if (ended) {
          locallyEndedInvitationIdsRef.current.add(invitation.invitationId);
          if (intent.mode === "private") liveCall.setRegieContact(roomId, null);
          if (intent.mode === "public") {
            await execute({ type: "classe.speaker", personId: null }).catch(() => undefined);
            publishedSpeakerRef.current = null;
          }
          clearIntent("idle", null);
        } else {
          setError("Le canal reste fermé par sécurité. Réessayez de le terminer.");
          setPhase("error");
        }
        cleanupRef.current = null;
      })();
      return;
    }

    if (invitation.status === "pending") {
      setPhase("waiting");
      return;
    }
    if (invitation.status !== "accepted") {
      if (cleanupRef.current === invitation.invitationId) return;
      cleanupRef.current = invitation.invitationId;
      void (async () => {
        await liveCall.setRegieTalkbackActive(roomId, false).catch(() => false);
        if (intent.mode === "private") liveCall.setRegieContact(roomId, null);
        if (intent.mode === "public") {
          await liveCall.takeCallOffAir(invitation.invitationId).catch(() => undefined);
          await execute({ type: "classe.speaker", personId: null }).catch(() => undefined);
          publishedSpeakerRef.current = null;
        }
        clearIntent("error", "L’élève n’a pas rejoint le canal audio.");
        cleanupRef.current = null;
      })();
      return;
    }

    const key = [
      intent.mode,
      invitation.invitationId,
      invitation.routeRevision,
      invitation.isOnAir,
      session?.status ?? "none",
      session?.peerPresent ?? false,
      session?.remoteTrack?.readyState ?? "none",
      session?.remoteMuted ?? true,
      session?.remotePlaybackSuppressed ?? true,
      session?.localAudible ?? false,
      liveCall.regieTalkbackActiveRoomIds.has(roomId),
      liveCall.audibleOnAirInvitationIds.has(invitation.invitationId),
    ].join(":");
    if (processingRef.current === key) return;
    processingRef.current = key;

    void (async () => {
      try {
        if (session?.status !== "connected" || !session.peerPresent) {
          setPhase("connecting");
          return;
        }
        if (intent.mode === "private") {
          const remoteReady = session.remoteTrack?.kind === "audio"
            && session.remoteTrack.readyState === "live"
            && !session.remoteMuted;
          const gateActive = liveCall.regieTalkbackActiveRoomIds.has(roomId);
          if (!remoteReady) {
            if (gateActive) throw new Error("class_private_peer_audio_lost");
            setPhase("connecting");
            return;
          }
          if (gateActive) {
            if (session.remotePlaybackSuppressed || !session.localAudible) {
              setPhase("connecting");
              return;
            }
            setPhase("active");
            return;
          }
          setPhase("connecting");
          const secured = await liveCall.setRegieTalkbackActive(roomId, true);
          if (!secured) throw new Error("class_private_gate_failed");
          return;
        }

        setPhase("connecting");
        if (invitation.routeMode !== "public") {
          await liveCall.setCallRoute(invitation.invitationId, "public");
          return;
        }
        if (!invitation.isOnAir) {
          await liveCall.confirmCallOnAir(invitation.invitationId);
          return;
        }
        if (!liveCall.onAirInvitationIds.has(invitation.invitationId)
          || !liveCall.audibleOnAirInvitationIds.has(invitation.invitationId)) return;
        if (publishedSpeakerRef.current !== intent.studentId) {
          await execute({ type: "classe.speaker", personId: intent.studentId });
          publishedSpeakerRef.current = intent.studentId;
        }
        setPhase("active");
      } catch (activationError) {
        cancelRequestedRef.current = true;
        cleanupRef.current = invitation.invitationId;
        await liveCall.setRegieTalkbackActive(roomId, false).catch(() => false);
        if (session) await session.disconnect().catch(() => undefined);
        if (intent.mode === "public") {
          await liveCall.takeCallOffAir(invitation.invitationId).catch(() => undefined);
          // The speaker mutation may have reached the server even when its
          // following projection refresh rejected. Always compensate it.
          await execute({ type: "classe.speaker", personId: null }).catch(() => undefined);
          publishedSpeakerRef.current = null;
        }
        const ended = await liveCall.endCall(invitation.invitationId).then(() => true, () => false);
        if (ended) locallyEndedInvitationIdsRef.current.add(invitation.invitationId);
        cancelRequestedRef.current = !ended;
        if (ended) {
          if (intent.mode === "private") liveCall.setRegieContact(roomId, null);
          clearIntent("error", readableAudioError(activationError));
        } else {
          setError(readableAudioError(activationError));
          setPhase("error");
        }
        cleanupRef.current = null;
      } finally {
        processingRef.current = null;
      }
    })();
  }, [clearIntent, execute, intent, liveCall, matchingInvitation, publicSpeakerStudentId, roomId, source]);

  useEffect(() => () => {
    const context = liveCallRef.current;
    const currentIntent = intentRef.current;
    if (!context || !currentIntent) return;
    cancelRequestedRef.current = true;
    void (async () => {
      await context.setRegieTalkbackActive(roomId, false).catch(() => false);
      const invitation = context.invitations.find((item) => item.invitationId === boundInvitationIdRef.current)
        ?? context.invitations.find((item) => item.roomId === roomId
          && item.partyRole === "host"
          && item.contactProfileId === currentIntent.studentId
          && item.callMode === currentIntent.mode
          && !TERMINAL_STATUSES.has(item.status));
      const invitationId = invitation?.invitationId ?? boundInvitationIdRef.current;
      const session = invitationId ? context.mediaSessions.find((item) => item.invitationId === invitationId) : null;
      if (session) await session.disconnect().catch(() => undefined);
      if (currentIntent.mode === "public" && invitationId) {
        await context.takeCallOffAir(invitationId).catch(() => undefined);
      }
      const ended = invitationId
        ? await context.endCall(invitationId).then(() => true, () => false)
        : false;
      if (currentIntent.mode === "private" && ended) context.setRegieContact(roomId, null);
      if (currentIntent.mode === "public") {
        await executeRef.current({ type: "classe.speaker", personId: null }).catch(() => undefined);
        publishedSpeakerRef.current = null;
      }
    })();
  }, [roomId]);

  return {
    mode: intent?.mode ?? null,
    studentId: intent?.studentId ?? null,
    phase,
    error,
    startPrivate,
    startPublic,
    stop,
  };
}
