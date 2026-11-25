import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import * as variants from '../dist/name-variants.mjs';

const transliterate = createRequire(import.meta.url)('../dist/vendor/sanscript.js');
const given = ['ଜଦୁମଣି','ଯଦୁମଣି'];
const surname = ['ଜେନା','ଯେନା'];
const combinations = middle => given.flatMap(first=>surname.map(last=>[first,...middle,last].join(' ')));

test('UT-09 Odia spelling review combines both initials and keeps a middle name', () => {
  for (const [entry,middle] of [['Jadumani Jena',[]],['Yadumani Kumar Yena',['କୁମାର']]]) {
    const proposals=variants.proposeNames([entry],['or'],transliterate);
    assert.deepEqual(new Set(proposals.map(x=>x.spelling)),new Set(combinations(middle)));
    const orders=variants.proposeNameOrders([entry],proposals);
    assert.ok(orders.some(x=>x.spelling===[surname[1],...middle,given[1]].join(' ')));
  }
});

test('UT-10 Odia review can expand a typed curated spelling and unfamiliar unaspirated initials', () => {
  const typed=combinations([])[0];
  assert.deepEqual(new Set(variants.proposeNames([typed],['or'],transliterate).map(x=>x.spelling)),new Set(combinations([]).slice(1)));
  const suggestions = word => variants.proposeNames([word],['or'],transliterate).map(x=>x.spelling);
  assert.deepEqual(new Set(suggestions('Jatin').map(x=>x[0])),new Set(['ଜ','ଯ']));
  assert.deepEqual(new Set(suggestions('Jharan').map(x=>x[0])),new Set(['ଝ']));
  assert.deepEqual(suggestions('Rajendra'),['ରାଜେନ୍ଦ୍ର']);
});

test('UT-11 observed spelling counts use whole names in retrieved records', () => {
  const [seen,,unseen]=combinations([]);
  const retrieved = info => ({info,status:'Retrieved'});
  const rows=[retrieved(`(${seen}) · ${seen}`),retrieved(seen.replace(' ','\t')),retrieved(seen+'ମଣି'),{info:seen,status:'No plot information'}];
  assert.deepEqual([...variants.countObservedNames(rows,[seen,unseen])],[[seen,2]]);
});

