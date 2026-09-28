import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomPerson, RoomToolsCommand, RoomToolsState } from "../roomTools.types";

type User = { user_id: string; username?: string; avatar_url?: string; artist_type?: string };
type Floor = { id: string; user_id?: string; user?: User; status: string; requested_at: string };
type Snapshot = {
  room: { hands_open: boolean; media_consent_version: string };
  floor_requests?: Floor[];
  self_floor_request?: Floor | null;
  floor_speaker?: Floor | null;
  self_participation?: { status: string } | null;
};

async function read(client: SupabaseClient, roomId: string, control: boolean): Promise<Snapshot> {
  const { data, error } = await client.rpc(control ? "rooms_classe_host_state_v1" : "rooms_classe_viewer_state_v1", { p_room_id: roomId });
  if (error) throw new Error(error.message);
  if (!data?.room || typeof data.room.hands_open !== "boolean") throw new Error("classe_floor_contract_unavailable");
  return data;
}
const userId = (floor: Floor) => floor.user?.user_id ?? floor.user_id;
const requests = (data: Snapshot) => data.floor_requests ?? [data.self_floor_request, data.floor_speaker].filter((value): value is Floor => Boolean(value));

/** Only the canonical floor controls RTC publication; seats/resources retain their own authority. */
export async function projectClasseFloor(client: SupabaseClient, state: RoomToolsState, control: boolean, accountId: string) {
  if (!state.classe) throw new Error("classe_state_missing");
  const data = await read(client, state.roomId, control);
  if (data.self_floor_request && !data.self_floor_request.user && accountId && accountId !== "anonymous") {
    data.self_floor_request = { ...data.self_floor_request, user_id: accountId };
  }
  const floors = requests(data);
  const speaker = data.floor_speaker ?? floors.find(floor => floor.status === "granted");
  const activeSpeakerId = speaker ? userId(speaker) ?? null : null;
  const people = new Map(state.classe.people.map(person => [person.id, person]));
  for (const floor of floors) {
    const id = userId(floor);
    if (!id || people.has(id)) continue;
    const person: RoomPerson = { id, name: floor.user?.username || "Participant", avatarUrl: floor.user?.avatar_url || "",
      role: floor.user?.artist_type || "", microphone: id === activeSpeakerId ? "ready" : "off", camera: "off" };
    people.set(id, person);
  }
  return { ...state, classe: { ...state.classe, people: [...people.values()], handsOpen: data.room.hands_open,
    floorEligible: !control && !["applied", "backstage", "onstage"].includes(data.self_participation?.status ?? ""),
    activeSpeakerId,
    raisedHands: floors.filter(floor => floor.status === "requested" && userId(floor))
      .map(floor => ({ personId: userId(floor)!, raisedAt: floor.requested_at })),
    seats: state.classe.seats.map(seat => ({ ...seat, canSpeak: Boolean(seat.person && seat.person.id === activeSpeakerId),
      handRaised: floors.some(floor => floor.status === "requested" && userId(floor) === seat.person?.id) })),
  } };
}

export function isClasseFloorCommand(command: RoomToolsCommand) {
  return ["classe.hands.open", "classe.hand.raise", "classe.hand.lower-own", "classe.hands.lower", "classe.speaker.end-own", "classe.speaker"].includes(command.type);
}

export async function executeClasseFloor(client: SupabaseClient, roomId: string, control: boolean, command: RoomToolsCommand) {
  const data = await read(client, roomId, control);
  const call = async (name: string, args: Record<string, unknown>) => {
    const { error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
  };
  const requireRequest = (floor?: Floor | null) => {
    if (!floor?.id) throw new Error("Cette demande de parole n’est plus disponible.");
    return floor.id;
  };
  switch (command.type) {
    case "classe.hand.raise": {
      if (!data.room.media_consent_version) throw new Error("classe_media_consent_missing");
      if (!window.confirm("Demander la parole et autoriser ton micro lorsque le professeur te la donne ?")) {
        throw new Error("Demande de parole annulée.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop());
      await call("rooms_classe_request_floor_v1", { p_room_id: roomId, p_microphone_ready: true, p_audio_consent: true,
        p_consent_version: data.room.media_consent_version, p_client_request_id: crypto.randomUUID() });
      return;
    }
    case "classe.hand.lower-own":
      if (!data.self_floor_request) return;
      await call("rooms_classe_cancel_floor_v1", { p_request_id: requireRequest(data.self_floor_request) }); return;
    case "classe.speaker.end-own":
      if (!data.self_floor_request) return;
      await call("rooms_classe_release_floor_v1", { p_request_id: requireRequest(data.self_floor_request), p_reason: "participant_released" }); return;
    case "classe.speaker": {
      if (command.personId) {
        const floor = requests(data).find(item => userId(item) === command.personId && item.status === "requested");
        await call("rooms_classe_grant_floor_v1", { p_request_id: requireRequest(floor) });
      } else {
        const floor = data.floor_speaker ?? requests(data).find(item => item.status === "granted");
        await call("rooms_classe_release_floor_v1", { p_request_id: requireRequest(floor), p_reason: "host_released" });
      }
      return;
    }
    case "classe.hands.open":
      await call("rooms_classe_set_hands_open_v1", { p_room_id: roomId, p_hands_open: command.open }); return;
    case "classe.hands.lower":
      await call("rooms_classe_dismiss_floor_requests_v1", { p_room_id: roomId, p_user_id: command.personId ?? null }); return;
    default: throw new Error("classe_floor_command_invalid");
  }
}
