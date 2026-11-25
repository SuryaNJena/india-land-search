import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extractCaste,matchRows,sourceCaste,suggestSurname,validateWorkspace,parcelKey} from './dist/core.mjs';
import {exportWorkbook,exportRORBundle,zipWorkspace,importFile} from './dist/files.mjs';
import {makeMapPDF} from './dist/maps.mjs';
import {portals} from './dist/portals.mjs';
import {statePaths} from './dist/india-states.mjs';
import {assignImportState, criteriaFrom, findRecords, searchIndex} from './dist/search.mjs';
import {proposeNames,proposeNameOrders,recordLanguages,suggestedLanguages} from './dist/name-variants.mjs';
import {makeLandReviewWorker,readBhulekhForm,makeBhulekhReader,makeBhunakshaReader,officialMapBase,officialRoR} from './worker/odisha.mjs';

const require=createRequire(import.meta.url);
globalThis.JSZip=require('./dist/vendor/jszip.js');
globalThis.PDFLib=require('./dist/vendor/pdf-lib.js');
const sanscript=require('./dist/vendor/sanscript.js');
const sample={gis:'demo',id:'1',plot:'101/2',info:'ଆଶା ଜେନା ଜା: ଖଣ୍ଡାୟତ',status:'Retrieved',village:'Sample',sheet:'01',khata:'1',front:'https://example.com/front'};
const rules={surnames:['ଜେନା','ଯେନା'],names:['ଆଶା ଜେନା'],useCaste:true,caste:sourceCaste};
const geometry={demo:{features:[{properties:{id:'1',kide:'101/2'},geometry:{type:'Polygon',coordinates:[[[0,0],[0,3],[4,3],[4,0],[0,0]]]}}]}};
const data=validateWorkspace({title:'Sample',rows:[sample],summary:[{gis:'demo',name:'Sample',sheet:'01',village:'DEMO'}],rules,geometry});
const matches=matchRows(data.rows,rules);
assert.equal(matches[0].level,'full');
assert.equal(matchRows([{...sample,info:'ଆଶା ଜେନା ଜା: ପାଣ'}],rules)[0].level,'none');
assert.equal(extractCaste('ଜା: ଖଣ୍ଡାୟତ, ଜା: କଣ୍ଡରା',sourceCaste).status,'Mixed / review');
assert.equal(suggestSurname('Jena','or').filter(x=>x.source==='Curated spelling').length,2);
assert.equal(new Set(portals.map(x=>x.name)).size,36);
assert.deepEqual(Object.keys(statePaths).sort(),portals.map(x=>x.name).sort());
assert.deepEqual(findRecords(null,[],criteriaFrom({state:'Odisha',names:'ଜେନା'})),{stateCount:0,scopedCount:0,searchable:0,hits:[]});
const multiState = assignImportState({rows:[
  {...sample,state:'Odisha',tehsil:'010',ri_name:'Example Circle',village_code:'021'},
  {...sample,id:'2',state:'Bihar',village_code:'021'},
  {...sample,id:'3',village:'Other village',village_code:'022',info:'',status:'No plot information'},
  {...sample,id:'4',source:'https://app4bhunakshaodisha.nic.in:8443/bhunaksha/',village:'Third village',village_code:'023'}
]},'Odisha');
const multiIndex = searchIndex(multiState);
const odishaSearch = filters => findRecords(multiState,multiIndex,criteriaFrom({state:'Odisha',names:'ଜେନା',...filters}));
assert.deepEqual(multiIndex.map(x=>x.state),['Odisha','Bihar','Odisha','Odisha']);
assert.deepEqual(odishaSearch({}).hits.map(x=>x.index),[0,3]);
assert.equal(odishaSearch({}).searchable,2);
assert.equal(odishaSearch({tehsil:'10',ri:'example circle',village:'21, 22'}).scopedCount,1);
assert.equal(odishaSearch({tehsil:'99'}).scopedCount,0);
assert.deepEqual(odishaSearch({state:'Bihar'}).hits.map(x=>x.index),[1]);
assert.ok(portals.every(({name})=>suggestedLanguages(name).every(code=>Object.hasOwn(recordLanguages,code))));
assert.ok(Object.values(recordLanguages).every(([,scheme])=>Object.hasOwn(sanscript.schemes,scheme)));
const proposed = (text,state) => proposeNames([text],suggestedLanguages(state),sanscript).map(x=>x.spelling);
for (const expected of ['ଦେବେନ୍ଦ୍ର କୁମାର ଜେନା','ଦେବେନ୍ଦ୍ର କୁମାର ଯେନା']) assert.ok(proposed('Debendra Kumar Jena','Odisha').includes(expected));
assert.ok(proposed('Patel','Gujarat').includes('પટેલ'));
assert.ok(proposed('Rajan','Tamil Nadu').includes('ராஜன்'));
assert.ok(proposed('Kaur','Punjab').includes('ਕੌਰ'));
assert.ok(proposed('Khan','Jammu and Kashmir').includes('خان'));
assert.deepEqual(proposed('ଜେନା','Odisha'),[]);
assert.deepEqual(proposed('Sangma','Meghalaya'),[]);
const sourceName='Debendra Kumar Jena';
const permutations=proposeNameOrders([sourceName],proposeNames([sourceName],['or'],sanscript)).map(item=>item.spelling);
assert.ok(permutations.includes('Jena Kumar Debendra'));
assert.ok(permutations.includes('ଯେନା କୁମାର ଦେବେନ୍ଦ୍ର'));
assert.ok(!permutations.includes(sourceName));
assert.equal(new Set(permutations).size,permutations.length);
assert.deepEqual(matchRows([sample],{names:['ଆଶା ଜେନା',...Array.from({length:40},(_,i)=>`fixture ${i}`)]})[0].full,['ଆଶା ଜେନା']);
const prefix='ctl00$ContentPlaceHolder1$';
const picker=(field,value,label)=>`<select name="${prefix}${field}"><option selected="selected" value="${value}">${label}</option></select>`;
const form=(...controls)=>'<input type="hidden" name="__VIEWSTATE" value="test&amp;state">'+controls.join('');
assert.equal(readBhulekhForm(form()).fields.get('__VIEWSTATE'),'test&state');
const sequence=[form(picker('ddlDistrict','3','Cuttack')),form(picker('ddlTahsil','11','Mahanga')),form(picker('ddlVillage','102','Bharatapada')),form(),form(`<input type="radio" name="${prefix}rbtnRORSearchtype" value="Tenant" checked>`,picker('ddlVillage','102','Bharatapada'),picker('ddlBindData','12/3 ','ଆଶା ଜେନା'),`<select disabled name="${prefix}ddlRI"><option selected value="08">Kurujanga</option></select>`)];
const posts=[];
const lookup=makeBhulekhReader(async (url, options)=>{
  if (options.method==='POST') {
    assert.equal(options.headers.get('cookie'),'ASP.NET_SessionId=fixtures');
    posts.push(new URLSearchParams(options.body).get('__EVENTTARGET'));
  }
  return new Response(sequence.shift(),{headers:{'set-cookie':'ASP.NET_SessionId=fixtures; path=/; HttpOnly'}});
},async()=>{});
const site=makeLandReviewWorker({assets:{},matchRows,readTenants:lookup});
const api='https://landreview.example/api/odisha/tenant-search';
const request=(headers={})=>new Request(api,{method:'POST',headers:{origin:'https://landreview.example','content-type':'application/json',...headers},body:JSON.stringify({location:'3-11-102',names:['ଜେନା']})});
assert.equal((await site.fetch(request())).status,401);
assert.equal((await site.fetch(request({origin:'https://elsewhere.example'}))).status,403);
const tenantResult=await site.fetch(request({'oai-authenticated-user-id':'fixture-user'}));
assert.equal(tenantResult.status,200);
const tenant=(await tenantResult.json());
assert.equal(tenant.hits[0].tenant,'ଆଶା ଜେନା');
assert.equal(tenant.location.riCode,'8');
assert.equal(tenant.hits[0].khata,'12/3');
assert.equal(new URL(tenant.hits[0].front).searchParams.get('KhataNo'),'12/3');
assert.equal(new URL(tenant.hits[0].back).searchParams.get('type'),'back');
assert.equal(officialRoR({districtCode:'3',tehsilCode:'11',villageCode:'102'},'Unknown','front'),'');
assert.deepEqual(posts,['ddlDistrict','ddlTahsil','ddlVillage','rbtnRORSearchtype$2'].map(x=>prefix+x));
const directorySite=makeLandReviewWorker({assets:{},matchRows,requireIdentity:false,async readTenants(location,{directory}){
  assert.equal(directory,true);
  assert.equal(location.districtCode,'17');
  return {level:'tehsil',options:[{code:'2',label:'Test tehsil'}]};
}});
const directoryRequest = new Request('https://landreview.example/api/odisha/locations',{method:'POST',headers:{origin:'https://landreview.example','content-type':'application/json'},body:JSON.stringify({location:'17'})});
const directoryResult = await directorySite.fetch(directoryRequest);
assert.equal(directoryResult.status,200);
assert.equal((await directoryResult.json()).options[0].code,'2');
const mapReader=makeBhunakshaReader(async (url,options)=>{
  if (url.pathname.endsWith('ScalarDatahandler')) {assert.equal(options.method,'POST');assert.equal(options.body.get('selections'),'3,11,8,102');return new Response('<select id="level_5"><option value="01">01</option></select>');}
  assert.equal(options.body.get('giscode'),'03110810201');
  return Response.json({features:[{properties:{...geometry.demo.features[0].properties,info:'Discarded map metadata'},geometry:geometry.demo.features[0].geometry}]});
});
assert.equal(officialMapBase('20'),'https://app3bhunakshaodisha.nic.in/bhunaksha/');
assert.equal(officialMapBase('19'),'https://bhunakshaodisha.nic.in:8443/bhunaksha/');
const mapSite=makeLandReviewWorker({assets:{},matchRows,readMap:mapReader,requireIdentity:false});
const mapRequest=sheet=>new Request('https://landreview.example/api/odisha/maps',{method:'POST',headers:{origin:'https://landreview.example','content-type':'application/json'},body:JSON.stringify({location:'3-11-102-8',sheet})});
assert.deepEqual(await (await mapSite.fetch(mapRequest(''))).json(),{sheets:['01']});
const map=await (await mapSite.fetch(mapRequest('01'))).json();
assert.equal(map.features[0].properties.kide,'101/2');
assert.equal(map.features[0].properties.info,undefined);
const savedMaps=JSON.parse(await fs.readFile(new URL('./worker/odisha-map-snapshots.json',import.meta.url),'utf8'));
assert.ok(Object.values(savedMaps.villages).flatMap(Object.values).every(sheet=>sheet.features.every(f=>Object.keys(f.properties).sort().join(',')==='id,kide')));
const fallbackSite=makeLandReviewWorker({assets:{},matchRows,requireIdentity:false,mapSnapshots:savedMaps,async readMap(){throw Error('fixture outage');}});
const savedSheets=await (await fallbackSite.fetch(mapRequest(''))).json();
assert.deepEqual(savedSheets.sheets,['01','02','03']);
const savedSheet=await (await fallbackSite.fetch(mapRequest('01'))).json();
assert.equal(savedSheet.captured,savedMaps.collected);
assert.equal(savedSheet.features.length,302);

