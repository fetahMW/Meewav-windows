import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaceRoomState } from "./place.types";
import type { PlaceProgramLayoutState } from "./placeStageLayoutEngine";
import {
  arePlaceProgramLayoutsEqual,
  createPlaceProgramLayout,
  createPlaceProgramLayoutService,
  getPlaceProgramParticipants,
  sanitizePlaceProgramLayout,
} from "./placeProgramLayout.service";
import type {
  PlaceProgramLayoutController,
  PlaceProgramLayoutRealtimeStatus,
  PlaceProgramLayoutSnapshot,
} from "./placeProgramLayout.types";

type UsePlaceProgramLayoutOptions = {
  room: PlaceRoomState;
  isHost: boolean;
  currentUserId?: string | null;
  onNotice?: (message: string) => void;
};

const PROGRAM_LAYOUT_SYNC_RETRY_DELAYS_MS = [500, 1_500, 3_000] as const;

function isRevisionConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return record.code === "40001"
    || (typeof record.message === "string" && record.message.toLocaleLowerCase().includes("revision conflict"));
}

function isProgramLayoutContractUnavailable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLocaleLowerCase() : "";
  return code === "42P01"
    || code === "42883"
    || code === "PGRST202"
    || message.includes("room_program_layout_v1")
    || message.includes("rooms_set_program_layout_v1");
}

function referencesUnavailableProgramParticipant(snapshot: PlaceProgramLayoutSnapshot, room: PlaceRoomState) {
  const available = new Set(getPlaceProgramParticipants(room).map((participant) => participant.id));
  const referenced = new Set([
    snapshot.layout.primaryParticipantId,
    ...(snapshot.layout.lockedParticipantId ? [snapshot.layout.lockedParticipantId] : []),
    ...snapshot.layout.participantOrder,
    ...Object.keys(snapshot.layout.selectedSourceByParticipant),
    ...Object.keys(snapshot.layout.safeFramingByParticipant ?? {}),
  ]);
  return [...referenced].some((participantId) => !available.has(participantId));
}

