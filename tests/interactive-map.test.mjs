import test from 'node:test';
import assert from 'node:assert/strict';
import * as portal from '../worker/odisha.mjs';
import * as maps from '../dist/maps.mjs';
import {sheetHighlights} from '../dist/sheet-overlays.mjs';

const location={id:'19-3-79-8',districtCode:'19',tehsilCode:'3',villageCode:'79',riCode:'8'};
const gis='19030807901';
const parcel={id:'parcel-a',number:'12/3'};
const report=(district='19')=>'http://bhulekh.ori.nic.in/ViewRoR.aspx?DistCode='+district+
  '&amp;TehCode=3&amp;VillCode=79&amp;KhataNo=7%2F1&amp;type=front';

test('Plot Info verifies the exact parcel and reconstructs only links for its official locality',async()=>{
  assert.equal(typeof portal.makeBhunakshaPlotReader,'function');
  let finalId=parcel.id;
  const read=portal.makeBhunakshaPlotReader(async (url,{body})=>{
    assert.equal(url.href,'https://bhunakshaodisha.nic.in:8443/bhunaksha/rest/MapInfo/getPlotInfo');
    assert.deepEqual(Object.fromEntries(body),{state:'21',giscode:gis,plotid:parcel.id,plotno:'12/3',attrs:''});
    return Response.json({giscode:gis,plotid:finalId,plotno:'୧୨ / ୩',info:'ଫିକ୍ସଚର ଜେନା<br>Area: 1 acre',
      infoLinks:'<a href="'+report()+'">front</a><a href="'+report('2')+'">wrong district</a><a href="javascript:void(0)">discard</a>'});
  });
  const result=await read(location,'01',parcel);
  assert.equal(result.info,'ଫିକ୍ସଚର ଜେନା\nArea: 1 acre');
  assert.equal(result.khata,'7/1');
  assert.equal(new URL(result.front).protocol,'https:');
  assert.equal(new URL(result.back).searchParams.get('type'),'back');
  finalId='different-parcel';
  await assert.rejects(read(location,'01',parcel),/verify/i);
});

test('The map route validates identity, serves one parcel, and respects BhuNaksha cooldown',async()=>{
  let calls=0;
  const limited=Object.assign(new Error('fixture cooldown'),{status:429,retryAfter:20});
  const worker=portal.makeLandReviewWorker({assets:{},readMap:async()=>assert.fail('No geometry fetch expected'),
    readPlot:async (place,sheet,value)=>{
      calls++;
      assert.deepEqual([place,sheet],[location,'01']);
      if(calls===1)assert.deepEqual(value,parcel);
      if(calls===2) throw limited;
      return {info:'Fixture Plot Info'};
    }});
  const send=value=>worker.fetch(new Request('https://land.example/api/odisha/maps',{
    method:'POST',headers:{'content-type':'application/json',origin:'https://land.example'},
    body:JSON.stringify({location:location.id,sheet:'01',parcel:value})
  }));
  assert.equal((await send({id:'../parcel',number:'12/3'})).status,400);
  assert.deepEqual(await (await send(parcel)).json(),{info:'Fixture Plot Info'});
  assert.equal((await send(parcel)).status,200);
  assert.equal(calls,1);
  const next={id:'another',number:'14'};
  const throttle=await send(next);
  assert.equal(throttle.status,429);
  assert.equal(throttle.headers.get('Retry-After'),'20');
  assert.equal((await send(next)).status,429);
  assert.equal(calls,2);
});

test('The sheet zoom preserves an anchor and clamps pan and fit',()=>{
  const base={zoom:1,x:0,y:0};
  const close=maps.zoomSheetView(base,2,[150,100],800,600);
  assert.deepEqual(close,{zoom:2,x:-150,y:-100});
  assert.deepEqual(maps.panSheetView(close,900,-1200,800,600),{zoom:2,x:0,y:-600});
  assert.deepEqual(maps.zoomSheetView(close,.1,[150,100],800,600),base);
});

test('Plot Info matches by parcel ID and RoR matches by exact plot number',()=>{
  const sheet={gis,features:[
    {properties:{id:'parcel-a',kide:'12/3'}},{properties:{id:'parcel-b',kide:'12/3'}},{properties:{id:'parcel-c',kide:'12'}}
  ]};
  const fromInfo=new Set([gis+'/parcel-b','19030807902/parcel-a']);
  const highlights=sheetHighlights(sheet,['12','12/3'],fromInfo);
  assert.equal(highlights.get(gis+'/parcel-a').level,'holding');
  assert.equal(highlights.get(gis+'/parcel-b').level,'full');
  assert.equal(highlights.get(gis+'/parcel-c').level,'holding');
});

