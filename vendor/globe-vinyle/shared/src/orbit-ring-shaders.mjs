import * as T from 'three';
import { ORBIT_APPEARANCE, ORBIT_ARCS, ORBIT_COAT } from './orbit-rings-config.mjs';

export function createOrbitUniforms(intensity, layout, referenceCamera) {
  // Calibrate two virtual reflected softboxes against the accepted France view.
  // These are ring-local reflection directions, never lights in the globe scene.
  const mainBand = layout.bands[2], crest = ORBIT_COAT[2].crest;
  const radius = T.MathUtils.lerp(mainBand.inner, mainBand.outer, crest);
  const slope = mainBand.crown * Math.PI * Math.cos(Math.PI * crest) / (mainBand.outer - mainBand.inner);
  function reflectionDirection(angle) {
    const surface = new T.Vector3(radius * Math.cos(angle),
      mainBand.height + mainBand.crown * Math.sin(Math.PI * crest), radius * Math.sin(angle));
    const normal = new T.Vector3(-slope * Math.cos(angle), 1, -slope * Math.sin(angle)).normalize();
    return referenceCamera.clone().sub(surface).normalize().negate().reflect(normal);
  }
  return { orbitTime: { value: 0 }, orbitIntensity: { value: intensity },
    orbitViolet: { value: new T.Color(ORBIT_APPEARANCE.violet) },
    orbitBlue: { value: new T.Color(ORBIT_APPEARANCE.blue) },
    orbitNeonViolet: { value: new T.Color(ORBIT_APPEARANCE.neonViolet) },
    orbitNeonBlue: { value: new T.Color(ORBIT_APPEARANCE.neonBlue) },
    orbitExposure: { value: ORBIT_APPEARANCE.surfaceExposure },
    orbitPearl: { value: new T.Color(ORBIT_APPEARANCE.pearl) },
    orbitInk: { value: new T.Color(ORBIT_APPEARANCE.ink) },
    orbitVisit: { value: 0 },
    orbitLeftSoftbox: { value: reflectionDirection(ORBIT_APPEARANCE.reflections.left.center) },
    orbitRightSoftbox: { value: reflectionDirection(ORBIT_APPEARANCE.reflections.right.center) } };
}

const vertexShader = `
  attribute float orbitBand, orbitFace;
  varying vec2 vOrbitUv;
  varying float vBand, vFace;
  varying vec3 vOrbitNormal, vOrbitView;
  void main() {
    vOrbitUv = uv; vBand = orbitBand; vFace = orbitFace;
    vec3 worldView = cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz;
    // The fixed ring frame is a rotation with unit scale. Bring the view into
    // this frame so turning the camera moves reflections over the real crown.
    vOrbitView = vec3(dot(worldView, modelMatrix[0].xyz),
      dot(worldView, modelMatrix[1].xyz), dot(worldView, modelMatrix[2].xyz));
    vOrbitNormal = normal;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

// All constants are emitted as GLSL floats, including whole-number values.
const gl = value => Number(value).toFixed(7);
const grazingProfile = ORBIT_APPEARANCE.reflections.grazing;
const coatProfiles = ORBIT_COAT.map((coat, band) => `
  ${band === 0 ? 'if' : 'else if'} (vBand < ${gl(band + 0.5)}) {
    crest = ${gl(coat.crest)}; shoulderWidth = ${gl(coat.shoulder)};
    pearlWidth = ${gl(coat.pearl)}; tailWidth = ${gl(coat.tail)};
    coatGain = ${gl(coat.gain)}; secondaryGain = ${gl(coat.secondary)};
  }
`).join('\n');
const arcs = ORBIT_ARCS.map(arc => `
  if (abs(vBand - ${gl(arc.band)}) < 0.1) {
    float arcMask = angularMask(angle, ${gl(arc.center)} + orbitTime * ${gl(arc.speed)}, ${gl(arc.halfLength)});
    float pixelWidth = max(fwidth(u), 0.00001);
    float line = filteredLine(u, ${gl(arc.edge)}, max(0.006, pixelWidth * 0.65));
    float core = filteredLine(u, ${gl(arc.edge)}, max(0.0012, pixelWidth * 0.35));
    float halo = exp(-pow((u - ${gl(arc.edge)}) / 0.043, 2.0));
    color += neonTint * arcMask * ${gl(arc.strength)} * (line + halo * 0.08);
    // A subpixel pearl core inside a saturated sheath stays readable in the
    // overview. It replaces colour only at that narrow core, never on the body.
    color = mix(color, mix(neonTint, orbitPearl, 0.92) * ${gl(arc.strength)}, core * arcMask);
    // The halo carries the neon pigment, not a blurred white reflection.
    glowSource += neonTint * arcMask * ${gl(arc.strength)} * (line * 1.35 + core * 0.65 + halo * 0.08);
  }
