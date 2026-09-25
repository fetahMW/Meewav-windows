import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { xyz, RADIUS } from "./geo.mjs";
import { quartierHeight, territoryReveal } from "./territory-style.mjs";
import { EIFFEL_LOCATION, MONTPARNASSE_LOCATION, NEGRESCO_LOCATION } from './eiffel-location.mjs';
import cityLandmarks from './city-landmarks.json' with { type: 'json' };

export const CITY_LANDMARKS = Object.freeze(cityLandmarks.map(item => Object.freeze(item)));

export const EIFFEL = Object.freeze({
  ...EIFFEL_LOCATION,
  id: "eiffel-tower", name: "Tour Eiffel", heightMetres: 324,
  quartier: "Gros-Caillou", bearing: 45,
  asset: "la_tour_eiffel_violet_light.glb",
  color: "#A78BFA", roughness: 0.55, metalness: 0.25, emissive: "#21124B", emissiveIntensity: 0.1,
});
export const MONTPARNASSE = Object.freeze({
  ...MONTPARNASSE_LOCATION,
  id: "montparnasse-tower", name: "Tour Montparnasse", heightMetres: 210,
  quartier: "Necker", bearing: -28,
  asset: "tour_montparnasse_violet_light.glb",
  color: "#BFA7FF", roughness: 0.46, metalness: 0.18, emissive: "#25115A", emissiveIntensity: 0.13,
});
export const NEGRESCO = Object.freeze({
  ...NEGRESCO_LOCATION,
  id: 'negresco-nice', name: 'Le Negresco', cityCode: '06088',
  quartier: 'France-Negresco · Nice', heightMetres: 43, bearing: 20,
  asset: 'le_negresco_violet_light.glb', preserveMaterials: true,
});
export const METRES_TO_GLOBE = RADIUS / 6371008.8;

export function positionLandmark(object, landmark, groundRadius = RADIUS) {
  const normal = new T.Vector3(...xyz(landmark.lon, landmark.lat, 1));
  const lon = T.MathUtils.degToRad(landmark.lon);
  const east = new T.Vector3(Math.cos(lon), 0, -Math.sin(lon));
  const south = new T.Vector3().crossVectors(east, normal);
  object.position.copy(normal).multiplyScalar(groundRadius);
  object.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(east, normal, south));
  object.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), T.MathUtils.degToRad(landmark.bearing)));
  object.scale.setScalar(METRES_TO_GLOBE);
  object.updateMatrixWorld(true);
}

