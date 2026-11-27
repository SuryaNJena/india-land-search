import {parcelKey} from './core.mjs';
import {drawMap,newSheetView,zoomSheetView} from './maps.mjs';
import {runtime} from './runtime.mjs';
import {portals} from './portals.mjs';
import {mountVillageFinder} from './village-finder.mjs';
import {selectedPlaces} from './shared-villages.mjs';
import {geographyFor,geographyKey} from './state-geography.mjs';
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
      ${mode==='maps'&&geography?'<div data-state-atlas></div>':''}
      ${geography?.catalog?'<details class="live-location" data-state-villages open></details>':''}`+(live?`
      <p>Choose the official village. ${source.plotOnly?'Enter a plot number to highlight its location.':'Enter plot numbers from your record to highlight them.'}</p>
      <div data-state-levels class="toolbar"></div>
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
      </div>`:`<p>${escape(source?.reason||'Open the official viewer for cadastral maps and record details.')}</p>`);
    const chosenPlaces=()=>selectedPlaces().filter(candidate=>candidate.state===state);
    let place=chosenPlaces().at(-1), changeVillage, finder;
    const atlasRoot=get('[data-state-atlas]'), finderRoot=get('[data-state-villages]');
    const atlas=atlasRoot?mountLocationAtlas(atlasRoot,{onChoose:chosen=>finder?.select(chosen),onState}):null;
    if (finderRoot) {
      finder=mountVillageFinder(finderRoot,escape,(chosen,all)=>{
        place=chosen??all.at(-1);
        atlas?.show(all,state);
        changeVillage?.();
      },undefined,{onFilter:rows=>atlas?.show(rows.length?rows:chosenPlaces(),state)});
      finder(state);
    }
    atlas?.show(chosenPlaces(),state);
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
    changeVillage=()=>{
      levels.length=0;
      next(0);
    };
    const session=active={state,levels};
    const isCurrent=controller=>root.isConnected && root.contains(frame) && active===session && !controller.signal.aborted;
    const selectors=source.levels.map(label=>{
      const wrapper=document.createElement('label');
      wrapper.className='label';
      const select=document.createElement('select');
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
      load.hidden=index!==selectors.length;
      if (index===selectors.length) {status.textContent='';return;}
      status.textContent='Loading official locations…';
      try {
        const {options}=await requestStateMap({state,levels},controller.signal);
        if (!isCurrent(controller)) return;
        const select=selectors[index];
        select.replaceChildren(new Option('Choose '+source.levels[index].toLowerCase(),''),...options.map(item=>new Option(item.label,item.code)));
        select.parentElement.hidden=false;
        status.textContent=options.length?'':'The official source lists no locations here.';
        const label=source.levels[index];
        const name=label==='District'?place?.district:
          ['Tehsil','Subdivision','Circle'].includes(label)?place?.tehsil:
          ['Mauza','Village'].includes(label)?place?.village:'';
        const matched=name?options.filter(item=>geographyKey(item.label)===geographyKey(name)):[];
        if (matched.length===1) {
          select.value=matched[0].code;
          levels.push(select.value);
          next(index+1);
        }
      } catch (error) {
        if (isCurrent(controller)) status.textContent=error.message;
      }
    }
    selectors.forEach((select,i)=>select.onchange=()=>{
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
          status.textContent=map.features.length+' parcels · Official BhuNaksha';
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
