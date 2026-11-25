import assert from 'node:assert/strict';
import test from 'node:test';

const directory={
  '':[['1','North'],['2','South']],
  '1':[['1','Upper'],['2','Lower']],
  '1-1':[['7','First'],['8','Second']],
  '1-2':[],
  '2':[['1','Coast']],
  '2-1':[['7','Third']]
};

test('UT-12 the Odisha village directory walks branches lazily in portal order', async () => {
  const {walkBhulekhVillages}=await import('../dist/odisha-live-search.mjs');
  const calls=[];
  const load=async id=>{calls.push(id);return directory[id].map(([code,label])=>({code,label}));};
  const next=walkBhulekhVillages(load);
  assert.deepEqual(calls,[]);
  assert.deepEqual(await next(),{id:'1-1-7',district:'North',tehsil:'Upper',village:'First'});
  assert.deepEqual(calls,['','1','1-1']);
  assert.equal((await next()).id,'1-1-8');
  assert.equal((await next()).id,'2-1-7');
  assert.equal(await next(),undefined);
  assert.deepEqual(calls,['','1','1-1','1-2','2','2-1']);
});

test('UT-13 tehsil walk resumes a failed directory lookup without repeating villages', async () => {
  const {walkBhulekhVillages}=await import('../dist/odisha-live-search.mjs');
  let count=0;
  const load=async id=>{
    assert.equal(id,'1-1');
    if (++count===1) throw Error('Fixture timeout');
    return directory[id].map(([code,label])=>({code,label}));
  };
  const next=walkBhulekhVillages(load,{id:'1-1',district:'North',tehsil:'Upper'});
  await assert.rejects(next(),/Fixture timeout/);
  assert.equal((await next()).id,'1-1-7');
  assert.equal((await next()).id,'1-1-8');
  assert.equal(await next(),undefined);
  assert.equal(count,2);
});
