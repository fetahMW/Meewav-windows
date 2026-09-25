import type {
  CustomLayerInterface,
  Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getMapLibreThreeRenderer } from "./sharedThreeRenderer";

type HiddenGlobeRewardDefinition = {
  key: "gift" | "iphone";
  customLayerId: string;
  hitSourceId: string;
  hitLayerId: string;
  assetUrl: string;
  lngLat: [number, number];
  heightMeters: number;
  groundOffsetMeters: number;
  fallbackElevationMeters: number;
  minimumTerrainElevationMeters: number;
  rotationRadians: number;
  closeZoomEnterRadiusMeters: number;
  closeZoomExitRadiusMeters: number;
  closeCameraMaxZoom: number;
  interactionMinZoom: number;
  hitRadiusPx: number;
  defaultSecretZoom: number;
  defaultPreviewZoom: number;
  reviewWindowKey: "__MEEWAV_HIDDEN_GIFT_REVIEW__" | "__MEEWAV_HIDDEN_IPHONE_REVIEW__";
};

// Intentionally kept private to this module: no label, marker or public catalog
// entry should reveal either treasure location.
const HIDDEN_GIFT_DEFINITION: HiddenGlobeRewardDefinition = {
  key: "gift",
  customLayerId: "meewav-hidden-france-gift-model",
  hitSourceId: "meewav-hidden-france-gift-hit-source",
  hitLayerId: "meewav-hidden-france-gift-hit-layer",
  assetUrl: "/models/hidden-rewards/boite_cadeau_MW_optimisee.glb?v=3",
  lngLat: [6.0716, 44.9501],
  heightMeters: 0.32,
  groundOffsetMeters: 0.07,
  fallbackElevationMeters: 2_518.19,
  minimumTerrainElevationMeters: 600,
  rotationRadians: THREE.MathUtils.degToRad(-18),
  closeZoomEnterRadiusMeters: 420,
  closeZoomExitRadiusMeters: 560,
  closeCameraMaxZoom: 24,
  interactionMinZoom: 17,
  hitRadiusPx: 24,
  defaultSecretZoom: 21.2,
  defaultPreviewZoom: 20.4,
  reviewWindowKey: "__MEEWAV_HIDDEN_GIFT_REVIEW__",
};

const HIDDEN_IPHONE_DEFINITION: HiddenGlobeRewardDefinition = {
  key: "iphone",
  customLayerId: "meewav-hidden-france-iphone-model",
  hitSourceId: "meewav-hidden-france-iphone-hit-source",
  hitLayerId: "meewav-hidden-france-iphone-hit-layer",
  assetUrl: "/models/hidden-rewards/iphone_16_optimized.glb?v=1",
  // A remote high-alpine shelf in the Écrins massif, away from any city.
  lngLat: [6.35775, 44.92162],
  // The source model is phone-sized. Rendering it at 42 cm makes the prize
  // readable like a shoe box while keeping it a genuinely hidden object.
  heightMeters: 0.42,
  groundOffsetMeters: 0.065,
  fallbackElevationMeters: 2_902,
  minimumTerrainElevationMeters: 600,
  rotationRadians: THREE.MathUtils.degToRad(24),
  closeZoomEnterRadiusMeters: 440,
  closeZoomExitRadiusMeters: 590,
  closeCameraMaxZoom: 24,
  interactionMinZoom: 17,
  hitRadiusPx: 28,
  defaultSecretZoom: 21.4,
  defaultPreviewZoom: 20.7,
  reviewWindowKey: "__MEEWAV_HIDDEN_IPHONE_REVIEW__",
};
// The 3D model always remains in the world. Only the generous click target is
// delayed until close range, so zooming out makes the gift naturally smaller
// instead of popping it out of existence.
// The rest of the Globe deliberately stops sooner. Close to the hidden gift,
// a private geographic geofence raises that ceiling to MapLibre's supported
// maximum so a 32 cm object can be inspected at genuinely close range. No
// source or layer is created for this zone: it is camera-only and therefore
// never draws a ring on the map.
const HIDDEN_GIFT_CLOSE_ZOOM_ENTER_RADIUS_METERS = 420;
const HIDDEN_GIFT_CLOSE_ZOOM_EXIT_RADIUS_METERS = 560;
// Real-world footprint: roughly 46 × 35 × 32 cm with the current GLB ratio.
// It must read as a small hidden object, never as a landmark.
// Preserve the physical scale while it is readable, then clamp only the last
// few screen pixels. Without this floor, a 32 cm object becomes sub-pixel near
// zoom 16 and is technically rendered but visually indistinguishable from the
// map. This is measured through MapLibre's real camera matrix, so pitch, globe
// projection and viewport size are all accounted for. The floor applies to
// the model itself: there is no marker or halo.
const HIDDEN_GIFT_MIN_SCREEN_SIZE_PX = 2;
const HIDDEN_GIFT_REVIEW_MIN_SCREEN_SIZE_PX = 2.5;
const HIDDEN_GIFT_REVIEW_SCALE_MULTIPLIER = 1.5;
// Numerical guard only. At the Globe's minimum zoom the real multiplier stays
// well below this value, so the final tiny point never pops out of existence.
const HIDDEN_GIFT_MAX_SCREEN_SCALE_MULTIPLIER = 1_000_000;
// Terrain-RGB value sampled from the exact bundled Terrarium tile. It is only
// a first-paint fallback; MapLibre's live terrain sample replaces it as soon
// as the DEM tile becomes available.
const HIDDEN_GIFT_MIN_VALID_TERRAIN_ELEVATION_METERS = 600;

