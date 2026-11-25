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
  const panel={innerHTML:'',querySelectorAll(selector){
    assert.equal(selector,'[data-fallback]');
    return [...this.innerHTML.matchAll(/data-fallback="(\d+)"/g)].map(([,fallback])=>({dataset:{fallback}}))
      .map(button=>{buttons.push(button);return button;});
  }};
  const buttons=[];
  const args={names:['Fixture surname'],location:'',escape:String,
    tag:(url,label)=>'<a href="'+url+'">'+label+'</a>',signal:new AbortController().signal};
  let opened=0;
  await mountIndexedResults(panel,{...args,fallback:[
    {label:'Choose a Bhulekh village',run:()=>opened++},
    {label:'Search across Odisha in batches',run:()=>opened+=10}
  ]});
  assert.match(panel.innerHTML,/your index search did not run/);
  assert.match(panel.innerHTML,/Choose a Bhulekh village/);
  assert.match(panel.innerHTML,/Search across Odisha in batches/);
  assert.match(panel.innerHTML,/Open official Bhulekh portal/);
  assert.equal(opened,0);
  buttons.forEach(button=>button.onclick());
  assert.equal(opened,11);
  await mountIndexedResults(panel,args);
  assert.doesNotMatch(panel.innerHTML,/data-fallback/);
  assert.match(panel.innerHTML,/Open official Bhulekh portal/);
});
