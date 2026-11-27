import {districtGeography,geographyFor,geographyKey as key,loadGeography,stateShortName,villageOutlines} from './state-geography.mjs';
import {mountParcelBasemap} from './parcel-basemap.mjs';

const districtCredits='<a href="https://nwdp.nwic.gov.in/dataset/district-boundary">Survey of India district boundaries via the National Water Data Portal</a>';
const legacyDistrictCredits='<a href="https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/">Districts by Pathways Data and LGD via geoBoundaries</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>';
const villageCredits='<a href="https://nwdp.nwic.gov.in/dataset/village-boundary">Survey of India village boundaries</a>';
const stateCredits='<a href="https://www.geoboundaries.org/">geoBoundaries / DataMeet</a> · <a href="https://creativecommons.org/licenses/by/2.5/in/">CC BY 2.5 IN</a>';

export function resolveBoundary(place,rows){
  if (!place) return;
  const same=rows.filter(r=>(!r.state || !place.state || r.state===place.state) && key(r.district)===key(place.district));
  const exact=same.filter(r=>r.id===(place.lgd??place.id) || place.portalCode && r.portalCode===place.portalCode);
  if (exact.length===1) return exact[0];
  const matches=(exact.length?exact:same).filter(r=>key(r.village)===key(place.village)&&key(r.tehsil)===key(place.tehsil));
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
      ? features+' geographic parcels · '+direct+' direct '+(direct===1?'match':'matches')+' · '+(next.highlights.size-direct)+' matching '+(region==='Odisha'?'khata':'holding')+' only'
      : next.raster?'Official geographic sheet image':'Geographic coordinates unavailable. Open the native sheet to inspect parcels.';
  }
  const pins={};
  async function show(places=selection,state=region,districtCode=''){
    selection=places;region=state;
    const version=++revision;
    try{
      const index=await loadGeography('atlas-boundaries.json');
      const config=geographyFor(state);
      const districts=await districtGeography(state,index);
      const chosen=places.filter(place=>!place.state || place.state===state);
      const districtFor=place=>districts.find(d=>d.code===place.districtCode || key(d.name)===key(place.district));
      const byDistrict=new Map();
      async function outlines(district){
        if (!byDistrict.has(district.code)) byDistrict.set(district.code,villageOutlines(state,district));
        return byDistrict.get(district.code);
      }
      const found=await Promise.all(chosen.slice(0,20).map(async place=>{
        const district=districtFor(place);
        return district && resolveBoundary(place,await outlines(district));
      }));
      if(version!==revision||!root.isConnected)return;
      const villages=found.filter(Boolean);
      const district=districts.find(d=>d.code===districtCode) || (!villages.length && chosen.length?districtFor(chosen[0]):undefined);
      const districtVillages=district?await outlines(district):[];
      const shapes=districtVillages.length?districtVillages:villages;
      if(version!==revision||!root.isConnected)return;
      const villageMode=shapes.length>0;
      const districtMode=Boolean(districts.length);
      function feature(id,name,polygons,kind,center) {
        return {properties:{id,name,shortName:stateShortName(name),kind,center},geometry:{type:'MultiPolygon',coordinates:polygons}};
      }
      const districtFeature=d=>feature('district/'+d.code,d.name,d.polygons,'district',d.label);
      const villageFeature=p=>feature('village/'+p.id+'/'+p.tehsil,p.village,p.polygons,'village',p.center);
      const villagesByFeature=new Map(shapes.map(p=>[villageFeature(p).properties.id,p]));
      const features=villageMode?shapes.map(villageFeature)
        :districtMode?(district?[district]:districts).map(districtFeature)
        :index.states.map(p=>feature(p.name,p.name,p.polygons,'state'));
      const highlights=new Set(villages.length?villages.map(p=>villageFeature(p).properties.id):state?[state]:[]);
      const source=villageMode?'Survey of India · Village boundaries':district
        ? state+' · '+district.name+' district':districtMode?state+' · Select a district':'India · Select a state';
      const locationPin=!villageMode && chosen[0]?.center?{position:chosen[0].center,label:chosen[0].village}:pins;
      dispose?.();root.replaceChildren();
      dispose=mountParcelBasemap(root,{geographic:{source,features},referenceBoundary:true,highlights,pinState:locationPin,fractional:true,onFeature:id=>{
        if(id.startsWith('district/')){
          if(!district)void show([],state,id.slice(9));
          return;
        }
        const village=villagesByFeature.get(id);
        if(village)onChoose?.(village);else {onState?.(id);void show([],id);}
      }});
      if(districtMode&&!district&&!villageMode){
        const label=document.createElement('label'), select=document.createElement('select');
        label.className='label atlas-district';label.textContent=config.districtPickerLabel??'Choose a district in '+state;
        select.append(new Option('Select district',''),...districts.map(d=>new Option(d.name,d.code)));
        select.onchange=()=>{if(select.value)void show([],state,select.value);};
        label.append(select);root.append(label);
      }
      if(district&&!villageMode){
        const note=document.createElement('small');
        note.textContent='Village outlines are unavailable for this district.'+(config?.catalog?' Use Find a village by name to locate a village.':'');
        root.append(note);
      }
      root.querySelector('[data-zoom="1"]').setAttribute('aria-label','Zoom geographic map in');
      root.querySelector('[data-zoom="-1"]').setAttribute('aria-label','Zoom geographic map out');
      const credit=document.createElement('small');credit.className='atlas-attribution';
      credit.innerHTML=villageMode?villageCredits:districtMode?(config.code==='od'?legacyDistrictCredits:districtCredits):stateCredits;
      root.append(credit,parcelStatus);
      if(overlay)setParcelOverlay(overlay);
      if(villageMode||district){
        const back=document.createElement('button');back.type='button';back.className='plain-link';
        back.textContent=state+' districts';back.onclick=()=>void show([],state);credit.append(back);
      }
      if(state){
        const reset=document.createElement('button');reset.type='button';reset.className='plain-link';
        reset.textContent='India overview';reset.onclick=()=>void show([],'');credit.append(reset);
      }
    }catch(error){if(version===revision&&root.isConnected)root.textContent=error.message;}
  }
  setParcelOverlay.show=()=>root.scrollIntoView({block:'start'});
  return {show,setParcelOverlay};
}