function officialViewerRecord() {
  return {has_data:'Y',ID:parcel.id,gisCode:gis,plotNo:'୧୨ / ୩',
    info:'Verified fixture owner\nରକବା : 1 acre',plotInfoLinks:'<a href="'+report()+'">RoR</a>'};
}

test('Empty REST retrieves exact Plot Info through the official viewer lookup',async ()=>{
  const calls=[];
  const read=portal.makeBhunakshaPlotReader(async (url,options)=>{
    calls.push({url,options});
    return calls.length===1?new Response(null,{status:204}):Response.json(officialViewerRecord());
  });
  const result=await read(location,'01',parcel);
  assert.equal(result.info,'Verified fixture owner\nରକବା : 1 acre');
  assert.equal(result.khata,'7/1');
  assert.deepEqual(calls.map(({url,options})=>[url.port,url.pathname,options.method]),[
    ['8443','/bhunaksha/rest/MapInfo/getPlotInfo','POST'],
    ['8443','/bhunaksha/ScalarDatahandler','GET']
  ]);
  assert.deepEqual(Object.fromEntries(calls[1].url.searchParams),{OP:'5',state:'21',levels:'19,3,8,79,01,',plotno:'12/3'});
  assert.equal(calls[1].options.body,undefined);
});

test('Viewer fallback rejects a nearby subdivision or a parcel from another sheet',async ()=>{
  for (const mismatch of [{plotNo:'12'},{gisCode:'19030807902'},{ID:'other-parcel'}]) {
    let calls=0;
    const read=portal.makeBhunakshaPlotReader(async ()=>{
      return ++calls===1?new Response(null,{status:204}):Response.json({...officialViewerRecord(),...mismatch});
    });
    await assert.rejects(read(location,'01',parcel),/verify/i);
    assert.equal(calls,2);
  }
});

test('Plot Info fallback respects portal throttles and offers the district viewer',async ()=>{
  const calls=[];
  const readPlot=portal.makeBhunakshaPlotReader(async (url)=>{
    calls.push(url);
    return calls.length===1?new Response(null,{status:204}):new Response(null,{status:429,headers:{'Retry-After':'17'}});
  });
  const worker=portal.makeLandReviewWorker({assets:{},readPlot});
  const send=()=>worker.fetch(new Request('https://land.example/api/odisha/maps',{
    method:'POST',headers:{'content-type':'application/json',origin:'https://land.example'},
    body:JSON.stringify({location:location.id,sheet:'01',parcel})
  }));
  const result=await send();
  assert.equal(result.status,429);
  assert.equal(result.headers.get('Retry-After'),'17');
  assert.equal((await result.json()).portal,'https://bhunakshaodisha.nic.in:8443/bhunaksha/#home-pane');
  assert.equal((await send()).status,429);
  assert.equal(calls.length,2);
});

test('Viewer no-data and transport failure remain distinct and neither fabricates a report link',async ()=>{
  for (const [viewer,status] of [[{has_data:'N'},404],[null,502]]) {
    const readPlot=portal.makeBhunakshaPlotReader(async(url)=>url.pathname.endsWith('/ScalarDatahandler') && viewer
      ? Response.json(viewer) : new Response(null,{status:204}));
    const worker=portal.makeLandReviewWorker({assets:{},readPlot});
    const result=await worker.fetch(new Request('https://land.example/api/odisha/maps',{
      method:'POST',headers:{'content-type':'application/json',origin:'https://land.example'},
      body:JSON.stringify({location:location.id,sheet:'01',parcel})
    }));
    assert.equal(result.status,status);
    const data=await result.json();
    assert.match(data.portal,/\.nic\.in:8443\/bhunaksha/);
    assert.equal(data.front,undefined);
    assert.equal(data.back,undefined);
  }
});

test('Distinct parcel lookups share two slots and duplicate reads use the same slot',async()=>{
  const calls=[];
  const release=[];
  const worker=portal.makeLandReviewWorker({assets:{},readPlot:async (_place,_sheet,{number})=>{
    calls.push(number);
    await new Promise(resolve=>release.push(resolve));
    return {info:number};
  }});
  const send=number=>worker.fetch(new Request('https://land.example/api/odisha/maps',{
    method:'POST',headers:{'content-type':'application/json',origin:'https://land.example'},
    body:JSON.stringify({location:location.id,sheet:'01',parcel:{number}})
  }));
  const a=send('12/3'), b=send('13'), duplicate=send('12/3');
  try {
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(calls,['12/3','13']);
    assert.equal((await send('14')).status,429);
  } finally {release.forEach(done=>done());}
  for(const response of await Promise.all([a,b,duplicate]))assert.equal(response.status,200);
});