const PULSE_DURATION_MS = 460;
const CELEBRATE_DURATION_MS = 880;
const DISMISS_DURATION_MS = 780;
const REDUCED_MOTION_DURATION_MS = 150;
const INFRASTRUCTURE_RETRY_DELAY_MS = 120;
const INFRASTRUCTURE_RETRY_LIMIT = 100;

type AnimationPhase = "idle" | "pulse" | "celebrate" | "dismiss" | "hidden";

export type HiddenFranceGiftActivation = {
  originalEvent: MouseEvent;
};

export type HiddenFranceGiftLayerOptions = {
  onActivate?: (activation: HiddenFranceGiftActivation) => void | Promise<void>;
  initiallyVisible?: boolean;
  initiallyInteractive?: boolean;
};

export type HiddenFranceIphonePrizeLayerOptions = HiddenFranceGiftLayerOptions;

export type HiddenFranceGiftPreviewFocusOptions = {
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
};

export type HiddenFranceGiftLayerState = {
  phase: AnimationPhase;
  visible: boolean;
  interactive: boolean;
  loaded: boolean;
  rendered: boolean;
};

export type HiddenFranceGiftLayerController = {
  setVisible: (visible: boolean) => void;
  setInteractive: (interactive: boolean) => void;
  pulse: () => Promise<void>;
  celebrate: () => Promise<void>;
  dismiss: () => Promise<void>;
  resetPulse: () => void;
  hideImmediately: () => void;
  focusFromSecretSearch: (options?: HiddenFranceGiftPreviewFocusOptions) => void;
  focusForPreview: (options?: HiddenFranceGiftPreviewFocusOptions) => void;
  getState: () => HiddenFranceGiftLayerState;
  remove: () => void;
};

export type HiddenFranceIphonePrizeLayerController = HiddenFranceGiftLayerController;

type SharedGiftState = HiddenFranceGiftLayerState & {
  animationStartedAt: number;
  animationDurationMs: number;
  animationToken: number;
  visualResetToken: number;
  inspectionMode: boolean;
  cameraZoomZoneUnlocked: boolean;
  cameraZoomUnlockUntil: number;
  cameraMaxZoomBeforeUnlock: number | null;
};

type RegisteredHiddenReward = {
  definition: HiddenGlobeRewardDefinition;
  state: SharedGiftState;
};

const hiddenRewardStatesByMap = new WeakMap<MapLibreMap, Map<string, RegisteredHiddenReward>>();

function getHiddenRewardRegistry(map: MapLibreMap) {
  let registry = hiddenRewardStatesByMap.get(map);
  if (!registry) {
    registry = new Map();
    hiddenRewardStatesByMap.set(map, registry);
  }
  return registry;
}

function getDistanceMeters(
  from: { lng: number; lat: number },
  to: readonly [number, number],
) {
  const earthRadiusMeters = 6_371_008.8;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to[1]);
  const latitudeDelta = toLatitude - fromLatitude;
  const longitudeDelta = toRadians(to[0] - from.lng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const normalizedHaversine = Math.min(1, Math.max(0, haversine));
  return earthRadiusMeters * 2 * Math.atan2(
    Math.sqrt(normalizedHaversine),
    Math.sqrt(1 - normalizedHaversine),
  );
}

export function resolveHiddenGiftZoomZoneUnlocked(
  distanceMeters: number,
  previouslyUnlocked: boolean,
  enterRadiusMeters = HIDDEN_GIFT_CLOSE_ZOOM_ENTER_RADIUS_METERS,
  exitRadiusMeters = HIDDEN_GIFT_CLOSE_ZOOM_EXIT_RADIUS_METERS,
) {
  if (!Number.isFinite(distanceMeters)) return false;
  const radius = previouslyUnlocked
    ? exitRadiusMeters
    : enterRadiusMeters;
  return distanceMeters <= radius;
}

/**
 * Returns the effective camera ceiling without exposing the gift position to
 * the Globe UI. Outside the mounted, visible treasure's circular geofence,
 * the caller's normal ceiling is returned byte-for-byte.
 */
export function resolveHiddenFranceGiftCameraMaxZoom(
  map: MapLibreMap | null | undefined,
  standardMaxZoom: number,
) {
  if (!map) return standardMaxZoom;
  const registry = hiddenRewardStatesByMap.get(map);
  if (!registry || registry.size === 0) return standardMaxZoom;

  const center = map.getCenter();
  let effectiveMaxZoom = standardMaxZoom;
  registry.forEach(({ definition, state }) => {
    if (!state.visible || state.phase === "hidden") {
      state.cameraZoomZoneUnlocked = false;
      return;
    }

    const distanceMeters = getDistanceMeters(center, definition.lngLat);
    state.cameraZoomZoneUnlocked = resolveHiddenGiftZoomZoneUnlocked(
      distanceMeters,
      state.cameraZoomZoneUnlocked,
      definition.closeZoomEnterRadiusMeters,
      definition.closeZoomExitRadiusMeters,
    );
    const focusUnlockActive = state.cameraZoomUnlockUntil > now();
    if (state.cameraZoomZoneUnlocked || focusUnlockActive) {
      effectiveMaxZoom = Math.max(effectiveMaxZoom, definition.closeCameraMaxZoom);
    }
  });
  return effectiveMaxZoom;
}

