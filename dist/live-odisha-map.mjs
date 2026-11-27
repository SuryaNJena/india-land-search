import {drawMap,makeMapPDF,mapViewLimit,newSheetView,panSheetView,parcelFocus,sheetProjection,zoomSheetView} from './maps.mjs';
import {extractCaste,matchRows,normalize} from './core.mjs';
import {download} from './files.mjs';
import {localMapLayer,plotNumber,sheetHighlights} from './sheet-overlays.mjs';
import {mapImageURL,mapLocation,officialPlotURL,postOdisha,readExactPlot,safeMapRaster} from './odisha-lookup-source.mjs';

const limit=12;
const asciiName=name=>/[\u0b00-\u0b7f]/u.test(name) && globalThis.Sanscript ? globalThis.Sanscript.t(name,'oriya','iso').normalize('NFD').replace(/[^\x20-\x7e]/g,'') : name;

export function mountLiveOdishaMap(root,locations,escape,tag,matchedPlots=new Map(),matchedHoldings=new Map(),searchNames=[],options={}) {
  const {initialMap,initialSheet,localSheets,onSave,onGeography,onRevenue,showVillage=true}=options;
  const isLocal=Boolean(initialMap || localSheets);
  root.innerHTML=`<summary>BhuNaksha village map</summary>
    <div class="toolbar"><label class="label" ${showVillage?'':'hidden'}>Village<select id="bhu-village">${locations.map((place,i)=>`<option value="${i}">${escape(place.village)} · ${escape(place.tehsil)}</option>`).join('')}</select></label>
    <label class="label">Sheet<select id="bhu-sheet" disabled></select></label></div>
    <div data-roR-plots></div><p id="bhu-match-status" role="status"></p>
    <div id="bhu-discovery" hidden><span data-progress role="status"></span>
      <button type="button" class="plain-link" data-scan-control><span aria-hidden="true">Ⅱ</span> <span>Pause</span></button>
      <progress aria-label="Parcel check progress" value="0" max="1"></progress></div>
    <p data-bhu-save-status role="status" hidden></p>
    <p id="bhu-status" role="status"></p>
    <button class="plain-link" type="button" id="bhu-retry" hidden>Retry map</button>
    <div id="bhu-canvas-frame" hidden>
      <div class="bhu-controls">
        <form id="bhu-find" class="actions">
          <label class="sr-only" for="bhu-number">Plot number on this sheet</label>
          <input id="bhu-number" type="search" maxlength="80" placeholder="Plot number, e.g. 12/3" required>
          <button class="button secondary" type="submit">Find plot</button>
        </form>
      </div>
      <p id="bhu-find-status" role="status"></p>
      <div id="bhu-find-results" class="actions"></div>
      <div class="bhu-map-review">
        <div class="map-frame bhu-interactive">
          <div class="actions bhu-map-zoom" role="group" aria-label="Map zoom">
            <button class="button secondary" id="bhu-zoom-in" type="button" aria-label="Zoom in">+</button>
            <button class="button secondary" id="bhu-zoom-out" type="button" aria-label="Zoom out">−</button>
            <button class="button secondary" id="bhu-fit" type="button">Fit sheet</button>
            <output id="bhu-zoom">100%</output>
          </div>
          <canvas id="bhu-canvas" width="1100" height="720" tabindex="0"
          aria-label="BhuNaksha parcel map. Drag or use the arrow keys to pan. Use plus and minus to zoom. Click a parcel or use Find plot for Plot Info."></canvas></div>
        <section id="bhu-plot-info" class="bhu-plot-info" aria-label="Plot Info" aria-live="polite" hidden></section>
      </div>
      <div class="legend"><span><i class="bhu-selected-swatch"></i>Selected plot</span><span><i class="bhu-matched-swatch"></i>Name in Plot Info</span><span><i class="bhu-khata-swatch" style="background:white;border:2px solid #7c54ad"></i>Listed in matching khata</span><span>Plot numbers appear from 200% zoom when there is room.</span></div>
    </div>
    <div class="actions" id="bhu-map-actions" hidden>
      <button class="button secondary" type="button" id="bhu-export">Download this sheet PDF</button>
      <button class="button secondary" type="button" id="bhu-export-village">Download matched village sheets PDF</button>
    </div>
    <details class="live-location" id="bhu-layers" hidden><summary>Official BhuNaksha layers</summary>
      <p data-layer-status role="status"></p>
      <label class="label" hidden>Native map layer<select data-layer-picker></select></label>
      <div data-layer-images></div>
    </details>
    ${onGeography?`<details class="live-location" data-atlas-controls hidden><summary>Parcel overlay on the atlas</summary>
      <label class="label">Add this sheet’s WGS84 parcel GeoJSON<input data-atlas-geojson type="file" accept=".geojson,.json,application/geo+json,application/json"></label>
      <button type="button" class="button secondary" data-atlas-raster>Check for an official geographic layer</button>
      <button type="button" class="button secondary" data-atlas-view>Show atlas</button>
      <p role="status" data-atlas-feedback></p></details>`:''}
    <p class="actions">${tag('https://bhunakshaodisha.nic.in/','Open official BhuNaksha portal')}${tag('https://www.odishakyl.in/mapview.php','Open ORSAC cadastral basemap')}</p>`;
  const get=id=>root.querySelector('#'+id);
  const village=get('bhu-village'), sheet=get('bhu-sheet'), status=get('bhu-status');
  const canvas=get('bhu-canvas'), frame=get('bhu-canvas-frame'), retry=get('bhu-retry');
  const actions=get('bhu-map-actions'), exportSheet=get('bhu-export'), exportVillage=get('bhu-export-village');
  const plotBox=root.querySelector('[data-ror-plots]'), matchStatus=get('bhu-match-status');
  const atlasControls=root.querySelector('[data-atlas-controls]');
  const userLayers=new Map();
  let lastAtlas;
  const currentPlace=()=>locations[Number(village.value)];
  const fromRoR=new Map(), documents=new Map(), responses=new Map();
  const layerDetails=get('bhu-layers');
  const layerStatus=layerDetails.querySelector('[data-layer-status]');
  const layerPicker=layerDetails.querySelector('[data-layer-picker]');
  const layerImages=layerDetails.querySelector('[data-layer-images]');
  const saveStatus=root.querySelector('[data-bhu-save-status]');
  if (isLocal && initialSheet) {
    const codes=Object.keys(localSheets??{[initialSheet]:initialMap}).sort((a,b)=>Number(a)-Number(b));
    sheet.replaceChildren(...codes.map(code=>new Option(code,code)));
    sheet.value=initialSheet;
    for (const code of codes) responses.set(locations[0].id+'/'+code,localSheets?.[code]??initialMap);
  }
  let mapLayers, layerRequest;
  async function remember(entry) {
    if (!onSave) return;
    try {await onSave(entry);}
    catch(error) {
      if (root.isConnected) {
        saveStatus.hidden=false;
        saveStatus.textContent='The lookup is available, but it could not be saved to Workspace.';
      }
    }
  }
  const zoomIn=get('bhu-zoom-in'), zoomOut=get('bhu-zoom-out'), fitButton=get('bhu-fit');
  const plotInfo=get('bhu-plot-info');
  const details=new Map(), verifiedPlots=new Set(), verifiedVillages=new Set(), autoAttempted=new Set();
  const checkedParcels=new Set(), discoveredNumbers=new Map(), parcelRequests=new Map();
  const discovery=get('bhu-discovery'), progress=discovery.querySelector('[data-progress]');
  const scanControl=discovery.querySelector('button');
  let scanVersion=0, nextParcelStart=0, scheduleQueue=Promise.resolve();
  let view=newSheetView(), projection, selected, mapFrame=0, loadingPlot=false, plotError='';
  let pending, plotRequest, exportRequest, geometry, paths=[], loaded=false, busyExport=false;
  const selectedKey=()=>selected && geometry ? geometry.gis+'/'+selected.properties.id : '';
  const hasHighlights=place=>getNumbers(place).size>0 || verifiedVillages.has(place.id);

  async function request(place,sheetCode,signal) {
    const key=place.id+'/'+sheetCode;
    if (responses.has(key)) return responses.get(key);
    if (isLocal) throw Error('No local map is available for this sheet.');
    const location=[place.districtCode,place.tehsilCode,place.villageCode,place.riCode].join('-');
    const data=await postOdisha('maps',{location,sheet:sheetCode},signal);
    if (responses.size>=36) responses.delete(responses.keys().next().value);
    responses.set(key,data);
    return data;
  }

  const getNumbers=place=>new Set([...(matchedPlots.get(place.id)??[]),...(fromRoR.get(place.id)??[]),
    ...(discoveredNumbers.get(place.id)??[])].map(plotNumber).filter(Boolean));

  function paintLayer() {
    layerImages.replaceChildren();
    if (!mapLayers || !layerPicker.value) return;
    const layer=mapLayers.layers[Number(layerPicker.value)];
    const layerURL=safeMapRaster(layer?.url,geometry.gis);
    if (!layerURL) return;
    const base=new Image(), overlay=new Image(), frame=document.createElement('div');
    base.alt='Official native cadastral sheet';
    overlay.alt=layer.label;
    overlay.className='bhu-native-overlay';
    frame.className='bhu-native-layer-frame';
    frame.append(base,overlay);
    layerImages.append(frame);
    base.src=safeMapRaster(mapLayers.nativeRaster,geometry.gis) || mapImageURL(currentPlace(),geometry.sheet,mapLayers.bounds);
    overlay.src=layerURL;
    overlay.onerror=()=>{if (overlay.isConnected) layerStatus.textContent='The selected official layer image is unavailable.';};
  }

  async function loadLayers() {
    if (!geometry || mapLayers || layerRequest || (isLocal && !geometry.layerCatalog)) return;
    const current=geometry, place=currentPlace(), abort=new AbortController();
    layerRequest=abort;
    layerStatus.textContent='Loading official layers…';
    try {
      const next=isLocal ? current.layerCatalog : await postOdisha('maps',{location:mapLocation(place),sheet:current.sheet,layers:true},abort.signal);
      if (abort.signal.aborted || !root.isConnected || geometry!==current) return;
      mapLayers={...next,layers:(Array.isArray(next.layers)?next.layers:[])
        .filter(layer=>safeMapRaster(layer?.url,current.gis))};
      layerPicker.replaceChildren(new Option('Choose a layer',''),...mapLayers.layers.map((layer,index)=>
        new Option((layer.kind==='theme'?'Theme':layer.kind==='derived'?'Derived':'Overlay')+' · '+layer.label,String(index))));
      layerPicker.parentElement.hidden=!mapLayers.layers.length;
      publishGeography();
      layerStatus.textContent=mapLayers.layers.length?'Layers are drawn over the official native sheet.':'BhuNaksha did not list optional layers for this sheet.';
    } catch(error) {
      if (!abort.signal.aborted && geometry===current) layerStatus.textContent=error.message;
    } finally {
      if (layerRequest===abort) layerRequest=undefined;
    }
  }
  layerPicker.onchange=paintLayer;
  layerDetails.ontoggle=()=>{if (layerDetails.open) void loadLayers();};

  function publishGeography(highlights) {
    if (!onGeography || !geometry || !root.isConnected || !root.open) return;
    const current=geometry;
    const geographic=userLayers.get(current.gis)??current.geographic;
    const raster=mapLayers?.geographicRaster;
    const url=safeMapRaster(raster?.url,current.gis);
    const matches=highlights??sheetHighlights(current,getNumbers(currentPlace()),verifiedPlots);
    const parcelMatches=new Map((geographic?.features??[]).flatMap(({properties:{id}})=>{
      const match=matches.get(current.gis+'/'+id);
      return match?[[String(id),match]]:[];
    }));
    if(lastAtlas?.key===current.gis && lastAtlas.geographic===geographic && lastAtlas.raster?.url===url &&
      lastAtlas.highlights.size===parcelMatches.size &&
      [...parcelMatches].every(([id,match])=>lastAtlas.highlights.get(id)?.level===match.level)) return;
    lastAtlas={
      key:current.gis,geographic,raster:url&&raster.projection==='EPSG:3857'?{...raster,url}:undefined,
      highlights:parcelMatches,
      onSelect:id=>{
        if (geometry!==current || !root.open) return;
        const feature=current.features.find(f=>String(f.properties.id)===String(id));
        if(feature){selectPlot(feature);plotInfo.scrollIntoView({block:'nearest'});}
      }
    };
    onGeography(lastAtlas);
  }

  if(atlasControls){
    const feedback=atlasControls.querySelector('[data-atlas-feedback]');
    atlasControls.querySelector('[data-atlas-view]').onclick=()=>{
      onGeography.show?.();
    };
    atlasControls.querySelector('[data-atlas-raster]').onclick=async()=>{
      const current=geometry;
      if(!current)return;
      feedback.textContent='Checking BhuNaksha…';
      await loadLayers();
      if(current===geometry)feedback.textContent=mapLayers?.geographicRaster?'Official geographic layer found.':layerStatus.textContent||'Geographic layer unavailable.';
    };
    atlasControls.querySelector('[data-atlas-geojson]').onchange=async event=>{
      const input=event.currentTarget,current=geometry,file=input.files[0];
      input.value='';
      if(!file||!current)return;
      try{
        if(file.size>8*1024*1024)throw Error('Choose a GeoJSON file no larger than 8 MB.');
        const layer=localMapLayer(JSON.parse(await file.text()),current);
        if(current!==geometry)return;
        userLayers.set(current.gis,layer);
        publishGeography();
        feedback.textContent=layer.features.length+' parcels added to the atlas.';
      }catch(error){if(current===geometry)feedback.textContent=error.message;}
    };
  }

  function render() {
    if (!geometry) return;
    const highlights=sheetHighlights(geometry,getNumbers(currentPlace()),verifiedPlots);
    paths=drawMap(canvas,geometry.features,geometry.gis,highlights,{project:projection,view,
      labels:view.zoom>=2,labelScale:canvas.clientWidth/canvas.width,plain:!highlights.size,
      selected:selectedKey(),selectionFill:true});
    get('bhu-zoom').value=Math.round(view.zoom*100)+'%';
    zoomIn.disabled=view.zoom>=mapViewLimit;
    zoomOut.disabled=view.zoom<=1;
    fitButton.disabled=view.zoom<=1;
    exportSheet.disabled=busyExport;
    exportVillage.disabled=busyExport||!hasHighlights(currentPlace());
    const capture=geometry.captured?`Saved BhuNaksha copy · ${geometry.captured}. `:'';
    const revision=geometry.sourceUpdated?` Source updated ${geometry.sourceUpdated}.`:'';
    const direct=[...highlights.values()].filter(hit=>hit.level==='full').length;
    const message=`${capture}${geometry.features.length} mapped parcels · ${direct} direct ${direct===1?'match':'matches'} · ${highlights.size-direct} khata-only on sheet ${geometry.sheet}.${
      selected?.properties.kide?` Selected plot ${selected.properties.kide}.`:''}${revision}`;
    if (status.textContent!==message) status.textContent=message;
    publishGeography(highlights);
  }

  function showPlotInfo() {
    plotInfo.hidden=!selected;
    if (!selected) return;
    const number=selected.properties.kide;
    const key=selectedKey();
    const entry=details.get(key);
    const level=sheetHighlights(geometry,getNumbers(currentPlace()),verifiedPlots).get(key)?.level;
    const heading='<h3>Plot Info · '+escape(number||'Unnumbered parcel')+'</h3>';
    const match=level==='full'?'<p class="bhu-plot-match">Search match'+(entry?.matches.length?' · '+escape(entry.matches.join(', ')):'')+'</p>':
      level==='holding'?'<p class="bhu-plot-match">Listed in a matching khata</p>':'';
    if (!number) {
      plotInfo.innerHTML=heading+'<p>BhuNaksha did not supply a plot number for this parcel.</p>';
    } else if (plotError) {
      const guidance=plotError.portal
        ? '<p>In BhuNaksha, select '+escape(currentPlace().village)+', sheet '+escape(geometry.sheet)+', then search for plot '+escape(number)+'.</p>'
        : '';
      plotInfo.innerHTML=heading+match+'<p>'+escape(plotError.message)+'</p>'+guidance+
        '<div class="actions"><button type="button" class="plain-link" data-retry-plot>Retry Plot Info</button>'+
        tag(plotError.portal,'Open official BhuNaksha viewer')+'</div>';
      plotInfo.querySelector('[data-retry-plot]').onclick=()=>{plotError='';showPlotInfo();void loadSelectedPlot();};
    } else if (!entry && isLocal) {
      plotInfo.innerHTML=heading+match+'<p class="actions">'+
        tag(officialPlotURL(currentPlace(),geometry.sheet,number),'Open official Plot Info')+'</p>'+
        '<label class="label">Add the official Plot Info JSON<input type="file" accept=".json,application/json"></label>'+
        '<p data-plot-import-status role="status"></p>';
      plotInfo.querySelector('input').onchange=async event=>{
        const file=event.target.files[0];
        if (!file) return;
        const sheet=geometry.sheet, place=currentPlace(), expected=selected.properties.id;
        try {
          if (file.size>256*1024) throw Error('Choose a Plot Info response under 256 KB.');
          const data=readExactPlot(JSON.parse(await file.text()),place,sheet,number);
          if (key!==selectedKey() || !root.isConnected) return;
          if (data.id!==expected) throw Error('This Plot Info belongs to a different parcel or map version.');
          const matches=matchRows([{status:'Retrieved',info:data.info}],{names:searchNames})[0].full;
          details.set(key,{data,matches});
          if (matches.length) {
            verifiedPlots.add(key);verifiedVillages.add(place.id);render();
          }
          showPlotInfo();
          void remember({kind:'plot',place,sheet,number,data});
        } catch(error) {
          if (key===selectedKey()) plotInfo.querySelector('[data-plot-import-status]').textContent=error.message;
        }
      };
    } else if (!entry) {
      plotInfo.innerHTML=heading+match+'<p>Loading the official Plot Info…</p>';
    } else {
      const {data}=entry;
      const caste=extractCaste(data.info).raw;
      const parentName=entry.matches.some(name=>normalize(data.info).split(/(?:ପି|ପିତା|parent)\s*[:ଃ]\s*/u).slice(1)
        .some(fragment=>normalize(fragment).startsWith(normalize(name))));
      plotInfo.innerHTML=heading+match+
        (parentName?'<p>Name appears in the parent field.</p>':'')+
        (!entry.matches.length && searchNames.length && data.info?'<p>Checked · no name match in this parcel’s Plot Info.</p>':'')+
        (data.info?'<p class="bhu-plot-source">'+escape(data.info)+'</p>':'<p>BhuNaksha returned no source text for this parcel.</p>')+
        (caste?'<details><summary>Jaati · as recorded</summary><p>'+escape(caste)+'</p></details>':'')+
        (data.area?'<p>'+escape(data.area)+'</p>':'')+
        '<div class="actions">'+(data.khata?'<span>Khata '+escape(data.khata)+'</span>':'')+
        tag(data.front,'RoR front')+tag(data.back,'RoR back')+
        (data.khata&&onRevenue?'<button type="button" class="plain-link" data-bhu-revenue>Land revenue</button>':'')+'</div>';
      plotInfo.querySelector('[data-bhu-revenue]')?.addEventListener('click',()=>onRevenue({place:currentPlace(),khata:data.khata}));
    }
  }

  function readParcel(place,current,plot) {
    const key=current.gis+'/'+plot.id;
    if (details.has(key)) return Promise.resolve(details.get(key));
    if (parcelRequests.has(key)) return parcelRequests.get(key);
    if (parcelRequests.size>=2) {
      return Promise.race([...parcelRequests.values()].map(pending=>pending.catch(()=>{})))
        .then(()=>readParcel(place,current,plot));
    }
    const request=(async()=>{
      const data=await postOdisha('maps',{location:mapLocation(place),sheet:current.sheet,parcel:{id:plot.id,number:plot.kide}});
      const matches=matchRows([{status:'Retrieved',info:data.info}],{names:searchNames})[0].full;
      if (details.size>=100) details.delete(details.keys().next().value);
      details.set(key,{data,matches});
      if (matches.length) {
        verifiedPlots.add(key);
        verifiedVillages.add(place.id);
        if (geometry===current && root.isConnected) render();
      }
      return {data,matches};
    })().finally(()=>parcelRequests.delete(key));
    parcelRequests.set(key,request);
    return request;
  }

  async function loadSelectedPlot() {
    if (isLocal || loadingPlot || !selected?.properties.kide) return;
    const key=selectedKey(), place=currentPlace(), plot=selected.properties, current=geometry;
    loadingPlot=true;
    try {
      const {data}=await readParcel(place,current,plot);
      if (root.isConnected) void remember({kind:'plot',place,sheet:current.sheet,number:plot.kide,
        data:{...data,id:plot.id,number:plot.kide}});
    } catch (error) {
      if (selectedKey()===key) plotError={
        message:error instanceof SyntaxError?'The Plot Info response could not be read.':error.message,
        portal:error.portal
      };
    } finally {
      loadingPlot=false;
      if (!root.isConnected) return;
      showPlotInfo();
      if (selectedKey()!==key) void loadSelectedPlot();
    }
  }

  async function scanSheet() {
    const version=++scanVersion, visible=geometry, visiblePlace=currentPlace();
    if (!visible || isLocal || !searchNames.length || !root.open) return;
    let stopped=false, unavailable=0, failures=0, known=0, checked=0, sheetLabel='';
    const active=()=>!stopped && version===scanVersion && geometry===visible && root.open && root.isConnected;
    const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
    const order=new Intl.Collator('en',{numeric:true});
    const bar=discovery.querySelector('progress');
    const [icon,label]=scanControl.children;
    const inFlight=new Set();
    discovery.hidden=scanControl.hidden=false;
    icon.textContent='Ⅱ';label.textContent='Pause';scanControl.disabled=false;
    scanControl.onclick=()=>finish('Paused.',true);
    function update(message) {
      bar.max=Math.max(known,1);
      bar.value=checked;
      progress.textContent=(known?`${checked} of ${known} queued parcels checked · `:'')+message;
    }
    function finish(message,resume,retryAfter=0) {
      if(!active())return;
      stopped=true;
      update(message);
      scanControl.hidden=!resume;
      icon.textContent='▶';label.textContent='Resume checking';
      scanControl.onclick=()=>void scanSheet();
      if(retryAfter>0){
        scanControl.disabled=true;
        setTimeout(()=>{if(version===scanVersion)scanControl.disabled=false;},Math.min(2147483647,retryAfter*1000));
      }
    }

    async function check(place,current,plot) {
      const key=current.gis+'/'+plot.id;
      if(checkedParcels.has(key)){checked++;return;}
      const start=Math.max(Date.now(),nextParcelStart);
      nextParcelStart=start+1100;
      await wait(start-Date.now());
      if(!active())return;
      try {
        const {data,matches}=await readParcel(place,current,plot);
        if(!active())return;
        if(matches.length && data.khata && !matchedHoldings.get(place.id)?.includes(data.khata)){
          const schedule=scheduleQueue.then(async()=>{
            if(!active())return;
            const docKey=place.id+'/'+data.khata;
            if(!documents.has(docKey)){
              const report=await postOdisha('ror',{location:place.id,khata:data.khata,side:'back',plots:true});
              documents.set(docKey,report.plots);
              await wait(1100);
            }
            if(!active())return;
            const numbers=discoveredNumbers.get(place.id)??new Set();
            for(const number of documents.get(docKey))numbers.add(plotNumber(number));
            discoveredNumbers.set(place.id,numbers);
            render();showPlotInfo();
          });
          scheduleQueue=schedule.catch(()=>{});
          await schedule;
        }
        if(!active())return;
        checkedParcels.add(key);
        failures=0;checked++;
        update(sheetLabel);
      }catch(error){
        if(!active())return;
        if(error.status===404 || error.status===502 && ++failures<3){unavailable++;return;}
        finish(error.message,true,error.status===429?(error.retryAfter??30):0);
      }
    }

    update('Loading sheet inventory…');
    while(plotRequest && active())await wait(250);
    try{
      for(const place of [visiblePlace,...locations.filter(p=>p.id!==visiblePlace.id)]){
        if(!active())return;
        const directory=(await request(place,'',undefined)).sheets??[];
        const sheets=place===visiblePlace?[visible.sheet,...directory.filter(code=>code!==visible.sheet)]:directory;
        for(const code of sheets){
          if(!active())return;
          const current=place===visiblePlace && code===visible.sheet?visible:await request(place,code,undefined);
          if(!active())return;
          const plots=current.features.map(f=>f.properties).filter(p=>p.kide).sort((a,b)=>order.compare(a.kide,b.kide));
          known+=plots.length;
          sheetLabel=place.village+' · Sheet '+current.sheet;
          update(sheetLabel);
          for(const plot of plots){
            if(inFlight.size>=2)await Promise.race(inFlight);
            if(!active())return;
            const task=check(place,current,plot).finally(()=>inFlight.delete(task));
            inFlight.add(task);
          }
          if(inFlight.size>=2)await Promise.race(inFlight);
        }
      }
      await Promise.all(inFlight);
      finish(unavailable?`Plot Info unavailable for ${unavailable}.`:'Sheet checks complete.',unavailable>0);
    }catch(error){finish(error.message,true,error.status===429?(error.retryAfter??30):0);}
  }

  function selectPlot(feature,focus=false) {
    selected=feature;
    plotError='';
    if (focus && projection) {
      const target=parcelFocus(feature,projection);
      const scale=Math.max(1,Math.min(10,canvas.width*.55/target.width,canvas.height*.55/target.height));
      view=panSheetView({zoom:scale,x:canvas.width/2-target.x*scale,y:canvas.height/2-target.y*scale},0,0,canvas.width,canvas.height);
    }
    showPlotInfo();
    render();
    void loadSelectedPlot();
  }

  function showHoldings() {
    const place=currentPlace();
    const khatas=[...new Set(matchedHoldings.get(place.id)??[])];
    plotBox.innerHTML=khatas.length?`<details><summary>Choose matching khatas to highlight</summary>
      <div class="bhu-khatas">${khatas.map((khata,i)=>`<label class="check"><input type="checkbox" value="${i}" ${khatas.length<=limit?'checked':''}> Khata ${escape(khata)}</label>`).join('')}</div>
      <button class="button secondary" data-load-plots type="button">Highlight plots from Bhulekh RoR</button></details>`:'';
    matchStatus.textContent=getNumbers(place).size?`${getNumbers(place).size} plot numbers from the selected land records.`:'';
    const button=plotBox.querySelector('[data-load-plots]');
    if (!button) return;
    button.onclick=()=>void loadHoldingPlots([...plotBox.querySelectorAll('input:checked')].map(box=>khatas[Number(box.value)]));
    if (khatas.length<=limit && !autoAttempted.has(place.id)) {
      autoAttempted.add(place.id);
      void loadHoldingPlots(khatas);
    }

    async function loadHoldingPlots(chosen) {
      if (!chosen.length || chosen.length>limit) {
        matchStatus.textContent=`Choose between 1 and ${limit} matching khatas.`;
        return;
      }
      plotRequest?.abort();
      const abort=new AbortController();
      plotRequest=abort;
      button.disabled=true;
      const numbers=new Set();
      let checked=0, issue='';
      try {
        for (const khata of chosen) {
          const key=place.id+'/'+khata;
          let plots=documents.get(key);
          if (!plots) {
            matchStatus.textContent=`Loading the official plot schedule for khata ${khata}…`;
            const data=await postOdisha('ror',{location:place.id,khata,side:'back',plots:true},abort.signal);
            plots=data.plots;
            documents.set(key,plots);
            if (checked+1<chosen.length) await new Promise(resolve=>setTimeout(resolve,1100));
            if (abort.signal.aborted) return;
          }
          checked++;
          for (const plot of plots) numbers.add(plotNumber(plot));
        }
      } catch (error) { issue=error.message; }
      finally {
        if (plotRequest===abort) plotRequest=undefined;
        button.disabled=false;
        if (!abort.signal.aborted) {
          fromRoR.set(place.id,numbers);
          matchStatus.textContent=`${checked} of ${chosen.length} khatas checked · ${numbers.size} plot ${numbers.size===1?'number':'numbers'}.${issue?' '+issue:''}`;
          render();
          showPlotInfo();
        }
      }
    }
  }

  async function load(sheetCode) {
    ++scanVersion;
    discovery.hidden=true;
    pending?.abort();
    const abort = new AbortController();
    pending=abort;
    const place=currentPlace();
    layerRequest?.abort();
    layerRequest=undefined;
    mapLayers=undefined;
    layerPicker.parentElement.hidden=true;
    layerDetails.hidden=true;
    layerImages.replaceChildren();
    layerStatus.textContent='';
    geometry=null;
    if(atlasControls){atlasControls.hidden=true;atlasControls.querySelector('[data-atlas-feedback]').textContent='';}
    lastAtlas=undefined;onGeography?.();
    selected=null;
    paths=[];
    view=newSheetView();
    showPlotInfo();
    get('bhu-number').value='';
    findResults.replaceChildren();
    findStatus.textContent='';
    frame.hidden=true;
    sheet.disabled=true;
    retry.hidden=true;
    actions.hidden=true;
    status.textContent=`Loading ${sheetCode?`sheet ${sheetCode}`:'map sheets'} from BhuNaksha…`;
    try {
      if (!sheetCode) {
        const directory=await request(place,'',abort.signal);
        if (!directory.sheets?.length) throw Error('BhuNaksha returned no sheets for this village.');
        if (abort.signal.aborted) return;
        sheet.innerHTML=directory.sheets.map(code=>`<option>${escape(code)}</option>`).join('');
        sheetCode=sheet.value;
      }
      const next=await request(place,sheetCode,abort.signal);
      if (abort.signal.aborted) return;
      geometry=next;
      projection=sheetProjection(next.features,canvas);
      frame.hidden=false;
      actions.hidden=false;
      layerDetails.hidden=isLocal&&!next.layerCatalog;
      if(atlasControls)atlasControls.hidden=false;
      render();
      void scanSheet();
      if (layerDetails.open) void loadLayers();
      if (root.isConnected && (!initialMap || next!==initialMap)) void remember({kind:'map',place,sheet:next.sheet,data:next});
    } catch(error) {
      if (!abort.signal.aborted) {
        status.textContent=error instanceof SyntaxError?'India Land Search could not load the BhuNaksha map. Open the official portal below.':error.message;
        retry.hidden=false;
      }
    } finally {
      if (!abort.signal.aborted) sheet.disabled=!sheet.options.length;
    }
  }

  async function exportPDF(all) {
    if (busyExport || !geometry) return;
    const place=currentPlace(), numbers=getNumbers(place);
    exportRequest?.abort();
    const abort=new AbortController();
    exportRequest=abort;
    busyExport=true;
    render();
    const sheets=[], maps={}, highlights=new Map();
    try {
      const codes=all?[...sheet.options].map(option=>option.value):[geometry.sheet];
      for (const code of codes) {
        status.textContent=`Checking sheet ${code} for the map PDF…`;
        const data=await request(place,code,abort.signal);
        const match=sheetHighlights(data,numbers,verifiedPlots);
        if (all && !match.size) continue;
        sheets.push({gis:data.gis,sheet:data.sheet,name:asciiName(place.village),village:place.villageCode,source:'BhuNaksha',captured:data.captured});
        maps[data.gis]=data;
        for (const [key,value] of match) highlights.set(key,value);
      }
      if (!sheets.length) throw Error('No RoR-matched plots appear on the available village sheets.');
      const pdf=await makeMapPDF(sheets,maps,highlights,!highlights.size);
      if (abort.signal.aborted) return;
      download(`India_Land_Search_${place.id}_${all?'matched-sheets':'sheet-'+sheets[0].sheet}.pdf`,pdf,'application/pdf');
      status.textContent=`Downloaded ${sheets.length} map overview ${sheets.length===1?'page':'pages'}.`;
    } catch(error) {
      if (!abort.signal.aborted) status.textContent=error.message;
    } finally {
      if (!abort.signal.aborted) {
        busyExport=false;
        exportSheet.disabled=false;
        exportVillage.disabled=!hasHighlights(place);
      }
    }
  }

  root.ontoggle=()=>{
    if (!root.open) {++scanVersion;lastAtlas=undefined;onGeography?.();return;}
    publishGeography();
    if (!loaded) {loaded=true;showHoldings();void load(initialSheet);}
    else if (geometry) void scanSheet();
  };
  if (root.open) queueMicrotask(()=>root.ontoggle());
  village.onchange=()=>{plotRequest?.abort();exportRequest?.abort();busyExport=false;sheet.replaceChildren();showHoldings();void load();};
  sheet.onchange=()=>{exportRequest?.abort();busyExport=false;void load(sheet.value);};
  retry.onclick=()=>void load(sheet.value);
  exportSheet.onclick=()=>void exportPDF(false);
  exportVillage.onclick=()=>void exportPDF(true);
  function scheduleRender() {
    if (!mapFrame) mapFrame=requestAnimationFrame(()=>{mapFrame=0;render();});
  }
  function zoom(factor,point=[canvas.width/2,canvas.height/2]) {
    view=zoomSheetView(view,factor,point,canvas.width,canvas.height);
    scheduleRender();
  }
  function pan(dx,dy) {
    view=panSheetView(view,dx,dy,canvas.width,canvas.height);
    scheduleRender();
  }
  function mapPoint(event) {
    const bounds=canvas.getBoundingClientRect();
    return [(event.clientX-bounds.left)*canvas.width/bounds.width,(event.clientY-bounds.top)*canvas.height/bounds.height];
  }
  zoomIn.onclick=()=>zoom(Math.SQRT2);
  zoomOut.onclick=()=>zoom(Math.SQRT1_2);
  fitButton.onclick=()=>{view=newSheetView();scheduleRender();};
  const findResults=get('bhu-find-results'), findStatus=get('bhu-find-status');
  get('bhu-find').onsubmit=event=>{
    event.preventDefault();
    const number=plotNumber(get('bhu-number').value);
    const matches=number && geometry ? geometry.features.filter(feature=>plotNumber(feature.properties.kide)===number) : [];
    findResults.replaceChildren();
    findStatus.textContent=matches.length===1?'':matches.length>1
      ? 'This sheet has several parcels with that number. Choose a parcel to inspect.'
      : 'No exact plot number on this sheet.';
    if (matches.length===1) selectPlot(matches[0],true);
    if (matches.length>1) matches.forEach((feature,i)=>{
      const button=document.createElement('button');
      button.className='button secondary';
      button.type='button';
      button.textContent='Parcel '+(i+1);
      button.onclick=()=>selectPlot(feature,true);
      findResults.append(button);
    });
  };
  canvas.addEventListener('wheel',event=>{
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom(event.deltaY<0?Math.SQRT2:Math.SQRT1_2,mapPoint(event));
  },{passive:false});
  canvas.onkeydown=event=>{
    const moves={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]};
    if (event.key==='+' || event.key==='=') zoom(Math.SQRT2);
    else if (event.key==='-') zoom(Math.SQRT1_2);
    else if (Object.hasOwn(moves,event.key)) pan(...moves[event.key]);
    else return;
    event.preventDefault();
  };
  let drag;
  canvas.onpointerdown=event=>{
    if (!event.isPrimary || event.button!==0) return;
    drag={id:event.pointerId,point:mapPoint(event),x:event.clientX,y:event.clientY,moved:false};
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove=event=>{
    if (drag?.id!==event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4) return;
    drag.moved=true;
    if (view.zoom===1) return;
    canvas.classList.add('dragging');
    const point=mapPoint(event);
    pan(point[0]-drag.point[0],point[1]-drag.point[1]);
    drag.point=point;
  };
  function endDrag(event) {
    if (drag?.id!==event.pointerId) return null;
    const finished=drag;
    drag=null;
    canvas.classList.remove('dragging');
    return finished;
  }
  canvas.onpointercancel=endDrag;
  canvas.onlostpointercapture=endDrag;
  canvas.onpointerup=event=>{
    const finished=endDrag(event);
    if (!finished || finished.moved) return;
    const [x,y]=mapPoint(event);
    const context=canvas.getContext('2d');
    const hit=paths.findLast(({path})=>context.isPointInPath(path,x,y,'evenodd'));
    if (hit) selectPlot(hit.feature);
  };
}
