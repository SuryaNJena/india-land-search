import {drawMap,makeMapPDF,mapViewLimit,newSheetView,panSheetView,parcelFocus,sheetProjection,zoomSheetView} from './maps.mjs';
import {matchRows} from './core.mjs';
import {download} from './files.mjs';
import {mountParcelBasemap} from './parcel-basemap.mjs';
import {localMapLayer,plotNumber,sheetHighlights} from './sheet-overlays.mjs';
import {mapImageURL,mapLocation,officialPlotURL,postOdisha,readExactPlot,safeMapRaster} from './odisha-lookup-source.mjs';

const limit=12;
const asciiName=name=>/[\u0b00-\u0b7f]/u.test(name) && globalThis.Sanscript ? globalThis.Sanscript.t(name,'oriya','iso').normalize('NFD').replace(/[^\x20-\x7e]/g,'') : name;

export function mountLiveOdishaMap(root,locations,escape,tag,matchedPlots=new Map(),matchedHoldings=new Map(),searchNames=[],options={}) {
  const {initialMap,initialSheet,localSheets,onSave,showVillage=true}=options;
  const isLocal=Boolean(initialMap || localSheets);
  root.innerHTML=`<summary>BhuNaksha village map</summary>
    <div class="toolbar"><label class="label" ${showVillage?'':'hidden'}>Village<select id="bhu-village">${locations.map((place,i)=>`<option value="${i}">${escape(place.village)} · ${escape(place.tehsil)}</option>`).join('')}</select></label>
    <label class="label">Sheet<select id="bhu-sheet" disabled></select></label></div>
    <div data-roR-plots></div><p id="bhu-match-status" role="status"></p>
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
      <div class="legend"><span><i class="bhu-selected-swatch"></i>Selected plot</span><span><i class="bhu-matched-swatch"></i>Search match</span><span>Plot numbers appear from 200% zoom when there is room.</span></div>
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
    <details class="live-location" id="bhu-geographic"><summary>Geographic map and location pins</summary>
      <p id="bhu-geographic-status"></p>
      <label class="label">Add geographic parcels for this sheet
        <input id="bhu-geo-file" type="file" accept=".geojson,.json,application/geo+json,application/json" disabled>
      </label><p class="muted">Use a WGS84 GeoJSON with this sheet's giscode and official parcel IDs or plot numbers. The file stays in this tab.</p>
      <div id="bhu-basemap"></div>
    </details>
    <p class="actions">${tag('https://bhunakshaodisha.nic.in/','Open official BhuNaksha portal')}${tag('https://www.odishakyl.in/mapview.php','Open ORSAC cadastral basemap')}</p>`;
  const get=id=>root.querySelector('#'+id);
  const village=get('bhu-village'), sheet=get('bhu-sheet'), status=get('bhu-status');
  const canvas=get('bhu-canvas'), frame=get('bhu-canvas-frame'), retry=get('bhu-retry');
  const actions=get('bhu-map-actions'), exportSheet=get('bhu-export'), exportVillage=get('bhu-export-village');
  const plotBox=root.querySelector('[data-ror-plots]'), matchStatus=get('bhu-match-status');
  const geoFile=get('bhu-geo-file'), geoStatus=get('bhu-geographic-status'), geoDetails=get('bhu-geographic');
  const currentPlace=()=>locations[Number(village.value)];
  const fromRoR=new Map(), documents=new Map(), responses=new Map(), userLayers=new Map();
  const pinState={};
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
  let view=newSheetView(), projection, selected, mapFrame=0, loadingPlot=false, plotError='';
  let pending, plotRequest, exportRequest, geometry, paths=[], loaded=false, unmountGeo, busyExport=false;
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

  const getNumbers=place=>new Set([...(matchedPlots.get(place.id)??[]),...(fromRoR.get(place.id)??[])].map(plotNumber).filter(Boolean));
  function refreshBasemap() {
    const geographic=geometry && (geometry.geographic ?? userLayers.get(geometry.gis));
    geoFile.disabled=!geometry;
    const raster=mapLayers?.geographicRaster;
    geoStatus.textContent=geographic?.source || raster?.source || 'Geographic placement is unavailable for this sheet. You can still add a separate location pin or supply geographic parcel data.';
    if (!geoDetails.open) return;
    unmountGeo?.();
    const numbers=getNumbers(currentPlace());
    const highlights=new Set((geographic?.features??[]).filter(feature=>numbers.has(plotNumber(feature.properties.kide)) || verifiedPlots.has(geometry.gis+'/'+feature.properties.id))
      .map(feature=>String(feature.properties.id)));
    const rasterURL=safeMapRaster(raster?.url,geometry?.gis);
    unmountGeo=mountParcelBasemap(get('bhu-basemap'),{geographic,highlights,pinState,
      geographicRaster:raster?.projection==='EPSG:3857' && rasterURL?{...raster,url:rasterURL}:undefined});
    if (raster && raster.projection!=='EPSG:3857') {
      const link=safeMapRaster(raster.url,geometry?.gis);
      if (link) {
        const paragraph=document.createElement('p');
        paragraph.innerHTML=tag(link,'Open official WGS84 sheet image');
        get('bhu-basemap').prepend(paragraph);
      }
    }
  }

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
      layerStatus.textContent=mapLayers.layers.length?'Layers are drawn over the official native sheet.':'BhuNaksha did not list optional layers for this sheet.';
      if (mapLayers.geographicRaster) refreshBasemap();
    } catch(error) {
      if (!abort.signal.aborted && geometry===current) layerStatus.textContent=error.message;
    } finally {
      if (layerRequest===abort) layerRequest=undefined;
    }
  }
  layerPicker.onchange=paintLayer;
  layerDetails.ontoggle=()=>{if (layerDetails.open) void loadLayers();};

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
    const message=`${capture}${geometry.features.length} mapped parcels · ${highlights.size} search-matched ${highlights.size===1?'parcel':'parcels'} on sheet ${geometry.sheet}.${
      selected?.properties.kide?` Selected plot ${selected.properties.kide}.`:''}${revision}`;
    if (status.textContent!==message) status.textContent=message;
  }

  function showPlotInfo() {
    plotInfo.hidden=!selected;
    if (!selected) return;
    const number=selected.properties.kide;
    const key=selectedKey();
    const entry=details.get(key);
    const matched=sheetHighlights(geometry,getNumbers(currentPlace()),verifiedPlots).has(key);
    const heading='<h3>Plot Info · '+escape(number||'Unnumbered parcel')+'</h3>';
    const match=matched?'<p class="bhu-plot-match">Search match'+(entry?.matches.length?' · '+escape(entry.matches.join(', ')):'')+'</p>':'';
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
            verifiedPlots.add(key);verifiedVillages.add(place.id);render();refreshBasemap();
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
      plotInfo.innerHTML=heading+match+
        (data.info?'<p class="bhu-plot-source">'+escape(data.info)+'</p>':'<p>BhuNaksha returned no source text for this parcel.</p>')+
        (data.area?'<p>'+escape(data.area)+'</p>':'')+
        '<div class="actions">'+(data.khata?'<span>Khata '+escape(data.khata)+'</span>':'')+
        tag(data.front,'RoR front')+tag(data.back,'RoR back')+'</div>';
    }
  }

  async function loadSelectedPlot() {
    if (isLocal || loadingPlot || !selected?.properties.kide || details.has(selectedKey())) return;
    const key=selectedKey(), place=currentPlace(), plot=selected.properties, current=geometry;
    loadingPlot=true;
    try {
      const location=[place.districtCode,place.tehsilCode,place.villageCode,place.riCode].join('-');
      const data=await postOdisha('maps',{location,sheet:current.sheet,parcel:{id:plot.id,number:plot.kide}});
      const matches=matchRows([{status:'Retrieved',info:data.info}],{names:searchNames})[0].full;
      if (details.size>=100) details.delete(details.keys().next().value);
      details.set(key,{data,matches});
      if (root.isConnected) void remember({kind:'plot',place,sheet:current.sheet,number:plot.kide,
        data:{...data,id:plot.id,number:plot.kide}});
      if (matches.length) {
        verifiedPlots.add(key);
        verifiedVillages.add(place.id);
        if (currentPlace()===place) {render();refreshBasemap();}
      }
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
        button.disabled=false;
        if (!abort.signal.aborted) {
          fromRoR.set(place.id,numbers);
          matchStatus.textContent=`${checked} of ${chosen.length} khatas checked · ${numbers.size} plot ${numbers.size===1?'number':'numbers'}.${issue?' '+issue:''}`;
          render();
          showPlotInfo();
          refreshBasemap();
        }
      }
    }
  }

  async function load(sheetCode) {
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
    refreshBasemap();
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
      render();
      refreshBasemap();
      if (layerDetails.open || geoDetails.open) void loadLayers();
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

  geoFile.onchange=async()=>{
    const file=geoFile.files[0], current=geometry;
    geoFile.value='';
    if (!file || !current) return;
    try {
      if (file.size>8*1024*1024) throw Error('Choose a GeoJSON file no larger than 8 MB.');
      const layer=localMapLayer(JSON.parse(await file.text()),current);
      if (geometry!==current) return;
      userLayers.set(current.gis,layer);
      refreshBasemap();
    } catch (error) { if (geometry===current) geoStatus.textContent=error.message; }
  };
  geoDetails.ontoggle=()=>{if (geoDetails.open) {refreshBasemap();void loadLayers();}};
  root.ontoggle=()=>{if (root.open&&!loaded){loaded=true;showHoldings();void load(initialSheet);}};
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
