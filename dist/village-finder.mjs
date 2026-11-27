import {normalize} from './core.mjs';
import {loadBhulekhLocations} from './odisha-live-search.mjs';
import {geographyFor,readVillageDirectory} from './state-geography.mjs';
import {runtime} from './runtime.mjs';
import {forgetPlace,placeKey,rememberPlace,resolveVillage,selectedPlaces} from './shared-villages.mjs';

const key = value => normalize(value).replace(/[\s'’_-]+/gu, '');
const order = new Intl.Collator('en-IN');
const directories=new Map();
const getDirectory=state=>{
  if(!directories.has(state)) directories.set(state,readVillageDirectory(state).catch(error=>{directories.delete(state);throw error;}));
  return directories.get(state);
};

export function findVillages(rows, input, state = '', limit = 20) {
  const query = key(input);
  if (query.length < 2) return {total:0, results:[]};
  const hits = [];
  for (const row of rows) {
    if (state && row.state !== state) continue;
    const names = [row.village, row.local, ...(row.aliases ?? [])].map(key);
    const score = names.includes(query) ? 0 : names.some(name => name.startsWith(query)) ? 1 : -1;
    if (score >= 0) hits.push({row, score});
  }
  hits.sort((a,b) => a.score-b.score || order.compare(a.row.village,b.row.village) ||
    order.compare(a.row.district,b.row.district) || order.compare(a.row.tehsil,b.row.tehsil) || order.compare(a.row.id,b.row.id));
  return {total:hits.length, results:hits.slice(0,limit).map(hit=>hit.row)};
}

export function mountVillageFinder(root, escape, choose, samplePlace, {onPreview,onFilter}={}) {
  root.innerHTML = `<summary>Find a village by name</summary>
    <label class="label">Village name<input type="search" maxlength="100" placeholder="English or local script" autocomplete="off"></label>
    <p role="status" class="muted"></p><div class="actions village-results"></div>
    <div class="location-chips" data-picked></div><div data-resolver></div>`;
  const input = root.querySelector('input[type="search"]');
  const retained=root.querySelector('[data-picked]'), resolver=root.querySelector('[data-resolver]');
  const status = root.querySelector('[role="status"]');
  const matches = root.querySelector('.village-results');
  let state = '', revision = 0, delay;
  let pending;
  const getPlaces=()=>samplePlace?[]:selectedPlaces().filter(place=>!state||place.state===state);
  function chips(){
    retained.replaceChildren();
    for(const place of getPlaces()){
      const button=document.createElement('button');
      button.type='button';button.className='button secondary';
      button.textContent=place.village+' ×';button.setAttribute('aria-label','Remove '+place.village);
      button.onclick=()=>{pending?.abort();resolver.replaceChildren();forgetPlace(placeKey(place));chips();choose(undefined,getPlaces());};
      retained.append(button);
    }
  }
  async function select(place){
    if (!place) return;
    if(samplePlace){choose(place,[place]);return;}
    pending?.abort();
    const controller=new AbortController();pending=controller;
    resolver.replaceChildren();
    const commit=p=>{const saved=rememberPlace(p);chips();choose(saved,getPlaces());};
    try {
      commit(place);
      if(place.state!=='Odisha' || place.portalCode || !runtime.hosted) return;
      resolver.textContent='Finding the official village in '+place.tehsil+'…';
      const {match,candidates}=await resolveVillage(place,loadBhulekhLocations,controller.signal);
      if(controller.signal.aborted || !root.isConnected)return;
      resolver.textContent='';
      if(match){commit(match);return;}
      resolver.textContent=candidates.length?'Which official village matches?':'Official village link unavailable. You can still view its boundary.';
      for(const p of candidates){
        const button=document.createElement('button');button.type='button';button.className='button secondary';
        button.textContent=p.officialLabel+' ('+p.portalCode+')';
        button.onclick=()=>{commit(p);resolver.replaceChildren();};
        resolver.append(button);
      }
    }catch(error){if(!controller.signal.aborted && root.isConnected)resolver.textContent=error.message;}
  }
  chips();
  async function refresh() {
    clearTimeout(delay);
    const request = ++revision;
    const query = input.value;
    matches.replaceChildren();
    if (key(query).length < 2) { status.textContent='Enter at least two characters.';onFilter?.([]); return; }
    status.textContent='Finding villages…';
    try {
      if (!samplePlace && !geographyFor(state)?.catalog) {
        status.textContent=state?'Village suggestions are unavailable for '+state+'. Use the official portal.':'Choose a state to find villages.';
        onFilter?.([]);return;
      }
      const {rows,source} = samplePlace ? {rows:[samplePlace],source:'Fictional demo directory'} : await getDirectory(state);
      if (revision !== request || !root.isConnected) return;
      const {total,results} = findVillages(rows,query,state);
      onFilter?.(results);
      status.textContent = total
        ? `Showing ${results.length} of ${total} matches · ${source}`
        : `No village matched in this directory · ${source}`;
      matches.innerHTML = results.map((row,i)=>`<button type="button" class="button secondary" data-village="${i}">${escape(row.village)}${row.local?` · ${escape(row.local)}`:''} <span class="muted">${escape([row.tehsil,row.district,row.state,samplePlace ? 'Sample record' : ''].join(', '))}</span></button>`).join('');
      matches.querySelectorAll('[data-village]').forEach(button=>{
        const place=results[Number(button.dataset.village)];
        button.onclick=()=>void select(place);
        button.onfocus=()=>onPreview?.(place);
        button.onpointerenter=()=>onPreview?.(place);
      });
    } catch (error) {
      if (revision === request) status.textContent=error.message;
    }
  }
  input.oninput=()=>{ revision++; matches.replaceChildren(); clearTimeout(delay); delay=setTimeout(refresh,180); };
  input.onkeydown=event=>{ if (event.key==='Enter') {event.preventDefault();void refresh();} };
  const update=selectedState=>{
    if(state===selectedState)return;
    pending?.abort();resolver.replaceChildren();
    state=selectedState;chips();
    if (input.value) void refresh();
  };
  return Object.assign(update,{select,chips});
}
