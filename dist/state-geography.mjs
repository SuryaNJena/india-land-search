import {boundaryPlace} from './odisha-boundaries.mjs';

const regions={
  'Andaman and Nicobar Islands':'an','Andhra Pradesh':'ap','Arunachal Pradesh':'ar',Assam:'as',
  Bihar:'br',Chandigarh:'ch',Chhattisgarh:'cg','Dadra and Nagar Haveli and Daman and Diu':'dh',
  Delhi:'dl',Goa:'ga',Gujarat:'gj',Haryana:'hr','Himachal Pradesh':'hp','Jammu and Kashmir':'jk',
  Jharkhand:'jh',Karnataka:'ka',Kerala:'kl',Ladakh:'la',Lakshadweep:'ld','Madhya Pradesh':'mp',
  Maharashtra:'mh',Manipur:'mn',Meghalaya:'ml',Mizoram:'mz',Nagaland:'nl',Odisha:'od',
  Puducherry:'py',Punjab:'pb',Rajasthan:'rj',Sikkim:'sk','Tamil Nadu':'tn',Telangana:'ts',
  Tripura:'tr','Uttar Pradesh':'up',Uttarakhand:'uk','West Bengal':'wb'
};
const villageCatalogs=new Set(['od','cg','br','jh','rj','up']);
const villagesWithOutlines=new Set(['od','cg']);
const cache=new Map();
export const stateShortName=state=>(state==='Telangana'?'TG':regions[state]?.toUpperCase());
export const geographyKey=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');
export const geographyFor=state=>{
  const code=Object.hasOwn(regions,state)?regions[state]:null;
  if (!code) return;
  const districtCode={la:'ld',ld:'lk'}[code]??code;
  return {code,districts:code==='od'?'odisha-district-polygons.json':'region-'+districtCode+'-districts.json',
    catalog:villageCatalogs.has(code)?(code==='od'?'villages.json':'region-'+code+'-villages.json'):undefined,
    outlines:villagesWithOutlines.has(code),...(code==='od'?{districtPickerLabel:'Choose an Odisha district'}:{})};
};
export function loadGeography(file) {
  if (!cache.has(file)) cache.set(file,fetch(new URL(file,import.meta.url)).then(response=>{
    if (!response.ok) throw Error('The reference geography could not be loaded.');
    return response.json();
  }).catch(error=>{cache.delete(file);throw error;}));
  return cache.get(file);
}
export async function districtGeography(state,atlas) {
  const config=geographyFor(state);
  if (!config) return [];
  const districts=await loadGeography(config.districts);
  return config.code==='od'?districts.map(item=>({...item,name:atlas.districts.find(d=>d.code===item.code)?.name??item.code})):districts;
}
export async function villageOutlines(state,district) {
  const config=geographyFor(state);
  if (!config?.outlines) return [];
  const filename=config.code==='od'?'odisha-boundaries-'+district.code+'.json':'region-'+config.code+'-boundaries-'+district.code+'.json';
  const rows=await loadGeography(filename);
  return rows.map(row=>boundaryPlace(row,district.name,state,district.code));
}
export async function readVillageDirectory(state,load=loadGeography) {
  const config=geographyFor(state);
  if (!config?.catalog) return {rows:[],source:''};
  const {rows,source}=await load(config.catalog);
  if (!Array.isArray(rows)) throw Error('The village directory is unavailable.');
  return config.code==='od'?{rows:rows.map(([id,village,local,district,tehsil,portalCode,riCode,ri,aliases])=>
    ({id,village,local,district,tehsil,state,portalCode,riCode,ri,aliases})),source}
    :{rows:rows.map(([id,village,district,tehsil,districtCode,lon,lat])=>
      ({id,village,district,tehsil,state,districtCode,center:[lon/10000,lat/10000]})),
      source:'Survey of India · National Water Data Portal'};
}
