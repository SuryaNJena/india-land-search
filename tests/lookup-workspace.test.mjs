import assert from 'node:assert/strict';
import test from 'node:test';
import {lookupEntry} from '../dist/lookup-workspace.mjs';

const place={id:'04-01-001-01',village:'Fixture village',tehsil:'Fixture tehsil'};
const data={features:[{properties:{id:'fixture'}}]};
const map={kind:'map',place,sheet:'୦୧',data};

test('saved map lookups use the same key for padded, Odia and numeric codes',()=>{
  const first=lookupEntry(map,123);
  const second=lookupEntry({kind:'map',place:{districtCode:4,tehsilCode:1,villageCode:1,riCode:1},sheet:1,data});
  assert.equal(first.key,second.key);
  assert.equal(first.key,'map/4-1-1/1/01');
  assert.deepEqual(first.place,{...place,id:'4-1-1',districtCode:'4',tehsilCode:'1',villageCode:'1',riCode:'1'});
  assert.equal(first.savedAt,123);
  assert.equal(first.data,data);
});

test('saved plot entries preserve distinct parcels with the same displayed number',()=>{
  const entry=id=>lookupEntry({kind:'plot',place,sheet:'01',number:'୫୮/୨',data:{id,info:'fixture'}});
  assert.equal(entry('parcel1').number,'58/2');
  assert.notEqual(entry('parcel1').key,entry('parcel2').key);
});

test('a saved RoR uses the holding and village as its identity without an RI',()=>{
  const entry=lookupEntry({kind:'ror',place:{id:'4-1-1'},khata:'୫/୨',data:{front:'front page',back:'back page'}});
  assert.equal(entry.key,'ror/4-1-1/5/2');
  assert.equal(entry.title,'Khata 5/2');
  assert.throws(()=>lookupEntry({...map,place:{id:'4-1-1'}}),/location codes/);
  assert.throws(()=>lookupEntry({...map,sheet:'00'}),/valid map sheet/);
});
