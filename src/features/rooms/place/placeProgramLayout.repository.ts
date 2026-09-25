import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import { isValidSafeVideoRegion } from "./placeStageLayoutEngine";
import type {
  PlaceAutoDirectorProfile,
  PlaceProgramLayoutState,
  PlaceStageMode,
  PlaceStagePreset,
  PlaceStageTransition,
  SafeVideoRegion,
} from "./placeStageLayoutEngine";
import type {
  PlaceProgramLayoutRealtimeStatus,
  PlaceProgramLayoutRepository,
  PlaceProgramLayoutSnapshot,
} from "./placeProgramLayout.types";

type ProgramLayoutRow = {
  room_id: string;
  revision: number | string;
  mode: string;
  primary_participant_id: string;
  locked_participant_id: string | null;
  participant_order: unknown;
  selected_source_by_participant: unknown;
  transition: string;
  preset: string;
  auto_director_profile: string;
  safe_framing_by_participant: unknown;
  updated_by: string;
  updated_at: string;
};

const MODE_VALUES = new Set<PlaceStageMode>(["auto", "stage", "grid", "solo"]);
const TRANSITION_VALUES = new Set<PlaceStageTransition>(["cut", "dissolve"]);
const PRESET_VALUES = new Set<PlaceStagePreset>(["performance", "discussion", "collaboration"]);
const AUTO_PROFILE_VALUES = new Set<PlaceAutoDirectorProfile>(["calm", "dynamic", "manual"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => (
    Boolean(entry[0]) && typeof entry[1] === "string" && Boolean(entry[1])
  )));
}

function safeRegionFromUnknown(value: unknown): SafeVideoRegion | undefined {
  if (!isRecord(value)) return undefined;
  if (![value.x, value.y, value.width, value.height, value.confidence].every((item) => typeof item === "number")) {
    return undefined;
  }
  const region = value as SafeVideoRegion;
  return isValidSafeVideoRegion(region) ? region : undefined;
}

function framingMap(value: unknown): NonNullable<PlaceProgramLayoutState["safeFramingByParticipant"]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([participantId, configuration]) => {
    if (!participantId || !isRecord(configuration)) return [];
    const maxZoom = Number(configuration.maxZoom);
    if (typeof configuration.enabled !== "boolean" || typeof configuration.locked !== "boolean" || !Number.isFinite(maxZoom)) return [];
    const sourceId = typeof configuration.sourceId === "string" && configuration.sourceId.length > 0 && configuration.sourceId.length <= 128
      ? configuration.sourceId
      : undefined;
    const safeRegion = safeRegionFromUnknown(configuration.safeRegion);
    const locked = configuration.locked && Boolean(sourceId && safeRegion);
    return [[participantId, {
      enabled: configuration.enabled,
      locked,
      maxZoom,
      ...(locked ? { sourceId, safeRegion } : {}),
    }]];
  }));
}

function parseLayout(value: Record<string, unknown>): PlaceProgramLayoutState {
  const mode = value.mode;
  const transition = value.transition;
  const preset = value.preset;
  const autoDirectorProfile = value.autoDirectorProfile;
  const primaryParticipantId = value.primaryParticipantId;
  const participantOrder = value.participantOrder;
  const updatedBy = value.updatedBy;
  const updatedAt = Number(value.updatedAt);
  if (
    typeof mode !== "string" || !MODE_VALUES.has(mode as PlaceStageMode)
    || typeof transition !== "string" || !TRANSITION_VALUES.has(transition as PlaceStageTransition)
    || typeof preset !== "string" || !PRESET_VALUES.has(preset as PlaceStagePreset)
    || typeof autoDirectorProfile !== "string" || !AUTO_PROFILE_VALUES.has(autoDirectorProfile as PlaceAutoDirectorProfile)
    || typeof primaryParticipantId !== "string" || !primaryParticipantId
    || !Array.isArray(participantOrder) || participantOrder.some((item) => typeof item !== "string")
    || typeof updatedBy !== "string" || !updatedBy
    || !Number.isFinite(updatedAt)
  ) {
    throw new Error("Contrat de réalisation Room invalide.");
  }

  return {
    mode: mode as PlaceStageMode,
    primaryParticipantId,
    lockedParticipantId: typeof value.lockedParticipantId === "string" && value.lockedParticipantId
      ? value.lockedParticipantId
      : undefined,
    participantOrder: participantOrder as string[],
    selectedSourceByParticipant: stringMap(value.selectedSourceByParticipant),
    transition: transition as PlaceStageTransition,
    preset: preset as PlaceStagePreset,
    autoDirectorProfile: autoDirectorProfile as PlaceAutoDirectorProfile,
    safeFramingByParticipant: framingMap(value.safeFramingByParticipant),
    updatedBy,
    updatedAt,
  };
}

