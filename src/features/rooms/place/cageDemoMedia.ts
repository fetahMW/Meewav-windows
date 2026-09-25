import type { PlaceParticipantVideoSourceDto } from "./place.types";

const MEDIA = ["landscape-guitar", "landscape-dj", "portrait-vocal-session", "portrait-studio-rap", "landscape-roundtable", "portrait-producer"] as const;

/** An artist keeps the same illustrative feed throughout the manual demo, whatever their bracket seed. */
export function cageDemoMedia(profileId: string, side: "A" | "B", varied: boolean): PlaceParticipantVideoSourceDto {
  const number = Number.parseInt(profileId.slice(-6), 10);
  const index = Number.isFinite(number) ? Math.max(0, number - 1) : side === "A" ? 0 : 1;
  const layout = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("cageDemo");
  const landscape = layout === "landscape" || (layout === "mixed" && side === "A") || (layout === "mixed-reverse" && side === "B");
  const media = varied ? MEDIA[index % MEDIA.length] : landscape ? (side === "A" ? "landscape-guitar" : "landscape-dj") : (side === "A" ? "portrait-studio-rap" : "portrait-vocal-session");
  const portrait = media.startsWith("portrait");
  return { id: `cage-demo-${profileId}-${media}`, type: portrait ? "portrait_composite" : "desktop_composite",
    aspectRatio: portrait ? "9:16" : "16:9", transport: "file", videoUrl: `/media/shorts-demo/${media}.mp4` };
}
