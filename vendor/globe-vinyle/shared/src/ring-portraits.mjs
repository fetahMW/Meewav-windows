import * as T from 'three';
import { SCENE_DEMO_ARTISTS } from './reference/features/shorts/sceneArtistPortraits';
import { RING_PORTRAIT_LANES } from './saturn-ring.mjs';
import { RADIUS } from './geo.mjs';

// Existing La Scène demo identities and their Tremplin photographic portraits.
const ARTISTS = SCENE_DEMO_ARTISTS.map(artist => [artist.portrait.split('/').pop().replace(/\.webp$/, ''), artist.name]);
const urlFor = index => new URL(`ui/ring-portraits/${ARTISTS[index][0]}.webp`, document.baseURI).href;
const LANES = RING_PORTRAIT_LANES.centers.length, COUNT = 96, COLUMNS = COUNT / LANES, SIZE = 1.5, FAR = 95;
const ATLAS_COLUMNS = 2 ** Math.ceil(Math.log2(Math.sqrt(ARTISTS.length)));
const TILE_SIZE = 512, ATLAS_SIZE = ATLAS_COLUMNS * TILE_SIZE;
const OVERVIEW_SCALE = 3;
// Retire the overview portraits before local map views, even when a steep
// camera tilt brings a distant part of the ring back into the frame.
const OVERVIEW_HIDE_HEIGHT = 70, OVERVIEW_FULL_HEIGHT = 90;

