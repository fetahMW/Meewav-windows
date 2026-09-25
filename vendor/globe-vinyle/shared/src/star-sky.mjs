import * as T from "three";

// A fixed celestial sphere: camera rotation reveals new stars, translation and
// zoom never drag the sky along with the globe. One static buffer and one draw.
export function createStarSky(pixelRatio) {
  const count = 3600;
  const positions = new Float32Array(count * 3);
  const details = new Float32Array(count * 3);
  let seed = 0x8f71ef;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - y * y);
    positions.set([radius * Math.cos(angle), y, radius * Math.sin(angle)], i * 3);
    const brightness = Math.pow(random(), 3);
    details.set([1 + brightness * 0.85, 0.22 + brightness * 0.46, random()], i * 3);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
  geometry.setAttribute("starDetail", new T.BufferAttribute(details, 3));
  const material = new T.ShaderMaterial({
    uniforms: { pixelRatio: { value: pixelRatio } },
    vertexShader: `
      attribute vec3 starDetail;
      uniform float pixelRatio;
      varying float brightness;
      varying float tint;
      void main() {
        vec3 direction = mat3(viewMatrix) * position;
        gl_Position = projectionMatrix * vec4(direction, 1.0);
        gl_Position.z = gl_Position.w;
        gl_PointSize = starDetail.x * pixelRatio;
        brightness = starDetail.y;
        tint = starDetail.z;
      }
    `,
    fragmentShader: `
      varying float brightness;
      varying float tint;
      void main() {
        float radius = length(gl_PointCoord - 0.5);
        float feather = max(fwidth(radius), 0.08);
        float coverage = 1.0 - smoothstep(0.5 - feather, 0.5, radius);
        if (coverage <= 0.0) discard;
        vec3 ink = mix(vec3(0.64, 0.68, 0.88), vec3(0.91, 0.93, 1.0), tint);
        gl_FragColor = vec4(ink, coverage * brightness);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const stars = new T.Points(geometry, material);
  stars.name = "Fine star sky";
  stars.frustumCulled = false;
  stars.renderOrder = -100;
  stars.matrixAutoUpdate = false;
  return stars;
}
