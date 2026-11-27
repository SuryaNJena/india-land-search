import {selectedPlaces,mapTerms,lookupPlace,resolveRI,rememberPlace,placeKey} from './shared-villages.mjs';
import {mountVillageFinder} from './village-finder.mjs';
import {mountLocationAtlas} from './location-atlas.mjs';
import {runtime} from './runtime.mjs';
import {loadBhulekhLocations} from './odisha-live-search.mjs';
import {mountLiveOdishaMap} from './live-odisha-map.mjs';
import {mountHoldingPreview,mountPlotPreview} from './plot-profile.mjs';
import {copyReport,printHoldings} from './live-ror.mjs';
import {
  checkBounds,cleanNumber,cleanPlace,cleanSheet,directReport,districtMapBase,
  locationFields,mapImageURL,mapLocation,mapPortal,officialPlotURL,postOdisha,readExactPlot,
  readSheetExtent,readSheetGeometry,reportPortal,reportURL,sheetGIS,sheetLevels
} from './odisha-lookup-source.mjs';

const modes={
  maps:{title:'Find a village map',submit:'Open village map'},
  plots:{title:'Find an official plot record',submit:'Find Plot Info'},
  ror:{title:'Find an official Record of Rights',submit:'Load front and back'}
};

const staticBounds={'04010100101':[964.3220184143177,816.1233418771527,1811.4479923285971,1617.871228376875]};
const compare=new Intl.Collator('en-IN');
let directory, snapshots;

function localMaps() {
  snapshots ??= (async()=>{
    const response=await fetch(new URL('./odisha-map-snapshots.json',import.meta.url));
    if (!response.ok) return {};
    return response.json();
  })().catch(()=>({}));
  return snapshots;
}

function localVillages() {
  directory ??= (async()=>{
    const response=await fetch(new URL('./villages.json',import.meta.url));
    if (!response.ok) throw Error('The district and village list could not be loaded.');
    const {rows}=await response.json();
    return rows.map(([id,village,local,district,tehsil,portalCode,riCode,ri])=>{
      if (id==='954346') return {id,village,local,district,tehsil,ri:'Dhenkanal Sadar',
        districtCode:'4',tehsilCode:'1',riCode:'1',villageCode:'1'};
      const [districtCode,tehsilCode,villageCode]=portalCode?.split('-')??[];
      return {id,village,local,district,tehsil,ri,districtCode,tehsilCode,riCode,villageCode};
    });
  })().catch(error=>{directory=undefined;throw error;});
  return directory;
}

function setOptions(select,label,options,placeholder='Choose '+label.toLowerCase()) {
  select.replaceChildren(new Option(placeholder,''),...options.map(({value,label})=>new Option(label,value)));
  select.disabled=!options.length;
}

async function jsonFromFile(file,megabytes=0.25) {
  if (file.size>megabytes*1024*1024) throw Error('Choose a smaller official response file.');
  try {return JSON.parse(await file.text());}
  catch {throw Error('The saved response is not valid JSON.');}
}

function pause(signal) {
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const cancel=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},1100);
    signal.addEventListener('abort',cancel,{once:true});
  });
}

