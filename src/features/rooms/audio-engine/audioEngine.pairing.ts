import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import type { AudioEnginePairingContext, AudioEnginePairingTicket } from "./audioEngine.types";
import { parseAudioEnginePairingTicket } from "./audioEngine.validators";

const ROOM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CLIENT_NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;

export function isAudioEngineRoomId(value: string | null | undefined): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

/**
 * Requests a signed, one-use pairing ticket from MeeWav's authenticated
 * backend. The Edge Function is intentionally not emulated client-side.
 */
export async function requestAudioEnginePairingTicket(
  roomId: string,
  context: AudioEnginePairingContext,
  client: SupabaseClient = supabase,
): Promise<AudioEnginePairingTicket> {
  if (!isAudioEngineRoomId(roomId)) {
    throw new Error("Association audio refusée : ouvre une Room réelle possédant un identifiant UUID.");
  }
  if (!CLIENT_NONCE_PATTERN.test(context.clientNonce)) {
    throw new Error("Association audio refusée : nonce navigateur invalide.");
  }
  if (typeof window === "undefined" || context.origin !== new URL(window.location.origin).origin) {
    throw new Error("Association audio refusée : origine navigateur incohérente.");
  }
  const { data, error } = await client.functions.invoke("rooms-audio-engine-pairing-ticket", {
    body: { roomId, clientNonce: context.clientNonce },
  });
  if (error) throw new Error("Impossible d’obtenir le ticket d’association audio depuis le backend MeeWav authentifié.");
  return parseAudioEnginePairingTicket(data);
}
