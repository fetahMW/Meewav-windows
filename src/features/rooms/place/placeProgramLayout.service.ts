import type { PlaceRoomState } from "./place.types";
import {
  createInitialProgramLayout,
  isValidSafeVideoRegion,
  PLACE_STAGE_MAX_SMART_ZOOM,
  type PlaceProgramLayoutState,
  type PlaceStageParticipant,
} from "./placeStageLayoutEngine";
import { createPlaceProgramLayoutRepository } from "./placeProgramLayout.repository";
import type { PlaceProgramLayoutRepository, PlaceProgramLayoutSnapshot } from "./placeProgramLayout.types";

export function getPlaceProgramParticipants(room: PlaceRoomState): PlaceStageParticipant[] {
  const host = room.participants.find((participant) => (
    participant.status === "host"
    || participant.profile.id === room.host.id
    || participant.id === "host"
  ));
  const guests = room.participants.filter((participant) => (
    participant.status === "onstage" && participant.id !== host?.id
  ));
  return (host ? [host, ...guests.slice(0, 3)] : guests.slice(0, 4)) as PlaceStageParticipant[];
}

export function createPlaceProgramLayout(room: PlaceRoomState): PlaceProgramLayoutState {
  return createInitialProgramLayout(getPlaceProgramParticipants(room), room.host.id);
}

export function sanitizePlaceProgramLayout(
  proposed: PlaceProgramLayoutState,
  room: PlaceRoomState,
  metadata?: { updatedBy?: string; updatedAt?: number },
): PlaceProgramLayoutState {
  const participants = getPlaceProgramParticipants(room);
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const allowedIds = participants.map((participant) => participant.id);
  const fallback = createInitialProgramLayout(participants, room.host.id);
  const primaryParticipantId = participantById.has(proposed.primaryParticipantId)
    ? proposed.primaryParticipantId
    : fallback.primaryParticipantId;
  const participantOrder = [
    ...new Set([
      ...proposed.participantOrder.filter((participantId) => participantById.has(participantId)),
      ...allowedIds,
    ]),
  ];
  const selectedSourceByParticipant = Object.fromEntries(
    Object.entries(proposed.selectedSourceByParticipant).filter(([participantId, sourceId]) => {
      // RTC source metadata can arrive after the program-layout event. The
      // participant reference is authoritative here; the Stage resolves the
      // source identifier once the matching media publication is available.
      return participantById.has(participantId) && typeof sourceId === "string" && sourceId.length > 0 && sourceId.length <= 128;
    }),
  );
  const safeFramingByParticipant = Object.fromEntries(
    Object.entries(proposed.safeFramingByParticipant ?? {}).flatMap(([participantId, configuration]) => {
      if (!participantById.has(participantId)) return [];
      const frozenSourceId = typeof configuration.sourceId === "string"
        && configuration.sourceId.length > 0
        && configuration.sourceId.length <= 128
        ? configuration.sourceId
        : undefined;
      const frozenSafeRegion = isValidSafeVideoRegion(configuration.safeRegion)
        ? { ...configuration.safeRegion }
        : undefined;
      const locked = Boolean(configuration.locked && frozenSourceId && frozenSafeRegion);
      return [[participantId, {
        enabled: Boolean(configuration.enabled),
        locked,
        maxZoom: Math.min(PLACE_STAGE_MAX_SMART_ZOOM, Math.max(1, Number(configuration.maxZoom) || 1)),
        ...(locked ? { sourceId: frozenSourceId, safeRegion: frozenSafeRegion } : {}),
      }]];
    }),
  );

  return {
    mode: proposed.mode,
    primaryParticipantId,
    lockedParticipantId: proposed.lockedParticipantId && participantById.has(proposed.lockedParticipantId)
      ? proposed.lockedParticipantId
      : undefined,
    participantOrder,
    selectedSourceByParticipant,
    transition: proposed.transition ?? "dissolve",
    preset: proposed.preset ?? "performance",
    autoDirectorProfile: proposed.autoDirectorProfile ?? "calm",
    safeFramingByParticipant,
    updatedBy: metadata?.updatedBy ?? proposed.updatedBy ?? room.host.id,
    updatedAt: metadata?.updatedAt ?? proposed.updatedAt ?? Date.now(),
  };
}

export function arePlaceProgramLayoutsEqual(left: PlaceProgramLayoutState, right: PlaceProgramLayoutState) {
  return JSON.stringify({ ...left, updatedBy: undefined, updatedAt: undefined })
    === JSON.stringify({ ...right, updatedBy: undefined, updatedAt: undefined });
}

export function createPlaceProgramLayoutService(repository: PlaceProgramLayoutRepository = createPlaceProgramLayoutRepository()) {
  return {
    async load(room: PlaceRoomState): Promise<PlaceProgramLayoutSnapshot | null> {
      return repository.load(room.id);
    },

    async save(
      room: PlaceRoomState,
      expectedRevision: number,
      layout: PlaceProgramLayoutState,
      hostId: string,
    ): Promise<PlaceProgramLayoutSnapshot> {
      const sanitized = sanitizePlaceProgramLayout(layout, room, {
        updatedBy: hostId,
        updatedAt: Date.now(),
      });
      return repository.save(room.id, expectedRevision, sanitized);
    },

    subscribe: repository.subscribe,
  };
}