export function mountOdishaLookup(root,mode,{escape,tag,onSave,onRevenue,initial}={}) {
  const config=modes[mode], isMap=mode==='maps', isPlot=mode==='plots', needsRI=mode!=='ror';
  const fields=locationFields.filter(({code})=>needsRI || code!=='riCode');
  const fieldMarkup=fields.map(({code,label},index)=>
    '<label class="label">'+label+'<select data-odisha-field="'+code+'" '+(index?'disabled':'')+
    '><option value="">Choose '+label.toLowerCase()+'</option></select></label>').join('');
  const manualMarkup=fields.map(({code,label,width})=>'<label class="label">'+label+
    ' code<input data-odisha-code="'+code+'" inputmode="numeric" maxlength="'+width+'"></label>').join('');
  const sheetMarkup=isPlot || isMap
    ? '<label class="label" '+(isMap && runtime.hosted?'hidden':'')+
      ' data-direct-sheet>Sheet<input name="sheet" inputmode="numeric" maxlength="2" value="01" required></label>' : '';
  const detailMarkup=isPlot
    ? '<label class="label">Plot number<input name="number" maxlength="64" required></label>'
    : needsRI?'':'<label class="label">Khata number<input name="khata" maxlength="64" required></label>';
  root.innerHTML='<div class="card-head"><h2>'+config.title+'</h2></div>'+
    '<div class="panorama-explorer">'+(isMap?'<div data-location-atlas></div>':'')+'<div><details open data-shared-picker></details><label class="label" data-active-place hidden>Active village<select></select></label></div></div>'+
    '<form data-odisha-lookup novalidate><details data-alternate><summary>Browse official directory</summary><div class="search-fields">'+fieldMarkup+'</div>'+

    '<details class="live-location" data-manual-codes><summary>Enter official location codes</summary><div class="search-fields">'+manualMarkup+'</div></details>'+
    '</details><p class="muted" data-location-status role="status"></p><div class="actions">'+sheetMarkup+detailMarkup+
    (isMap?'<label class="label" data-direct-bounds '+(runtime.hosted?'hidden':'')+
      '>Native sheet bounds (if known)<input name="bounds" placeholder="xmin, ymin, xmax, ymax"></label>':'')+
    (isMap && runtime.hosted?'<label class="check"><input type="checkbox" data-direct-map> Use official sheet image</label>':'')+
    '<button class="button primary" type="submit">'+config.submit+'</button></div></form>'+
    '<p role="status" data-odisha-lookup-status></p><div data-odisha-output></div>'+
    '<p class="actions">'+(needsRI?tag(mapPortal,'Open official BhuNaksha portal'):tag(reportPortal,'Open official Bhulekh portal'))+
    (isMap?tag('https://www.odishakyl.in/mapview.php','Open ORSAC cadastral basemap'):'')+'</p>';
  const get=selector=>root.querySelector(selector);
  const field=code=>get('[data-odisha-field="'+code+'"]');
  const manual=code=>get('[data-odisha-code="'+code+'"]');
  const form=get('[data-odisha-lookup]'), submit=form.querySelector('[type="submit"]');
  const output=get('[data-odisha-output]'), status=get('[data-odisha-lookup-status]'), locationStatus=get('[data-location-status]');
  const value=key=>form.elements.namedItem(key)?.value??'';
  const directMap=get('[data-direct-map]');
  let chosen={}, rows=[], locationRequest, lookupRequest;
  const atlas=isMap?mountLocationAtlas(get('[data-location-atlas]'),{onChoose:p=>finder.select(p)}):undefined;
  const clear=()=>{
    lookupRequest?.abort();
    lookupRequest=undefined;
    submit.disabled=false;
    output.replaceChildren();
    atlas?.setParcelOverlay();
    status.textContent='';
  };

  function fill(place={}) {
    for (const {code} of fields) manual(code).value=place[code]??'';
  }

  function groupedOptions(list,key) {
    return [...new Set(list.map(item=>item[key]).filter(Boolean))].sort(compare.compare).map(label=>({value:label,label}));
  }

  function staticOptions(index) {
    const {code,label,name}=fields[index];
    const filtered=rows.filter(item=>fields.slice(0,index).every(({code,name})=>
      !field(code).value || item[name]===field(code).value));
    if (code==='villageCode') {
      const options=filtered.sort((a,b)=>compare.compare(a.village,b.village)).map(row=>({
        value:row.id,label:[row.village,row.local,row.ri].filter(Boolean).join(' · ')
      }));
      setOptions(field(code),label,options);
      return;
    }
    setOptions(field(code),label,groupedOptions(filtered,name),code==='riCode'?'All revenue circles':undefined);
  }

  async function officialOptions(index,selection) {
    const parts=fields.slice(0,index).map(({code})=>field(code).value);
    if (parts.some(code=>!code)) return;
    locationRequest?.abort();
    const abort=new AbortController();
    locationRequest=abort;
    const {code,label,name}=fields[index];
    locationStatus.textContent='Loading '+label.toLowerCase()+' choices…';
    try {
      const key=parts.join('-');
      const options=needsRI
        ? (await postOdisha('map-locations',{location:key},abort.signal)).options
        : await loadBhulekhLocations(key,abort.signal);
      if (abort.signal.aborted || !root.isConnected) return;
      if (!Array.isArray(options)) throw Error('The portal did not return a location list.');
      const choices=options.map(({code,label})=>({value:code,label}));
      if (selection?.[code] && !choices.some(choice=>String(choice.value)===selection[code])) {
        choices.push({value:selection[code],label:selection[name]||label+' '+selection[code]});
      }
      setOptions(field(code),label,choices);
      if (selection?.[code]) field(code).value=selection[code];
      locationStatus.textContent=choices.length?'':'The portal has no '+label.toLowerCase()+' entries for this selection.';
      if (selection && field(code).value && index+1<fields.length) void officialOptions(index+1,selection);
    } catch(error) {
      if (abort.signal.aborted) return;
      locationStatus.textContent=error.message+' You can enter official codes below.';
      get('[data-manual-codes]').open=true;
    }
  }

  function update(index) {
    clear();
    locationRequest?.abort();
    locationStatus.textContent='';
    const {code}=fields[index];
    for (const next of fields.slice(index+1)) setOptions(field(next.code),next.label,[]);
    if (runtime.hosted) {
      chosen=Object.fromEntries(fields.slice(0,index+1).flatMap(({code,name})=>{
        const select=field(code);
        return select.value?[[code,select.value],[name,select.selectedOptions[0].textContent]]:[];
      }));
      fill(chosen);
      if (field(code).value && index+1<fields.length) void officialOptions(index+1);
      return;
    }
    if (code==='villageCode') {
      chosen=rows.find(row=>row.id===field(code).value)??{};
      fill(chosen);
      if (!chosen.villageCode && chosen.id) {
        locationStatus.textContent='This village has an LGD entry. Enter its BhuNaksha or Bhulekh codes to continue.';
        get('[data-manual-codes]').open=true;
      }
      return;
    }
    chosen={};
    fill();
    const next=fields[index+1];
    if (next && (field(code).value || code==='riCode')) {
      staticOptions(index+1);
      if (next.code==='riCode') staticOptions(index+2);
    }
  }

  fields.forEach(({code},index)=>field(code).onchange=()=>update(index));
  for (const {code} of fields) manual(code).oninput=()=>clear();
  for (const input of form.querySelectorAll('[name]')) input.addEventListener('input',clear);
  if (directMap) directMap.onchange=()=>{
    clear();
    get('[data-direct-sheet]').hidden=get('[data-direct-bounds]').hidden=!directMap.checked;
  };

  function getPlace() {
    const raw={};
    for (const {code,name} of fields) {
      raw[code]=manual(code).value;
      if (!chosen[code] || String(chosen[code])===String(Number(raw[code]))) raw[name]=chosen[name];
    }
    return cleanPlace(raw,needsRI);
  }

  async function save(entry,message) {
    try {
      if (onSave) await onSave(entry);
      if (root.isConnected) status.textContent=message;
    } catch {
      if (root.isConnected) status.textContent=message+' This browser could not save it to Workspace.';
    }
  }

  function liveMap(place,data,sheet,localSheets) {
    const details=document.createElement('details');
    details.className='live-location live-map';
    details.open=true;
    output.replaceChildren(details);
    mountLiveOdishaMap(details,[place],escape,tag,new Map(),new Map(),mapTerms(),{
      showVillage:false,initialSheet:sheet,initialMap:data,localSheets,onRevenue,onGeography:atlas?.setParcelOverlay,
      onSave:(entry)=>save(entry,entry.kind==='map'?'Village map loaded.':'Plot Info loaded.')
    });
  }

  function renderRaster(place,sheet,bounds,alreadySaved=false) {
    const image=new Image();
    image.className='official-odisha-map';
    image.alt='BhuNaksha sheet '+sheet+' for '+place.village;
    output.replaceChildren(image);
    atlas?.setParcelOverlay();
    void atlas?.show([place],'Odisha');
    status.textContent='Loading the official BhuNaksha map image…';
    image.onload=()=>{
      if (!image.isConnected) return;
      if (alreadySaved) status.textContent='Saved village map opened from Workspace.';
      else void save({kind:'map',place,sheet,data:{bounds}},'Village map loaded.');
    };
    image.onerror=()=>{
      if (image.isConnected) status.textContent='BhuNaksha could not load the map image. Open the official portal or check the native sheet bounds.';
    };
    image.src=mapImageURL(place,sheet,bounds);
    addMapSources(place,sheet);
  }

  function addMapSources(place,sheet) {
    const panel=document.createElement('details');
    panel.className='live-location';
    panel.innerHTML='<summary>Official sheet data</summary><p>Open the official response and save it as JSON to use it here.</p>'+
      '<div class="actions"><form method="post" target="_blank" rel="noopener" data-official-extent>'+
      '<input type="hidden" name="state" value="21"><input type="hidden" name="gisLevels"><input type="hidden" name="srs" value="0">'+
      '<button type="submit" class="button secondary">Open BhuNaksha sheet extent</button></form>'+
      '<label class="label">Add the saved sheet extent<input type="file" accept=".json,application/json" data-import-extent></label></div>'+
      '<div class="actions"><form method="post" target="_blank" rel="noopener" data-official-geometry>'+
      '<input type="hidden" name="state" value="21"><input type="hidden" name="giscode"><input type="hidden" name="noCompress" value="true">'+
      '<button type="submit" class="button secondary">Open BhuNaksha parcel GeoJSON</button></form>'+
      '<label class="label">Add the saved parcel GeoJSON<input type="file" accept=".json,.geojson,application/json" data-import-geometry></label></div>';
    const source=districtMapBase(place.districtCode);
    const extent=panel.querySelector('[data-official-extent]');
    extent.action=new URL('rest/MapInfo/getVVVVExtentGeoref',source).href;
    extent.elements.gisLevels.value=sheetLevels(place,sheet);
    const geometry=panel.querySelector('[data-official-geometry]');
    geometry.action=new URL('rest/MapInfo/getVillageGeoJSon',source).href;
    geometry.elements.giscode.value=sheetGIS(place,sheet);
    for (const [selector,size,show] of [
      ['[data-import-extent]',0.25,data=>renderRaster(place,sheet,readSheetExtent(data,place,sheet))],
      ['[data-import-geometry]',8,data=>{
        liveMap(place,undefined,sheet,{[sheet]:readSheetGeometry(data,place,sheet)});
        addMapSources(place,sheet);
      }]
    ]) panel.querySelector(selector).onchange=async event=>{
      const file=event.target.files[0];
      if (!file) return;
      try {
        const data=await jsonFromFile(file,size);
        if (panel.isConnected) show(data);
      } catch(error) {
        if (panel.isConnected) status.textContent=error.message;
      }
    };
    output.append(panel);
    return panel;
  }

  function renderPlot(place,sheet,number,data) {
    const khata=data.khata;
    const facts=[['Village',place.village],['Tahasil',place.tehsil],['District',place.district],['Sheet',sheet],
      ['Khata',khata],['Area',data.area||data.info?.match(/(?:^|\n)\s*(?:ରକବା|Area)\s*[:ଃ]\s*([^\n]+)/iu)?.[1]?.trim()]].filter(([,entry])=>entry);
    output.innerHTML='<section class="bhu-plot-info plot-profile"><h3>Plot Info · '+escape(number)+'</h3>'+
      '<dl class="plot-facts">'+facts.map(([name,entry])=>'<div><dt>'+escape(name)+'</dt><dd>'+escape(entry)+'</dd></div>').join('')+'</dl>'+
      '<div class="plot-profile-layout"><div><h4>BhuNaksha record text</h4>'+
      (data.info?'<p class="bhu-plot-source" dir="auto">'+escape(data.info)+'</p>':'<p>BhuNaksha did not provide record text for this plot.</p>')+
      '<div class="actions">'+tag(data.front,'Official RoR front')+tag(data.back,'Official RoR back')+
      tag(officialPlotURL(place,sheet,number),'Open official Plot Info')+
      (khata&&onRevenue?'<button type="button" class="button secondary" data-pay-holding>Land revenue for this khata</button>':'')+'</div></div>'+
      '<section data-plot-preview><h4>Cadastral sheet</h4><p role="status" data-preview-status>Loading the sheet…</p>'+
      '<div class="map-frame" hidden><canvas role="img" width="600" height="390"></canvas></div>'+
      '<button class="button secondary" type="button" data-zoom-preview hidden>Zoom to plot</button></section></div>'+
      (khata?['front','back'].map(side=>'<details class="live-location" data-holding-side="'+side+'"><summary>'+
      (side==='front'?'Recorded holders and holding details':'RoR plot schedule')+
      '</summary><p role="status" data-holding-status></p><div class="table-scroll" data-holding-output></div></details>').join(''):'')+'</section>';
    output.querySelector('[data-pay-holding]')?.addEventListener('click',()=>onRevenue({place,khata}));
    output.querySelectorAll('[data-holding-side]').forEach(panel=>mountHoldingPreview(panel,{place,khata,side:panel.dataset.holdingSide}));
    const panel=output.querySelector('[data-plot-preview]');
    void mountPlotPreview(panel,{place,sheet,number,data,loadSheet:async()=>{
      if(runtime.hosted){
        try{return await postOdisha('maps',{location:mapLocation(place),sheet},lookupRequest?.signal);}
        catch(error){if(error.status===429 || lookupRequest?.signal.aborted)throw error;}
      }
      const maps=await localMaps(), snapshot=maps.villages?.[mapLocation(place)]?.[sheet];
      return snapshot?{...snapshot,captured:snapshot.captured??maps.collected}:undefined;
    }});
  }

  function directPlot(place,sheet,number) {
    const panel=document.createElement('div');
    panel.innerHTML='<p class="actions">'+tag(officialPlotURL(place,sheet,number),'Open official Plot Info')+'</p>'+
      '<label class="label">Add the Plot Info JSON saved from BhuNaksha<input type="file" accept=".json,application/json"></label>';
    panel.querySelector('input').onchange=async event=>{
      const file=event.target.files[0];
      if (!file) return;
      try {
        const data=readExactPlot(await jsonFromFile(file),place,sheet,number);
        if (!panel.isConnected) return;
        renderPlot(place,sheet,number,data);
        void save({kind:'plot',place,sheet,number,data},'Plot Info loaded.');
      } catch(error) {
        if (panel.isConnected) status.textContent=error.message;
      }
    };
    output.replaceChildren(panel);
    status.textContent='Open the official response or add a saved copy to preview and save it here.';
  }

  function reportLinks(place,khata) {
    const front=reportURL(place,khata,'front'), back=reportURL(place,khata,'back');
    output.innerHTML='<p class="actions">'+tag(front,'Official RoR front')+tag(back,'Official RoR back')+'</p>';
    return {location:place,khata,front,back};
  }

  function renderReport(place,khata,pages) {
    const previews=['front','back'].map(side=>{
      const report=document.createElement('details');
      report.className='live-location';
      const summary=document.createElement('summary');
      summary.textContent=side==='front'?'Front page':'Back page and plot schedule';
      report.append(summary,copyReport(document,pages[side],side));
      return report;
    });
    const hit=reportLinks(place,khata);
    const print=document.createElement('button');
    print.className='button secondary';
    print.type='button';
    print.textContent='Print both sides / Save PDF';
    print.onclick=()=>void printHoldings([hit],status,print,(_hit,side)=>pages[side]);
      if(onRevenue){
      const pay=document.createElement('button');
      pay.className='button secondary';pay.type='button';pay.textContent='Land revenue for this khata';
      pay.onclick=()=>onRevenue({place,khata});
      output.append(pay);
    }
    output.append(print,...previews);
  }

  form.onsubmit=async event=>{
    event.preventDefault();
    clear();
    const abort=new AbortController();
    lookupRequest=abort;
    try {
      const place=getPlace();
      if (isMap) {
        if (runtime.hosted && !directMap?.checked) {liveMap(place);return;}
        const sheet=cleanSheet(value('sheet'));
        const input=value('bounds').trim();
        if (!runtime.hosted && !input) {
          submit.disabled=true;
          status.textContent='Looking for a published copy of the sheet…';
          const maps=await localMaps();
          if (abort.signal.aborted || !root.isConnected) return;
          const copies=maps.villages?.[mapLocation(place)];
          if (copies?.[sheet]) {
            const sheets=Object.fromEntries(Object.entries(copies).map(([code,data])=>
              [code,{...data,captured:data.captured??maps.collected}]));
            liveMap(place,undefined,sheet,sheets);
            addMapSources(place,sheet);
            return;
          }
        }
        const bounds=input?checkBounds(input.split(/[\s,]+/).map(Number)):staticBounds[sheetGIS(place,sheet)];
        if (bounds) renderRaster(place,sheet,bounds);
        else {
          addMapSources(place,sheet).open=true;
          status.textContent='Add the official sheet extent or parcel GeoJSON to open this sheet.';
        }
        return;
      }
      submit.disabled=true;
      if (isPlot) {
        const sheet=cleanSheet(value('sheet')), number=cleanNumber(value('number'),'plot number');
        if (!runtime.hosted) {directPlot(place,sheet,number);return;}
        status.textContent='Reading Plot Info from BhuNaksha…';
        let data;
        try {
          data=await postOdisha('maps',{location:mapLocation(place),sheet,parcel:{number}},abort.signal);
          if (!data.info && !data.area && !data.khata) throw Error('BhuNaksha returned no Plot Info for that number.');
        } catch(error) {
          if (abort.signal.aborted || !root.isConnected) return;
          directPlot(place,sheet,number);
          status.textContent=error.message+' You can open the official response below.';
          return;
        }
        if (abort.signal.aborted || !root.isConnected) return;
        renderPlot(place,sheet,number,data);
        await save({kind:'plot',place,sheet,number,data},'Plot Info loaded.');
      } else {
        const khata=cleanNumber(value('khata'),'khata number');
        reportLinks(place,khata);
        const pages={};
        for (const side of ['front','back']) {
          status.textContent='Reading the '+side+' page from Bhulekh…';
          pages[side]=await directReport(place,khata,side,abort.signal);
          if (side==='front') {
            copyReport(document,pages.front,'front');
            await pause(abort.signal);
          }
        }
        if (abort.signal.aborted || !root.isConnected) return;
        renderReport(place,khata,pages);
        await save({kind:'ror',place,khata,data:pages},'Both RoR pages are ready.');
      }
    } catch(error) {
      if (!abort.signal.aborted) status.textContent=error instanceof TypeError
        ? 'The official report could not be read here. You can open the official portal.' : error.message;
    } finally {
      if (lookupRequest===abort) submit.disabled=false;
    }
  };

  if (initial?.place) {
    try {
      chosen=cleanPlace(initial.place,needsRI);
      fill(chosen);
      if (form.elements.namedItem('sheet')) form.elements.sheet.value=initial.sheet??'01';
      if (isPlot) form.elements.number.value=initial.number??'';
      if (!needsRI) form.elements.khata.value=initial.khata??'';
      if (isMap && initial.data?.bounds) renderRaster(chosen,initial.sheet,initial.data.bounds,true);
      else if (isMap && initial.data?.features?.length) liveMap(chosen,initial.data,initial.sheet);
      else if (isPlot && initial.data) renderPlot(chosen,initial.sheet,initial.number,initial.data);
      else if (!needsRI && initial.data) renderReport(chosen,initial.khata,initial.data);
    } catch(error) {status.textContent=error.message;}
  }

  let resolving;
  const active=get('[data-active-place]'), activeSelect=active.querySelector('select');
  async function useShared(place){
    resolving?.abort();const controller=new AbortController();resolving=controller;
    clear();chosen={};fill();
    const choices=selectedPlaces();active.hidden=choices.length<2;
    activeSelect.replaceChildren(...choices.map(p=>new Option(p.village+' · '+p.tehsil,placeKey(p))));
    atlas?.show(choices,'Odisha');
    if(!place)return;
    activeSelect.value=placeKey(place);
    try{
      if(needsRI && runtime.hosted && place.portalCode && !place.riCode){
        locationStatus.textContent='Finding the revenue circle…';
        place=await resolveRI(place,async(key,signal)=>(await postOdisha('map-locations',{location:key},signal)).options,controller.signal)??place;
        if(controller.signal.aborted || !root.isConnected)return;
        if(place.riCode)rememberPlace(place);
      }
      chosen=lookupPlace(place)??{};
      fill(chosen);
      locationStatus.textContent=chosen.villageCode&&(!needsRI||chosen.riCode)?'Selected '+place.village+'.':'Official location unresolved. Browse the directory or select another village.';
    }catch(error){if(!controller.signal.aborted)locationStatus.textContent=error.message;}
  }
  activeSelect.onchange=()=>void useShared(selectedPlaces().find(p=>placeKey(p)===activeSelect.value));
  const finder=mountVillageFinder(get('[data-shared-picker]'),escape,(place,all)=>void useShared(place??all.at(-1)),undefined,{onFilter:rows=>atlas?.show(rows.length?rows:selectedPlaces(),'Odisha')});
  finder('Odisha');
  if (!initial?.place)void useShared(selectedPlaces().at(-1));
  else void atlas?.show([initial.place],'Odisha');
  if (runtime.hosted) {
    if (initial?.place) {
      const district=fields[0];
      setOptions(field(district.code),district.label,[{label:chosen.district,value:chosen.districtCode}]);
      field(district.code).value=chosen.districtCode;
    } else void officialOptions(0);
  } else {
    locationStatus.textContent='Loading Odisha districts…';
    void localVillages().then(list=>{
      if (!root.isConnected) return;
      rows=list;
      staticOptions(0);
      locationStatus.textContent='';
    }).catch(error=>{
      if (!root.isConnected) return;
      locationStatus.textContent=error.message+' You can enter official codes below.';
      get('[data-manual-codes]').open=true;
    });
  }
}
