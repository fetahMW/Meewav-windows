import type { LaunchSetlistTrack } from "./roomLaunch";

export function readLaunchSetlists(scope: string): { id: string; title: string; tracks: LaunchSetlistTrack[] }[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(`meewav-profile-setlists-v3:${scope}`) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.flatMap(entry => {
      if (!entry || typeof entry.id !== "string" || typeof entry.title !== "string" || !Array.isArray(entry.tracks)) return [];
      const tracks = entry.tracks.flatMap((track: { title?: unknown; artist?: unknown; duration?: unknown }) => {
        if (!track || typeof track.title !== "string" || !track.title.trim()) return [];
        const parts = String(track.duration ?? "0").split(":").map(Number);
        const seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts.length === 1 ? parts[0] : 0;
        return [{ title: track.title.trim(), artist: typeof track.artist === "string" ? track.artist : "", durationSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(7200, seconds) : 0 }];
      });
      return tracks.length ? [{ id: entry.id, title: entry.title, tracks }] : [];
    });
  } catch { return []; }
}
