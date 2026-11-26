import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {boundaryPlace} from '../dist/odisha-boundaries.mjs';
import {resolveBoundary,unionBounds} from '../dist/location-atlas.mjs';

test('The geographic atlas covers India and scopes village boundaries by administrative identity',async()=>{
  const load=async path=>JSON.parse(await readFile(new URL('../dist/'+path,import.meta.url)));
  const {states,districts}=await load('atlas-boundaries.json');
  assert.equal(states.length,36);
  assert.equal(districts.length,30);
  const odisha=states.find(state=>state.name==='Odisha');
  assert.ok(odisha.bounds[0]<82 && odisha.bounds[2]>87);
  const district=districts.find(d=>d.code==='cuttack');
  const places=(await load('odisha-boundaries-cuttack.json')).map(row=>boundaryPlace(row,district.name));
  const place=resolveBoundary({id:'399616',district:'Cuttack',village:'Bharatpada'},places);
  assert.equal(place.portalCode,'3-11-102');
  assert.equal(resolveBoundary({district:'Cuttack',tehsil:'Mahanga',village:'Kusunpur'},places),undefined);
  assert.equal(resolveBoundary({district:'Puri',tehsil:'Mahanga',village:'Bharatpada'},places),undefined);
  assert.deepEqual(unionBounds([[1,2,3,4],[0,3,7,8]]),[0,2,7,8]);
});
