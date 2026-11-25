import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {matchRows, parcelKey} from '../dist/core.mjs';
import {importFile, mergeROR, zipWorkspace} from '../dist/files.mjs';
import {makeBhulekhReader, makeLandReviewWorker} from '../worker/odisha.mjs';

const require = createRequire(import.meta.url);
globalThis.JSZip = require('../dist/vendor/jszip.js');
globalThis.PDFLib = require('../dist/vendor/pdf-lib.js');
const origin = 'https://landreview.example';
const location = '3-11-102';

function post(route, body, headers = {}) {
  return new Request(`${origin}/api/odisha/${route}`, {
    method:'POST',
    headers:{origin, 'content-type':'application/json', ...headers},
    body:JSON.stringify(body)
  });
}

function tenantFixture() {
  return {labels:{village:'Fixture village'}, riCode:'8', tenants:[
    {name:'ଆଶା ଜେନା', khata:'12/3'}, {name:'ଦୀପ ସାହୁ', khata:'15'}, {name:'ଗୋପାଳ ଯେନା', khata:'Unknown'}
  ]};
}

test('CT-01 live lookup requires an explicit village and the site origin', async () => {
  const worker = makeLandReviewWorker({assets:{}, matchRows, async readTenants(){assert.fail('Portal must not be called');}});
  const body = {names:['ଜେନା'], location};
  assert.equal((await worker.fetch(post('tenant-search', {...body, location:''}))).status, 400);
  assert.equal((await worker.fetch(post('tenant-search', body, {origin:'https://elsewhere.example'}))).status, 403);
});

test('CT-02 a village response reports coverage, returns only matches and emits links when khata is usable', async () => {
  let reads = 0;
  const worker = makeLandReviewWorker({assets:{}, matchRows, async readTenants(){reads++;return tenantFixture();}});
  const first = await worker.fetch(post('tenant-search', {location, names:['ଜେନା','ଯେନା']}));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  const result = await first.json();
  assert.equal(result.checked, 3);
  assert.deepEqual(result.hits.map(hit => hit.tenant), ['ଆଶା ଜେନା','ଗୋପାଳ ଯେନା']);
  assert.equal(new URL(result.hits[0].front).searchParams.get('type'), 'front');
  assert.equal(new URL(result.hits[0].back).searchParams.get('KhataNo'), '12/3');
  assert.equal(result.hits[1].front, '');
  const second = await worker.fetch(post('tenant-search', {location, names:['ସାହୁ']}));
  assert.deepEqual((await second.json()).hits.map(hit => hit.tenant), ['ଦୀପ ସାହୁ']);
  assert.equal(reads, 1);
});

test('CT-03 an upstream failure is reported separately from a successful zero-match search', async () => {
  let reads = 0;
  const worker = makeLandReviewWorker({assets:{}, matchRows, async readTenants(){
    if (++reads === 1) throw Error('fixture outage');
    return tenantFixture();
  }});
  const query = {location, names:['No match']};
  const unavailable = await worker.fetch(post('tenant-search', query));
  assert.equal(unavailable.status, 502);
  assert.equal(Object.hasOwn(await unavailable.json(), 'hits'), false);
  const retried = await worker.fetch(post('tenant-search', query));
  assert.equal(retried.status, 200);
  const result = await retried.json();
  assert.equal(result.checked, 3);
  assert.deepEqual(result.hits, []);
});

test('CT-04 a saved map is dated and scoped to the requested village and sheet', async () => {
  const place = `${location}-8`;
  const geometry = {gis:'03110810201', sheet:'01', features:[]};
  const worker = makeLandReviewWorker({assets:{}, matchRows,
    mapSnapshots:{collected:'2026-11-23', villages:{[place]:{'01':geometry}}},
    async readMap(){throw Error('fixture outage');}
  });
  const directory = await worker.fetch(post('maps', {location:place}));
  assert.deepEqual(await directory.json(), {sheets:['01'], captured:'2026-11-23'});
  const sheet = await worker.fetch(post('maps', {location:place, sheet:'01'}));
  assert.deepEqual(await sheet.json(), {...geometry, captured:'2026-11-23'});
  assert.equal((await worker.fetch(post('maps', {location:place, sheet:'02'}))).status, 502);
  assert.equal((await worker.fetch(post('maps', {location:'3-11-109-8', sheet:'01'}))).status, 502);
});

function workspaceFixture() {
  const row = {gis:'demo', id:'7', plot:'9/2', info:'ଆଶା ଜେନା', status:'Retrieved'};
  return {title:'Fixture', rows:[row], summary:[], rules:{names:['ଆଶା ଜେନା'], surnames:['ଜେନା']}};
}

test('CT-05 workspace v1 preserves a parcel ID, approved spellings and PDF bytes', async () => {
  const workspace = workspaceFixture();
  const key = parcelKey(workspace.rows[0]);
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save();
  workspace.pdfs = {[key]:{name:'fixture-ror.pdf', bytes}};
  const restored = await importFile(new File([await zipWorkspace(workspace)], 'fixture.zip'));
  assert.deepEqual(restored.rows, workspace.rows);
  assert.deepEqual(restored.rules, workspace.rules);
  assert.equal(restored.pdfs[key].name, 'fixture-ror.pdf');
  assert.deepEqual(restored.pdfs[key].bytes, bytes);
});

test('CT-06 a same-length edit to a workspace entry fails the checksum', async () => {
  const packageBytes = await zipWorkspace(workspaceFixture());
  const zip = await JSZip.loadAsync(packageBytes);
  zip.file('workspace.json', (await zip.file('workspace.json').async('string')).replace('Fixture','Changed'));
  const tampered = await zip.generateAsync({type:'uint8array'});
  await assert.rejects(importFile(new File([tampered], 'fixture.zip')), /Checksum failed: workspace\.json/);
});

test('CT-07 the current local PDF merge preserves front pages before back pages', async () => {
  const front = await PDFLib.PDFDocument.create();
  const back = await PDFLib.PDFDocument.create();
  front.addPage([300, 400]);
  back.addPage([301, 401]);
  back.addPage([302, 402]);
  const merged = await mergeROR(new Blob([await front.save()]), new Blob([await back.save()]));
  assert.deepEqual((await PDFLib.PDFDocument.load(merged)).getPages().map(page => page.getWidth()), [300, 301, 302]);
});

test('CT-08 a throttled Bhulekh session stops and another lookup waits', async () => {
  let upstreamRequests = 0;
  const readTenants = makeBhulekhReader(async () => {
    upstreamRequests++;
    return new Response('Fixture rate limit', {status:429, headers:{'Retry-After':'120'}});
  }, async () => {});
  const worker = makeLandReviewWorker({assets:{}, matchRows, readTenants});
  const throttled = await worker.fetch(post('tenant-search', {location, names:['ଜେନା']}));
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers.get('Retry-After'), '120');
  const paused = await worker.fetch(post('tenant-search', {location:'3-11-109', names:['ଯେନା']}));
  assert.equal(paused.status, 429);
  assert.ok(Number(paused.headers.get('Retry-After')) > 60);
  assert.equal(upstreamRequests, 1);
});
