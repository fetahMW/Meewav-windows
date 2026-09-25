import * as T from '../vendor/globe-vinyle/node_modules/three/build/three.module.js';
import { GLTFExporter } from '../vendor/globe-vinyle/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from '../vendor/globe-vinyle/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { cityLandmarks } from './city-landmark-definitions.mjs';

// Original exterior models: metres, Y up, front +Z. All ornament is geometry;
// no photographic textures or external meshes. Batch by material for drawing.
const palette = [
  ['Violet stone','#A78BFA',.55,.25], ['Lavender carved stone','#C6B1FB',.50,.25],
  ['Violet slate','#57417F',.46,.30], ['Recessed glazing','#180F30',.22,.38],
  ['Violet structural steel','#7053A4',.38,.50], ['Pale violet trim','#D8C5FF',.42,.3],
].map(([name,color,roughness,metalness]) => new T.MeshStandardMaterial({
  name,color,roughness,metalness,emissive:'#21124B',emissiveIntensity:.10,
}));
let batches, frame = new T.Matrix4();
function add(geo,m=0,p=[0,0,0],r=[0,0,0],s=[1,1,1]) {
  const g=geo.index?geo.toNonIndexed():geo.clone(); geo.dispose(); g.deleteAttribute('uv');
  const matrix=new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...r)),new T.Vector3(...s));
  g.applyMatrix4(matrix.premultiply(frame)); batches[m].push(g);
}
function box(x,y,z,w,h,d,m=0){add(new T.BoxGeometry(w,h,d),m,[x,y,z]);}
function cylinder(x,y,z,r,h,m=0,top=r,n=24){add(new T.CylinderGeometry(top,r,h,n),m,[x,y,z]);}
function ball(x,y,z,r,m=5,s=[1,1,1]){add(new T.SphereGeometry(r,12,8),m,[x,y,z],[0,0,0],s);}
function rod(a,b,r=.10,m=1){const A=new T.Vector3(...a),B=new T.Vector3(...b),v=B.clone().sub(A);
  const g=new T.CylinderGeometry(r,r,v.length(),8);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));g.translate(...A.add(B).multiplyScalar(.5).toArray());add(g,m);}
