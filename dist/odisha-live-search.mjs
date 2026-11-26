import {runtime} from './runtime.mjs';
const directory = new Map();

function retryDelay(value) {
  if (value==null) return 60000;
  if (/^\d+$/u.test(value)) return Number(value)*1000;
  const time=Date.parse(value);
  return Number.isFinite(time) ? Math.max(0,time-Date.now()) : 60000;
}

export async function requestBhulekh(path, input, signal) {
  const base=runtime.apiBase || globalThis.location?.origin || '';
  const endpoint=new URL('/api/odisha/'+path,base || 'http://localhost');
  const response=await fetch(endpoint,{method:'POST',mode:runtime.apiBase?'cors':'same-origin',credentials:'omit',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(input),signal});
  const data=await response.json().catch(()=>null);
  if (response.ok && data) return data;
  const error=new Error(data?.error || 'The live Bhulekh lookup did not complete.');
  error.status=response.ok ? 502 : response.status;
  if (error.status===429) error.retryDelay=retryDelay(response.headers.get('Retry-After'));
  throw error;
}

export async function loadBhulekhLocations(location, signal) {
  let entry=directory.get(location);
  if (!entry || Date.now()-entry.at>3600000) {
    const {options}=await requestBhulekh('locations',{location},signal);
    if (!Array.isArray(options)) throw Error('Bhulekh did not return a location list.');
    entry={options,at:Date.now()};
    directory.set(location,entry);
  }
  return entry.options;
}

export function walkBhulekhVillages(load, scope) {
  const stack=[scope ? {path:scope.id.split('-'),labels:[scope.district,scope.tehsil]} : {path:[],labels:[]}];
  return async function next(signal) {
    while (stack.length) {
      signal?.throwIfAborted();
      const {path,labels}=stack.at(-1);
      if (path.length===3) {
        stack.pop();
        const [district,tehsil,village]=labels;
        return {id:path.join('-'),district,tehsil,village};
      }
      const options=await load(path.join('-'),signal);
      signal?.throwIfAborted();
      stack.pop();
      for (const {code,label} of options.toReversed()) stack.push({path:[...path,code],labels:[...labels,label]});
    }
  };
}
