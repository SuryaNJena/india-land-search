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
      assert.deepEqual([place,sheet,value],[location,'01',parcel]);
      if(calls===2) throw limited;
      return {info:'Fixture Plot Info'};
    }});
  const send=(value,user='fixture')=>worker.fetch(new Request('https://land.example/api/odisha/maps',{
    method:'POST',headers:{'content-type':'application/json',origin:'https://land.example','oai-authenticated-user-id':user},
    body:JSON.stringify({location:location.id,sheet:'01',parcel:value})
  }));
  assert.equal((await send(parcel,'')).status,401);
  assert.equal((await send({id:'../parcel',number:'12/3'})).status,400);
  assert.deepEqual(await (await send(parcel)).json(),{info:'Fixture Plot Info'});
  const throttle=await send(parcel);
  assert.equal(throttle.status,429);
  assert.equal(throttle.headers.get('Retry-After'),'20');
  assert.equal((await send(parcel)).status,429);
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
  assert.deepEqual([...sheetHighlights(sheet,['12'],fromInfo).keys()],[gis+'/parcel-b',gis+'/parcel-c']);
});
