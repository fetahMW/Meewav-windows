import {
  type CustomLayerInterface,
  type Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { createLandmarkGltfLoader } from "./landmarkGltfLoader";
import { shouldRenderLandmarkCustomLayer } from "./landmarkCustomLayerVisibility";
import { shouldSkipHeroLandmarkLayer } from "./heroLandmarkRegistry";
import { getMapLibreThreeRenderer } from "./sharedThreeRenderer";

export const SAINT_CLAUDE_BONNEVILLE_LAYER_ID = "saint-claude-bonneville-glb-landmark";
const SAINT_CLAUDE_BONNEVILLE_ASSET_URL = "/models/hero-landmarks/saint_claude_28_bonneville_violet_light.glb?v=1";
const SAINT_CLAUDE_BONNEVILLE_LNG_LAT: [number, number] = [5.861705, 46.388092];
const SAINT_CLAUDE_BONNEVILLE_ALTITUDE_METERS = 0.8;
const SAINT_CLAUDE_BONNEVILLE_HEIGHT_METERS = 18;
const SAINT_CLAUDE_BONNEVILLE_MIN_ZOOM = 13.2;
const SAINT_CLAUDE_BONNEVILLE_ROTATION_DEGREES = 45;
const SAINT_CLAUDE_BONNEVILLE_ROTATION_RADIANS = THREE.MathUtils.degToRad(
  SAINT_CLAUDE_BONNEVILLE_ROTATION_DEGREES,
);

function createSaintClaudeBonnevilleMaterial(baseMaterial: THREE.Material) {
  const material = baseMaterial instanceof THREE.MeshStandardMaterial || baseMaterial instanceof THREE.MeshPhysicalMaterial
    ? baseMaterial.clone()
    : new THREE.MeshStandardMaterial();

  material.color.set("#BFA7FF");
  material.roughness = 0.46;
  material.metalness = 0.14;
  material.emissive.set("#241159");
  material.emissiveIntensity = 0.12;
  material.side = THREE.DoubleSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.needsUpdate = true;

  return material;
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function prepareModel(rawModel: THREE.Object3D) {
  const model = rawModel.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const modelHeightUnits = Math.max(size.y, 0.0001);

  model.position.set(-center.x, -box.min.y, -center.z);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.frustumCulled = false;
    child.castShadow = false;
    child.receiveShadow = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const bonnevilleMaterials = materials.map(createSaintClaudeBonnevilleMaterial);
    child.material = Array.isArray(child.material) ? bonnevilleMaterials : bonnevilleMaterials[0];
  });

  const root = new THREE.Group();
  root.rotation.y = SAINT_CLAUDE_BONNEVILLE_ROTATION_RADIANS;
  root.add(model);
  return { root, modelHeightUnits };
}

