import * as T from 'three';
import { RADIUS, xyz, lonlat } from './geo.mjs';
import { createRingLabelOcclusion } from './ring-label-occlusion.mjs';
import { vinylRecordLayout, createVinylRecordGeometry, sampleVinylRecord } from './vinyl-record-geometry.mjs';
import { createVinylRecordMaterial } from './vinyl-record-material.mjs';

const baseLayout = vinylRecordLayout();
export const SATURN_RING = Object.freeze({
  id: 'meewav-saturn-band', innerRadius: baseLayout.innerRadius, outerRadius: baseLayout.outerRadius,
  thickness: Math.max(...baseLayout.bands.map(band => band.thickness)),
  angularSegments: baseLayout.angularSegments, anchorLon: 2.3522, anchorLat: 48.8566, referencePlaneRatio: 0.31,
});
// The same portraits occupy four staggered bands across the playing surface.
export const RING_PORTRAIT_LANES = Object.freeze({
  centers: Object.freeze([0.12, 0.34, 0.57, 0.82]),
});
// Half the initial angular speed: twice the original 36-second period.
const ROTATION_PERIOD_SECONDS = 72;

function ringFrame() {
  const front = new T.Vector3(...xyz(SATURN_RING.anchorLon, SATURN_RING.anchorLat, 1));
  const lon = T.MathUtils.degToRad(SATURN_RING.anchorLon);
  const east = new T.Vector3(Math.cos(lon), 0, -Math.sin(lon));
  const north = new T.Vector3().crossVectors(front, east).normalize();
  const ratio = SATURN_RING.referencePlaneRatio;
  const normal = north.clone().multiplyScalar(Math.sqrt(1 - ratio * ratio)).addScaledVector(front, ratio).normalize();
  const frontOfBand = new T.Vector3().crossVectors(east, normal).normalize();
  return { front, east, north, normal, frontOfBand, ratio };
}

// The ring keeps its accepted on-screen pose. The land turns counterclockwise
// around that same axle so France sits at the centre of the disc.
const GLOBE_RING_YAW = 25;
const GLOBE_ALIGN = new T.Quaternion();
const GLOBE_ALIGN_INV = new T.Quaternion();
{
  const { normal } = ringFrame();
  GLOBE_ALIGN.setFromAxisAngle(normal, T.MathUtils.degToRad(GLOBE_RING_YAW));
  GLOBE_ALIGN_INV.copy(GLOBE_ALIGN).invert();
}
export { GLOBE_ALIGN, GLOBE_ALIGN_INV };
function globeOverviewAroundRing(yawDegrees) {
  const { front, north, normal } = ringFrame();
  const rotation = new T.Quaternion().setFromAxisAngle(normal, T.MathUtils.degToRad(yawDegrees));
  const radial = front.clone().applyQuaternion(rotation);
  const heading = north.clone().applyQuaternion(rotation);
  const [lon, lat] = lonlat(radial.x, radial.y, radial.z);
  const lonRad = T.MathUtils.degToRad(lon), latRad = T.MathUtils.degToRad(lat);
  const east = new T.Vector3(Math.cos(lonRad), 0, -Math.sin(lonRad));
  const geographicNorth = new T.Vector3(
    -Math.sin(latRad) * Math.sin(lonRad), Math.cos(latRad), -Math.sin(latRad) * Math.cos(lonRad));
  return {
    lon, lat,
    bearing: T.MathUtils.radToDeg(Math.atan2(heading.dot(east), heading.dot(geographicNorth))),
  };
}

export const GLOBE_RING_VIEW = Object.freeze({
  ...globeOverviewAroundRing(GLOBE_RING_YAW),
  height: 215, pitch: 0, globeOverview: true,
});
export const GLOBE_OVERVIEW = Object.freeze({
  ...globeOverviewAroundRing(0),
  // Reference framing: France stays centered and the disc rises to the right.
  // Roll the overview camera, keeping the physical ring and its lights fixed.
  bearing: 15,
  height: 215, pitch: 0, globeOverview: true,
});
const TAU = Math.PI * 2;

export function createSaturnRingGeometry(quality = 'high') {
  return createVinylRecordGeometry(vinylRecordLayout(quality));
}

