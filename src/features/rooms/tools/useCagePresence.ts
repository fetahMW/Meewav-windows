import { useCallback, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";
import type { CageReadiness } from "./cageCompetition.types";

/** Presence and readiness are assertions by the connected participant, never by the host. */
export function useCagePresence({ enabled, roomId, accountId, readiness }: { enabled: boolean; roomId: string; accountId?: string | null; readiness: CageReadiness }) {
  const latest = useRef(readiness);
  const requests = useRef<Promise<void>>(Promise.resolve());
  const context = useRef({ enabled, roomId, accountId });
  latest.current = readiness;
  context.current = { enabled, roomId, accountId };
  const publish = useCallback((confirmReady = false) => {
    const request = requests.current.then(async () => {
      if (!enabled || !accountId || !context.current.enabled || context.current.roomId !== roomId || context.current.accountId !== accountId) {
        if (confirmReady) throw new Error("Rejoins La Cage avant de confirmer ta préparation.");
        return;
      }
      const checks = latest.current;
      if (confirmReady && (!navigator.onLine || !Object.values(checks).every(Boolean))) throw new Error("Valide la caméra, le micro, la connexion et tes réglages Mixeur avant de te déclarer prêt.");
      const { data, error } = await supabase.rpc("rooms_cage_presence_v1", {
        p_room_id: roomId,
        p_camera: checks.camera && checks.connection,
        p_microphone: checks.microphone && checks.connection,
        p_mixer: checks.mixer,
        p_permissions: checks.permissions,
        p_ready: confirmReady,
      });
      if (error) throw new Error(error.message || "La préparation n’a pas pu être synchronisée.");
      if (confirmReady && (data as { ready?: boolean } | null)?.ready !== true) throw new Error("Ta préparation n’a pas été confirmée. Vérifie ton invitation et réessaie.");
    });
    // A slow heartbeat must not overwrite a newer explicit Ready confirmation.
    requests.current = request.catch(() => undefined);
    return request;
  }, [accountId, enabled, roomId]);
  useEffect(() => {
    if (!enabled || !accountId) return;
    let disposed = false;
    let inFlight = false;
    const heartbeat = async () => {
      if (disposed || inFlight || !navigator.onLine) return;
      inFlight = true;
      try { await publish(); } catch { /* A stale heartbeat makes the server mark the participant unavailable. */ }
      finally { inFlight = false; }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 15000);
    window.addEventListener("online", heartbeat);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("online", heartbeat); };
  }, [accountId, enabled, publish]);
  // Track loss must revoke readiness promptly, not wait for the next heartbeat.
  useEffect(() => { if (enabled && accountId) void publish().catch(() => undefined); }, [accountId, enabled, publish, readiness.camera, readiness.microphone, readiness.connection, readiness.mixer, readiness.permissions]);
  return publish;
}
