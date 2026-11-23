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
        const setCookie = response.headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ?? '').split(/,(?=\s*[\w.-]+=)/);
        for (const line of setCookie) {
          const pair = /^([\w.-]+)=([^;\r\n]*)/.exec(line.trim());
          if (pair) cookies.set(pair[1],pair[2]);
        }
        if (response.status === 429 || response.status === 403) {
          await response.body?.cancel();
          throw new PortalError('Bhulekh is limiting requests. Try again later.',429);
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

    let current = await page('/');
    if (current.url.pathname.toLowerCase()==='/bhulekherror.aspx' && current.form.html.includes('ContentPlaceHolder1_LinkButton1')) {
      current = await post(current,prefix+'LinkButton1');
    }
    if (current.url.pathname.toLowerCase()==='/index.aspx') current=await page('/RoRView.aspx',undefined,current.url.href);
    const labels = {}, selectors = [['ddlDistrict','district'],['ddlTahsil','tehsil'],['ddlVillage','village']];
    const choices = selector => current.form.selects.get(prefix+selector)?.filter(option=>/^0*[1-9]\d{0,5}$/.test(option.value) && option.label);
    for (const [selector,field] of selectors) {
      const name = prefix+selector;
      const options = choices(selector);
      if (!options) throw new PortalError(`Bhulekh did not return its ${field} selector.`);
      const code = location[`${field}Code`];
      if (directory && !code) return {level:field,options:options.map(({value,label})=>({code:String(Number(value)),label}))};
      const option = options.find(option=>Number(option.value)===Number(code));
      if (!option) throw new PortalError(`Bhulekh did not list that ${field} in the selected location.`,404);
      labels[field]=option.label;
      current = await post(current,name,name,option.value);
    }
    current = await post(current,prefix+'rbtnRORSearchtype$2',prefix+'rbtnRORSearchtype','Tenant');
    const options = current.form.selects.get(prefix+'ddlBindData');
    if (current.form.fields.get(prefix+'rbtnRORSearchtype')!=='Tenant' || !options?.length) throw new PortalError('Bhulekh did not return the tenant list.');
    const riCode = current.form.selects.get(prefix+'ddlRI')?.find(option=>option.selected)?.value.trim();
    return {labels,riCode:/^\d{1,3}$/.test(riCode??'') && Number(riCode)>0 ? String(Number(riCode)) : null,
      tenants:options.filter(option=>option.value.trim() && !['0','-1'].includes(option.value.trim()) && option.label)
        .map(option=>({name:option.label,khata:option.value.trim()}))};
  };
}

// District assignments from the official BhuNaksha Odisha district picker.
const mapServers = [
  ['app4',443,['7','8','18']], ['app4',8443,['3','17','29']],
  ['app3',443,['20','23','26']], ['app3',8443,['5','24','28']],
  ['app2',443,['11','22','27']], ['app2',8443,['12','15','30']],
  ['app1',443,['1','10','16']], ['app1',8443,['2','9','25']],
  ['',8443,['4','14','19']]
];

export function officialMapBase(districtCode) {
  const [server,port]=mapServers.find(([, ,districts])=>districts.includes(districtCode)) ?? ['',443];
  return `https://${server}bhunakshaodisha.nic.in${port===443?'':`:${port}`}/bhunaksha/`;
}

export function makeBhunakshaReader(fetcher=fetch) {
  return async function readMap(location,sheet) {
    const {districtCode,tehsilCode,riCode,villageCode}=location;
    const primary=officialMapBase(districtCode);
    const standard=new URL(primary); standard.port='';
    const legacy=['6','13','21'].includes(districtCode)?'http://bhunakshaodisha.nic.in/bhunaksha/':'https://app4bhunakshaodisha.nic.in:8443/bhunaksha/';
    const sources=new Set([...(sheet?[primary,standard.href]:[standard.href,primary]),legacy]);
    for (const base of sources) {
      try {
        if (!sheet) {
          const path=new URL('ScalarDatahandler',base);
          path.search=new URLSearchParams({OP:'2',state:'21',level:'5',selections:`${districtCode},${tehsilCode},${riCode},${villageCode},`});
          const response=await fetcher(path,{redirect:'error',signal:AbortSignal.timeout(7000)});
          if (!response.ok) { await response.body?.cancel(); continue; }
          const sheets=[...new Set([...String(await response.text()).matchAll(/<option\b([^>]+)>/gi)]
            .map(([,text])=>attributes(text).get('value')).filter(value=>/^\d{1,3}$/.test(value??'') && Number(value)>0))].sort((a,b)=>Number(a)-Number(b));
          if (sheets.length) return {sheets};
          continue;
        }
        const gis=[districtCode.padStart(2,'0'),tehsilCode.padStart(2,'0'),riCode.padStart(2,'0'),villageCode.padStart(3,'0'),sheet.padStart(2,'0')].join('');
        const response=await fetcher(new URL('rest/MapInfo/getVillageGeoJSon',base),{method:'POST',body:new URLSearchParams({state:'21',giscode:gis,noCompress:'true'}),
          redirect:'error',signal:AbortSignal.timeout(8500)});
        if (!response.ok || Number(response.headers.get('content-length'))>8*1024*1024) { await response.body?.cancel(); continue; }
        const text=await response.text();
        if (text.length>8*1024*1024) continue;
        const {features}=JSON.parse(text);
        if (!Array.isArray(features) || !features.length || features.length>10000) continue;
        if (features.some(feature=>feature?.properties?.giscode && String(feature.properties.giscode).padStart(gis.length,'0')!==gis)) continue;
        const parcels=features.filter(item=>item?.properties?.id && item.geometry?.coordinates?.length && ['Polygon','MultiPolygon'].includes(item.geometry.type)).map(({properties,geometry})=>({
          properties:{id:String(properties.id),kide:String(properties.kide??'')},geometry
        }));
        if (parcels.length) return {gis,sheet,features:parcels};
      } catch { /* Try the alternate official Odisha map endpoint. */ }
    }
    throw new PortalError(sheet?'BhuNaksha did not return this map sheet.':'BhuNaksha did not return any map sheets for this village.');
  };
}

