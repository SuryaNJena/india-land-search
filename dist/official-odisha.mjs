import {officialMapBase,officialRoR} from './odisha-endpoints.mjs';
import {plotNumber} from './sheet-overlays.mjs';
import {copyReport,printHoldings} from './live-ror.mjs';

const codes=['districtCode','tehsilCode','riCode','villageCode','sheet'];
const widths=[2,2,2,3,2];
const validCode=(value,width)=>new RegExp('^\\d{1,'+width+'}$').test(value??'') && Number(value)>0;
const sheetCodes=place=>codes.map((code,i)=>{
  if (!validCode(place[code],widths[i])) throw Error('Enter valid district, tehsil, RI, village and sheet codes.');
  return String(Number(place[code])).padStart(widths[i],'0');
});
const exactPlot=value=>{
  const number=plotNumber(value);
  if (!/^\d{1,12}(?:\/\d{1,12}){0,4}$/.test(number)) throw Error('Enter an exact plot number, such as 58 or 58/2.');
  return number;
};

export function mapImageURL(place,bounds,parcelId='') {
  const parts=sheetCodes(place);
  if (parcelId && !/^[A-Za-z0-9_-]{1,128}$/.test(parcelId)) throw Error('The parcel ID is invalid.');
  if (!bounds || bounds.length!==4 || !bounds.every(Number.isFinite) || bounds[0]>=bounds[2] || bounds[1]>=bounds[3]) {
    throw Error('Enter native sheet bounds in xmin, ymin, xmax, ymax order.');
  }
  const [left,bottom,right,top]=bounds, aspect=(right-left)/(top-bottom);
  const width=Math.max(1,Math.round(760*Math.min(1,aspect)));
  const height=Math.max(1,Math.round(760*Math.min(1,1/aspect)));
  const url=new URL('WMS',officialMapBase(String(Number(place.districtCode))));
  url.search=new URLSearchParams({SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetMap',FORMAT:'image/png',TRANSPARENT:'true',
    LAYERS:'VILLAGE_MAP',STYLES:'VILLAGE_MAP',state:'21',gis_code:parts.join(''),overlay_codes:'',CRS:'',
    BBOX:bounds.join(','),WIDTH:String(width),HEIGHT:String(height)});
  if (parcelId) {
    url.searchParams.set('LAYERS','PLOT_LIST');
    url.searchParams.set('STYLES','PLOT_SELECTION');
    url.searchParams.set('plot_id',parcelId);
  }
  return url;
}

export function plotLookup(place,value) {
  const parts=sheetCodes(place);
  const levels=parts.map((code,i)=>i===4?code:String(Number(code))).join(',')+',';
  const url=new URL('ScalarDatahandler',officialMapBase(String(Number(place.districtCode))));
  url.search=new URLSearchParams({OP:'5',state:'21',levels,plotno:exactPlot(value)});
  return url;
}

export function readSavedPlot(data,place,number) {
  const gis=sheetCodes(place).join('');
  if (String(data?.gisCode)!==gis || data?.has_data!=='Y' || typeof data.ID!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.ID) ||
      plotNumber(data.plotNo)!==exactPlot(number) || typeof data.info!=='string') {
    throw Error('This response does not match the selected sheet and plot number.');
  }
  const info=data.info.trim().slice(0,16000);
  let khata='';
  for (const [,href] of String(data.plotInfoLinks??'').matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url=new URL(href.replaceAll('&amp;','&'));
      const candidate=url.searchParams.get('KhataNo');
      if (url.hostname==='bhulekh.ori.nic.in' && url.pathname.toLowerCase()==='/viewror.aspx' &&
          ['DistCode','TehCode','VillCode'].every((name,i)=>Number(url.searchParams.get(name))===Number(place[['districtCode','tehsilCode','villageCode'][i]])) &&
          candidate && officialRoR(place,candidate,'front')) {
        khata=candidate;
        break;
      }
    } catch { /* Ignore links outside the recognized official report format. */ }
  }
  return {info,khata,id:data.ID};
}

export function reportLocation(place) {
  const cleaned={...place};
  for (const i of [0,1,3]) {
    const code=codes[i];
    if (!validCode(place[code],widths[i])) throw Error('Enter valid district, tehsil, and village codes.');
    cleaned[code]=String(Number(place[code]));
  }
  return cleaned;
}

async function readReport(response) {
  const reader=response.body?.getReader();
  if (!reader) throw Error('Bhulekh returned an empty response.');
  let size=0, html='';
  const decoder=new TextDecoder();
  for (;;) {
    const {done,value}=await reader.read();
    if (done) return html+decoder.decode();
    size+=value.byteLength;
    if (size>1024*1024) {
      await reader.cancel();
      throw Error('The official report exceeded the preview size limit.');
    }
    html+=decoder.decode(value,{stream:true});
  }
}