type AnimationCompletion = {
  token: number;
  resolve: () => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type PreparedGiftModel = {
  root: THREE.Group;
  modelHeightUnits: number;
  boundsCorners: THREE.Vector4[];
  materials: THREE.MeshStandardMaterial[];
};

type PreparedParticles = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positionAttribute: THREE.BufferAttribute;
  directions: Float32Array;
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function resolveHiddenGiftTerrainElevation(
  queriedElevation: number | null | undefined,
  fallbackElevation: number,
  minimumValidElevation = HIDDEN_GIFT_MIN_VALID_TERRAIN_ELEVATION_METERS,
) {
  return typeof queriedElevation === "number"
    && Number.isFinite(queriedElevation)
    && queriedElevation >= minimumValidElevation
    ? queriedElevation
    : fallbackElevation;
}

export function resolveHiddenGiftScreenScaleMultiplier(
  projectedSizePx: number,
  minimumScreenSizePx: number,
) {
  if (!Number.isFinite(projectedSizePx) || projectedSizePx <= 0) return 1;
  if (!Number.isFinite(minimumScreenSizePx) || minimumScreenSizePx <= 0) return 1;
  return Math.min(
    HIDDEN_GIFT_MAX_SCREEN_SCALE_MULTIPLIER,
    Math.max(1, minimumScreenSizePx / projectedSizePx),
  );
}

export function setHiddenGiftClipSpaceScaleMatrix(
  target: THREE.Matrix4,
  scaleMultiplier: number,
  anchorX: number,
  anchorY: number,
) {
  return target.set(
    scaleMultiplier, 0, 0, (1 - scaleMultiplier) * anchorX,
    0, scaleMultiplier, 0, (1 - scaleMultiplier) * anchorY,
    0, 0, 1, 0,
    0, 0, 0, 1,
  );
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Points)) return;

    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function createGiftMaterial(baseMaterial: THREE.Material, hasVertexColors: boolean) {
  const material = baseMaterial instanceof THREE.MeshStandardMaterial
    || baseMaterial instanceof THREE.MeshPhysicalMaterial
    ? baseMaterial.clone()
    : new THREE.MeshStandardMaterial({ color: "#ffffff" });

  // The optimized GLB carries its palette as vertex colors. Preserve it and
  // only add a restrained emissive lift so the gift remains readable at night.
  material.vertexColors = hasVertexColors;
  if (hasVertexColors) material.color.set("#ffffff");
  material.roughness = Math.max(0.34, Math.min(0.62, material.roughness));
  material.metalness = Math.max(0.06, Math.min(0.32, material.metalness));
  material.emissive.set("#19052e");
  material.emissiveIntensity = 0.1;
  material.transparent = false;
  material.opacity = 1;
  // MapLibre's model matrix mirrors the X axis. Without double-sided
  // rendering, the optimized gift can be entirely removed by back-face
  // culling even though its layer and hit target are correctly positioned.
  material.side = THREE.DoubleSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.needsUpdate = true;
  return material;
}

function prepareGiftModel(
  rawModel: THREE.Object3D,
  definition: HiddenGlobeRewardDefinition,
): PreparedGiftModel {
  const model = rawModel.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const modelHeightUnits = Math.max(size.y, 0.0001);
  const materials: THREE.MeshStandardMaterial[] = [];

  model.position.set(-center.x, -box.min.y, -center.z);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
    const hasVertexColors = Boolean(child.geometry.getAttribute("color"));
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const giftMaterials = sourceMaterials.map((sourceMaterial) => {
      const giftMaterial = createGiftMaterial(sourceMaterial, hasVertexColors);
      materials.push(giftMaterial);
      return giftMaterial;
    });
    child.material = Array.isArray(child.material) ? giftMaterials : giftMaterials[0];
  });

  const root = new THREE.Group();
  root.rotation.y = definition.rotationRadians;
  root.add(model);
  const boundsCorners: THREE.Vector4[] = [];
  for (const x of [-size.x / 2, size.x / 2]) {
    for (const y of [0, size.y]) {
      for (const z of [-size.z / 2, size.z / 2]) {
        boundsCorners.push(new THREE.Vector4(x, y, z, 1));
      }
    }
  }
  return { root, modelHeightUnits, boundsCorners, materials };
}

