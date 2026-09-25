import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  AVATAR_GROUND_REPERE_INNER_RADIUS,
  AVATAR_GROUND_REPERE_OUTER_RADIUS,
  AVATAR_GROUND_REPERE_PITCH_ALIGNMENT,
  AVATAR_GROUND_REPERE_PITCH_SCALE,
  AVATAR_VISIBLE_MIN_ZOOM,
  HOST_AVATAR_SIZE_MULTIPLIER,
  MVT_STANDARD_AVATAR_ICON_SIZE,
} from "../../../map/avatarVisualContract";
import { AVATAR_PREPROFILE_LABEL_HIDDEN_STATE } from "../../../map/avatarLayers";
import type { MusicSceneOnboardingPayload } from "../../auth/musicSceneOnboardingContract";

export const ONBOARDING_CURRENT_USER_SOURCE_ID = "meewav-onboarding-current-user";
const AURA_LAYER_ID = "meewav-onboarding-current-user-aura";
const AURA_INNER_LAYER_ID = "meewav-onboarding-current-user-aura-inner";
export const ONBOARDING_CURRENT_USER_AVATAR_LAYER_ID = "meewav-onboarding-current-user-avatar";
const LABEL_LAYER_ID = "meewav-onboarding-current-user-label";
const OVERLAY_LAYER_IDS = [
  AURA_LAYER_ID,
  AURA_INNER_LAYER_ID,
  ONBOARDING_CURRENT_USER_AVATAR_LAYER_ID,
  LABEL_LAYER_ID,
] as const;
const CANONICAL_AVATAR_SOURCE_ID = "meewav-avatars";
const CANONICAL_AVATAR_SOURCE_LAYER = "musicians";
export const ONBOARDING_FLY_HIDDEN_PROFILE_MAP_PROPERTY = "__meewav_onboarding_fly_hidden_profile_id";
const overlayPayloadSignatures = new WeakMap<MapLibreMap, string>();
const canonicalProfileIdsByMap = new WeakMap<MapLibreMap, Set<string>>();
const overlayVisibilityByMap = new WeakMap<MapLibreMap, boolean>();
const baseAvatarVisibilityByMap = new WeakMap<MapLibreMap, boolean>();

const BASE_AVATAR_LAYER_IDS = [
  ONBOARDING_CURRENT_USER_AVATAR_LAYER_ID,
  LABEL_LAYER_ID,
] as const;

function getOnboardingSceneCenter(payload: MusicSceneOnboardingPayload): [number, number] {
  // The host represents the scene itself, not a private address or a randomly
  // displaced catalogue avatar. Keep it on the selected district's interior
  // visual centre, which is also used by the arrival camera.
  return [payload.scene.center[0], payload.scene.center[1]];
}

export function getOnboardingFlyHiddenProfileId(map: MapLibreMap) {
  const value = (map as MapLibreMap & Record<string, unknown>)[ONBOARDING_FLY_HIDDEN_PROFILE_MAP_PROPERTY];
  return typeof value === "string" && value ? value : null;
}

export function setOnboardingFlyHiddenProfileId(
  map: MapLibreMap,
  profileId: string | null,
) {
  const nextProfileId = profileId || null;
  const extendedMap = map as MapLibreMap & Record<string, unknown>;
  if (extendedMap[ONBOARDING_FLY_HIDDEN_PROFILE_MAP_PROPERTY] === nextProfileId) return false;
  extendedMap[ONBOARDING_FLY_HIDDEN_PROFILE_MAP_PROPERTY] = nextProfileId;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("meewav:onboarding-avatar-visibility", {
      detail: { map, profileId: nextProfileId },
    }));
  }
  return true;
}

function getPayloadSignature(payload: MusicSceneOnboardingPayload) {
  const sceneCenter = getOnboardingSceneCenter(payload);
  return JSON.stringify([
    payload.profile.profileId,
    payload.profile.username,
    payload.profile.role,
    payload.profile.avatarIconId,
    payload.profile.visible,
    payload.scene.zoneId,
    sceneCenter[0],
    sceneCenter[1],
  ]);
}

function getCanonicalProfileId(feature: { id?: unknown; properties?: Record<string, unknown> | null }) {
  return String(feature.properties?.profile_id ?? feature.properties?.id ?? feature.id ?? "");
}

