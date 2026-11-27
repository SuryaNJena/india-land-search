import {parcelKey} from './core.mjs';
import {drawMap,newSheetView,zoomSheetView} from './maps.mjs';
import {runtime} from './runtime.mjs';
import {portals} from './portals.mjs';
import {mountVillageFinder} from './village-finder.mjs';
import {placeKey,selectedPlaces} from './shared-villages.mjs';
import {geographyFor} from './state-geography.mjs';
import {matchOfficialLocation,officialVillagePath,suggestOfficialLocations} from './state-map-location.mjs';
import {mountLocationAtlas} from './location-atlas.mjs';
import {stateSources,stateSourcePath} from './state-sources.mjs';

export function statePortalLinks(state,tag) {
  if (!Object.hasOwn(stateSources,state)) return '';
  const source=stateSources[state];
  return tag(source.records,'Open '+source.recordLabel)+tag(source.map,'Open official parcel map');
}

async function requestStateMap(input,signal) {
  const url=new URL(stateSourcePath,runtime.apiBase||location.origin);
  const reply=await fetch(url,{method:'POST',credentials:'omit',signal,
    headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const data=await reply.json().catch(()=>null);
  if (!reply.ok || !data) throw Error(data?.error||'The official map is unavailable. Use the links below to continue.');
  return data;
}

function upRaster({gis,crs,bbox,width,height},id) {
  const url=new URL(id?'https://upbhunaksha.gov.in/bhunakshaserver/WMS':'https://upbhunaksha.gov.in/bhunakshaserver/WMS/tile');
  url.search=new URLSearchParams({SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetMap',FORMAT:'image/png',
    TRANSPARENT:'TRUE',LAYERS:id?'PLOT_LIST':'VILLAGE_MAP',STYLES:id?'PLOT_SELECTION':'VILLAGE_MAP',
    gis_code:gis,CRS:crs,WIDTH:width,HEIGHT:height,BBOX:bbox.join(','),...(id?{plot_id:id}:{})});
  return url.href;
}

export function mountStateMaps(root,{escape,tag,initialState,mode,onState}) {
  const get=selector=>root.querySelector(selector);
  let active,map,view,hits,selected,loadRequest,plotRequest;
  const panel=root;
  function choose(state) {
    loadRequest?.abort();plotRequest?.abort();active=null;
    const source=Object.hasOwn(stateSources,state)?stateSources[state]:undefined;
    const portal=portals.find(p=>p.name===state);
    const geography=geographyFor(state);
    const live=source?.levels && (runtime.hosted || runtime.apiBase);
    const links=source?statePortalLinks(state,tag)
      : portal?tag(portal.record,'Open '+portal.label)+(portal.map?tag(portal.map,'Open official parcel map'):''):'';
    panel.innerHTML=`<h2>${escape(state)} ${mode==='ror'?'records of rights':mode==='plots'?'plot records':'village maps'}</h2>
      <p class="actions">${links}</p>
      <label class="label active-village" data-active-village hidden>Active village<select></select></label>
      ${geography?.catalog?'<details class="live-location" data-state-villages></details>':''}`+(live?`
      <details class="live-location" data-state-location><summary>Official location</summary>
        <div data-state-levels class="toolbar"></div>
        <div class="actions" data-state-location-suggestions></div>
        <button type="button" class="plain-link" data-state-retry hidden>Retry official locations</button>
      </details>
      <button type="button" class="button secondary" data-state-load hidden>Load parcel map</button>
      <p role="status" data-state-status></p>
      <div data-state-canvas-box hidden>
        <form class="actions" data-state-find>
          <label class="label">${source.plotOnly?'Plot number':'Plot numbers'}<input name="plots" placeholder="${source.plotOnly?'e.g. 261':'e.g. 1, 25/2'}" maxlength="400"></label>
          <button class="button secondary" type="submit">${source.plotOnly?'Find plot':'Highlight plots'}</button>
        </form>
        <p role="status" data-state-highlight></p>
        <div class="map-frame state-raster" data-state-raster hidden><img alt="Official village parcel map"><img alt="" data-state-overlay hidden></div>
        <div class="map-frame bhu-interactive" ${source.plotOnly?'hidden':''}>
          <div class="actions bhu-map-zoom">
            <button class="button secondary" type="button" data-zoom="2" aria-label="Zoom in">+</button>
            <button class="button secondary" type="button" data-zoom=".5" aria-label="Zoom out">−</button>
            <button class="button secondary" type="button" data-zoom="1">Fit map</button>
          </div>
          <canvas width="1100" height="720" aria-label="Village parcel map. Use the plot-number field to select a parcel without the map."></canvas>
        </div>
        <section class="bhu-plot-info" data-state-plot role="status" hidden></section>
      </div>`:`<p>${escape(source?.reason||'Open the official viewer for cadastral maps and record details.')}</p>`)+
      (mode==='maps'&&geography?'<details class="live-location" data-state-reference><summary>Reference atlas</summary><div data-state-atlas></div></details>':'');
    const chosenPlaces=()=>selectedPlaces().filter(candidate=>candidate.state===state);
    let place=chosenPlaces().at(-1), changeVillage, finder;
    const activeVillage=get('[data-active-village]');
    const activePicker=activeVillage.querySelector('select');
    const atlasRoot=get('[data-state-atlas]'), finderRoot=get('[data-state-villages]');
    const atlas=atlasRoot?mountLocationAtlas(atlasRoot,{onChoose:chosen=>finder?.select(chosen),onState}):null;
    function showActivePlace(candidate) {
      place=candidate;
      const choices=chosenPlaces();
      activeVillage.hidden=choices.length<2;
      activePicker.replaceChildren(...choices.map(item=>new Option([item.village,item.tehsil,item.district].filter(Boolean).join(' · '),placeKey(item))));
      if (place) activePicker.value=placeKey(place);
      atlas?.show(place?[place]:[],state);
      changeVillage?.();
    }
    activePicker.onchange=()=>showActivePlace(chosenPlaces().find(item=>placeKey(item)===activePicker.value));
    if (finderRoot) {
      finderRoot.open=!place;
      finder=mountVillageFinder(finderRoot,escape,(chosen,all)=>{
        const retained=place && all.find(item=>placeKey(item)===placeKey(place));
        showActivePlace(chosen??retained??all.at(-1));
      },undefined,{onFilter:rows=>atlas?.show(rows.length?rows:chosenPlaces(),state)});
      finder(state);
    }
    const reference=get('[data-state-reference]');
    if (reference) {
      reference.open=!place;
      reference.ontoggle=()=>{if(reference.open)atlas.show(place?[place]:[],state);};
    }
    showActivePlace(place);
    if (!live) return;
    const labels=get('[data-state-levels]');
    const load=get('[data-state-load]'), status=get('[data-state-status]');
    const frame=get('[data-state-canvas-box]'), canvas=frame.querySelector('canvas');
    const detail=get('[data-state-plot]'), highlight=get('[data-state-highlight]');
    const form=get('[data-state-find]');
    const raster=get('[data-state-raster]');
    const rasterImage=raster.querySelector('img'), overlay=raster.querySelector('[data-state-overlay]');
    rasterImage.onerror=()=>{if (active===session && !frame.hidden) status.textContent='The official map image is unavailable. Use the official viewer link.';};
    overlay.onerror=()=>{if (active===session && !frame.hidden) highlight.textContent='The official plot highlight image is unavailable.';};
    const result=new Map();
    const levels=[];
    const locationDetails=get('[data-state-location]');
    const locationSummary=locationDetails.querySelector('summary');
    const suggestions=get('[data-state-location-suggestions]');
    const retry=get('[data-state-retry]');
    const menus=new Map();
    let followPlace=true;
    changeVillage=()=>{
      followPlace=true;
      levels.length=0;
      next(0);
    };
    const session=active={state,levels};
    const isCurrent=controller=>root.isConnected && root.contains(frame) && active===session && !controller.signal.aborted;
    const selectors=source.levels.map(label=>{
      const wrapper=document.createElement('label');
      wrapper.className='label';
      const select=document.createElement('select');
      select.setAttribute('aria-label',label);
      wrapper.append(label,select);wrapper.hidden=true;labels.append(wrapper);
      return select;
    });
    function redraw() {
      hits=drawMap(canvas,map.features,map.gis,result,{view,labels:view.zoom>=2,selected,selectionFill:true});
    }
    async function lookup(feature) {
      if (!feature?.properties.kide || !/^\d{1,12}(?:\/\d{1,12}){0,5}$/.test(feature.properties.kide)) return;
      plotRequest?.abort(); const controller=plotRequest=new AbortController();
      detail.hidden=false; detail.textContent='Loading official Plot Info…';
      try {
        const parcel=feature.properties;
        const value=await requestStateMap({state,levels,plot:parcel.kide},controller.signal);
        if (!isCurrent(controller)) return;
        if (value.gis!==map.gis || value.id!==parcel.id) throw Error('The official lookup returned a different parcel.');
        detail.innerHTML=`<h3>Plot ${escape(value.plot)}</h3><pre>${escape(value.info)}</pre>${tag(value.record,'Open official land record')}`;
      } catch (error) {
        if (isCurrent(controller)) detail.textContent=error.message;
      }
    }
    async function next(index) {
      loadRequest?.abort();plotRequest?.abort();
      const controller=loadRequest=new AbortController();
      frame.hidden=detail.hidden=true;
      for (const select of selectors.slice(index)) {select.parentElement.hidden=true;select.replaceChildren();}
      const names=selectors.slice(0,index).map(select=>select.selectedOptions[0]?.textContent).filter(Boolean);
      locationSummary.textContent=names.length?'Official location · '+names.join(' / '):'Official location';
      retry.hidden=true;
      suggestions.replaceChildren();
      retry.onclick=()=>next(index);
      load.hidden=index!==selectors.length;
      if (index===selectors.length) {
        status.textContent='';
        if (mode==='maps') await load.onclick();
        return;
      }
      status.textContent='Loading official locations…';
      try {
        const key=levels.join(',');
        const options=menus.get(key)??(await requestStateMap({state,levels},controller.signal)).options;
        if (!isCurrent(controller)) return;
        menus.set(key,options);
        const select=selectors[index];
        select.replaceChildren(new Option('Choose '+source.levels[index].toLowerCase(),''),...options.map(item=>new Option(item.label,item.code)));
        select.parentElement.hidden=false;
        status.textContent=options.length?'':'The official source lists no locations here.';
        const label=source.levels[index];
        const name=label==='District'?place?.district:
          ['Tehsil','Subdivision','Circle'].includes(label)?place?.tehsil:
          ['Mauza','Village'].includes(label)?place?.village:'';
        const matched=followPlace?matchOfficialLocation(options,officialVillagePath(place)[index],name):undefined;
        if (matched) {
          select.value=matched.code;
          levels.push(select.value);
          await next(index+1);
        } else {
          locationDetails.open=true;
          if (place && options.length) {
            status.textContent='Confirm the official '+label.toLowerCase()+' for '+place.village+'.';
            for(const candidate of suggestOfficialLocations(options,name)) {
              const button=document.createElement('button');
              button.type='button';button.className='button secondary';
              button.textContent='Use '+candidate.label;
              button.onclick=()=>{select.value=candidate.code;select.onchange();};
              suggestions.append(button);
            }
          }
        }
      } catch (error) {
        if (isCurrent(controller)) {locationDetails.open=true;status.textContent=error.message;retry.hidden=false;}
      }
    }
    selectors.forEach((select,i)=>select.onchange=()=>{
      followPlace=false;
      levels.length=i;
      if (select.value) {levels.push(select.value);next(i+1);}
      else next(i);
    });
    load.onclick=async()=>{
      loadRequest?.abort();plotRequest?.abort();
      const controller=loadRequest=new AbortController();
      frame.hidden=detail.hidden=true; load.disabled=true;
      status.textContent='Loading official parcel geometry…';
      try {
        const data=await requestStateMap({state,levels,map:true},controller.signal);
        if (!isCurrent(controller)) return;
        map=data;view=newSheetView();selected=undefined;result.clear();
        highlight.textContent='';form.reset();frame.hidden=false;
        if (source.plotOnly) {
          overlay.hidden=true; overlay.removeAttribute('src');
          raster.hidden=false;
          raster.style.maxWidth=map.width+'px';
          rasterImage.width=map.width;rasterImage.height=map.height;
          rasterImage.src=upRaster(map);
          status.textContent='Official UP BhuNaksha village map';
        } else {
          redraw();
          status.textContent=map.features.length+(map.features.length===1?' parcel':' parcels')+' · Official BhuNaksha';
        }
      } catch (error) {
        if (isCurrent(controller)) status.textContent=error.message;
      } finally {load.disabled=false;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();plotRequest?.abort();detail.hidden=true;
      const terms=new Set(form.elements.plots.value
        .replace(/[०-९]/g,d=>String(d.charCodeAt(0)-0x966)).split(/[\s,;]+/).filter(Boolean));
      if (source.plotOnly) {
        overlay.hidden=true;overlay.removeAttribute('src');
        if (terms.size!==1 || !/^\d{1,12}(?:\/\d{1,12}){0,5}$/.test([...terms][0]??'')) {
          highlight.textContent='Enter one plot number.';return;
        }
        const controller=plotRequest=new AbortController();
        highlight.textContent='Loading official Plot Info…';
        try {
          const value=await requestStateMap({state,levels,plot:[...terms][0]},controller.signal);
          if (!isCurrent(controller)) return;
          if (value.gis!==map.gis) throw Error('The official lookup returned a different village.');
          overlay.src=upRaster(map,value.id);overlay.hidden=false;
          highlight.textContent='Plot '+value.plot+' selected.';
          detail.hidden=false;
          detail.innerHTML='<h3>Plot '+escape(value.plot)+'</h3><pre>'+escape(value.info)+'</pre>'+tag(value.record,'Open UP Bhulekh');
        } catch (error) {
          if (isCurrent(controller)) highlight.textContent=error.message;
        }
        return;
      }
      const found=map.features.filter(feature=>terms.has(feature.properties.kide));
      selected=undefined;result.clear();
      for (const {properties} of found) result.set(parcelKey({gis:map.gis,id:properties.id}),{level:'full'});
      highlight.textContent=found.length+(found.length===1?' parcel highlighted.':' parcels highlighted.');
      redraw();
      if (terms.size===1 && found.length===1) lookup(found[0]);
    };
    canvas.onclick=event=>{
      const bounds=canvas.getBoundingClientRect(), context=canvas.getContext('2d');
      const x=(event.clientX-bounds.left)*canvas.width/bounds.width;
      const y=(event.clientY-bounds.top)*canvas.height/bounds.height;
      const hit=hits.findLast(({path})=>context.isPointInPath(path,x,y,'evenodd'));
      if (hit) {selected=hit.key;redraw();lookup(hit.feature);}
    };
    for (const button of frame.querySelectorAll('[data-zoom]')) button.onclick=()=>{
      const factor=Number(button.dataset.zoom);
      view=factor===1?newSheetView():zoomSheetView(view,factor,[canvas.width/2,canvas.height/2],canvas.width,canvas.height);
      redraw();
    };
    next(0);
  }
  choose(initialState);
}
