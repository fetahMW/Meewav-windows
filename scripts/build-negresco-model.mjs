import * as T from '../vendor/globe-vinyle/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../vendor/globe-vinyle/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from '../vendor/globe-vinyle/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { mkdir, writeFile } from 'node:fs/promises';

// Authored architectural interpretation, in metres, Y up, sea-facing side +Z.
// Reference: the Negresco's official architecture photographs and Nice tourism.
// No downloaded model, photographic texture or third-party mesh is embedded.
const materials = [
  ['Violet stone', '#9B7DE0', .55, .25],
  ['Carved lavender cornices', '#C6B1FB', .50, .25],
  ['Violet dome and mansard', '#8553B4', .43, .30],
  ['Recessed violet glazing', '#170F35', .20, .40],
  ['Open wrought iron', '#45316B', .36, .50],
  ['Pale violet metal details', '#DDD0FF', .42, .35],
].map(([name, color, roughness, metalness]) => new T.MeshStandardMaterial({
  name, color, roughness, metalness, emissive: '#21124B', emissiveIntensity: .10,
}));
const batches = materials.map(() => []);
let frame = new T.Matrix4();
const transform = new T.Matrix4(), rotation = new T.Quaternion();
function add(geometry, material, position = [0, 0, 0], angles = [0, 0, 0], scale = [1, 1, 1]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geometry.dispose();
  g.deleteAttribute('uv');
  rotation.setFromEuler(new T.Euler(...angles));
  transform.compose(new T.Vector3(...position), rotation, new T.Vector3(...scale));
  g.applyMatrix4(transform.premultiply(frame));
  batches[material].push(g);
}
function box(x, y, z, w, h, d, material = 1, angles) {
  add(new T.BoxGeometry(w, h, d), material, [x, y, z], angles);
}
function tube(points, radius = .055, material = 4, segments = 12) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  add(new T.TubeGeometry(curve, segments, radius, 5, false), material);
}
function rod(a, b, radius = .045, material = 4) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), delta = B.clone().sub(A);
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize());
  const g = new T.CylinderGeometry(radius, radius, delta.length(), 6);
  g.applyQuaternion(q); g.translate(...A.add(B).multiplyScalar(.5).toArray()); add(g, material);
}
function arc(cx, cy, cz, r, start, end, radius = .065, material = 1) {
  const points = Array.from({length: 17}, (_, i) => {
    const a = start + (end - start) * i / 16;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), cz];
  });
  tube(points, radius, material, 24);
}
function withFrame(x, y, z, angle, fn) {
  const previous = frame;
  frame = new T.Matrix4().makeRotationY(angle).setPosition(x, y, z);
  fn(); frame = previous;
}
function footprint(inset = 0) {
  const w = 31 - inset, d = 21 - inset, r = 10 - inset;
  const s = new T.Shape();
  s.moveTo(-w, -d); s.lineTo(21, -d);
  s.absarc(21, -11, r, -Math.PI / 2, 0, false);
  s.lineTo(w, d); s.lineTo(-w, d); s.closePath();
  return s;
}
function course(y, h, inset, material) {
  add(new T.ExtrudeGeometry(footprint(inset), { depth: h, steps: 1, bevelEnabled: true,
    bevelThickness: .07, bevelSize: .09, bevelSegments: 2, curveSegments: 16 }), material,
  [0, y, 0], [-Math.PI / 2, 0, 0]);
}
function hipRoof(x, z, w, d, y, h) {
  const p = [-w/2,y,-d/2, w/2,y,-d/2, w/2,y,d/2, -w/2,y,d/2,
    -w/2+2.2,y+h,-d/2+2.2, w/2-2.2,y+h,-d/2+2.2,
    w/2-2.2,y+h,d/2-2.2, -w/2+2.2,y+h,d/2-2.2];
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);
  const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();
  add(flat, 2, [x, 0, z]);
}

