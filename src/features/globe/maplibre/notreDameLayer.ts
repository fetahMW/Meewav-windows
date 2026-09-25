import {
  type CustomLayerInterface,
  type Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { createLandmarkGltfLoader } from "./landmarkGltfLoader";
import { getLandmarkCityViewScaleMultiplier } from "./landmarkScale";
import { shouldRenderLandmarkCustomLayer } from "./landmarkCustomLayerVisibility";
import { shouldSkipHeroLandmarkLayer } from "./heroLandmarkRegistry";
import { getMapLibreThreeRenderer } from "./sharedThreeRenderer";

export const NOTRE_DAME_LAYER_ID = "notre-dame-glb-landmark";
const NOTRE_DAME_ASSET_URL = "/models/hero-landmarks/notre_dame_paris_violet_light.glb?v=3";
const NOTRE_DAME_LNG_LAT: [number, number] = [2.349902, 48.852968];
const NOTRE_DAME_ALTITUDE_METERS = 0.7;
const NOTRE_DAME_HEIGHT_METERS = 96;
const NOTRE_DAME_GROUND_SCALE_MULTIPLIER = 1.15;
const NOTRE_DAME_MIN_ZOOM = 11.4;
const NOTRE_DAME_ROTATION_DEGREES = 67;
const NOTRE_DAME_ROTATION_RADIANS = THREE.MathUtils.degToRad(NOTRE_DAME_ROTATION_DEGREES);

function createNotreDameMaterial(baseMaterial: THREE.Material) {
  const material = baseMaterial instanceof THREE.MeshStandardMaterial || baseMaterial instanceof THREE.MeshPhysicalMaterial
    ? baseMaterial.clone()
    : new THREE.MeshStandardMaterial();

  material.color.set("#BFA7FF");
  material.roughness = 0.46;
  material.metalness = 0.12;
  material.emissive.set("#24124F");
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
    const notreDameMaterials = materials.map(createNotreDameMaterial);
    child.material = Array.isArray(child.material) ? notreDameMaterials : notreDameMaterials[0];
  });

  const root = new THREE.Group();
  root.rotation.y = NOTRE_DAME_ROTATION_RADIANS;
  root.add(model);
  return { root, modelHeightUnits };
}

function createNotreDameLayer(map: MapLibreMap): CustomLayerInterface {
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

  scene.add(new THREE.AmbientLight(0xffffff, 1.18));

  const keyLight = new THREE.DirectionalLight(0xf4efff, 1.65);
  keyLight.position.set(-72, -70, 105);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x74d9ff, 0.72);
  rimLight.position.set(90, 58, 90);
  scene.add(rimLight);

  const violetLight = new THREE.DirectionalLight(0xd9c6ff, 0.74);
  violetLight.position.set(-42, 88, 72);
  scene.add(violetLight);

  function writeDebug(rendered: boolean) {
    if (typeof window === "undefined") return;
    (window as any).__MEEWAV_NOTRE_DAME_LAYER__ = {
      layerId: NOTRE_DAME_LAYER_ID,
      assetUrl: NOTRE_DAME_ASSET_URL,
      loaded: Boolean(landmarkRoot),
      rendered,
      error: loadError,
      lngLat: NOTRE_DAME_LNG_LAT,
      modelHeightMeters: NOTRE_DAME_HEIGHT_METERS,
      groundScaleMultiplier: NOTRE_DAME_GROUND_SCALE_MULTIPLIER,
      rotationDegrees: NOTRE_DAME_ROTATION_DEGREES,
      rotationAxis: "model-y",
      altitudeMeters: NOTRE_DAME_ALTITUDE_METERS,
      minZoom: NOTRE_DAME_MIN_ZOOM,
      cityViewScaleMultiplier: getLandmarkCityViewScaleMultiplier(map.getZoom(), 6),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  return {
    id: NOTRE_DAME_LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(_map, gl) {
      renderer = getMapLibreThreeRenderer(map, gl);

      const { gltfLoader, dispose } = createLandmarkGltfLoader();
      cleanupLoader = dispose;
      gltfLoader.load(
        NOTRE_DAME_ASSET_URL,
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
          loadError = error instanceof Error ? error.message : "Unable to load Notre-Dame GLB";
          writeDebug(false);
        },
      );
    },

    render(_gl, options) {
      const zoom = map.getZoom();
      if (!renderer || !landmarkRoot || zoom < NOTRE_DAME_MIN_ZOOM) {
        writeDebug(false);
        return;
      }
      if (!shouldRenderLandmarkCustomLayer(map, NOTRE_DAME_LNG_LAT, zoom, NOTRE_DAME_MIN_ZOOM, NOTRE_DAME_LAYER_ID)) {
        return;
      }

      const mapModelMatrix = (map as any).transform?.getMatrixForModel?.(
        { lng: NOTRE_DAME_LNG_LAT[0], lat: NOTRE_DAME_LNG_LAT[1] },
        NOTRE_DAME_ALTITUDE_METERS,
      );
      if (!mapModelMatrix) {
        writeDebug(false);
        return;
      }

      const modelScaleMeters = (NOTRE_DAME_HEIGHT_METERS / modelHeightUnits)
        * getLandmarkCityViewScaleMultiplier(zoom, 6);
      modelMatrix.fromArray(mapModelMatrix);
      localScaleMatrix.makeScale(
        modelScaleMeters * NOTRE_DAME_GROUND_SCALE_MULTIPLIER,
        modelScaleMeters,
        modelScaleMeters * NOTRE_DAME_GROUND_SCALE_MULTIPLIER,
      );
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
        delete (window as any).__MEEWAV_NOTRE_DAME_LAYER__;
      }
    },
  };
}

export function ensureNotreDameLayer(map: MapLibreMap) {
  if (shouldSkipHeroLandmarkLayer(map, NOTRE_DAME_LAYER_ID)) return;
  if (map.getLayer(NOTRE_DAME_LAYER_ID)) return;
  const beforeLayerId = map.getLayer("labels_cities") ? "labels_cities" : undefined;
  map.addLayer(createNotreDameLayer(map), beforeLayerId);
}
