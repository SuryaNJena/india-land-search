import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
globalThis.PDFLib=require('../dist/vendor/pdf-lib.js');

import {demoNames,demoPlace,loadDemoWorkspace} from '../dist/demo.mjs';
import {matchRows,parcelKey} from '../dist/core.mjs';
import {findRecords,searchIndex} from '../dist/search.mjs';
import {combineSavedHoldings,savedHoldings} from '../dist/files.mjs';
import {makeMapPDF} from '../dist/maps.mjs';

test('Demo lookup and local proofs include two distinct khatas and a single vector overview', async ()=>{
  const data=await loadDemoWorkspace();
  assert.equal(data.demo,true);
  assert.ok(data.rows.every(row=>!row.front && !row.back));
  const result=findRecords(data,searchIndex(data),{...demoPlace,names:demoNames.join('\n')});
  assert.equal(result.hits.length,5);
  const chosen=result.hits.map(({index})=>data.rows[index]);
  const holdings=savedHoldings(chosen,data.pdfs);
  assert.deepEqual(holdings.map(group=>[group.khata,group.plots]),[['9',['101','108','109']],['10',['102','110']]]);
  const combined=await globalThis.PDFLib.PDFDocument.load(await combineSavedHoldings([...holdings,holdings[0]]));
  assert.equal(combined.getPageCount(),4);
  const matches=matchRows(data.rows,data.rules);
  const map=await makeMapPDF(data.summary,data.geometry,new Map(data.rows.map((row,i)=>[parcelKey(row),matches[i]])),false);
  assert.equal((await globalThis.PDFLib.PDFDocument.load(map)).getPageCount(),1);
});

test('Combined document rejects missing or incomplete khatas instead of emitting a partial file', async ()=>{
  const workspace=await loadDemoWorkspace();
  const saved=savedHoldings(workspace.rows,workspace.pdfs);
  await assert.rejects(combineSavedHoldings([saved[0],{key:'other',khata:'88',village:'Demo'}]),/missing for Demo, khata 88/);
  const single=await globalThis.PDFLib.PDFDocument.create();
  single.addPage();
  await assert.rejects(combineSavedHoldings([{...saved[0],document:{bytes:await single.save()}}]),/needs both sides/);
  const sameName=savedHoldings([{gis:'03110810101',village:'One',khata:'9',plot:'1'},
    {gis:'03110810102',village:'One',khata:'9',plot:'2'},{gis:'03110810201',village:'One',khata:'9',plot:'3'}],{});
  assert.deepEqual(sameName.map(({plots})=>plots),[['1','2'],['3']]);
});
