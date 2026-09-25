import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AudioEngineLoopbackClient } from "./audioEngine.client";
import { AudioEngineContext, type AudioEngineContextValue } from "./AudioEngineContext";
import { NativeAudioEngineMetersStream } from "./audioEngine.meters";
import {
  INITIAL_AUDIO_ENGINE_STATE,
  type AudioEngineChain,
  type AudioEngineHealth,
  type AudioEnginePairingTicketProvider,
  type AudioEngineState,
} from "./audioEngine.types";
import { parseAudioEnginePairingTicket } from "./audioEngine.validators";
import { checkAudioEngineCompatibility } from "./audioEngine.version";

export type AudioEngineProviderProps = {
  children: ReactNode;
  /** The authenticated Room identity bound into the backend pairing ticket. */
  roomId?: string;
  /** Calls MeeWav's authenticated backend; never a loopback or anonymous endpoint. */
  pairingTicketProvider?: AudioEnginePairingTicketProvider;
  clientFactory?: () => AudioEngineLoopbackClient;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "MeeWav Audio Engine est indisponible.";
}

const NATIVE_HANDOFF_RECOVERY_REASON = "La piste audio native de cette Room n’est plus publiée. Le microphone navigateur reste coupé jusqu’à ton choix.";

function hasNativeRoomPublication(health: AudioEngineHealth, roomId?: string) {
  return Boolean(
    roomId
    && health.audioPlane === "room_ready"
    && health.roomPublication.status === "published"
    && health.roomPublication.publisher === "native_webrtc"
    && health.roomPublication.roomId === roomId
    && health.roomPublication.trackId,
  );
}

