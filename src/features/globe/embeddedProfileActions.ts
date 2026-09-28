import { isCanonicalProfileId } from "./api/preProfile.api";

export type EmbeddedDemoArtist = { id: string; name: string; role: string; portraitUrl: string; gradeLevel?: number };
export type EmbeddedProfileAction =
  | { type: "profile-action"; action: "manage-collabs" }
  | { type: "profile-action"; action: "demo-contact" | "demo-collaboration"; artist: EmbeddedDemoArtist };

/** The iframe may select a demo recipient, never impersonate a real account.
 * Origin and source-window checks are performed by the owning frame listener. */
export function parseEmbeddedProfileAction(value: unknown): EmbeddedProfileAction | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.type !== "profile-action") return null;
  if (data.action === "manage-collabs") return { type: "profile-action", action: data.action };
  if (data.action !== "demo-contact" && data.action !== "demo-collaboration") return null;
  if (!data.artist || typeof data.artist !== "object") return null;
  const artist = data.artist as Record<string, unknown>;
  if (typeof artist.id !== "string" || !/^[\w-]{1,100}$/.test(artist.id) || isCanonicalProfileId(artist.id)
    || typeof artist.name !== "string" || !artist.name.trim() || artist.name.length > 100) return null;
  let portraitUrl = "";
  if (typeof artist.portraitUrl === "string" && artist.portraitUrl.length < 2048) {
    try {
      const url = new URL(artist.portraitUrl, window.location.href);
      if (url.origin === window.location.origin && ["http:", "https:", "meewav:"].includes(url.protocol)) portraitUrl = url.href;
    } catch { /* A missing portrait has a text fallback. */ }
  }
  return { type: "profile-action", action: data.action, artist: {
    id: artist.id, name: artist.name.trim(),
    role: typeof artist.role === "string" ? artist.role.slice(0, 100) : "Artiste",
    portraitUrl,
    gradeLevel: Number.isInteger(artist.gradeLevel) && Number(artist.gradeLevel) >= 1 && Number(artist.gradeLevel) <= 6
      ? Number(artist.gradeLevel) : undefined,
  } };
}
