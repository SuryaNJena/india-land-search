import {officialMapBase,officialRoR} from '../dist/odisha-endpoints.mjs';
export {officialMapBase,officialRoR};
const portalOrigin = 'https://bhulekh.ori.nic.in';
const prefix = 'ctl00$ContentPlaceHolder1$';
const paths = new Set(['/', '/rorview.aspx', '/bhulekherror.aspx', '/index.aspx']);
const entities = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};

function decode(text) {
  return text.replace(/&(?:#(x[0-9a-f]+|\d+)|([a-z]+));/gi,(entity,numeric,name)=>{
    if (!numeric) return entities[name.toLowerCase()] ?? entity;
    const point = numeric.toLowerCase().startsWith('x') ? Number.parseInt(numeric.slice(1),16) : Number(numeric);
    return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

function attributes(text) {
  return new Map(Array.from(text.matchAll(/([\w:$.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g),
    ([,key,dbl,single,bare]) => [key.toLowerCase(),decode(dbl ?? single ?? bare ?? '')]));
}

export function readBhulekhForm(html) {
  const fields = new URLSearchParams(), selects = new Map();
  for (const [,source] of html.matchAll(/<input\b([^>]+)>/gi)) {
    const a = attributes(source), type = a.get('type') ?? 'text', name = a.get('name');
    if (name && !a.has('disabled') && (['hidden','text'].includes(type) || ['radio','checkbox'].includes(type) && a.has('checked'))) {
      fields.set(name,a.get('value') ?? '');
    }
  }
  for (const [,source,body] of html.matchAll(/<select\b([^>]+)>([\s\S]*?)<\/select>/gi)) {
    const a = attributes(source), name = a.get('name');
    if (!name) continue;
    const options = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<\/?option\b|$)/gi)].map(([,source,label])=>{
      const a = attributes(source);
      return {value:a.get('value') ?? '',label:decode(label.replace(/<[^>]*>/g,'')).replace(/\s+/gu,' ').trim(),selected:a.has('selected')};
    });
    selects.set(name,options);
    const chosen = options.find(option=>option.selected) ?? options[0];
    if (chosen && !a.has('disabled')) fields.set(name,chosen.value);
  }
  return {fields,selects,html};
}

class PortalError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

function responseCookies(headers) {
  return (headers.getSetCookie?.() ?? (headers.get('set-cookie')??'').split(/,(?=\s*[\w.-]+=)/))
    .flatMap(line=>{
      const pair=/^([\w.-]+)=([^;\r\n]*)/.exec(line.trim());
      return pair ? [[pair[1],pair[2]]] : [];
    });
}

function explicitSessionExpiry(status,body) {
  return status===419 || status===440 || /^\s*(?:session (?:has )?expired|session timeout)\s*[.!]?\s*$/i.test(body) ||
    /<title>\s*(?:session (?:has )?expired|session timeout)\s*<\/title>/i.test(body) ||
    /you have been timed out of the website/i.test(body);
}

function retrySeconds(value) {
  const seconds=/^\d+$/u.test(value??'') ? Number(value) : Math.ceil((Date.parse(value??'')-Date.now())/1000);
  return Number.isFinite(seconds) ? Math.max(1,seconds) : 60;
}

export function makeBhulekhReader(fetcher = fetch, delay = ms => new Promise(resolve=>setTimeout(resolve,ms))) {
  return async function readBhulekh(location, {directory=false} = {}) {
    const cookies = new Map();
    let last = 0;
    async function page(path, body, referer = portalOrigin + '/') {
      for (let redirects = 0; redirects < 4; redirects++) {
        const url = new URL(path,portalOrigin);
        if (url.origin !== portalOrigin || !paths.has(url.pathname.toLowerCase())) throw new PortalError('Bhulekh sent an unexpected route.');
        await delay(Math.max(0,650 - (Date.now() - last)));
        last = Date.now();
        const headers = new Headers({accept:'text/html',referer});
        if (cookies.size) headers.set('cookie',[...cookies].map(([name,value])=>`${name}=${value}`).join('; '));
        if (body) { headers.set('content-type','application/x-www-form-urlencoded'); headers.set('origin',portalOrigin); }
        const response = await fetcher(url,{method:body?'POST':'GET',body:body?.toString(),headers,redirect:'manual',signal:AbortSignal.timeout(12000)});
        for (const [key,value] of responseCookies(response.headers)) cookies.set(key,value);
        if ([401,403,429].includes(response.status) || response.status===503 && response.headers.has('Retry-After')) {
          const denied=[401,403].includes(response.status);
          const error=new PortalError(denied?'Bhulekh denied the live request.':'Bhulekh asked us to wait before another live request.',denied?403:429);
          error.retryAfter=Math.max(60,retrySeconds(response.headers.get('Retry-After')));
          await response.body?.cancel();
          throw error;
        }
        if ([301,302,303,307,308].includes(response.status)) {
          const target = response.headers.get('location');
          await response.body?.cancel();
          if (!target) throw new PortalError('Bhulekh redirected without a destination.');
          referer = url.href;
          path = new URL(target,url);
          if (response.status !== 307 && response.status !== 308) body = undefined;
          continue;
        }
        if (explicitSessionExpiry(response.status,'')) {
          await response.body?.cancel();
          throw new PortalError('Bhulekh reported an expired session.',440);
        }
        if (!response.ok) { await response.body?.cancel(); throw new PortalError(`Bhulekh returned HTTP ${response.status}.`); }
        return {url,form:readBhulekhForm(await response.text())};
      }
      throw new PortalError('Bhulekh could not start the public session.');
    }

    const post = ({url,form}, event, name, value) => {
      if (!form.fields.has('__VIEWSTATE')) throw new PortalError('Bhulekh session form was unavailable.');
      const body = new URLSearchParams(form.fields);
      body.set('__EVENTTARGET',event);
      body.set('__EVENTARGUMENT','');
      if (name) body.set(name,value);
      return page(url,body,url.href);
    };

    function requireActive({url,form}) {
      if (url.pathname.toLowerCase()==='/bhulekherror.aspx' && explicitSessionExpiry(200,form.html)) {
        throw new PortalError('Bhulekh reported an expired session.',440);
      }
    }

    async function readOnce() {
      let current = await page('/');
      if (current.url.pathname.toLowerCase()==='/bhulekherror.aspx' &&
          explicitSessionExpiry(200,current.form.html) && current.form.html.includes('ContentPlaceHolder1_LinkButton1')) {
        current = await post(current,prefix+'LinkButton1');
      }
      if (current.url.pathname.toLowerCase()==='/index.aspx') current=await page('/RoRView.aspx',undefined,current.url.href);
      const labels = {}, selectors = [['ddlDistrict','district'],['ddlTahsil','tehsil'],['ddlVillage','village']];
      for (const [selector,field] of selectors) {
        requireActive(current);
        const name = prefix+selector;
        const options=current.form.selects.get(name)?.filter(option=>/^0*[1-9]\d{0,5}$/.test(option.value) && option.label);
        if (!options) throw new PortalError(`Bhulekh did not return its ${field} selector.`);
        const code = location[`${field}Code`];
        if (directory && !code) return {level:field,options:options.map(({value,label})=>({code:String(Number(value)),label}))};
        const option = options.find(option=>Number(option.value)===Number(code));
        if (!option) throw new PortalError(`Bhulekh did not list that ${field} in the selected location.`,404);
        labels[field]=option.label;
        current = await post(current,name,name,option.value);
      }
      requireActive(current);
      current = await post(current,prefix+'rbtnRORSearchtype$2',prefix+'rbtnRORSearchtype','Tenant');
      requireActive(current);
      const options = current.form.selects.get(prefix+'ddlBindData');
      if (current.form.fields.get(prefix+'rbtnRORSearchtype')!=='Tenant' || !options?.length) throw new PortalError('Bhulekh did not return the tenant list.');
      const riCode = current.form.selects.get(prefix+'ddlRI')?.find(option=>option.selected)?.value.trim();
      return {labels,riCode:/^\d{1,3}$/.test(riCode??'') && Number(riCode)>0 ? String(Number(riCode)) : null,
        tenants:options.filter(option=>option.value.trim() && !['0','-1'].includes(option.value.trim()) && option.label)
          .map(option=>({name:option.label,khata:option.value.trim()}))};
    }

    try {
      return await readOnce();
    } catch (error) {
      if (error.status!==440) throw error;
      cookies.clear();
      return readOnce();
    }
  };
}

const maxMapBytes=8*1024*1024;

async function mapResponseText(response,maxBytes) {
  const reader=response.body?.getReader();
  if (!reader) return '';
  if (Number(response.headers.get('content-length'))>maxBytes) {
    await reader.cancel();
    return '';
  }
  const decoder=new TextDecoder();
  let size=0, text='';
  for (;;) {
    const {done,value}=await reader.read();
    if (done) return text+decoder.decode();
    size+=value.byteLength;
    if (size>maxBytes) { await reader.cancel(); return ''; }
    text+=decoder.decode(value,{stream:true});
  }
}

const mapGis = ({districtCode,tehsilCode,riCode,villageCode},sheet) =>
  [districtCode.padStart(2,'0'),tehsilCode.padStart(2,'0'),riCode.padStart(2,'0'),villageCode.padStart(3,'0'),sheet.padStart(2,'0')].join('');

function bhunakshaLimit(response) {
  if ([401,403].includes(response.status)) return new PortalError('BhuNaksha denied this map request.',403);
  if (response.status!==429 && !(response.status===503 && response.headers.has('Retry-After'))) return;
  const error=new PortalError('BhuNaksha asked India Land Search to wait before fetching maps.',429);
  error.retryAfter=retrySeconds(response.headers.get('Retry-After'));
  return error;
}

const terminalMapError=error=>error instanceof PortalError && [403,429,440].includes(error.status);

function makeBhunakshaSession(fetcher) {
  const cookies=new Map();
  let renewed=false;
  async function read(url,init,maxBytes) {
    const cookie=cookies.get(url.origin);
    const response=await fetcher(url,{...init,...(cookie?{headers:{cookie}}:{})});
    const limited=bhunakshaLimit(response);
    if (limited || !response.ok) {
      await response.body?.cancel();
      if (limited) throw limited;
      return {status:response.status,ok:false,text:''};
    }
    return {status:response.status,ok:true,text:await mapResponseText(response,maxBytes)};
  }
  return async function readWithRenewal(url,init,maxBytes) {
    let result=await read(url,init,maxBytes);
    if (!explicitSessionExpiry(result.status,result.text)) return result;
    const expired=()=>new PortalError('The public BhuNaksha session expired. Open the official viewer and try again.',440);
    if (renewed) throw expired();
    renewed=true;
    const viewer=new URL('/bhunaksha/',url);
    const welcome=await fetcher(viewer,{redirect:'error',signal:AbortSignal.timeout(7000)});
    const limited=bhunakshaLimit(welcome);
    const fresh=responseCookies(welcome.headers).filter(([,value])=>value);
    await welcome.body?.cancel();
    if (limited) throw limited;
    if (!welcome.ok || !fresh.length) throw expired();
    cookies.set(url.origin,fresh.map(([name,value])=>name+'='+value).join('; '));
    result=await read(url,init,maxBytes);
    if (explicitSessionExpiry(result.status,result.text)) throw expired();
    return result;
  };
}

function plotText(value) {
  return typeof value==='string'
    ? decode(value.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'')).trim().slice(0,16000)
    : '';
}

function plotKhata(html,location) {
  if (typeof html!=='string') return '';
  for (const [,attrs] of html.matchAll(/<a\b([^>]*)>/gi)) {
    try {
      const link=new URL(attributes(attrs).get('href'));
      if (link.hostname!=='bhulekh.ori.nic.in' || link.pathname.toLowerCase()!=='/viewror.aspx') continue;
      if (['DistCode','TehCode','VillCode'].some((key,i)=>link.searchParams.get(key)!==location.id.split('-')[i])) continue;
      const khata=link.searchParams.get('KhataNo')??'';
      if (officialRoR(location,khata,'front')) return khata;
    } catch { /* Ignore links without an official record URL. */ }
  }
  return '';
}

function mapSelector(html,name) {
  const selector=[...html.matchAll(/<select\b([^>]+)>([\s\S]*?)<\/select>/gi)]
    .find(([,attrs])=>['name','id'].some(key=>attributes(attrs).get(key)===name));
  if (!selector) return null;
  return [...new Map([...selector[2].matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<\/?option\b|$)/gi)].flatMap(([,attrs,body])=>{
    const value=attributes(attrs).get('value');
    if (!/^\d{1,6}$/.test(value??'') || Number(value)<1) return [];
    const code=String(Number(value));
    const text=decode(body.split(/<\/?(?:b|em|i|span|strong)\s*>/giu).join(''));
    const label=/[<>]/u.test(text) ? '' : text.replace(/^\s*\d+\s+/u,'').replace(/\s+/gu,' ').trim();
    return [[code,{code,label:label||code}]];
  })).values()];
}

