import assert from 'node:assert/strict';
import test from 'node:test';
import {extractCaste, matchRows, normalize, safeURL, sourceCaste, validateWorkspace} from '../dist/core.mjs';
import {proposeNameOrders} from '../dist/name-variants.mjs';
import {assignImportState, criteriaFrom, findRecords, searchIndex, searchTerms} from '../dist/search.mjs';
import {officialRoR} from '../worker/odisha.mjs';

const row = {gis:'demo', id:'1', status:'Retrieved', info:'ଆଶା ଜେନା'};
const rules = {surnames:['ଜେନା'], names:['ଆଶା ଜେନା']};

test('UT-01 normalizes case, decomposed accents, whitespace and joiners', () => {
  assert.equal(normalize('  A\u0301sha\t JE\u200dNA  '), 'ásha jena');
  assert.deepEqual(searchTerms(' Jena, JENA;\n ଯେନା '), ['JENA', 'ଯେନା']);
});

test('UT-02 whole-token matching separates full names, surnames and longer words', () => {
  const rows = ['ଆଶା ଜେନା, ଅନ୍ୟ', '(ଜେନା)', 'ଆଶା ଜେନାମଣି'].map(info => ({...row, info}));
  const matches = matchRows(rows, rules);
  assert.deepEqual(matches.map(match => match.level), ['full', 'surname', 'none']);
  assert.equal(matches[1].fullSelected, false);
});

test('UT-03 caste evidence uses the source label and optional filtering', () => {
  const missing = {...row, info:'ଆଶା ଜେନା ଖଣ୍ଡାୟତ'};
  const labelled = {...row, info:'ଆଶା ଜେନା ଜା: ଖଣ୍ଡାଏତ'};
  assert.equal(extractCaste(missing.info, sourceCaste).status, 'Missing');
  assert.equal(extractCaste(labelled.info, sourceCaste).groups, 'ଖଣ୍ଡାୟତ');
  assert.deepEqual(matchRows([missing, labelled], {...rules, caste:sourceCaste, useCaste:true})
    .map(match => match.fullSelected), [false, true]);
});

test('UT-04 alternate name orders keep a multiword middle name together', () => {
  const name = 'Asha Devi Kumari Jena';
  const suggestions = proposeNameOrders([name, 'Jena'], []).map(item => item.spelling);
  assert.deepEqual(suggestions, [
    'Jena Devi Kumari Asha', 'Jena Asha Devi Kumari', 'Asha Jena Devi Kumari',
    'Devi Kumari Asha Jena', 'Devi Kumari Jena Asha'
  ]);
});

test('UT-05 loaded search combines geography and records searchable coverage', () => {
  const workspace = {rows:[
    {...row, state:'Odisha', district:'03', tehsil:'11', village_code:'102'},
    {...row, id:'2', state:'Odisha', district:'3', tehsil:'11', village_code:'102', status:'No plot information'},
    {...row, id:'3', state:'Bihar', district:'3', tehsil:'11', village_code:'102'}
  ]};
  const criteria = criteriaFrom({state:'Orissa', district:'3', tehsil:'011', village:'0102', names:'ଜେନା'});
  assert.deepEqual(findRecords(workspace, searchIndex(workspace), criteria), {
    stateCount:2, scopedCount:2, searchable:1, hits:[{index:0, terms:['ଜେନା']}]
  });
});

test('UT-06 state assignment preserves an explicit or recognized portal jurisdiction', () => {
  const workspace = {rows:[
    {...row, state:'Bihar'},
    {...row, id:'2', source:'https://app4bhunakshaodisha.nic.in:8443/bhunaksha/'},
    {...row, id:'3', source:'https://bhunakshaodisha.nic.in.example.net/'}
  ]};
  const assigned = assignImportState(workspace, 'Gujarat');
  assert.deepEqual(searchIndex(assigned).map(item => item.state), ['Bihar', 'Odisha', 'Gujarat']);
  assert.equal(workspace.rows[2].state, undefined);
});

test('UT-07 parcel identity is unique within a map sheet', () => {
  assert.throws(() => validateWorkspace({rows:[row, {...row}], rules}), /Duplicate parcel identity: demo\/1/);
  assert.equal(validateWorkspace({rows:[row, {...row, gis:'other'}], rules}).rows.length, 2);
});

test('UT-08 official links preserve khata fractions and reject unsupported types or URLs', () => {
  const location = {districtCode:'3', tehsilCode:'11', villageCode:'102'};
  const front = new URL(officialRoR(location, '12/3', 'front'));
  assert.equal(front.origin, 'https://bhulekh.ori.nic.in');
  assert.equal(front.searchParams.get('KhataNo'), '12/3');
  assert.equal(officialRoR(location, '12', 'payment'), '');
  assert.equal(officialRoR(location, '12&fake=1', 'back'), '');
  assert.equal(safeURL('javascript:alert(1)'), '');
  assert.equal(safeURL('https://user:pass@example.com/'), '');
});