const pdf=await makeMapPDF(data.summary,geometry,new Map([[parcelKey(sample),matches[0]]]),false);
assert.equal((await PDFLib.PDFDocument.load(pdf)).getPageCount(),1);
const workbook=await JSZip.loadAsync(await exportWorkbook(data.rows,matches));
assert.match(await workbook.file('xl/worksheets/sheet1.xml').async('string'),/101\/2/);
const bundle=await JSZip.loadAsync(await exportRORBundle(data.rows,matches,{[parcelKey(sample)]:{bytes:pdf,name:'Sample.pdf'}}));
assert.ok(bundle.file('RoR/001_Sample.pdf'));
assert.match(await bundle.file('RoR-index.csv').async('string'),/https:\/\/example.com\/front/);
const snapshot=await zipWorkspace(data);
const roundTrip=await importFile(new File([snapshot],'Sample.zip'));
assert.equal(roundTrip.rows[0].info,sample.info);
if(process.argv[2]){
  const real=await importFile(new File([await fs.readFile(process.argv[2])],'Odisha.zip'));
  const selected=matchRows(real.rows,real.rules);
  assert.equal(real.rows.length,15389);
  const index=searchIndex(real);
  const scope=findRecords(real,index,criteriaFrom({state:'Odisha',names:'ଜେନା\nଯେନା'}));
  assert.equal(scope.stateCount,15389);
  assert.equal(scope.hits.length,497);
  const ri=findRecords(real,index,criteriaFrom({state:'Odisha',names:'ଜେନା',tehsil:'Mahanga',ri:'Kurujanga'}));
  assert.ok(ri.hits.length>0);
  assert.ok(ri.hits.every(({index})=>real.rows[index].district==='3' && real.rows[index].ri==='8'));
  assert.equal(real.summary.length,21);
  assert.equal(selected.filter(x=>x.surnameSelected).length,292);
  assert.equal(selected.filter(x=>x.fullSelected).length,79);
  assert.equal(real.rows.filter((r,i)=>selected[i].fullSelected && real.pdfs[parcelKey(r)]).length,79);
  const sheets=real.summary.filter(x=>x.village!==105);
  assert.equal((await PDFLib.PDFDocument.load(await makeMapPDF(sheets,real.geometry,new Map(real.rows.map((r,i)=>[parcelKey(r),selected[i]])),false))).getPageCount(),17);
  console.log('Verified Odisha import, match parity, 79 available selected PDFs and 17 map pages.');
}
console.log('Verified matching boundaries, source caste, surnames, portal coverage, Excel, PDF, RoR bundle and workspace round-trip.');