async function readPublicMapResponse(request,url,fields,maxBytes=128*1024) {
  const params=fields?{method:'POST',body:new URLSearchParams(fields)}:{};
  const response=await request(url,{...params,redirect:'error',signal:AbortSignal.timeout(7000)},maxBytes);
  if (!response.ok) throw new PortalError('BhuNaksha could not return this map resource.');
  return response.text;
}

export function makeBhunakshaLocationReader(fetcher=fetch) {
  return async function readLocations(codes) {
    const request=makeBhunakshaSession(fetcher);
    if (!codes.length) {
      const url=new URL('https://bhunakshaodisha.nic.in/');
      const html=await readPublicMapResponse(request,url);
      const options=mapSelector(html,'drpdistict');
      if (!options?.length) throw new PortalError('BhuNaksha could not load the district list.');
      return {options};
    }
    const primary=new URL(officialMapBase(codes[0]));
    const standard=new URL(primary);
    standard.port='';
    const level=String(codes.length+1);
    for (const host of new Set([primary.href,standard.href])) {
      try {
        const html=await readPublicMapResponse(request,new URL('ScalarDatahandler',host),
          {OP:'2',state:'21',level,selections:codes.join(',')});
        const options=mapSelector(html,'level_'+level);
        if (options) return {options};
      } catch (error) {
        if (terminalMapError(error)) throw error;
      }
    }
    throw new PortalError('BhuNaksha could not load locations for this selection.');
  };
}

