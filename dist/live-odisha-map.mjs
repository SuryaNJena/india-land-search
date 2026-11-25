import {drawMap,makeMapPDF} from './maps.mjs';
import {download} from './files.mjs';
import {mountParcelBasemap} from './parcel-basemap.mjs';
import {localMapLayer,plotNumber,sheetHighlights} from './sheet-overlays.mjs';

const limit=12;
const asciiName=name=>/[\u0b00-\u0b7f]/u.test(name) && globalThis.Sanscript ? globalThis.Sanscript.t(name,'oriya','iso').normalize('NFD').replace(/[^\x20-\x7e]/g,'') : name;

export function mountLiveOdishaMap(root,locations,escape,tag,matchedPlots=new Map(),matchedHoldings=new Map()) {
  root.innerHTML=`<summary>BhuNaksha village map</summary>
    <div class="toolbar"><label class="label">Village<select id="bhu-village">${locations.map((place,i)=>`<option value="${i}">${escape(place.village)} · ${escape(place.tehsil)}</option>`).join('')}</select></label>
    <label class="label">Sheet<select id="bhu-sheet" disabled></select></label></div>
    <div data-roR-plots></div><p id="bhu-match-status" role="status"></p>
    <p id="bhu-status" role="status"></p>
    <button class="plain-link" type="button" id="bhu-retry" hidden>Retry map</button>
    <div class="map-frame" id="bhu-canvas-frame" hidden><canvas id="bhu-canvas" width="1100" height="720" aria-label="BhuNaksha village map. Click a parcel to see its plot number."></canvas></div>
    <div class="actions" id="bhu-map-actions" hidden>
      <button class="button secondary" type="button" id="bhu-export">Download this sheet PDF</button>
      <button class="button secondary" type="button" id="bhu-export-village">Download matched village sheets PDF</button>
    </div>
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
  let pending, plotRequest, exportRequest, geometry, paths=[], loaded=false, unmountGeo, busyExport=false;

  async function request(place,sheetCode,signal) {
    const key=place.id+'/'+sheetCode;
    if (responses.has(key)) return responses.get(key);
    const location=[place.districtCode,place.tehsilCode,place.villageCode,place.riCode].join('-');
    const response=await fetch('/api/odisha/maps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location,sheet:sheetCode}),signal});
    const data=await response.json();
    if (!response.ok) throw Error(data.error||'BhuNaksha is unavailable.');
    if (responses.size>=36) responses.delete(responses.keys().next().value);
    responses.set(key,data);
    return data;
  }

  const getNumbers=place=>new Set([...(matchedPlots.get(place.id)??[]),...(fromRoR.get(place.id)??[])].map(plotNumber).filter(Boolean));
  function refreshBasemap() {
    const geographic=geometry && (geometry.geographic ?? userLayers.get(geometry.gis));
    geoFile.disabled=!geometry;
    geoStatus.textContent=geographic ? geographic.source : 'Geographic placement is unavailable for this sheet. You can still add a separate location pin or supply geographic parcel data.';
    if (!geoDetails.open) return;
    unmountGeo?.();
    const numbers=getNumbers(currentPlace());
    const highlights=new Set((geographic?.features??[]).filter(feature=>numbers.has(plotNumber(feature.properties.kide)))
      .map(feature=>String(feature.properties.id)));
    unmountGeo=mountParcelBasemap(get('bhu-basemap'),{geographic,highlights,pinState});
  }

  function render(selected) {
    if (!geometry) return;
    const numbers=getNumbers(currentPlace());
    const highlights=sheetHighlights(geometry,numbers);
    paths=drawMap(canvas,geometry.features,geometry.gis,highlights,{labels:geometry.features.length<600,plain:!highlights.size,selected});
    exportSheet.disabled=busyExport;
    exportVillage.disabled=busyExport||!numbers.size;
    const capture=geometry.captured?`Saved BhuNaksha copy · ${geometry.captured}. `:'';
    const revision=geometry.sourceUpdated?` Source updated ${geometry.sourceUpdated}.`:'';
    const selectedParcel=selected && geometry.features.find(feature=>`${geometry.gis}/${feature.properties.id}`===selected);
    status.textContent=`${capture}${geometry.features.length} mapped parcels · ${highlights.size} RoR-matched parcels on sheet ${geometry.sheet}.${
      selectedParcel?.properties.kide?` Selected plot ${selectedParcel.properties.kide}.`:' Click a parcel to see its plot number.'}${revision}`;
  }

  function showHoldings() {
    const place=currentPlace();
    const khatas=[...new Set(matchedHoldings.get(place.id)??[])];
    plotBox.innerHTML=khatas.length?`<details><summary>Choose matching khatas to highlight</summary>
      <div class="bhu-khatas">${khatas.map((khata,i)=>`<label class="check"><input type="checkbox" value="${i}" ${khatas.length<=limit?'checked':''}> Khata ${escape(khata)}</label>`).join('')}</div>
      <button class="button secondary" data-load-plots type="button">Highlight plots from Bhulekh RoR</button></details>`:'';
    matchStatus.textContent=getNumbers(place).size?`${getNumbers(place).size} plot numbers from the selected land records.`:'';
    plotBox.querySelector('[data-load-plots]')?.addEventListener('click',async event=>{
      const button=event.currentTarget;
      const selected=[...plotBox.querySelectorAll('input:checked')].map(box=>khatas[Number(box.value)]);
      if (!selected.length || selected.length>limit) {
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
        for (const khata of selected) {
          const key=place.id+'/'+khata;
          let plots=documents.get(key);
          if (!plots) {
            matchStatus.textContent=`Loading the official plot schedule for khata ${khata}…`;
            const response=await fetch('/api/odisha/ror',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({location:place.id,khata,side:'back',plots:true}),signal:abort.signal});
            const data=await response.json();
            if (!response.ok) throw Error(data.error||'The official plot schedule is unavailable.');
            plots=data.plots;
            documents.set(key,plots);
            if (checked+1<selected.length) await new Promise(resolve=>setTimeout(resolve,1100));
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
          matchStatus.textContent=`${checked} of ${selected.length} khatas checked · ${numbers.size} plot numbers.${issue?' '+issue:''}`;
          render();
          refreshBasemap();
        }
      }
    });
  }

  async function load(sheetCode) {
    pending?.abort();
    const abort = new AbortController();
    pending=abort;
    const place=currentPlace();
    geometry=null;
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
      frame.hidden=false;
      actions.hidden=false;
      render();
      refreshBasemap();
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
        const match=sheetHighlights(data,numbers);
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
        exportVillage.disabled=!getNumbers(place).size;
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
  geoDetails.ontoggle=()=>{if (geoDetails.open) refreshBasemap();};
  root.ontoggle=()=>{if (root.open&&!loaded){loaded=true;showHoldings();void load();}};
  village.onchange=()=>{plotRequest?.abort();exportRequest?.abort();busyExport=false;sheet.replaceChildren();showHoldings();void load();};
  sheet.onchange=()=>{exportRequest?.abort();busyExport=false;void load(sheet.value);};
  retry.onclick=()=>void load(sheet.value);
  exportSheet.onclick=()=>void exportPDF(false);
  exportVillage.onclick=()=>void exportPDF(true);
  canvas.onclick=event=>{
    const bounds=canvas.getBoundingClientRect();
    const x=(event.clientX-bounds.left)*canvas.width/bounds.width, y=(event.clientY-bounds.top)*canvas.height/bounds.height;
    const context=canvas.getContext('2d');
    const hit=paths.findLast(({path})=>context.isPointInPath(path,x,y,'evenodd'));
    if (hit) render(hit.key);
  };
}
