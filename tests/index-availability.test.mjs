import assert from 'node:assert/strict';
import test from 'node:test';
import {mountIndexedResults} from '../dist/indexed-results.mjs';
import {makeLandReviewWorker} from '../worker/odisha.mjs';

function indexRequest() {
  const origin='https://land.example';
  return new Request(origin+'/api/odisha/index-search',{
    method:'POST',headers:{origin,'Content-Type':'application/json'},
    body:JSON.stringify({names:['Fixture surname']})
  });
}

test('The index API distinguishes a missing dataset from a temporary outage', async ()=>{
  const empty=makeLandReviewWorker({assets:{},readIndex:async()=>null});
  const missing=await empty.fetch(indexRequest());
  assert.equal(missing.status,503);
  assert.equal((await missing.json()).code,'index_not_loaded');

  const broken=makeLandReviewWorker({assets:{},readIndex:async()=>{throw Error('fixture outage');}});
  const unavailable=await broken.fetch(indexRequest());
  assert.equal(unavailable.status,503);
  assert.notEqual((await unavailable.json()).code,'index_not_loaded');
});

test('An unloaded statewide index gives hosted users a village-picker action and retains the official link',async t=>{
  const empty=makeLandReviewWorker({assets:{},readIndex:async()=>null});
  t.mock.method(globalThis,'fetch',()=>empty.fetch(indexRequest()));
  const button={};
  const panel={innerHTML:'',querySelector(selector){
    return selector==='[data-choose-village]' && this.innerHTML.includes('data-choose-village') ? button : null;
  }};
  const args={names:['Fixture surname'],location:'',escape:String,
    tag:(url,label)=>'<a href="'+url+'">'+label+'</a>',signal:new AbortController().signal};
  let opened=0;
  await mountIndexedResults(panel,{...args,onChooseVillage:()=>opened++});
  assert.match(panel.innerHTML,/Your statewide search did not run/);
  assert.match(panel.innerHTML,/Open official Bhulekh portal/);
  assert.equal(opened,0);
  button.onclick();
  assert.equal(opened,1);
  await mountIndexedResults(panel,args);
  assert.doesNotMatch(panel.innerHTML,/data-choose-village/);
  assert.match(panel.innerHTML,/Open official Bhulekh portal/);
});
