import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVillage,resolveRI} from '../dist/shared-villages.mjs';

test('a unique district and tehsil restrict official village resolution',async()=>{
  const calls=[];
  const lists={'':[{code:'3',label:'Cuttack'}],3:[{code:'11',label:'Mahanga'}],'3-11':[{code:'102',label:'Bharatpada'},{code:'5',label:'Bharatpur'}]};
  const p={id:'399616',district:'Cuttack',tehsil:'Mahanga',village:'Bharatpada'};
  const result=await resolveVillage(p,async key=>{calls.push(key);return lists[key]});
  assert.equal(result.match.portalCode,'3-11-102');
  assert.deepEqual(calls,['','3','3-11']);
  const fuzzy=await resolveVillage({...p,village:'Bharatpuda'},async key=>lists[key]);
  assert.equal(fuzzy.match,undefined);
  assert.ok(fuzzy.candidates.some(c=>c.portalCode==='3-11-102'));
});
test('homonyms need review and RI is confirmed from the map directory',async()=>{
  const p={village:'Karnapur',tehsil:'Talacher',district:'Angul'};
  const result=await resolveVillage(p,async key=>({'':[{label:'Angul',code:'1'}],1:[{label:'Talacher',code:'2'}],'1-2':[{code:'7',label:'Karnapur'},{code:'8',label:'Karnapur'}]})[key]);
  assert.equal(result.match,undefined);
  assert.equal(result.candidates.length,2);
  const read=async key=>({'1-2':[{code:'3',label:'North'},{code:'4',label:'South'}],'1-2-3':[{code:'2',label:'Karnapur'}],'1-2-4':[{code:'7',label:'Karnapur'}]})[key];
  assert.equal((await resolveRI(result.candidates[0],read)).riCode,'4');
});