const layerKinds={
  TABLE_THEMES:{kind:'theme',name:'THEME',field:'theme_codes'},
  TABLE_LAYER_MASTER:{kind:'overlay',name:'OVERLAY_LAYER',field:'overlay_codes'},
  TABLE_DERIVED_LAYERS:{kind:'derived',name:'DERIVED_LAYER',field:'layercodes'}
};

const isOdishaCoordinate=([x,y])=>Number.isFinite(x) && Number.isFinite(y) && x>=81 && x<=89 && y>=17 && y<=24;

function verifiedMapBounds(data,gis,geographic=false) {
  if (!data || String(data.gisCode)!==gis) return null;
  const bounds=[data.xmin,data.ymin,data.xmax,data.ymax];
  if (!bounds.every(Number.isFinite) || bounds[0]>=bounds[2] || bounds[1]>=bounds[3]) return null;
  if (geographic && (!isOdishaCoordinate(bounds.slice(0,2)) || !isOdishaCoordinate(bounds.slice(2)))) return null;
  return bounds;
}

function officialWMS(base,gis,bounds,extra={}) {
  const [xMin,yMin,xMax,yMax]=bounds;
  const width=Math.max(1,Math.round(960*Math.min(1,(xMax-xMin)/(yMax-yMin))));
  const height=Math.max(1,Math.round(960*Math.min(1,(yMax-yMin)/(xMax-xMin))));
  const url=new URL('WMS',base);
  url.search=new URLSearchParams({SERVICE:'WMS',REQUEST:'GetMap',VERSION:'1.3.0',FORMAT:'image/png',
    TRANSPARENT:'true',LAYERS:'VILLAGE_MAP',STYLES:'VILLAGE_MAP',state:'21',gis_code:gis,
    CRS:'',BBOX:bounds.join(','),WIDTH:String(width),HEIGHT:String(height),...extra});
  if (extra.SRS) url.searchParams.delete('CRS');
  return url.href;
}