export function AudioEngineProvider({
  children,
  roomId,
  pairingTicketProvider,
  clientFactory,
}: AudioEngineProviderProps) {
  const [state, setState] = useState<AudioEngineState>(INITIAL_AUDIO_ENGINE_STATE);
  const clientRef = useRef<AudioEngineLoopbackClient | null>(null);
  const meterStreamRef = useRef<NativeAudioEngineMetersStream | null>(null);
  const meterUnsubscribersRef = useRef<Array<() => void>>([]);
  const clientShutdownsRef = useRef(new WeakMap<AudioEngineLoopbackClient, Promise<void>>());
  const shutdownQueueRef = useRef<Promise<void>>(Promise.resolve());
  const operationRef = useRef(0);
  const previousRoomIdRef = useRef(roomId);
  const consecutiveHealthFailuresRef = useRef(0);
  const nativeRoomHandoffEstablishedRef = useRef(false);
  const nativeHandoffRecoveryRequiredRef = useRef(false);

  const requireNativeHandoffRecovery = useCallback(() => {
    if (!nativeRoomHandoffEstablishedRef.current && !nativeHandoffRecoveryRequiredRef.current) return false;
    nativeHandoffRecoveryRequiredRef.current = true;
    return true;
  }, []);

  const registerPublicationSnapshot = useCallback((health: AudioEngineHealth) => {
    if (hasNativeRoomPublication(health, roomId)) {
      nativeRoomHandoffEstablishedRef.current = true;
      nativeHandoffRecoveryRequiredRef.current = false;
      return true;
    }
    requireNativeHandoffRecovery();
    return false;
  }, [requireNativeHandoffRecovery, roomId]);

  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = clientFactory?.() ?? new AudioEngineLoopbackClient();
    return clientRef.current;
  }, [clientFactory]);

  const stopMeters = useCallback(() => {
    meterUnsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
    meterUnsubscribersRef.current = [];
    meterStreamRef.current?.stop();
    meterStreamRef.current = null;
  }, []);

  const detachClient = useCallback((expected?: AudioEngineLoopbackClient) => {
    const client = clientRef.current;
    if (!client || (expected && client !== expected)) return null;
    clientRef.current = null;
    return client;
  }, []);

  /**
   * Native monitoring must stop before a session is retired. Both calls are
   * best-effort because a crashed helper is precisely one of the teardown
   * cases. Raw browser audio is never activated from this path.
   */
  const shutdownClient = useCallback((client: AudioEngineLoopbackClient | null) => {
    if (!client) return Promise.resolve();
    const existing = clientShutdownsRef.current.get(client);
    if (existing) return existing;
    const shutdown = (async () => {
      if (client.hasAuthenticatedSession) {
        try {
          await client.setMonitoring({ enabled: false });
        } catch {
          // The helper may already be unavailable; still attempt session close.
        }
        try {
          await client.closeSession();
        } catch {
          // Session expiry/crash is an acceptable best-effort shutdown outcome.
        }
      }
      client.dispose();
    })();
    clientShutdownsRef.current.set(client, shutdown);
    return shutdown;
  }, []);

  const queueShutdown = useCallback((client: AudioEngineLoopbackClient | null) => {
    const queued = shutdownQueueRef.current.then(() => shutdownClient(client));
    shutdownQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, [shutdownClient]);

  const retireClient = useCallback(async (client: AudioEngineLoopbackClient | null) => {
    if (client && clientRef.current === client) {
      stopMeters();
      detachClient(client);
    }
    await queueShutdown(client);
  }, [detachClient, queueShutdown, stopMeters]);

  const retireCurrentClient = useCallback(async () => {
    stopMeters();
    await queueShutdown(detachClient());
  }, [detachClient, queueShutdown, stopMeters]);

  const startMeters = useCallback((client: AudioEngineLoopbackClient) => {
    stopMeters();
    const stream = new NativeAudioEngineMetersStream(client);
    meterStreamRef.current = stream;
    meterUnsubscribersRef.current = [
      stream.subscribe((meterFrame) => setState((current) => (
        clientRef.current === client && current.transport === "native" ? { ...current, meterFrame } : current
      ))),
      stream.subscribeStatus((metersStatus, meterError) => setState((current) => (
        clientRef.current === client && current.transport === "native"
          ? { ...current, metersStatus, error: meterError && current.status === "connected" ? meterError : current.error }
          : current
      ))),
    ];
    stream.start();
  }, [stopMeters]);

  const connectSnapshot = useCallback(async (
    client: AudioEngineLoopbackClient,
    endpoint: string,
    health: AudioEngineHealth,
    operation: number,
  ) => {
    const compatibility = checkAudioEngineCompatibility(health);
    if (!compatibility.compatible) {
      const recoveryRequired = requireNativeHandoffRecovery();
      if (operation === operationRef.current) {
        setState((current) => ({
          ...current,
          status: "incompatible",
          transport: "native",
          endpoint,
          health,
          compatibility,
          error: compatibility.reason,
          fallbackReason: recoveryRequired
            ? current.fallbackReason ?? NATIVE_HANDOFF_RECOVERY_REASON
            : null,
          metersStatus: "idle",
        }));
      }
      return false;
    }

    if (operation === operationRef.current) {
      setState((current) => ({
        ...current,
        status: "connecting",
        transport: "native",
        endpoint,
        health,
        compatibility,
        error: null,
      }));
    }
    const [devices, plugins, chain] = await Promise.all([
      client.getDevices(),
      client.getPlugins(),
      client.getChain(),
    ]);
    if (operation !== operationRef.current || clientRef.current !== client) return false;
    const publicationReady = registerPublicationSnapshot(health);
    const recoveryRequired = nativeHandoffRecoveryRequiredRef.current;
    setState((current) => ({
      status: "connected",
      transport: "native",
      endpoint,
      health,
      compatibility,
      devices,
      plugins,
      chain,
      monitoring: current.endpoint === endpoint ? current.monitoring : null,
      meterFrame: null,
      metersStatus: "connecting",
      error: null,
      lastConnectedAt: new Date().toISOString(),
      fallbackReason: publicationReady
        ? null
        : recoveryRequired
          ? current.fallbackReason ?? NATIVE_HANDOFF_RECOVERY_REASON
          : null,
    }));
    startMeters(client);
    return true;
  }, [registerPublicationSnapshot, requireNativeHandoffRecovery, startMeters]);

  const setUnavailable = useCallback((error: unknown, operation: number) => {
    if (operation !== operationRef.current) return;
    const recoveryRequired = requireNativeHandoffRecovery();
    setState({
      ...INITIAL_AUDIO_ENGINE_STATE,
      status: "unavailable",
      error: errorMessage(error),
      fallbackReason: recoveryRequired ? NATIVE_HANDOFF_RECOVERY_REASON : null,
    });
  }, [requireNativeHandoffRecovery]);

  const detect = useCallback(async () => {
    const operation = ++operationRef.current;
    stopMeters();
    const client = clientRef.current;
    if (!client?.hasAuthenticatedSession || !client.connectedEndpoint) {
      setUnavailable(new Error("Associe d’abord MeeWav Audio Engine depuis une Room. Aucun service local n’est sondé anonymement."), operation);
      return false;
    }
    const recoveryRequired = requireNativeHandoffRecovery();
    setState((current) => ({
      ...current,
      status: "detecting",
      transport: "native",
      error: null,
      fallbackReason: recoveryRequired
        ? current.fallbackReason ?? NATIVE_HANDOFF_RECOVERY_REASON
        : null,
    }));
    try {
      const health = await client.getHealth();
      const connected = await connectSnapshot(client, client.connectedEndpoint, health, operation);
      if (!connected && operation === operationRef.current) await retireClient(client);
      return connected;
    } catch (error) {
      await retireClient(client);
      setUnavailable(error, operation);
      return false;
    }
  }, [connectSnapshot, requireNativeHandoffRecovery, retireClient, setUnavailable, stopMeters]);

  const launchAndPair = useCallback(async () => {
    const operation = ++operationRef.current;
    const recoveryRequired = requireNativeHandoffRecovery();
    setState((current) => ({
      ...INITIAL_AUDIO_ENGINE_STATE,
      status: "pairing",
      fallbackReason: recoveryRequired
        ? current.fallbackReason ?? NATIVE_HANDOFF_RECOVERY_REASON
        : null,
    }));
    await retireCurrentClient();
    if (operation !== operationRef.current) return false;
    if (!roomId || !pairingTicketProvider) {
      setUnavailable(new Error("Association refusée : la Room et le fournisseur de ticket backend authentifié sont requis."), operation);
      return false;
    }

    let client: AudioEngineLoopbackClient | null = null;
    try {
      client = getClient();
      const pairingContext = client.getPairingContext();
      const ticket = parseAudioEnginePairingTicket(await pairingTicketProvider(roomId, pairingContext));
      if (operation !== operationRef.current || clientRef.current !== client) {
        await retireClient(client);
        return false;
      }
      // Only the custom protocol receives the one-use bearer. Fixed loopback
      // probes carry pairingId + browser nonce, never the token itself.
      client.launchPairing(ticket);
      const { endpoint, health } = await client.completePairing(ticket);
      const connected = await connectSnapshot(client, endpoint, health, operation);
      if (!connected && operation === operationRef.current) await retireClient(client);
      return connected;
    } catch (error) {
      await retireClient(client);
      setUnavailable(error, operation);
      return false;
    }
  }, [connectSnapshot, getClient, pairingTicketProvider, requireNativeHandoffRecovery, retireClient, retireCurrentClient, roomId, setUnavailable]);

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.hasAuthenticatedSession || !client.connectedEndpoint) return detect();
    const operation = ++operationRef.current;
    stopMeters();
    const recoveryRequired = requireNativeHandoffRecovery();
    setState((current) => ({
      ...current,
      status: "connecting",
      error: null,
      fallbackReason: recoveryRequired
        ? current.fallbackReason ?? NATIVE_HANDOFF_RECOVERY_REASON
        : null,
    }));
    try {
      const health = await client.getHealth();
      const connected = await connectSnapshot(client, client.connectedEndpoint, health, operation);
      if (!connected && operation === operationRef.current) await retireClient(client);
      return connected;
    } catch (error) {
      await retireClient(client);
      if (operation === operationRef.current) {
        const recoveryRequired = requireNativeHandoffRecovery();
        setState({
          ...INITIAL_AUDIO_ENGINE_STATE,
          status: "error",
          error: errorMessage(error),
          fallbackReason: recoveryRequired ? NATIVE_HANDOFF_RECOVERY_REASON : null,
        });
      }
      return false;
    }
  }, [connectSnapshot, detect, requireNativeHandoffRecovery, retireClient, stopMeters]);

  const disconnect = useCallback(async () => {
    const operation = ++operationRef.current;
    const recoveryRequired = requireNativeHandoffRecovery();
    await retireCurrentClient();
    if (operation === operationRef.current) {
      setState(recoveryRequired
        ? {
          ...INITIAL_AUDIO_ENGINE_STATE,
          status: "unavailable",
          error: "Le moteur audio natif a été déconnecté.",
          fallbackReason: NATIVE_HANDOFF_RECOVERY_REASON,
        }
        : INITIAL_AUDIO_ENGINE_STATE);
    }
  }, [requireNativeHandoffRecovery, retireCurrentClient]);

  const useWebAudioFallback = useCallback(async (reason = "Moteur desktop non sélectionné.") => {
    const operation = ++operationRef.current;
    await retireCurrentClient();
    if (operation !== operationRef.current) return;
    nativeRoomHandoffEstablishedRef.current = false;
    nativeHandoffRecoveryRequiredRef.current = false;
    setState({
      ...INITIAL_AUDIO_ENGINE_STATE,
      status: "fallback",
      transport: "web_audio",
      fallbackReason: reason,
    });
  }, [retireCurrentClient]);

  const updateChain = useCallback(async (chain: AudioEngineChain) => {
    const client = clientRef.current;
    if (!client?.hasAuthenticatedSession || state.status !== "connected" || state.transport !== "native") {
      throw new Error("Le moteur audio natif n’est pas connecté.");
    }
    const updated = await client.updateChain(chain);
    setState((current) => (
      clientRef.current === client && current.status === "connected" && current.transport === "native"
        ? { ...current, chain: updated }
        : current
    ));
    return updated;
  }, [state.status, state.transport]);

  const setMonitoring = useCallback(async (enabled: boolean, options?: { outputDeviceId?: string | null; gain?: number }) => {
    const client = clientRef.current;
    if (!client?.hasAuthenticatedSession || state.status !== "connected" || state.transport !== "native") {
      throw new Error("Le moteur audio natif n’est pas connecté.");
    }
    try {
      const monitoring = await client.setMonitoring({ enabled, ...options });
      setState((current) => (
        clientRef.current === client && current.status === "connected" && current.transport === "native"
          ? { ...current, monitoring, error: null }
          : current
      ));
    } catch (error) {
      setState((current) => (
        clientRef.current === client ? { ...current, error: errorMessage(error) } : current
      ));
      throw error;
    }
  }, [state.status, state.transport]);

  useEffect(() => {
    if (previousRoomIdRef.current === roomId) return;
    previousRoomIdRef.current = roomId;
    nativeRoomHandoffEstablishedRef.current = false;
    nativeHandoffRecoveryRequiredRef.current = false;
    ++operationRef.current;
    stopMeters();
    const client = detachClient();
    setState(INITIAL_AUDIO_ENGINE_STATE);
    void queueShutdown(client);
  }, [detachClient, queueShutdown, roomId, stopMeters]);

  useEffect(() => {
    if (state.status !== "connected" || state.transport !== "native") {
      consecutiveHealthFailuresRef.current = 0;
      return;
    }
    const client = clientRef.current;
    if (!client?.hasAuthenticatedSession) return;
    let cancelled = false;
    let inFlight = false;
    const pollHealth = async () => {
      if (cancelled || inFlight || clientRef.current !== client) return;
      inFlight = true;
      try {
        const health = await client.getHealth();
        if (cancelled || clientRef.current !== client) return;
        consecutiveHealthFailuresRef.current = 0;
        const compatibility = checkAudioEngineCompatibility(health);
        if (!compatibility.compatible) {
          const recoveryRequired = requireNativeHandoffRecovery();
          ++operationRef.current;
          stopMeters();
          detachClient(client);
          setState((current) => ({
            ...current,
            status: "incompatible",
            health,
            compatibility,
            error: compatibility.reason,
            fallbackReason: recoveryRequired
              ? current.fallbackReason ?? NATIVE_HANDOFF_RECOVERY_REASON
              : null,
            metersStatus: "stopped",
          }));
          void queueShutdown(client);
          return;
        }
        const publicationReady = registerPublicationSnapshot(health);
        const recoveryRequired = nativeHandoffRecoveryRequiredRef.current;
        setState((current) => (
          clientRef.current === client && current.status === "connected"
            ? {
              ...current,
              health,
              compatibility,
              error: null,
              fallbackReason: publicationReady
                ? null
                : recoveryRequired
                  ? current.fallbackReason ?? NATIVE_HANDOFF_RECOVERY_REASON
                  : null,
            }
            : current
        ));
      } catch (error) {
        if (cancelled || clientRef.current !== client) return;
        consecutiveHealthFailuresRef.current += 1;
        if (consecutiveHealthFailuresRef.current < 2) return;
        const recoveryRequired = requireNativeHandoffRecovery();
        ++operationRef.current;
        stopMeters();
        detachClient(client);
        setState({
          ...INITIAL_AUDIO_ENGINE_STATE,
          status: "error",
          error: errorMessage(error),
          fallbackReason: recoveryRequired ? NATIVE_HANDOFF_RECOVERY_REASON : null,
        });
        void queueShutdown(client);
      } finally {
        inFlight = false;
      }
    };
    const interval = window.setInterval(() => { void pollHealth(); }, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [detachClient, queueShutdown, registerPublicationSnapshot, requireNativeHandoffRecovery, state.status, state.transport, stopMeters]);

  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      ++operationRef.current;
      stopMeters();
      void queueShutdown(detachClient());
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [detachClient, queueShutdown, stopMeters]);

  useEffect(() => () => {
    ++operationRef.current;
    stopMeters();
    void queueShutdown(detachClient());
  }, [detachClient, queueShutdown, stopMeters]);

  const value = useMemo<AudioEngineContextValue>(() => ({
    ...state,
    detect,
    launchAndPair,
    refresh,
    disconnect,
    useWebAudioFallback,
    updateChain,
    setMonitoring,
  }), [detect, disconnect, launchAndPair, refresh, setMonitoring, state, updateChain, useWebAudioFallback]);

  return <AudioEngineContext.Provider value={value}>{children}</AudioEngineContext.Provider>;
}
