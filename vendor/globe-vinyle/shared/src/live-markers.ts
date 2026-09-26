const ROLE_LABELS: Record<string, string> = {
  viewer: "Membre", vocalist: "Artiste vocal", dancer: "Danseur", beatmaker: "Beatmaker",
  dj: "DJ", beatboxer: "Beatboxer", acoustic_guitarist: "Guitariste", electric_guitarist: "Guitariste",
  pianist: "Pianiste", drummer: "Batteur", bassist: "Bassiste", violinist: "Violoniste",
  composer: "Compositeur", producer: "Producteur", songwriter: "Auteur", sound_designer: "Sound designer",
  sound_engineer: "Ingénieur du son", vocal_coach: "Coach vocal", manager: "Manager", label: "Label",
  studio: "Studio", videomaker: "Vidéaste", stage_organization: "Organisation scénique",
};

export type LiveGlobeMarker = {
  id: string; name: string; role: string; icon: string; grade: number;
  city: string; cityId: string; zoneId: string; zoneName: string;
  lon: number; lat: number; live: true; avatarUrl: string | null;
};

export function parseLiveMarkers(value: unknown): LiveGlobeMarker[] {
  if (!Array.isArray(value)) throw new Error("La population du Globe est illisible.");
  const unique = new Map<string, LiveGlobeMarker>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.profile_id ?? "");
    const lon = Number(row.longitude), lat = Number(row.latitude);
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)
      || row.longitude == null || row.latitude == null || row.longitude === "" || row.latitude === ""
      || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
    const roleKey = String(row.primary_role_key ?? "");
    const icon = String(row.avatar_icon_id ?? "");
    const grade = Number(row.grade);
    const communeCode = String(row.commune_code ?? "");
    const avatarUrl = String(row.avatar_url ?? "").trim();
    unique.set(id, {
      id, name: String(row.display_name ?? "Artiste").slice(0, 120),
      role: ROLE_LABELS[roleKey] ?? roleKey.replaceAll("_", " ").slice(0, 80),
      icon: /^avatar_([1-9]|[12]\d|3[01])$/.test(icon) ? icon : "avatar_4",
      grade: Number.isInteger(grade) && grade >= 1 && grade <= 6 ? grade : 0,
      city: String(row.city ?? "").slice(0, 80),
      cityId: /^[0-9A-Z]{5}$/.test(communeCode) ? `fr-commune-${communeCode}` : "",
      zoneId: String(row.zone_id ?? ""), zoneName: String(row.zone_name ?? row.scene_name ?? ""),
      lon, lat, live: true,
      avatarUrl: /^https:\/\//i.test(avatarUrl) || (avatarUrl.startsWith("/") && !avatarUrl.startsWith("//")) ? avatarUrl : null,
    });
  }
  return [...unique.values()];
}
