import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import test from 'node:test';
import {proposeNames} from '../dist/name-variants.mjs';

const sanscript=createRequire(import.meta.url)('../dist/vendor/sanscript.js');

test('UT-14 dictionary candidates keep source evidence separate from land-record evidence', () => {
  const dictionary={or:{samal:['ସାମଲ']}};
  const proposals=proposeNames(['Samal Jena'],['or'],sanscript,dictionary);
  assert.ok(proposals.some(item=>item.spelling==='ସାମଲ ଜେନା' && item.dictionaryWords===1));
  assert.ok(proposals.some(item=>item.spelling==='ସାମଲ ଯେନା' && item.dictionaryWords===1));
  assert.equal(proposeNames(['Samal'],['hi'],sanscript,dictionary).some(item=>item.dictionaryWords),false);
});

test('UT-15 the bundled Odia dictionary includes real English-to-Odia lookup pairs', async () => {
  const path=new URL('../dist/name-dictionary-or.json',import.meta.url);
  const dictionary=JSON.parse(await readFile(path,'utf8'));
  assert.ok(Object.keys(dictionary).length>10000);
  assert.ok(dictionary.jadumani.includes('ଯଦୁମଣି'));
  assert.ok(dictionary.behera.includes('ବେହେରା'));
  assert.ok(dictionary.samal.includes('ସାମଲ'));
  assert.ok(dictionary.parida.includes('ପରିଡ଼ା'));
  assert.equal(Object.hasOwn(dictionary,'__proto__'),false);
});
