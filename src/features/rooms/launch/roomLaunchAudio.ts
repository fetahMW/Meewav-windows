// Local presentation assets live outside localStorage, so a reload can restore
// the actual file without storing a stale blob URL in the launch snapshot.
const CACHE = "meewav-room-launch-audio-v1";
const PREFIX = "/__meewav_room_launch_audio__/";
const urls = new Map<string, Promise<string>>();
export const isRoomLaunchAudio = (path?: string) => Boolean(path?.startsWith(PREFIX));

export async function saveRoomLaunchAudio(file: File): Promise<string> {
  const path = `${PREFIX}${crypto.randomUUID()}`;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(path, new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream" } }));
    return path;
  } catch {
    throw new Error("Impossible de conserver la boucle de base sur cet appareil. Libère de l’espace puis réessaie.");
  }
}

export async function removeRoomLaunchAudio(path: string) {
  await (await caches.open(CACHE)).delete(path);
  const url = urls.get(path);
  urls.delete(path);
  if (url) URL.revokeObjectURL(await url);
}

export function resolveRoomLaunchAudio(path: string): Promise<string> {
  let pending = urls.get(path);
  if (!pending) {
    pending = (async () => {
      const response = await (await caches.open(CACHE)).match(path);
      if (!response) throw new Error("La boucle de base enregistrée est introuvable. Réimporte-la depuis le lancement de la Wave.");
      return URL.createObjectURL(await response.blob());
    })();
    urls.set(path, pending);
    void pending.catch(() => urls.delete(path));
  }
  return pending;
}
