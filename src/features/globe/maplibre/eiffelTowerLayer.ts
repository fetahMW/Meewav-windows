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

export const EIFFEL_TOWER_LAYER_ID = "eiffel-tower-glb-landmark";
const EIFFEL_TOWER_ASSET_URL = "/models/hero-landmarks/la_tour_eiffel_violet_light.glb?v=3";
const EIFFEL_TOWER_LNG_LAT: [number, number] = [2.294694, 48.858093];
const EIFFEL_TOWER_ALTITUDE_METERS = 2.5;
const EIFFEL_TOWER_HEIGHT_METERS = 324;
const EIFFEL_TOWER_MIN_ZOOM = 11.4;
const EIFFEL_TOWER_ROTATION_DEGREES = 45;
const EIFFEL_TOWER_CITY_VIEW_SCALE = 4.8;
const EIFFEL_TOWER_ROTATION_RADIANS = THREE.MathUtils.degToRad(EIFFEL_TOWER_ROTATION_DEGREES);

function createEiffelMaterial(baseMaterial: THREE.Material) {
  const material = baseMaterial instanceof THREE.MeshStandardMaterial || baseMaterial instanceof THREE.MeshPhysicalMaterial
    ? baseMaterial.clone()
    : new THREE.MeshStandardMaterial();

  material.color.set("#A78BFA");
  material.roughness = 0.55;
  material.metalness = 0.25;
  material.emissive.set("#21124B");
  material.emissiveIntensity = 0.1;
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
    const eiffelMaterials = materials.map(createEiffelMaterial);
    child.material = Array.isArray(child.material) ? eiffelMaterials : eiffelMaterials[0];
  });

  const root = new THREE.Group();
  root.rotation.y = EIFFEL_TOWER_ROTATION_RADIANS;
  root.add(model);
  return { root, modelHeightUnits };
}

function createEiffelTowerLayer(map: MapLibreMap): CustomLayerInterface {
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

  scene.add(new THREE.AmbientLight(0xffffff, 1.25));

  const keyLight = new THREE.DirectionalLight(0xf6efff, 1.8);
  keyLight.position.set(-80, -60, 140);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x61d9ff, 0.7);
  rimLight.position.set(90, 70, 120);
  scene.add(rimLight);

  const frontLight = new THREE.DirectionalLight(0xded7ff, 0.75);
  frontLight.position.set(20, -140, 90);
  scene.add(frontLight);

  function writeDebug(rendered: boolean) {
    if (typeof window === "undefined") return;
    (window as any).__MEEWAV_EIFFEL_TOWER_LAYER__ = {
      layerId: EIFFEL_TOWER_LAYER_ID,
      assetUrl: EIFFEL_TOWER_ASSET_URL,
      loaded: Boolean(landmarkRoot),
      rendered,
      error: loadError,
      lngLat: EIFFEL_TOWER_LNG_LAT,
      modelHeightMeters: EIFFEL_TOWER_HEIGHT_METERS,
      rotationDegrees: EIFFEL_TOWER_ROTATION_DEGREES,
      rotationAxis: "model-y",
      altitudeMeters: EIFFEL_TOWER_ALTITUDE_METERS,
      minZoom: EIFFEL_TOWER_MIN_ZOOM,
      cityViewScaleMultiplier: getLandmarkCityViewScaleMultiplier(map.getZoom(), EIFFEL_TOWER_CITY_VIEW_SCALE),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  return {
    id: EIFFEL_TOWER_LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(_map, gl) {
      renderer = getMapLibreThreeRenderer(map, gl);

      const { gltfLoader, dispose } = createLandmarkGltfLoader();
      cleanupLoader = dispose;
      gltfLoader.load(
        EIFFEL_TOWER_ASSET_URL,
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
          loadError = error instanceof Error ? error.message : "Unable to load Eiffel Tower GLB";
          writeDebug(false);
        },
      );
    },

    render(_gl, options) {
      const zoom = map.getZoom();
      if (!renderer || !landmarkRoot || zoom < EIFFEL_TOWER_MIN_ZOOM) {
        writeDebug(false);
        return;
      }
      if (!shouldRenderLandmarkCustomLayer(map, EIFFEL_TOWER_LNG_LAT, zoom, EIFFEL_TOWER_MIN_ZOOM, EIFFEL_TOWER_LAYER_ID)) {
        return;
      }

      const mapModelMatrix = (map as any).transform?.getMatrixForModel?.(
        { lng: EIFFEL_TOWER_LNG_LAT[0], lat: EIFFEL_TOWER_LNG_LAT[1] },
        EIFFEL_TOWER_ALTITUDE_METERS,
      );
      if (!mapModelMatrix) {
        writeDebug(false);
        return;
      }

      const modelScaleMeters = (EIFFEL_TOWER_HEIGHT_METERS / modelHeightUnits)
        * getLandmarkCityViewScaleMultiplier(zoom, EIFFEL_TOWER_CITY_VIEW_SCALE);
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
        delete (window as any).__MEEWAV_EIFFEL_TOWER_LAYER__;
      }
    },
  };
}

export function ensureEiffelTowerLayer(map: MapLibreMap) {
  if (shouldSkipHeroLandmarkLayer(map, EIFFEL_TOWER_LAYER_ID)) return;
  if (map.getLayer(EIFFEL_TOWER_LAYER_ID)) return;
  const beforeLayerId = map.getLayer("labels_cities") ? "labels_cities" : undefined;
  map.addLayer(createEiffelTowerLayer(map), beforeLayerId);
}
