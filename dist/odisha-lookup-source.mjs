import {officialMapBase,officialRoR} from './odisha-endpoints.mjs';
import {plotNumber} from './sheet-overlays.mjs';
import {runtime} from './runtime.mjs';

export const mapPortal='https://bhunakshaodisha.nic.in/';
export const reportPortal='https://bhulekh.ori.nic.in/';
export const districtMapBase=districtCode=>new URL(officialMapBase(districtCode));

export const locationFields=[
  {code:'districtCode',label:'District',name:'district',width:2},
  {code:'tehsilCode',label:'Tehsil',name:'tehsil',width:2},
  {code:'riCode',label:'RI',name:'ri',width:2},
  {code:'villageCode',label:'Village',name:'village',width:3}
];

export function cleanPlace(input, requireRI) {
  const place={};
  for (const {code,label,name,width} of locationFields) {
    if (code==='riCode' && !requireRI) continue;
    const value=plotNumber(input[code]);
    if (!new RegExp('^\\d{1,'+width+'}$').test(value) || Number(value)<1) {
      throw Error('Enter the official '+label.toLowerCase()+' code.');
    }
    place[code]=String(Number(value));
    place[name]=input[name] || label+' '+place[code];
  }
  place.id=[place.districtCode,place.tehsilCode,place.villageCode].join('-');
  return place;
}

export function cleanSheet(value) {
  const number=plotNumber(value);
  if (!/^\d{1,2}$/.test(number) || Number(number)<1) throw Error('Enter a sheet number from 01 to 99.');
  return number.padStart(2,'0');
}

export function cleanNumber(value,label) {
  const number=plotNumber(value);
  if (!/^\d{1,12}(?:\/\d{1,12}){0,4}$/.test(number)) throw Error('Enter an exact '+label+', such as 58 or 58/2.');
  return number;
}

export const mapLocation=place=>[place.districtCode,place.tehsilCode,place.villageCode,place.riCode].join('-');

export function sheetGIS(place,sheet) {
  return [place.districtCode.padStart(2,'0'),place.tehsilCode.padStart(2,'0'),
    place.riCode.padStart(2,'0'),place.villageCode.padStart(3,'0'),sheet].join('');
}

export function sheetLevels(place,sheet) {
  return [place.districtCode,place.tehsilCode,place.riCode,place.villageCode,sheet,''].join(',');
}

export function officialPlotURL(place,sheet,number) {
  const url=new URL('ScalarDatahandler',districtMapBase(place.districtCode));
  url.search=new URLSearchParams({OP:'5',state:'21',levels:sheetLevels(place,sheet),plotno:number});
  return url.href;
}

export const reportURL=officialRoR;

export function checkBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length!==4 || !bounds.every(Number.isFinite) ||
      bounds[0]>=bounds[2] || bounds[1]>=bounds[3]) throw Error('Enter native sheet bounds in xmin, ymin, xmax, ymax order.');
  return bounds;
}

export function readSheetExtent(data,place,sheet) {
  if (String(data?.gisCode)!==sheetGIS(place,sheet)) throw Error('This extent does not match the selected sheet.');
  return checkBounds([data.xmin,data.ymin,data.xmax,data.ymax]);
}

export function readSheetGeometry(data,place,sheet) {
  const gis=sheetGIS(place,sheet);
  if (!Array.isArray(data?.features) || !data.features.length || data.features.length>10000) {
    throw Error('Choose a BhuNaksha GeoJSON response with 1 to 10,000 parcels.');
  }
  const point=xy=>Array.isArray(xy) && xy.length>=2 && Number.isFinite(xy[0]) && Number.isFinite(xy[1]);
  const ring=positions=>Array.isArray(positions) && positions.length>=4 && positions.every(point) &&
    positions[0][0]===positions.at(-1)[0] && positions[0][1]===positions.at(-1)[1];
  const polygon=rings=>Array.isArray(rings) && rings.length>0 && rings.every(ring);
  const ids=new Set();
  const features=data.features.map(({properties,geometry}={})=>{
    const id=String(properties?.id??'');
    if (String(properties?.giscode??'').padStart(gis.length,'0')!==gis || !/^[A-Za-z\d_-]{1,128}$/.test(id) || ids.has(id)) {
      throw Error('The geometry does not identify unique parcels for this exact sheet.');
    }
    ids.add(id);
    const {type,coordinates}=geometry??{};
    if (type==='Polygon' ? !polygon(coordinates) : type!=='MultiPolygon' || !Array.isArray(coordinates) ||
      !coordinates.length || !coordinates.every(polygon)) throw Error('The response contains invalid parcel geometry.');
    return {properties:{id,kide:typeof properties.kide==='string'?properties.kide.slice(0,64):String(properties.kide??'')},
      geometry:{type,coordinates}};
  });
  const crs=data.crs?.properties?.name;
  const wgs84=['EPSG:4326','urn:ogc:def:crs:EPSG::4326','urn:ogc:def:crs:OGC:1.3:CRS84'].includes(crs) &&
    features.every(({geometry:{type,coordinates}})=>(type==='Polygon'?[coordinates]:coordinates).every(polygon=>
      polygon.every(ring=>ring.every(([x,y])=>x>=81 && x<=89 && y>=17 && y<=24))));
  return {gis,sheet,features,...(wgs84?{geographic:{source:'Official BhuNaksha WGS84 geometry',features}}:{})};
}

