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

export const STADE_DE_FRANCE_LAYER_ID = "stade-de-france-glb-landmark";
const STADE_DE_FRANCE_ASSET_URL = "/models/hero-landmarks/stade_de_france_violet_light.glb?v=3";
const STADE_DE_FRANCE_LNG_LAT: [number, number] = [2.36018, 48.92446];
const STADE_DE_FRANCE_ALTITUDE_METERS = 1.0;
const STADE_DE_FRANCE_HEIGHT_METERS = 45;
const STADE_DE_FRANCE_MIN_ZOOM = 11.4;
const STADE_DE_FRANCE_ROTATION_DEGREES = 0;
const STADE_DE_FRANCE_ROTATION_RADIANS = THREE.MathUtils.degToRad(STADE_DE_FRANCE_ROTATION_DEGREES);

function createStadeDeFranceMaterial(baseMaterial: THREE.Material) {
  const material = baseMaterial instanceof THREE.MeshStandardMaterial || baseMaterial instanceof THREE.MeshPhysicalMaterial
    ? baseMaterial.clone()
    : new THREE.MeshStandardMaterial();

  material.color.set("#B99BFF");
  material.roughness = 0.42;
  material.metalness = 0.14;
  material.emissive.set("#221057");
  material.emissiveIntensity = 0.14;
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
    const stadeMaterials = materials.map(createStadeDeFranceMaterial);
    child.material = Array.isArray(child.material) ? stadeMaterials : stadeMaterials[0];
  });

  const root = new THREE.Group();
  root.rotation.y = STADE_DE_FRANCE_ROTATION_RADIANS;
  root.add(model);
  return { root, modelHeightUnits };
}

function createStadeDeFranceLayer(map: MapLibreMap): CustomLayerInterface {
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

  scene.add(new THREE.AmbientLight(0xffffff, 1.16));

  const keyLight = new THREE.DirectionalLight(0xf4efff, 1.62);
  keyLight.position.set(-72, -70, 108);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x74d9ff, 0.7);
  rimLight.position.set(90, 58, 90);
  scene.add(rimLight);

  const violetLight = new THREE.DirectionalLight(0xd9c6ff, 0.74);
  violetLight.position.set(-42, 88, 72);
  scene.add(violetLight);

  function writeDebug(rendered: boolean) {
    if (typeof window === "undefined") return;
    (window as any).__MEEWAV_STADE_DE_FRANCE_LAYER__ = {
      layerId: STADE_DE_FRANCE_LAYER_ID,
      assetUrl: STADE_DE_FRANCE_ASSET_URL,
      loaded: Boolean(landmarkRoot),
      rendered,
      error: loadError,
      lngLat: STADE_DE_FRANCE_LNG_LAT,
      modelHeightMeters: STADE_DE_FRANCE_HEIGHT_METERS,
      rotationDegrees: STADE_DE_FRANCE_ROTATION_DEGREES,
      rotationAxis: "model-y",
      altitudeMeters: STADE_DE_FRANCE_ALTITUDE_METERS,
      minZoom: STADE_DE_FRANCE_MIN_ZOOM,
      cityViewScaleMultiplier: getLandmarkCityViewScaleMultiplier(map.getZoom(), 6),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  return {
    id: STADE_DE_FRANCE_LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(_map, gl) {
      renderer = getMapLibreThreeRenderer(map, gl);

      const { gltfLoader, dispose } = createLandmarkGltfLoader();
      cleanupLoader = dispose;
      gltfLoader.load(
        STADE_DE_FRANCE_ASSET_URL,
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
          loadError = error instanceof Error ? error.message : "Unable to load Stade de France GLB";
          writeDebug(false);
        },
      );
    },

    render(_gl, options) {
      const zoom = map.getZoom();
      if (!renderer || !landmarkRoot || zoom < STADE_DE_FRANCE_MIN_ZOOM) {
        writeDebug(false);
        return;
      }
      if (!shouldRenderLandmarkCustomLayer(map, STADE_DE_FRANCE_LNG_LAT, zoom, STADE_DE_FRANCE_MIN_ZOOM, STADE_DE_FRANCE_LAYER_ID)) {
        return;
      }

      const mapModelMatrix = (map as any).transform?.getMatrixForModel?.(
        { lng: STADE_DE_FRANCE_LNG_LAT[0], lat: STADE_DE_FRANCE_LNG_LAT[1] },
        STADE_DE_FRANCE_ALTITUDE_METERS,
      );
      if (!mapModelMatrix) {
        writeDebug(false);
        return;
      }

      const modelScaleMeters = (STADE_DE_FRANCE_HEIGHT_METERS / modelHeightUnits)
        * getLandmarkCityViewScaleMultiplier(zoom, 6);
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
        delete (window as any).__MEEWAV_STADE_DE_FRANCE_LAYER__;
      }
    },
  };
}

export function ensureStadeDeFranceLayer(map: MapLibreMap) {
  if (shouldSkipHeroLandmarkLayer(map, STADE_DE_FRANCE_LAYER_ID)) return;
  if (map.getLayer(STADE_DE_FRANCE_LAYER_ID)) return;
  const beforeLayerId = map.getLayer("labels_cities") ? "labels_cities" : undefined;
  map.addLayer(createStadeDeFranceLayer(map), beforeLayerId);
}
