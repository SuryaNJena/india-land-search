import test from 'node:test';
import assert from 'node:assert/strict';
import {officialVillagePath,matchOfficialLocation} from '../dist/state-map-location.mjs';
import {forgetPlace,placeKey,rememberPlace} from '../dist/shared-villages.mjs';

const tangarghat={state:'Chhattisgarh',id:'434821',districtCode:'386',district:'Raigarh',tehsil:'Tamnar',village:'Tangarghat'};

test('Tangarghat resolves to the independently verified official village hierarchy',()=>{
  assert.deepEqual(officialVillagePath(tangarghat),['41','08','03','289']);
  assert.deepEqual(officialVillagePath({...tangarghat,id:'other',village:'Other'}),['41']);
  assert.deepEqual(officialVillagePath({...tangarghat,districtCode:'378'}),['43']);
  assert.deepEqual(officialVillagePath({...tangarghat,state:'Odisha'}),[]);
  assert.deepEqual(officialVillagePath({...tangarghat,districtCode:undefined}),['41','08','03','289']);
});

test('a saved reference village retains its district ID and representative point',()=>{
  const center=[83.5762,22.0743];
  const saved=rememberPlace({...tangarghat,center});
  try {
    assert.deepEqual(saved.center,center);
    assert.deepEqual(officialVillagePath(saved),['41','08','03','289']);
  } finally {forgetPlace(placeKey(saved));}
});

test('official location choices preserve source codes and leave ambiguous labels for review',()=>{
  const rows=[{code:'41',label:'रायगढ़'},{code:'42',label:'Raigarh'},{code:'43',label:'Raigarh'}];
  assert.equal(matchOfficialLocation(rows,'41','Raigarh')?.code,'41');
  assert.equal(matchOfficialLocation(rows,'99','Raigarh'),undefined);
  assert.equal(matchOfficialLocation(rows,undefined,'Raigarh'),undefined);
  assert.equal(matchOfficialLocation(rows,undefined,'रायगढ़')?.code,'41');
});

test('village suggestions rank close English and local-script spellings within their state',async()=>{
  const {createRequire}=await import('node:module');
  const sanscript=createRequire(import.meta.url)('../dist/vendor/sanscript.js');
  const {findVillages}=await import('../dist/village-finder.mjs');
  const rows=[tangarghat,{...tangarghat,id:'x',village:'Tangarpur'},
    {id:'y',state:'Odisha',village:'Bharatpada',local:'ଭରତପଡ଼ା',district:'Cuttack',tehsil:'Mahanga'}];
  assert.equal(findVillages(rows,'Tangerghat','Chhattisgarh',20,sanscript).results[0]?.id,'434821');
  assert.equal(findVillages(rows,'टांगरघाट','Chhattisgarh',20,sanscript).results[0]?.id,'434821');
  assert.equal(findVillages(rows,'ଭରତପଡା','Odisha',20,sanscript).results[0]?.id,'y');
  assert.equal(findVillages(rows,'टांगरघाट','Odisha',20,sanscript).total,0);
});

test('a probable localized official label requires a choice',async()=>{
  const {createRequire}=await import('node:module');
  const sanscript=createRequire(import.meta.url)('../dist/vendor/sanscript.js');
  const {suggestOfficialLocations}=await import('../dist/state-map-location.mjs');
  const options=[{code:'289',label:'टांगरघाट'},{code:'310',label:'आमाघाट'}];
  assert.equal(matchOfficialLocation(options,undefined,'Tangerghat'),undefined);
  assert.equal(suggestOfficialLocations(options,'Tangerghat',sanscript)[0]?.code,'289');
});
