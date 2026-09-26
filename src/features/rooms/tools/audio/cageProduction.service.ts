import { supabase } from "../../../../lib/supabaseClient";
import type { PlaceRoomState } from "../../place/place.types";

export const CAGE_PRODUCTION_MAX_BYTES = 25 * 1024 * 1024;
export type CageProduction = { reference: string; title: string; bpm: number | null; revision: number; demo?: boolean };
type Room = Pick<PlaceRoomState, "id" | "source" | "host">;

export function parseCageProduction(value: unknown): CageProduction | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Prod du battle indisponible.");
  const row = value as Record<string, unknown>;
  if (typeof row.loop_distribution_ref !== "string" || !row.loop_distribution_ref.trim()) throw new Error("Prod du battle indisponible.");
  return {
    reference: row.loop_distribution_ref,
    title: typeof row.loop_title === "string" && row.loop_title.trim() ? row.loop_title.trim() : "Prod du battle",
    bpm: typeof row.loop_bpm === "number" && Number.isFinite(row.loop_bpm) && row.loop_bpm > 0 ? row.loop_bpm : null,
    revision: typeof row.revision === "number" ? row.revision : 0,
  };
}

export function validateCageProductionReference(reference: string, room: Room) {
  const prefix = `${room.host.id.toLowerCase()}/${room.id.toLowerCase()}/`;
  const filename = reference.slice(prefix.length);
  if (!reference.startsWith(prefix) || !/^[a-zA-Z0-9_-]+\.(mp3|m4a|mp4|wav)$/i.test(filename)) {
    throw new Error("La référence de cette prod n’appartient pas à la room.");
  }
}

export function cageProductionFilename(production: CageProduction) {
  const title = production.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/[. ]+$/, "").trim().slice(0, 70) || "Prod du battle";
  const extension = production.reference.split(".").pop()?.toLowerCase();
  return `${title}.${["mp3", "m4a", "mp4", "wav"].includes(extension ?? "") ? extension : "m4a"}`;
}

/** The iOS public contract exposes an opaque private Storage reference, never a public URL. */
export async function getCageProduction(room: Room): Promise<CageProduction | null> {
  if (room.source === "demo") return { reference: "/media/preprofile-demo/hazy-after-hours.mp3", title: "Hazy After Hours", bpm: null, revision: 1, demo: true };
  const session = await supabase.rpc("rooms_cage_session_v1", { p_room_id: room.id, p_include_draft: false });
  let value: unknown;
  if (!session.error) {
    const tournament = session.data?.tournament;
    // Match iOS: an ongoing tournament owns its published excerpt even if the host edits the next draft.
    value = tournament && tournament.status !== "completed" ? (tournament.loop_distribution_ref ? tournament : null) : session.data?.loop;
  } else if (["PGRST202", "42883"].includes(session.error.code)) {
    const preview = await supabase.rpc("rooms_cage_public_loop_v1", { p_room_id: room.id });
    if (preview.error) throw new Error("La prod du battle est momentanément indisponible.");
    value = preview.data;
  } else throw new Error("La prod du battle est momentanément indisponible.");
  const production = parseCageProduction(value);
  if (production) validateCageProductionReference(production.reference, room);
  return production;
}

export async function loadCageProduction(room: Room, production: CageProduction): Promise<Blob> {
  let blob: Blob;
  if (room.source === "demo" && production.demo && production.reference === "/media/preprofile-demo/hazy-after-hours.mp3") {
    const response = await fetch(production.reference);
    if (!response.ok) throw new Error("La prod de démonstration n’a pas pu être chargée.");
    blob = await response.blob();
  } else {
    validateCageProductionReference(production.reference, room);
    const { data, error } = await supabase.storage.from("room-cage-loops").download(production.reference);
    if (error || !data) throw new Error("Le téléchargement de la prod a échoué. Réessaie.");
    blob = data;
  }
  if (!blob.size || blob.size > CAGE_PRODUCTION_MAX_BYTES) throw new Error("La prod doit contenir un fichier audio de 25 Mo maximum.");
  return blob;
}

export async function confirmCageProductionReady(room: Room, reference: string) {
  if (room.source === "demo") return;
  validateCageProductionReference(reference, room);
  const { error } = await supabase.rpc("rooms_cage_set_production_ready_v1", { p_room_id: room.id, p_loop_reference: reference, p_ready: true });
  if (error) throw new Error("La prod est chargée, mais la confirmation au host a échoué. Réessaie.");
}