function measureProjectedGiftSizePx(
  projectionMatrix: THREE.Matrix4,
  modelWorldMatrix: THREE.Matrix4,
  boundsCorners: THREE.Vector4[],
  viewportWidth: number,
  viewportHeight: number,
  combinedMatrix: THREE.Matrix4,
  projectedCorner: THREE.Vector4,
) {
  if (viewportWidth <= 0 || viewportHeight <= 0 || boundsCorners.length === 0) return 0;

  combinedMatrix.multiplyMatrices(projectionMatrix, modelWorldMatrix);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let visibleCornerCount = 0;

  for (const corner of boundsCorners) {
    projectedCorner.copy(corner).applyMatrix4(combinedMatrix);
    if (!Number.isFinite(projectedCorner.w) || projectedCorner.w <= 0.000_001) continue;
    const ndcX = projectedCorner.x / projectedCorner.w;
    const ndcY = projectedCorner.y / projectedCorner.w;
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) continue;
    const screenX = (ndcX * 0.5 + 0.5) * viewportWidth;
    const screenY = (0.5 - ndcY * 0.5) * viewportHeight;
    minX = Math.min(minX, screenX);
    maxX = Math.max(maxX, screenX);
    minY = Math.min(minY, screenY);
    maxY = Math.max(maxY, screenY);
    visibleCornerCount += 1;
  }

  if (visibleCornerCount < 2) return 0;
  return Math.max(maxX - minX, maxY - minY);
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function createCelebrationParticles(): PreparedParticles {
  const particleCount = 30;
  const positions = new Float32Array(particleCount * 3);
  const directions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const palette = [
    new THREE.Color("#ffffff"),
    new THREE.Color("#d8b4ff"),
    new THREE.Color("#a45bff"),
    new THREE.Color("#f0abfc"),
  ];
  const random = seededRandom(0x4d_57_47_49);

  for (let index = 0; index < particleCount; index += 1) {
    const directionIndex = index * 3;
    const angle = random() * Math.PI * 2;
    const planar = 0.36 + random() * 0.72;
    const vertical = 0.34 + random() * 1.05;
    directions[directionIndex] = Math.cos(angle) * planar;
    directions[directionIndex + 1] = vertical;
    directions[directionIndex + 2] = Math.sin(angle) * planar;

    const color = palette[index % palette.length];
    colors[directionIndex] = color.r;
    colors[directionIndex + 1] = color.g;
    colors[directionIndex + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.048,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;
  return { points, positionAttribute, directions };
}

function setMaterialOpacity(materials: THREE.MeshStandardMaterial[], opacity: number) {
  const transparent = opacity < 0.999;
  materials.forEach((material) => {
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = opacity;
    material.depthWrite = !transparent;
  });
}

function resetGiftVisuals(
  root: THREE.Group,
  materials: THREE.MeshStandardMaterial[],
  particles: PreparedParticles,
  definition: HiddenGlobeRewardDefinition,
) {
  root.visible = true;
  root.scale.setScalar(1);
  root.rotation.y = definition.rotationRadians;
  setMaterialOpacity(materials, 1);
  particles.points.visible = false;
  particles.points.material.opacity = 0;
}

function updateParticlePositions(particles: PreparedParticles, progress: number, dismissing: boolean) {
  const positions = particles.positionAttribute.array as Float32Array;
  const distance = easeOutCubic(progress) * (dismissing ? 1.2 : 0.78);
  const gravity = progress * progress * (dismissing ? 0.48 : 0.28);

  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = particles.directions[index] * distance;
    positions[index + 1] = 0.08 + particles.directions[index + 1] * distance - gravity;
    positions[index + 2] = particles.directions[index + 2] * distance;
  }
  particles.positionAttribute.needsUpdate = true;
}

function createHitFeatureCollection(
  definition: HiddenGlobeRewardDefinition,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { kind: "treasure", reward: definition.key },
      geometry: {
        type: "Point",
        coordinates: definition.lngLat,
      },
    }],
  };
}