/** Remember canonical synchronization without surrendering owner rendering. */
export function isOnboardingProfileAvailableInCanonicalAvatarSource(
  map: MapLibreMap,
  profileId: string,
) {
  if (!profileId) return false;
  let observedProfileIds = canonicalProfileIdsByMap.get(map);
  if (observedProfileIds?.has(profileId)) return true;
  if (!map.getSource(CANONICAL_AVATAR_SOURCE_ID)) return false;

  try {
    const found = map.querySourceFeatures(CANONICAL_AVATAR_SOURCE_ID, {
      sourceLayer: CANONICAL_AVATAR_SOURCE_LAYER,
      filter: ["==", ["get", "profile_id"], profileId],
    }).some((feature) => getCanonicalProfileId(feature) === profileId);
    if (!found) return false;
    if (!observedProfileIds) {
      observedProfileIds = new Set<string>();
      canonicalProfileIdsByMap.set(map, observedProfileIds);
    }
    observedProfileIds.add(profileId);
    return true;
  } catch {
    // Vector tiles may be between style/source states. The next sourcedata
    // event retries without disturbing the currently visible fallback.
    return false;
  }
}

function createSourceData(payload: MusicSceneOnboardingPayload) {
  const sceneCenter = getOnboardingSceneCenter(payload);
  return {
    type: "FeatureCollection" as const,
    // Public visibility controls the canonical catalogue entry. The owner must
    // always see their own host locally, including in private/ghost mode.
    features: [{
      type: "Feature" as const,
      id: payload.profile.profileId,
      geometry: {
        type: "Point" as const,
        // The selected scene visual centre is shared with the arrival camera so the
        // host remains the unmistakable anchor of its musical district.
        coordinates: sceneCenter,
      },
      properties: {
        profile_id: payload.profile.profileId,
        artist_name: payload.profile.username,
        display_name: payload.profile.username,
        role: payload.profile.role,
        primary_role_label: payload.profile.role,
        avatar_icon_id: payload.profile.avatarIconId,
        zone_id: payload.scene.zoneId,
        zone_name: `${payload.scene.label}, ${payload.city.result.label}`,
        district_id: payload.scene.zoneId,
        city: payload.city.result.label,
        grade: 1,
        grade_level: 1,
        grade_stars: 1,
        grade_tier: "rookie",
        grade_color: "#FFFFFF",
        is_current_user: true,
        cluster_level: "avatar",
        alwaysShowLabel: true,
      },
    }],
  };
}

export function ensureOnboardingCurrentUserOverlay(
  map: MapLibreMap,
  payload: MusicSceneOnboardingPayload,
) {
  overlayVisibilityByMap.set(map, true);
  const data = createSourceData(payload);
  const payloadSignature = getPayloadSignature(payload);
  const existingSource = map.getSource(ONBOARDING_CURRENT_USER_SOURCE_ID) as GeoJSONSource | undefined;
  let mutated = false;
  if (existingSource) {
    if (overlayPayloadSignatures.get(map) !== payloadSignature) {
      existingSource.setData(data);
      mutated = true;
    }
  } else {
    map.addSource(ONBOARDING_CURRENT_USER_SOURCE_ID, { type: "geojson", data });
    mutated = true;
  }
  overlayPayloadSignatures.set(map, payloadSignature);

  if (!map.getLayer(AURA_LAYER_ID)) {
    map.addLayer({
      id: AURA_LAYER_ID,
      type: "circle",
      source: ONBOARDING_CURRENT_USER_SOURCE_ID,
      minzoom: AVATAR_VISIBLE_MIN_ZOOM,
      paint: {
        "circle-radius": AVATAR_GROUND_REPERE_OUTER_RADIUS,
        "circle-color": "rgba(126, 76, 255, 0.04)",
        "circle-opacity": 1,
        "circle-blur": 0,
        "circle-stroke-color": "rgba(190, 164, 255, 0.92)",
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0.92,
        "circle-pitch-alignment": AVATAR_GROUND_REPERE_PITCH_ALIGNMENT,
        "circle-pitch-scale": AVATAR_GROUND_REPERE_PITCH_SCALE,
      },
    });
    mutated = true;
  }

  if (!map.getLayer(AURA_INNER_LAYER_ID)) {
    map.addLayer({
      id: AURA_INNER_LAYER_ID,
      type: "circle",
      source: ONBOARDING_CURRENT_USER_SOURCE_ID,
      minzoom: AVATAR_VISIBLE_MIN_ZOOM,
      paint: {
        "circle-radius": AVATAR_GROUND_REPERE_INNER_RADIUS,
        "circle-color": "rgba(126, 76, 255, 0.08)",
        "circle-opacity": 1,
        "circle-blur": 0,
        "circle-stroke-color": "rgba(190, 164, 255, 0.82)",
        "circle-stroke-width": 1.35,
        "circle-stroke-opacity": 0.72,
        "circle-pitch-alignment": AVATAR_GROUND_REPERE_PITCH_ALIGNMENT,
        "circle-pitch-scale": AVATAR_GROUND_REPERE_PITCH_SCALE,
      },
    });
    mutated = true;
  }

  if (!map.getLayer(ONBOARDING_CURRENT_USER_AVATAR_LAYER_ID)) {
    map.addLayer({
      id: ONBOARDING_CURRENT_USER_AVATAR_LAYER_ID,
      type: "symbol",
      source: ONBOARDING_CURRENT_USER_SOURCE_ID,
      minzoom: AVATAR_VISIBLE_MIN_ZOOM,
      layout: {
        "icon-image": ["get", "avatar_icon_id"],
        "icon-size": MVT_STANDARD_AVATAR_ICON_SIZE * HOST_AVATAR_SIZE_MULTIPLIER,
        "icon-anchor": "bottom",
        "icon-offset": ["literal", [0, 0]],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-optional": true,
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "symbol-placement": "point",
        "symbol-sort-key": 9_999_999,
      },
      paint: { "icon-opacity": 1 },
    });
    mutated = true;
  }

  if (!map.getLayer(LABEL_LAYER_ID)) {
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: "symbol",
      source: ONBOARDING_CURRENT_USER_SOURCE_ID,
      minzoom: AVATAR_VISIBLE_MIN_ZOOM,
      layout: {
        "text-field": ["get", "display_name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 15, 12, 18, 15],
        "text-anchor": "top",
        "text-offset": [0, 0.22],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
        "symbol-sort-key": 9_999_999,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(7, 3, 22, 0.94)",
        "text-halo-width": 1.8,
        "text-halo-blur": 0.25,
        "text-opacity": [
          "case",
          ["boolean", ["feature-state", AVATAR_PREPROFILE_LABEL_HIDDEN_STATE], false],
          0,
          1,
        ],
      },
    });
    mutated = true;
  }

  for (const layerId of OVERLAY_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    const isBaseAvatarLayer = BASE_AVATAR_LAYER_IDS.includes(layerId as typeof BASE_AVATAR_LAYER_IDS[number]);
    const shouldBeVisible = !isBaseAvatarLayer || baseAvatarVisibilityByMap.get(map) !== false;
    const nextVisibility = shouldBeVisible ? "visible" : "none";
    if (map.getLayoutProperty(layerId, "visibility") !== nextVisibility) {
      map.setLayoutProperty(layerId, "visibility", nextVisibility);
      mutated = true;
    }
    if (mutated) map.moveLayer(layerId);
  }
  if (mutated) map.triggerRepaint();
}

