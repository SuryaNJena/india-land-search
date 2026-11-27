import assert from 'node:assert/strict';
import test from 'node:test';
import {placeKey,lookupPlace} from '../dist/shared-villages.mjs';
import {readVillageDirectory,geographyFor} from '../dist/state-geography.mjs';

test('shared village identity and Odisha portal codes stay scoped to the source state',()=>{
  const odisha={id:'100',state:'Odisha',portalCode:'3-11-102'};
  const cg={...odisha,state:'Chhattisgarh'};
  assert.notEqual(placeKey(odisha),placeKey(cg));
  assert.equal(lookupPlace(odisha).villageCode,'102');
  assert.equal(lookupPlace(cg),undefined);
});

test('discovery loads a state catalog and attributes it independently of the Odisha catalog',async()=>{
  assert.ok(geographyFor('Chhattisgarh').districts);
  assert.ok(geographyFor('Uttar Pradesh').districts);
  assert.equal(geographyFor('Chhattisgarh').districts,'region-cg-districts.json');
  const loads=[];
  const payload=await readVillageDirectory('Chhattisgarh',filename=>{
    loads.push(filename);
    return {rows:[['439781','Adhchara','Kabirdham','Pandariya','382',816874,221450]]};
  });
  assert.deepEqual(loads,['region-cg-villages.json']);
  assert.equal(payload.rows[0].state,'Chhattisgarh');
  assert.equal(payload.rows[0].districtCode,'382');
  assert.equal(payload.rows[0].village,'Adhchara');
  assert.match(payload.source,/Survey of India/);
});
