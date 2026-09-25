import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch();
let viewerForDebug,hostForDebug;
try{
 const context=await browser.newContext({viewport:{width:1536,height:960}}),host=await context.newPage(),viewer=await context.newPage();
 viewerForDebug=viewer;hostForDebug=host;
 const errors=[];for(const page of [host,viewer])page.on('pageerror',e=>errors.push(e.message));
 for(const [page,role] of [[host,'host'],[viewer,'viewer']]){await page.goto(`http://127.0.0.1:5183/rooms/place?demoRole=${role}`);await page.locator('.place-room-workspace').waitFor();await page.evaluate(()=>{window.originalVideo=document.querySelector('video');});}
 const names={place:'La Place',cage:'La Cage',classe:'La Classe',loge:'La Loge',wave:'La Wave',scene:'La Scène'};
 async function transition(target,prepare=false){
  // Advance the demo cooldown, without changing its session/version or command path.
  await host.evaluate(()=>{for(const key of Object.keys(localStorage)){if(key.startsWith('meewav:room-experience:v1:')){const state=JSON.parse(localStorage.getItem(key));state.lastRequestAt=0;localStorage.setItem(key,JSON.stringify(state));}}});
  await host.getByRole('button',{name:'Switch Room',exact:true}).click();
  await host.locator('.switch-room-grid button').filter({has:host.getByText(names[target],{exact:true})}).click();
  if(prepare){
   const form=host.locator('.switch-room-popup form');await form.waitFor();
   if(target==='scene')await form.getByLabel('Programme · un titre par ligne').fill('Mon passage conservé');
   if(target==='loge')await form.getByLabel('Titre de l’avant-première').fill('Écoute en Loge');
   if(target==='wave'){
    const rate=8000,frames=Math.round(rate*60/92*4*8),wav=Buffer.alloc(44+frames*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/rate)*1000),44+i*2);
    await form.locator('input[type=file]').setInputFiles({name:'base-92bpm.wav',mimeType:'audio/wav',buffer:wav});
    await form.getByLabel(/Je possède les droits/).check();
   }
   const submit=form.getByRole('button',{name:`Préparer et continuer dans ${names[target]}`});await expect(submit).toBeEnabled();await submit.click();await expect(form).toHaveCount(0,{timeout:15000});
  }
  await expect(host.locator('.place-room-shellbar__identity')).toContainText(names[target],{timeout:15000});
  await viewer.getByRole('button',{name:`Continuer dans ${names[target]}`,exact:true}).click();
  await expect(viewer.getByRole('dialog',{name:/On continue/})).toHaveCount(0);
  for(const page of [host,viewer])assert.equal(await page.evaluate(()=>window.originalVideo===document.querySelector('video')),true,`same media in ${target}`);
 }
 for(const target of ['scene','cage','classe','loge','wave'])await transition(target,true);
 await transition('place');
 // All 30 ordered pairs through actual host controls, with each viewer accepting.
 for(const origin of Object.keys(names)){await transitionIfNeeded(origin);for(const target of Object.keys(names)){if(target===origin)continue;await transition(target);await transition(origin);}}
 async function transitionIfNeeded(target){if(!(await host.locator('.place-room-shellbar__identity').innerText()).includes(names[target]))await transition(target);}
 await transitionIfNeeded('place');
 await viewer.waitForTimeout(5100);await viewer.getByRole('button',{name:'Simuler un switch',exact:true}).click();await viewer.getByRole('dialog',{name:'On continue dans La Scène ?'}).waitFor();await viewer.getByRole('button',{name:'Pas maintenant',exact:true}).click();
 assert.deepEqual(errors,[]);
 await host.screenshot({path:'C:/Users/linkw/Desktop/Meewav-Web/.git/switch-six-host.png'});
 console.log('PASS: preparation of all destinations through UI, 30 directed pairs, individual invitation, same video node throughout, viewer simulation.');
}catch(error){console.error(error.message);if(viewerForDebug){await viewerForDebug.screenshot({path:'C:/Users/linkw/Desktop/Meewav-Web/.git/switch-six-failure.png'});console.error((await viewerForDebug.locator('[role=dialog]').allTextContents()).map(t=>t.slice(0,250)));console.error((await viewerForDebug.locator('.place-room-shellbar__identity').innerText()));console.error('HOST',await hostForDebug.locator('[role=alert]').allTextContents());}process.exitCode=1;}finally{await browser.close();}