export function usePlaceProgramLayout({
  room,
  isHost,
  currentUserId,
  onNotice,
}: UsePlaceProgramLayoutOptions): PlaceProgramLayoutController {
  const service = useMemo(() => createPlaceProgramLayoutService(), []);
  const [programLayout, setProgramLayout] = useState(() => createPlaceProgramLayout(room));
  const [revision, setRevision] = useState(0);
  const [hydrated, setHydrated] = useState(room.source === "demo");
  const [realtimeStatus, setRealtimeStatus] = useState<PlaceProgramLayoutRealtimeStatus>("idle");
  const [authority, setAuthority] = useState<"demo" | "connecting" | "realtime" | "unavailable">(
    room.source === "demo" ? "demo" : "connecting",
  );
  const roomRef = useRef(room);
  const programLayoutRef = useRef(programLayout);
  const isHostRef = useRef(isHost);
  const currentUserIdRef = useRef(currentUserId);
  const noticeRef = useRef(onNotice);
  const revisionRef = useRef(0);
  const persistenceStateRef = useRef<"unknown" | "available" | "unavailable">(
    room.source === "demo" ? "unavailable" : "unknown",
  );
  const pendingLayoutRef = useRef<PlaceProgramLayoutState | null>(null);
  const deferredViewerSnapshotRef = useRef<PlaceProgramLayoutSnapshot | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());

  roomRef.current = room;
  programLayoutRef.current = programLayout;
  isHostRef.current = isHost;
  currentUserIdRef.current = currentUserId;
  noticeRef.current = onNotice;

  const participantSignature = getPlaceProgramParticipants(room)
    .map((participant) => `${participant.id}:${participant.status}`)
    .join("|");

  const applySnapshot = useCallback((snapshot: PlaceProgramLayoutSnapshot) => {
    const deferredRevision = deferredViewerSnapshotRef.current?.revision ?? 0;
    if (snapshot.roomId !== roomRef.current.id || snapshot.revision < Math.max(revisionRef.current, deferredRevision)) return;
    if (referencesUnavailableProgramParticipant(snapshot, roomRef.current)) {
      // Program and public-stage events travel through different Realtime
      // relations. Preserve the authoritative snapshot for every role until
      // the safe public projection contains the promoted guest.
      deferredViewerSnapshotRef.current = snapshot;
      setHydrated(true);
      return;
    }
    deferredViewerSnapshotRef.current = null;
    const layout = sanitizePlaceProgramLayout(snapshot.layout, roomRef.current, {
      updatedBy: snapshot.layout.updatedBy,
      updatedAt: snapshot.layout.updatedAt,
    });
    const pending = pendingLayoutRef.current;
    if (pending && !arePlaceProgramLayoutsEqual(pending, layout)) {
      setHydrated(true);
      return;
    }
    revisionRef.current = snapshot.revision;
    setRevision(snapshot.revision);
    programLayoutRef.current = layout;
    setProgramLayout(layout);
    setHydrated(true);
  }, []);

  const recoverAuthoritativeSnapshot = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (activeRoom.source !== "live") return;
    try {
      const latest = await service.load(activeRoom);
      if (latest) applySnapshot(latest);
    } catch {
      setRealtimeStatus("error");
    }
  }, [applySnapshot, service]);

  const persistLayout = useCallback((proposed: PlaceProgramLayoutState) => {
    const targetRoomId = roomRef.current.id;
    const expectedRevision = revisionRef.current;
    if (persistenceStateRef.current !== "available") {
      return Promise.reject(new Error("La réalisation Realtime n’est pas disponible : aucune modification PROGRAM n’a été appliquée."));
    }
    pendingLayoutRef.current = proposed;
    const operation = writeChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const activeRoom = roomRef.current;
        // A queued operation belongs to the Room in which it was created. It
        // must never be replayed against a Room opened while the write waited.
        if (activeRoom.id !== targetRoomId) return;
        if (!isHostRef.current || activeRoom.source !== "live" || activeRoom.status !== "live") return;
        const hostId = currentUserIdRef.current ?? activeRoom.host.id;
        try {
          const saved = await service.save(activeRoom, expectedRevision, proposed, hostId);
          if (roomRef.current.id !== targetRoomId) return;
          if (pendingLayoutRef.current && arePlaceProgramLayoutsEqual(pendingLayoutRef.current, proposed)) {
            pendingLayoutRef.current = null;
          }
          applySnapshot(saved);
        } catch (error) {
          if (roomRef.current.id !== targetRoomId) return;
          if (isProgramLayoutContractUnavailable(error)) {
            pendingLayoutRef.current = null;
            persistenceStateRef.current = "unavailable";
            setAuthority("unavailable");
            setRealtimeStatus("error");
            setHydrated(true);
            noticeRef.current?.("La réalisation Realtime n’est pas déployée. Les actions PROGRAM sont désactivées.");
            throw error;
          }
          pendingLayoutRef.current = null;
          await recoverAuthoritativeSnapshot();
          setHydrated(true);
          noticeRef.current?.(isRevisionConflict(error)
            ? "La réalisation a changé dans une autre régie. La version la plus récente a été restaurée."
            : "La réalisation n’a pas pu être synchronisée. La dernière version d’antenne a été restaurée.");
          throw error;
        }
      });
    writeChainRef.current = operation;
    return operation;
  }, [applySnapshot, recoverAuthoritativeSnapshot, service]);

  useEffect(() => {
    const fallback = createPlaceProgramLayout(room);
    revisionRef.current = 0;
    setRevision(0);
    programLayoutRef.current = fallback;
    setProgramLayout(fallback);
    setHydrated(room.source === "demo");
    setRealtimeStatus("idle");
    setAuthority(room.source === "demo" ? "demo" : "connecting");
    persistenceStateRef.current = room.source === "demo" ? "unavailable" : "unknown";
    pendingLayoutRef.current = null;
    deferredViewerSnapshotRef.current = null;
    writeChainRef.current = Promise.resolve();

    if (room.source !== "live" || room.status !== "live") return;
    let active = true;
    let synchronizationEpoch = 0;
    let syncRetryTimer: ReturnType<typeof setTimeout> | undefined;
    const synchronizeAfterSubscribe = async (attempt: number, epoch: number) => {
      try {
        const snapshot = await service.load(roomRef.current);
        if (!active || epoch !== synchronizationEpoch) return;
        persistenceStateRef.current = "available";
        setAuthority("realtime");
        setRealtimeStatus("subscribed");
        if (snapshot) {
          applySnapshot(snapshot);
          return;
        }
        // A Realtime INSERT can land after SUBSCRIBED but before this SELECT
        // resolves. Never seed over a revision that was already observed.
        if (revisionRef.current > 0) return;
        if (!isHostRef.current) {
          setHydrated(true);
          return;
        }
        if (pendingLayoutRef.current) return;
        const sanitized = sanitizePlaceProgramLayout(fallback, roomRef.current, {
          updatedBy: currentUserIdRef.current ?? roomRef.current.host.id,
          updatedAt: Date.now(),
        });
        programLayoutRef.current = sanitized;
        setProgramLayout(sanitized);
        void persistLayout(sanitized).catch(() => undefined);
      } catch (error: unknown) {
        if (!active || epoch !== synchronizationEpoch) return;
        if (!isProgramLayoutContractUnavailable(error) && attempt < PROGRAM_LAYOUT_SYNC_RETRY_DELAYS_MS.length) {
          persistenceStateRef.current = "unknown";
          setAuthority("connecting");
          setRealtimeStatus("connecting");
          syncRetryTimer = setTimeout(() => {
            syncRetryTimer = undefined;
            void synchronizeAfterSubscribe(attempt + 1, epoch);
          }, PROGRAM_LAYOUT_SYNC_RETRY_DELAYS_MS[attempt]);
          return;
        }
        persistenceStateRef.current = "unavailable";
        setAuthority("unavailable");
        setHydrated(true);
        setRealtimeStatus("error");
        noticeRef.current?.(isProgramLayoutContractUnavailable(error)
          ? "La réalisation Realtime n’est pas encore déployée. Les actions PROGRAM restent désactivées."
          : "La réalisation Realtime est indisponible. Les actions PROGRAM restent désactivées.");
      }
    };
    const subscription = service.subscribe(
      room.id,
      (snapshot) => {
        if (active) {
          applySnapshot(snapshot);
        }
      },
      (status) => {
        if (!active) return;
        if (syncRetryTimer) {
          clearTimeout(syncRetryTimer);
          syncRetryTimer = undefined;
        }
        setRealtimeStatus(status);
        if (status === "subscribed") {
          const epoch = ++synchronizationEpoch;
          persistenceStateRef.current = "unknown";
          setAuthority("connecting");
          void synchronizeAfterSubscribe(0, epoch);
          return;
        }
        synchronizationEpoch += 1;
        persistenceStateRef.current = "unknown";
        setAuthority(status === "connecting" ? "connecting" : "unavailable");
        if (status !== "connecting") setHydrated(true);
      },
    );

    return () => {
      active = false;
      synchronizationEpoch += 1;
      if (syncRetryTimer) clearTimeout(syncRetryTimer);
      subscription.unsubscribe();
    };
  // A Room identity/source change owns the subscription lifecycle. Participant
  // reconciliation is handled independently below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, room.source, room.status]);

  useEffect(() => {
    const activeRoom = roomRef.current;
    const deferred = deferredViewerSnapshotRef.current;
    if (deferred && !referencesUnavailableProgramParticipant(deferred, activeRoom)) {
      deferredViewerSnapshotRef.current = null;
      applySnapshot(deferred);
      return;
    }
    const current = programLayoutRef.current;
    const reconciled = sanitizePlaceProgramLayout(current, activeRoom, {
      updatedBy: current.updatedBy,
      updatedAt: current.updatedAt,
    });
    if (arePlaceProgramLayoutsEqual(current, reconciled)) return;
    programLayoutRef.current = reconciled;
    setProgramLayout(reconciled);
    if (isHost && activeRoom.source === "live" && activeRoom.status === "live" && hydrated) {
      void persistLayout({
        ...reconciled,
        updatedBy: currentUserId ?? activeRoom.host.id,
        updatedAt: Date.now(),
      }).catch(() => undefined);
    }
  }, [applySnapshot, currentUserId, hydrated, isHost, participantSignature, persistLayout, room.id, room.source, room.status]);

  const updateProgramLayout = useCallback(async (proposed: PlaceProgramLayoutState) => {
    if (!isHostRef.current) return;
    const activeRoom = roomRef.current;
    const next = sanitizePlaceProgramLayout(proposed, activeRoom, {
      updatedBy: currentUserIdRef.current ?? activeRoom.host.id,
      updatedAt: Date.now(),
    });
    if (activeRoom.source === "demo") {
      programLayoutRef.current = next;
      setProgramLayout(next);
      return;
    }
    if (persistenceStateRef.current !== "available") {
      throw new Error("La réalisation Realtime n’est pas disponible. La modification reste en PREVIEW et n’a pas été mise à l’antenne.");
    }
    await persistLayout(next);
  }, [persistLayout]);

  return {
    programLayout,
    revision,
    hydrated,
    realtimeStatus,
    authority,
    canDirectProgram: isHost && hydrated && (room.source === "demo" || (authority === "realtime" && realtimeStatus === "subscribed")),
    updateProgramLayout,
  };
}
