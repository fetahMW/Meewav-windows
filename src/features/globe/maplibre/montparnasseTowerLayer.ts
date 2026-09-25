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

export const MONTPARNASSE_TOWER_LAYER_ID = "montparnasse-tower-glb-landmark";
const MONTPARNASSE_TOWER_ASSET_URL = "/models/hero-landmarks/tour_montparnasse_violet_light.glb?v=5";
const MONTPARNASSE_TOWER_LNG_LAT: [number, number] = [2.32195, 48.84205];
const MONTPARNASSE_TOWER_ALTITUDE_METERS = 1.2;
const MONTPARNASSE_TOWER_HEIGHT_METERS = 210;
const MONTPARNASSE_TOWER_MIN_ZOOM = 11.4;
const MONTPARNASSE_TOWER_ROTATION_DEGREES = -28;
const MONTPARNASSE_TOWER_ROTATION_RADIANS = THREE.MathUtils.degToRad(MONTPARNASSE_TOWER_ROTATION_DEGREES);

function createMontparnasseTowerMaterial(baseMaterial: THREE.Material) {
  const material = baseMaterial instanceof THREE.MeshStandardMaterial || baseMaterial instanceof THREE.MeshPhysicalMaterial
    ? baseMaterial.clone()
    : new THREE.MeshStandardMaterial();

  material.color.set("#BFA7FF");
  material.roughness = 0.46;
  material.metalness = 0.18;
  material.emissive.set("#25115A");
  material.emissiveIntensity = 0.13;
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
    const towerMaterials = materials.map(createMontparnasseTowerMaterial);
    child.material = Array.isArray(child.material) ? towerMaterials : towerMaterials[0];
  });

  const root = new THREE.Group();
  root.rotation.y = MONTPARNASSE_TOWER_ROTATION_RADIANS;
  root.add(model);
  return { root, modelHeightUnits };
}

function createMontparnasseTowerLayer(map: MapLibreMap): CustomLayerInterface {
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

  scene.add(new THREE.AmbientLight(0xffffff, 1.15));

  const keyLight = new THREE.DirectionalLight(0xf4efff, 1.58);
  keyLight.position.set(-72, -70, 108);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x76dcff, 0.72);
  rimLight.position.set(88, 56, 92);
  scene.add(rimLight);

  const violetLight = new THREE.DirectionalLight(0xd8c4ff, 0.74);
  violetLight.position.set(-42, 88, 72);
  scene.add(violetLight);

  function writeDebug(rendered: boolean) {
    if (typeof window === "undefined") return;
    (window as any).__MEEWAV_MONTPARNASSE_TOWER_LAYER__ = {
      layerId: MONTPARNASSE_TOWER_LAYER_ID,
      assetUrl: MONTPARNASSE_TOWER_ASSET_URL,
      loaded: Boolean(landmarkRoot),
      rendered,
      error: loadError,
      lngLat: MONTPARNASSE_TOWER_LNG_LAT,
      modelHeightMeters: MONTPARNASSE_TOWER_HEIGHT_METERS,
      rotationDegrees: MONTPARNASSE_TOWER_ROTATION_DEGREES,
      rotationAxis: "model-y",
      altitudeMeters: MONTPARNASSE_TOWER_ALTITUDE_METERS,
      minZoom: MONTPARNASSE_TOWER_MIN_ZOOM,
      cityViewScaleMultiplier: getLandmarkCityViewScaleMultiplier(map.getZoom(), 6),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  return {
    id: MONTPARNASSE_TOWER_LAYER_ID,
    type: "custom",
    renderingMode: "3d",

    onAdd(_map, gl) {
      renderer = getMapLibreThreeRenderer(map, gl);

      const { gltfLoader, dispose } = createLandmarkGltfLoader();
      cleanupLoader = dispose;
      gltfLoader.load(
        MONTPARNASSE_TOWER_ASSET_URL,
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
          loadError = error instanceof Error ? error.message : "Unable to load Tour Montparnasse GLB";
          writeDebug(false);
        },
      );
    },

    render(_gl, options) {
      const zoom = map.getZoom();
      if (!renderer || !landmarkRoot || zoom < MONTPARNASSE_TOWER_MIN_ZOOM) {
        writeDebug(false);
        return;
      }
      if (!shouldRenderLandmarkCustomLayer(map, MONTPARNASSE_TOWER_LNG_LAT, zoom, MONTPARNASSE_TOWER_MIN_ZOOM, MONTPARNASSE_TOWER_LAYER_ID)) {
        return;
      }

      const mapModelMatrix = (map as any).transform?.getMatrixForModel?.(
        { lng: MONTPARNASSE_TOWER_LNG_LAT[0], lat: MONTPARNASSE_TOWER_LNG_LAT[1] },
        MONTPARNASSE_TOWER_ALTITUDE_METERS,
      );
      if (!mapModelMatrix) {
        writeDebug(false);
        return;
      }

      const modelScaleMeters = (MONTPARNASSE_TOWER_HEIGHT_METERS / modelHeightUnits)
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
        delete (window as any).__MEEWAV_MONTPARNASSE_TOWER_LAYER__;
      }
    },
  };
}

export function ensureMontparnasseTowerLayer(map: MapLibreMap) {
  if (shouldSkipHeroLandmarkLayer(map, MONTPARNASSE_TOWER_LAYER_ID)) return;
  if (map.getLayer(MONTPARNASSE_TOWER_LAYER_ID)) return;
  const beforeLayerId = map.getLayer("labels_cities") ? "labels_cities" : undefined;
  map.addLayer(createMontparnasseTowerLayer(map), beforeLayerId);
}
