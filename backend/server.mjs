import {createServer as createHttpServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {makeLandReviewWorker} from '../worker/odisha.mjs';
import {localityIndex} from './locality-index.mjs';
import {stateSourcePath} from '../dist/state-sources.mjs';
import {matchRows} from '../dist/core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const apiPaths=new Set([
  '/api/odisha/locations','/api/odisha/map-locations','/api/odisha/maps',
  '/api/odisha/tenant-search','/api/odisha/ror',stateSourcePath
]);
const bodyLimit=512*1024;

function tokenLimiter({ratePerMinute=120,burst=12,maxClients=2048,now=()=>Date.now()}={}) {
  const clients=new Map(), rate=ratePerMinute/60000;
  return key=>{
    const time=now();
    let item=clients.get(key);
    if (!item) {
      if (clients.size>=maxClients) {
        const oldest=clients.keys().next().value;
        if (oldest!==undefined) clients.delete(oldest);
      }
      item={tokens:burst,at:time};
      clients.set(key,item);
    }
    item.tokens=Math.min(burst,item.tokens+Math.max(0,time-item.at)*rate);
    item.at=time;
    if (item.tokens<1) return false;
    item.tokens-=1;
    return true;
  };
}

async function readBody(request) {
  const declared=Number(request.headers['content-length']??0);
  if (declared>bodyLimit) throw Object.assign(Error('Request body is too large.'),{status:413});
  const chunks=[];
  let size=0;
  for await (const chunk of request) {
    size+=chunk.length;
    if (size>bodyLimit) throw Object.assign(Error('Request body is too large.'),{status:413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createLandApiServer({
  allowedOrigins=process.env.LANDREVIEW_PAGES_ORIGIN??'',
  ratePerMinute=Number(process.env.LANDREVIEW_RATE_PER_MINUTE)||120,
  burst=Number(process.env.LANDREVIEW_RATE_BURST)||12,
  worker,index,
  limiter=tokenLimiter({ratePerMinute,burst})
}={}) {
  const pagesOrigin=String(allowedOrigins).split(',').map(value=>value.trim()).filter(Boolean).join(',');
  if (!worker || typeof worker.fetch!=='function') throw Error('Provide the Odisha request worker.');
  const handler=worker;
  const server=createHttpServer(async (incoming,outgoing)=>{
    const url=new URL(incoming.url??'/', 'http://127.0.0.1');
    if (url.pathname==='/healthz' && incoming.method==='GET') {
      outgoing.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      outgoing.end('{"ok":true}');
      return;
    }
    if (!apiPaths.has(url.pathname)) {
      outgoing.writeHead(404,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
      outgoing.end('Not found');
      return;
    }

    const origin=incoming.headers.origin??'';
    const allowed=new Set(pagesOrigin.split(',').filter(Boolean));
    if (incoming.method==='OPTIONS') {
      if (!allowed.has(origin)) {
        outgoing.writeHead(403,{'cache-control':'no-store'});
        outgoing.end();
        return;
      }
      outgoing.writeHead(204,{
        'access-control-allow-origin':origin,'access-control-allow-methods':'POST',
        'access-control-allow-headers':'Content-Type','access-control-max-age':'600',
        'vary':'Origin','cache-control':'no-store'
      });
      outgoing.end();
      return;
    }
    if (incoming.method!=='POST') {
      outgoing.writeHead(405,{'allow':'POST, OPTIONS','cache-control':'no-store'});
      outgoing.end();
      return;
    }
    if (!allowed.has(origin)) {
      outgoing.writeHead(403,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      outgoing.end('{"error":"Run the search from the India Land Search site."}');
      return;
    }
    const clientIp=String(incoming.headers['x-real-ip']??incoming.socket.remoteAddress??'unknown').split('%')[0];
    if (!limiter(clientIp)) {
      outgoing.writeHead(429,{
        'content-type':'application/json; charset=utf-8','cache-control':'no-store',
        'access-control-allow-origin':origin,'vary':'Origin','retry-after':'60'
      });
      outgoing.end('{"error":"India Land Search is receiving too many requests from this connection. Wait a minute and retry."}');
      return;
    }
    try {
      const contentType=String(incoming.headers['content-type']??'');
      if (!contentType.toLowerCase().startsWith('application/json')) {
        outgoing.writeHead(415,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
          'access-control-allow-origin':origin,'vary':'Origin'});
        outgoing.end('{"error":"Expected a JSON request."}');
        return;
      }
      const bytes=await readBody(incoming);
      const request=new Request(`http://localhost${url.pathname}${url.search}`,{
        method:'POST',headers:{'content-type':'application/json',origin},body:bytes
      });
      let key,stored;
      if(index && ['/api/odisha/locations','/api/odisha/map-locations'].includes(url.pathname)){
        try {key=index.key(url.pathname,JSON.parse(bytes));if(key)stored=index.get(key);}catch{/* Upstream remains available. */}
      }
      const response=stored ? Response.json(stored,{headers:{'cache-control':'no-store'}})
        :await handler.fetch(request,{LANDREVIEW_PAGES_ORIGIN:pagesOrigin});
      if(key && !stored && response.ok){
        try {index.put(key,await response.clone().json());}catch{/* Read-through cache is optional. */}
      }
      outgoing.setHeader('Access-Control-Allow-Origin',origin);
      outgoing.setHeader('Access-Control-Expose-Headers','Retry-After');
      outgoing.setHeader('Vary','Origin');
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      if (!response.body) {outgoing.end();return;}
      for await (const chunk of response.body) outgoing.write(chunk);
      outgoing.end();
    } catch (error) {
      if (outgoing.headersSent) {outgoing.destroy();return;}
      const status=Number.isInteger(error.status)?error.status:502;
      outgoing.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
        'access-control-allow-origin':origin,'vary':'Origin'});
      outgoing.end(JSON.stringify({error:status===413?'Request body is too large.':'The source lookup could not be completed.'}));
    }
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  server.maxHeadersCount=64;
  return server;
}

async function main() {
  const snapshot=await readFile(resolve(root,'worker/odisha-map-snapshots.json'),'utf8');
  const index=process.env.LANDREVIEW_LOCALITY_INDEX?localityIndex(process.env.LANDREVIEW_LOCALITY_INDEX):undefined;
  const server=createLandApiServer({index,worker:makeLandReviewWorker({
    assets:{},matchRows,mapSnapshots:JSON.parse(snapshot)
  })});
  const host=process.env.BIND_HOST??'127.0.0.1';
  const port=Number(process.env.PORT??8787);
  server.listen(port,host,()=>process.stdout.write(`India Land Search API listening on ${host}:${port}\n`));
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{process.stderr.write(`Startup failed: ${error.message}\n`);process.exitCode=1;});
}
