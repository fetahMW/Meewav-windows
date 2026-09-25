import fs from 'node:fs/promises';
import sharp from 'sharp';
const folder = 'public/images/market/scenes';
await fs.mkdir(folder, {recursive:true});
const sheets = [
  ['19_36_33', ['synth-studio','turntable-studio','electric-guitar-studio','stage-keyboard-studio','drums-studio','acoustic-guitar-studio']],
  ['19_39_01', ['grand-piano-studio','electric-guitar-room','drums-room','synth-room','acoustic-guitar-room','turntable-room']],
  ['19_40_23', ['violin-salon','cello-salon','trumpet-salon','saxophone-salon','harp-salon','handpan-salon']],
];
const manifest = [];
for (const [stamp, names] of sheets) {
  const source = `C:/Users/linkw/Downloads/ChatGPT Image 8 sept. 2026, ${stamp}.png`;
  const {width,height} = await sharp(source).metadata();
  for (let i=0;i<6;i++) {
    // Exclude both the outer frame and the white gutters, without altering the photograph.
    const left=Math.round(i%3*width/3)+7, top=Math.round(Math.floor(i/3)*height/2)+7;
    const right=Math.round((i%3+1)*width/3)-7, bottom=Math.round((Math.floor(i/3)+1)*height/2)-7;
    await sharp(source).extract({left,top,width:right-left,height:bottom-top}).webp({quality:90}).toFile(`${folder}/${names[i]}.webp`);
    manifest.push({file:names[i]+'.webp',source:source.split('/').pop(),crop:{left,top,width:right-left,height:bottom-top}});
  }
}
const base='C:/Users/linkw/.codex/generated_images/01a07f44-9c6b-78b3-bffb-ce8b413905e2/';
for (const [file,id] of [
  ['exec-4968a9c4-143c-4d40-9b03-07ba2c2030f6.png','new-moog-subsequent-37'],
  ['exec-74f98d82-113a-4435-a747-a1cfc9fdaf4f.png','used-technics-sl1200'],
  ['exec-128e024b-dc8b-4e6c-bf52-f1b9bc084316.png','rental-nord-stage-4'],
]) {
  await sharp(base+file).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toFile(`${folder}/${id}.webp`);
  manifest.push({file:id+'.webp',source:file});
}
await fs.writeFile('scripts/market-scene-sources.json',JSON.stringify(manifest,null,2)+'\n');
// Review sheet is a development artifact, never an asset displayed to customers.
const files=(await fs.readdir(folder)).filter(f=>f.endsWith('.webp'));
const tiles=await Promise.all(files.map(async(file,i)=>({input:await sharp(`${folder}/${file}`).resize(200,180,{fit:'contain',background:'#111'}).extend({top:0,bottom:24,left:0,right:0,background:'#111'}).composite([{input:Buffer.from(`<svg width="200" height="24"><text x="4" y="16" fill="white" font-size="9">${file}</text></svg>`),left:0,top:180}]).png().toBuffer(),left:i%6*200,top:Math.floor(i/6)*204})));
await fs.mkdir('artifacts/market-scenes',{recursive:true});
await sharp({create:{width:1200,height:Math.ceil(files.length/6)*204,channels:3,background:'#111'}}).composite(tiles).png().toFile('artifacts/market-scenes/library-review.png');
console.log(`${files.length} library assets prepared`);