export function createSaturnRing(scene, options = {}) {
  const quality = options.quality === 'low' ? 'low' : 'high';
  const layout = vinylRecordLayout(quality);
  const intensity = Number.isFinite(options.intensity) ? T.MathUtils.clamp(options.intensity, 0.1, 2) : 1;
  const root = new T.Group(); root.name = SATURN_RING.id;
  // Preserve the accepted fixed axle and all existing turntable controls.
  const { east, normal, frontOfBand, ratio } = ringFrame();
  root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(east, normal, frontOfBand));
  // Only this child spins. The globe, navigation frame and label occlusion
  // keep their fixed transforms; portraits share the record's one transform.
  const turntable = new T.Group();
  turntable.name = 'MeeWav rotating vinyl and portraits';
  root.add(turntable);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animated = options.animated !== false;
  let rotation = 0;

  // The signature artwork follows the record plane, with neutral CSS fans.
  const material = createVinylRecordMaterial(layout, 0, intensity);
  const explorationVisibility = { value: 0 };
  // Share the portrait rims' landing/return fade: no coloured fill in overview.
  material.uniforms.uExplorationVisibility = explorationVisibility;
  const geometry = createVinylRecordGeometry(layout);
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'MeeWav signature continuous pressed record';
  // Geography fills have the established order 1; retain their globe occlusion.
  mesh.renderOrder = 2;
  mesh.userData.surfaceId = SATURN_RING.id;
  turntable.add(mesh); scene.add(root); root.updateMatrixWorld(true);

  // Compatibility handle only. This dielectric finish has no emission and
  // explicitly disables the old ring's HDR bloom allocation and render passes.
  const bloomRoot = new T.Group(); bloomRoot.matrixAutoUpdate = false;

  const volumes = layout.bands.map(band => ({ innerRadius: band.inner, outerRadius: band.outer,
    bottom: band.height - band.thickness, top: band.height + band.crown }));
  const occludesLabel = createRingLabelOcclusion(root.matrixWorld,
    layout.innerRadius, layout.outerRadius, SATURN_RING.thickness, volumes);
  function surfaceAt(angle, across, clearance = 0) {
    const wrapped = T.MathUtils.euclideanModulo(Number.isFinite(angle) ? angle : 0, TAU);
    const u = T.MathUtils.clamp(Number.isFinite(across) ? across : 0.5, 0, 1);
    const local = sampleVinylRecord(layout, wrapped, T.MathUtils.lerp(layout.innerRadius, layout.outerRadius, u));
    const position = local.position.applyMatrix4(root.matrixWorld);
    const surfaceNormal = local.normal.transformDirection(root.matrixWorld);
    position.addScaledVector(surfaceNormal, Number.isFinite(clearance) ? clearance : 0);
    const forward = new T.Vector3(-Math.sin(wrapped), 0, Math.cos(wrapped)).transformDirection(root.matrixWorld);
    const right = new T.Vector3().crossVectors(surfaceNormal, forward).normalize();
    return { surfaceId: SATURN_RING.id, angle: wrapped, across: u, position,
      normal: surfaceNormal, forward, right, onBand: local.onBand };
  }

  const frustum = new T.Frustum(), projection = new T.Matrix4();
  const lastProjection = new T.Matrix4(), lastCamera = new T.Matrix4();
  let frustumReady = false, intersectsView = true;
  const sectors = [];
  for (const band of layout.bands) for (let sector = 0; sector < 24; sector++) {
    const angle = (sector + 0.5) / 24 * TAU, radius = (band.inner + band.outer) / 2;
    const center = new T.Vector3(radius * Math.cos(angle), band.height, radius * Math.sin(angle)).applyMatrix4(root.matrixWorld);
    sectors.push(new T.Sphere(center, radius * Math.sin(Math.PI / 24) + (band.outer - band.inner) / 2 + band.crown + band.thickness));
  }
  let visible = true, inViewport = true;

  return {
    root, turntable, bloomRoot, bloomEnabled: false, layout, surfaceAt, occludesLabel, explorationVisibility,
    get rotation() { return rotation; },
    get visible() { return visible && inViewport; },
    setInViewport(value) { inViewport = value; },
    tick(dt, camera, enabled = true, rotate = true) {
      if (!frustumReady || !lastProjection.equals(camera.projectionMatrix) || !lastCamera.equals(camera.matrixWorldInverse)) {
        lastProjection.copy(camera.projectionMatrix);
        lastCamera.copy(camera.matrixWorldInverse);
        projection.multiplyMatrices(lastProjection, lastCamera);
        frustum.setFromProjectionMatrix(projection);
        intersectsView = sectors.some(sphere => frustum.intersectsSphere(sphere));
        root.visible = intersectsView;
        frustumReady = true;
      }
      visible = enabled && intersectsView;
      if (!rotate || !animated || reducedMotion.matches || !visible || !inViewport || document.hidden) return false;
      // Use elapsed seconds even at low frame rates. Discard a long suspended
      // frame instead of jumping around the disc when rendering resumes.
      const step = Number.isFinite(dt) && dt > 0 && dt < 1 ? dt : 0;
      if (!step) return false;
      rotation = (rotation + step * TAU / ROTATION_PERIOD_SECONDS) % TAU;
      // Negative local Y is clockwise when looking down on the record.
      turntable.rotation.y = -rotation;
      // Transform the fixed studio sources into the rotating material frame:
      // dust travels with the PVC, highlights stay under their light sources.
      material.uniforms.uLightRotation.value = -rotation;
      turntable.updateMatrixWorld(true);
      return true;
    },
    intersect(raycaster) {
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (!hit) return null;
      const local = root.worldToLocal(hit.point.clone());
      return { surfaceId: SATURN_RING.id, point: hit.point, distance: hit.distance,
        normal: hit.face.normal.clone().transformDirection(mesh.matrixWorld),
        angle: T.MathUtils.euclideanModulo(Math.atan2(local.z, local.x), TAU),
        across: T.MathUtils.clamp((Math.hypot(local.x, local.z) - layout.innerRadius) / (layout.outerRadius - layout.innerRadius), 0, 1),
        side: hit.face.normal.y > 0.5 ? 'floor' : hit.face.normal.y < -0.5 ? 'underside' : 'edge' };
    },
    state: () => ({ id: SATURN_RING.id, innerRadius: layout.innerRadius, outerRadius: layout.outerRadius,
      thickness: SATURN_RING.thickness, anchor: [SATURN_RING.anchorLon, SATURN_RING.anchorLat],
      normal: normal.toArray(), frontArcRadians: [0, Math.PI], referencePlaneRatio: ratio,
      triangles: geometry.index.count / 3, quality, animated: animated && !reducedMotion.matches,
      clockwise: true, rotationRadians: rotation, rotationPeriodSeconds: ROTATION_PERIOD_SECONDS,
      bands: layout.bands, shading: 'MeeWav signature source — filtered CSS/SVG grooves and neutral studio fans',
      navigableSurfacePrepared: true, navigationEnabled: true }),
    dispose() {
      scene.remove(root); geometry.dispose(); material.dispose();
    },
  };
}