/**
 * Hide only the miniature owner avatar and its ground label while the enlarged
 * profile is open. This is a one-shot layer visibility switch: no render loop,
 * camera observer or per-frame computation is installed.
 */
export function setOnboardingCurrentUserBaseVisibility(
  map: MapLibreMap,
  visible: boolean,
) {
  baseAvatarVisibilityByMap.set(map, visible);
  if (overlayVisibilityByMap.get(map) !== true) return;

  let mutated = false;
  const nextVisibility = visible ? "visible" : "none";
  for (const layerId of BASE_AVATAR_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    if (map.getLayoutProperty(layerId, "visibility") === nextVisibility) continue;
    map.setLayoutProperty(layerId, "visibility", nextVisibility);
    mutated = true;
  }
  if (mutated) map.triggerRepaint();
}

export function hideOnboardingCurrentUserOverlay(map: MapLibreMap) {
  overlayVisibilityByMap.set(map, false);
  let mutated = false;
  for (const layerId of OVERLAY_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;
    if (map.getLayoutProperty(layerId, "visibility") !== "none") {
      map.setLayoutProperty(layerId, "visibility", "none");
      mutated = true;
    }
  }
  if (mutated) map.triggerRepaint();
}

export function removeOnboardingCurrentUserOverlay(map: MapLibreMap) {
  let mutated = false;
  for (const layerId of [...OVERLAY_LAYER_IDS].reverse()) {
    if (!map.getLayer(layerId)) continue;
    map.removeLayer(layerId);
    mutated = true;
  }
  if (map.getSource(ONBOARDING_CURRENT_USER_SOURCE_ID)) {
    map.removeSource(ONBOARDING_CURRENT_USER_SOURCE_ID);
    mutated = true;
  }
  overlayPayloadSignatures.delete(map);
  overlayVisibilityByMap.delete(map);
  baseAvatarVisibilityByMap.delete(map);
  if (mutated) map.triggerRepaint();
}

/**
 * Keep one authoritative owner marker for the authenticated profile.
 * The canonical MVT copy is suppressed by GlobeMapV2 while this overlay owns
 * host rendering, so backend synchronization can never turn the owner into a
 * visitor popup or create a second avatar.
 */
export function syncOnboardingCurrentUserOverlay(
  map: MapLibreMap,
  payload: MusicSceneOnboardingPayload,
) {
  const canonicalProfileAvailable = isOnboardingProfileAvailableInCanonicalAvatarSource(
    map,
    payload.profile.profileId,
  );
  ensureOnboardingCurrentUserOverlay(map, payload);
  return canonicalProfileAvailable ? "canonical" as const : "fallback" as const;
}
