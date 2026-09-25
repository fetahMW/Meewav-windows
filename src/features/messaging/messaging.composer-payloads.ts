import type { MessagingJson } from "./messaging.types";

export function buildMessagingBriefPayload(
  styleKey: string | null,
  bpm: number | null,
): Record<string, MessagingJson> {
  return {
    schema_version: 1,
    ...(styleKey ? { style_key: styleKey } : {}),
    ...(bpm ? { bpm } : {}),
  };
}

export function buildMessagingTrackPackPayload(
  tracks: string[],
  durations: string[],
): Record<string, MessagingJson> {
  return {
    schema_version: 1,
    tracks,
    durations,
  };
}
