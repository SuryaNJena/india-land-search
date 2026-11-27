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