function local(x,y,z,angle,fn){const prev=frame;frame=prev.clone().multiply(new T.Matrix4().makeRotationY(angle).setPosition(x,y,z));fn();frame=prev;}
function torus(x,y,z,r,t=.1,m=1,angles=[0,0,0]){add(new T.TorusGeometry(r,t,6,48),m,[x,y,z],angles);}
function cross(x,y,z,size=2){rod([x,y-size,z],[x,y+size,z],.16,5);rod([x-size*.6,y+.3,z],[x+size*.6,y+.3,z],.16,5);}
function column(x,y,z,h,r=.45){cylinder(x,y+h/2,z,r,h,1,r*.85,16);cylinder(x,y+.2,z,r*1.35,.4,1);cylinder(x,y+h-.15,z,r*1.4,.3,1);box(x,y+h+.1,z,r*2.8,.25,r*2.8,1);}
function statue(x,y,z,h=2){cylinder(x,y+h*.38,z,h*.18,h*.76,5,h*.08,10);ball(x,y+h*.85,z,h*.13);rod([x-h*.25,y+h*.56,z],[x+h*.25,y+h*.6,z],h*.05,5);}
function cornices(w,d,levels,x=0,z=0){for(const y of levels){box(x,y,z,w+.5,.24,d+.5,1);box(x,y+.24,z,w+.8,.18,d+.8,1);}}
function hip(x,y,z,w,d,h,m=2){
  const p=[-w/2,0,-d/2,w/2,0,-d/2,w/2,0,d/2,-w/2,0,d/2,-w/2+Math.min(w*.23,h),h,0,w/2-Math.min(w*.23,h),h,0];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex([0,4,5,0,5,1,1,5,2,2,5,4,2,4,3,3,4,0]);const f=g.toNonIndexed();g.dispose();f.computeVertexNormals();add(f,m,[x,y,z]);
  rod([x-w/2+Math.min(w*.23,h),y+h,z],[x+w/2-Math.min(w*.23,h),y+h,z],.12,1);
}
function pediment(x,y,z,w,h,d=.4){const s=new T.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(0,h);s.closePath();add(new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:false}),0,[x,y,z]);rod([x-w/2,y,z+d],[x,y+h,z+d],.17,1);rod([x,y+h,z+d],[x+w/2,y,z+d],.17,1);box(x,y,z+d,w+.5,.3,.3,1);}
function archPath(w,h){const r=w/2,s=new T.Path();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,h-r);s.absarc(0,h-r,r,0,Math.PI,false);s.lineTo(-r,0);return s;}
function archOpening(x,y,z,w,h,thickness=.45,depth=.4,m=1){
  const outer=archPath(w+2*thickness,h+thickness);const shape=new T.Shape(outer.getPoints(20));shape.holes.push(archPath(w,h));
  add(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16}),m,[x,y,z]);
}
function window(x,y,z,w,h,arched=false){
  if(arched){const p=archPath(w,h);add(new T.ShapeGeometry(new T.Shape(p.getPoints(20))),3,[x,y,z]);archOpening(x,y,z+.02,w,h,.20,.18);}
  else{box(x,y+h/2,z,w,h,.12,3);for(const dx of [-w/2,w/2])box(x+dx,y+h/2,z+.13,.15,h+.2,.25,1);box(x,y+h,z+.12,w+.2,.2,.3,1);box(x,y,z+.2,w+.35,.18,.5,1);}
  box(x,y+h*.5,z+.22,.10,h,.10,1);box(x,y+h*.5,z+.22,w,.10,.10,1);
}
function facade(w,h,d,rows,cols){
  for(const [z,a] of [[d/2+.03,0],[-d/2-.03,Math.PI]])local(0,0,z,a,()=>{
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)window((col-(cols-1)/2)*w/cols,(row+.18)*h/rows,0,Math.min(2.2,w/cols*.5),h/rows*.68,row===0);
    for(let c=0;c<=cols;c++)box((c-cols/2)*w/cols,h/2,.18,.25,h,.3,1);
  });
}
function palace(w=60,d=28,h=18,cols=13){box(0,h/2,0,w,h,d);cornices(w,d,[.3,h/2,h]);facade(w,h,d,2,cols);hip(0,h+.3,0,w+1,d+1,7);
  for(let x=-w/2+4;x<w/2;x+=5){window(x,h+1,d*.37,1.3,2);pediment(x,h+3,d*.37,2,1);box(x,h+5,-d*.25,.8,3,1.2,0);}
}
function clock(x,y,z,r=1.3){add(new T.CircleGeometry(r,40),3,[x,y,z]);torus(x,y,z+.04,r,.10,5);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;rod([x+Math.sin(a)*r*.78,y+Math.cos(a)*r*.78,z+.07],[x+Math.sin(a)*r*.91,y+Math.cos(a)*r*.91,z+.07],.04,5);}rod([x,y,z+.09],[x,y+r*.67,z+.09],.05,5);rod([x,y,z+.1],[x+r*.45,y-r*.18,z+.1],.06,5);}
function dome(x,y,z,r,h){const pts=[new T.Vector2(0,0),new T.Vector2(r,0)];for(let i=0;i<=16;i++){const a=i*Math.PI/32;pts.push(new T.Vector2(r*Math.cos(a),h*Math.sin(a)));}add(new T.LatheGeometry(pts,40),2,[x,y,z]);
  for(let j=0;j<12;j++){const a=j*Math.PI/6;let prev;for(let i=0;i<=16;i++){const b=i*Math.PI/32,p=[x+(r+.05)*Math.cos(b)*Math.cos(a),y+h*Math.sin(b),z+(r+.05)*Math.cos(b)*Math.sin(a)];if(prev)rod(prev,p,.08,1);prev=p;}}
}
function spire(x,y,z,r,h,open=false){
  if(!open)cylinder(x,y+h/2,z,r,h,2,0,8);
  for(let j=0;j<8;j++){const a=j*Math.PI/4;rod([x+r*Math.cos(a),y,z+r*Math.sin(a)],[x,y+h,z],.16,1);}
  for(let k=1;k<8;k++)torus(x,y+h*k/8,z,r*(1-k/8),.10,1,[Math.PI/2,0,0]);cross(x,y+h+1,z,1);
}
function rose(x,y,z,r){add(new T.CircleGeometry(r,48),3,[x,y,z]);torus(x,y,z+.15,r,.22);torus(x,y,z+.2,r*.4,.15);
  for(let j=0;j<16;j++){const a=j*Math.PI/8;rod([x,y,z+.23],[x+r*Math.cos(a),y+r*Math.sin(a),z+.23],.09,1);torus(x+r*.69*Math.cos(a),y+r*.69*Math.sin(a),z+.25,r*.15,.075,1);}}