export function officialRoR(location,khata,type) {
  if (!/^\d{1,12}(?:\/\d{1,12}){0,4}$/.test(khata) || !['front','back'].includes(type)) return '';
  const url=new URL('/ViewRoR.aspx',portalOrigin);
  url.search=new URLSearchParams({DistCode:location.districtCode,TehCode:location.tehsilCode,VillCode:location.villageCode,KhataNo:khata,type});
  return url.href;
}

export function makeLandReviewWorker({assets,matchRows,readTenants=makeBhulekhReader(),readMap=makeBhunakshaReader(),mapSnapshots={villages:{}},nameLimit=1000,requireIdentity=true}) {
  const cache = new Map(), mapCache = new Map();
  let busyUntil = 0, pausedUntil = 0;
  const json = (status, value, headers = {}) => Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
  return {async fetch(request) {
    const url = new URL(request.url);
    const directory = url.pathname === '/api/odisha/locations';
    const map = url.pathname === '/api/odisha/maps';
    if (!directory && !map && url.pathname !== '/api/odisha/tenant-search') {
      const asset = Object.hasOwn(assets,url.pathname) ? assets[url.pathname] : null;
      if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Not found',{status:404});
      return new Response(request.method==='HEAD'?null:asset.text,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff'}});
    }
    if (request.method!=='POST') return json(405,{error:'Use POST for the tenant search.'},{Allow:'POST'});
    if (request.headers.get('origin')!==url.origin) return json(403,{error:'Run the search from the LandReview Site.'});
    if (requireIdentity && !request.headers.get('oai-authenticated-user-id')) return json(401,{error:'Sign in with ChatGPT to run a live search.'});
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
    const parts = typeof input?.location==='string' && input.location ? input.location.split('-') : [];
    if ((map ? parts.length!==4 : directory ? parts.length>2 : parts.length!==3) || parts.some(part=>!/^[1-9]\d{0,5}$/.test(part))) {
      return json(400,{error:'Choose the district, tehsil and village from Bhulekh.'});
    }
    const [districtCode,tehsilCode,villageCode,riCode] = parts;
    const location = {id:parts.join('-'),districtCode,tehsilCode,villageCode,riCode};
    if (map) {
      const sheet=input.sheet??'';
      if (typeof sheet!=='string' || (sheet && !/^\d{1,3}$/.test(sheet))) return json(400,{error:'Choose a BhuNaksha sheet.'});
      const key=`${location.id}/${sheet}`, cached=mapCache.get(key);
      if (cached && Date.now()-cached.at<(cached.data.captured?300000:3600000)) return json(200,cached.data);
      let data;
      try {
        data=await readMap(location,sheet);
      } catch(error) {
        const village=mapSnapshots.villages[location.id];
        const saved=village && (sheet ? village[sheet] : {sheets:Object.keys(village).sort()});
        if (!saved) return json(error.status??502,{error:error instanceof PortalError?error.message:'The BhuNaksha map service could not be reached.'});
        data={...saved,captured:mapSnapshots.collected};
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
      if (!data || Date.now()-data.at>(directory?3600000:300000)) {
        if (Date.now()<pausedUntil) return json(429,{error:'Bhulekh is limiting live requests. Try again later.'},{'Retry-After':'60'});
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
      if (error.status===429) pausedUntil=Date.now()+60000;
      return json(error.status??502,{error:error instanceof PortalError?error.message:'Bhulekh did not complete the live lookup. Try again shortly.'});
    }
  }};
}
