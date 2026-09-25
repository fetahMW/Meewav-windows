import fs from "node:fs";
import sharp from "sharp";

const input = "public/models/hidden-rewards/boite_cadeau_MW_optimisee.glb";
const output = "artifacts/hidden-gift-glb-preview.png";
const glb = fs.readFileSync(input);
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(
  glb.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/, ""),
);
const binaryHeader = 20 + jsonLength;
const binaryLength = glb.readUInt32LE(binaryHeader);
const binary = glb.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength);
const primitive = json.meshes[0].primitives[0];
const indexAccessor = json.accessors[primitive.indices];
const positionAccessor = json.accessors[primitive.attributes.POSITION];
const colorAccessor = json.accessors[primitive.attributes.COLOR_0];
const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const componentSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);

function readComponent(offset, componentType) {
  if (componentType === 5120) return dataView.getInt8(offset);
  if (componentType === 5121) return dataView.getUint8(offset);
  if (componentType === 5122) return dataView.getInt16(offset, true);
  if (componentType === 5123) return dataView.getUint16(offset, true);
  if (componentType === 5125) return dataView.getUint32(offset, true);
  if (componentType === 5126) return dataView.getFloat32(offset, true);
  throw new Error(`Unsupported GLB component type: ${componentType}`);
}

function readAccessor(accessor) {
  const view = json.bufferViews[accessor.bufferView];
  const components = componentCounts[accessor.type];
  const componentSize = componentSizes[accessor.componentType];
  const stride = view.byteStride ?? components * componentSize;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = new Array(accessor.count * components);
  for (let index = 0; index < accessor.count; index += 1) {
    for (let component = 0; component < components; component += 1) {
      values[index * components + component] = readComponent(
        start + index * stride + component * componentSize,
        accessor.componentType,
      );
    }
  }
  return values;
}

const indices = readAccessor(indexAccessor);
const positions = readAccessor(positionAccessor);
const colors = readAccessor(colorAccessor);
const colorComponents = componentCounts[colorAccessor.type];
const colorScale = colorAccessor.componentType === 5126 ? 255 : 1;

const width = 1200;
const height = 900;
const centerX = width / 2;
const centerY = 445;
const boundsMin = positionAccessor.min;
const boundsMax = positionAccessor.max;
const modelCenter = boundsMin.map((value, index) => (value + boundsMax[index]) / 2);
const modelSize = boundsMin.map((value, index) => boundsMax[index] - value);
const scale = Math.min(680 / modelSize[0], 540 / modelSize[1], 680 / modelSize[2]);
const yaw = -32 * Math.PI / 180;
const pitch = 27 * Math.PI / 180;
const cosYaw = Math.cos(yaw);
const sinYaw = Math.sin(yaw);
const cosPitch = Math.cos(pitch);
const sinPitch = Math.sin(pitch);

function transform(index) {
  const x = positions[index * 3] - modelCenter[0];
  const y = positions[index * 3 + 1] - modelCenter[1];
  const z = positions[index * 3 + 2] - modelCenter[2];
  const rotatedX = x * cosYaw + z * sinYaw;
  const rotatedZ = -x * sinYaw + z * cosYaw;
  const rotatedY = y * cosPitch - rotatedZ * sinPitch;
  const depth = y * sinPitch + rotatedZ * cosPitch;
  return {
    x: centerX + rotatedX * scale,
    y: centerY - rotatedY * scale,
    z: depth,
  };
}

function normal(a, b, c) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

const vertices = Array.from({ length: positionAccessor.count }, (_, index) => transform(index));
const triangles = [];
for (let offset = 0; offset < indices.length; offset += 3) {
  const indexA = indices[offset];
  const indexB = indices[offset + 1];
  const indexC = indices[offset + 2];
  const a = vertices[indexA];
  const b = vertices[indexB];
  const c = vertices[indexC];
  const [normalX, normalY, normalZ] = normal(a, b, c);
  const red = (colors[indexA * colorComponents] + colors[indexB * colorComponents] + colors[indexC * colorComponents]) / 3 * colorScale;
  const green = (colors[indexA * colorComponents + 1] + colors[indexB * colorComponents + 1] + colors[indexC * colorComponents + 1]) / 3 * colorScale;
  const blue = (colors[indexA * colorComponents + 2] + colors[indexB * colorComponents + 2] + colors[indexC * colorComponents + 2]) / 3 * colorScale;
  const light = Math.max(
    0.48,
    Math.min(
      1.18,
      0.68
        + 0.30 * Math.abs(normalZ)
        + 0.18 * Math.max(0, -normalX)
        + 0.12 * Math.max(0, -normalY),
    ),
  );
  const renderedRed = Math.min(255, Math.round(red * light + 12));
  const renderedGreen = Math.min(255, Math.round(green * light + 7));
  const renderedBlue = Math.min(255, Math.round(blue * light + 20));
  triangles.push({
    a,
    b,
    c,
    depth: (a.z + b.z + c.z) / 3,
    color: `rgb(${renderedRed},${renderedGreen},${renderedBlue})`,
    edge: `rgba(${Math.min(255, renderedRed + 25)},${Math.min(255, renderedGreen + 18)},${Math.min(255, renderedBlue + 30)},.18)`,
  });
}

triangles.sort((first, second) => first.depth - second.depth);
const polygons = triangles.map((triangle) => (
  `<polygon points="${triangle.a.x.toFixed(2)},${triangle.a.y.toFixed(2)} ${triangle.b.x.toFixed(2)},${triangle.b.y.toFixed(2)} ${triangle.c.x.toFixed(2)},${triangle.c.y.toFixed(2)}" fill="${triangle.color}" stroke="${triangle.edge}" stroke-width=".7"/>`
)).join("");

const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%"><stop offset="0" stop-color="#251246"/><stop offset=".46" stop-color="#0d0820"/><stop offset="1" stop-color="#05030c"/></radialGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#a45bff" stop-opacity=".28"/><stop offset="1" stop-color="#a45bff" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="shadow"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect width="1200" height="900" fill="url(#bg)"/>
  <circle cx="600" cy="435" r="330" fill="url(#glow)" filter="url(#blur)"/>
  <ellipse cx="600" cy="700" rx="310" ry="70" fill="#000" opacity=".58" filter="url(#shadow)"/>
  <g>${polygons}</g>
  <text x="600" y="808" text-anchor="middle" fill="#d7c9ed" font-family="Arial, sans-serif" font-size="22" letter-spacing="5">MODÈLE GLB · RENDU RÉEL</text>
  <text x="600" y="844" text-anchor="middle" fill="#827799" font-family="Arial, sans-serif" font-size="15" letter-spacing="2">boite_cadeau_MW_optimisee.glb</text>
</svg>`;

fs.mkdirSync("artifacts", { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(output);
console.log(output);
