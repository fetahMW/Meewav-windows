import { supabase } from "../../../lib/supabaseClient";
import { parseLiveMarkers } from "../../../../vendor/globe-vinyle/shared/src/live-markers";
export { parseLiveMarkers };
export type { LiveGlobeMarker } from "../../../../vendor/globe-vinyle/shared/src/live-markers";

/** Only the coarse, visibility-filtered public projection crosses the iframe bridge. */
export async function loadPublicGlobeMarkers(signal?: AbortSignal) {
  const rows: unknown[] = [];
  for (let offset = 0; offset <= 5000; offset += 500) {
    let query = supabase.from("globe_public_markers_v1").select("*").order("profile_id", { ascending: true }).range(offset, offset + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("Les profils du Globe ne sont pas disponibles. Réessaie dans un instant.");
    rows.push(...data);
    if (rows.length > 5000) throw new Error("Le Globe contient trop de profils pour ce chargement. Affine la zone avant de réessayer.");
    if (data.length < 500) return parseLiveMarkers(rows);
  }
  return parseLiveMarkers(rows);
}