// A local curved surface shares the exact sphere used by geographic picking,
// labels and the camera. Keep vertices relative to the landmark for precision.
function createParisGround() {
  const divisions = 32, size = 32000, radius = RADIUS / METRES_TO_GLOBE;
  const positions = [], normals = [], indices = [];
  for (let row = 0; row <= divisions; row++) for (let col = 0; col <= divisions; col++) {
    const x = (col / divisions - 0.5) * size;
    const z = (row / divisions - 0.5) * size;
    const up = Math.sqrt(radius * radius - x * x - z * z);
    positions.push(x, up - radius, z);
    normals.push(x / radius, up / radius, z / radius);
  }
  for (let row = 0; row < divisions; row++) for (let col = 0; col < divisions; col++) {
    const a = row * (divisions + 1) + col, b = a + 1, c = a + divisions + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  const groundMaterial = new T.MeshBasicMaterial({ color: "#43277B", toneMapped: false });
  groundMaterial.depthTest = true;
  groundMaterial.depthWrite = true;
  const ground = new T.Mesh(geometry, groundMaterial);
  ground.renderOrder = 1.5;
  positionLandmark(ground, EIFFEL);
  ground.visible = false;
  return ground;
}

function disposeModel(object) {
  const textures = new Set();
  object.traverse(child => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

function createTowerLandmark(scene, camera, invalidate, landmark, loader, compileObjects) {
  const root = new T.Group();
  root.visible = false;
  positionLandmark(root, landmark);
  scene.add(root);
  const normal = root.position.clone().normalize();
  const sphere = new T.Sphere(normal.clone().multiplyScalar(RADIUS + landmark.heightMetres * METRES_TO_GLOBE / 2),
    Math.hypot(landmark.heightMetres, landmark.footprintMetres) * METRES_TO_GLOBE * 0.7);
  const frustum = new T.Frustum(), projection = new T.Matrix4(), worldPos = new T.Vector3();
  const pickHits = [];
  let loaded = false, loading = false, disposed = false, error = null, visible = false, preloadRequested = false;
  function startLoad() {
    if (loaded || loading || error || disposed) return;
    loading = true;
    loader.loadAsync(new URL(`models/hero-landmarks/${landmark.asset}`, document.baseURI).href)
      .then(async gltf => {
        if (disposed) { disposeModel(gltf.scene); return; }
        // Reference assets use their own modelling units. Normalize height
        // and move the actual base to Y=0 before geographic placement.
        const box = new T.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
        const metres = landmark.heightMetres / Math.max(size.y, 0.0001);
        gltf.scene.position.sub(new T.Vector3(center.x, box.min.y, center.z));
        const model = new T.Group();
        model.scale.setScalar(metres);
        model.add(gltf.scene);
        gltf.scene.traverse(child => {
          if (!child.isMesh) return;
          child.renderOrder = 7;
          child.castShadow = child.receiveShadow = false;
          const tint = base => {
            const material = base.isMeshStandardMaterial ? base : new T.MeshStandardMaterial();
            if (material !== base) base.dispose();
            if (!landmark.preserveMaterials) {
              material.color.set(landmark.color);
              material.roughness = landmark.roughness;
              material.metalness = landmark.metalness;
              material.emissive.set(landmark.emissive);
              material.emissiveIntensity = landmark.emissiveIntensity;
            }
            material.side = T.DoubleSide;
            material.depthTest = material.depthWrite = true;
            material.needsUpdate = true;
            return material;
          };
          child.material = Array.isArray(child.material) ? child.material.map(tint) : tint(child.material);
        });
        root.add(model); root.updateMatrixWorld(true);
        await compileObjects?.([root]);
        if (disposed) return;
        loaded = true; loading = false; root.visible = visible;
        invalidate();
      })
      .catch(reason => {
        if (disposed) return;
        loading = false; error = String(reason); invalidate();
      });
  }
  return {
    preload() { preloadRequested = true; startLoad(); },
    update(view) {
      const plateHeight = landmark.quartierId ? quartierHeight(landmark.quartierId) : 0;
      root.position.copy(normal).multiplyScalar(RADIUS + plateHeight * METRES_TO_GLOBE * territoryReveal(view.height).quartier + 0.000003);
      root.updateMatrixWorld(true);
      worldPos.setFromMatrixPosition(root.matrixWorld);
      sphere.center.copy(worldPos);
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      visible = view.height < 0.8 && worldPos.dot(camera.position) > RADIUS && frustum.intersectsSphere(sphere);
      root.visible = loaded && visible;
      if ((visible || preloadRequested) && !loaded) startLoad();
    },
    intersect(raycaster) {
      if (!loaded || !root.visible || !raycaster.ray.intersectsSphere(sphere)) return null;
      pickHits.length = 0;
      raycaster.intersectObject(root, true, pickHits);
      return pickHits[0] || null;
    },
    state: () => ({ loaded, loading, visible: root.visible, error, quartier: landmark.quartier, asset: landmark.asset }),
    dispose() {
      disposed = true; root.removeFromParent();
      disposeModel(root);
    },
  };
}

export function createParisLandmarks(scene, camera, invalidate, compileObjects = null) {
  const draco = new DRACOLoader();
  draco.setDecoderPath(new URL("models/draco/", document.baseURI).href);
  draco.setWorkerLimit(1);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const landmarks = [EIFFEL, MONTPARNASSE, NEGRESCO, ...CITY_LANDMARKS];
  const towers = landmarks.map(landmark => createTowerLandmark(scene, camera, invalidate, landmark, loader, compileObjects));
  const pickRay = new T.Raycaster(), pickPointer = new T.Vector2(), pickPoint = new T.Vector3();
  const ground = createParisGround();
  scene.add(ground);
  let groundReady = !compileObjects, groundPreparing = false, disposed = false;
  function prepareGround() {
    if (groundReady || groundPreparing || disposed) return;
    groundPreparing = true;
    Promise.resolve(compileObjects?.([ground])).then(() => {
      if (disposed) return;
      groundReady = true;
      invalidate();
    }).catch(error => {
      if (!disposed) console.warn('Préparation du sol parisien interrompue :', error);
    });
  }
  const groundSphere = new T.Sphere(ground.position.clone(), 23000 * METRES_TO_GLOBE);
  const frustum = new T.Frustum(), projection = new T.Matrix4(), worldPos = new T.Vector3();
  return {
    depthAt(x, y, width, height) {
      if (width <= 0 || height <= 0) return Infinity;
      pickPointer.set(x / width * 2 - 1, 1 - y / height * 2);
      pickRay.setFromCamera(pickPointer, camera);
      let nearest = null;
      for (const tower of towers) {
        const hit = tower.intersect(pickRay);
        if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
      }
      return nearest ? pickPoint.copy(nearest.point).project(camera).z : Infinity;
    },
    preload(cityCode = '75056') {
      if (cityCode === '75056') prepareGround();
      for (let i = 0; i < towers.length; i++) {
        if ((landmarks[i].cityCode || '75056') === cityCode) towers[i].preload();
      }
    },
    update(view) {
      ground.updateMatrixWorld(true);
      worldPos.setFromMatrixPosition(ground.matrixWorld);
      groundSphere.center.copy(worldPos);
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      const visible = view.height < 2 && worldPos.dot(camera.position) > RADIUS && frustum.intersectsSphere(groundSphere);
      if (visible) prepareGround();
      ground.visible = groundReady && visible;
      for (const tower of towers) tower.update(view);
    },
    state: () => Object.fromEntries(landmarks.map((landmark, index) => [landmark.id, towers[index].state()])),
    dispose() {
      disposed = true;
      for (const tower of towers) tower.dispose();
      ground.removeFromParent(); disposeModel(ground); draco.dispose();
    },
  };
}
