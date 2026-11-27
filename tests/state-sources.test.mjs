import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStateMapReader} from '../worker/odisha.mjs';
import {stateSources} from '../dist/state-sources.mjs';

test('all five states provide HTTPS links to the official lookup and map',()=>{
  assert.deepEqual(Object.keys(stateSources),['Chhattisgarh','Bihar','Jharkhand','Rajasthan','Uttar Pradesh']);
  for (const source of Object.values(stateSources)) {
    assert.match(source.records,/^https:\/\//);
    assert.match(source.map,/^https:\/\//);
  }
});

test('live map directory keeps leading zeroes and scopes requests to a fixed host',async()=>{
  const requests=[];
  const read=makeStateMapReader(async (url,init)=>{
    requests.push([url,init]);
    return new Response('<select id="level_2"><option value="">Select</option><option value="08">08 Tehsil</option></select>');
  });
  assert.deepEqual(await read({state:'Chhattisgarh',levels:['43']}),{options:[{code:'08',label:'Tehsil'}]});
  assert.equal(requests[0][0].href,'https://bhunaksha.cg.nic.in/bhunaksha/ScalarDatahandler');
  assert.equal(requests[0][1].body.get('selections'),'43,');
  for (const input of [{state:'https://example.org'},{state:'Chhattisgarh',levels:['../']}]) {
    await assert.rejects(()=>read(input),{status:400});
  }
  assert.equal(requests.length,1);
});

test('map loading uses the source gis identifier and validates parcel geometry',async()=>{
  const geometry={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]};
  const requests=[];
  const read=makeStateMapReader(async (url,{body})=>{
    requests.push([url.pathname,Object.fromEntries(body)]);
    if (url.pathname.endsWith('getVVVVExtentGeoref')) return Response.json({gisCode:'570801.028'});
    return Response.json({features:[
      {properties:{id:'123',kide:'1/2',giscode:'570801.028'},geometry},
      {properties:{id:'124',kide:'3',giscode:'another'},geometry},
      {properties:{id:'125',kide:'4'},geometry:{type:'Polygon',coordinates:[[[0,0],['oops',0],[1,1],[0,0]]]}}
    ]});
  });
  const data=await read({state:'Chhattisgarh',levels:['57','08','01','028'],map:true});
  assert.equal(requests[0][1].gisLevels,'57,08,01,028,');
  assert.equal(requests[1][1].giscode,'570801.028');
  assert.deepEqual(data,{gis:'570801.028',features:[{properties:{id:'123',kide:'1/2'},geometry}]});
});

test('the state map relay preserves a source rate limit without retrying',async()=>{
  let called=0;
  const read=makeStateMapReader(async ()=>{called++;return new Response('',{status:429,headers:{'Retry-After':'75'}});});
  await assert.rejects(()=>read({state:'Chhattisgarh',levels:['43']}),{status:429,retryAfter:75});
  assert.equal(called,1);
});
