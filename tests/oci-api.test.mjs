import assert from 'node:assert/strict';
import test from 'node:test';
import {createLandApiServer} from '../backend/server.mjs';

async function withServer(options,run) {
  const server=createLandApiServer(options);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  try {await run(`http://127.0.0.1:${address.port}`);}
  finally {await new Promise(resolve=>server.close(resolve));}
}

test('OCI API accepts exact Pages CORS origins and forwards only bounded JSON routes',async()=>{
  let calls=0;
  const worker={async fetch(request,env) {
    calls++;
    assert.equal(env.LANDREVIEW_PAGES_ORIGIN,'https://pages.example,https://preview.example');
    return Response.json({path:new URL(request.url).pathname,origin:request.headers.get('origin')},
      {headers:{'Access-Control-Allow-Origin':request.headers.get('origin'),Vary:'Origin','Cache-Control':'no-store'}});
  }};
  await withServer({allowedOrigins:'https://pages.example, https://preview.example',worker,limiter:()=>true},async base=>{
    const preflight=await fetch(base+'/api/odisha/maps',{method:'OPTIONS',headers:{origin:'https://pages.example'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),'https://pages.example');
    assert.equal(preflight.headers.get('access-control-allow-methods'),'POST');

    const response=await fetch(base+'/api/odisha/maps',{method:'POST',headers:{
      origin:'https://preview.example','content-type':'application/json'
    },body:JSON.stringify({location:'3-11-102-8',sheet:'01'})});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{path:'/api/odisha/maps',origin:'https://preview.example'});
    assert.equal(calls,1);
  });
});

test('OCI API rejects unapproved origins and arbitrary proxy paths',async()=>{
  let calls=0;
  const worker={async fetch(){calls++;return Response.json({ok:true});}};
  await withServer({allowedOrigins:'https://pages.example',worker,limiter:()=>true},async base=>{
    const unapproved=await fetch(base+'/api/odisha/maps',{method:'POST',headers:{
      origin:'https://attacker.example','content-type':'application/json'
    },body:'{}'});
    assert.equal(unapproved.status,403);
    const arbitrary=await fetch(base+'/proxy?url=https://example.com',{headers:{origin:'https://pages.example'}});
    assert.equal(arbitrary.status,404);
    assert.equal(calls,0);
  });
});

test('OCI API caps request size, applies the IP limiter, and exposes a source-free health check',async()=>{
  let calls=0, allowed=true;
  const worker={async fetch(){calls++;return Response.json({ok:true});}};
  await withServer({allowedOrigins:'https://pages.example',worker,limiter:()=>allowed},async base=>{
    const health=await fetch(base+'/healthz');
    assert.equal(health.status,200);
    assert.deepEqual(await health.json(),{ok:true});
    const large=await fetch(base+'/api/odisha/maps',{method:'POST',headers:{
      origin:'https://pages.example','content-type':'application/json'
    },body:JSON.stringify({value:'x'.repeat(512*1024)})});
    assert.equal(large.status,413);
    allowed=false;
    const limited=await fetch(base+'/api/odisha/maps',{method:'POST',headers:{
      origin:'https://pages.example','content-type':'application/json'
    },body:'{}'});
    assert.equal(limited.status,429);
    assert.equal(limited.headers.get('retry-after'),'60');
    assert.equal(calls,0);
  });
});
