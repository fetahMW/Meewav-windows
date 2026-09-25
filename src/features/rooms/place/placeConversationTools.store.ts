import { assertDemoExperience } from "../switch-room/switchRoom.service";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { createPlaceConversationState, reducePlaceConversation, type PlaceConversationCommand, type PlaceConversationState } from "./placeConversationTools.domain";

const demoStates = new Map<string, PlaceConversationState>();
const listeners = new Map<string, Set<() => void>>();
const storageKey = (roomId: string) => `meewav:demo:place-conversation:v1:${roomId}`;

function demoState(roomId: string) {
  let state = demoStates.get(roomId);
  if (!state) {
    state = createPlaceConversationState();
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey(roomId)) ?? "null") as PlaceConversationState | null;
      if (saved?.version === 1 && Number.isInteger(saved.revision) && saved.floor && Array.isArray(saved.floor.queue) && Array.isArray(saved.challenges)) state = saved;
    } catch { /* A restricted or expired browser session starts an empty demo. */ }
    demoStates.set(roomId, state);
  }
  return state;
}

export function usePlaceConversationTools({ roomId, source, actorId, isHost, canEngage, peopleIds, backstageIds }: {
  roomId: string; source: "demo" | "live"; actorId: string; isHost: boolean; canEngage: boolean; peopleIds: readonly string[]; backstageIds?: readonly string[];
}) {
  const [state, setState] = useState<PlaceConversationState | null>(() => source === "demo" ? demoState(roomId) : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const epoch = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(async () => {
    const generation = epoch.current;
    if (source === "demo") { setState(demoState(roomId)); return; }
    const result = await supabase.rpc("rooms_get_place_tools_v1", { p_room_id: roomId });
    if (epoch.current !== generation) return;
    if (result.error) throw new Error("Les outils de cette Room sont momentanément indisponibles.");
    const next = result.data as PlaceConversationState | null;
    if (!next || next.version !== 1) throw new Error("Les outils de cette Room sont momentanément indisponibles.");
    setState((current) => !current || next.revision >= current.revision ? next : current);
  }, [roomId, source]);

  useEffect(() => {
    epoch.current += 1;
    setError(null);
    setState(source === "demo" ? demoState(roomId) : null);
    if (source === "demo") {
      const update = () => setState(demoState(roomId));
      const group = listeners.get(roomId) ?? new Set<() => void>();
      group.add(update); listeners.set(roomId, group);
      return () => { epoch.current += 1; group.delete(update); if (!group.size) listeners.delete(roomId); };
    }
    let active = true;
    const refresh = () => void reload().catch((reason: Error) => { if (active) setError(reason.message); });
    refresh();
    const channel = supabase.channel(`place-tools:${roomId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_place_tools_v1", filter: `room_id=eq.${roomId}` }, refresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    return () => { active = false; epoch.current += 1; void supabase.removeChannel(channel); };
  }, [reload, roomId, source]);

  const execute = useCallback(async (command: PlaceConversationCommand) => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(null);
    const generation = epoch.current;
    try {
      if(source === "demo") assertDemoExperience(roomId,"place",actorId);
      if (isHost && command.type === "floor.join" && backstageIds && !backstageIds.includes(command.personId)) {
        throw new Error("Choisis une personne actuellement en coulisses.");
      }
      const current = source === "demo" ? demoState(roomId) : stateRef.current;
      if (!current) throw new Error("Les outils ne sont pas encore disponibles.");
      // The server validates current membership. A public requester may not yet
      // have a portrait in the Host's stage projection.
      const eligibleIds = source === "live" ? [...new Set([...peopleIds, ...current.floor.queue])] : peopleIds;
      const next = reducePlaceConversation(current, command, { id: actorId, isHost, canEngage }, eligibleIds);
      if (source === "demo") {
        demoStates.set(roomId, next);
        try { sessionStorage.setItem(storageKey(roomId), JSON.stringify(next)); } catch { /* State remains available in this tab. */ }
        listeners.get(roomId)?.forEach((listener) => listener());
      } else {
        const result = await supabase.rpc("rooms_apply_place_tools_v1", {
          p_room_id: roomId, p_expected_revision: current.revision, p_command: command,
        });
        if (result.error) {
          if (result.error.message.includes("revision_conflict")) {
            await reload();
            throw new Error("La Room a changé. Les informations sont à jour, réessaie ton action.");
          }
          throw new Error("La commande n’a pas été appliquée. Réessaie dans un instant.");
        }
        if (generation === epoch.current) {
          const committed = result.data as PlaceConversationState;
          if (!committed || committed.version !== 1) throw new Error("La confirmation de la commande est indisponible. Réessaie dans un instant.");
          setState((latest) => !latest || committed.revision >= latest.revision ? committed : latest);
        }
      }
      return true;
    } catch (reason) {
      if (generation === epoch.current) setError(reason instanceof Error ? reason.message : "La commande n’a pas été appliquée.");
      return false;
    } finally {
      inFlight.current = false;
      if (generation === epoch.current) setBusy(false);
    }
  }, [actorId, canEngage, isHost, peopleIds, backstageIds, reload, roomId, source]);

  return { state, busy, error, execute, retry: () => { setError(null); void reload().catch((reason: Error) => setError(reason.message)); } };
}
