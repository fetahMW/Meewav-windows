import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

const OUTPUT_PATH = "public/models/hidden-rewards/boite_cadeau_MW_optimisee.glb";

// The treasure is intentionally dark and violet: it must feel rewarding at
// close range without becoming a cyan beacon when seen from another valley.
const PALETTE = {
  body: new THREE.Color("#0b0918"),
  bodyLift: new THREE.Color("#15102b"),
  lid: new THREE.Color("#21183d"),
  lidEdge: new THREE.Color("#352456"),
  ribbon: new THREE.Color("#5b21b6"),
  ribbonLift: new THREE.Color("#7c3aed"),
  ribbonHighlight: new THREE.Color("#a78bfa"),
  vinyl: new THREE.Color("#07050e"),
  vinylGroove: new THREE.Color("#31204f"),
  lavender: new THREE.Color("#c4b5fd"),
  waveformLow: new THREE.Color("#6d28d9"),
  waveformHigh: new THREE.Color("#c084fc"),
};

const parts = [];

function asColoredPart(geometry, color, transform = {}) {
  const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  part.deleteAttribute("uv");
  part.applyMatrix4(new THREE.Matrix4().compose(
    transform.position ?? new THREE.Vector3(),
    transform.quaternion ?? new THREE.Quaternion(),
    transform.scale ?? new THREE.Vector3(1, 1, 1),
  ));

  const position = part.getAttribute("position");
  const colors = new Uint8Array(position.count * 3);
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  for (let index = 0; index < position.count; index += 1) {
    colors[index * 3] = red;
    colors[index * 3 + 1] = green;
    colors[index * 3 + 2] = blue;
  }
  part.setAttribute("color", new THREE.Uint8BufferAttribute(colors, 3, true));
  parts.push(part);
}

function roundedBox(width, height, depth, radius, color, position, rotationY = 0) {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
  asColoredPart(
    new RoundedBoxGeometry(width, height, depth, 2, radius),
    color,
    { position, quaternion },
  );
}

function plainBox(width, height, depth, color, position, rotationY = 0) {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
  asColoredPart(
    new THREE.BoxGeometry(width, height, depth),
    color,
    { position, quaternion },
  );
}

function cylinder(radius, height, color, position, quaternion = new THREE.Quaternion(), segments = 20) {
  asColoredPart(
    new THREE.CylinderGeometry(radius, radius, height, segments, 1, false),
    color,
    { position, quaternion },
  );
}

function torus(radius, tube, color, position, quaternion, arc = Math.PI * 2) {
  asColoredPart(
    new THREE.TorusGeometry(radius, tube, 6, 24, arc),
    color,
    { position, quaternion },
  );
}

function tube(points, radius, color, closed = true) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal", 0.46);
  asColoredPart(new THREE.TubeGeometry(curve, 28, radius, 6, closed), color);
}

// Gift body: compact, rounded, layered like a premium hardware case.
roundedBox(0.34, 0.128, 0.25, 0.019, PALETTE.body, new THREE.Vector3(0, 0.064, 0));
roundedBox(0.326, 0.095, 0.238, 0.017, PALETTE.bodyLift, new THREE.Vector3(0, 0.078, 0));
roundedBox(0.372, 0.044, 0.278, 0.014, PALETTE.lidEdge, new THREE.Vector3(0, 0.141, 0));
roundedBox(0.358, 0.038, 0.266, 0.012, PALETTE.lid, new THREE.Vector3(0, 0.158, 0));

// Satin ribbon. Both the broad band and its narrow highlight stay violet.
roundedBox(0.365, 0.012, 0.054, 0.006, PALETTE.ribbon, new THREE.Vector3(0, 0.182, 0));
roundedBox(0.055, 0.013, 0.273, 0.006, PALETTE.ribbon, new THREE.Vector3(0, 0.183, 0));
roundedBox(0.352, 0.004, 0.012, 0.003, PALETTE.ribbonLift, new THREE.Vector3(0, 0.191, -0.004));
roundedBox(0.012, 0.004, 0.262, 0.003, PALETTE.ribbonLift, new THREE.Vector3(0, 0.192, -0.004));

// Continue the ribbon down the four faces so it reads as an actual wrapped box.
plainBox(0.057, 0.12, 0.012, PALETTE.ribbon, new THREE.Vector3(0, 0.075, 0.126));
plainBox(0.057, 0.12, 0.012, PALETTE.ribbon, new THREE.Vector3(0, 0.075, -0.126));
plainBox(0.012, 0.12, 0.057, PALETTE.ribbon, new THREE.Vector3(0.171, 0.075, 0));
plainBox(0.012, 0.12, 0.057, PALETTE.ribbon, new THREE.Vector3(-0.171, 0.075, 0));