function createHiddenGiftCustomLayer(
  map: MapLibreMap,
  state: SharedGiftState,
  definition: HiddenGlobeRewardDefinition,
  onAnimationComplete: (token: number) => void,
): CustomLayerInterface {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const mapMatrix = new THREE.Matrix4();
  const modelMatrix = new THREE.Matrix4();
  const localScaleMatrix = new THREE.Matrix4();
  const giftRotationMatrix = new THREE.Matrix4();
  const clipSpaceScaleMatrix = new THREE.Matrix4();
  const projectedGiftMatrix = new THREE.Matrix4();
  const projectedGiftCorner = new THREE.Vector4();
  const giftScreenAnchor = new THREE.Vector4();
  const particles = createCelebrationParticles();
  let renderer: THREE.WebGLRenderer | null = null;
  let giftRoot: THREE.Group | null = null;
  let giftMaterials: THREE.MeshStandardMaterial[] = [];
  let giftBoundsCorners: THREE.Vector4[] = [];
  let modelHeightUnits = 1;
  let removed = false;
  let appliedVisualResetToken = state.visualResetToken;

  scene.add(particles.points);
  scene.add(new THREE.HemisphereLight(0xf7efff, 0x140b25, 1.42));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
  keyLight.position.set(-5, -4, 8);
  scene.add(keyLight);

  const violetRim = new THREE.DirectionalLight(0xb66dff, 0.82);
  violetRim.position.set(6, 4, 5);
  scene.add(violetRim);

  function updateAnimation(animationProgress: number) {
    if (!giftRoot) return;
    const progress = clamp01(animationProgress);

    if (state.phase === "pulse") {
      const pulse = Math.sin(progress * Math.PI);
      giftRoot.scale.setScalar(1 + pulse * 0.1);
      giftRoot.rotation.y = definition.rotationRadians + pulse * 0.18;
      return;
    }

    const isDismiss = state.phase === "dismiss";
    if (state.phase !== "celebrate" && !isDismiss) return;

    particles.points.visible = !prefersReducedMotion();
    if (particles.points.visible) {
      updateParticlePositions(particles, progress, isDismiss);
      particles.points.material.opacity = Math.sin(progress * Math.PI) * (isDismiss ? 1 : 0.86);
    }

    if (isDismiss) {
      const swell = progress < 0.18 ? progress / 0.18 : 1;
      const collapse = progress < 0.18 ? 1 : 1 - easeOutCubic((progress - 0.18) / 0.82);
      giftRoot.scale.setScalar((1 + swell * 0.18) * collapse);
      giftRoot.rotation.y = definition.rotationRadians + easeOutCubic(progress) * Math.PI * 2.2;
      setMaterialOpacity(giftMaterials, 1 - easeOutCubic(clamp01((progress - 0.12) / 0.88)));
      return;
    }

    const lift = Math.sin(progress * Math.PI);
    giftRoot.scale.setScalar(1 + lift * 0.17);
    giftRoot.rotation.y = definition.rotationRadians + easeOutCubic(progress) * Math.PI * 1.15;
  }

  return {
    id: definition.customLayerId,
    type: "custom",
    renderingMode: "3d",

    onAdd(_map, gl) {
      removed = false;
      renderer = getMapLibreThreeRenderer(map, gl);

      // This asset is deliberately non-Draco. A direct loader keeps the hidden
      // reward's download and decoder footprint close to zero.
      const loader = new GLTFLoader();
      loader.load(
        definition.assetUrl,
        (gltf) => {
          if (removed) {
            disposeObject3D(gltf.scene);
            return;
          }
          const prepared = prepareGiftModel(gltf.scene, definition);
          giftRoot = prepared.root;
          giftMaterials = prepared.materials;
          giftBoundsCorners = prepared.boundsCorners;
          modelHeightUnits = prepared.modelHeightUnits;
          giftRoot.visible = state.phase !== "hidden" && state.visible;
          scene.add(giftRoot);
          state.loaded = true;
          map.triggerRepaint();
        },
        undefined,
        () => {
          state.loaded = false;
        },
      );
    },

    render(_gl, options) {
      state.rendered = false;
      if (!renderer || !giftRoot || !state.visible || state.phase === "hidden") return;

      if (appliedVisualResetToken !== state.visualResetToken) {
        resetGiftVisuals(giftRoot, giftMaterials, particles, definition);
        appliedVisualResetToken = state.visualResetToken;
      }

      const terrain = map.getTerrain() as { exaggeration?: number } | null;
      const queriedElevation = terrain ? map.queryTerrainElevation(definition.lngLat) : null;
      const fallbackElevation = definition.fallbackElevationMeters
        * Math.max(0, terrain?.exaggeration ?? 1);
      const altitudeMeters = terrain
        ? resolveHiddenGiftTerrainElevation(
          queriedElevation,
          fallbackElevation,
          definition.minimumTerrainElevationMeters,
        ) + definition.groundOffsetMeters
        : definition.groundOffsetMeters;
      const transform = (map as unknown as {
        transform?: {
          getMatrixForModel?: (lngLat: { lng: number; lat: number }, altitude: number) => number[];
        };
      }).transform;
      const mapModelMatrix = transform?.getMatrixForModel?.(
        { lng: definition.lngLat[0], lat: definition.lngLat[1] },
        altitudeMeters,
      );
      if (!mapModelMatrix) return;

      if (state.phase !== "idle") {
        const elapsed = Math.max(0, now() - state.animationStartedAt);
        const progress = clamp01(elapsed / Math.max(1, state.animationDurationMs));
        updateAnimation(progress);
        if (progress >= 1) {
          onAnimationComplete(state.animationToken);
        } else {
          map.triggerRepaint();
        }
      }

      giftMaterials.forEach((material) => {
        material.emissiveIntensity = state.inspectionMode ? 0.58 : 0.1;
      });
      const inspectionScale = state.inspectionMode ? HIDDEN_GIFT_REVIEW_SCALE_MULTIPLIER : 1;
      const modelScaleMeters = (definition.heightMeters * inspectionScale) / modelHeightUnits;
      modelMatrix.fromArray(mapModelMatrix);
      localScaleMatrix.makeScale(modelScaleMeters, modelScaleMeters, modelScaleMeters);
      camera.projectionMatrix = mapMatrix
        .fromArray(options.defaultProjectionData.mainMatrix)
        .multiply(modelMatrix)
        .multiply(localScaleMatrix);
      // Measure the model through the real MapLibre projection, but leave the
      // animation scale out of the measurement. Otherwise the visibility
      // floor would cancel the collapse animation during collection.
      giftRotationMatrix.makeRotationY(giftRoot.rotation.y);
      const canvasRect = map.getCanvas().getBoundingClientRect();
      const projectedSizePx = measureProjectedGiftSizePx(
        camera.projectionMatrix,
        giftRotationMatrix,
        giftBoundsCorners,
        canvasRect.width,
        canvasRect.height,
        projectedGiftMatrix,
        projectedGiftCorner,
      );
      const minimumScreenSizePx = state.inspectionMode
        ? HIDDEN_GIFT_REVIEW_MIN_SCREEN_SIZE_PX
        : HIDDEN_GIFT_MIN_SCREEN_SIZE_PX;
      const screenScaleMultiplier = resolveHiddenGiftScreenScaleMultiplier(
        projectedSizePx,
        minimumScreenSizePx,
      );
      let appliedScreenScaleMultiplier = 1;
      if (screenScaleMultiplier > 1) {
        giftScreenAnchor.set(0, 0, 0, 1).applyMatrix4(camera.projectionMatrix);
        if (Number.isFinite(giftScreenAnchor.w) && giftScreenAnchor.w > 0.000_001) {
          const anchorX = giftScreenAnchor.x / giftScreenAnchor.w;
          const anchorY = giftScreenAnchor.y / giftScreenAnchor.w;
          // Scale x/y in clip space around the gift's geographic anchor. Its
          // depth and physical world footprint remain unchanged: only the
          // final few screen pixels are protected from disappearing.
          setHiddenGiftClipSpaceScaleMatrix(
            clipSpaceScaleMatrix,
            screenScaleMultiplier,
            anchorX,
            anchorY,
          );
          camera.projectionMatrix.premultiply(clipSpaceScaleMatrix);
          appliedScreenScaleMultiplier = screenScaleMultiplier;
        }
      }

      renderer.resetState();
      renderer.clearDepth();
      renderer.render(scene, camera);
      state.rendered = true;
      if (import.meta.env.DEV && state.inspectionMode && typeof window !== "undefined") {
        const screenPoint = map.project(definition.lngLat);
        const reviewWindow = window as unknown as Window & Record<string, unknown>;
        reviewWindow[definition.reviewWindowKey] = {
          loaded: state.loaded,
          rendered: state.rendered,
          zoom: map.getZoom(),
          altitudeMeters,
          projectedSizePx: projectedSizePx * appliedScreenScaleMultiplier,
          screenScaleMultiplier: appliedScreenScaleMultiplier,
          terrainEnabled: Boolean(terrain),
          screenPoint: { x: screenPoint.x, y: screenPoint.y },
        };
      }
    },

    onRemove() {
      removed = true;
      if (giftRoot) {
        scene.remove(giftRoot);
        disposeObject3D(giftRoot);
        giftRoot = null;
      }
      scene.remove(particles.points);
      disposeObject3D(particles.points);
      renderer = null;
      giftMaterials = [];
      giftBoundsCorners = [];
      state.loaded = false;
      state.rendered = false;
    },
  };
}

