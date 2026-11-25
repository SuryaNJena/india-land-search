import test from 'node:test';
import assert from 'node:assert/strict';
import {readBhulekhPlotSchedule,makeLandReviewWorker} from '../worker/odisha.mjs';
import {sheetHighlights,localMapLayer} from '../dist/sheet-overlays.mjs';

const schedule='<div id="ContentArea"><table><tr><td><table id="gvRorBack">'
  + '<tr>'+['8','9','10','11','1','2','13','14','15'].map(value=>`<th>${value}</th>`).join('')+'</tr>'
  + ['୧୨ / ୩','12/3','12','', 'Unverified'].map(plot=>`<tr><td>${plot}</td>${'<td>999</td>'.repeat(8)}</tr>`).join('')
  + '</table></td></tr></table></div>';

test('Official plot schedule selects only column 8, normalizes Odia digits, and preserves subdivisions',()=>{
  assert.deepEqual(readBhulekhPlotSchedule(schedule),['12/3','12']);
  assert.equal(readBhulekhPlotSchedule(schedule.replace('<th>8</th>','<th>7</th>')),null);
});
test('Anonymous scoped map matches receive only plot IDs from the fixed official back report',async()=>{
  const calls=[];
  const worker=makeLandReviewWorker({assets:{},fetchReport:async url=>{calls.push(new URL(url));return new Response(schedule);}});
  const req=()=>new Request('https://sample.example/api/odisha/ror',{method:'POST',
    headers:{'content-type':'application/json',origin:'https://sample.example'},
    body:JSON.stringify({location:'19-3-79',khata:'234/1',side:'back',plots:true})});
  const response=await worker.fetch(req());
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{plots:['12/3','12']});
  assert.equal(calls[0].origin,'https://bhulekh.ori.nic.in');
  assert.equal(calls[0].searchParams.get('KhataNo'),'234/1');
  assert.equal(calls[0].searchParams.get('type'),'back');
});

const sheet={gis:'19030807901',features:[{properties:{id:'a',kide:'12'}},{properties:{id:'b',kide:'12/3'}}]};
const poly={type:'Polygon',coordinates:[[[86.4,20.5],[86.41,20.51],[86.42,20.5],[86.4,20.5]]]};
const geographic=(giscode,geometry=poly)=>({type:'FeatureCollection',features:[{properties:{id:'b',kide:'12/3',giscode,owner:'private'},geometry}]});
test('A matched subdivision highlights only its exact polygon',()=>{
  assert.deepEqual([...sheetHighlights(sheet,['୧୨ / ୩']).keys()],['19030807901/b']);
  assert.deepEqual([...sheetHighlights(sheet,['12']).keys()],['19030807901/a']);
});
test('Geographic import requires a matching sheet and geographic coordinates and omits unrelated properties',()=>{
  assert.deepEqual(localMapLayer(geographic(sheet.gis),sheet).features[0].properties,{id:'b',kide:'12/3'});
  assert.throws(()=>localMapLayer(geographic('19030807902'),sheet),/current sheet/);
  assert.throws(()=>localMapLayer(geographic(sheet.gis,{type:'Polygon',coordinates:[[[1418,809],[1420,810],[1421,808],[1418,809]]]}),sheet),/current sheet/);
});