export async function reportPair(location,khata,fetcher=fetch,pause=()=>new Promise(resolve=>setTimeout(resolve,1100))) {
  location=reportLocation(location);
  const result={};
  for (const side of ['front','back']) {
    const link=officialRoR(location,khata,side);
    if (!link) throw Error('Enter a khata number, such as 42 or 42/1.');
    const response=await fetcher(new URL(link),{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});
    if (response.status===429 || response.status===403 || response.status===503 && response.headers.has('Retry-After')) {
      await response.body?.cancel();
      throw Error('Bhulekh asked us to wait. Try again later or open the official report.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw Error('Bhulekh could not return the '+side+' report.');
    }
    const html=await readReport(response);
    if (!/\bid=["']ContentArea["']/i.test(html) || side==='back' && !/\bid=["']gvRorBack["']/i.test(html)) {
      throw Error('Bhulekh did not return the expected '+side+' report.');
    }
    result[side]=html;
    if (side==='front') await pause();
  }
  return result;
}

export function mountOfficialOdisha(root,tag,village) {
  const labels=['District code','Tehsil code','RI code','Village code','Sheet'];
  root.innerHTML='<summary>Odisha maps and RoR lookup</summary>'+
    '<p>Enter location codes from the official portal. Load a sheet image, open Plot Info, or read both RoR pages for a known khata.</p>'+
    '<div class="search-fields">'+codes.map((code,i)=>'<label class="label">'+labels[i]+
      '<input inputmode="numeric" data-code="'+code+'" maxlength="'+widths[i]+'"></label>').join('')+'</div>'+
    '<p class="actions">'+tag('https://bhunakshaodisha.nic.in/bhunaksha/','BhuNaksha map viewer')+
      tag('https://bhulekh.ori.nic.in/RoRView.aspx','Bhulekh report finder')+
      tag('https://www.odishakyl.in/mapview.php','ORSAC village boundaries')+'</p>'+
    '<details><summary>BhuNaksha sheet and Plot Info</summary>'+
      '<div class="toolbar"><label class="label">Native sheet bounds<input data-bounds placeholder="xmin, ymin, xmax, ymax"></label>'+
      '<button type="button" class="button secondary" data-raster>Load map image</button>'+
      '<button type="button" class="plain-link" data-example>Fill verified map example</button></div>'+
      '<div data-preview class="official-odisha-preview"></div>'+
      '<form class="actions" data-plot-form><label class="label">Exact plot number<input name="plot" required maxlength="80"></label>'+
      '<button class="button secondary" type="submit">Find official Plot Info</button></form>'+
      '<div data-plot-link></div><div data-saved-plot hidden>'+
      '<label class="label">Add the Plot Info JSON saved from that tab<input type="file" accept=".json,application/json"></label></div>'+
      '<p data-map-status role="status"></p><div data-plot-info></div><button type="button" class="button secondary" data-highlight hidden>Highlight imported plot on map</button></details>'+
    '<details><summary>Bhulekh Records of Rights</summary>'+
      '<form class="actions" data-report-form><label class="label">Khata number<input name="khata" required maxlength="64"></label>'+
      '<button class="button primary" type="submit">Load front and back</button></form>'+
      '<div data-report-links class="actions"></div><p data-report-status role="status"></p>'+
      '<button type="button" class="button secondary" data-print hidden>Print both sides / Save PDF</button>'+
      '<div data-report></div></details>';
  const get=selector=>root.querySelector(selector);
  const place=()=>Object.fromEntries([...root.querySelectorAll('[data-code]')].map(input=>[input.dataset.code,input.value.trim()]));
  const mapStatus=get('[data-map-status]'), reportStatus=get('[data-report-status]');
  const preview=get('[data-preview]'), plotInfo=get('[data-plot-info]'), report=get('[data-report]');
  const print=get('[data-print]'), reportForm=get('[data-report-form]');
  const highlight=get('[data-highlight]');
  let selected, reportData, raster, imported;
  if (village?.portalCode) {
    const [district,tehsil,id]=village.portalCode.split('-');
    for (const [i,value] of [district,tehsil,village.riCode,id].entries()) get('[data-code='+codes[i]+']').value=value??'';
    root.open=true;
  }
  get('[data-example]').onclick=()=>{
    for (const [i,value] of ['4','1','1','1','01'].entries()) get('[data-code='+codes[i]+']').value=value;
    get('[data-bounds]').value='964.322, 816.123, 1811.448, 1617.871';
    get('[data-plot-form]').elements.plot.value='58';
    mapStatus.textContent='Example filled. Choose Load map image or Find official Plot Info.';
  };
  get('[data-raster]').onclick=()=>{
    try {
      const location=place(), bounds=get('[data-bounds]').value.trim().split(/[\s,]+/).map(Number);
      const url=mapImageURL(location,bounds);
      raster={location,bounds};
      highlight.hidden=!imported || sheetCodes(imported.location).join('')!==sheetCodes(location).join('');
      const image=new Image();
      image.alt='Live cadastral sheet from BhuNaksha';
      image.className='official-odisha-map';
      image.referrerPolicy='no-referrer';
      image.onload=()=>{if (image.isConnected) mapStatus.textContent='Live BhuNaksha sheet image.';};
      image.onerror=()=>{if (image.isConnected) mapStatus.textContent='The sheet image could not be loaded. Open the official map viewer.';};
      preview.replaceChildren(image);
      mapStatus.textContent='Loading the official sheet image…';
      image.src=url.href;
    } catch(error) {mapStatus.textContent=error.message;}
  };
  get('[data-plot-form]').onsubmit=event=>{
    event.preventDefault();
    try {
      const location=place(), number=event.currentTarget.elements.plot.value;
      const url=plotLookup(location,number);
      selected={location,number};
      imported=undefined;
      highlight.hidden=true;
      preview.querySelector('[data-selected-overlay]')?.remove();
      plotInfo.replaceChildren();
      get('[data-plot-link]').innerHTML=tag(url.href,'Open exact BhuNaksha Plot Info in a new tab');
      get('[data-saved-plot]').hidden=false;
      mapStatus.textContent='Open the response and save the JSON if you want to view the details here.';
    } catch(error) {mapStatus.textContent=error.message;}
  };
  get('[data-saved-plot] input').onchange=async event=>{
    const input=event.currentTarget, file=input.files[0], current=selected;
    input.value='';
    if (!file || !current) return;
    try {
      if (file.size>256*1024) throw Error('Choose a Plot Info JSON file under 256 KB.');
      const result=readSavedPlot(JSON.parse(await file.text()),current.location,current.number);
      if (selected!==current) return;
      const text=document.createElement('pre');
      text.textContent=result.info||'This file contains no Plot Info text.';
      plotInfo.replaceChildren(text);
      imported={location:current.location,id:result.id};
      highlight.hidden=!raster || sheetCodes(raster.location).join('')!==sheetCodes(current.location).join('');
      if (result.khata) {
        reportForm.elements.khata.value=result.khata;
        for (const [key,value] of Object.entries(current.location)) get('[data-code='+key+']').value=value;
        mapStatus.textContent='Plot Info imported. The linked khata is ready in Bhulekh Records of Rights.';
      } else mapStatus.textContent='Plot Info imported.';
    } catch(error) {if (selected===current) mapStatus.textContent=error.message;}
  };
  highlight.onclick=()=>{
    if (!raster || !imported) return;
    const image=new Image();
    image.alt='Selected parcel overlay';
    image.dataset.selectedOverlay='';
    image.referrerPolicy='no-referrer';
    image.onerror=()=>{if (image.isConnected) {image.remove();mapStatus.textContent='BhuNaksha could not display the selected parcel overlay.';}};
    preview.querySelector('[data-selected-overlay]')?.remove();
    preview.append(image);
    image.src=mapImageURL(raster.location,raster.bounds,imported.id).href;
  };
  reportForm.onsubmit=async event=>{
    event.preventDefault();
    const button=reportForm.querySelector('button');
    if (button.disabled) return;
    report.replaceChildren();
    print.hidden=true;
    reportData=undefined;
    get('[data-report-links]').replaceChildren();
    try {
      const location=reportLocation(place()), khata=exactPlot(reportForm.elements.khata.value);
      const hit={location:{...location,village:'Village '+location.villageCode},khata,
        front:officialRoR(location,khata,'front'),back:officialRoR(location,khata,'back')};
      get('[data-report-links]').innerHTML=tag(hit.front,'Official RoR front')+tag(hit.back,'Official RoR back');
      button.disabled=true;
      reportStatus.textContent='Reading both pages from Bhulekh…';
      const pages=await reportPair(location,khata);
      if (!root.isConnected) return;
      const panels=Object.entries(pages).map(([side,html])=>{
        const details=document.createElement('details'), summary=document.createElement('summary');
        summary.textContent=side==='front'?'Front page':'Back page and plot schedule';
        details.append(summary,copyReport(document,html,side));
        return details;
      });
      report.append(...panels);
      reportData={hit,pages};
      print.hidden=false;
      reportStatus.textContent='Both RoR pages are ready.';
    } catch(error) {
      reportStatus.textContent=error instanceof TypeError?'The report could not be read here. Open the official links.':error.message;
    } finally {button.disabled=false;}
  };
  print.onclick=()=>{
    if (reportData) {
      const {hit,pages}=reportData;
      void printHoldings([hit],reportStatus,print,(_hit,side)=>pages[side]);
    }
  };
}
