import { solveScreenAnchor } from "./screen-anchor.mjs";
import * as T from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { RADIUS as R, xyz, lonlat, polygons, contains, targetFor } from "./geo.mjs";
import {
  visibleDepartments,
  viewportBounds,
  boundsIntersect,
  geographyLevels,
} from "./geo-index.mjs";
import { packedContains, unpackFeature } from "./feature-pack.mjs";
import { borderLevel, indexFeatures } from "./border-tiles.mjs";
import { createCamera } from "./camera.mjs";
import { applyDirectDrag } from "./direct-drag.mjs";
import { createGlobeDrag, globeDragSpeed, AXIS_GLOBE_MIN_HEIGHT } from "./globe-drag.mjs";
import { createWheelZoom } from "./wheel-zoom.mjs";
import { createGeographicLabels } from "./geographic-labels.mjs";
import { createParisLandmarks } from "./eiffel-landmark.mjs";
import { createTerritoryPlates } from "./territory-plates.mjs";
import { createSaturnRing, GLOBE_OVERVIEW, GLOBE_RING_VIEW, GLOBE_ALIGN, GLOBE_ALIGN_INV } from "./saturn-ring.mjs";
import { createOrbitBloom } from "./orbit-ring-bloom.mjs";
import { createStarSky } from "./star-sky.mjs";
import { createCityMarkers } from "./city-markers.mjs";
import { createQuarterHoverCard } from "./quarter-hover-card.mjs";
import { createGroundAvatars } from "./ground-avatars.mjs";
import { ACTIVE_GLOBE_PALETTE, FOREIGN_LAND_COLOR } from "./globe-palette.mjs";
import { createRingNavigation } from "./ring-navigation.mjs";
import { createRingPortraits } from "./ring-portraits.mjs";
import { CHARONNE_ID, overviewTarget } from "./navigation-presets.mjs";
import { createQuarterStream } from "./quarter-stream.mjs";
import { createTerritoryFocus } from "./territory-focus.mjs";
import { createOrbitCameraUpdater, createOrbitGesture, createOrbitViewport, isOrbitPointer } from "./orbit-camera.mjs";

import { createMotionMetrics } from "./motion-metrics.mjs";
import { createCadenceProbe } from "./cadence-probe.mjs";

const clamp = T.MathUtils.clamp;
const landColor = new T.Color(FOREIGN_LAND_COLOR);
const livePaletteUpdates = new Set<(palette: any) => void>();
if (import.meta.hot) import.meta.hot.accept('./globe-palette.mjs', module => {
  if (!module) return;
  landColor.set(module.FOREIGN_LAND_COLOR);
  for (const update of livePaletteUpdates) update(module.ACTIVE_GLOBE_PALETTE);
});
const inactiveLandColor = new T.Color('#1B1234').multiplyScalar(0.66);
const fade = (height: number, near: number, far: number) =>
  1 - T.MathUtils.smoothstep(Math.log(height), Math.log(near), Math.log(far));

