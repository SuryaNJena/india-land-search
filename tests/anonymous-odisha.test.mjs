import assert from 'node:assert/strict';
import test from 'node:test';
import {matchRows} from '../dist/core.mjs';
import {makeLandReviewWorker} from '../worker/odisha.mjs';

const origin='https://land.example';
const village='19-3-79';
const location=village+'-8';
function post(path,body,requestOrigin=origin) {
  return new Request(origin+'/api/odisha/'+path,{method:'POST',headers:{
    'content-type':'application/json',origin:requestOrigin
  },body:JSON.stringify(body)});
}

test('A signed-out visitor can select a village, search, inspect a parcel and load its plot schedule',async()=>{
  const options=[{code:'79',label:'Fixture village'}];
  const schedule='<div id="ContentArea"><table id="gvRorBack"><tr>'+
    ['8','9','10','11','1','2','13','14','15'].map(value=>'<th>'+value+'</th>').join('')+
    '</tr><tr><td>58/2</td>'+'<td></td>'.repeat(8)+'</tr></table></div>';
  const worker=makeLandReviewWorker({assets:{},matchRows,
    async readTenants(place,{directory}) {
      if (directory) return {level:'village',options};
      assert.equal(place.id,village);
      return {labels:{village:'Fixture village'},riCode:'8',tenants:[{name:'Fixture Name',khata:'9'}]};
    },
    async readMap(place,sheet) {
      assert.equal(place.id,location);
      return sheet?{sheet,gis:'19030807901',features:[]}:{sheets:['01']};
    },
    async readPlot(place,sheet,parcel) {
      assert.deepEqual([place.id,sheet,parcel.id,parcel.number],[location,'01','fixture-parcel','58/2']);
      return {info:'Fixture Plot Info'};
    },
    async fetchReport(url) {
      assert.equal(new URL(url).searchParams.get('type'),'back');
      return new Response(schedule);
    }
  });
  const assertResult=async(path,payload,check)=>{
    const response=await worker.fetch(post(path,payload));
    assert.equal(response.status,200);
    check(await response.json());
  };
  await assertResult('locations',{location:'19-3'},data=>assert.deepEqual(data.options,options));
  await assertResult('tenant-search',{location:village,names:['Fixture Name']},data=>assert.equal(data.hits[0].khata,'9'));
  await assertResult('maps',{location},data=>assert.deepEqual(data.sheets,['01']));
  await assertResult('maps',{location,sheet:'01'},data=>assert.equal(data.gis,'19030807901'));
  await assertResult('maps',{location,sheet:'01',parcel:{id:'fixture-parcel',number:'58/2'}},
    data=>assert.equal(data.info,'Fixture Plot Info'));
  await assertResult('ror',{location:village,khata:'9',side:'back',plots:true},data=>assert.deepEqual(data,{plots:['58/2']}));
  assert.equal((await worker.fetch(post('ror',{location:village,khata:'9',side:'front'}))).status,503);
  assert.equal((await worker.fetch(post('tenant-search',{location:village,names:['Fixture Name']},'https://other.example'))).status,403);
  assert.equal((await worker.fetch(post('tenant-search',{names:['Fixture Name']}))).status,400);
});

test('Public cadastral requests share an upstream slot and serve indexed or unindexed villages',async()=>{
  let entered, finish;
  const active=new Promise(resolve=>{entered=resolve;});
  const hold=new Promise(resolve=>{finish=resolve;});
  const db={prepare(){assert.fail('Map requests must not depend on the ownership index');}};
  const worker=makeLandReviewWorker({assets:{},
    async readMap(){entered();await hold;return {sheets:['01']};},
    async readPlot(){assert.fail('Plot Info must wait for an in-flight map read');}
  });
  const initial=worker.fetch(post('maps',{location}),{DB:db});
  const reached=await Promise.race([active.then(()=>true),initial.then(()=>false)]);
  assert.equal(reached,true);
  try {
    const busy=await worker.fetch(post('maps',{location,sheet:'01',parcel:{id:'fixture-parcel',number:'58/2'}}),{DB:db});
    assert.equal(busy.status,429);
    assert.equal(busy.headers.get('Retry-After'),'1');
  } finally {finish();}
  assert.equal((await initial).status,200);
});
