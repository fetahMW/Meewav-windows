// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { loadMusicSceneCityIndex, loadMusicScenesForCity, searchMusicSceneCities, resolveMusicSceneFromCoordinates, canonicalizeMusicSceneSelection } from './musicSceneSelection';
import { containsGlobePoint, loadGlobeCityFeatures } from './vinylGlobeGeography';

const root=resolve('vendor/globe-vinyle/data');
const read=(path:string)=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const sourceCities=read('cities.json').cities;
const departments=read('communes/index.json').assets;
const quarterAssets=read('quarters/index.json').assets;
beforeAll(()=>{
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>{
    const path=url.split('/globe-vinyle/data/')[1];
    if(path) return { ok:true, json:async()=>read(path) };
    if(url.includes('france-communes-index'))return {ok:true,json:async()=>({results:[{
      id:'commune-59350',type:'commune',label:'Old Lille',subtitle:'Nord',postalCodes:['59000'],aliases:['Lille-Lomme'],center:[0,0],
    }]})};
    throw new Error('Unexpected legacy geography request: '+url);
  }));
});
afterAll(()=>vi.unstubAllGlobals());

describe('Onboarding uses the deployed vinyl globe geography',()=>{
  it('makes every globe city searchable and keeps optional postal aliases without old coordinates',async()=>{
    const cities=await loadMusicSceneCityIndex();
    expect(new Set(cities.map(c=>c.communeCode))).toEqual(new Set(sourceCities.map((c:any)=>c.code)));
    for(const city of cities) expect(searchMusicSceneCities([city],city.communeCode,1)[0]?.communeCode).toBe(city.communeCode);
    for(const code of ['75056','97411','2A004','01001','59350'])expect(searchMusicSceneCities(cities,code,1)[0]?.communeCode).toBe(code);
    const lille=searchMusicSceneCities(cities,'59000')[0];
    expect(lille.communeCode).toBe('59350');expect(lille.result.label).toBe('Lille');expect(lille.result.center).not.toEqual([0,0]);
    expect(searchMusicSceneCities(cities,'saint denis').filter(c=>['93066','97411'].includes(c.communeCode))).toHaveLength(2);
    console.info('Catalogue vérifié:',cities.length,'villes');
  },60000);

  it('has an actual rendered contour for every city and every subdivision file',()=>{
    const codes=new Set(sourceCities.map((c:any)=>c.code));
    const contourCodes=new Set<string>();
    for(const asset of departments)for(const feature of read(asset.path).features)contourCodes.add(String(feature.properties.code));
    const missing=sourceCities.filter((c:any)=>!contourCodes.has(c.code)).map((c:any)=>c.code);
    expect(missing).toEqual([]);
    let count=0;
    for(const asset of quarterAssets){
      expect(codes.has(asset.cityCode)).toBe(true);
      const features=read(asset.path).features;expect(features.length).toBeGreaterThan(0);
      expect(new Set(features.map((f:any)=>f.id)).size).toBe(features.length);
      for(const f of features){expect(f.properties.cityCode).toBe(asset.cityCode);expect(f.id).toMatch(/^fr-quartier-/);}
      count+=features.length;
    }
    console.info('Découpe vérifiée:',quarterAssets.length,'villes subdivisées,',count,'quartiers hors Paris');
  },60000);

  it.each(['75056','06088','13055','69123','31555','44109','59350','97411','2A004','01001'])('uses exact IDs, names and interior arrival points for %s',async(code)=>{
    const city=(await loadMusicSceneCityIndex()).find(c=>c.communeCode===code)!;
    const scenes=await loadMusicScenesForCity(city),features=await loadGlobeCityFeatures(code,city.result.departmentCode);
    expect(new Set(scenes.map(s=>s.zoneId))).toEqual(new Set(features.map(f=>String(f.id))));
    for(const scene of scenes){const feature=features.find(f=>f.id===scene.zoneId)!;
      expect(scene.label).toBe(feature.properties.name);expect(containsGlobePoint(feature,scene.center)).toBe(true);
    }
    if(code==='75056')expect(scenes).toHaveLength(80);
    if(code==='01001'){expect(scenes).toHaveLength(1);expect(scenes[0].zoneId).toBe('fr-commune-01001');}
  },30000);

  it('resolves actual polygons, preserves a Paris selection and rejects foreign coordinates',async()=>{
    const resolved=await resolveMusicSceneFromCoordinates(48.858093,2.294694);
    expect(resolved.city.communeCode).toBe('75056');expect(resolved.scene.zoneId).toBe('fr-paris-7510704');
    const recovered=await canonicalizeMusicSceneSelection(resolved.city,{...resolved.scene,zoneId:'old-scene',geographyVersion:undefined});
    expect(recovered.scene.zoneId).toBe(resolved.scene.zoneId);
    await expect(resolveMusicSceneFromCoordinates(0,0)).rejects.toThrow('commune du globe');
  },30000);

  it('does not confuse bounding boxes, holes or detached polygon islands',()=>{
    const f:any={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,3],[3,3],[3,1],[1,1]]]}};
    expect(containsGlobePoint(f,[2,2])).toBe(false);expect(containsGlobePoint(f,[.5,.5])).toBe(true);
    f.geometry={type:'MultiPolygon',coordinates:[f.geometry.coordinates,[[[8,8],[9,8],[9,9],[8,9],[8,8]]]]};
    expect(containsGlobePoint(f,[8.5,8.5])).toBe(true);expect(containsGlobePoint(f,[6,6])).toBe(false);
  });
});