// Continuous rounded southeast corner, storey courses and stone plinth.
course(.15, 27.6, .15, 0);
course(0, .32, -.3, 4);
for (const [y,h,inset] of [[.4,.55,-.12],[5.7,.3,-.15],[10.4,.2,-.06],
  [15,.2,-.06],[19.6,.25,-.12],[24.2,.4,-.2],[27.7,.40,-.38],[28.12,.22,-.6]]) course(y,h,inset,1);
hipRoof(-7, 12.6, 48, 16.8, 28.3, 4.8);
hipRoof(-23, -8, 16, 25, 28.3, 4.8);
hipRoof(3, -13, 55, 16, 28.3, 4.8);
hipRoof(24, -6, 14, 21, 28.3, 4.8);

function balcony(width, y) {
  box(0,y, .38,width,.18,1.0,1);
  box(0,y+.92,.88,width,.09,.09,4);
  box(0,y+.12,.88,width,.055,.055,4);
  for (const x of [-width/2,width/2]) {
    box(x,y+.49,.87,.065,.96,.065,4);
    box(x,y+.92,.43,.08,.08,.95,4);
  }
  for (let x=-width/2+.22; x<width/2; x+=.26) box(x,y+.49,.89,.035,.79,.04,4);
  for (const x of [-.72,0,.72]) {
    add(new T.TorusGeometry(.20,.025,4,12),4,[x,y+.54,.94]);
  }
}
function windowBay(arched = false, rail = false, ornament = false, w = 1.85, h = 2.6) {
  const s = new T.Shape();
  s.moveTo(-w/2,-h/2); s.lineTo(w/2,-h/2); s.lineTo(w/2,h/2-(arched?w/2:0));
  if (arched) s.absarc(0,h/2-w/2,w/2,0,Math.PI,false);
  else s.lineTo(-w/2,h/2);
  s.closePath();
  add(new T.ExtrudeGeometry(s,{depth:.07,bevelEnabled:false,curveSegments:10}),3,[0,0,.02]);
  for (const x of [-w/2-.11,w/2+.11]) box(x,-.03,.10,.20,h+.28,.19,1);
  box(0,-h/2-.12,.16,w+.46,.23,.30,1);
  if (arched) arc(0,h/2-w/2,.15,w/2+.06,0,Math.PI,.13,1);
  else box(0,h/2+.12,.14,w+.5,.22,.24,1);
  box(0,0,.12,.065,h,.065,4); box(0,.25,.12,w,.065,.065,4);
  if (ornament) {
    box(0,h/2+.38,.19,.32,.34,.25,1,[0,0,Math.PI/4]);
    rod([-w*.62,h/2+.38,.18],[0,h/2+.82,.18],.11,1);
    rod([0,h/2+.82,.18],[w*.62,h/2+.38,.18],.11,1);
  }
  if (rail) balcony(w+.9,-h/2-.24);
}
const floors=[3.15,8.05,12.65,17.25,21.85,26.0];
for(let floor=0; floor<floors.length; floor++) {
  const y=floors[floor], rail=floor===1||floor===3||floor===5;
  for(let x=-27; x<=18; x+=4.5) withFrame(x,y,21.02,0,()=>windowBay(floor===0,rail,floor===1||floor===4,1.95,floor===0?3.8:2.5));
  for(let z=-17.5;z<=7;z+=4.8) withFrame(31.02,y,z,Math.PI/2,()=>windowBay(floor===0,rail,floor===1));
  for(let z=-17.5;z<=18;z+=4.5) withFrame(-31.02,y,z,-Math.PI/2,()=>windowBay(floor===0,rail,false));
  for(let x=-27;x<=27;x+=4.5) withFrame(x,y,-21.02,Math.PI,()=>windowBay(false,floor===3,false));
  for(let i=0;i<4;i++) {
    const a=(i+.5)/4*Math.PI/2;
    withFrame(21+10.08*Math.sin(a),y,11+10.08*Math.cos(a),a,()=>windowBay(floor===0,rail,true,1.75,floor===0?3.7:2.5));
  }
}