function snapshotFromRow(row: ProgramLayoutRow): PlaceProgramLayoutSnapshot {
  const revision = Number(row.revision);
  const updatedAt = new Date(row.updated_at).getTime();
  if (!row.room_id || !Number.isInteger(revision) || revision < 1 || !Number.isFinite(updatedAt)) {
    throw new Error("Révision de réalisation Room invalide.");
  }
  return {
    roomId: row.room_id,
    revision,
    layout: parseLayout({
      mode: row.mode,
      primaryParticipantId: row.primary_participant_id,
      lockedParticipantId: row.locked_participant_id,
      participantOrder: row.participant_order,
      selectedSourceByParticipant: row.selected_source_by_participant,
      transition: row.transition,
      preset: row.preset,
      autoDirectorProfile: row.auto_director_profile,
      safeFramingByParticipant: row.safe_framing_by_participant,
      updatedBy: row.updated_by,
      updatedAt,
    }),
  };
}

function snapshotFromRpc(value: unknown): PlaceProgramLayoutSnapshot {
  if (!isRecord(value)) throw new Error("Réponse de réalisation Room invalide.");
  const roomId = value.roomId;
  const revision = Number(value.revision);
  if (typeof roomId !== "string" || !roomId || !Number.isInteger(revision) || revision < 1) {
    throw new Error("Réponse de réalisation Room incomplète.");
  }
  return { roomId, revision, layout: parseLayout(value) };
}

export function createPlaceProgramLayoutRepository(client: SupabaseClient = supabase): PlaceProgramLayoutRepository {
  return {
    async load(roomId) {
      const { data, error } = await client
        .from("room_program_layout_v1")
        .select("room_id,revision,mode,primary_participant_id,locked_participant_id,participant_order,selected_source_by_participant,transition,preset,auto_director_profile,safe_framing_by_participant,updated_by,updated_at")
        .eq("room_id", roomId)
        .maybeSingle();
      if (error) throw error;
      return data ? snapshotFromRow(data as ProgramLayoutRow) : null;
    },

    async save(roomId, expectedRevision, layout) {
      const { data, error } = await client.rpc("rooms_set_program_layout_v1", {
        p_room_id: roomId,
        p_expected_revision: expectedRevision,
        p_layout: layout,
      });
      if (error) throw error;
      return snapshotFromRpc(data);
    },

    subscribe(roomId, onSnapshot, onStatus) {
      const setStatus = (status: PlaceProgramLayoutRealtimeStatus) => onStatus?.(status);
      setStatus("connecting");
      const channel = client
        .channel(`place-program-layout:${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "room_program_layout_v1",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            try {
              onSnapshot(snapshotFromRow(payload.new as ProgramLayoutRow));
            } catch {
              setStatus("error");
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setStatus("subscribed");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStatus("error");
          else if (status === "CLOSED") setStatus("idle");
        });

      return {
        unsubscribe: () => {
          setStatus("idle");
          void client.removeChannel(channel);
        },
      };
    },
  };
}
