import type { RoomPerson } from '../tools/roomTools.types';
import type { PlaceStageParticipant } from './placeStageLayoutEngine';
import { cageDemoMedia } from './cageDemoMedia';

export type FeedAssignment = {
  participant: PlaceStageParticipant;
  sourceParticipantId: string;
  trackIdentity: string;
  exact: boolean;
};

function virtualParticipant(person: RoomPerson, source: PlaceStageParticipant, preservePoster: boolean): PlaceStageParticipant {
  return {
    ...source,
    id: `cage-feed-${person.id}-${source.id}`,
    imageUrl: preservePoster ? source.imageUrl : undefined,
    videoSources: preservePoster
      ? source.videoSources
      : source.videoSources?.map((videoSource) => ({ ...videoSource, imageUrl: undefined })),
    profile: {
      ...source.profile,
      id: person.id,
      displayName: person.name,
      role: person.role,
      avatarUrl: person.avatarUrl,
    },
    isCameraEnabled: source.isCameraEnabled,
    isMicrophoneEnabled: source.isMicrophoneEnabled,
  };
}

export function resolveCageFeed(
  person: RoomPerson,
  side: "A" | "B",
  onStage: PlaceStageParticipant[],
  demoFallback: boolean,
  variedDemo = false,
): FeedAssignment | null {
  const exact = onStage.find((participant) => participant.profile.id === person.id || participant.id === person.id);
  if (!demoFallback) return exact ? { participant: virtualParticipant(person, exact, true), sourceParticipantId: exact.id, trackIdentity: exact.profile.id, exact: true } : null;
  const media = cageDemoMedia(person.id, side, variedDemo);
  const source: PlaceStageParticipant = exact ?? {
    id: `cage-guest-${person.id}`, profile: { id: person.id, displayName: person.name, handle: "", role: person.role, city: "", avatarUrl: person.avatarUrl, gradeLevel: person.gradeLevel ?? 1 },
    joinedAt: "", status: "onstage", isSpeaking: false, latencyMs: 35,
    isCameraEnabled: person.camera !== "off", isMicrophoneEnabled: person.microphone !== "off",
  };
  return { participant: virtualParticipant(person, { ...source, videoUrl: media.videoUrl, videoSources: [media], imageUrl: undefined }, true),
    sourceParticipantId: source.id, trackIdentity: person.id, exact: Boolean(exact) };
}

