import {boundaryPlace} from './odisha-boundaries.mjs';
import {mountParcelBasemap} from './parcel-basemap.mjs';

const files=new Map();
const districtCredits='<a href="https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/">Districts by Pathways Data and LGD via geoBoundaries</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>';
const villageCredits='<a href="https://nwdp.nwic.gov.in/dataset/village-boundary">Survey of India village boundaries</a>';
const stateCredits='<a href="https://www.geoboundaries.org/">geoBoundaries / DataMeet</a> · <a href="https://creativecommons.org/licenses/by/2.5/in/">CC BY 2.5 IN</a>';
const abbreviations={
  'Andaman and Nicobar Islands':'AN','Andhra Pradesh':'AP','Arunachal Pradesh':'AR','Assam':'AS',
  'Bihar':'BR','Chandigarh':'CH','Chhattisgarh':'CG','Dadra and Nagar Haveli and Daman and Diu':'DH',
  'Delhi':'DL','Goa':'GA','Gujarat':'GJ','Haryana':'HR','Himachal Pradesh':'HP',
  'Jammu and Kashmir':'JK','Jharkhand':'JH','Karnataka':'KA','Kerala':'KL','Ladakh':'LA',
  'Lakshadweep':'LD','Madhya Pradesh':'MP','Maharashtra':'MH','Manipur':'MN','Meghalaya':'ML',
  'Mizoram':'MZ','Nagaland':'NL','Odisha':'OD','Puducherry':'PY','Punjab':'PB','Rajasthan':'RJ',
  'Sikkim':'SK','Tamil Nadu':'TN','Telangana':'TG','Tripura':'TR','Uttar Pradesh':'UP',
  'Uttarakhand':'UK','West Bengal':'WB'
};
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
  let revision=0,dispose,selection=[],region='',overlay;
  const parcelStatus=document.createElement('p');
  parcelStatus.className='atlas-parcel-status';parcelStatus.hidden=true;
  function setParcelOverlay(next){
    overlay=next;
    root.toggleAttribute('data-active-parcel-overlay',Boolean(next));
    dispose?.setOverlay(next);
    parcelStatus.hidden=!next;
    if(!next)return;
    const features=next.geographic?.features?.length??0;
    const direct=[...next.highlights.values()].filter(match=>match.level==='full').length;
    parcelStatus.textContent=features
      ? features+' geographic parcels · '+direct+' direct '+(direct===1?'match':'matches')+' · '+(next.highlights.size-direct)+' matching khata only'
      : next.raster?'Official geographic sheet image':'Geographic coordinates unavailable. Open the native sheet to inspect parcels.';
  }
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
      const byDistrict=!districtCode && !villages.length && state==='Odisha';
      let shapes=villages;
      if(districtCode){
        const district=index.districts.find(d=>d.code===districtCode);
        const rows=await load('odisha-boundaries-'+districtCode+'.json');
        shapes=rows.map(row=>boundaryPlace(row,district.name));
      }
      const villageMode=Boolean(districtCode || villages.length);
      const districtRegions=byDistrict?await load('odisha-district-polygons.json'):[];
      if(version!==revision||!root.isConnected)return;
      function feature(id,name,polygons,kind,center) {
        return {properties:{id,name,shortName:abbreviations[name],kind,center},geometry:{type:'MultiPolygon',coordinates:polygons}};
      }
      const features=villageMode?shapes.map(p=>feature(p.id,p.village,p.polygons,'village',p.center))
        :byDistrict?districtRegions.map(d=>feature('district/'+d.code,index.districts.find(v=>v.code===d.code).name,d.polygons,'district',d.label))
        :index.states.map(p=>feature(p.name,p.name,p.polygons,'state'));
      const highlights=new Set(villages.length?villages.map(p=>p.id):state?[state]:[]);
      const source=villageMode?'Survey of India · Village boundaries':byDistrict?'Odisha · Select a district':'India · Select a state';
      dispose?.();root.replaceChildren();
      dispose=mountParcelBasemap(root,{geographic:{source,features},referenceBoundary:true,highlights,pinState:pins,fractional:true,onFeature:id=>{
        if(id.startsWith('district/')){void show([],'Odisha',id.slice(9));return;}
        const village=shapes.find(p=>p.id===id);
        if(village)onChoose?.(village);else {onState?.(id);void show([],id);}
      }});
      if(byDistrict){
        const label=document.createElement('label'), select=document.createElement('select');
        label.className='label atlas-district';label.textContent='Choose an Odisha district';
        select.append(new Option('Select district',''),...index.districts.map(d=>new Option(d.name,d.code)));
        select.onchange=()=>{if(select.value)void show([],'Odisha',select.value);};
        label.append(select);root.append(label);
      }
      root.querySelector('[data-zoom="1"]').setAttribute('aria-label','Zoom geographic map in');
      root.querySelector('[data-zoom="-1"]').setAttribute('aria-label','Zoom geographic map out');
      const credit=document.createElement('small');credit.className='atlas-attribution';
      credit.innerHTML=villageMode?villageCredits:byDistrict?districtCredits:stateCredits;
      root.append(credit,parcelStatus);
      if(overlay)setParcelOverlay(overlay);
      if(villageMode){
        const back=document.createElement('button');back.type='button';back.className='plain-link';
        back.textContent='Odisha districts';back.onclick=()=>void show([],'Odisha');credit.append(back);
      }
      if(villageMode||state){
        const reset=document.createElement('button');reset.type='button';reset.className='plain-link';
        reset.textContent='India overview';reset.onclick=()=>void show([],'');credit.append(reset);
      }
    }catch(error){if(version===revision&&root.isConnected)root.textContent=error.message;}
  }
  setParcelOverlay.show=()=>root.scrollIntoView({block:'start'});
  return {show,setParcelOverlay};
}

