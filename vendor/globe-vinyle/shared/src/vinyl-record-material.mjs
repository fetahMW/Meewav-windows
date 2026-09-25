import * as T from 'three';
import { createRecordFinishProfiles } from '../../../meewav-vinyl/src/record-finish.js';
import { createVinylMicrorelief } from './vinyl-microrelief.mjs';

// The new source is the CSS/SVG signature record in meewav-react-vite.zip.
// It replaces the previous Vinyl V2 optical shader, including its coloured rig.
export function createVinylRecordMaterial(layout, lightRotationDegrees = 0, exposure = 1) {
  const profiles = createRecordFinishProfiles(layout.angularSegments <= 512 ? 4096 : 8192, { trackHalfWidth: 1.10 });
  const textures = [];
  function texture(data, width, repeat = false, height = 1, format = T.RGBAFormat) {
    const result = new T.DataTexture(data, width, height, format, T.UnsignedByteType);
    result.name = 'MeeWav signature record — filtered material profile';
    result.colorSpace = T.NoColorSpace;
    result.magFilter = T.LinearFilter;
    result.minFilter = T.LinearMipmapLinearFilter;
    result.generateMipmaps = true;
    result.anisotropy = height > 1 ? 4 : 1;
    result.wrapS = repeat ? T.RepeatWrapping : T.ClampToEdgeWrapping;
    result.wrapT = result.wrapS;
    result.needsUpdate = true;
    textures.push(result);
    return result;
  }
  // A small deterministic, mip-filtered material texture avoids the visible
  // interpolation grid of analytic value noise in a sharp white reflection.
  const surfaceSize = 2048;
  // Only grain and particles are needed: RG halves this texture's memory
  // and sampling bandwidth without sacrificing its 2048-pixel detail.
  const surface = new Uint8Array(surfaceSize * surfaceSize * 2);
  let seed = 187;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < surface.length; i += 2) {
    surface[i] = Math.round((random() + random() + random()) * 85);
    surface[i + 1] = 0;
  }
  // Continuous, differently sized particle centres avoid the stamped grid
  // made by a threshold at the centre of every noise texel.
  const dustClouds = Array.from({ length: 32 }, () => ({
    x: random() * surfaceSize, y: random() * surfaceSize, spread: 40 + random() * 100,
  }));
  for (let i = 0; i < 24000; i++) {
    let x = random() * surfaceSize, y = random() * surfaceSize;
    if (i % 4 === 0) {
      const cloud = dustClouds[Math.floor(random() * dustClouds.length)];
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(-2 * Math.log(Math.max(random(), 0.000001))) * cloud.spread;
      x = ((cloud.x + Math.cos(angle) * distance) % surfaceSize + surfaceSize) % surfaceSize;
      y = ((cloud.y + Math.sin(angle) * distance) % surfaceSize + surfaceSize) % surfaceSize;
    }
    const radius = 0.35 + Math.pow(random(), 3) * 0.55;
    const brightness = 95 + random() * 160;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const px = Math.floor(x) + dx, py = Math.floor(y) + dy;
      const distance = Math.hypot(px + 0.5 - x, py + 0.5 - y) / radius;
      const value = brightness * Math.exp(-distance * distance * 2);
      const offset = (((py + surfaceSize) % surfaceSize) * surfaceSize + (px + surfaceSize) % surfaceSize) * 2 + 1;
      surface[offset] = Math.max(surface[offset], Math.round(value));
    }
  }
  const material = new T.ShaderMaterial({
    name: 'MeeWav signature vinyl — engraved black PVC and studio reflections',
    uniforms: {
      uEngraving: { value: texture(profiles.engraving, profiles.radialSize) },
      uBody: { value: texture(profiles.body, profiles.angularSize, true) },
      uSpecular: { value: texture(profiles.specular, profiles.angularSize, true) },
      uSurface: { value: texture(surface, surfaceSize, true, surfaceSize, T.RGFormat) },
      uTooling: { value: texture(createVinylMicrorelief(profiles.radialSize), profiles.radialSize, true) },
      uDimensions: { value: new T.Vector3(layout.innerRadius, layout.outerRadius, layout.thickness) },
      uBevel: { value: layout.bevel },
      uArtworkInner: { value: layout.artworkInnerRatio },
      uLightRotation: { value: T.MathUtils.degToRad(lightRotationDegrees) },
      // Opt-in view compensation for decorative miniatures whose highlights
      // rotate with the surface. Zero retains the globe's studio reflections.
      uReflectionSurfaceRotation: { value: 0 },
      uExposure: { value: exposure },
      uExplorationVisibility: { value: 0 },
    },
    depthTest: true, depthWrite: true, transparent: false, side: T.FrontSide,
    // Profiles and screen compositing already use the source's display colours.
    // Global globe lighting/exposure must not turn this black record silver.
    toneMapped: false,
    vertexShader: `
      varying vec3 vVinylPosition, vVinylNormal, vVinylView;
      void main() {
        vVinylPosition = position;
        vVinylNormal = normal;
        vec3 worldView = cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz;
        vVinylView = vec3(dot(worldView, modelMatrix[0].xyz),
          dot(worldView, modelMatrix[1].xyz), dot(worldView, modelMatrix[2].xyz));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uEngraving, uBody, uSpecular, uSurface, uTooling;
      uniform vec3 uDimensions;
      uniform float uArtworkInner, uLightRotation, uReflectionSurfaceRotation, uExposure, uBevel, uExplorationVisibility;
      varying vec3 vVinylPosition, vVinylNormal, vVinylView;
      const float TAU = 6.283185307179586;

      vec4 angularProfile(sampler2D profile, float phase) {
        // atan wraps at the back of the disc. Preserve the short derivatives
        // there so mip filtering cannot paint a bright seam across the vinyl.
        vec2 footprint = fract(vec2(dFdx(phase), dFdy(phase)) + 0.5) - 0.5;
        return texture2DGradEXT(profile, vec2(fract(phase), 0.5),
          vec2(footprint.x, 0.0), vec2(footprint.y, 0.0));
      }

      vec3 studioLight(vec3 direction) {
        float c = cos(uLightRotation), s = sin(uLightRotation);
        return normalize(vec3(c * direction.x - s * direction.z,
          direction.y, s * direction.x + c * direction.z));
      }

      vec3 radialProfile(sampler2D profile, float radius) {
        // Integrate the full pixel across diagonal grooves, including where
        // neither screen-axis derivative alone catches their fine spacing.
        float footprint = max(fwidth(radius), 0.000001);
        return texture2DGradEXT(profile, vec2(radius, 0.5),
          vec2(footprint, 0.0), vec2(0.0)).rgb;
      }

      float grainVisibility(vec2 uv) {
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        float longest = max(length(dx), length(dy));
        float shortest = abs(dx.x * dy.y - dx.y * dy.x) / max(longest, 0.0000001);
        // Retire a noise scale before individual bilinear texels become a
        // visible grid; the finer, fixed physical scale then takes over.
        return smoothstep(0.35, 1.0, shortest * 2048.0);
      }

      vec3 grooveReflection(vec3 V, vec3 radial, vec3 tangent, vec3 L, float sourcePeak, float spread) {
        // Concentric grooves reflect most strongly when the half vector lies
        // in their radial plane. Two fixed softboxes produce two visible front
        // fans and their quieter counterparts on the far side of the record.
        vec3 halfDirection = V + L;
        vec2 plane = halfDirection.xz;
        float planeLength = length(plane);
        plane /= max(planeLength, 0.0001);
        float alongRadius = dot(plane, radial.xz);
        float deviation = atan(dot(plane, tangent.xz), abs(alongRadius) + 0.0001);
        // Sample the original white fan shapes, rather than a flat white beam.
        // Window each source peak to keep its neighbouring fan out of the lobe.
        vec3 fan = angularProfile(uSpecular, sourcePeak / 360.0 + deviation * spread / TAU).rgb;
        float window = exp(-pow(abs(deviation) / 0.25, 4.0));
        float front = mix(0.62, 1.0, smoothstep(-0.12, 0.12, alongRadius));
        float core = exp(-pow(deviation / 0.066, 2.0));
        float radialSlope = planeLength / max(halfDirection.y, 0.12);
        float radialResponse = 1.48 / (1.0 + pow(radialSlope / 1.12, 2.0));
        return (fan * 2.05 + vec3(core * 0.09)) * window * front
          * mix(1.0, radialResponse, 0.45) * smoothstep(0.02, 0.12, planeLength);
      }

      float filteredCut(float radius, float center, float footprint) {
        // Pixel-integrated coverage keeps the five uncut track separators
        // dark under a reflection without flickering at grazing angles.
        float distanceToCut = abs(radius - center);
        return clamp((1.10 + footprint * 0.5 - distanceToCut) / footprint, 0.0, 1.0)
          - clamp((-1.10 + footprint * 0.5 - distanceToCut) / footprint, 0.0, 1.0);
      }

      float pressedShoulder(float radius, float center, float footprint) {
        return filteredCut(radius, center + 1.50, footprint)
          - filteredCut(radius, center - 1.50, footprint);
      }

      void main() {
        float radius = length(vVinylPosition.xz);
        float across = clamp((radius - uDimensions.x) / (uDimensions.y - uDimensions.x), 0.0, 1.0);
        // Refit the complete engraved area around the globe-sized opening.
        // Only the artwork coordinate changes; the disc remains circular/flat.
        float artwork = mix(uArtworkInner, 1.0, across);
        float angle = atan(vVinylPosition.x, -vVinylPosition.z);
        vec3 radial = vec3(vVinylPosition.x, 0.0, vVinylPosition.z) / radius;
        vec3 tangent = vec3(-radial.z, 0.0, radial.x);
        float viewCos = cos(uReflectionSurfaceRotation);
        float viewSin = sin(uReflectionSurfaceRotation);
        vec3 V = normalize(vec3(
          viewCos * vVinylView.x + viewSin * vVinylView.z,
          vVinylView.y,
          -viewSin * vVinylView.x + viewCos * vVinylView.z
        ));
        vec3 N = normalize(vVinylNormal);
        float face = smoothstep(0.05, 0.85, abs(N.y));

        vec4 engraving = texture2D(uEngraving, vec2(artwork, 0.5));
        // The source's broad ambient fans belong to the studio lighting too.
        // Keep them fixed while local grain and dust rotate with the surface.
        vec3 body = angularProfile(uBody, (angle - uLightRotation) / TAU).rgb;
        vec3 color = engraving.rgb + body * engraving.a;

        // Local contrast, not a brighter grey pigment. Both detail and its
        // local average follow the projected footprint, so unresolved grooves
        // naturally merge instead of sharpening distant aliases.
        vec4 averagedEngraving = texture2D(uEngraving, vec2(artwork, 0.5), 3.0);
        vec3 averageColor = averagedEngraving.rgb + body * averagedEngraving.a;
        vec3 engravingDetail = color - averageColor;
        color = max(averageColor * 0.42 + engravingDetail * 0.40, body * 0.18) + vec3(0.004, 0.0038, 0.0035);
        vec3 tooling = radialProfile(uTooling, across);
        color += max(tooling.r - 0.48, 0.0) * vec3(0.050, 0.048, 0.044);

        vec3 leftLight = studioLight(vec3(-0.75, 0.60, -0.30));
        vec3 rightLight = studioLight(vec3(0.85, 0.60, 0.28));
        float grooveRoughness = 0.92 + tooling.b * 0.15;
        vec3 reflection = grooveReflection(V, radial, tangent, leftLight, 228.0, 2.10 * grooveRoughness) * 1.10
          + grooveReflection(V, radial, tangent, rightLight, 47.0, 3.00 * grooveRoughness) * 1.25;
        vec3 rimSoftbox = studioLight(vec3(-0.854, 0.209, -0.476));
        vec3 rimReflection = grooveReflection(V, radial, tangent, rimSoftbox, 228.0, 2.2);
        reflection += rimReflection * 0.40;
        // A small real clearcoat reflection on the back shoulder breaks up
        // the two broad groove fans without illuminating the black substrate.
        vec3 backSoftbox = studioLight(vec3(-0.7473, 0.165, -0.6437));
        vec3 halfBack = normalize(V + backSoftbox);
        reflection += vec3(pow(max(halfBack.y, 0.0), 420.0) * 0.95);
        // Complement the white studio fans in their unlit sectors. These
        // fixed sources reflect through the same grooves as the white lights;
        // camera movement reveals the colour instead of tinting the black PVC.
        vec3 violetLight = studioLight(vec3(0.15, 0.50, -0.98));
        vec3 blueLight = studioLight(vec3(-0.20, 0.45, 0.98));
        float whiteEnergy = dot(reflection, vec3(0.2126, 0.7152, 0.0722));
        float shadowFill = uExplorationVisibility * (1.0 - smoothstep(0.08, 0.42, whiteEnergy));
        vec3 colouredReflection =
          grooveReflection(V, radial, tangent, violetLight, 228.0, 2.30 * grooveRoughness)
            * vec3(0.46, 0.12, 0.85) * 0.65
          + grooveReflection(V, radial, tangent, blueLight, 47.0, 2.48 * grooveRoughness)
            * vec3(0.08, 0.30, 0.90) * 0.65;
        reflection += colouredReflection * shadowFill;
        vec3 unmaskedReflection = reflection;
        float reflectionMask = smoothstep(0.002, 0.02, across)
          * (1.0 - smoothstep(0.978, 0.998, across));
        float fresnel = 0.94 + 0.12 * pow(1.0 - abs(V.y), 3.0);
        float engravedRadius = artwork / 0.987 * 500.0;
        float footprint = max(fwidth(engravedRadius), 0.06);
        float separators = clamp(filteredCut(engravedRadius, 238.0, footprint)
          + filteredCut(engravedRadius, 310.0, footprint)
          + filteredCut(engravedRadius, 372.0, footprint)
          + filteredCut(engravedRadius, 431.0, footprint)
          + filteredCut(engravedRadius, 471.0, footprint), 0.0, 1.0);
        float shoulders = pressedShoulder(engravedRadius, 238.0, footprint)
          + pressedShoulder(engravedRadius, 310.0, footprint)
          + pressedShoulder(engravedRadius, 372.0, footprint)
          + pressedShoulder(engravedRadius, 431.0, footprint)
          + pressedShoulder(engravedRadius, 471.0, footprint);
        // Fine circular tooling plus restrained PVC grain, fixed to the disc.
        // Attenuate unresolved detail instead of letting it shimmer at distance.
        vec2 grainPosition = mat2(0.789, -0.614, 0.614, 0.789) * vVinylPosition.xz;
        vec3 surfaceNoise = texture2D(uSurface, grainPosition * 0.0032).rgb;
        vec3 fineSurfaceNoise = texture2D(uSurface, grainPosition * 0.07).rgb;
        float coarseVisibility = grainVisibility(grainPosition * 0.0032);
        float micrograin = (surfaceNoise.r - 0.5) * coarseVisibility
          + (fineSurfaceNoise.r - 0.5) * grainVisibility(grainPosition * 0.07);
        color = max(color + vec3(micrograin * 0.015), vec3(0.0025));
        vec2 polarUv = vec2(angle / TAU, across * 1.3);
        vec2 polarDx = dFdx(polarUv), polarDy = dFdy(polarUv);
        polarDx.x = fract(polarDx.x + 0.5) - 0.5;
        polarDy.x = fract(polarDy.x + 0.5) - 0.5;
        vec3 grooveSurface = texture2DGradEXT(uSurface, polarUv, polarDx, polarDy).rgb;
        // This second physical scale resolves only when approaching the floor.
        // Its zero-centred mip average leaves the distant globe finish intact.
        float microCut = radialProfile(uTooling, across * 7.37).r - 0.48;
        float grooveWall = tooling.g * 2.0 - 1.0;
        float polishedWall = mix(0.88, 1.08, smoothstep(-0.3, 0.3, grooveWall * dot(V, radial)));
        float pitchVariation = 0.90 + 0.11 * sin(across * 31.0 + 0.7 * sin(across * 63.0));
        float polish = (1.0 + (tooling.r - 0.48) * 1.85) * polishedWall * pitchVariation
          * (0.88 + tooling.b * 0.17) * (1.0 + microCut * 0.40)
          + micrograin * 0.15 + (grooveSurface.r - 0.5) * 0.35 * grainVisibility(polarUv);
        reflection *= polish * vec3(1.22, 1.19, 1.13);
        reflection *= reflectionMask * fresnel * (1.0 - separators * 0.86);
        // A soft photographic shoulder preserves differences between bright
        // groove crests. Hard clipping would turn them into a solid white bar.
        reflection = max(reflection, 0.0);
        reflection = min(reflection, vec3(0.72)) + vec3(0.28)
          * (vec3(1.0) - exp(-max(reflection - vec3(0.72), 0.0) / 0.28));
        reflection = clamp(reflection + (reflection - vec3(0.70)) * 0.16
          * smoothstep(vec3(0.08), vec3(0.25), reflection), 0.0, 1.0);
        // Same 'screen' blend as .vinyl-specular, preserving the black PVC.
        color = vec3(1.0) - (vec3(1.0) - color) * (vec3(1.0) - reflection);
        color *= 1.0 - max(-shoulders, 0.0) * 0.25;
        color += max(shoulders, 0.0) * (1.0 - separators) * reflection * 0.13;
        // Specks use a separate, coarser footprint than the PVC micrograin so
        // they remain tiny isolated flecks rather than disappearing into grey.
        vec2 dustUv = vVinylPosition.xz * 0.005;
        float dust = texture2D(uSurface, dustUv).g * grainVisibility(dustUv) + fineSurfaceNoise.g * 0.6;
        float microScuffs = grooveSurface.g * grainVisibility(polarUv);
        color += (dust * (vec3(0.42, 0.37, 0.30) + reflection * 0.45)
          + microScuffs * (vec3(0.070, 0.061, 0.045) + reflection * 0.45)) * reflectionMask;
        color *= 1.0 - separators * 0.25;

        // The same two lights catch the real rounded lip. Only its narrow
        // physical width gets a silhouette highlight; the main face stays PVC.
        vec3 halfLeft = normalize(V + leftLight);
        vec3 halfRight = normalize(V + rightLight);
        float edgeLight = pow(max(dot(N, halfLeft), 0.0), 48.0)
          + pow(max(dot(N, halfRight), 0.0), 48.0)
          + 0.55 * pow(max(dot(N, normalize(V + rimSoftbox)), 0.0), 32.0)
          + 0.8 * pow(max(dot(N, halfBack), 0.0), 128.0);
        float edgeFresnel = pow(1.0 - abs(dot(N, V)), 3.0);
        vec3 edge = vec3(0.006, 0.005, 0.0045)
          + vec3(0.85, 0.82, 0.76) * edgeLight + unmaskedReflection * 0.18 + vec3(0.008) * edgeFresnel;
        edge += shadowFill * 0.30 * (
          vec3(0.46, 0.12, 0.85) * pow(max(dot(N, normalize(V + violetLight)), 0.0), 64.0)
          + vec3(0.08, 0.30, 0.90) * pow(max(dot(N, normalize(V + blueLight)), 0.0), 64.0));
        float outerLip = 1.0 - smoothstep(uBevel * 0.5, uBevel * 2.0, uDimensions.y - radius);
        color += outerLip * (vec3(0.014 + 0.055 * edgeFresnel) + unmaskedReflection * vec3(0.65, 0.61, 0.55));
        color = mix(edge, color, face);
        // The rounded pressing crest catches a thin, near-white light. Its
        // coverage follows the projected bevel, never a full bright outline.
        float crestWidth = max(uBevel * 0.50, fwidth(radius) * 0.85);
        float rimCrest = exp(-pow((uDimensions.y - radius - uBevel * 0.72) / crestWidth, 2.0));
        float rimEnergy = dot(unmaskedReflection, vec3(0.2126, 0.7152, 0.0722));
        vec3 crestLight = vec3(0.98, 0.96, 0.91) * clamp(rimEnergy * 2.9, 0.0, 1.0);
        color = max(color, crestLight * 1.8 * rimCrest * smoothstep(0.035, 0.16, rimEnergy));
        float contact = 1.0 - 0.34 * exp(-max(radius - uDimensions.x, 0.0) / (uDimensions.y * 0.007));
        color *= contact;
        if (N.y < -0.5) color *= 0.4;
        gl_FragColor = vec4(clamp(color * uExposure, 0.0, 1.0), 1.0);
      }
    `,
  });
  const disposeProfiles = () => {
    for (const profile of textures) profile.dispose();
    material.removeEventListener('dispose', disposeProfiles);
  };
  material.addEventListener('dispose', disposeProfiles);
  return material;
}
