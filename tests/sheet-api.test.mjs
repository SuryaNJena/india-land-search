import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {makeBhunakshaReader, makeLandReviewWorker} from '../worker/odisha.mjs';

const kapaleswar={districtCode:'19',tehsilCode:'3',villageCode:'79',riCode:'8'};
const fixtureOrigin='https://landreview.example';
const portalHost='bhunakshaodisha.nic.in';
const kapaleswarCode='19-3-79-8';
const snapshotUrl=new URL('../worker/odisha-map-snapshots.json',import.meta.url);

const request=(location,sheet='')=>new Request(fixtureOrigin+'/api/odisha/maps',{
  method:'POST',headers:{origin:fixtureOrigin,'content-type':'application/json'},
  body:JSON.stringify({location,sheet})
});

test('Kapaleswar uses the browser sheet form on HTTPS and the assigned map server for parcel geometry', async ()=>{
  const calls=[];
  const reader=makeBhunakshaReader(async (url,request)=>{
    calls.push({url,request});
    if (url.pathname.endsWith('ScalarDatahandler')) {
      return new Response('<select id="other"><option value="99">Other</option></select><select id="level_5"><option value="03">03</option><option value="02">02</option><option value="01">01</option></select>');
    }
    return Response.json({features:[{
      properties:{id:'parcel-id',kide:'536/2607',giscode:'19030807901',info:'ignored',pniu:'ignored'},
      geometry:{type:'Polygon',coordinates:[[[1418,808],[1436,810],[1436,802],[1418,808]]]}
    }]});
  });
  assert.deepEqual(await reader(kapaleswar,''),{sheets:['01','02','03']});
  assert.deepEqual((await reader(kapaleswar,'01')).features[0].properties,{id:'parcel-id',kide:'536/2607'});
  assert.equal(calls.length,2);
  assert.equal(calls[0].url.origin,'https://'+portalHost);
  assert.equal(calls[0].request.method,'POST');
  assert.deepEqual(Object.fromEntries(calls[0].request.body),{OP:'2',state:'21',level:'5',selections:'19,3,8,79'});
  assert.equal(calls[1].url.origin,'https://'+portalHost+':8443');
  assert.equal(calls[1].request.body.get('giscode'),'19030807901');
});

test('Kapaleswar has dated, exact-sheet fallback data if the hosted worker cannot reach BhuNaksha', async ()=>{
  const mapSnapshots=JSON.parse(await readFile(snapshotUrl,'utf-8'));
  const site=makeLandReviewWorker({assets:{},requireIdentity:false,mapSnapshots,
    async readMap(){throw Error('fixture transport error');}});
  assert.deepEqual(await (await site.fetch(request(kapaleswarCode))).json(),{sheets:['01','02','03'],captured:'2026-11-24'});
  const one=await (await site.fetch(request(kapaleswarCode,'01'))).json();
  assert.equal(one.gis,'19030807901');
  assert.equal(one.features.length,1773);
  assert.equal(one.sourceUpdated,'2026-11-03');
  const three=await (await site.fetch(request(kapaleswarCode,'03'))).json();
  assert.equal(three.gis,'19030807903');
  assert.equal(three.features.length,8);
  assert.equal(three.sourceUpdated,'2017-10-21');
  assert.equal((await site.fetch(request('19-3-78-8','01'))).status,502);
});

test('A BhuNaksha throttle does not fan out across hosts or trigger another lookup during cooldown', async ()=>{
  let calls=0;
  const readMap=makeBhunakshaReader(async ()=>{
    calls++;
    return new Response('Throttle',{status:429,headers:{'Retry-After':'30'}});
  });
  const site=makeLandReviewWorker({assets:{},requireIdentity:false,readMap});
  const first=await site.fetch(request(kapaleswarCode));
  assert.equal(first.status,429);
  assert.ok(Number(first.headers.get('retry-after'))>0);
  const retry=await site.fetch(request(kapaleswarCode,'01'));
  assert.equal(retry.status,429);
  assert.equal(calls,1);
});

test('BhuNaksha distinguishes a recognized empty selector from an upstream error page', async ()=>{
  const empty=makeBhunakshaReader(async ()=>new Response('<select name="level_5"><option value="0">Choose</option></select>'));
  const serviceError=makeBhunakshaReader(async ()=>new Response('<select id="level_1"><option value="19">Kendrapara</option></select>'));
  await assert.rejects(empty(kapaleswar,''),{status:404});
  await assert.rejects(serviceError(kapaleswar,''),{status:502});
});