export function mapImageURL(place,sheet,bounds) {
  const [left,bottom,right,top]=checkBounds(bounds);
  const ratio=(right-left)/(top-bottom);
  const url=new URL('WMS',districtMapBase(place.districtCode));
  url.search=new URLSearchParams({SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetMap',FORMAT:'image/png',
    TRANSPARENT:'true',LAYERS:'VILLAGE_MAP',STYLES:'VILLAGE_MAP',state:'21',gis_code:sheetGIS(place,sheet),
    overlay_codes:'',CRS:'',BBOX:bounds.join(','),WIDTH:String(Math.max(1,Math.round(760*Math.min(1,ratio)))),
    HEIGHT:String(Math.max(1,Math.round(760*Math.min(1,1/ratio))))});
  return url.href;
}

export function readExactPlot(data,place,sheet,number) {
  if (data?.has_data!=='Y' || data.gisCode!==sheetGIS(place,sheet) || plotNumber(data.plotNo)!==number ||
      typeof data.ID!=='string' || !/^[a-z\d_-]{1,128}$/i.test(data.ID) || typeof data.info!=='string') {
    throw Error('This Plot Info file does not match the selected sheet and plot.');
  }
  let khata='';
  for (const [,href] of String(data.plotInfoLinks??'').matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url=new URL(href.replaceAll('&amp;','&'));
      const candidate=url.searchParams.get('KhataNo');
      if (url.protocol==='https:' && url.hostname==='bhulekh.ori.nic.in' && url.pathname.toLowerCase()==='/viewror.aspx' &&
        ['DistCode','TehCode','VillCode'].every((key,i)=>Number(url.searchParams.get(key))===Number(place.id.split('-')[i])) &&
        /^\d{1,12}(?:\/\d{1,12}){0,4}$/.test(candidate??'')) {
        khata=candidate;
        break;
      }
    } catch { /* Ignore non-report links. */ }
  }
  return {id:data.ID,number,info:data.info.replace(/<br\s*\/?>/gi,'\n').slice(0,16000),
    area:typeof data.formatedArea==='string'?data.formatedArea.slice(0,150):'',khata,
    front:khata?reportURL(place,khata,'front'):'',back:khata?reportURL(place,khata,'back'):''};
}

export function safeMapRaster(value,gis) {
  try {
    const url=new URL(value);
    if (url.protocol==='https:' && !url.username && !url.password && ['', '8443'].includes(url.port) &&
        /^(?:app[1-4])?bhunakshaodisha\.nic\.in$/.test(url.hostname) &&
        url.pathname==='/bhunaksha/WMS' && (url.searchParams.get('gis_code') || url.searchParams.get('giscode'))===gis) return url.href;
  } catch { /* Only official raster URLs for this exact sheet are displayed. */ }
  return '';
}

export async function postOdisha(path,input,signal) {
  const base=runtime.apiBase || globalThis.location?.origin || '';
  const endpoint=new URL('/api/odisha/'+path,base || 'http://localhost');
  const response=await fetch(endpoint,{method:'POST',mode:runtime.apiBase?'cors':'same-origin',credentials:'omit',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(input),signal});
  const data=await response.json().catch(()=>null);
  if (response.ok && data) return data;
  const error=Error(data?.error || 'The official Odisha lookup is unavailable. Try again later.');
  error.status=response.status;
  const after=response.headers.get('Retry-After');
  if(after && /^\d+$/.test(after))error.retryAfter=Number(after);
  if (data?.portal) error.portal=data.portal;
  throw error;
}

async function readReport(response) {
  const reader=response.body?.getReader();
  if (!reader) throw Error('Bhulekh returned an empty document.');
  const decoder=new TextDecoder();
  let html='', size=0;
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

export async function directReport(place,khata,side,signal) {
  if (runtime.hosted || runtime.apiBase) {
    const data=await postOdisha('ror',{location:place.id,khata,side},signal);
    if (typeof data.html!=='string') throw Error('Bhulekh returned an empty report.');
    return data.html;
  }
  return readPublicReport(place,khata,side,signal);
}

export async function readPublicReport(place,khata,side,signal) {
  const response=await fetch(reportURL(place,khata,side),{credentials:'omit',redirect:'error',
    signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status===403 || response.status===429) throw Error('Bhulekh paused requests. Try again later.');
    throw Error('Bhulekh could not load the '+side+' page.');
  }
  return readReport(response);
}