`).join('\n');

export function createOrbitMaterial(uniforms, bloom = false) {
  const material = new T.ShaderMaterial({ uniforms, vertexShader,
    // The ring uses a hue-preserving highlight rolloff. Leave the globe's
    // existing ACES transform alone; it must not wash this neon toward white.
    depthTest: true, depthWrite: true, toneMapped: false,
    fragmentShader: `
      uniform float orbitTime, orbitIntensity, orbitVisit, orbitExposure;
      uniform vec3 orbitViolet, orbitBlue, orbitNeonViolet, orbitNeonBlue, orbitPearl, orbitInk;
      uniform vec3 orbitLeftSoftbox, orbitRightSoftbox;
      varying vec2 vOrbitUv;
      varying float vBand, vFace;
      varying vec3 vOrbitNormal, vOrbitView;
      const float PI = 3.141592653589793;
      float angularMask(float angle, float center, float halfLength) {
        float distance = abs(atan(sin(angle - center), cos(angle - center)));
        return 1.0 - smoothstep(halfLength * 0.30, halfLength, distance);
      }
      float reflectionMask(float angle, float center, float spread) {
        float distance = atan(sin(angle - center), cos(angle - center));
        // No constant-brightness plateau across either side of a ribbon.
        return exp(-3.0 * pow(distance / spread, 2.0));
      }
      float filteredLine(float coordinate, float center, float halfWidth) {
        float pixel = max(fwidth(coordinate), 0.00001);
        float lo = max(coordinate - pixel * 0.5, center - halfWidth);
        float hi = min(coordinate + pixel * 0.5, center + halfWidth);
        return clamp((hi - lo) / pixel, 0.0, 1.0);
      }
      float gaussian(float distance, float width) {
        return exp(-pow(distance / max(width, 0.00001), 2.0));
      }
      void main() {
        float angle = vOrbitUv.x * PI * 2.0;
        float u = vOrbitUv.y;
        float side = smoothstep(-0.7, 0.75, cos(angle));
        vec3 tint = mix(orbitViolet, orbitBlue, side);
        vec3 neonTint = mix(orbitNeonViolet, orbitNeonBlue, side);
        float left = reflectionMask(angle, ${gl(ORBIT_APPEARANCE.reflections.left.center)}, ${gl(ORBIT_APPEARANCE.reflections.left.halfLength)});
        float right = reflectionMask(angle, ${gl(ORBIT_APPEARANCE.reflections.right.center)}, ${gl(ORBIT_APPEARANCE.reflections.right.halfLength)});
        float reflection = max(left, right);
        float face = smoothstep(0.0, 0.85, vFace);
        vec3 normal = normalize(vOrbitNormal), view = normalize(vOrbitView);
        float viewCosine = abs(dot(normal, view));
        float fresnel = pow(1.0 - viewCosine, 3.0);
        // Change only the grazing response; the top view retains its existing
        // reflection widths, colours and intensity with no mode switch.
        float grazing = 1.0 - smoothstep(${gl(grazingProfile.fullBelow)}, ${gl(grazingProfile.offAbove)}, viewCosine);
        float pearlStrength = mix(1.0, ${gl(grazingProfile.pearlStrength)}, grazing);
        float coatStrength = mix(1.0, ${gl(grazingProfile.coatStrength)}, grazing);
        vec3 reflectedView = reflect(-view, normal);
        float leftCoat = pow(max(0.0, dot(reflectedView, orbitLeftSoftbox)), 36.0);
        float rightCoat = pow(max(0.0, dot(reflectedView, orbitRightSoftbox)), 36.0);
        float reflectedCoat = max(leftCoat * left, rightCoat * right);
        float crest = 0.8, shoulderWidth = 0.1, pearlWidth = 0.03;
        float tailWidth = 0.2, coatGain = 0.4, secondaryGain = 0.1;
        ${coatProfiles}
        // Each ribbon has one dominant reflected shoulder. Its asymmetric
        // falloff leaves a dark centre instead of filling the width with colour.
        float radialDistance = u - crest;
        float towardCentre = crest > 0.5 ? -radialDistance : radialDistance;
        float shoulder = gaussian(radialDistance, shoulderWidth);
        float tail = gaussian(radialDistance, towardCentre > 0.0 ? tailWidth : shoulderWidth * 0.7);
        float narrowPearlWidth = pearlWidth * mix(1.0, ${gl(grazingProfile.pearlWidth)}, grazing);
        // Preserve the energy of a subpixel crest instead of letting a thin
        // white reflection flicker or become a dotted contour in the overview.
        float pixelWidth = max(fwidth(u), 0.00001);
        float filteredPearlWidth = sqrt(narrowPearlWidth * narrowPearlWidth + grazing * pixelWidth * pixelWidth / 6.0);
        float pearl = gaussian(radialDistance, filteredPearlWidth) * narrowPearlWidth / filteredPearlWidth;
        float hairline = filteredLine(u, crest, 0.0025);
        float secondShoulder = gaussian(u - (crest > 0.5 ? 0.055 : 0.945), 0.032);
        float fullness = max(0.0, sin(PI * u));
        vec3 color = orbitInk * 1.2 + tint * (0.0015 + 0.0025 * fullness);
        float illumination = pow(reflection, 1.65) * coatGain;
        // A weak coloured tail, a brighter glass shoulder, then a small pearl
        // softbox image. Only the last two can reach a high display intensity.
        color += tint * illumination * tail * 0.24;
        color += mix(tint, neonTint, 0.3) * illumination * shoulder * (0.55 + reflectedCoat * 0.55 * coatStrength);
        vec3 pearlTint = mix(tint, orbitPearl, mix(0.82, ${gl(grazingProfile.pearlWhiteness)}, grazing));
        color += pearlTint * pearl * coatGain * pearlStrength * (pow(reflection, 3.0) * 0.95 + reflectedCoat * 2.15);
        color += orbitPearl * hairline * pow(reflection, 2.0) * coatGain * 1.3;
        color += tint * secondShoulder * illumination * secondaryGain;
        color += neonTint * fresnel * (0.002 + reflectedCoat * 0.045);
        // Quiet coloured contours remain continuous between the longer arcs.
        float borders = filteredLine(u, 0.022, 0.0028) + filteredLine(u, 0.978, 0.0028);
        vec3 edgeLight = neonTint * borders * (0.45 + reflection * 1.1);
        color += edgeLight;
        // Only accents feed the bloom. The broad body no longer creates a fog.
        vec3 glowSource = edgeLight + neonTint * (pearl * pearlStrength * reflectedCoat * coatGain * 2.4
          + hairline * pow(reflection, 2.0) * coatGain * 2.0);
        if (vBand > 3.5) {
          color = neonTint * (0.24 + 0.56 * reflection);
          glowSource = neonTint * pow(reflection, 2.0) * 1.20;
        } else {
          ${arcs}
        }
        // Tranches stay dark; the whole ring is a solid lamella, not a tube.
        color = mix(orbitInk * 1.2 + tint * (0.003 + reflection * 0.008), color, face);
        // Existing visit fade adds a restrained edge emphasis with portrait rims.
        vec3 visitLight = face * borders * neonTint * orbitVisit * 0.18;
        color += visitLight;
        glowSource = glowSource * face + visitLight;
        ${bloom ? `
          // Alpha is reserved for globe/portrait coverage in the HDR source.
          gl_FragColor = vec4(glowSource * orbitIntensity, 0.0);
        ` : `
          vec3 radiance = max(color * orbitIntensity, vec3(0.0));
          float peak = max(radiance.r, max(radiance.g, radiance.b));
          // One shared gain preserves the RGB proportions at neon intensity.
          vec3 displayColor = radiance * ((1.0 - exp(-peak * orbitExposure)) / max(peak, 0.00001));
          gl_FragColor = vec4(displayColor, 1.0);
          #include <colorspace_fragment>
        `}
      }
    `,
  });
  material.name = bloom ? 'Orbit saturated neon glow source' : 'Orbit dark glass with asymmetric neon reflections';
  return material;
}
