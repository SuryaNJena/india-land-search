import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {boundaryPlace} from '../dist/odisha-boundaries.mjs';
test('The Odisha reference map covers all districts and identifies the Mahanga sample', async ()=>{
  const load=async file=>JSON.parse(await readFile(new URL('../dist/'+file,import.meta.url)));
  const districts=await load('odisha-boundary-districts.json');
  assert.equal(districts.length,30);
  assert.equal(districts.reduce((total,row)=>total+row[2],0),53320);
  const rows=await load('odisha-boundaries-cuttack.json');
  const village=boundaryPlace(rows.find(row=>row[0]==='399616'),'Cuttack');
  assert.equal(village.village,'Bharatpada');
  assert.equal(village.portalCode,'3-11-102');
  const outline=village.polygons[0][0];
  assert.deepEqual(outline[0],outline.at(-1));
  assert.ok(outline.every(([lon,lat])=>lon>86 && lon<87 && lat>20 && lat<21));
});