// Corner pilasters, capitals, rounded cornice and the recognisable dome.
for(let i=0;i<=4;i++) {
  const a=i/4*Math.PI/2;
  withFrame(21+10.12*Math.sin(a),16.2,11+10.12*Math.cos(a),a,()=>{
    box(0,0,.04,.42,20.9,.22,1); box(0,10.1,.12,.86,.35,.5,1);
    for(const x of [-.34,.34]) add(new T.TorusGeometry(.2,.07,5,12),1,[x,10.25,.33]);
  });
}
for(const [y,r,h,mat] of [[28.4,10.55,.38,1],[28.9,10.0,1.85,0],[30.8,10.45,.3,1]])
  add(new T.CylinderGeometry(r,r,h,64),mat,[21,y+h/2,11]);
const domePoints=[new T.Vector2(0,31),new T.Vector2(9.8,31)];
for(let i=1;i<=28;i++) {
  const t=i/28*Math.PI/2;
  domePoints.push(new T.Vector2(9.8*Math.cos(t),31+8.3*Math.sin(t)));
}
add(new T.LatheGeometry(domePoints,96),2,[21,0,11]);
for(let i=0;i<32;i++) {
  const a=i/32*Math.PI*2;
  const points=Array.from({length:20},(_,j)=>{
    const t=j/19*1.49,r=9.86*Math.cos(t);
    return [21+r*Math.sin(a),31+8.35*Math.sin(t),11+r*Math.cos(a)];
  });
  tube(points,.042,4,24);
}
for(let j=1;j<13;j++) {
  const a=j/14*Math.PI/2,r=9.84*Math.cos(a);
  add(new T.TorusGeometry(r,.022,4,96),4,[21,31+8.34*Math.sin(a),11],[Math.PI/2,0,0]);
}
add(new T.CylinderGeometry(.9,1.3,.55,24),1,[21,39.25,11]);
add(new T.CylinderGeometry(.66,.85,1.45,20),4,[21,40.2,11]);
add(new T.SphereGeometry(.88,20,12),2,[21,40.9,11],[0,0,0],[1,.65,1]);
rod([21,41.35,11],[21,44.8,11],.046,5);
// A small sculpted violet pennant, geometry only.
const flag=new T.BufferGeometry();
flag.setAttribute('position',new T.Float32BufferAttribute([21,44.6,11,22.7,44.35,11.12,22.7,43.6,10.9,21,43.8,11],3));
flag.setIndex([0,1,2,0,2,3,2,1,0,3,2,0]); flag.computeVertexNormals(); add(flag,5);

// Dormers, dentils and urns articulate the roofline at neighbourhood scale.
for(const x of [-26,-21.5,-17,-12.5,-8,-3.5,1,5.5,10,14.5]) {
  withFrame(x,30.6,19.7,0,()=>{
    box(0,0,0,2.1,2.6,1.0,0); windowBay(true,false,false,1.1,1.7);
    arc(0,.38,.58,.85,0,Math.PI,.13,1);
  });
}
for(let x=-29;x<20;x+=.9) box(x,27.48,21.38,.3,.45,.42,1);
for(let z=-20;z<10;z+=.9) box(31.38,27.48,z,.42,.45,.3,1);
function urn(x,z) {
  box(x,29,z,.9,.5,.9,1);
  add(new T.LatheGeometry([[0,0],[.35,0],[.26,.2],[.22,.45],[.5,.75],[.55,1.05],[.35,1.3],[.25,1.45],[0,1.45]].map(p=>new T.Vector2(...p)),16),1,[x,29.25,z]);
  add(new T.SphereGeometry(.24,10,8),5,[x,30.93,z],[0,0,0],[.65,1.5,.65]);
}
for(const x of [-15.3,-5.7]) for(const z of [20.2,16.5]) urn(x,z);
withFrame(-10.5,29.05,21.5,0,()=>{
  box(0,0,0,11,.4,1.2,1);
  rod([-5.5,.15,.65],[0,2.4,.65],.2,1); rod([0,2.4,.65],[5.5,.15,.65],.2,1);
  add(new T.CylinderGeometry(.73,.73,.18,24),3,[0,.9,.2],[Math.PI/2,0,0]);
  add(new T.TorusGeometry(.8,.12,6,24),1,[0,.9,.35]);
});

