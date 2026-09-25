import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base=process.env.SWITCH_ROOM_URL??'http://127.0.0.1:5183';
const browser=await chromium.launch();
try{
const context=await browser.newContext({viewport:{width:1536,height:960}});
const host=await context.newPage(),viewer=await context.newPage(),late=await context.newPage();
const errors=[];for(const p of [host,viewer,late])p.on('pageerror',e=>errors.push(e.message));
for(const [p,role] of [[host,'host'],[viewer,'viewer'],[late,'guest']]){await p.goto(`${base}/rooms/place?demoRole=${role}`);await p.locator('.place-room-workspace').waitFor();await p.evaluate(()=>{window.__switchOriginalVideo=document.querySelector('video');window.__switchOriginalVideo.dataset.switchOriginal='yes';window.__switchStarted=document.querySelector('.place-room-shellbar__live-since').textContent;});}
await expect(viewer.getByRole('button',{name:'Switch Room',exact:true})).toHaveCount(0);
await viewer.getByRole('tab',{name:'Mixeur',exact:true}).click();await viewer.getByRole('slider',{name:'Volume de Retour du live',exact:true}).fill('0.25');const volume=await viewer.locator('video').first().evaluate(e=>e.volume);
await host.getByRole('button',{name:'Switch Room',exact:true}).click();await expect(host.getByRole('button',{name:/La Wave Création collective/})).toBeEnabled();await host.getByRole('button',{name:/La Scène Performances live/}).click();await host.getByLabel('Programme · un titre par ligne').fill('Concert partagé\nFinal ensemble');await host.getByRole('button',{name:'Préparer et continuer dans La Scène'}).click();
await viewer.getByRole('dialog',{name:'On continue dans La Scène ?'}).waitFor();await late.getByRole('dialog',{name:'On continue dans La Scène ?'}).waitFor();
await viewer.getByRole('button',{name:'Continuer dans La Scène',exact:true}).click();await late.keyboard.press('Escape');
for(const p of [host,viewer,late]){assert.equal(await p.evaluate(()=>window.__switchOriginalVideo===document.querySelector('video')),true);assert.equal(await p.locator('video[data-switch-original=yes]').count(),1);assert.match(await p.locator('.place-room-shellbar__live-since').innerText(),/00:42:/);}
assert.equal(await viewer.locator('video').first().evaluate(e=>e.volume),volume);
await expect(viewer.getByRole('button',{name:/Voir Concert partagé/})).toBeVisible();
await late.getByRole('tab',{name:'Scène',exact:true}).click();await expect(late.getByRole('button',{name:'Rejoindre l’expérience'})).toBeVisible();await expect(late.getByRole('button',{name:/Concert partagé/})).toHaveCount(0);await late.getByRole('button',{name:'Rejoindre l’expérience'}).click();await expect(late.getByText('Concert partagé',{exact:true}).first()).toBeVisible();
// An existing user reloading sees the authoritative current experience without old invitations.
await viewer.reload();await expect(viewer.locator('.place-room-shellbar__identity')).toContainText('La Scène');await expect(viewer.getByRole('dialog',{name:/On continue/})).toHaveCount(0);
await host.waitForTimeout(5100);await host.getByRole('button',{name:'Switch Room',exact:true}).click();await host.getByRole('button',{name:/La Place Échanges libres/}).click();await late.getByRole('dialog',{name:'On continue dans La Place ?'}).waitFor();await late.getByRole('button',{name:'Pas maintenant',exact:true}).click();await expect(late.getByRole('button',{name:'Rejoindre l’expérience'})).toBeVisible();
// Mobile popup stays in viewport; reduced motion removes the transition.
await host.setViewportSize({width:390,height:844});await host.emulateMedia({reducedMotion:'reduce'});await host.getByRole('button',{name:'Switch Room',exact:true}).click();const box=await host.locator('.switch-room-popup').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
assert.deepEqual(errors,[]);console.log('PASS: host + two attendees, accept/defer/Escape/late response/reload, same video element and volume, timer, disabled destinations and mobile popup.');
}finally{await browser.close()}