function belfry(x,z,w,h){box(x,h/2,z,w,h,w);cornices(w,w,[2,h*.44,h*.76,h],x,z);
  for(let side=0;side<4;side++)local(x,0,z,side*Math.PI/2,()=>{for(let k=0;k<3;k++)window((k-1)*w*.25,h*.79,w/2+.04,w*.15,h*.14,true);});
}
function roundTower(x,z,r,h,roof=true,striped=false){cylinder(x,h/2,z,r,h,0);for(let y=2;y<h;y+=striped?2.3:5)cylinder(x,y,z,r+.08,.3,striped?1:0);
  torus(x,h,z,r,.24,1,[Math.PI/2,0,0]);for(let k=0;k<12;k++){const a=k*Math.PI/6;local(x+r*Math.sin(a),0,z+r*Math.cos(a),a,()=>{window(0,h*.48,0,.55,2.3);box(0,h+.4,0,1.4,.8,.75,1);});}if(roof)cylinder(x,h+6,z,r+.6,12,2,.2);}

const models={
  garde(){
    box(0,1.2,0,28,2.4,56,2);box(0,12,-3,16,21,40);cornices(16,40,[4,8,12,16,20,23],0,-3);hip(0,23,-3,18,42,5);
    for(let z=-19;z<=11;z+=6)for(const side of [-1,1])local(side*8.05,0,z,side*Math.PI/2,()=>window(0,10,0,3,8,true));
    for(const z of [-14,0]){cylinder(0,27,z,4,4);dome(0,29,z,4.5,5);cross(0,35,z,1);}
    belfry(0,20,12,40);for(let y=5;y<39;y+=3)box(0,y,20,12.15,.5,12.15,1);
    for(let i=0;i<4;i++)local(0,0,20,i*Math.PI/2,()=>{archOpening(0,31,6.05,5,7,.5,.4);});
    cylinder(0,43,20,3.5,6,1);dome(0,46,20,3.8,4);statue(0,50,20,11);for(let i=0;i<10;i++)box(0,.2+i*.25,30-i*.5,14,.3,.65,1);
  },
  fourviere(){box(0,15,0,24,30,69);hip(0,30,0,25,69,8);cornices(24,69,[2,10,20,30]);
    for(const x of [-13,13])for(const z of [-29,29]){roundTower(x,z,4.6,37,false);spire(x,37,z,5,9);}
    for(let i=-4;i<=4;i++)for(const side of [-1,1])local(side*12.08,0,i*6,side*Math.PI/2,()=>window(0,15,0,3,10,true));
    for(let x=-8;x<=8;x+=4)column(x,3,35.5,10,.55);for(let x=-6;x<=6;x+=6)archOpening(x,3,35.5,5,10,.55,.65);
    rose(0,23,34.7,5);pediment(0,30,34.8,24,8);cross(0,40,35,2);
  },
  capitole(){palace(128,25,18,29);box(0,10,13,29,20,2);for(let i=0;i<8;i++)column((i-3.5)*3.6,2,15,16,.55);
    pediment(0,20,15,32,5);for(const x of [-57,57]){box(x,12,0,14,24,27);hip(x,24,0,15,28,4);facadeWing(x,13.6,12,20,3);}
    for(let x=-10;x<=10;x+=5)statue(x,25-Math.abs(x)*.24,15,1.7);
  },
  nantes(){castle(false);},
  peyrou(){
    // Real open passage, including the curved underside and stone voussoirs.
    for(const x of [-6,6])box(x,6.5,0,6,13,4.7);archOpening(0,0,-2.35,6,10,2,4.7,0);box(0,12.8,0,18,2,4.7);cornices(18,4.7,[.4,10.7,13.8,14.5]);
    for(const side of [-1,1])local(0,0,side*2.4,side<0?Math.PI:0,()=>{for(const x of [-6.6,6.6]){column(x,1,0,9,.43);torus(x,10.8,.2,.95,.12);ball(x,10.8,.12,.75,0,[1,1,.15]);}box(0,12.8,.1,6.5,1,.2,2);});
  },
  strasbourg(){cathedral(true);},
  reims(){cathedral(false);},
  cloche(){
    for(const x of [-8,8])roundTower(x,0,4.2,27,true);
    archOpening(0,0,-2.5,7,9,2.1,5,0);box(0,14,0,9,8,5);clock(0,15,2.6,2.5);
    // Open bell chamber between the medieval towers.
    for(const x of [-4,4])column(x,19,0,8,.55);archOpening(0,19,-1,7,8,.65,2);
    cylinder(0,23,0,1.8,2.5,4,.8);torus(0,21.75,0,1.8,.18,5,[Math.PI/2,0,0]);rod([0,21,0],[0,25,0],.1,4);
    dome(0,27,0,4,5);spire(0,32,0,1.2,5);rod([0,39,0],[2,39,0],.12,5);
  },
  lille(){
    belfry(0,0,15,78);for(let side=0;side<4;side++)local(0,0,0,side*Math.PI/2,()=>{
      for(const x of [-5,-2,2,5]){box(x,38,7.6,.45,67,.5,1);for(let y=9;y<66;y+=6)window(x,y,7.65,1.05,3.7);}
      clock(0,79,8.3,3.3);
    });box(0,79,0,17,7,17,1);cylinder(0,90,0,6,15,0,4,8);for(let k=0;k<8;k++){const a=k*Math.PI/4;rod([5.8*Math.cos(a),84,5.8*Math.sin(a)],[4*Math.cos(a),98,4*Math.sin(a)],.25,1);}dome(0,98,0,4,4);rod([0,102,0],[0,104,0],.12,5);
  },
  parlement(){palace(57,37,20,13);for(const x of [-23,23]){hip(x,20,0,12,38,10);}
    for(const x of [-8,-4,0,4,8])column(x,8,19,11,.40);pediment(0,20,19,21,5);for(const x of [-25,-8,8,25])statue(x,30,0,2);
  },
  opera(){palace(48,65,22,11);for(let i=0;i<10;i++)box(0,i*.24,38-i*.5,33,.3,.7,1);
    for(let x=-16;x<=16;x+=6.4)column(x,3,34,17,.75);box(0,21,34,37,1.5,3,1);pediment(0,22,35,39,7);statue(0,29,35,2.5);
    for(const x of [-21,21]){statue(x,23,33,2.2);box(x,24,0,6,4,45,2);}
  },
  couriot(){
    for(const x of [-5,5])for(const z of [-4,4]){rod([x*1.5,0,z*1.8],[x,31,z],.38,4);box(x*1.5,.4,z*1.8,3,.8,3,1);}
    for(let y=3;y<31;y+=4){for(const z of [-4,4]){rod([-5,y,z],[5,y+4,z],.17,4);rod([5,y,z],[-5,y+4,z],.17,4);rod([-5,y,z],[5,y,z],.23,4);}
      for(const x of [-5,5]){rod([x,y,-4],[x,y+4,4],.17,4);rod([x,y,4],[x,y+4,-4],.17,4);}}
    for(const x of [-5,5])rod([x,30,0],[x,0,-19],.5,4);
    for(const z of [-2.2,2.2]){torus(0,31,z,3,.25,4);for(let i=0;i<12;i++){let a=i*Math.PI/6;rod([0,31,z],[3*Math.cos(a),31+3*Math.sin(a),z],.12,1);}rod([2.8,32,z],[13,0,z-20],.055,4);}
    box(0,27,0,13,.3,11,4);for(const z of [-5.5,5.5]){rod([-6.5,28.2,z],[6.5,28.2,z],.06,1);for(let x=-6;x<=6;x+=1)rod([x,27,z],[x,28.2,z],.05,1);}
    for(let y=0;y<27;y+=.35)rod([5.5,y,3],[6.2,y,3],.045,1);rod([5.5,0,3],[5.5,27,3],.07,1);rod([6.2,0,3],[6.2,27,3],.07,1);
  },
  joseph(){
    box(0,7,0,40,14,40);cornices(40,40,[.5,12,14]);cylinder(0,37,0,10,46,0,8,8);
    for(let side=0;side<8;side++)local(0,0,0,side*Math.PI/4,()=>{
      for(const x of [-2.2,0,2.2]){box(x,60,8.1,.45,79,.6,1);for(let y=21;y<98;y+=2.4)box(x,y,8.2,1.4,1.4,.13,(Math.round(y*10)%3)?3:5);}
      rod([-3.5,17,8],[0,100,6],.26,1);
    });cylinder(0,79,0,8,42,0,6,8);cornices(17,17,[58,61]);cylinder(0,102,0,6,4,1,3,8);cross(0,105,0,2);
    for(let x=-16;x<=16;x+=4)for(const z of [-20.04,20.04])box(x,8,z,1.7,8,.2,3);
  },
  villeurbanne(){
    palace(76,23,19,19);box(0,37,0,12,55,23);for(let y=20;y<56;y+=3)for(const x of [-3,0,3])window(x,y,11.6,1.25,2.1);
    box(0,59,0,15,4,25,1);for(const x of [-5,5])for(const z of [-10,10])column(x,61,z,3,.35);box(0,64,0,15,.5,25,1);
    clock(0,57,12.7,2);for(const x of [-27,-20,-13,13,20,27])column(x,2,13,15,.5);
  },
  philippe(){
    belfry(0,0,9.5,44);for(let side=0;side<4;side++)local(0,0,0,side*Math.PI/2,()=>{for(let y=7;y<36;y+=7)window(0,y,4.8,1.5,3.5);for(let x=-3.5;x<4;x+=1.4)box(x,45,4.6,.8,1.4,.7,1);});
    for(const x of [-4.9,4.9])for(const z of [-4.9,4.9]){cylinder(x,24,z,.75,41,1);spire(x,44.5,z,.8,1.5);}
  },
  angers(){castle(true);},
  perret(){
    // Eight real open uprights, ring beams, cross braces, lookout and lantern.
    cylinder(0,.35,0,7,.7,0,7,8);
    for(let j=0;j<8;j++){let a=j*Math.PI/4,b=(j+1)*Math.PI/4;const p=(r,y,t)=>[r*Math.cos(t),y,r*Math.sin(t)];rod(p(5.4,.7,a),p(3.5,72,a),.30,1);
      for(let y=5;y<59;y+=6){const r=5.4-y/72*1.9,r2=5.4-(y+6)/72*1.9;rod(p(r,y,a),p(r2,y+6,b),.13,0);rod(p(r,y,b),p(r2,y+6,a),.13,0);rod(p(r,y,a),p(r,y,b),.19,1);}}
    for(const y of [58,60,68,71]){cylinder(0,y,0,6,.5,1,6,32);torus(0,y+1.1,0,5.85,.07,4,[Math.PI/2,0,0]);for(let j=0;j<48;j++){let a=j*Math.PI/24;rod([5.85*Math.cos(a),y,5.85*Math.sin(a)],[5.85*Math.cos(a),y+1.1,5.85*Math.sin(a)],.04,4);}}
    for(let j=0;j<8;j++){let a=j*Math.PI/4;rod([3.5*Math.cos(a),71,3.5*Math.sin(a)],[2.3*Math.cos(a),79,2.3*Math.sin(a)],.22,1);}cylinder(0,80,0,3,.8,1);spire(0,80,0,3,5);
  },
  saintdenis(){
    box(0,5.6,0,44,11.2,22);cornices(44,22,[.3,5.4,11.2]);hip(0,11.4,0,46,24,3.5);
    for(const side of [-1,1])local(0,0,side*11.05,side<0?Math.PI:0,()=>{for(let x=-18;x<=18;x+=4.5){window(x,.6,0,2.4,4,true);window(x,6,0,2.4,4,true);column(x-1.65,5.8,.4,4.9,.22);}});
    for(let x=-7;x<=7;x+=3.5)column(x,.4,14,10.5,.42);box(0,11.3,13,19,.5,4,1);pediment(0,11.6,15,20,4);clock(0,13,15.5,1.2);rod([0,15.6,15],[0,18,15],.08,5);
    for(let x=-21;x<=21;x+=1.2){box(x,11.9,11,.6,.9,.5,1);}for(let i=0;i<5;i++)box(0,i*.15,17-i*.4,19,.2,.5,1);
  },
};
function facadeWing(x,z,w,h,n){local(x,0,z,0,()=>{for(let j=0;j<n;j++)for(const y of [2,10,17])window((j-(n-1)/2)*w/n,y,0,2,4);});}
function castle(angers){
  const count=angers?17:7,rx=angers?66:48,rz=angers?49:36,h=angers?25:19,r=angers?8:6;
  const points=Array.from({length:count},(_,i)=>{const a=i/count*Math.PI*2;return [rx*Math.cos(a),rz*Math.sin(a)];});
  for(let i=0;i<count;i++){let [x,z]=points[i],[xx,zz]=points[(i+1)%count],dx=xx-x,dz=zz-z,len=Math.hypot(dx,dz);
    local((x+xx)/2,0,(z+zz)/2,-Math.atan2(dz,dx),()=>{box(0,h*.47,0,len,h*.94,3);for(let y=3;y<h;y+=angers?2.3:6)box(0,y,0,len,.3,3.08,1);
      for(let p=-len/2+1;p<len/2;p+=2.6)box(p,h,0,1.5,1.6,3.3,1);});roundTower(x,z,r,h,!angers,angers);
  }
  // Interior courtyard is open, with the ducal residence to one side.
  local(-12,0,-rz*.43,0,()=>palace(angers?54:56,16,angers?16:21,11));
  if(angers){box(22,8,-12,12,16,29);hip(22,16,-12,13,30,8);for(let z=-23;z<0;z+=5)local(28.1,0,z,Math.PI/2,()=>window(0,6,0,2,8,true));}
  else{roundTower(-7,-22,4,29,true);for(const x of [-18,18])hip(x,22,-15,13,17,10);}
}
function cathedral(strasbourg){
  const length=strasbourg?100:135,w=strasbourg?34:39,naveH=strasbourg?32:37,front=length/2;
  box(0,naveH/2,0,w,naveH,length);box(0,13,0,w+18,26,length-16);hip(0,naveH,0,w+1,length,15);
  box(0,17,-length*.12,w+38,34,20);hip(0,34,-length*.12,w+40,22,8);
  cornices(w,length,[4,naveH-1]);
  for(const side of [-1,1])for(let z=-length/2+12;z<length/2-12;z+=9){
    local(side*(w/2+.1),0,z,side*Math.PI/2,()=>window(0,24,0,3.6,9,true));
    box(side*(w/2+8),12,z,1.5,24,2,1);spire(side*(w/2+8),24,z,1.2,6);
    rod([side*(w/2+8),23,z],[side*w/2,31,z],.4,1);rod([side*(w/2+8),21,z],[side*w/2,27,z],.3,1);
  }
  const towerH=strasbourg?66:78;
  for(const x of [-w*.35,w*.35]){belfry(x,front-5,w*.3,towerH);for(let j=0;j<4;j++)local(x,0,front-5,j*Math.PI/2,()=>{for(const xx of [-2,2])window(xx,45,w*.15+.05,2.8,towerH-48,true);});
    for(const dx of [-w*.15,w*.15])for(const dz of [-w*.15,w*.15])spire(x+dx,towerH,front-5+dz,.7,3);
  }
  box(0,21,front,13,42,1);rose(0,strasbourg?30:32,front+.7,5.6);
  for(const x of [-w*.34,0,w*.34]){archOpening(x,0,front+.8,7,16,.7,1);pediment(x,16,front+1.8,10,7);for(let y=2;y<14;y+=3)for(const dx of [-4.4,4.4])statue(x+dx,y,front+1.7,1.3);}
  for(let x=-w/2;x<=w/2;x+=2){column(x,39,front+.6,4,.15);statue(x,40,front+.8,1.6);}
  if(strasbourg){const x=-w*.35;for(let j=0;j<8;j++){const a=j*Math.PI/4;rod([x+5*Math.cos(a),66,front-5+5*Math.sin(a)],[x+4*Math.cos(a),99,front-5+4*Math.sin(a)],.3,1);}
    for(let y=70;y<100;y+=5)torus(x,y,front-5,4.7,.2,1,[Math.PI/2,0,0]);spire(x,99,front-5,5,41,true);
  } else {cross(0,55,-length*.1,3);}
}