// Openwork quarter-circle entrance canopy under the rounded corner.
add(new T.RingGeometry(10.15,13.2,32,1,-Math.PI/2,Math.PI/2),3,[21,4.9,11],[-Math.PI/2,0,0]);
for(let i=0;i<=8;i++) {
  const a=i/8*Math.PI/2;
  rod([21+10*Math.sin(a),4.9,11+10*Math.cos(a)],[21+13.2*Math.sin(a),4.9,11+13.2*Math.cos(a)],.065,5);
}
tube(Array.from({length:25},(_,i)=>{const a=i/24*Math.PI/2;return [21+13.2*Math.sin(a),4.9,11+13.2*Math.cos(a)];}),.10,5,32);

// Small raised lettering on the drum; editable vector strokes, not a texture.
const glyphs={L:[[[0,1],[0,0],[.65,0]]],E:[[[.65,1],[0,1],[0,0],[.65,0]],[[0,.5],[.5,.5]]],
 N:[[[0,0],[0,1],[.65,0],[.65,1]]],G:[[[.65,.85],[.5,1],[.1,1],[0,.8],[0,.2],[.1,0],[.65,0],[.65,.5],[.35,.5]]],
 R:[[[0,0],[0,1],[.5,1],[.65,.8],[.65,.65],[.5,.5],[0,.5]],[[.35,.5],[.7,0]]],
 S:[[[.65,.85],[.5,1],[.1,1],[0,.75],[.15,.55],[.5,.45],[.65,.25],[.5,0],[.1,0],[0,.15]]],
 C:[[[.65,.85],[.5,1],[.1,1],[0,.8],[0,.2],[.1,0],[.5,0],[.65,.15]]],
 O:[[[.1,0],[0,.2],[0,.8],[.1,1],[.5,1],[.65,.8],[.65,.2],[.5,0],[.1,0]]]};
const sign='LE NEGRESCO';
for(let i=0;i<sign.length;i++) {
  const a=Math.PI/4+(i-(sign.length-1)/2)*.091;
  withFrame(21+10.08*Math.sin(a),29.5,11+10.08*Math.cos(a),a,()=>{
    for(const path of glyphs[sign[i]]||[]) for(let j=1;j<path.length;j++)
      rod([path[j-1][0]-.325,path[j-1][1],.02],[path[j][0]-.325,path[j][1],.02],.043,5);
  });
}

const root=new T.Group(); root.name='Le Negresco — Nice — violet architectural landmark';
root.userData={author:'MeeWav project — procedural architectural interpretation',units:'metres',
  source:'https://www.lenegresco.com/architecture-et-facade',geographicAnchor:[7.25802,43.6943]};
for(let i=0;i<batches.length;i++) {
  const merged=mergeGeometries(batches[i],false);
  const geometry=mergeVertices(merged,0.00001); merged.dispose();
  const mesh=new T.Mesh(geometry,materials[i]); mesh.name=materials[i].name; root.add(mesh);
  for(const part of batches[i]) part.dispose();
}
// GLTFExporter uses FileReader for its binary Blob even with no images.
globalThis.FileReader=class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();}); }
};
const binary=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});
const output=new URL('../vendor/globe-vinyle/assets/models/hero-landmarks/le_negresco_violet_light.glb',import.meta.url);
await mkdir(new URL('.',output),{recursive:true});
await writeFile(output,new Uint8Array(binary));
console.log(`Created ${output.pathname} (${binary.byteLength} bytes)`);
for(const child of root.children) child.geometry.dispose();
for(const material of materials) material.dispose();