// Vinyl record embedded into the lid: the musical clue only reveals itself up close.
const horizontalDisc = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
cylinder(0.084, 0.008, PALETTE.vinyl, new THREE.Vector3(0, 0.191, 0), undefined, 36);
torus(0.064, 0.0022, PALETTE.vinylGroove, new THREE.Vector3(0, 0.196, 0), horizontalDisc);
torus(0.046, 0.0018, PALETTE.vinylGroove, new THREE.Vector3(0, 0.1965, 0), horizontalDisc);
cylinder(0.021, 0.009, PALETTE.ribbonLift, new THREE.Vector3(0, 0.196, 0), undefined, 24);
cylinder(0.006, 0.011, PALETTE.lavender, new THREE.Vector3(0, 0.199, 0), undefined, 16);

// Soft sculpted bow instead of the previous angular zig-zag.
tube([
  new THREE.Vector3(-0.012, 0.225, 0),
  new THREE.Vector3(-0.052, 0.246, 0.031),
  new THREE.Vector3(-0.116, 0.241, 0.049),
  new THREE.Vector3(-0.147, 0.221, 0.011),
  new THREE.Vector3(-0.116, 0.209, -0.038),
  new THREE.Vector3(-0.047, 0.213, -0.028),
], 0.012, PALETTE.ribbonLift);
tube([
  new THREE.Vector3(0.012, 0.225, 0),
  new THREE.Vector3(0.052, 0.247, 0.028),
  new THREE.Vector3(0.118, 0.24, 0.046),
  new THREE.Vector3(0.147, 0.219, 0.008),
  new THREE.Vector3(0.113, 0.208, -0.04),
  new THREE.Vector3(0.047, 0.213, -0.028),
], 0.012, PALETTE.ribbonLift);
asColoredPart(
  new THREE.SphereGeometry(0.034, 20, 12),
  PALETTE.ribbonHighlight,
  { position: new THREE.Vector3(0, 0.226, 0.005), scale: new THREE.Vector3(1.08, 0.82, 0.9) },
);
roundedBox(0.038, 0.009, 0.128, 0.004, PALETTE.ribbonLift, new THREE.Vector3(-0.04, 0.199, 0.064), 0.48);
roundedBox(0.038, 0.009, 0.128, 0.004, PALETTE.ribbonLift, new THREE.Vector3(0.04, 0.199, 0.064), -0.48);
roundedBox(0.019, 0.004, 0.095, 0.002, PALETTE.ribbonHighlight, new THREE.Vector3(-0.04, 0.205, 0.064), 0.48);
roundedBox(0.019, 0.004, 0.095, 0.002, PALETTE.ribbonHighlight, new THREE.Vector3(0.04, 0.205, 0.064), -0.48);

// A restrained equalizer on the front face makes the object unmistakably musical.
const frontFacing = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const waveHeights = [0.027, 0.044, 0.065, 0.087, 0.058, 0.038, 0.072, 0.048, 0.029];
waveHeights.forEach((height, index) => {
  const mix = index / (waveHeights.length - 1);
  const color = PALETTE.waveformLow.clone().lerp(PALETTE.waveformHigh, mix);
  plainBox(
    0.012,
    height,
    0.009,
    color,
    new THREE.Vector3(-0.122 + index * 0.0305, 0.064, 0.1295),
  );
});

// Two tiny record studs anchor the waveform without adding a bright long-range beacon.
cylinder(0.025, 0.009, PALETTE.vinyl, new THREE.Vector3(-0.144, 0.067, 0.132), frontFacing, 24);
cylinder(0.009, 0.011, PALETTE.ribbonHighlight, new THREE.Vector3(-0.144, 0.067, 0.137), frontFacing, 18);
cylinder(0.025, 0.009, PALETTE.vinyl, new THREE.Vector3(0.144, 0.067, 0.132), frontFacing, 24);
cylinder(0.009, 0.011, PALETTE.ribbonHighlight, new THREE.Vector3(0.144, 0.067, 0.137), frontFacing, 18);

let geometry = mergeGeometries(parts, false);
if (!geometry) throw new Error("Unable to merge hidden gift geometry.");
geometry = mergeVertices(geometry, 1e-5);
geometry.computeBoundingBox();
geometry.computeBoundingSphere();

const material = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.46,
  metalness: 0.16,
});
const mesh = new THREE.Mesh(geometry, material);
mesh.name = "Meewav_Music_Treasure";

const scene = new THREE.Scene();
scene.name = "Meewav_Hidden_Music_Gift";
scene.add(mesh);

// GLTFExporter uses FileReader in browsers. This lightweight Node bridge keeps
// the generator dependency-free and deterministic.
globalThis.FileReader ??= class FileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
};

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
  trs: false,
});

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, Buffer.from(arrayBuffer));
console.log(`${OUTPUT_PATH} (${Buffer.byteLength(arrayBuffer)} bytes)`);
