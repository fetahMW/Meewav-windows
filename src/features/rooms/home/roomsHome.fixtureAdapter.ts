import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "../place/place.fixtures";
import type { PlaceProfile, PlaceRoomState } from "../place/place.types";
import { ROOMS_HOME_ROOM_TYPE_LABELS } from "./roomsHome.selectors";
import type { RoomsHomeRoom } from "./roomsHome.types";

function hostProfileFromRoom(room: RoomsHomeRoom): PlaceProfile {
  return {
    id: room.hostId,
    displayName: room.hostName,
    handle: `@${room.hostName.toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, "").slice(0, 24) || "meewav"}`,
    role: `Hôte · ${ROOMS_HOME_ROOM_TYPE_LABELS[room.roomType]}`,
    city: room.city ?? room.country,
    avatarUrl: room.hostAvatar,
    gradeLevel: room.gradeLevel ?? 3,
  };
}

/**
 * Adapts an accueil card to the existing Room runtime without rebuilding the
 * Room itself. The interior keeps its mature demo controls, while its identity,
 * host, audience and principal visual now match the card that was opened.
 */
export function createRoomsHomeDemoState(
  room: RoomsHomeRoom,
  currentUserId: string | null = PLACE_DEMO_PROFILES.host.id,
): PlaceRoomState {
  const base = createPlaceDemoState(currentUserId);
  const host = hostProfileFromRoom(room);
  const formerHostId = base.host.id;
  const startedAt = Number.isFinite(new Date(room.startedAt).getTime())
    ? room.startedAt
    : base.startedAt;

  return {
    ...base,
    id: room.id,
    title: room.title,
    description: `${room.hostName} t’accueille dans ${ROOMS_HOME_ROOM_TYPE_LABELS[room.roomType]}.`,
    startedAt,
    host,
    queue: room.roomType === "scene" ? base.queue.filter(participant => participant.profile.id !== PLACE_DEMO_PROFILES.viewerA.id) : base.queue,
    participantsCount: room.viewerCount,
    peakViewers: Math.max(room.viewerCount, Math.round(room.viewerCount * 1.16)),
    currentUserProfile: base.currentUserProfile?.id === formerHostId
      ? host
      : base.currentUserProfile,
    participants: base.participants.map((participant) => (
      participant.profile.id === formerHostId
        ? {
            ...participant,
            profile: host,
            imageUrl: room.thumbnail,
            videoUrl: room.videoSource,
            videoSources: [{ id: `home-${room.id}`, type: room.mediaFormat === "vertical" ? "portrait_composite" as const : "desktop_composite" as const, aspectRatio: room.mediaFormat === "vertical" ? "9:16" as const : "16:9" as const, transport: "file" as const, videoUrl: room.videoSource, imageUrl: room.thumbnail }],
          }
        : participant
    )),
    channels: base.channels.map((channel) => (
      channel.participantId === formerHostId
        ? {
            ...channel,
            participantId: host.id,
            detail: room.hostName,
          }
        : channel
    )),
  };
}
