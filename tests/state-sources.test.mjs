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

test('UP resolves native map extent and verifies the exact plot before reading details',async()=>{
  const requests=[];
  const read=makeStateMapReader(async (url,init)=>{
    requests.push(url.pathname);
    if (url.pathname.endsWith('levelvalue')) return Response.json([{code:'00766',value:'Agra'}]);
    if (url.pathname.endsWith('getVVVVExtentGeoref')) {
      assert.equal(init.body.get('gisLevels'),'146,00766,124649,');
      return Response.json({gisCode:'14600766124649',crs:'EPSG:32644',xmin:1,ymin:2,xmax:31,ymax:62});
    }
    if (url.pathname.endsWith('getPlotByPlotNo')) {
      assert.equal(init.body.get('giscode'),'14600766124649');
      return Response.json(init.body.get('plotno')==='261'?{id:12345,kide:'261'}:{});
    }
    assert.deepEqual(JSON.parse(init.body),{gisCode:'14600766124649',plotNo:'261'});
    return new Response('Official Plot Info');
  });
  assert.deepEqual(await read({state:'Uttar Pradesh',levels:['146']}),{options:[{code:'00766',label:'Agra'}]});
  const search={state:'Uttar Pradesh',levels:['146','00766','124649']};
  assert.deepEqual(await read({...search,map:true}),{gis:'14600766124649',crs:'EPSG:32644',
    bbox:[1,2,31,62],width:360,height:720});
  assert.deepEqual(await read({...search,plot:'261'}),{gis:'14600766124649',id:'12345',plot:'261',
    info:'Official Plot Info',record:'https://upbhulekh.gov.in/'});
  await assert.rejects(()=>read({...search,plot:'262'}),{status:404});
  assert.equal(requests.filter(path=>path.endsWith('getPlotInfo')).length,1);
});

test('Chhattisgarh Plot Info links to the exact official khasra record',async()=>{
  const read=makeStateMapReader(async (url)=>{
    assert.equal(url.searchParams.get('levels'),'57,08,01,028,');
    return Response.json({has_data:'Y',plotNo:'1/2',gisCode:'570801.028',ID:123,info:'Plot Info<br>Area'});
  });
  const record=await read({state:'Chhattisgarh',levels:['57','08','01','028'],plot:'1/2'});
  const link=new URL(record.record);
  assert.equal(link.hostname,'revenue.cg.nic.in');
  assert.equal(link.searchParams.get('villno'),'570801.028');
  assert.equal(link.searchParams.get('khasrano'),'1/2');
  assert.equal(record.info,'Plot Info\nArea');
});

test('state map transport uses Worker-compatible redirect handling without following redirects',async()=>{
  let calls=0;
  const read=makeStateMapReader(async (url,init)=>{
    calls++;
    assert.equal(init.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:'https://example.invalid/'}});
  });
  await assert.rejects(()=>read({state:'Chhattisgarh',levels:['43']}),{status:502});
  assert.equal(calls,1);
});