/**
 * Mounts the hidden reward as an independent MapLibre/Three controller.
 *
 * It deliberately does not use the hero-landmark registry: the treasure must
 * remain available at its remote position regardless of the selected city.
 */
function mountHiddenGlobeRewardLayer(
  map: MapLibreMap,
  definition: HiddenGlobeRewardDefinition,
  options: HiddenFranceGiftLayerOptions,
): HiddenFranceGiftLayerController {
  const state: SharedGiftState = {
    phase: "idle",
    visible: options.initiallyVisible ?? true,
    interactive: options.initiallyInteractive ?? true,
    loaded: false,
    rendered: false,
    animationStartedAt: 0,
    animationDurationMs: 0,
    animationToken: 0,
    visualResetToken: 0,
    inspectionMode: false,
    cameraZoomZoneUnlocked: false,
    cameraZoomUnlockUntil: 0,
    cameraMaxZoomBeforeUnlock: null,
  };
  const registry = getHiddenRewardRegistry(map);
  registry.set(definition.key, { definition, state });
  let destroyed = false;
  let animationCompletion: AnimationCompletion | null = null;
  let infrastructureRetryId: ReturnType<typeof setTimeout> | null = null;
  let infrastructureRetryCount = 0;
  let reconcilingInfrastructure = false;

  const syncCameraZoomLimit = () => {
    if (destroyed) return;
    const standardMaxZoom = state.cameraMaxZoomBeforeUnlock ?? map.getMaxZoom();
    const effectiveMaxZoom = resolveHiddenFranceGiftCameraMaxZoom(map, standardMaxZoom);
    const shouldUnlock = effectiveMaxZoom > standardMaxZoom + 0.001;

    if (shouldUnlock && state.cameraMaxZoomBeforeUnlock === null) {
      state.cameraMaxZoomBeforeUnlock = map.getMaxZoom();
    }

    if (Math.abs(map.getMaxZoom() - effectiveMaxZoom) > 0.001) {
      map.setMaxZoom(effectiveMaxZoom);
    }

    if (!shouldUnlock && state.cameraMaxZoomBeforeUnlock !== null) {
      const restoredMaxZoom = state.cameraMaxZoomBeforeUnlock;
      state.cameraMaxZoomBeforeUnlock = null;
      if (Math.abs(map.getMaxZoom() - restoredMaxZoom) > 0.001) {
        map.setMaxZoom(restoredMaxZoom);
      }
    }
  };

  const restoreCameraZoomLimit = () => {
    if (state.cameraMaxZoomBeforeUnlock === null) return;
    const restoredMaxZoom = state.cameraMaxZoomBeforeUnlock;
    state.cameraMaxZoomBeforeUnlock = null;
    state.cameraZoomZoneUnlocked = false;
    state.cameraZoomUnlockUntil = 0;
    if (Math.abs(map.getMaxZoom() - restoredMaxZoom) > 0.001) {
      map.setMaxZoom(restoredMaxZoom);
    }
  };

  const removeInfrastructure = () => {
    if (map.getLayer(definition.hitLayerId)) {
      map.removeLayer(definition.hitLayerId);
    }
    if (map.getLayer(definition.customLayerId)) {
      map.removeLayer(definition.customLayerId);
    }
    if (map.getSource(definition.hitSourceId)) {
      map.removeSource(definition.hitSourceId);
    }
  };

  const finishPendingPromise = () => {
    if (!animationCompletion) return;
    clearTimeout(animationCompletion.timeoutId);
    const resolve = animationCompletion.resolve;
    animationCompletion = null;
    resolve();
  };

  function completeAnimation(token: number) {
    if (token !== state.animationToken) return;
    const completedPhase = state.phase;
    if (completedPhase === "dismiss") {
      state.phase = "hidden";
      state.visible = false;
      state.interactive = false;
      queueMicrotask(() => {
        removeInfrastructure();
        syncCameraZoomLimit();
      });
    } else if (completedPhase !== "hidden") {
      state.phase = "idle";
      state.visualResetToken += 1;
      map.triggerRepaint();
    }
    finishPendingPromise();
  }

  const clearInfrastructureRetry = () => {
    if (infrastructureRetryId === null) return;
    clearTimeout(infrastructureRetryId);
    infrastructureRetryId = null;
  };

  const hasCompleteInfrastructure = () => Boolean(
    map.getSource(definition.hitSourceId)
    && map.getLayer(definition.customLayerId)
    && map.getLayer(definition.hitLayerId),
  );

  const scheduleInfrastructureRetry = () => {
    if (
      destroyed
      || !state.visible
      || state.phase === "hidden"
      || infrastructureRetryId !== null
      || infrastructureRetryCount >= INFRASTRUCTURE_RETRY_LIMIT
    ) return;

    infrastructureRetryId = setTimeout(() => {
      infrastructureRetryId = null;
      infrastructureRetryCount += 1;
      ensureInfrastructure();
    }, INFRASTRUCTURE_RETRY_DELAY_MS);
  };

  function ensureInfrastructure() {
    if (destroyed || !state.visible || state.phase === "hidden" || reconcilingInfrastructure) return;
    if (!map.isStyleLoaded()) {
      scheduleInfrastructureRetry();
      return;
    }

    reconcilingInfrastructure = true;
    try {
      if (!map.getSource(definition.hitSourceId)) {
        map.addSource(definition.hitSourceId, {
          type: "geojson",
          data: createHitFeatureCollection(definition),
        });
      }
      if (!map.getLayer(definition.customLayerId)) {
        const beforeLayerId = map.getLayer("labels_cities") ? "labels_cities" : undefined;
        map.addLayer(createHiddenGiftCustomLayer(map, state, definition, completeAnimation), beforeLayerId);
      }
      if (!map.getLayer(definition.hitLayerId)) {
        map.addLayer({
          id: definition.hitLayerId,
          type: "circle",
          source: definition.hitSourceId,
          minzoom: definition.interactionMinZoom,
          paint: {
            "circle-radius": definition.hitRadiusPx,
            // Purely technical hit target. It must never disclose the treasure
            // with a visible ring, including on the local review route.
            "circle-color": "#ffffff",
            "circle-opacity": 0,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 0,
            "circle-stroke-opacity": 0,
            "circle-pitch-alignment": "viewport",
            "circle-pitch-scale": "viewport",
          },
        });
      }
    } catch {
      // MapLibre can emit style lifecycle events while its style object is
      // still being replaced. A short retry restores both rewards as soon as
      // the new style is writable instead of losing them until a full reload.
      scheduleInfrastructureRetry();
      return;
    } finally {
      reconcilingInfrastructure = false;
    }

    if (hasCompleteInfrastructure()) {
      infrastructureRetryCount = 0;
      clearInfrastructureRetry();
    } else {
      scheduleInfrastructureRetry();
    }
    map.triggerRepaint();
  }

  const runAnimation = (phase: Exclude<AnimationPhase, "idle" | "hidden">, durationMs: number) => {
    if (destroyed || !state.visible || state.phase === "hidden") return Promise.resolve();
    finishPendingPromise();
    state.phase = phase;
    state.animationStartedAt = now();
    state.animationDurationMs = prefersReducedMotion() ? REDUCED_MOTION_DURATION_MS : durationMs;
    state.animationToken += 1;
    const token = state.animationToken;
    map.triggerRepaint();

    return new Promise<void>((resolve) => {
      const timeoutId = setTimeout(
        () => completeAnimation(token),
        state.animationDurationMs + 90,
      );
      animationCompletion = { token, resolve, timeoutId };
    });
  };

  const handleCanvasClick = (event: MouseEvent) => {
    if (destroyed || !state.visible || !state.interactive || state.phase === "hidden") return;
    if (
      map.getZoom() < definition.interactionMinZoom
      || !map.getLayer(definition.hitLayerId)
    ) return;
    const rect = map.getCanvas().getBoundingClientRect();
    const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
    let hit: boolean;
    try {
      hit = map.queryRenderedFeatures(point, { layers: [definition.hitLayerId] }).length > 0;
    } catch {
      return;
    }
    if (!hit) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void runAnimation("pulse", PULSE_DURATION_MS);
    void options.onActivate?.({ originalEvent: event });
  };

  const handleStyleLifecycle = () => {
    if (!hasCompleteInfrastructure()) ensureInfrastructure();
  };
  const handleCameraMove = () => syncCameraZoomLimit();
  const handleCameraMoveEnd = () => {
    syncCameraZoomLimit();
    if (!hasCompleteInfrastructure()) ensureInfrastructure();
  };
  map.on("load", handleStyleLifecycle);
  map.on("style.load", handleStyleLifecycle);
  map.on("styledata", handleStyleLifecycle);
  map.on("idle", handleStyleLifecycle);
  map.on("move", handleCameraMove);
  map.on("moveend", handleCameraMoveEnd);
  map.getCanvas().addEventListener("click", handleCanvasClick, { capture: true });
  ensureInfrastructure();
  syncCameraZoomLimit();

  return {
    setVisible(visible) {
      if (destroyed) return;
      if (state.visible === visible) {
        // A MapLibre style reset can remove the custom layer while the reward
        // controller still remembers `visible: true`. Reconcile the real map
        // infrastructure even when the requested logical state is unchanged.
        if (visible) {
          if (state.phase === "hidden") state.phase = "idle";
          ensureInfrastructure();
          map.triggerRepaint();
        }
        syncCameraZoomLimit();
        return;
      }
      state.visible = visible;
      if (visible) {
        state.phase = "idle";
        ensureInfrastructure();
      } else {
        state.phase = "hidden";
        state.interactive = false;
        clearInfrastructureRetry();
        infrastructureRetryCount = 0;
        finishPendingPromise();
        removeInfrastructure();
      }
      syncCameraZoomLimit();
    },
    setInteractive(interactive) {
      if (destroyed) return;
      state.interactive = interactive;
    },
    pulse() {
      return runAnimation("pulse", PULSE_DURATION_MS);
    },
    celebrate() {
      return runAnimation("celebrate", CELEBRATE_DURATION_MS);
    },
    dismiss() {
      return runAnimation("dismiss", DISMISS_DURATION_MS);
    },
    resetPulse() {
      if (destroyed || state.phase === "hidden") return;
      state.animationToken += 1;
      state.phase = "idle";
      state.visualResetToken += 1;
      finishPendingPromise();
      map.triggerRepaint();
    },
    hideImmediately() {
      if (destroyed) return;
      state.animationToken += 1;
      state.phase = "hidden";
      state.visible = false;
      state.interactive = false;
      clearInfrastructureRetry();
      infrastructureRetryCount = 0;
      finishPendingPromise();
      removeInfrastructure();
      syncCameraZoomLimit();
    },
    focusFromSecretSearch(focusOptions = {}) {
      if (destroyed) return;
      map.stop();
      // A secret search must reveal only the location, never switch on local
      // inspection styling or bypass the campaign's visibility state.
      state.inspectionMode = false;
      state.visualResetToken += 1;
      ensureInfrastructure();
      window.requestAnimationFrame(() => {
        if (destroyed || !state.visible || state.phase === "hidden") return;
        ensureInfrastructure();
        map.triggerRepaint();
      });
      if (map.getLayer(definition.hitLayerId)) {
        map.setPaintProperty(definition.hitLayerId, "circle-opacity", 0);
        map.setPaintProperty(definition.hitLayerId, "circle-stroke-width", 0);
        map.setPaintProperty(definition.hitLayerId, "circle-stroke-opacity", 0);
      }
      map.triggerRepaint();
      const focusDuration = prefersReducedMotion() ? 0 : (focusOptions.duration ?? 1_650);
      state.cameraZoomUnlockUntil = now() + focusDuration + 2_500;
      syncCameraZoomLimit();
      map.flyTo({
        center: definition.lngLat,
        zoom: focusOptions.zoom ?? definition.defaultSecretZoom,
        pitch: focusOptions.pitch ?? 46,
        bearing: focusOptions.bearing ?? -22,
        duration: focusDuration,
        essential: true,
      });
    },
    focusForPreview(focusOptions = {}) {
      if (!import.meta.env.DEV || destroyed) return;
      // The startup sequence can leave an ease/fly transition alive for a few
      // frames. Cancel it first so the explicit inspection destination wins.
      map.stop();
      state.inspectionMode = true;
      state.visualResetToken += 1;
      // The React controller can mount a few frames before MapLibre reports
      // its style as loaded. Re-check here, once the preview hand-off is
      // explicitly ready, so a missed early `style.load` cannot leave the
      // model unmounted while the camera still flies to its coordinates.
      ensureInfrastructure();
      if (map.getLayer(definition.hitLayerId)) {
        map.setPaintProperty(definition.hitLayerId, "circle-radius", 64);
        map.setPaintProperty(definition.hitLayerId, "circle-opacity", 0);
        map.setPaintProperty(definition.hitLayerId, "circle-stroke-width", 0);
        map.setPaintProperty(definition.hitLayerId, "circle-stroke-opacity", 0);
      }
      map.triggerRepaint();
      const focusDuration = prefersReducedMotion() ? 0 : (focusOptions.duration ?? 1_650);
      state.cameraZoomUnlockUntil = now() + focusDuration + 2_500;
      syncCameraZoomLimit();
      map.flyTo({
        center: definition.lngLat,
        zoom: focusOptions.zoom ?? definition.defaultPreviewZoom,
        pitch: focusOptions.pitch ?? 46,
        bearing: focusOptions.bearing ?? -22,
        duration: focusDuration,
        essential: true,
      });
    },
    getState() {
      return {
        phase: state.phase,
        visible: state.visible,
        interactive: state.interactive,
        loaded: state.loaded,
        rendered: state.rendered,
      };
    },
    remove() {
      if (destroyed) return;
      destroyed = true;
      state.animationToken += 1;
      clearInfrastructureRetry();
      finishPendingPromise();
      map.off("load", handleStyleLifecycle);
      map.off("style.load", handleStyleLifecycle);
      map.off("styledata", handleStyleLifecycle);
      map.off("idle", handleStyleLifecycle);
      map.off("move", handleCameraMove);
      map.off("moveend", handleCameraMoveEnd);
      map.getCanvas().removeEventListener("click", handleCanvasClick, { capture: true });
      removeInfrastructure();
      restoreCameraZoomLimit();
      const activeRegistry = hiddenRewardStatesByMap.get(map);
      activeRegistry?.delete(definition.key);
      if (activeRegistry?.size === 0) hiddenRewardStatesByMap.delete(map);
    },
  };
}

export function mountHiddenFranceGiftLayer(
  map: MapLibreMap,
  options: HiddenFranceGiftLayerOptions = {},
): HiddenFranceGiftLayerController {
  return mountHiddenGlobeRewardLayer(map, HIDDEN_GIFT_DEFINITION, options);
}

export function mountHiddenFranceIphonePrizeLayer(
  map: MapLibreMap,
  options: HiddenFranceIphonePrizeLayerOptions = {},
): HiddenFranceIphonePrizeLayerController {
  return mountHiddenGlobeRewardLayer(map, HIDDEN_IPHONE_DEFINITION, options);
}
