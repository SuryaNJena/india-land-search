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
    if (!name || a.has('disabled')) continue;
    const options = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<\/?option\b|$)/gi)].map(([,source,label])=>{
      const a = attributes(source);
      return {value:a.get('value') ?? '',label:decode(label.replace(/<[^>]*>/g,'')).replace(/\s+/gu,' ').trim(),selected:a.has('selected')};
    });
    selects.set(name,options);
    const chosen = options.find(option=>option.selected) ?? options[0];
    if (chosen) fields.set(name,chosen.value);
  }
  return {fields,selects,html};
}

class PortalError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function makeBhulekhReader(fetcher = fetch, delay = ms => new Promise(resolve=>setTimeout(resolve,ms))) {
  return async function readTenants(location) {
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
    const selectors = [['ddlDistrict',location.districtCode],['ddlTahsil',location.tehsilCode],['ddlVillage',location.villageCode]];
    for (const [selector,code] of selectors) {
      const name = prefix+selector;
      const option = current.form.selects.get(name)?.find(option=>/^\d+$/.test(option.value) && Number(option.value)===Number(code));
      if (!option) throw new PortalError(`Bhulekh did not return the expected ${selector.slice(3).toLowerCase()} selector for this village.`);
      current = await post(current,name,name,option.value);
    }
    current = await post(current,prefix+'rbtnRORSearchtype$2',prefix+'rbtnRORSearchtype','Tenant');
    const options = current.form.selects.get(prefix+'ddlBindData');
    if (current.form.fields.get(prefix+'rbtnRORSearchtype')!=='Tenant' || !options?.length) throw new PortalError('Bhulekh did not return the tenant list.');
    return {officialVillage:current.form.selects.get(prefix+'ddlVillage')?.find(option=>option.selected)?.label,
      tenants:options.filter(option=>option.value && option.value!=='0' && option.value!=='-1' && option.label).map(option=>option.label)};
  };
}

export function makeLandReviewWorker({assets,locations,matchRows,readTenants=makeBhulekhReader(), requireIdentity=true}) {
  const cache = new Map(), known = new Map(locations.map(x=>[x.id,x]));
  let inFlight = null, pausedUntil = 0;
  const json = (status, value, headers = {}) => Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
  return {async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/odisha/tenant-search') {
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
        if (bytes>8192) { await reader.cancel(); return json(413,{error:'Shorten the list of names and try again.'}); }
        text+=decoder.decode(value,{stream:true});
      }
      input=JSON.parse(text+decoder.decode());
    } catch { return json(400,{error:'Enter a valid search.'}); }
    const location=known.get(input?.location), names=input?.names;
    if (!location || !Array.isArray(names) || !names.length || names.length>30 || !names.every(x=>typeof x==='string' && x.trim() && x.length<=140)) {
      return json(400,{error:'Choose a supported village and enter up to 30 names of 140 characters each.'});
    }
    try {
      let data=cache.get(location.id);
      if (!data || Date.now()-data.at>300000) {
        if (Date.now()<pausedUntil) return json(429,{error:'Bhulekh is limiting live requests. Try again later.'},{'Retry-After':'60'});
        if (inFlight && inFlight.id!==location.id) return json(429,{error:'Another live lookup is running. Try again shortly.'},{'Retry-After':'10'});
        if (!inFlight) {
          const promise=Promise.resolve().then(()=>readTenants(location)).then(value=>{
            const entry={...value,at:Date.now()}; cache.set(location.id,entry); return entry;
          }).catch(error=>{if(error.status===429)pausedUntil=Date.now()+60000;throw error;}).finally(()=>{inFlight=null;});
          inFlight={id:location.id,promise};
        }
        data=await inFlight.promise;
      }
      const matches=matchRows(data.tenants.map(info=>({status:'Retrieved',info})),{names});
      const hits=matches.flatMap((match,i)=>match.fullSelected?[{tenant:data.tenants[i],matched:match.full}]:[]);
      return json(200,{location,officialVillage:data.officialVillage,checked:data.tenants.length,hits,checkedAt:new Date(data.at).toISOString()});
    } catch(error) {
      return json(error.status??502,{error:error instanceof PortalError?error.message:'Bhulekh did not complete the live lookup. Try again shortly.'});
    }
  }};
}
