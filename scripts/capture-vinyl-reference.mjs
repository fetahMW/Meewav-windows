import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const folder = new URL('../artifacts/vinyl-reference/', import.meta.url);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({headless:true, args:['--enable-webgl','--use-angle=gl','--ignore-gpu-blocklist']});
const reference2 = process.argv.includes('--reference-2');
const page = await browser.newPage({viewport:reference2?{width:1633,height:757}:{width:1774,height:887},deviceScaleFactor:1});
// Expose the camera only inside this isolated capture browser, never in the
// shipped app. An off-axis crop reproduces the supplied close-up without
// changing the user's globe framing or distorting the image afterwards.
await page.route('**/*three-engine*', async route => {
  const response = await route.fetch();
  const source = await response.text();
  await route.fulfill({response,body:source.replace(/(const camera = new T.PerspectiveCamera\([^;]+;)/, '$1 window.__vinylCaptureCamera = camera; window.__vinylCaptureScene = scene; window.__vinylCaptureThree = T;')});
});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5194/globe-vinyle/index.html');
await page.waitForFunction(()=>window.__meewavEngine && document.querySelector('.map-mode-switch'),null,{timeout:60000});
await page.evaluate(async()=>{await window.__meewavEngine.firstFrame;});
await page.evaluate(({overview,reference2})=>{
  const engine=window.__meewavEngine, snapshot=engine.getPreviewSnapshot();
  if (!overview) {
    snapshot.view={...snapshot.view,height:216.11379673074828,bearing:15};
    if (reference2) window.__vinylCaptureCamera.setViewOffset(2300,1012,325,448,1633,757);
    else window.__vinylCaptureCamera.setViewOffset(2500,1100,363,450,1774,887);
  }
  engine.restorePreviewSnapshot(snapshot);
},{overview:process.argv.includes('--overview'),reference2});
await page.waitForTimeout(2000);
if (process.argv.includes('--exploration')) {
  await page.evaluate(()=>{
    window.__vinylCaptureCamera.clearViewOffset();
    window.__meewavEngine.enterRing();
  });
  await page.waitForTimeout(2600);
}
// The reference is cropped below these controls; omit those same controls in
// this isolated close-up, while keeping the bottom map switch for scale.
if (!process.argv.includes('--overview')) await page.addStyleTag({content:'.reference-rail, .reference-search-dock, .reference-city-strip, .globe-honors-dock, .reference-controls, .ring-explore-button {visibility:hidden !important;}'});
const pose=await page.evaluate(()=>window.__meewavEngine.getView());
if (process.argv.includes('--light-probe')) console.log(await page.evaluate((reference2)=>{
  const T=window.__vinylCaptureThree, camera=window.__vinylCaptureCamera;
  const mesh=window.__vinylCaptureScene.getObjectByName('MeeWav signature continuous pressed record');
  const ray=new T.Raycaster();ray.setFromCamera(reference2?new T.Vector2(220/1633*2-1,1-150/757*2):new T.Vector2(80/1774*2-1,1-400/887*2),camera);
  const localRay=ray.ray.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
  const p=localRay.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3());
  const V=mesh.worldToLocal(camera.position.clone()).sub(p).normalize();
  const radial=new T.Vector3(p.x,0,p.z).normalize();
  const half=radial.multiplyScalar(reference2 ? .06 : .2).add(new T.Vector3(0,1,0)).normalize();
  return {point:p.toArray(),light:half.multiplyScalar(2*V.dot(half)).sub(V).toArray()};
},reference2));
const name=process.argv[2]||'baseline';
await page.screenshot({path:new URL(name+'.png',folder).pathname.replace(/^\/(\w:)/,'$1')});
await writeFile(new URL(name+'.json',folder),JSON.stringify({pose,errors},null,2));
console.log(JSON.stringify({name,pose,errors}));
await browser.close();