function verifiedProjectedBounds(data,gis,geographic) {
  const bounds=verifiedMapBounds(data,gis);
  if (!bounds) return null;
  const radius=6378137, toRadians=Math.PI/180;
  const x=longitude=>radius*longitude*toRadians;
  const y=latitude=>radius*Math.asinh(Math.tan(latitude*toRadians));
  const expected=[x(geographic[0]),y(geographic[1]),x(geographic[2]),y(geographic[3])];
  const tolerance=Math.min(50,Math.max(2,Math.min(expected[2]-expected[0],expected[3]-expected[1])*.04));
  return bounds.every((value,i)=>Math.abs(value-expected[i])<=tolerance) ? bounds : null;
}

export function makeBhunakshaLayerReader(fetcher=fetch) {
  return async function readLayers(location,sheet) {
    const request=makeBhunakshaSession(fetcher);
    const base=officialMapBase(location.districtCode);
    const gis=mapGis(location,sheet);
    const levels=[location.districtCode,location.tehsilCode,location.riCode,location.villageCode,sheet.padStart(2,'0'),''].join(',');
    const extent=new URL('rest/MapInfo/getVVVVExtentGeoref',base);
    const native=JSON.parse(await readPublicMapResponse(request,extent,{state:'21',gisLevels:levels,srs:'0'}));
    const bounds=verifiedMapBounds(native,gis);
    if (!bounds) throw new PortalError('BhuNaksha did not provide the native map extent.');
    const layers=[];
    let geographicRaster;
    try {
      const data=JSON.parse(await readPublicMapResponse(request,extent,{state:'21',giscode:gis,srs:'4326'}));
      const geographicBounds=verifiedMapBounds(data,gis,true);
      if (geographicBounds) {
        let projected;
        try {
          const data=JSON.parse(await readPublicMapResponse(request,extent,{state:'21',giscode:gis,srs:'3857'}));
          projected=verifiedProjectedBounds(data,gis,geographicBounds);
        } catch (error) {
          if (terminalMapError(error)) throw error;
        }
        const projection=projected?'EPSG:3857':'EPSG:4326';
        geographicRaster={source:'BhuNaksha official WGS84 map extent',bounds:geographicBounds,projection,
          url:officialWMS(base,gis,projected??geographicBounds,{VERSION:'1.1.1',SRS:projection})};
      }
    } catch (error) {
      if (terminalMapError(error)) throw error;
    }
    for (const [layerType,{kind,name,field}] of Object.entries(layerKinds)) {
      let items;
      try {
        const raw=await readPublicMapResponse(request,new URL('rest/Layers/getLayers',base),
          {state:'21',giscode:gis,layerType},512*1024);
        if (!raw) continue;
        items=JSON.parse(raw);
      } catch (error) {
        if (terminalMapError(error)) throw error;
        continue;
      }
      if (!Array.isArray(items)) continue;
      for (const item of items.slice(0,40)) {
        if (typeof item?.id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) || item.layerType!==layerType) continue;
        const label=plotText(item.layerDescription).slice(0,160);
        if (!label) continue;
        const url=officialWMS(base,gis,bounds,{LAYERS:name,STYLES:'',[field]:item.id+',',...(kind==='derived'?{plotId:''}:{})});
        layers.push({id:item.id,label,kind,url});
      }
    }
    return {bounds,layers,nativeRaster:officialWMS(base,gis,bounds),...(geographicRaster?{geographicRaster}:{})};
  };
}