function softenGlobeReflections(material: T.MeshStandardMaterial) {
  // Keep the ring's bright clear coat, but give the planet a restrained violet
  // sheen. Compress specular energy only; ocean/land pigments and diffuse stay intact.
  const tint = { value: new T.Color("#A66CEB") };
  material.onBeforeCompile = shader => {
    shader.uniforms.globeReflectionTint = tint;
    shader.fragmentShader = "uniform vec3 globeReflectionTint;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      vec3 globeSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
      float globeSpecularPeak = max(max(globeSpecular.r, globeSpecular.g), globeSpecular.b);
      vec3 globeSpecularResponse = globeReflectionTint * (0.42 / (1.0 + globeSpecularPeak));
      reflectedLight.directSpecular *= globeSpecularResponse;
      reflectedLight.indirectSpecular *= globeSpecularResponse;
    `);
  };
  material.customProgramCacheKey = () => "meewav-globe-soft-violet-reflections-v1";
}

export async function createThree(
  host: HTMLElement,
  countries: any,
  sectors: any,
  communes: any,
  land: ArrayBuffer,
  communeIndex: any,
  regions: any,
  landTiles: any,
  labelData: any[],
  onPick: any,
  onFrame: any,
  quarterIndex: any = { assets: [], labels: [] },
  liveMarkers: any[] | null = null,
) {
  const scene = new T.Scene();
  const globeRoot = new T.Group();
  globeRoot.name = "globe-geography";
  globeRoot.quaternion.copy(GLOBE_ALIGN);
  scene.add(globeRoot);
  const geoHit = new T.Vector3();
  const worldToGeo = (x: number, y: number, z: number) => {
    geoHit.set(x, y, z).applyQuaternion(GLOBE_ALIGN_INV);
    return lonlat(geoHit.x, geoHit.y, geoHit.z);
  };
  let sceneDirty = true;
  let finishFirstFrame: (() => void) | undefined;
  const firstFrame = new Promise<void>((resolve) => { finishFirstFrame = resolve; });
  const territoryFocus = createTerritoryFocus(matchMedia("(prefers-reduced-motion: reduce)").matches);
  const camera = new T.PerspectiveCamera(38, 1, 0.00002, 2000);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene.add(createStarSky(renderer.getPixelRatio()));
  const metrics = createMotionMetrics();
  const cadenceProbe = createCadenceProbe();
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const gpuQueries: { query: WebGLQuery; moving: boolean }[] = [];
  function beginGpu(moving: boolean) {
    if (!timer || !metrics.enabled) return null;
    while (
      gpuQueries.length &&
      gl.getQueryParameter(gpuQueries[0].query, gl.QUERY_RESULT_AVAILABLE)
    ) {
      const pending = gpuQueries.shift()!;
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT) && pending.moving)
        metrics.gpu(gl.getQueryParameter(pending.query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(pending.query);
    }
    if (gpuQueries.length >= 8) return null;
    const query = gl.createQuery();
    if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    return query;
  }
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Globe interactif. Glissez pour déplacer, molette ou pincement pour zoomer. Clic droit ou Ctrl et clic gauche puis glissement pour incliner et tourner. Flèches pour déplacer la vue, plus et moins pour zoomer, touche Origine pour revenir au globe.",
  );
  host.appendChild(canvas);
  const compiledObjects = new WeakMap<T.Object3D, Promise<void>>();
  let compilationQueue: Promise<void> = Promise.resolve(), compilationClosed = false;
  function compileHidden(objects: T.Object3D[]) {
    return Promise.all((objects || []).filter(Boolean).map(object => {
      const existing = compiledObjects.get(object);
      if (existing) return existing;
      const pending = compilationQueue.then(async () => {
        // Release the click/loading callback before preparing a new object.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (compilationClosed) return;
        // Compile only this incoming object, using the existing scene lights.
        // No temporary render target or repeated compilation of the globe.
        await renderer.compileAsync(object, camera, scene);
      });
      compiledObjects.set(object, pending);
      compilationQueue = pending.catch(() => { compiledObjects.delete(object); });
      return pending;
    }));
  }
  const oceanMaterial = new T.MeshStandardMaterial({
    color: ACTIVE_GLOBE_PALETTE.ocean,
    metalness: 0.42,
    roughness: 0.56,
  });
  softenGlobeReflections(oceanMaterial);
  const earth = new T.Mesh(new T.SphereGeometry(R, 192, 96), oceanMaterial);
  globeRoot.add(earth);
  const orbitOptions = new URLSearchParams(location.search);
  const saturnRing = createSaturnRing(scene, {
    quality: orbitOptions.get("orbitQuality") || undefined,
    animated: orbitOptions.has("orbitMotion") ? orbitOptions.get("orbitMotion") !== "off" : undefined,
  });
  const ringPortraits = createRingPortraits(scene, saturnRing, camera, canvas, () => { sceneDirty = true; }, renderer.getPixelRatio());
  const orbitBloom = createOrbitBloom(renderer, saturnRing, earth,
    orbitOptions.has("orbitBloom") ? orbitOptions.get("orbitBloom") !== "off" : undefined, ringPortraits);
  function renderScene(dt: number) {
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    try {
      renderer.render(scene, camera);
      orbitBloom.render(camera, dt);
      groundAvatars?.render(renderer);
      finishFirstFrame?.();
      finishFirstFrame = undefined;
    } finally { renderer.info.autoReset = autoReset; }
  }
  const landGeometry = new T.BufferGeometry();
  const header = new Uint32Array(land, 0, 2),
    positions = new Float32Array(land, 8, header[0] * 3),
    normals = new Float32Array(positions.length);
  landGeometry.setIndex(
    new T.BufferAttribute(new Uint32Array(land, 8 + positions.byteLength, header[1]), 1),
  );
  for (let i = 0; i < positions.length; i++) normals[i] = positions[i] / R;
  landGeometry.setAttribute("position", new T.BufferAttribute(positions, 3));
  landGeometry.setAttribute("normal", new T.BufferAttribute(normals, 3));
  // Front faces are opaque land. Culling hides the far hemisphere; no texture is magnified.
  // Deep black pigment beneath a polished clear lacquer, like hi-fi equipment.
  const landMaterial = new T.MeshPhysicalMaterial({
    color: landColor,
    metalness: 0,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.09,
    depthTest: false,
    depthWrite: false,
  });
  const landMesh = new T.Mesh(landGeometry, landMaterial);
  const updatePalette = (palette: any) => {
    oceanMaterial.color.set(palette.ocean);
    landMaterial.color.copy(landColor).lerp(inactiveLandColor, territoryFocus.strength);
    sceneDirty = true;
  };
  if (import.meta.hot) livePaletteUpdates.add(updatePalette);
  landMesh.renderOrder = 1;
  globeRoot.add(landMesh);
  const localLand = landTiles.tiles.map((tile: any) => {
    const geometry = new T.BufferGeometry();
    geometry.setIndex(landGeometry.index);
    geometry.setAttribute("position", landGeometry.attributes.position);
    geometry.setAttribute("normal", landGeometry.attributes.normal);
    geometry.setDrawRange(tile.start, tile.count);
    geometry.boundingSphere = new T.Sphere(new T.Vector3(...tile.center), tile.radius);
    const mesh = new T.Mesh(geometry, landMaterial);
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    globeRoot.add(mesh);
    return mesh;
  });
  const landFrustum = new T.Frustum(),
    landProjection = new T.Matrix4(),
    cameraDirection = new T.Vector3(),
    landWorldSphere = new T.Sphere();
  function updateLand() {
    landMesh.visible = view.height >= 70;
    if (landMesh.visible) {
      for (const mesh of localLand) mesh.visible = false;
      return;
    }
    landProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    landFrustum.setFromProjectionMatrix(landProjection);
    cameraDirection.copy(camera.position).applyQuaternion(GLOBE_ALIGN_INV).normalize();
    for (const mesh of localLand) {
      const sphere = mesh.geometry.boundingSphere!;
      landWorldSphere.center.copy(sphere.center).applyQuaternion(GLOBE_ALIGN);
      landWorldSphere.radius = sphere.radius;
      mesh.visible =
        sphere.center.dot(cameraDirection) + sphere.radius >= 0 &&
        landFrustum.intersectsSphere(landWorldSphere);
    }
  }
  scene.add(new T.HemisphereLight("#ded9f3", "#14101b", 2.1));
  // Fixed France-view basis: reflect across the vertical view plane to move
  // the soft left highlight to the right without putting it behind the globe.
  const ringLightNormal = new T.Vector3().fromArray(saturnRing.state().normal).normalize();
  const overviewFront = new T.Vector3(...xyz(GLOBE_RING_VIEW.lon, GLOBE_RING_VIEW.lat, 1));
  const overviewEast = new T.Vector3(...xyz(GLOBE_RING_VIEW.lon + 90, 0, 1));
  const ringFront = new T.Vector3().crossVectors(overviewEast, ringLightNormal).normalize();
  const key = new T.DirectionalLight("#eae6f6", 3);
  key.name = "Left silver reflection";
  // Preserve the soft silver direction from the user's second reference.
  key.position.copy(overviewEast).multiplyScalar(-0.738829)
    .addScaledVector(ringLightNormal, 0.103535)
    .addScaledVector(ringFront, -0.665892).normalize().multiplyScalar(300);
  scene.add(key);
  const rightReflection = new T.DirectionalLight(key.color, key.intensity);
  rightReflection.name = "Right silver reflection";
  rightReflection.position.copy(key.position)
    .addScaledVector(overviewEast, -2 * key.position.dot(overviewEast));
  scene.add(rightReflection);

  // Aim the violet specular lobe at the actual back-left annulus, rather
  // than its empty central hole. L = 2(N.V)N - V for the existing flat floor.
  // Keep the accepted globe lighting independent of the new ribbon radii.
  const reflectionRadius = R * 1.49;
  const leftReflectionPoint = overviewEast.clone().multiplyScalar(-0.8 * reflectionRadius)
    .addScaledVector(ringFront, -0.6 * reflectionRadius);
  const reflectionView = overviewFront.clone().multiplyScalar(R + GLOBE_RING_VIEW.height)
    .sub(leftReflectionPoint).normalize();
  const rim = new T.DirectionalLight("#7842db", 2.2);
  rim.name = "Left violet lacquer reflection";
  rim.position.copy(ringLightNormal).multiplyScalar(2 * ringLightNormal.dot(reflectionView))
    .sub(reflectionView).multiplyScalar(300);
  scene.add(rim);
  // The reference was captured after dragging France slightly to the right.
  // Turn the rig in the opposite direction to that camera orbit, so the same
  // annular highlights are reached with France centered. The 10-degree offset
  // is estimated from the reference; all sources remain fixed during navigation.
  const reflectionAlignment = new T.Quaternion().setFromAxisAngle(ringLightNormal, T.MathUtils.degToRad(10));
  for (const light of [key, rightReflection, rim]) light.position.applyQuaternion(reflectionAlignment);
  const atmosphereMaterial = new T.ShaderMaterial({
    uniforms: { strength: { value: 1 } },
    vertexShader:
      "varying vec3 n; varying vec3 p; void main(){n=normalize(normalMatrix*normal);vec4 v=modelViewMatrix*vec4(position,1.0);p=v.xyz;gl_Position=projectionMatrix*v;}",
    fragmentShader:
      "varying vec3 n;varying vec3 p;uniform float strength;void main(){float r=pow(1.0-abs(dot(normalize(n),normalize(-p))),3.0);gl_FragColor=vec4(.39,.19,.85,r*.26*strength);}",
    transparent: true,
    depthWrite: false,
    side: T.BackSide,
  });
  const atmosphere = new T.Mesh(new T.SphereGeometry(R * 1.007, 96, 48), atmosphereMaterial);
  atmosphere.renderOrder = 6;
  globeRoot.add(atmosphere);
  const lineMaterials: LineMaterial[] = [];
  type Kind = "country" | "region" | "commune" | "quartier";
  type Layer = { kind: Kind; tiles: any[]; material: LineMaterial; order: number };
  const colors = { country: "#786982", region: "#B18EFF", commune: "#9270E4", quartier: "#9B7AE8" };
  const worker = new Worker(new URL("./border-worker.js", import.meta.url), { type: "module" });
  let taskId = 0;
  const tasks = new Map<number, { resolve: (data: any) => void; reject: (error: Error) => void }>();
  worker.onmessage = ({ data }) => {
    const task = tasks.get(data.id);
    if (!task) return;
    tasks.delete(data.id);
    if (data.error) task.reject(Error(data.error));
    else task.resolve(data);
  };
  worker.onerror = () => {
    for (const task of tasks.values()) task.reject(Error("Préparation des contours interrompue"));
    tasks.clear();
  };
  function prepare(input: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++taskId;
      tasks.set(id, { resolve, reject });
      worker.postMessage({ ...input, id });
    });
  }
  function layerFrom(
    tiles: any[],
    kind: Kind,
    color = colors[kind],
    order = kind === "commune" ? 4 : kind === "quartier" ? 3 : 2,
  ): Layer {
    sceneDirty = true;
    const material = new LineMaterial({
      color,
      linewidth: 1,
      transparent: false,
      opacity: 1,
      depthWrite: false,
      alphaToCoverage: false,
      toneMapped: false,
    });
    material.userData.focusBaseColor = new T.Color(color);
    lineMaterials.push(material);
    return { kind, tiles, material, order };
  }
  function removeLayer(layer: Layer | null) {
    if (!layer) return;
    sceneDirty = true;
    for (const tile of layer.tiles) {
      if (tile.line) tile.line.removeFromParent();
      tile.geometries?.forEach((geometry: any) => geometry.dispose());
    }
    const index = lineMaterials.indexOf(layer.material);
    if (index !== -1) lineMaterials.splice(index, 1);
    layer.material.dispose();
  }
  // Every level is prepared once off the rendering thread, including the world borders.
  let prepared;
  try {
    prepared = await Promise.all([
      prepare({ features: countries.features, kind: "country", sharedOnly: true }),
      prepare({ features: regions.features, kind: "region", plates: true, surfacesOnly: true }),
      prepare({ features: communes.features, kind: "commune", plates: true }),
      prepare({
        features: sectors.features.filter((f: any) => f.properties.kind === "quartier"),
        kind: "quartier",
        plates: true,
        surfacesOnly: true,
      }),
    ]);
  } catch (error) {
    worker.terminate();
    orbitBloom.dispose();
    ringPortraits.dispose();
    saturnRing.dispose();
    renderer.dispose();
    canvas.remove();
    throw error;
  }
  const countryLayer = layerFrom(prepared[0].tiles, "country"),
    communeLayer = layerFrom(prepared[2].tiles, "commune");
  countries.features = indexFeatures(countries.features);
  regions.features = indexFeatures(regions.features);
  communes.features = indexFeatures(communes.features);
  sectors.features = indexFeatures(sectors.features);
  const territoryPlates = createTerritoryPlates(globeRoot, [...prepared[1].plates, ...prepared[3].plates],
    [...regions.features, ...sectors.features.filter((f: any) => f.properties.kind === "quartier")], undefined, territoryFocus, worldToGeo);
  const seededCommuneSurfaces = createTerritoryPlates(globeRoot, prepared[2].plates, communes.features, undefined, territoryFocus, worldToGeo);
  let hovered: any = null;
  const quarterHoverCard = createQuarterHoverCard(host);
  let groundAvatars: ReturnType<typeof createGroundAvatars> | null = null;
  const quarterStream = createQuarterStream(scene, quarterIndex, prepare, () => { sceneDirty = true; }, territoryFocus, saturnRing.occludesLabel, (features: any[]) => {
    groundAvatars?.adoptQuartiers(features);
  }, compileHidden, globeRoot, worldToGeo, GLOBE_ALIGN);
  function holdFlightTerritory(id: any = null) {
    if (territoryFocus.setFlightTerritory(id)) sceneDirty = true;
  }
  function avatarDestinationId() {
    // During a neighbour hop the focus is still the origin: keep those people
    // planted on the ground we are leaving until arrival.
    if (isLocalAvatarFlight() && territoryFocus.quarterId) return territoryFocus.quarterId;
    const dest = pendingFlightFocus?.destination;
    if (dest?.quarterId) return dest.quarterId;
    if (territoryFocus.quarterId) return territoryFocus.quarterId;
    return null;
  }
  function isOccupiedTerritory(feature: any) {
    const occupied = groundAvatars?.occupiedZone();
    return Boolean(occupied && feature?.id === occupied);
  }
  function clearHover() {
    quarterHoverCard.hide();
    groundAvatars?.hideHover();
    if (hovered) sceneDirty = true;
    hovered = null;
  }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = Math.max(1, host.clientWidth),
    height = Math.max(1, host.clientHeight);
  const motion = createCamera(
    overviewTarget('globe', width, height),
    reducedMotion,
  );
  const view = Object.assign(motion.view, { pitch: 0 });
  const parisLandmarks = createParisLandmarks(globeRoot, camera, () => { sceneDirty = true; }, compileHidden);
  const orbit = createOrbitGesture(view, reducedMotion);
  const geographicLabels = createGeographicLabels(labelData, regions.features, territoryFocus, saturnRing.occludesLabel, GLOBE_ALIGN);
  scene.add(geographicLabels.mesh);
  const cityMarkers = createCityMarkers(host, labelData, regions.features, (city: any) => {
    host.dispatchEvent(new CustomEvent("meewav:city-select", { bubbles: true, detail: { id: city.id } }));
  }, () => { sceneDirty = true; }, territoryFocus, saturnRing.occludesLabel, (city: any) => groundAvatars?.countForCity(city.id) || 0, GLOBE_ALIGN);
  groundAvatars = createGroundAvatars(host, sectors, communes, () => { sceneDirty = true; }, camera, GLOBE_ALIGN,
    parisLandmarks.depthAt, liveMarkers);
  let alive = true,
    active = true,
    raf = 0,
    lastTime = 0;
  const renderedView = { ...view };
  const raycaster = new T.Raycaster(),
    sphere = new T.Sphere(new T.Vector3(), R),
    hitPoint = new T.Vector3();
  const updateGlobeCamera = createOrbitCameraUpdater(camera, view, GLOBE_ALIGN);
  const ringNavigation = createRingNavigation(camera, saturnRing, reducedMotion);
  const updateCamera = () => ringNavigation.active ? ringNavigation.tick(0, true) : updateGlobeCamera();
  const applyGlobeDrag = createGlobeDrag({ motion, axis: saturnRing.state().normal, updateCamera, align: GLOBE_ALIGN });
  let brandOverviewHeight = view.height;
  const ctaGlobeCenter = new T.Vector3();
  let ctaLeft = NaN, ctaTop = NaN;
  function setBrandVisible(visible: boolean) {
    const parent = host.parentElement;
    const value = String(visible);
    if (parent && parent.dataset.globeBrandVisible !== value) parent.dataset.globeBrandVisible = value;
    if (parent && visible) {
      // Attach the exploration button to the upper-left silhouette of the globe instead
      // of the window edge. Coordinates are CSS pixels, like the HTML overlay.
      ctaGlobeCenter.set(0, 0, 0).project(camera);
      const centerX = (ctaGlobeCenter.x + 1) * width / 2;
      const centerY = (1 - ctaGlobeCenter.y) * height / 2;
      const focalLength = height / (2 * Math.tan(camera.fov * Math.PI / 360));
      const radius = focalLength * R / Math.sqrt(Math.max(1, camera.position.lengthSq() - R * R));
      const buttonWidth = width <= 760 ? Math.min(212, width - 120) : 280;
      const margin = width <= 760 ? 94 : 116;
      const preferredLeft = centerX - radius * 0.95 - buttonWidth - 48;
      const left = Math.round(clamp(preferredLeft, margin, Math.max(margin, width - buttonWidth - 44)));
      // On a narrow viewport, use the space above the planet rather than
      // putting the button behind the left navigation pole.
      const preferredTop = preferredLeft < margin ? centerY - radius - 36 : centerY - radius * 0.5 - 24;
      const top = Math.round(clamp(preferredTop, 152, Math.max(152, height - 200)));
      if (left !== ctaLeft) { parent.style.setProperty('--ring-cta-left', `${left}px`); ctaLeft = left; }
      if (top !== ctaTop) { parent.style.setProperty('--ring-cta-top', `${top}px`); ctaTop = top; }
    }
  }
  setBrandVisible(false);
  const orbitViewport = createOrbitViewport(camera, view, GLOBE_ALIGN_INV, GLOBE_ALIGN);
  let geographicViewport: number[] | null = null;
  let viewportNeedsUpdate = true;
  function pickPoint(x: number, y: number) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new T.Vector2(((x - rect.left) / width) * 2 - 1, 1 - ((y - rect.top) / height) * 2),
      camera,
    );
    sphere.radius = R;
    const hit = raycaster.ray.intersectSphere(sphere, hitPoint);
    return hit ? worldToGeo(hit.x, hit.y, hit.z) : null;
  }
  function keepPoint(anchor: any) {
    if (!anchor) return false;
    const rect = canvas.getBoundingClientRect();
    return solveScreenAnchor({
      view,
      camera,
      point: anchor.point,
      x: anchor.x - rect.left,
      y: anchor.y - rect.top,
      width,
      height,
      updateCamera,
      align: GLOBE_ALIGN,
    });
  }
  const wheelZoom = createWheelZoom({
    reducedMotion,
    applyZoom(factor: number, anchor: any) {
      const previousHeight = view.height;
      motion.zoom(factor);
      updateCamera();
      if (anchor) keepPoint(anchor);
      return Math.log2(previousHeight / view.height);
    },
  });
  function resizeViewport() {
    const keepOverviewFit = !ringNavigation.active && !motion.isMoving() && !wheelZoom.isMoving()
      && !orbit.isMoving() && Math.abs(view.height - brandOverviewHeight) < 0.000001;
    wheelZoom.cancel();
    orbit.cancel();
    sceneDirty = true;
    viewportNeedsUpdate = true;
    if (gesture) gesture.anchor = null;
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    brandOverviewHeight = overviewTarget("globe", width, height).height;
    if (keepOverviewFit) view.height = brandOverviewHeight;
    renderer.setSize(width, height);
    orbitBloom.resize();
    camera.aspect = width / height;
    camera.fov = T.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(T.MathUtils.degToRad(19)) / Math.min(1, camera.aspect)),
    );
    camera.updateProjectionMatrix();
    lineMaterials.forEach((m) => m.resolution.set(width, height));
    updateCamera();
  }
  const resize = new ResizeObserver(resizeViewport);
  resize.observe(host);
  const ringVisibility = new IntersectionObserver(([entry]) => {
    saturnRing.setInViewport(entry.isIntersecting);
    if (entry.isIntersecting) sceneDirty = true;
  });
  ringVisibility.observe(host);
  const loadedDepartments = new Map<
    string,
    { features: any[]; packed: any; layer: Layer; surfaces: ReturnType<typeof createTerritoryPlates>; used: number }
  >();
  const seededDepartments = new Set(["75", "92", "93", "94"]);
  const seededIds = new Set(communes.features.map((f: any) => f.id));
  const loadingDepartments = new Set<string>(),
    geographyErrors = new Set<string>();
  let wantedIds = new Set<string>(),
    geographyCheck = 0;
  function updateDepartments(now: number) {
    if (now - geographyCheck < 180) return;
    geographyCheck = now;
    const wanted = visibleDepartments(communeIndex, view, width, height, geographicViewport);
    if (
      wanted.length !== wantedIds.size ||
      wanted.some((asset: any) => !wantedIds.has(asset.department))
    )
      sceneDirty = true;
    wantedIds = new Set(wanted.map((asset: any) => asset.department));
    for (const asset of wanted) {
      const cached = loadedDepartments.get(asset.department);
      if (cached) {
        cached.used = now;
        continue;
      }
      if (
        seededDepartments.has(asset.department) ||
        loadingDepartments.has(asset.department) ||
        geographyErrors.has(asset.department) ||
        loadingDepartments.size >= 2
      )
        continue;
      loadingDepartments.add(asset.department);
      prepare({
        url: new URL("data/" + asset.path, document.baseURI).href,
        excludedIds: [...seededIds],
        kind: "commune",
        plates: true,
      })
        .then((data) => {
          if (!alive || !wantedIds.has(asset.department)) return;
          const layer = layerFrom(data.tiles, "commune");
          layer.material.resolution.set(width, height);
          loadedDepartments.set(asset.department, {
            features: data.packed.features,
            packed: data.packed,
            layer,
            surfaces: createTerritoryPlates(globeRoot, data.plates, [], undefined, territoryFocus, worldToGeo),
            used: performance.now(),
          });
        })
        .catch((error) => {
          if (alive) {
            geographyErrors.add(asset.department);
            console.warn(error.message);
          }
        })
        .finally(() => {
          loadingDepartments.delete(asset.department);
          sceneDirty = true;
        });
    }
    if (loadedDepartments.size > 12) {
      const oldest = [...loadedDepartments.entries()]
        .filter(([id]) => !wantedIds.has(id))
        .sort((a, b) => a[1].used - b[1].used);
      for (const [id, cached] of oldest) {
        if (loadedDepartments.size <= 12) break;
        removeLayer(cached.layer);
        cached.surfaces.dispose();
        loadedDepartments.delete(id);
      }
    }
  }
  function featureAt(point: any) {
    const levels = geographyLevels(view.height);
    const municipalityCollections = [
      communes,
      ...[...loadedDepartments.entries()]
        .filter(([id]) => wantedIds.has(id))
        .map(([, cached]) => ({ features: cached.features, packed: cached.packed })),
    ];
    const collections =
      levels.level === "quartier"
        ? [sectors, ...municipalityCollections, regions, countries]
        : levels.level === "commune"
          ? [...municipalityCollections, regions, countries]
          : levels.level === "region"
            ? [regions, countries]
            : [countries];
    for (const collection of collections) {
      const feature = collection.features.find((f: any) => {
        const b = f.bbox;
        return (
          point[0] >= b[0] &&
          point[0] <= b[2] &&
          point[1] >= b[1] &&
          point[1] <= b[3] &&
          (collection.packed ? packedContains(collection.packed, f, point) : contains(f, point))
        );
      });
      if (feature) return collection.packed ? unpackFeature(collection.packed, feature) : feature;
    }
    return null;
  }
  function targetAt(feature: any, point: any) {
    // Fit the clicked land mass, avoiding overseas territories or the opposite side of the date line.
    const poly = polygons(feature).find((poly: any) =>
      contains({ geometry: { type: "Polygon", coordinates: poly } }, point),
    );
    const local = {
      ...feature,
      properties: { ...feature.properties, center: undefined },
      geometry: { type: "Polygon", coordinates: poly || polygons(feature)[0] },
    };
    const target = targetFor(local);
    return { ...target, height: clamp(target.height, 0.006, 230) };
  }
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: any = null,
    pendingPick: ReturnType<typeof setTimeout> | null = null;
  function cancelPick() {
    if (pendingPick !== null) {
      clearTimeout(pendingPick);
      pendingPick = null;
      holdFlightTerritory();
    }
  }
  function down(e: PointerEvent) {
    if (ringNavigation.active) {
      if (ringNavigation.returning) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      e.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId);
      ringPortraits.down(e); ringNavigation.down(e); canvas.classList.add('dragging'); return;
    }
    const orbiting = isOrbitPointer(e);
    if (e.pointerType === "mouse" && e.button !== 0 && !orbiting) return;
    if (pointers.size && (orbiting || gesture?.orbiting)) return;
    orbit.cancel();
    if (orbiting) { e.preventDefault(); orbit.begin(Math.min(width, height)); }
    wheelZoom.cancel();
    cancelPick();
    metrics.input("drag", e.timeStamp, true);
    motion.interrupt();
    pendingFlightFocus = null;
    const globeRotation = !orbiting && view.height >= AXIS_GLOBE_MIN_HEIGHT;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1)
      gesture = {
        x: e.clientX,
        y: e.clientY,
        moved: 0,
        multi: false,
        cancelled: false,
        orbiting,
        globeRotationSpeed: globeRotation ? globeDragSpeed(camera, height) : 0,
        anchor: globeRotation ? null : pickPoint(e.clientX, e.clientY),
      };
    else if (gesture) { gesture.multi = true; gesture.globeRotationSpeed = 0; }
    canvas.classList.add("dragging");
    pendingHover = null;
    // Preserve the hovered local plate from the press through the delayed click.
    // A real drag, cancelled press or new navigation releases this hold.
    holdFlightTerritory(!orbiting && pointers.size === 1 && !groundAvatars?.pick(e.clientX, e.clientY)
      && ['quartier', 'commune'].includes(hovered?.properties.kind) && !isOccupiedTerritory(hovered) ? hovered.id : null);
    clearHover();
  }
  let pendingHover: { x: number; y: number } | null = null;
  function move(e: PointerEvent) {
    if (ringNavigation.active) {
      if (!ringNavigation.returning) { ringPortraits.move(e); ringNavigation.move(e, width, height); }
      return;
    }
    const before = pointers.get(e.pointerId);
    if (!before) {
      if (e.pointerType === "mouse") pendingHover = { x: e.clientX, y: e.clientY };
      return;
    }
    metrics.input("drag", e.timeStamp);
    wheelZoom.cancel();
    const old = [...pointers.values()];
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.moved = Math.max(
      gesture.moved,
      Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y),
    );
    if (gesture.moved >= 5 || pointers.size >= 2 || gesture.orbiting) holdFlightTerritory();
    if (gesture.orbiting) {
      metrics.kind("orbit");
      orbit.move(e.clientX - before.x, e.clientY - before.y);
      return;
    }
    if (pointers.size >= 2) {
      gesture.anchor = null;
      const fresh = [...pointers.values()];
      const a = { x: (old[0].x + old[1].x) / 2, y: (old[0].y + old[1].y) / 2 };
      const b = { x: (fresh[0].x + fresh[1].x) / 2, y: (fresh[0].y + fresh[1].y) / 2 };
      const anchor = pickPoint(a.x, a.y);
      const d0 = Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y),
        d1 = Math.hypot(fresh[0].x - fresh[1].x, fresh[0].y - fresh[1].y);
      if (d0 > 5 && d1 > 5) motion.zoom(d0 / d1);
      updateCamera();
      if (anchor) keepPoint({ ...b, point: anchor });
    } else if (gesture.globeRotationSpeed) {
      applyGlobeDrag({
        from: before,
        to: { x: e.clientX, y: e.clientY },
        speed: gesture.globeRotationSpeed,
      });
    } else {
      applyDirectDrag({
        view,
        motion,
        dragState: gesture,
        from: before,
        to: { x: e.clientX, y: e.clientY },
        pickPoint,
        keepPoint,
        updateCamera,
      });
    }
  }
  function end(e: PointerEvent, cancelled = false) {
    if (ringNavigation.active) {
      ringNavigation.up(e); ringPortraits.up(e, cancelled);
      canvas.classList.remove('dragging'); return;
    }
    if (!pointers.has(e.pointerId)) return;
    if (cancelled && gesture) gesture.cancelled = true;
    const tap =
      pointers.size === 1 && gesture && !gesture.orbiting && !gesture.multi && !gesture.cancelled && gesture.moved < 5;
    if (!tap) holdFlightTerritory();
    if (gesture?.orbiting) { if (cancelled) orbit.cancel(); else orbit.end(); }
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      canvas.classList.remove("dragging");
      if (cancelled || gesture?.multi) motion.interrupt();
      else motion.release();
      if (tap) {
        const avatar = groundAvatars?.pick(e.clientX, e.clientY);
        if (avatar) {
          motion.interrupt();
          pendingFlightFocus = null;
          holdFlightTerritory();
          groundAvatars?.select(avatar, e.clientX, e.clientY, width, height);
        } else {
          const point = pickPoint(e.clientX, e.clientY),
            f = quarterStream.pick(raycaster.ray, view) || territoryPlates.pick(raycaster.ray, view) || (point ? featureAt(point) : null);
          const target = isOccupiedTerritory(f) ? null : f;
          holdFlightTerritory(['quartier', 'commune'].includes(target?.properties.kind) ? target.id : null);
          if (target)
            pendingPick = setTimeout(() => {
              pendingPick = null;
              onPick(target, targetAt(target, point));
            }, 220);
        }
      }
      gesture = null;
    } else motion.interrupt();
  }
  const up = (e: PointerEvent) => end(e);
  const cancel = (e: PointerEvent) => end(e, true);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (ringNavigation.active) { ringNavigation.wheel(e.deltaY); return; }
    if (gesture?.orbiting) return;
    if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return;
    setBrandVisible(false);
    metrics.input("wheel", e.timeStamp);
    if (gesture) gesture.anchor = null;
    pendingHover = null;
    clearHover();
    cancelPick();
    orbit.cancel();
    motion.interrupt();
    holdFlightTerritory();
    const point = pickPoint(e.clientX, e.clientY);
    wheelZoom.input(
      e,
      point ? { x: e.clientX, y: e.clientY, point } : null,
      height,
    );
  };
  function zoom(factor: number) {
    if (ringNavigation.active) return;
    setBrandVisible(false);
    wheelZoom.cancel();
    orbit.cancel();
    if (gesture) gesture.anchor = null;
    metrics.input("zoom", performance.now());
    cancelPick();
    holdFlightTerritory();
    motion.zoom(factor);
    updateCamera();
  }
  let pendingFlightFocus: { id: number; destination: any; local?: boolean } | null = null;
  function isLocalAvatarFlight() {
    return motion.isFlying() && Boolean(pendingFlightFocus?.local);
  }
  let focusExitHeight = Infinity;
  const focusReleaseHeight = (arrivalHeight: number) => arrivalHeight * 1.6;
  const PARIS_CITY_CODE = "75056";
  function arrivalCityCode(destination: any) {
    if (destination?.cityCode) return destination.cityCode;
    if (String(destination?.quarterId || "").startsWith("fr-paris-")) return PARIS_CITY_CODE;
    return null;
  }
  function prefetchArrival(destination: any) {
    const cityCode = arrivalCityCode(destination);
    if (cityCode) quarterStream.prefetch(cityCode);
    if (cityCode) parisLandmarks.preload(cityCode);
    if (destination?.quarterId) groundAvatars?.warmup(destination.quarterId);
  }
  function flyTo(target: any, duration: number | null = null, destinationFocus: any = undefined) {
    if (target.globeOverview) target = overviewTarget('globe', width, height);
    if (ringNavigation.active) {
      if (target.globeOverview || target.height >= 230) exitRing(target);
      else exitRing(undefined, () => flyTo(target, duration, destinationFocus));
      return;
    }
    setBrandVisible(false);
    const destination = destinationFocus === undefined
      ? (pendingFlightFocus && motion.isFlying() ? pendingFlightFocus.destination
        : { cityCode: territoryFocus.cityCode, quarterId: territoryFocus.quarterId })
      : destinationFocus;
    if (destination?.quarterId || destination?.cityCode) prefetchArrival(destination);
    // Nearby communes keep their existing short flight and arrival framing.
    // Longer trips retain the existing city arc and altitude release rule.
    const localCityFlight = !!(target.cityFlight && destination?.cityCode && !destination.quarterId
      && territoryFocus.cityCode && view.height < 1 && target.height < 1
      && Number.isFinite(target.lon) && Number.isFinite(target.lat)
      && new T.Vector3(...xyz(view.lon, view.lat, 1)).angleTo(new T.Vector3(...xyz(target.lon, target.lat, 1))) * 6371 <= 15);
    if (localCityFlight) {
      target = { ...target, localFlight: true };
      if (duration === null) duration = 1100;
    }
    wheelZoom.cancel();
    orbit.cancel();
    if (target.globeOverview) target = { ...target, pitch: 0 };
    else if (target.height >= 230) target = { ...target, pitch: 0, bearing: 0 };
    if (gesture) gesture.anchor = null;
    metrics.kind("flight");
    cancelPick();
    // A local hop retains the current dimmed context until the new local plate
    // takes over at arrival. Include a larger neighbour's framing in the exit
    // threshold so its ordinary landing zoom cannot flash the whole mosaic.
    if (target.localFlight && (localCityFlight || (destination?.quarterId && territoryFocus.cityCode === destination.cityCode))
      && view.height < focusExitHeight) {
      const arrivalHeight = Number.isFinite(target.height) ? target.height : view.height;
      focusExitHeight = Math.max(focusExitHeight, focusReleaseHeight(arrivalHeight));
    }
    const id = motion.flyTo(target, duration);
    pendingFlightFocus = { id, destination, local: Boolean(target.localFlight) };
    holdFlightTerritory(destination?.quarterId || (localCityFlight ? `fr-commune-${destination.cityCode}` : null));
    cityMarkers.clearHover();
    sceneDirty = true;
    clearHover();
  }
  const keydown = (e: KeyboardEvent) => {
    if (ringNavigation.active) {
      if (e.key === 'Escape' || e.key === 'Home') { e.preventDefault(); exitRing(); }
      else if (ringNavigation.key(e.key)) e.preventDefault();
      return;
    }
    const directions: any = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    if (directions[e.key]) {
      wheelZoom.cancel();
      orbit.cancel();
      if (gesture) gesture.anchor = null;
      e.preventDefault();
      cancelPick();
      motion.interrupt();
      holdFlightTerritory();
      const d = directions[e.key],
        step = Math.min(10, view.height * 0.12);
      motion.drag(d[0] * step, d[1] * step);
      motion.release();
      updateCamera();
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoom(0.6);
    } else if (e.key === "-") {
      e.preventDefault();
      zoom(1.65);
    } else if (e.key === "Home") {
      e.preventDefault();
      onPick(null, GLOBE_OVERVIEW);
    }
  };
  const dblclick = (e: MouseEvent) => {
    if (ringNavigation.active) return;
    cancelPick();
    const point = pickPoint(e.clientX, e.clientY);
    if (point)
      flyTo({ lon: point[0], lat: point[1], height: Math.max(0.003, view.height * 0.4) }, 700);
  };
  const leave = () => {
    if (!pointers.size) {
      pendingHover = null;
      clearHover();
    }
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("dblclick", dblclick);
  const contextmenu = (e: MouseEvent) => e.preventDefault();
  const blur = () => {
    ringNavigation.cancel();
    ringPortraits.cancel();
    pendingHover = null;
    clearHover();
    orbit.cancel(); wheelZoom.cancel(); motion.interrupt(); cancelPick();
    holdFlightTerritory();
    pointers.clear(); gesture = null; canvas.classList.remove("dragging");
  };
  canvas.addEventListener("contextmenu", contextmenu);
  window.addEventListener("blur", blur);
  let uploadDeadline = 0,
    visibleTiles = 0,
    visibleSegments = 0,
    uploadCount = 0,
    uploadBytes = 0;
  function showLayer(
    layer: Layer | null,
    visibility: number,
    linewidth: number,
    viewport: number[],
  ) {
    if (!layer) return;
    layer.material.color.copy(layer.material.userData.focusBaseColor)
      .multiplyScalar(layer.order >= 5 ? 1 : 1 - 0.84 * territoryFocus.strength);
    layer.material.linewidth = linewidth * visibility;
    for (const tile of layer.tiles) {
      const level = tile.fixedLevel ? 0 : borderLevel(layer.kind, view.height);
      const visible =
        visibility > 0.025 &&
        view.height >= (tile.minHeight || 0) &&
        view.height < (tile.maxHeight || Infinity) &&
        (view.height >= 8 || boundsIntersect(tile.bounds, viewport));
      if (!visible) {
        if (tile.line) tile.line.visible = false;
        continue;
      }
      tile.geometries ||= new Map();
      let geometry = tile.geometries.get(level);
      if (!geometry && !motion.isFlying() &&
        performance.now() < uploadDeadline &&
        uploadCount < 2 &&
        (uploadCount === 0 || uploadBytes < 131072)
      ) {
        uploadCount++;
        uploadBytes += tile.levels[level].byteLength;
        geometry = new LineSegmentsGeometry();
        geometry.setPositions(tile.levels[level]);
        tile.geometries.set(level, geometry);
      }
      if (!geometry) {
        sceneDirty = true;
        if (tile.line) tile.line.visible = true;
        continue;
      }
      if (!tile.line) {
        tile.line = new LineSegments2(geometry, layer.material);
        tile.line.position.fromArray(tile.origin || [0, 0, 0]);
        tile.line.renderOrder = layer.order;
        globeRoot.add(tile.line);
      }
      tile.line.geometry = geometry;
      tile.line.visible = true;
      visibleTiles++;
      visibleSegments += tile.levels[level].length / 6;
    }
  }
  const frameSamples: number[] = [],
    cpuSamples: number[] = [],
    renderTimes: number[] = [];
  function pointerIsIdle() {
    return !motion.isMoving() && !wheelZoom.isMoving() && !orbit.isMoving() && !pointers.size;
  }
  function syncPointerHover() {
    if (!pendingHover || !pointerIsIdle()) return;
    const hoverPointer = pendingHover;
    pendingHover = null;
    const avatar = groundAvatars?.hover(hoverPointer.x, hoverPointer.y);
    if (avatar) {
      canvas.style.cursor = "pointer";
      if (hovered) {
        hovered = null;
        sceneDirty = true;
      }
      quarterHoverCard.hide();
      return;
    }
    const point = pickPoint(hoverPointer.x, hoverPointer.y),
      feature = quarterStream.pick(raycaster.ray, view) || territoryPlates.pick(raycaster.ray, view) || (point ? featureAt(point) : null);
    const target = isOccupiedTerritory(feature) ? null : feature;
    canvas.style.cursor = target ? "pointer" : "grab";
    if (target?.id !== hovered?.id) {
      clearHover();
      hovered = target;
      sceneDirty = true;
    }
    quarterHoverCard.show(target, hoverPointer.x, hoverPointer.y, groundAvatars?.countFor(target) || 0);
  }
  function frame(now: number) {
    if (!alive || !active) return;
    const frameStart = performance.now();
    const dt = lastTime ? (now - lastTime) / 1000 : 0;
    lastTime = now;
    if (ringNavigation.active) {
      const navigationChanged = ringNavigation.tick(dt, sceneDirty);
      // Keep the whole exploration still, including its entry/return flights.
      // Resume from this same angle once the overview is restored.
      const vinylChanged = saturnRing.tick(dt, camera, true, false);
      if (navigationChanged) {
        sceneDirty = false;
        if (ringNavigation.returning) ringPortraits.setReturnProgress(ringNavigation.returnProgress);
        else if (ringNavigation.active) {
          ringPortraits.setEntryProgress(ringNavigation.entryProgress);
        }
        else sceneDirty = true;
        updateLand();
      }
      // Portraits can now pass under a stationary pointer. Their picking bases
      // follow the same turntable transform without uploading instance data.
      const portraitsChanged = (navigationChanged || vinylChanged) && ringPortraits.update();
      if (navigationChanged || vinylChanged || portraitsChanged) {
        renderScene(dt);
      }
      raf = requestAnimationFrame(frame);
      return;
    }
    if (!cadenceProbe.frame(now, dt * 1000)) {
      raf = requestAnimationFrame(frame);
      return;
    }
    motion.tick(dt);
    if (pendingFlightFocus && !motion.isFlying()) {
      // Only a completed arrival can darken the surroundings; interruption cannot.
      if (motion.getCompletedFlightId() === pendingFlightFocus.id) {
        territoryFocus.set(pendingFlightFocus.destination);
        // Release relative to the actual landing scale, including small quarters.
        focusExitHeight = focusReleaseHeight(view.height);
        sceneDirty = true;
      } else holdFlightTerritory();
      pendingFlightFocus = null;
    }
    if (territoryFocus.tick(dt)) sceneDirty = true;
    wheelZoom.tick(now);
    // Both manual zoom and a flight's actual ascent release the context at
    // the same height. Starting a flight alone must never switch it off.
    if (view.height >= focusExitHeight && (territoryFocus.cityCode || territoryFocus.quarterId)) {
      territoryFocus.set(null);
      sceneDirty = true;
    }
    orbit.tick(dt);
    const poseChanged =
      view.lon !== renderedView.lon ||
      view.lat !== renderedView.lat ||
      view.height !== renderedView.height ||
      view.pitch !== renderedView.pitch || view.bearing !== renderedView.bearing;
    if (poseChanged || viewportNeedsUpdate) {
      updateCamera();
      geographicViewport = view.pitch || view.bearing ? orbitViewport() : null;
      viewportNeedsUpdate = false;
    }
    if (poseChanged || sceneDirty) parisLandmarks.update(view);
    updateDepartments(now);
    setBrandVisible(view.height >= brandOverviewHeight * 0.999
      && !motion.isFlying() && !wheelZoom.isMoving() && pointers.size < 2);
    const vinylChanged = saturnRing.tick(dt, camera, view.height > 70);
    const portraitsChanged = (poseChanged || sceneDirty || vinylChanged) && ringPortraits.setOverview(view.height);
    quarterStream.updateRequests(now, view, geographicViewport || viewportBounds(view, width, height, 1.3));
    if (!pointerIsIdle()) {
      quarterHoverCard.hide();
      groundAvatars?.hideHover();
    }
    // Vinyl motion only redraws the resident scene. It does not invalidate
    // geography, rerun territory uploads or lay out geographic labels.
    // An unchanged pointer needs no frame. Actual sprite/plate hover changes
    // invalidate the GPU scene directly; no border worker task is involved.
    if (!poseChanged && !sceneDirty && !cadenceProbe.active) {
      if (pendingHover && pointerIsIdle()) syncPointerHover();
      if (!sceneDirty) {
        if (vinylChanged || portraitsChanged) renderScene(dt);
        raf = requestAnimationFrame(frame);
        return;
      }
    }
    sceneDirty = false;
    groundAvatars?.update(view, width, height, avatarDestinationId(), {
      hold: motion.isFlying() && !isLocalAvatarFlight(),
    });
    if (dt > 0 && dt < 1) {
      frameSamples.push(dt * 1000);
      if (frameSamples.length > 240) frameSamples.shift();
    }
    const levels = geographyLevels(view.height),
      viewport = geographicViewport || viewportBounds(view, width, height, 1.1);
    syncPointerHover();
    uploadCount = 0;
    uploadBytes = 0;
    uploadDeadline = performance.now() + 1;
    visibleTiles = 0;
    visibleSegments = 0;
    // World borders use a coarser source than local plates. Retire their
    // separate stroke before the commune mosaic appears along the frontier.
    showLayer(countryLayer, 1 - fade(view.height, 2.2, 8), 0.72, viewport);
    // HTML city points and geographic plates share the same hover target.
    // Keep hover transient; the destination focus still changes only on arrival.
    const surfaceHoveredId = motion.isMoving() || wheelZoom.isMoving() || orbit.isMoving() || pointers.size
      ? null : cityMarkers.getHoveredId() || hovered?.id;
    territoryPlates.update(view, surfaceHoveredId);
    seededCommuneSurfaces.update(view, surfaceHoveredId);
    landMaterial.color.copy(landColor).lerp(inactiveLandColor, territoryFocus.strength);
    quarterStream.update(view, surfaceHoveredId, camera, width, height, {
      hold: motion.isFlying() && !isLocalAvatarFlight(),
    });
    for (const [id, cached] of loadedDepartments) cached.surfaces.update(view, surfaceHoveredId, wantedIds.has(id));
    showLayer(communeLayer, levels.commune * (1 - levels.quartier), 1.15, viewport);
    for (const [id, cached] of loadedDepartments)
      showLayer(cached.layer, wantedIds.has(id) ? levels.commune * (1 - levels.quartier) : 0, 1.15, viewport);
    atmosphereMaterial.uniforms.strength.value = 1 - fade(view.height, 3, 15);
    atmosphere.visible = view.height > 3;
    const moving = poseChanged;
    const visibleLabels = geographicLabels.update(camera, view.height, width, height);
    const mosaicDepartments = new Set(seededDepartments);
    for (const id of loadedDepartments.keys()) if (wantedIds.has(id)) mosaicDepartments.add(id);
    cityMarkers.update(camera, view.height, width, height, geographicViewport || viewportBounds(view, width, height, 1.3), mosaicDepartments, surfaceHoveredId);
    const gpuQuery = beginGpu(moving);
    updateLand();
    renderScene(dt);
    renderTimes.push(performance.now());
    while (renderTimes.length && renderTimes[0] < performance.now() - 1000) renderTimes.shift();
    Object.assign(renderedView, view);
    if (gpuQuery) {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      gpuQueries.push({ query: gpuQuery, moving });
    }
    metrics.frame({
      now: performance.now(),
      moving,
      interval: dt * 1000,
      cpu: performance.now() - frameStart,
      height: view.height,
      triangles: renderer.info.render.triangles,
      loading: loadingDepartments.size,
    });
    cpuSamples.push(performance.now() - frameStart);
    if (cpuSamples.length > 240) cpuSamples.shift();
    onFrame({
      view: { ...view },
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      moving: motion.isMoving() || wheelZoom.isMoving() || orbit.isMoving(),
      communesLoaded:
        communes.features.length +
        [...loadedDepartments.values()].reduce((sum, c) => sum + c.features.length, 0),
      geographyLoading: loadingDepartments.size > 0,
      geographyErrors: [...geographyErrors],
      geographyLevel: levels.level,
      layerVisibility: levels,
      visibleTiles,
      visibleSegments,
      visibleLabels,
      landmark: parisLandmarks.state(),
      saturnRing: saturnRing.state(),
      departmentsLoaded: loadedDepartments.size,
      departmentsVisible: [...loadedDepartments.keys()].filter((id) => wantedIds.has(id)).length,
      avatars: groundAvatars?.stats() || { total: 0, visible: 0 },
    });
    raf = requestAnimationFrame(frame);
  }
  // Boot can request the globe overview before ResizeObserver first runs.
  // Size both the camera and renderer synchronously before exposing navigation.
  resizeViewport();
  raf = requestAnimationFrame(frame);
  prefetchArrival({ cityCode: PARIS_CITY_CODE, quarterId: CHARONNE_ID });
  function notifyRingMode(active: boolean, returning = false) {
    if (host.parentElement) host.parentElement.dataset.navigationMode = active ? 'ring' : 'globe';
    host.dispatchEvent(new CustomEvent('meewav:ring-mode', { bubbles: true, detail: { active, returning } }));
  }
  function exitRing(target?: any, afterReturn?: () => void) {
    if (!ringNavigation.active || ringNavigation.returning) return;
    const overview = overviewTarget('globe', width, height);
    const destination = target
      ? { ...view, ...target, pitch: 0, bearing: target.globeOverview ? overview.bearing : 0 }
      : { ...overview };
    const destinationCamera = camera.clone();
    createOrbitCameraUpdater(destinationCamera, destination, GLOBE_ALIGN)();
    ringPortraits.cancel();
    ringPortraits.beginReturn();
    canvas.classList.remove('dragging'); canvas.style.cursor = 'grab';
    notifyRingMode(true, true);
    ringNavigation.returnTo(destinationCamera, () => {
      motion.flyTo(destination, 0);
      ringPortraits.setActive(false);
      geographicLabels.mesh.visible = true;
      updateGlobeCamera(); ringPortraits.setOverview(view.height); sceneDirty = true;
      notifyRingMode(false);
      afterReturn?.();
    });
    sceneDirty = true;
  }
  function enterRing() {
    if (liveMarkers !== null) return;
    if (ringNavigation.active) return;
    motion.interrupt(); wheelZoom.cancel(); orbit.cancel(); cancelPick();
    pendingFlightFocus = null; pendingHover = null; pointers.clear(); gesture = null;
    clearHover(); territoryFocus.set(null, true); setBrandVisible(false);
    cityMarkers.clearHover();
    groundAvatars?.clearSelection();
    const overviewView = { ...view, height: 390 };
    groundAvatars?.update(overviewView, width, height, null);
    territoryPlates.update(overviewView, null);
    seededCommuneSurfaces.update(overviewView, null, false);
    for (const cached of loadedDepartments.values()) cached.surfaces.update(overviewView, null, false);
    quarterStream.update(overviewView, null, camera, width, height);
    parisLandmarks.update(overviewView);
    geographicLabels.mesh.visible = false;
    for (const layer of [countryLayer, communeLayer,
      ...[...loadedDepartments.values()].map(cached => cached.layer)]) {
      for (const tile of layer?.tiles || []) if (tile.line) tile.line.visible = false;
    }
    landMaterial.color.copy(landColor);
    canvas.style.cursor = 'grab';
    ringPortraits.setActive(true);
    ringNavigation.enter(); sceneDirty = true; notifyRingMode(true);
    canvas.focus({ preventScroll: true });
  }
  return {
    firstFrame,
    flyTo,
    enterRing,
    exitRing,
    getPreviewSnapshot: () => ({ view: { ...view }, focus: { cityCode: territoryFocus.cityCode,
      quarterId: territoryFocus.quarterId }, focusExitHeight, ring: ringNavigation.state() }),
    restorePreviewSnapshot(snapshot: any) {
      motion.flyTo(snapshot.view, 0);
      territoryFocus.set(snapshot.focus, true);
      focusExitHeight = snapshot.focusExitHeight;
      updateGlobeCamera();
      if (snapshot.ring?.active) {
        enterRing();
        ringNavigation.restore(snapshot.ring);
        ringPortraits.setEntryProgress(1);
      }
      sceneDirty = true;
    },
    closeRingPortrait: ringPortraits.clearSelection,
    closeGroundAvatar() { groundAvatars?.clearSelection(); },
    setLiveMarkers(markers: any[]) { groundAvatars?.setLiveMarkers(markers); sceneDirty = true; },
    searchAvatars(query: string) { return groundAvatars?.search(query) || []; },
    getAvatarStats() { return groundAvatars?.stats() || { total: 0, visible: 0 }; },
    getRingNavigationState: () => ({ ...ringNavigation.state(), portraits: ringPortraits.count }),
    setFocus(destination: any) {
      pendingFlightFocus = null;
      territoryFocus.set(destination);
      focusExitHeight = focusReleaseHeight(view.height);
      sceneDirty = true;
    },
    getFocus() { return pendingFlightFocus && motion.isFlying() ? pendingFlightFocus.destination
      : { cityCode: territoryFocus.cityCode, quarterId: territoryFocus.quarterId }; },
    getOverviewTarget(kind: "country" | "globe") { return overviewTarget(kind, Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)); },
    getCityAtView(pose = view) {
      const cities = labelData.filter((label: any) => label.kind === "city");
      const point = [pose.lon, pose.lat];
      if (pose.height < 2.8) {
        const seeded = communes.features.find((feature: any) => contains(feature, point));
        let containing = seeded;
        if (!containing) for (const cached of loadedDepartments.values()) {
          containing = cached.features.find((feature: any) => packedContains(cached.packed, feature, point));
          if (containing) break;
        }
        if (containing) {
          const code = String(containing.properties.code || "");
          const id = /^751\d\d$/.test(code) ? "fr-commune-75056" : containing.id;
          const city = cities.find((item: any) => item.id === id);
          if (city) return city;
        }
      }
      const normal = new T.Vector3(...xyz(pose.lon, pose.lat, 1));
      let nearest = null, best = -Infinity;
      for (const city of cities) {
        if (pose.height >= 2.8 && !city.major) continue;
        const score = normal.dot(new T.Vector3(...xyz(...city.center, 1)));
        if (score > best) { best = score; nearest = city; }
      }
      return nearest;
    },
    getRingSurface: saturnRing.surfaceAt,
    intersectRing: saturnRing.intersect,
    stopNavigation() {
      motion.interrupt(); wheelZoom.cancel(); orbit.cancel(); cancelPick();
    },
    zoom,
    async probeCadence() {
      if (!active) throw Error("Le globe doit être visible pour mesurer la cadence");
      const result = await cadenceProbe.start();
      return {
        ...result,
        environment: {
          userAgent: navigator.userAgent,
          viewport: { width, height, dpr: renderer.getPixelRatio() },
          visibility: document.visibilityState,
          focused: document.hasFocus(),
        },
      };
    },
    startMeasurement() {
      metrics.start();
    },
    stopMeasurement() {
      metrics.stop();
      for (const pending of gpuQueries) gl.deleteQuery(pending.query);
      gpuQueries.length = 0;
      return metrics.report();
    },
    getMotionPerformance() {
      return metrics.report();
    },
    setSelection(feature: any) {
      quarterStream.setSelected(feature?.id || null);
      territoryPlates.setSelected(feature?.id || null);
      seededCommuneSurfaces.setSelected(feature?.id || null);
      for (const cached of loadedDepartments.values()) cached.surfaces.setSelected(feature?.id || null);
      sceneDirty = true;
    },
    getPerformance() {
      const percentile = (values: number[], fraction: number) => {
        const sorted = [...values].sort((a, b) => a - b);
        return +(sorted[Math.floor((sorted.length - 1) * fraction)] || 0).toFixed(2);
      };
      return {
        renderFps: renderTimes.filter((time) => time >= performance.now() - 1000).length,
        sampleFrames: frameSamples.length,
        frameP95Ms: percentile(frameSamples, 0.95),
        frameMaxMs: percentile(frameSamples, 1),
        cpuP95Ms: percentile(cpuSamples, 0.95),
      };
    },
    getView() {
      return { ...view };
    },
    isMoving() {
      return motion.isMoving() || wheelZoom.isMoving() || orbit.isMoving();
    },
    setActive(value: boolean) {
      if (active === value) return;
      ringNavigation.cancel();
      ringPortraits.cancel();
      pendingHover = null;
      clearHover();
      cadenceProbe.cancel();
      active = value;
      wheelZoom.cancel();
      orbit.cancel();
      sceneDirty = true;
      lastTime = 0;
      cancelPick();
      pointers.clear();
      canvas.classList.remove("dragging");
      gesture = null;
      motion.interrupt();
      cancelAnimationFrame(raf);
      if (active) raf = requestAnimationFrame(frame);
    },
    destroy() {
      // Stop rendering immediately, but retain materials until an in-progress
      // parallel compile has finished polling them (notably during Vite HMR).
      alive = false;
      compilationClosed = true;
      finishFirstFrame?.();
      finishFirstFrame = undefined;
      cancelAnimationFrame(raf);
      canvas.remove();
      void compilationQueue.then(() => {
      livePaletteUpdates.delete(updatePalette);
      alive = false;
      ringNavigation.exit();
      orbitBloom.dispose();
      ringPortraits.dispose();
      quarterHoverCard.dispose();
      groundAvatars?.dispose();
      cityMarkers.dispose();
      quarterStream.dispose();
      saturnRing.dispose();
      territoryPlates.dispose();
      seededCommuneSurfaces.dispose();
      for (const cached of loadedDepartments.values()) cached.surfaces.dispose();
      parisLandmarks.dispose();
      orbit.cancel();
      window.removeEventListener("blur", blur);
      canvas.removeEventListener("contextmenu", contextmenu);
      scene.remove(geographicLabels.mesh);
      geographicLabels.dispose();
      wheelZoom.cancel();
      cadenceProbe.cancel();
      worker.terminate();
      for (const task of tasks.values()) task.reject(Error("Globe fermé"));
      tasks.clear();
      for (const layer of [
        countryLayer,
        communeLayer,
        ...[...loadedDepartments.values()].map((c) => c.layer),
      ])
        removeLayer(layer);
      cancelPick();
      cancelAnimationFrame(raf);
      resize.disconnect();
      ringVisibility.disconnect();
      scene.traverse((obj: any) => {
        obj.geometry?.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => m.dispose());
        }
      });
      for (const pending of gpuQueries) gl.deleteQuery(pending.query);
      renderer.dispose();
      canvas.remove();
      });
    },
  };
}
