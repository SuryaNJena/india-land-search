import {normalize} from './core.mjs';

const storageKey='india-land-search.selected-villages.v1';
const verified=/^[1-9]\d{0,2}-[1-9]\d{0,2}-[1-9]\d{0,4}$/;
const items=new Map();
export const placeKey=place=>(place.state??'Odisha')+'/'+(place.lgd || place.id || place.portalCode);
function compact(place) {
  const {id,lgd,village,local,aliases,tehsil,district,ri,state='Odisha',riCode,portalCode,districtCode,center}=place;
  return {id,lgd,village,local,aliases,tehsil,district,ri,state,riCode,portalCode};
}
try {
  const current=localStorage.getItem(storageKey);
  const stored=JSON.parse(current??localStorage.getItem('landreview.odisha-villages'));
  if (Array.isArray(stored)) for(const place of stored.slice(0,20)){
    if (!place?.id || !place.village) continue;
    const p=compact({...place,portalCode:place.portalCode || ((!place.state || place.state==='Odisha') && verified.test(place.id)?place.id:undefined)});
    items.set(placeKey(p),p);
  }
} catch { /* This tab can still hold the current selection. */ }
export function selectedPlaces(){return [...items.values()];}
export function rememberPlace(place){
  const previous=selectedPlaces().find(p=>placeKey(p)===placeKey(place) || p.state===(place.state??'Odisha') && place.portalCode && p.portalCode===place.portalCode);
  if (!previous && items.size>=20) throw Error('Choose up to 20 villages at a time.');
  const p=compact({...previous,...place,...(previous?.lgd?{lgd:previous.lgd}:{})});
  if (previous) items.delete(placeKey(previous));
  items.set(placeKey(p),p);persist();return p;
}
export function forgetPlace(key){items.delete(key);persist();}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(selectedPlaces()));}catch{/* Current tab retains selections. */}}
export function lookupPlace(place){
  if (place?.state && place.state!=='Odisha' || !verified.test(place?.portalCode)) return;
  const [districtCode,tehsilCode,villageCode]=place.portalCode.split('-');
  return {...place,id:place.portalCode,districtCode,tehsilCode,villageCode};
}
const word=s=>normalize(s??'').normalize('NFKC').replace(/[\s.()’'_-]/gu,'');
function latin(s){
  if (/[\u0b01-\u0b7f]/u.test(s) && globalThis.Sanscript) s=globalThis.Sanscript.t(s,'oriya','iso');
  return word(s.normalize('NFD').replace(/\p{M}/gu,''));
}
function similar(a,b){
  if (a.length<4 || b.length<4 || Math.abs(a.length-b.length)>2) return false;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++){
    const next=[i+1];
    for(let j=0;j<b.length;j++)next.push(Math.min(prev[j]+(a[i]!==b[j]),prev[j+1]+1,next[j]+1));
    prev=next;
  }
  return prev[b.length]<=Math.min(2,Math.floor(Math.max(a.length,b.length)/4));
}
const knownAliases={cuttack:['କଟକ'],anugola:['Angul','ଅନୁଗୋଳ'],talacher:['ତାଳଚେର'],kendrapara:['କେନ୍ଦ୍ରାପଡ଼ା'],mahanga:['ମାହାଙ୍ଗା'],derabish:['Derabis','ଡେରାବିଶ']};
function rank(options,names){
  const keys=names.filter(Boolean).flatMap(n=>[n,...(knownAliases[word(n)]??[])]);
  const exact=options.filter(({label})=>keys.some(n=>word(n)===word(label) || latin(n)===latin(label)));
  if (exact.length) return {options:exact,exact:true};
  return {options:options.filter(({label})=>keys.some(n=>similar(latin(n),latin(label)))),exact:false};
}
export async function resolveVillage(place,load,signal){
  if (lookupPlace(place))return {match:place};
  let branches=[{path:[],exact:true,labels:[]}];
  for(const names of [[place.district],[place.tehsil],[place.village,place.local,...place.aliases??[]]]){
    const next=[];
    for(const branch of branches){
      signal?.throwIfAborted();
      const ranked=rank(await load(branch.path.join('-'),signal),names);
      for(const option of ranked.options){
        next.push({path:[...branch.path,option.code],labels:[...branch.labels,option.label],exact:branch.exact&&ranked.exact&&ranked.options.length===1});
      }
    }
    if(next.length>20)return {candidates:[]};
    branches=next;
  }
  const candidates=branches.map(({path,labels})=>({...place,portalCode:path.join('-'),officialLabel:labels.join(' · ')}));
  return branches.length===1&&branches[0].exact ? {match:candidates[0]} : {candidates};
}
export async function resolveRI(place,load,signal){
  if (place.riCode)return place;
  const codes=lookupPlace(place);
  if(!codes)return;
  const prefix=codes.districtCode+'-'+codes.tehsilCode;
  const circles=await load(prefix,signal);
  const found=[];
  for(const circle of circles){
    signal?.throwIfAborted();
    const villages=await load(prefix+'-'+circle.code,signal);
    if (villages.some(v=>String(v.code)===codes.villageCode)) found.push(circle);
  }
  if (found.length===1)return {...place,riCode:found[0].code,ri:found[0].label};
}


const termKey='india-land-search.map-terms';
export function setMapTerms(names){try{sessionStorage.setItem(termKey,JSON.stringify(names));}catch{/* Browser storage is optional. */}}
export function mapTerms(){try{return JSON.parse(sessionStorage.getItem(termKey))??[];}catch{return [];}}
