import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import type { CageAudienceFundraiser } from "./CageViewerCompanion";

// iOS rooms-goal: 20260923001000_rooms_cage_read_only_fundraiser_v1.sql.
// This contract publishes an objective, never a balance or a payment action.
export function parseCageAudienceFundraiser(value: unknown, roomId: string): CageAudienceFundraiser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.room_id !== roomId || !["open", "closed"].includes(String(row.status)) || typeof row.title !== "string" || !row.title.trim()
    || typeof row.target_eur !== "number" || !Number.isFinite(row.target_eur) || row.target_eur <= 0) return null;
  return { title: row.title.trim(), beneficiary: typeof row.beneficiary === "string" ? row.beneficiary : undefined, target: row.target_eur, isOpen: row.status === "open" };
}

export function useCageAudienceFundraiser(roomId: string, accountId: string, enabled: boolean) {
  const scope = `${roomId}:${accountId}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; value: CageAudienceFundraiser | null; error?: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const { data, error } = await supabase.rpc("rooms_cage_fundraiser_state_v1", { p_room_id: roomId });
        if (disposed) return;
        // Older servers do not have this optional iOS contract yet.
        if (error && ["PGRST202", "42883"].includes(error.code)) { setSnapshot({ scope, value: null }); return; }
        setSnapshot({ scope, value: error ? null : parseCageAudienceFundraiser(data, roomId), error: error ? "Cagnotte momentanément indisponible. Nouvelle tentative automatique…" : undefined });
      } catch { if (!disposed) setSnapshot({ scope, value: null, error: "Cagnotte momentanément indisponible. Nouvelle tentative automatique…" }); }
      if (!disposed) timer = setTimeout(() => void refresh(), 5_000);
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [enabled, roomId, scope]);
  return enabled && snapshot?.scope === scope ? { fundraiser: snapshot.value, error: snapshot.error } : { fundraiser: null, error: undefined };
}
