import {strict as assert} from 'node:assert';
import test from 'node:test';
import {withPublicGeometry} from '../dist/workspace-maps.mjs';

const gis='19030807901';
const feature={properties:{id:'fixture-parcel',kide:'12/3'}};
const saved={gis,sheet:'01',features:[feature],captured:'2026-11-24'};
const lookup=async()=>new Map([[gis,saved]]);
const workspace=row=>({rows:[{gis,village:'Fixture village',village_code:'79',id:'fixture-parcel',plot:'12/3',...row}],summary:[],geometry:{}});

test('A dated public sheet joins locally by GIS, parcel ID, and exact plot number',async()=>{
  const file=workspace({plot:'୧୨ / ୩'});
  const result=await withPublicGeometry(file,lookup);
  assert.deepEqual(result.geometry,{[gis]:saved});
  assert.equal(result.summary[0].captured,'2026-11-24');
  assert.equal(result.summary[0].name,'Fixture village');
  assert.deepEqual(file.geometry,{});
  assert.deepEqual((await withPublicGeometry(workspace({plot:'12'}),lookup)).geometry,{});
  assert.deepEqual((await withPublicGeometry(workspace({id:'other-parcel'}),lookup)).geometry,{});
  assert.deepEqual((await withPublicGeometry(workspace({gis:'19030807902'}),lookup)).geometry,{});
});

test('Imported geometry works without requesting the public catalogue',async()=>{
  const file={...workspace({}),geometry:{[gis]:{features:[feature]}}};
  assert.equal(await withPublicGeometry(file,()=>assert.fail('Bundled data is optional')),file);
});
