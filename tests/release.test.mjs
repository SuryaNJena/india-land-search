import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {findVillages} from '../dist/village-finder.mjs';
import {indexWords,readStatewideIndex} from '../worker/statewide.mjs';
import {makeLandReviewWorker} from '../worker/odisha.mjs';
import {matchRows} from '../dist/core.mjs';

test('Village discovery finds Odia and English alternatives and leaves homonyms separate', async ()=>{
  const {rows,state}=JSON.parse(await readFile(new URL('../dist/villages.json',import.meta.url),'utf8'));
  assert.ok(rows.length>50000);
  const directory=rows.map(([id,village,local,district,tehsil,portalCode,riCode,ri,aliases])=>({id,village,local,district,tehsil,state,portalCode,riCode,ri,aliases}));
  assert.equal(findVillages(directory,'ଭରତପଡ଼ା').results[0].portalCode,'3-11-102');
  assert.equal(findVillages(directory,'Bharatapada').results[0].riCode,'8');
  assert.ok(findVillages(directory,'Kusunpur','Odisha').total>2);
  assert.equal(findVillages(directory,'Kusunpur','Kerala').total,0);
});

test('Statewide SQL import supports anonymous, scoped and incomplete search', async t=>{
  const folder=await mkdtemp(join(tmpdir(),'landreview-index-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const manifest=join(folder,'coverage.json'), rows=join(folder,'holdings.ndjson'), output=join(folder,'index.sql');
  await writeFile(manifest,JSON.stringify({version:'fixture',source:'Synthetic fixture',captured:'2026-11-24',
    catalogue:['3-11-102','19-8-164'],villages:[{code:'3-11-102',district:'Cuttack',tehsil:'Mahanga',village:'Bharatapada',ri:'8'}]}));
  await writeFile(rows,[{village:'3-11-102',tenant:'ଦେବେନ୍ଦ୍ର ଜେନା',khata:'42/1',plots:['15','15']},
    {village:'3-11-102',tenant:'ଦେବେନ୍ଦ୍ର ଜେନାର',khata:'43'}].map(row=>JSON.stringify(row)).join('\n'));
  await promisify(execFile)(process.execPath,['scripts/prepare-index.mjs',manifest,rows,output]);
  const sqlite=new DatabaseSync(':memory:');
  t.after(()=>sqlite.close());
  sqlite.exec(await readFile(new URL('../drizzle/0001_statewide.sql',import.meta.url),'utf8'));
  sqlite.exec(await readFile(output,'utf8'));
  const db={prepare(sql){
    const statement=sqlite.prepare(sql);
    const bound=(...params)=>({first:async()=>statement.get(...params),all:async()=>({results:statement.all(...params)}),run:async()=>statement.run(...params)});
    return {...bound(),bind:bound};
  }};
  assert.equal(indexWords('ଜେ\u200dନା'),indexWords('ଜେନା'));
  const worker=makeLandReviewWorker({assets:{},matchRows,readIndex:readStatewideIndex});
  const query=(input,environment={DB:db},origin='https://land.example')=>worker.fetch(new Request('https://land.example/api/odisha/index-search',{
    method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(input)
  }),environment);
  const result=await query({names:['ଜେନା']});
  assert.equal(result.status,200);
  const data=await result.json();
  assert.deepEqual(data.hits.map(hit=>[hit.khata,hit.plots]),[['42/1',['15']]]);
  assert.equal(new URL(data.hits[0].front).hostname,'bhulekh.ori.nic.in');
  assert.equal(data.coverage.complete,false);
  assert.equal((await (await query({names:['ଜେନା'],location:'3-11-102'})).json()).coverage.complete,true);
  assert.equal((await query({names:['ଜେନା']},{})).status,503);
  assert.equal((await query({names:['ଜେନା']},{DB:db},'https://unapproved.example')).status,403);
  const pages=await query({names:['ଜେନା']},{DB:db,LANDREVIEW_PAGES_ORIGIN:'https://example.github.io'},'https://example.github.io');
  assert.equal(pages.headers.get('Access-Control-Allow-Origin'),'https://example.github.io');

  const visits=[];
  const printable=makeLandReviewWorker({assets:{},matchRows,fetchReport:async url=>{
    visits.push(new URL(url));
    return new Response('<div id="ContentArea">Example record</div>');
  }});
  const report=(khata,side)=>printable.fetch(new Request('https://land.example/api/odisha/ror',{
    method:'POST',headers:{origin:'https://land.example','Content-Type':'application/json'},
    body:JSON.stringify({location:'3-11-102',khata,side})
  }),{DB:db});
  assert.equal((await report('999','front')).status,404);
  assert.equal((await report('42/1','front')).status,200);
  assert.equal((await report('42/1','back')).status,429);
  assert.deepEqual(visits.map(url=>[url.hostname,url.searchParams.get('KhataNo'),url.searchParams.get('type')]),
    [['bhulekh.ori.nic.in','42/1','front']]);
});
