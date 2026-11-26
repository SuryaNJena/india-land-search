import {boundaryPlace} from './odisha-boundaries.mjs';
import {mountParcelBasemap} from './parcel-basemap.mjs';

const files=new Map();
function load(file){
  if (!files.has(file)) files.set(file,fetch(new URL(file,import.meta.url)).then(r=>{
    if (!r.ok) throw Error('Boundary data could not be loaded.');
    return r.json();
  }).catch(e=>{files.delete(file);throw e;}));
  return files.get(file);
}
const key=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');
export function resolveBoundary(place,rows){
  if (!place) return;
  const same=rows.filter(r=>key(r.district)===key(place.district));
  const exact=same.find(r=>r.id===(place.lgd??place.id) || place.portalCode && r.portalCode===place.portalCode);
  if (exact) return exact;
  const matches=same.filter(r=>key(r.village)===key(place.village)&&key(r.tehsil)===key(place.tehsil));
  if(matches.length===1)return matches[0];
}
export function unionBounds(boxes){
  return boxes.length?[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))]:undefined;
}
export function mountLocationAtlas(root,{onChoose,onState}={}){
  let revision=0,dispose,selection=[],region='';
  const pins={};
  async function show(places=selection,state=region,districtCode=''){
    selection=places;region=state;
    const version=++revision;
    try{
      const index=await load('atlas-boundaries.json');
      const outlines=await Promise.all(places.slice(0,20).map(async place=>{
        const district=index.districts.find(d=>key(d.name)===key(place.district)||key(d.code)===key(place.district));
        if(!district)return;
        const rows=await load('odisha-boundaries-'+district.code+'.json');
        const exact=rows.find(row=>row[0]===(place.lgd??place.id)||place.portalCode&&row[6]===place.portalCode);
        const candidates=exact?[exact]:rows.filter(row=>key(row[1])===key(place.village)&&key(row[2])===key(place.tehsil));
        return resolveBoundary(place,candidates.map(row=>boundaryPlace(row,place.district)));
      }));
      if(version!==revision||!root.isConnected)return;
      const villages=outlines.filter(Boolean);
      let shapes=villages.length?villages:index.states;
      let markers=[];
      if(districtCode){
        const district=index.districts.find(d=>d.code===districtCode);
        const rows=await load('odisha-boundaries-'+districtCode+'.json');
        shapes=rows.map(row=>boundaryPlace(row,district.name));
      }else if(!villages.length&&state==='Odisha'){
        shapes=index.states.filter(s=>s.name==='Odisha');
        markers=index.districts.map(d=>{
          const [a,b,c,e]=d.bounds,center=[(a+c)/2,(b+e)/2];
          return {properties:{id:'district/'+d.code,name:d.name,marker:true,center},geometry:{type:'Polygon',coordinates:[[[a,b],[c,b],[c,e],[a,e],[a,b]]]}};
        });
      }
      if(version!==revision||!root.isConnected)return;
      const features=shapes.map(p=>({properties:{id:p.id??p.name,name:p.village??p.name},geometry:{type:'MultiPolygon',coordinates:p.polygons}})).concat(markers);
      const highlights=new Set(villages.length?villages.map(p=>p.id):state?[state]:[]);
      dispose?.();root.replaceChildren();
      dispose=mountParcelBasemap(root,{geographic:{source:villages.length?'Survey of India · NWDP village boundaries':'geoBoundaries and DataMeet · India state reference boundaries',features},referenceBoundary:true,highlights,pinState:pins,onFeature:id=>{
        if(id.startsWith('district/')){void show([],'Odisha',id.slice(9));return;}
        const village=shapes.find(p=>p.id===id);
        if(village)onChoose?.(village);else {onState?.(id);void show([],id);}
      }});
      root.querySelector('[data-zoom="1"]').setAttribute('aria-label','Zoom geographic map in');
      root.querySelector('[data-zoom="-1"]').setAttribute('aria-label','Zoom geographic map out');
      const credit=document.createElement('small');credit.className='atlas-attribution';
      credit.innerHTML= villages.length?'<a href="https://nwdp.nwic.gov.in/dataset/village-boundary">Survey of India village boundaries</a>':'<a href="https://www.geoboundaries.org/">geoBoundaries / DataMeet</a> · <a href="https://creativecommons.org/licenses/by/2.5/in/">CC BY 2.5 IN</a>';
      root.append(credit);
      if(villages.length||state||districtCode){
        const reset=document.createElement('button');reset.type='button';reset.className='plain-link';
        reset.textContent='India overview';reset.onclick=()=>void show([],'');credit.append(' · ',reset);
      }
    }catch(error){if(version===revision&&root.isConnected)root.textContent=error.message;}
  }
  return {show};
}