export function makeBhunakshaPlotReader(fetcher=fetch) {
  return async function readPlot(location,sheet,parcel) {
    const request=makeBhunakshaSession(fetcher);
    const gis=mapGis(location,sheet);
    const primary=new URL(officialMapBase(location.districtCode));
    const standard=new URL(primary);
    standard.port='';
    const body=new URLSearchParams({state:'21',giscode:gis,plotid:parcel.id,plotno:parcel.number,attrs:''});
    const viewer=new URL('ScalarDatahandler',primary);
    const levels=[location.districtCode,location.tehsilCode,location.riCode,location.villageCode,sheet.padStart(2,'0'),''].join(',');
    viewer.search=new URLSearchParams({OP:'5',state:'21',levels,plotno:parcel.number});
    const attempts=[{endpoint:viewer,method:'GET'}];
    if (parcel.id) {
      attempts.unshift({endpoint:new URL('rest/MapInfo/getPlotInfo',primary),method:'POST',body});
      if (standard.href!==primary.href) attempts.push({endpoint:new URL('rest/MapInfo/getPlotInfo',standard),method:'POST',body});
    }
    let reportedMissing=false;
    for (const {endpoint,method,body} of attempts) {
      let data;
      try {
        const response=await request(endpoint,{method,body,redirect:'error',signal:AbortSignal.timeout(7000)},256*1024);
        if (!response.ok) continue;
        data=JSON.parse(response.text);
      } catch (error) {
        if (terminalMapError(error)) throw error;
        continue;
      }
      if (!data || typeof data!=='object') continue;
      if (method==='GET' && data.has_data==='N') reportedMissing=true;
      if (method==='GET' && data.has_data!=='Y') continue;
      const [id,code,number,links]=method==='GET'
        ? [data.ID,data.gisCode,data.plotNo,data.plotInfoLinks]
        : [data.plotid,data.giscode,data.plotno,data.infoLinks];
      if (typeof id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
      if (String(code)!==gis || parcel.id && id!==parcel.id || normalizeMapNumber(number)!==normalizeMapNumber(parcel.number)) {
        throw new PortalError('BhuNaksha could not verify the selected parcel.',502);
      }
      const info=plotText(data.info), area=plotText(data.formatedArea), khata=plotKhata(links,location);
      if (!info && !area && !khata) continue;
      return {info,area,khata,front:khata?officialRoR(location,khata,'front'):'',back:khata?officialRoR(location,khata,'back'):'',
        ...(!parcel.id?{id,number:normalizeMapNumber(number)}:{})};
    }
    if (reportedMissing) throw new PortalError('The official viewer reported no Plot Info for this plot number.',404);
    throw new PortalError('India Land Search couldn’t retrieve Plot Info from BhuNaksha.',502);
  };
}

function normalizeMapNumber(value) {
  return String(value??'').normalize('NFKC')
    .replace(/[\u0b66-\u0b6f]/gu,digit=>String(digit.charCodeAt(0)-0x0b66))
    .replace(/[\s\u200c\u200d]/gu,'');
}

function officialGeographicParcels(data,parcels) {
  if (!['EPSG:4326','urn:ogc:def:crs:EPSG::4326','urn:ogc:def:crs:OGC:1.3:CRS84'].includes(data.crs?.properties?.name)) return;
  const validRing=ring=>Array.isArray(ring) && ring.length>=4 &&
    ring.every(position=>Array.isArray(position) && isOdishaCoordinate(position)) &&
    ring[0][0]===ring.at(-1)[0] && ring[0][1]===ring.at(-1)[1];
  const validPolygon=polygon=>Array.isArray(polygon) && polygon.length>0 && polygon.every(validRing);
  if (!parcels.every(({geometry})=>geometry.type==='Polygon' ? validPolygon(geometry.coordinates)
    : Array.isArray(geometry.coordinates) && geometry.coordinates.length>0 && geometry.coordinates.every(validPolygon))) return;
  return {source:'BhuNaksha official WGS84 parcels',features:parcels};
}

export function makeBhunakshaReader(fetcher=fetch) {
  return async function readMap(location,sheet) {
    const request=makeBhunakshaSession(fetcher);
    const {districtCode,tehsilCode,riCode,villageCode}=location;
    const primary=officialMapBase(districtCode);
    const standard=new URL(primary);
    standard.port='';
    const legacy=['6','13','21'].includes(districtCode)?'http://bhunakshaodisha.nic.in/bhunaksha/':null;
    const sources=new Set([...(sheet?[primary,standard.href]:[standard.href,primary]),...(legacy?[legacy]:[])]);
    const selections=[districtCode,tehsilCode,riCode,villageCode].join(',');
    const gis=sheet ? mapGis(location,sheet) : '';
    let emptySelector=false;
    for (const base of sources) {
      try {
        const path=new URL(sheet?'rest/MapInfo/getVillageGeoJSon':'ScalarDatahandler',base);
        const body=new URLSearchParams(sheet ? {state:'21',giscode:gis,noCompress:'true'}
          : {OP:'2',state:'21',level:'5',selections});
        const response=await request(path,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(sheet?8500:7000)},sheet?maxMapBytes:128*1024);
        if (!response.ok) continue;
        const result=response.text;
        if (!sheet) {
          const selector=[...result.matchAll(/<select\b([^>]+)>([\s\S]*?)<\/select>/gi)]
            .find(([,attrs])=>['name','id'].some(key=>attributes(attrs).get(key)==='level_5'));
          if (!selector) continue;
          const sheets=[...new Set([...selector[2].matchAll(/<option\b([^>]+)>/gi)]
            .map(([,attrs])=>attributes(attrs).get('value')).filter(value=>/^\d{1,3}$/.test(value??'') && Number(value)>0))].sort((a,b)=>Number(a)-Number(b));
          if (sheets.length) return {sheets};
          emptySelector=true;
          continue;
        }
        const data=JSON.parse(result);
        const {features}=data;
        if (!Array.isArray(features) || !features.length || features.length>10000) continue;
        if (features.some(feature=>feature?.properties?.giscode && String(feature.properties.giscode).padStart(gis.length,'0')!==gis)) continue;
        const parcels=features.filter(item=>item?.properties?.id && item.geometry?.coordinates?.length && ['Polygon','MultiPolygon'].includes(item.geometry.type)).map(({properties,geometry})=>({
          properties:{id:String(properties.id),kide:String(properties.kide??'')},
          geometry:{type:geometry.type,coordinates:geometry.coordinates}
        }));
        if (parcels.length) {
          const geographic=officialGeographicParcels(data,parcels);
          return {gis,sheet,features:parcels,...(geographic?{geographic}:{})};
        }
      } catch(error) {
        if (terminalMapError(error)) throw error;
      }
    }
    const message=sheet?'BhuNaksha could not load this map sheet.'
      :emptySelector?'BhuNaksha lists no map sheets for this village.':'BhuNaksha could not load the list of map sheets. Try again or open the official portal.';
    throw new PortalError(message,emptySelector?404:502);
  };
}

export function readBhulekhPlotSchedule(html) {
  const schedule=/<table\b[^>]*\sid\s*=\s*["']gvRorBack["'][^>]*>([\s\S]*?)<\/table>/i.exec(html);
  if (!schedule) return null;
  const plots=new Set();
  const consolidatedPlots=new Set();
  let consolidated=false;
  let header=false;
  const value=cell=>decode(cell[2].split(/<[^>]+>/u).join(' ')).trim();
  const plotFormat=/^\d{1,12}(?:\/\d{1,12}){0,4}$/;
  const hasControl=(cell,suffix)=>[...cell[2].matchAll(/<a\b([^>]*)>/gi)]
    .some(([,attrs])=>attributes(attrs).get('id')?.match(/^gvRorBack_ctl\d+_lblPlot(cni|ci)$/i)?.[1].toLowerCase()===suffix);
  for (const [,row] of schedule[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...row.matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)];
    if (!header) {
      header=cells.length===9 && cells.every(cell=>cell[1].toLowerCase()==='h') &&
        cells.map(value).join(',')==='8,9,10,11,1,2,13,14,15';
      continue;
    }
    if (cells.length!==9 || !cells.every(cell=>cell[1].toLowerCase()==='d')) continue;
    const plot=normalizeMapNumber(value(cells[0]));
    if (plotFormat.test(plot)) plots.add(plot);
    // Consolidated reports keep block numbers in column 8 and plot links in columns 9 and 10.
    for (const [cell,suffix] of [[cells[1],'ci'],[cells[2],'cni']]) {
      if (!hasControl(cell,suffix)) continue;
      consolidated=true;
      const number=value(cell).replace(/[\u200c\u200d]/gu,'')
        .match(/^(\p{Nd}+(?:\s*\/\s*\p{Nd}+)*)(?:\s+\p{L}[\s\S]*)?$/u)?.[1];
      const id=normalizeMapNumber(number);
      if (plotFormat.test(id)) consolidatedPlots.add(id);
    }
  }
  return header ? [...(consolidated?consolidatedPlots:plots)] : null;
}