function createSaintClaudeBonnevilleLayer(map: MapLibreMap): CustomLayerInterface {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const mapMatrix = new THREE.Matrix4();
  const modelMatrix = new THREE.Matrix4();
  const localScaleMatrix = new THREE.Matrix4();
  let renderer: THREE.WebGLRenderer | null = null;
  let landmarkRoot: THREE.Group | null = null;
  let modelHeightUnits = 1;
  let loadError: string | null = null;
  let cleanupLoader: (() => void) | null = null;

  scene.add(new THREE.AmbientLight(0xffffff, 1.14));

  const keyLight = new THREE.DirectionalLight(0xf4efff, 1.55);
  keyLight.position.set(-72, -70, 108);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x75dcff, 0.68);
  rimLight.position.set(88, 58, 92);
  scene.add(rimLight);

  const violetLight = new THREE.DirectionalLight(0xd8c4ff, 0.72);
  violetLight.position.set(-42, 88, 72);
  scene.add(violetLight);

  function writeDebug(rendered: boolean) {
    if (typeof window === "undefined") return;
    (window as any).__MEEWAV_SAINT_CLAUDE_BONNEVILLE_LAYER__ = {
      layerId: SAINT_CLAUDE_BONNEVILLE_LAYER_ID,
      assetUrl: SAINT_CLAUDE_BONNEVILLE_ASSET_URL,
      loaded: Boolean(landmarkRoot),
      rendered,
      error: loadError,
      lngLat: SAINT_CLAUDE_BONNEVILLE_LNG_LAT,
      modelHeightMeters: SAINT_CLAUDE_BONNEVILLE_HEIGHT_METERS,
      rotationDegrees: SAINT_CLAUDE_BONNEVILLE_ROTATION_DEGREES,
      rotationAxis: "model-y",
      altitudeMeters: SAINT_CLAUDE_BONNEVILLE_ALTITUDE_METERS,
      minZoom: SAINT_CLAUDE_BONNEVILLE_MIN_ZOOM,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  return {
    id: SAINT_CLAUDE_BONNEVILLE_LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(_map, gl) {
      renderer = getMapLibreThreeRenderer(map, gl);

      const { gltfLoader, dispose } = createLandmarkGltfLoader();
      cleanupLoader = dispose;
      gltfLoader.load(
        SAINT_CLAUDE_BONNEVILLE_ASSET_URL,
        (gltf) => {
          const prepared = prepareModel(gltf.scene);
          landmarkRoot = prepared.root;
          modelHeightUnits = prepared.modelHeightUnits;
          scene.add(landmarkRoot);
          writeDebug(false);
          map.triggerRepaint();
        },
        undefined,
        (error) => {
          loadError = error instanceof Error ? error.message : "Unable to load Saint-Claude Bonneville GLB";
          writeDebug(false);
        },
      );
    },

    render(_gl, options) {
      const zoom = map.getZoom();
      if (!renderer || !landmarkRoot || zoom < SAINT_CLAUDE_BONNEVILLE_MIN_ZOOM) {
        writeDebug(false);
        return;
      }
      if (!shouldRenderLandmarkCustomLayer(map, SAINT_CLAUDE_BONNEVILLE_LNG_LAT, zoom, SAINT_CLAUDE_BONNEVILLE_MIN_ZOOM, SAINT_CLAUDE_BONNEVILLE_LAYER_ID)) {
        return;
      }

      const mapModelMatrix = (map as any).transform?.getMatrixForModel?.(
        { lng: SAINT_CLAUDE_BONNEVILLE_LNG_LAT[0], lat: SAINT_CLAUDE_BONNEVILLE_LNG_LAT[1] },
        SAINT_CLAUDE_BONNEVILLE_ALTITUDE_METERS,
      );
      if (!mapModelMatrix) {
        writeDebug(false);
        return;
      }

      const modelScaleMeters = SAINT_CLAUDE_BONNEVILLE_HEIGHT_METERS / modelHeightUnits;
      modelMatrix.fromArray(mapModelMatrix);
      localScaleMatrix.makeScale(modelScaleMeters, modelScaleMeters, modelScaleMeters);
      camera.projectionMatrix = mapMatrix
        .fromArray(options.defaultProjectionData.mainMatrix)
        .multiply(modelMatrix)
        .multiply(localScaleMatrix);

      renderer.resetState();
      renderer.clearDepth();
      renderer.render(scene, camera);
      writeDebug(true);
    },

    onRemove() {
      if (landmarkRoot) {
        scene.remove(landmarkRoot);
        disposeObject3D(landmarkRoot);
        landmarkRoot = null;
      }
      renderer = null;
      cleanupLoader?.();
      cleanupLoader = null;
      if (typeof window !== "undefined") {
        delete (window as any).__MEEWAV_SAINT_CLAUDE_BONNEVILLE_LAYER__;
      }
    },
  };
}

export function ensureSaintClaudeBonnevilleLayer(map: MapLibreMap) {
  if (shouldSkipHeroLandmarkLayer(map, SAINT_CLAUDE_BONNEVILLE_LAYER_ID)) return;
  if (map.getLayer(SAINT_CLAUDE_BONNEVILLE_LAYER_ID)) return;
  const beforeLayerId = map.getLayer("labels_cities") ? "labels_cities" : undefined;
  map.addLayer(createSaintClaudeBonnevilleLayer(map), beforeLayerId);
}