const anchors=JSON.parse(await readFile(new URL('./city-landmark-anchors.json',import.meta.url),'utf8'));
const outputDir=new URL('../vendor/globe-vinyle/assets/models/hero-landmarks/',import.meta.url);
await mkdir(outputDir,{recursive:true});
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}
function contains(p,geometry){const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polys.some(poly=>inRing(p,poly[0])&&!poly.slice(1).some(hole=>inRing(p,hole)));}
const catalogue=[];
for(const definition of cityLandmarks){
  const item={...definition,...(anchors[definition.id]||{})};
  const data=JSON.parse(await readFile(new URL(`../vendor/globe-vinyle/data/quarters/${item.cityCode}.geojson`,import.meta.url),'utf8'));
  const quarter=data.features.find(f=>contains([item.lon,item.lat],f.geometry));
  // Keep a geographic name only when the coordinate is inside its polygon.
  item.quartierId=quarter?.id||quarter?.properties.id||null;
  item.quartier=quarter?.properties.name||item.city;
  item.searchHeight=Math.max(.005,item.heightMetres*.00009,item.footprintMetres*.00007);
  batches=palette.map(()=>[]);frame.identity();models[item.id]();
  const root=new T.Group();root.name=`${item.name} · ${item.city}`;
  root.userData={authorship:'MeeWav original procedural architectural interpretation',units:'metres',source:item.source};
  for(let i=0;i<batches.length;i++){if(!batches[i].length)continue;
    const merged=mergeGeometries(batches[i],false),geo=mergeVertices(merged,.00001);merged.dispose();
    const mesh=new T.Mesh(geo,palette[i]);mesh.name=palette[i].name;root.add(mesh);for(const part of batches[i])part.dispose();
  }
  // Authoring envelopes vary; normalize uniformly, preserving every proportion.
  const bounds=new T.Box3().setFromObject(root),scale=item.heightMetres/(bounds.max.y-bounds.min.y);
  for(const mesh of root.children){mesh.geometry.translate(0,-bounds.min.y,0);mesh.geometry.scale(scale,scale,scale);}
  const binary=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});
  await writeFile(new URL(item.asset,outputDir),new Uint8Array(binary));
  console.log(`Generated ${item.city}: ${item.asset}`);
  catalogue.push(item);for(const mesh of root.children)mesh.geometry.dispose();
}
await writeFile(new URL('../vendor/globe-vinyle/shared/src/city-landmarks.json',import.meta.url),JSON.stringify(catalogue,null,2)+'\n');
for(const material of palette)material.dispose();