export function makeLandReviewWorker({assets,matchRows,readTenants=makeBhulekhReader(),readMap=makeBhunakshaReader(),
  readPlot=makeBhunakshaPlotReader(),readMapLocations=makeBhunakshaLocationReader(),readMapLayers=makeBhunakshaLayerReader(),
  mapSnapshots={villages:{}},nameLimit=1000,readIndex,fetchReport=fetch}) {
  const cache = new Map(), mapCache = new Map(), mapMetadataCache = new Map();
  const plotCache=new Map(), pendingPlots=new Map();
  const month=30*24*60*60*1000;
  let busyUntil = 0, pausedUntil = 0, mapPausedUntil = 0, mapBusy = false;
  const json = (status, value, headers = {}) => Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
  async function mapMetadata(key,load,cors={}) {
    const cached=mapMetadataCache.get(key);
    if (cached && Date.now()-cached.at<(key.startsWith('location/')?month:3600000)) return json(200,cached.data,cors);
    const wait=Math.ceil((mapPausedUntil-Date.now())/1000);
    if (wait>0 || mapBusy) return json(429,{error:'BhuNaksha is busy. Try the map lookup again shortly.'},{'Retry-After':String(Math.max(1,wait))});
    mapBusy=true;
    try {
      const data=await load();
      if (mapMetadataCache.size>=64) mapMetadataCache.delete(mapMetadataCache.keys().next().value);
      mapMetadataCache.set(key,{data,at:Date.now()});
      return json(200,data,cors);
    } catch (error) {
      const seconds=error.status===429 ? error.retryAfter??60 : 0;
      if (seconds) mapPausedUntil=Date.now()+seconds*1000;
      return json(error instanceof PortalError?error.status:502,
        {error:error instanceof PortalError?error.message:'The BhuNaksha map resource is temporarily unavailable.'},
        {...cors,...(seconds?{'Retry-After':String(seconds)}:{})});
    } finally {
      mapBusy=false;
    }
  }

  return {async fetch(request, env = {}) {
    const url = new URL(request.url);
    const directory = url.pathname === '/api/odisha/locations';
    const map = url.pathname === '/api/odisha/maps';
    const mapDirectory = url.pathname === '/api/odisha/map-locations';
    const indexed = url.pathname === '/api/odisha/index-search';
    const report = url.pathname === '/api/odisha/ror';
    const origin = request.headers.get('origin');
    const allowedPages = new Set(String(env.LANDREVIEW_PAGES_ORIGIN??'').split(',').map(value=>value.trim()).filter(Boolean));
    const pages = allowedPages.has(origin);
    const cors = pages ? {'Access-Control-Allow-Origin':origin,Vary:'Origin'} : {};
    const json = (status,value,headers={}) => Response.json(value,{status,headers:{'Cache-Control':'no-store',...cors,...headers}});
    if (pages && request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,
      'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
    if (!directory && !map && !mapDirectory && !indexed && !report && url.pathname !== '/api/odisha/tenant-search') {
      const asset = Object.hasOwn(assets,url.pathname) ? assets[url.pathname] : null;
      if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Not found',{status:404});
      return new Response(request.method==='HEAD'?null:asset.base64?Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0)):asset.text,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff'}});
    }
    if (request.method!=='POST') return json(405,{error:'Use POST for the tenant search.'},{Allow:'POST'});
    if (origin!==url.origin && !pages) return json(403,{error:'Run the search from the India Land Search site.'});
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415,{error:'Expected a JSON search.'});
    let input;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json(400,{error:'Enter a live search.'});
      const decoder = new TextDecoder();
      let text='', bytes=0;
      for (;;) {
        const {done,value}=await reader.read();
        if (done) break;
        bytes+=value.byteLength;
        if (bytes>512*1024) { await reader.cancel(); return json(413,{error:'Shorten the list of names and try again.'}); }
        text+=decoder.decode(value,{stream:true});
      }
      input=JSON.parse(text+decoder.decode());
    } catch { return json(400,{error:'Enter a valid search.'}); }
    if (indexed) {
      const {names,location='',offset=0}=input??{};
      if (!Array.isArray(names) || !names.length || names.length>Math.min(nameLimit,100) ||
          !names.every(name=>typeof name==='string' && name.trim() && name.length<=140) ||
          typeof location!=='string' || (location && !/^[1-9]\d{0,5}(?:-[1-9]\d{0,5}){2}$/.test(location)) ||
          !Number.isInteger(offset) || offset<0 || offset>15000) {
        return json(400,{error:'Use up to 100 spellings and a valid village filter.'},cors);
      }
      try {
        const data=await readIndex?.(env.DB,{names,location,offset});
        if (data?.invalid) return json(400,{error:'Enter a name containing letters or digits.'},cors);
        if (!data) return json(503,{code:'index_not_loaded',error:'The statewide Odisha land-record index has not been loaded.'},cors);
        return json(200,{...data,hits:data.hits.map(hit=>({...hit,
          front:officialRoR(hit.location,hit.khata,'front'),back:officialRoR(hit.location,hit.khata,'back')}))},cors);
      } catch {
        return json(503,{error:'The Odisha land-record index is temporarily unavailable.'},cors);
      }
    }
    if (mapDirectory) {
      const {location=''}=input??{};
      if (typeof location!=='string' || location && !/^[1-9]\d?(?:-[1-9]\d?){0,2}$/.test(location)) {
        return json(400,{error:'Choose a valid BhuNaksha district, tehsil or RI.'});
      }
      return mapMetadata('location/'+location,()=>readMapLocations(location?location.split('-'):[]),cors);
    }
    const parts = typeof input?.location==='string' && input.location ? input.location.split('-') : [];
    if ((map ? parts.length!==4 : directory ? parts.length>2 : parts.length!==3) || parts.some(part=>!/^[1-9]\d{0,5}$/.test(part))) {
      return json(400,{error:'Choose the district, tehsil and village from Bhulekh.'});
    }
    const [districtCode,tehsilCode,villageCode,riCode] = parts;
    const location = {id:parts.join('-'),districtCode,tehsilCode,villageCode,riCode};
    if (report) {
      const {khata,side}=input;
      const plotsOnly=input.plots===true && side==='back';
      const official=typeof khata==='string' && officialRoR(location,khata,side);
      if (!official) return json(400,{error:'Select an indexed khata and a record side.'});
      const db=env.DB;
      try {
        if (db && !plotsOnly) {
          const holding=await db.prepare('SELECT 1 FROM landreview_holdings h JOIN landreview_active a ON a.version=h.version WHERE h.village=? AND h.khata=? LIMIT 1').bind(location.id,khata).first();
          if (!holding) return json(404,{error:'This khata is unavailable in the index.'});
        }
        const now=Date.now(), lease=now+20000;
        if (db) {
          const lock=await db.prepare('INSERT INTO landreview_upstream VALUES (?,?) ON CONFLICT(portal) DO UPDATE SET until=excluded.until WHERE landreview_upstream.until<=? RETURNING until').bind('bhulekh',lease,now).first();
          if (!lock) return json(429,{error:'Another Bhulekh request is running or the portal has asked us to wait.'},{'Retry-After':'20'});
        } else {
          const wait=Math.max(busyUntil,pausedUntil)-now;
          if (wait>0) return json(429,{error:'Bhulekh is busy or is limiting requests.'},{'Retry-After':String(Math.ceil(wait/1000))});
          busyUntil=lease;
        }
        let release=now+1000;
        try {
          const response=await fetchReport(official,{headers:{accept:'text/html'},redirect:'error',signal:AbortSignal.timeout(12000)});
          if ([403,429,503].includes(response.status)) {
            const retry=response.headers.get('Retry-After');
            const expires=retry && /^\d+$/.test(retry) ? Date.now()+Number(retry)*1000 : Date.parse(retry??'');
            release=Math.max(Date.now()+60000,Number.isFinite(expires)?expires:0);
            await response.body?.cancel();
            return json(429,{error:'Bhulekh is unavailable or limiting requests.'},{'Retry-After':String(Math.ceil((release-Date.now())/1000))});
          }
          if (!response.ok || Number(response.headers.get('Content-Length'))>1024*1024) {
            await response.body?.cancel();
            return json(502,{error:'Bhulekh did not return the selected record.'});
          }
          const reader=response.body?.getReader(), decoder=new TextDecoder();
          let bytes=0, html='';
          if (!reader) return json(502,{error:'Bhulekh returned an empty record.'});
          for (;;) {
            const {done,value}=await reader.read();
            if (done) break;
            bytes+=value.byteLength;
            if (bytes>1024*1024) {await reader.cancel();return json(502,{error:'The official record exceeded the printable size limit.'});}
            html+=decoder.decode(value,{stream:true});
          }
          html+=decoder.decode();
          if (!/id=["']ContentArea["']/i.test(html)) return json(502,{error:'Bhulekh did not return the selected record.'});
          if (plotsOnly) {
            const plots=readBhulekhPlotSchedule(html);
            if (!plots?.length) return json(502,{error:'Bhulekh did not return a recognized plot schedule for this khata.'});
            return json(200,{plots});
          }
          return json(200,{html});
        } finally {
          if (db) await db.prepare('UPDATE landreview_upstream SET until=? WHERE portal=? AND until=?').bind(release,'bhulekh',lease).run();
          else if (busyUntil===lease) {
            busyUntil=0;
            pausedUntil=Math.max(pausedUntil,release);
          }
        }
      } catch {
        return json(502,{error:'The official record could not be retrieved.'});
      }
    }
    if (map) {
      const sheet=input.sheet??'';
      if (typeof sheet!=='string' || (sheet && !/^\d{1,3}$/.test(sheet))) return json(400,{error:'Choose a BhuNaksha sheet.'});
      if (input.layers===true) {
        if (!sheet || Number(sheet)<1 || Object.hasOwn(input,'parcel')) return json(400,{error:'Choose a BhuNaksha sheet for map layers.'});
        return mapMetadata('layers/'+location.id+'/'+sheet,()=>readMapLayers(location,sheet),cors);
      }
      if (Object.hasOwn(input,'parcel')) {
        const {id,number}=input.parcel??{};
        if (!sheet || Number(sheet)<1 || id!==undefined && (typeof id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) ||
            typeof number!=='string' || number.length>120 || !/^[\p{L}\p{M}\p{N}./-]{1,80}$/u.test(normalizeMapNumber(number))) {
          return json(400,{error:'Choose a valid parcel on the map.'});
        }
        const parcelKey=JSON.stringify([location.id,sheet,id,number]);
        const cached=plotCache.get(parcelKey);
        if(cached && Date.now()-cached.at<300000)return json(200,cached.data);
        const pending=pendingPlots.get(parcelKey);
        if(pending)return (await pending).clone();
        const portal=new URL('#home-pane',officialMapBase(districtCode)).href;
        const wait=Math.ceil((mapPausedUntil-Date.now())/1000);
        if (wait>0 || mapBusy) return json(429,{error:'BhuNaksha is busy. Try Plot Info again shortly.',portal},{'Retry-After':String(Math.max(1,wait))});
        mapBusy=true;
        const flight=(async()=>{
        try {
          const data=await readPlot(location,sheet,{id,number});
          if(plotCache.size>=256)plotCache.delete(plotCache.keys().next().value);
          plotCache.set(parcelKey,{at:Date.now(),data});
          return json(200,data);
        } catch(error) {
          if (error.status===429) {
            const seconds=error.retryAfter??60;
            mapPausedUntil=Date.now()+seconds*1000;
            return json(429,{error:'BhuNaksha asked us to wait before loading Plot Info.',portal},{'Retry-After':String(seconds)});
          }
          return json(error instanceof PortalError?error.status:502,
            {error:error instanceof PortalError?error.message:'BhuNaksha Plot Info is temporarily unavailable.',portal});
        } finally {
          mapBusy=false;
        }
        })();
        pendingPlots.set(parcelKey,flight);
        try {return (await flight).clone();}finally{pendingPlots.delete(parcelKey);}
      }
      const key=`${location.id}/${sheet}`, cached=mapCache.get(key);
      if (cached && Date.now()-cached.at<(cached.data.captured?300000:3600000)) return json(200,cached.data);
      if (mapBusy) return json(429,{error:'Another BhuNaksha lookup is running. Try again shortly.'},{'Retry-After':'1'});
      let data;
      mapBusy=true;
      try {
        if (Date.now()<mapPausedUntil) {
          throw new PortalError('BhuNaksha asked India Land Search to wait before fetching maps.',429);
        }
        data=await readMap(location,sheet);
      } catch(error) {
        if (error.status===429 && error.retryAfter) mapPausedUntil=Date.now()+error.retryAfter*1000;
        const village=mapSnapshots.villages[location.id];
        const saved=village && (sheet ? village[sheet] : {sheets:Object.keys(village).sort()});
        if (!saved) {
          const retry=error.status===429 ? {'Retry-After':String(Math.max(1,Math.ceil((mapPausedUntil-Date.now())/1000)))} : {};
          return json(error.status??502,{error:error instanceof PortalError?error.message:'The BhuNaksha map service could not be reached.'},retry);
        }
        const captured=sheet?saved.captured:Object.values(village).map(item=>item.captured).filter(Boolean).sort().at(-1);
        data={...saved,captured:captured??mapSnapshots.collected};
      } finally {
        mapBusy=false;
      }
      mapCache.delete(key);
      if (mapCache.size>=4) mapCache.delete(mapCache.keys().next().value);
      mapCache.set(key,{at:Date.now(),data});
      return json(200,data);
    }
    const names=input?.names;
    if (!directory && (!Array.isArray(names) || !names.length || names.length>nameLimit || !names.every(x=>typeof x==='string' && x.trim() && x.length<=140))) {
      return json(400,{error:`Search up to ${nameLimit} spellings of 140 characters each.`});
    }
    try {
      const key=`${directory?'directory':'tenants'}/${location.id}`;
      let data=cache.get(key);
      if (!data || Date.now()-data.at>(directory?month:300000)) {
        const wait=Math.ceil((pausedUntil-Date.now())/1000);
        if (wait>0) return json(429,{error:'Bhulekh is limiting live requests. Try again later.'},{'Retry-After':String(wait)});
        if (Date.now()<busyUntil) return json(429,{error:'Another live lookup is running. Try again shortly.'},{'Retry-After':'10'});
        const lease=Date.now()+30000;
        busyUntil=lease;
        try {
          data={...await readTenants(location,{directory}),at:Date.now()};
          cache.delete(key);
          if (cache.size===40) cache.delete(cache.keys().next().value);
          cache.set(key,data);
        } finally {
          if (busyUntil===lease) busyUntil=0;
        }
      }
      if (directory) return json(200,{level:data.level,options:data.options});
      const matches=matchRows(data.tenants.map(({name})=>({status:'Retrieved',info:name})),{names});
      const hits=matches.flatMap((match,i)=>{
        if (!match.fullSelected) return [];
        const {name,khata}=data.tenants[i];
        const front=officialRoR(location,khata,'front'), back=officialRoR(location,khata,'back');
        return [{tenant:name,matched:match.full,khata:front?khata:'',front,back}];
      });
      return json(200,{location:{...location,...data.labels,riCode:data.riCode},checked:data.tenants.length,hits,checkedAt:new Date(data.at).toISOString()});
    } catch(error) {
      const wait=[403,429].includes(error.status) ? error.retryAfter??60 : 0;
      if (wait) pausedUntil=Math.max(pausedUntil,Date.now()+wait*1000);
      return json(error.status??502,{error:error instanceof PortalError?error.message:'Bhulekh did not complete the live lookup. Try again shortly.'},
        wait ? {'Retry-After':String(wait)} : {});
    }
  }};
}
