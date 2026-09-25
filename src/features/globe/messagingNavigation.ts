export type GlobeMessagingIntent = "message" | "collaboration";
export type GlobeMessagingTargetMode = "real" | "demo";

export function createGlobeMessagingPath(
  targetId: string,
  intent: GlobeMessagingIntent,
  mode: GlobeMessagingTargetMode = "demo",
  requestId?: string | null,
) {
  const params = new URLSearchParams({
    space: intent === "collaboration" ? "collabs" : "messages",
    intent,
    source: "globe",
    mode,
  });

  if (mode === "real") params.set("profileId", targetId);
  else params.set("mockArtistId", targetId);
  if (requestId) params.set("request", requestId);

  return `/messages?${params.toString()}`;
}
