import test from 'node:test';
import assert from 'node:assert/strict';
import {localityIndex} from '../backend/locality-index.mjs';
test('shared official menus expire monthly and exclude personal search responses',()=>{
  let time=0;const index=localityIndex(':memory:',{now:()=>time});
  try {
    assert.equal(index.key('/api/odisha/tenant-search',{}),undefined);
    const key=index.key('/api/odisha/map-locations',{location:'3-11'});
    index.put(key,{options:[{code:'8',label:'Kurujanga',extra:'discard'}],unrelated:'discard'});
    assert.deepEqual(index.get(key),{options:[{code:'8',label:'Kurujanga'}]});
    time=31*86400000;assert.equal(index.get(key),undefined);
  } finally {index.close();}
});