function seededRandom(seed) {
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

function arrangeArtists() {
  const placements = new Float32Array(COUNT).fill(-1);
  const usage = new Uint16Array(ARTISTS.length);
  // Stable across navigation/reloads, with a new draw for every placement.
  const random = seededRandom(0x91e10da5);
  // A photo cannot recur within six columns on ANY lane, including the seam.
  // Keep enough distinct artists for the whole circular exclusion window.
  const separation = Math.min(6, Math.max(0, Math.floor((ARTISTS.length / LANES - 1) / 2)));
  for (let i = 0; i < COUNT; i++) {
    const column = Math.floor(i / LANES), excluded = new Set();
    for (let offset = -separation; offset <= separation; offset++) {
      const neighbor = (column + offset + COLUMNS) % COLUMNS;
      for (let lane = 0; lane < LANES; lane++) excluded.add(placements[neighbor * LANES + lane]);
    }
    let artistIndex = -1, bestScore = Infinity;
    for (let index = 0; index < ARTISTS.length; index++) {
      if (excluded.has(index)) continue;
      // Favor the least used portraits; shuffle equal-use candidates instead
      // of repeating a fixed sequence or tying the photo to the instance ID.
      const score = usage[index] + random();
      if (score < bestScore) { bestScore = score; artistIndex = index; }
    }
    placements[i] = artistIndex; usage[artistIndex]++;
  }
  return placements;
}

// Repeated reference portraits for exploration only, not real legendary accounts.
// One atlas and one instanced draw; no per-portrait DOM or animation loop.
export function createRingPortraits(scene, ring, camera, canvas, invalidate, pixelRatio = 1) {
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = ATLAS_SIZE;
  const ctx = atlas.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#756B9D'; ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  const texture = new T.CanvasTexture(atlas); texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearMipmapLinearFilter; texture.magFilter = T.LinearFilter;
  const geometry = new T.PlaneGeometry(SIZE, SIZE);
  const ids = new Float32Array(COUNT);
  const artistIndices = arrangeArtists();
  const material = new T.ShaderMaterial({
    uniforms: { atlas: { value: texture }, hovered: { value: -1 }, selected: { value: -1 },
      portraitRadius: { value: SIZE * 0.5 }, displayScale: { value: 1 }, maxDistance: { value: FAR },
      portraitVisibility: { value: 1 }, distanceFade: { value: 0 },
      pixelRatio: { value: pixelRatio }, rimVisibility: ring.explorationVisibility },
    depthTest: true, depthWrite: true, toneMapped: false, alphaToCoverage: true,
    vertexShader: `
      attribute float portraitId, artistTile;
      uniform float hovered, selected;
      uniform float portraitRadius, displayScale;
      varying vec2 vUv, vAtlasCell, vEmphasis; varying float vDistance;
      void main() {
        // Leave room for edge coverage outside the mathematical circle without
        // enlarging the visible portrait or moving its contact with the floor.
        vUv = (uv - 0.5) * 1.2 + 0.5;
        // Resolve the atlas cell from the exact instance attribute, BEFORE
        // interpolation. floor/mod on an interpolated ID can cross an integer
        // boundary and sample unrelated portraits on alternating pixels.
        vAtlasCell = vec2(mod(artistTile, ${ATLAS_COLUMNS}.0), ${ATLAS_COLUMNS - 1}.0-floor(artistTile/${ATLAS_COLUMNS}.0));
        vEmphasis = vec2(1.0-step(0.1, abs(portraitId-hovered)), 1.0-step(0.1, abs(portraitId-selected)));
        float emphasis = max(vEmphasis.x, vEmphasis.y);
        float scale = displayScale * (1.0 + emphasis * 0.12);
        // Camera-parallel discs preserve the round photo without perspective
        // skew. The bottom vertex remains at the exact world-space floor base,
        // including while the portrait grows on hover.
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        center.y += portraitRadius * scale;
        vDistance = length(center.xyz);
        center.xy += position.xy * scale * 1.2;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `
      uniform sampler2D atlas;
      uniform float maxDistance, pixelRatio, rimVisibility, portraitVisibility, distanceFade;
      varying vec2 vUv, vAtlasCell, vEmphasis; varying float vDistance;
      void main() {
        float r = length(vUv-0.5);
        // Measure a physical screen pixel before discarding fragments. The
        // Euclidean gradient keeps the rim equally thin around the whole circle.
        float pixel = max(length(vec2(dFdx(r), dFdy(r))), 0.000001);
        float feather = pixel * 0.5;
        float coverage = (1.0 - smoothstep(0.5 - feather, 0.5 + feather, r)) * portraitVisibility
          * (1.0 - distanceFade * smoothstep(${(FAR * 0.8).toFixed(1)}, ${FAR}.0, vDistance));
        if (coverage <= 0.0 || vDistance > maxDistance) discard;
        #ifdef ORBIT_BLOOM_OCCLUDER
        // The selective HDR pass needs only the same circular silhouette and
        // fades. Do not sample the atlas or turn a portrait into a glow source.
        gl_FragColor = vec4(0.0, 0.0, 0.0, coverage);
        #else
        float rimWidth = max(0.010, 0.75 * pixelRatio * pixel);
        float innerRadius = 0.5 - rimWidth;
        float h = vEmphasis.x;
        float s = vEmphasis.y;
        vec2 photoUv = clamp((vUv-0.5)/mix(1.0,0.976,rimVisibility)+0.5,0.008,0.992);
        vec3 photo = texture2D(atlas,(vAtlasCell+photoUv)/${ATLAS_COLUMNS}.0).rgb;
        vec3 rim = mix(vec3(0.35,0.24,0.57),vec3(0.8,0.71,1.0),max(h,s));
        rim = mix(rim,vec3(0.42,0.72,1.0),s);
        vec3 color = mix(photo*(1.0+h*0.1),rim,rimVisibility*smoothstep(innerRadius-feather,innerRadius+feather,r));
        // Use the existing multisampled depth buffer for partial edge coverage,
        // retaining correct occlusion between portraits, the globe and the ring.
        gl_FragColor = vec4(color,coverage);
        #include <colorspace_fragment>
        #endif
      }`,
  });
  const mesh = new T.InstancedMesh(geometry, material, COUNT);
  mesh.name = 'Legendary artist demo portraits'; mesh.frustumCulled = false; mesh.visible = false;
  // Geographic fills ignore depth, so draw portraits after them while keeping
  // the earth/ring depth buffer for the back side of the orbit.
  mesh.renderOrder = 8;
  const bases = [], localBases = [], matrix = new T.Matrix4();
  const scatter = seededRandom(0x43bf3b87);
  for (let i = 0; i < COUNT; i++) {
    const lane = i % LANES, column = Math.floor(i / LANES);
    // Stratify rather than clump: 24 per band, staggered angles, independent
    // radial offsets and a minimum gap between angular neighbours. The golden
    // offset avoids four straight spokes; fixed seeds preserve every placement.
    const angle = (column + (lane * 0.61803398875) % 1 + (scatter() - 0.5) * 0.64) / COLUMNS * Math.PI * 2;
    const across = RING_PORTRAIT_LANES.centers[lane] + (scatter() - 0.5) * 0.10;
    const surface = ring.surfaceAt(angle, across);
    const base = ring.root.worldToLocal(surface.position);
    localBases.push(base); bases.push(new T.Vector3()); ids[i] = i;
    mesh.setMatrixAt(i, matrix.makeTranslation(base.x, base.y, base.z));
  }
  geometry.setAttribute('portraitId', new T.InstancedBufferAttribute(ids, 1));
  geometry.setAttribute('artistTile', new T.InstancedBufferAttribute(artistIndices, 1));
  ring.turntable.add(mesh);
  let basesRotation = NaN;
  function syncBases() {
    if (basesRotation === ring.rotation) return;
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < COUNT; i++) bases[i].copy(localBases[i]).applyMatrix4(mesh.matrixWorld);
    basesRotation = ring.rotation;
  }
  const overviewFrustum = new T.Frustum(), overviewProjection = new T.Matrix4();
  const overviewBounds = new T.Sphere(), overviewUp = new T.Vector3(), overviewDelta = new T.Vector3();
  function hasVisibleOverviewPortrait() {
    syncBases();
    overviewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    overviewFrustum.setFromProjectionMatrix(overviewProjection);
    overviewUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const radius = SIZE * 0.5 * OVERVIEW_SCALE;
    // The shader raises the disc by a radius along camera-up. Include its
    // antialiased edge and a generous margin so no visible edge is cut early.
    overviewBounds.radius = radius * 1.2;
    const cameraDistance = camera.position.length();
    const horizonSin = Math.min(1, RADIUS / cameraDistance);
    const horizonCos = Math.sqrt(Math.max(0, 1 - horizonSin * horizonSin));
    for (const base of bases) {
      overviewBounds.center.copy(base).addScaledVector(overviewUp, radius);
      if (!overviewFrustum.intersectsSphere(overviewBounds)) continue;
      overviewDelta.copy(overviewBounds.center).sub(camera.position);
      const alongEarth = -overviewDelta.dot(camera.position) / cameraDistance;
      // Conservatively reject only a whole bounding sphere inside the Earth's
      // silhouette AND beyond its centre plane. The depth buffer handles all
      // partial occultations; a portrait grazing the horizon stays submitted.
      if (cameraDistance > RADIUS && alongEarth - overviewBounds.radius > cameraDistance) {
        const acrossEarth = Math.sqrt(Math.max(0, overviewDelta.lengthSq() - alongEarth * alongEarth));
        if (alongEarth * horizonSin - acrossEarth * horizonCos > overviewBounds.radius) continue;
      }
      return true;
    }
    return false;
  }
  let disposed = false, loaded = false, active = false, pointer = null, down = null, hover = -1, selected = -1;
  let entering = false;
  let returnStart = { scale: 1, rim: 1, distanceFade: 1, visibility: 1 };
  const images = [];
  function load() {
    if (loaded) return; loaded = true;
    let remaining = ARTISTS.length;
    const settled = () => {
      // Upload the atlas once after loading, not once for each of the 60 photos.
      if (--remaining === 0 && !disposed) { texture.needsUpdate = true; invalidate(); }
    };
    ARTISTS.forEach((_, index) => {
      const image = new Image(); images.push(image);
      image.onload = () => {
        if (disposed) return;
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        ctx.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side,
          index%ATLAS_COLUMNS*TILE_SIZE, Math.floor(index/ATLAS_COLUMNS)*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        settled();
      };
      image.onerror = settled;
      image.src = urlFor(index);
    });
  }
  const popupCenter = new T.Vector3(), popupEdge = new T.Vector3();
  const popupUp = new T.Vector3(), popupRight = new T.Vector3();
  function select(id) {
    if (selected === id) return;
    selected = id; material.uniforms.selected.value = id;
    let detail = null;
    if (id >= 0) {
      syncBases();
      const artistIndex = artistIndices[id], artist = ARTISTS[artistIndex];
      const rect = canvas.getBoundingClientRect();
      const radius = SIZE * 0.56;
      popupUp.setFromMatrixColumn(camera.matrixWorld, 1);
      popupRight.setFromMatrixColumn(camera.matrixWorld, 0);
      popupCenter.copy(bases[id]).addScaledVector(popupUp, radius);
      popupEdge.copy(popupCenter).addScaledVector(popupRight, radius).project(camera);
      popupCenter.project(camera);
      detail = { instanceId: id, slug: artist[0], name: artist[1], portraitUrl: urlFor(artistIndex),
        anchor: { x: rect.left + (popupCenter.x + 1) * rect.width / 2,
          y: rect.top + (1 - popupCenter.y) * rect.height / 2,
          clearance: Math.abs(popupEdge.x - popupCenter.x) * rect.width / 2,
          viewportWidth: window.innerWidth, viewportHeight: window.innerHeight } };
    }
    canvas.dispatchEvent(new CustomEvent('meewav:ring-portrait-select', { bubbles: true, detail }));
    invalidate();
  }
  const raycaster = new T.Raycaster(), planeNormal = new T.Vector3(), offset = new T.Vector3();
  const right = new T.Vector3(), up = new T.Vector3(), center = new T.Vector3(), projected = new T.Vector2();
  const earthSphere = new T.Sphere(new T.Vector3(), 100), earthHit = new T.Vector3();
  function pick(x, y) {
    syncBases();
    const rect = canvas.getBoundingClientRect();
    projected.set((x-rect.left)/rect.width*2-1, 1-(y-rect.top)/rect.height*2);
    raycaster.setFromCamera(projected, camera);
    planeNormal.setFromMatrixColumn(camera.matrixWorld, 2);
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const denom = raycaster.ray.direction.dot(planeNormal);
    if (Math.abs(denom) < 0.0001) return -1;
    let best = FAR + SIZE, found = -1;
    if (raycaster.ray.intersectSphere(earthSphere, earthHit)) best = Math.min(best, earthHit.distanceTo(raycaster.ray.origin));
    const floor = ring.intersect(raycaster); if (floor) best = Math.min(best, floor.distance);
    for (let i = 0; i < COUNT; i++) {
      const radius = SIZE*0.5*(i === hover || i === selected ? 1.12 : 1);
      center.copy(bases[i]).addScaledVector(up, radius);
      offset.copy(center).sub(raycaster.ray.origin);
      if (offset.lengthSq() > FAR*FAR) continue;
      const distance = offset.dot(planeNormal)/denom;
      if (distance <= camera.near || distance >= best) continue;
      offset.copy(raycaster.ray.direction).multiplyScalar(distance).add(raycaster.ray.origin).sub(center);
      if (Math.hypot(offset.dot(right), offset.dot(up)) <= radius) { best = distance; found = i; }
    }
    return found;
  }
  function setHover(id) {
    if (id === hover) return false;
    hover = id; material.uniforms.hovered.value = id;
    canvas.style.cursor = down ? 'grabbing' : id >= 0 ? 'pointer' : 'grab';
    return true;
  }
  const leave = () => { pointer = null; if (setHover(-1)) invalidate(); };
  canvas.addEventListener('pointerleave', leave);
  return {
    count: COUNT,
    createBloomOccluder() {
      const proxyMaterial = new T.ShaderMaterial({
        uniforms: material.uniforms,
        vertexShader: material.vertexShader,
        fragmentShader: material.fragmentShader,
        defines: { ORBIT_BLOOM_OCCLUDER: 1 },
        depthTest: true, depthWrite: true, toneMapped: false,
        blending: T.NoBlending,
      });
      proxyMaterial.name = 'Legendary portrait bloom protection';
      // Share the static plane and instance attributes, but retain a distinct
      // instanceMatrix buffer so disposing this pass cannot free the photo draw.
      const proxyMesh = new T.InstancedMesh(geometry, proxyMaterial, mesh.instanceMatrix.count);
      proxyMesh.name = 'Legendary portrait bloom silhouettes';
      proxyMesh.matrixAutoUpdate = false;
      proxyMesh.frustumCulled = false;
      let matrixVersion = -1, proxyDisposed = false;
      function update() {
        if (proxyDisposed) return;
        proxyMesh.visible = !disposed && mesh.visible;
        proxyMesh.count = mesh.count;
        proxyMesh.renderOrder = mesh.renderOrder;
        mesh.updateWorldMatrix(true, false);
        proxyMesh.matrix.copy(mesh.matrixWorld);
        proxyMesh.matrixWorldNeedsUpdate = true;
        if (matrixVersion !== mesh.instanceMatrix.version) {
          proxyMesh.instanceMatrix.array.set(mesh.instanceMatrix.array);
          proxyMesh.instanceMatrix.needsUpdate = true;
          matrixVersion = mesh.instanceMatrix.version;
        }
      }
      update();
      return {
        mesh: proxyMesh,
        update,
        dispose() {
          if (proxyDisposed) return;
          proxyDisposed = true;
          proxyMesh.removeFromParent();
          proxyMesh.dispose();
          proxyMaterial.dispose();
        },
      };
    },
    clearSelection: () => select(-1),
    setActive(value) {
      active = value; mesh.visible = value; pointer = down = null; setHover(-1); select(-1);
      entering = value;
      if (value) {
        // Keep the same visible overview portraits as the approach begins.
        material.uniforms.maxDistance.value = 900;
        material.uniforms.portraitVisibility.value = 1;
        material.uniforms.distanceFade.value = 0;
      }
      material.uniforms.rimVisibility.value = 0;
      if (value) load();
    },
    setEntryProgress(progress) {
      entering = progress < 1;
      const travel = T.MathUtils.smootherstep(progress, 0, 1);
      const landing = T.MathUtils.smoothstep(progress, 0.52, 1);
      material.uniforms.displayScale.value = T.MathUtils.lerp(OVERVIEW_SCALE, 1, travel);
      material.uniforms.maxDistance.value = entering ? 900 : FAR;
      material.uniforms.portraitVisibility.value = 1;
      material.uniforms.distanceFade.value = landing;
      // The shared uniform lights the ring's lines and the rims together,
      // only during the final approach, reaching full brightness at landing.
      material.uniforms.rimVisibility.value = landing;
    },
    beginReturn() {
      entering = false;
      returnStart = { scale: material.uniforms.displayScale.value, rim: material.uniforms.rimVisibility.value,
        distanceFade: material.uniforms.distanceFade.value, visibility: material.uniforms.portraitVisibility.value };
    },
    setReturnProgress(progress) {
      material.uniforms.displayScale.value = T.MathUtils.lerp(returnStart.scale, OVERVIEW_SCALE, progress);
      material.uniforms.maxDistance.value = 900;
      material.uniforms.rimVisibility.value = returnStart.rim * (1 - progress);
      material.uniforms.distanceFade.value = returnStart.distanceFade * (1 - progress);
      material.uniforms.portraitVisibility.value = T.MathUtils.lerp(returnStart.visibility, 1, progress);
    },
    setOverview(height) {
      if (active) return false;
      const opacity = T.MathUtils.smoothstep(height, OVERVIEW_HIDE_HEIGHT, OVERVIEW_FULL_HEIGHT);
      const visible = opacity > 0 && hasVisibleOverviewPortrait();
      const changed = mesh.visible !== visible || material.uniforms.portraitVisibility.value !== opacity;
      mesh.visible = visible;
      // Readable thumbnails in the distant globe view; the walking view keeps
      // its small grounded portraits. Both modes reuse the same atlas/instances.
      material.uniforms.displayScale.value = OVERVIEW_SCALE;
      material.uniforms.maxDistance.value = camera.far + SIZE * OVERVIEW_SCALE;
      material.uniforms.rimVisibility.value = 0;
      material.uniforms.portraitVisibility.value = opacity;
      material.uniforms.distanceFade.value = 0;
      if (visible) load();
      return changed;
    },
    down(event) {
      if (entering) return;
      select(-1);
      if (down) { down.cancelled = true; return; }
      down = { id:event.pointerId, x:event.clientX, y:event.clientY, moved:0, cancelled:event.button !== 0 || event.ctrlKey };
      pointer = null; if (setHover(-1)) invalidate();
    },
    move(event) {
      if (down) { down.moved = Math.max(down.moved,Math.hypot(event.clientX-down.x,event.clientY-down.y)); return; }
      pointer = { x:event.clientX, y:event.clientY }; invalidate();
    },
    up(event, cancelled) {
      if (!down || down.id !== event.pointerId) return;
      const tap = !cancelled && !down.cancelled && down.moved < 6;
      down = null; pointer = { x:event.clientX,y:event.clientY };
      if (tap) select(pick(pointer.x,pointer.y)); invalidate();
    },
    cancel() { down = pointer = null; select(-1); if (setHover(-1)) invalidate(); },
    update() { return active && !entering && setHover(pointer && !down ? pick(pointer.x,pointer.y) : -1); },
    dispose() {
      disposed = true; images.forEach(image => { image.onload = image.onerror = null; });
      canvas.removeEventListener('pointerleave', leave); select(-1); mesh.removeFromParent();
      mesh.dispose(); geometry.dispose(); material.dispose(); texture.dispose();
    },
  };
}
