import {strict as assert} from 'node:assert';
import {mkdir, readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {serveRelease} from './serve-release.mjs';

const playwright = process.env.LANDREVIEW_PLAYWRIGHT;
if (!playwright) throw new Error('Set LANDREVIEW_PLAYWRIGHT to the Playwright index.mjs path.');
const {chromium} = await import(pathToFileURL(resolve(playwright)));
const folder = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../pages-out/',import.meta.url));
const evidence = process.env.LANDREVIEW_SMOKE_EVIDENCE;
const {url,server} = await serveRelease(folder);
let browser;
try {
  browser = await chromium.launch({
    headless:true,
    ...(process.env.LANDREVIEW_CHROME ? {executablePath:process.env.LANDREVIEW_CHROME} : {})
  });
  const context = await browser.newContext({acceptDownloads:true, serviceWorkers:'block', viewport:{width:1440,height:1000}});
  const external = [];
  const errors = [];
  await context.route('**/*', route => {
    const destination = new URL(route.request().url());
    if (destination.origin !== url.origin) {
      external.push(destination.origin);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('?demo=1',url).href);
  const click = name => page.getByRole('button',{name,exact:true}).click();
  await click('Find sample village');
  await page.getByRole('button',{name:/Anandapur Sample.*Cuttack/}).first().click();
  const filters = await page.locator('#home-search-form').evaluate(form =>
    Object.fromEntries(['state','district','tehsil','ri'].map(name=>[name,form.elements.namedItem(name).value])));
  assert.deepEqual(filters,{state:'Odisha',district:'Cuttack',tehsil:'Mahanga',ri:'Kurujanga'});
  const nameInput=page.getByLabel('Names or surnames');
  const dictionaryRequest=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/name-dictionary-or.json'));
  await nameInput.fill('Samal');
  const originalOrder=page.locator('#home-name-review > .variant-options');
  await originalOrder.locator('label').filter({hasText:'ସାମଲ'}).getByText(/in the spelling dictionary/).waitFor();
  const request=await dictionaryRequest;
  assert.equal(request.method(),'GET');
  assert.equal(request.postData(),null);
  assert.equal(new URL(request.url()).search,'');
  if (evidence) {
    await mkdir(evidence,{recursive:true});
    await page.locator('#home-name-review').screenshot({path:resolve(evidence,'08-odia-spelling-dictionary.png')});
  }
  await nameInput.fill('Jadumani Jena');
  const spellings=['ଜଦୁମଣି ଜେନା','ଜଦୁମଣି ଯେନା','ଯଦୁମଣି ଜେନା','ଯଦୁମଣି ଯେନା'];
  assert.deepEqual(new Set(await originalOrder.locator('strong').allTextContents()),new Set(spellings));
  await page.getByText('Other name orders (5)',{exact:true}).click();
  await page.getByText('ଯେନା ଯଦୁମଣି',{exact:true}).waitFor();
  await click('Select all');
  assert.equal(await originalOrder.locator(':checked').count(),4);
  await click('Clear all');
  assert.equal(await originalOrder.locator(':checked').count(),0);
  await nameInput.fill('Jena');
  await originalOrder.locator('label').filter({hasText:'ଯେନା'}).getByText(/Seen in \d+ loaded plots?/).waitFor();
  await click('Review name variants');
  await page.getByRole('button',{name:'Select all',exact:true}).click();
  await click('Search loaded records');
  await page.getByRole('heading',{name:/matching plot/}).waitFor();
  if (evidence) {
    await mkdir(evidence,{recursive:true});
    await page.screenshot({path:resolve(evidence,'01-village-and-matches.png'),fullPage:true});
  }
  await click('Open matched map');
  await page.getByRole('heading',{name:'Village overviews',exact:true}).waitFor();
  await page.locator('canvas#map').waitFor();
  if (evidence) await page.screenshot({path:resolve(evidence,'02-highlighted-village-map.png'),fullPage:true});
  const mapDownload = page.waitForEvent('download');
  await click('Export map PDF');
  const map = await mapDownload;
  assert.equal(map.suggestedFilename(),'India_Land_Search_Village_Maps.pdf');
  await click('Home');
  await click('Open sample RoRs');
  const recordsDownload = page.waitForEvent('download');
  await click('Download selected RoRs (PDF)');
  const records = await recordsDownload;
  assert.equal(records.suggestedFilename(),'LandReview_Fictional_RoRs.pdf');
  const {PDFDocument} = createRequire(import.meta.url)('../dist/vendor/pdf-lib.js');
  assert.equal((await PDFDocument.load(await readFile(await map.path()))).getPageCount(), 1);
  assert.equal((await PDFDocument.load(await readFile(await records.path()))).getPageCount(), 4);
  if (evidence) {
    await records.saveAs(resolve(evidence,records.suggestedFilename()));
    await map.saveAs(resolve(evidence,map.suggestedFilename()));
    await page.screenshot({path:resolve(evidence,'03-roR-export.png'),fullPage:true});
  }
  const mapPage=new URL('interactive-map-smoke',url);
  await page.route(mapPage.href,route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><title>Interactive Odisha map fixture</title><link rel="stylesheet" href="./style.css">'+
    '<main style="grid-column:1/-1;max-width:1100px"><details class="live-location"></details></main>'+
    '<script type="module">'+
    "import {mountLiveOdishaMap} from './live-odisha-map.mjs';"+
    "const plotTexts=window.plotTexts=[];const draw=CanvasRenderingContext2D.prototype.fillText;"+
    "CanvasRenderingContext2D.prototype.fillText=function(label,...args){if(this.canvas.id==='bhu-canvas')plotTexts.push(label);return draw.call(this,label,...args);};"+
    "const place={id:'19-3-79',districtCode:'19',tehsilCode:'3',villageCode:'79',riCode:'8',village:'Fixture village',tehsil:'Fixture tehsil'};"+
    "const tag=(href,label)=>href?'<a href=\"'+href+'\">'+label+'</a>':'';"+
    "mountLiveOdishaMap(document.querySelector('details'),[place],String,tag,new Map(),new Map([[place.id,['7']]]),['Fixture Name']);"+
    '</script>'}));
  const requests=[];
  const fallbackPortal='https://bhunakshaodisha.nic.in:8443/bhunaksha/#home-pane';
  const rectangularParcel=(id,kide,x)=>({properties:{id,kide},geometry:{type:'Polygon',
    coordinates:[[[x,0],[x+90,0],[x+90,100],[x,100],[x,0]]]}});
  const features=[rectangularParcel('a','12',0),rectangularParcel('b','12/3',105),rectangularParcel('c','58',210)];
  await page.route('**/api/odisha/maps',route=>{
    const {parcel,sheet}=route.request().postDataJSON();
    if (parcel) {
      requests.push(parcel);
      if (parcel.id==='b' && requests.filter(item=>item.id==='b').length===1) {
        return route.fulfill({status:502,json:{error:'India Land Search couldn’t retrieve Plot Info from BhuNaksha.',portal:fallbackPortal}});
      }
      const details=parcel.id==='c'
        ? {info:'Fixture Name\nDetails from BhuNaksha',area:'0.52 acres',khata:'9',
          front:'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=front',back:'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=back'}
        : {info:'Different name'};
      return route.fulfill({json:details});
    }
    return route.fulfill({json:sheet?{sheet,gis:'19030807901',features}:{sheets:['01']}});
  });
  await page.route('**/api/odisha/ror',route=>{
    assert.deepEqual(route.request().postDataJSON(),{location:'19-3-79',khata:'7',side:'back',plots:true});
    return route.fulfill({json:{plots:['12/3']}});
  });
  await page.goto(mapPage.href);
  await page.getByText('BhuNaksha village map',{exact:true}).click();
  await page.getByText(/1 search-matched parcel on sheet 01/).waitFor();
  assert.deepEqual(requests,[]);
  assert.deepEqual(await page.evaluate(()=>window.plotTexts),[]);
  await click('Zoom in');
  await page.getByText('141%',{exact:true}).waitFor();
  await click('Zoom in');
  await page.getByText('200%',{exact:true}).waitFor();
  assert.ok((await page.evaluate(()=>window.plotTexts)).includes('12/3'));
  const canvas=page.locator('#bhu-canvas');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await click('Fit sheet');
  await page.getByText('100%',{exact:true}).waitFor();
  const bounds=await canvas.boundingBox();
  await page.mouse.click(bounds.x+bounds.width*.16,bounds.y+bounds.height*.5);
  await page.getByRole('heading',{name:'Plot Info · 12',exact:true}).waitFor();
  await page.getByText('Different name',{exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'Plot number on this sheet'}).fill('୫୮');
  await click('Find plot');
  await page.getByRole('heading',{name:'Plot Info · 58',exact:true}).waitFor();
  await page.getByText('Search match · Fixture Name',{exact:true}).waitFor();
  await page.getByText(/2 search-matched parcels on sheet 01/).waitFor();
  assert.equal(await page.getByRole('link',{name:'RoR front',exact:true}).getAttribute('href'),'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=front');
  assert.deepEqual(requests,[{id:'a',number:'12'},{id:'c',number:'58'}]);
  if (evidence) await page.locator('main').screenshot({path:resolve(evidence,'04-interactive-odisha-map.png')});
  await page.getByRole('searchbox',{name:'Plot number on this sheet'}).fill('12/3');
  await click('Find plot');
  await page.getByRole('heading',{name:'Plot Info · 12/3',exact:true}).waitFor();
  await page.getByText('In BhuNaksha, select Fixture village, sheet 01, then search for plot 12/3.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Open official BhuNaksha viewer',exact:true}).getAttribute('href'),fallbackPortal);
  if (evidence) await page.locator('#bhu-plot-info').screenshot({path:resolve(evidence,'05-plot-info-fallback.png')});
  await click('Retry Plot Info');
  await page.getByText('Different name',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Open official BhuNaksha viewer',exact:true}).count(),0);
  assert.deepEqual(requests.slice(-2),[{id:'b',number:'12/3'},{id:'b',number:'12/3'}]);
  await page.route(new URL('runtime.mjs',url).href,route=>route.fulfill({
    contentType:'text/javascript',body:"export const runtime={hosted:true,indexBase:'',pages:false};"
  }));
  const usedLocations=[], tenantCalls=[], indexedCalls=[];
  const villages=Array.from({length:12},(_,i)=>({code:String(79+i),label:i===0?'Fixture village':`Fixture village ${i+1}`}));
  await page.route('**/api/odisha/index-search',route=>{
    indexedCalls.push(route.request().postDataJSON());
    return route.fulfill({status:503,json:{code:'index_not_loaded'}});
  });
  await page.route('**/api/odisha/locations',route=>{
    assert.equal(route.request().headers()['oai-authenticated-user-id'],undefined);
    const {location}=route.request().postDataJSON();
    usedLocations.push(location);
    const options={'':[{code:'19',label:'Fixture district'}],'19':[{code:'3',label:'Fixture tehsil'}],'19-3':villages};
    return route.fulfill({json:{options:options[location]}});
  });
  await page.route('**/api/odisha/tenant-search',route=>{
    assert.equal(route.request().headers()['oai-authenticated-user-id'],undefined);
    const {location,names}=route.request().postDataJSON();
    assert.deepEqual(names,['ଫିକ୍ସଚର']);
    tenantCalls.push(location);
    if (location==='19-3-80' && tenantCalls.filter(id=>id===location).length===1) {
      return route.fulfill({status:429,headers:{'Retry-After':'0'},json:{error:'Fixture cooldown'}});
    }
    if (location==='19-3-85') return route.fulfill({status:502,json:{error:'Fixture village unavailable'}});
    const [, , code]=location.split('-');
    const village=villages.find(item=>item.code===code).label;
    return route.fulfill({json:{location:{id:location,districtCode:'19',tehsilCode:'3',villageCode:code,village,district:'Fixture district',tehsil:'Fixture tehsil'},checked:1,
      hits:code==='79'?[{tenant:'ଫିକ୍ସଚର ଜେନା',matched:['ଫିକ୍ସଚର'],khata:''}]:[]}});
  });
  await page.goto(url.href);
  await page.getByLabel('State or union territory').selectOption('Odisha');
  await page.getByLabel('Names or surnames').fill('ଫିକ୍ସଚର');
  await click('Search live Odisha records');
  await page.getByText(/your index search did not run/).waitFor();
  assert.deepEqual(tenantCalls,[]);
  assert.equal(await page.getByRole('button',{name:'Choose a Bhulekh village',exact:true}).count(),1);
  await click('Find a village by name');
  await page.getByRole('searchbox',{name:'Village name',exact:true}).waitFor();
  await click('Search across Odisha in batches');
  await page.getByText(/Retry becomes available/).waitFor();
  assert.deepEqual(tenantCalls,['19-3-79','19-3-80']);
  await click('Retry search');
  await page.getByRole('button',{name:'Check the next 10 villages',exact:true}).waitFor();
  assert.deepEqual(tenantCalls,['19-3-79','19-3-80',...villages.slice(1,10).map(({code})=>'19-3-'+code)]);
  await page.getByText(/9 villages checked in Odisha · 1 unavailable/).waitFor();
  await click('Check the next 10 villages');
  await page.getByText(/11 villages checked in Odisha · 1 unavailable/).waitFor();
  await page.getByText(/Search finished with some villages unavailable/).waitFor();
  assert.deepEqual(usedLocations,['','19','19-3']);
  assert.deepEqual([...new Set(tenantCalls)],villages.map(({code})=>'19-3-'+code));
  if (evidence) await page.locator('#home-search-results').screenshot({path:resolve(evidence,'07-odisha-village-batches.png')});
  await page.reload();
  await page.getByText('Choose villages from Bhulekh',{exact:true}).click();
  await page.locator('#directory-district').selectOption('19');
  await page.locator('#directory-tehsil').selectOption('3');
  await page.locator('#directory-village').selectOption('79');
  await click('Add village');
  const beforeDirect=tenantCalls.length;
  await click('Search live Odisha records');
  await page.getByText('Search finished.',{exact:true}).waitFor();
  assert.deepEqual(tenantCalls.slice(beforeDirect),['19-3-79']);
  assert.equal(indexedCalls.length,1);
  await page.getByRole('button',{name:'Search all villages in Fixture tehsil',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Live Odisha tenant search',exact:true}).waitFor();
  await page.getByText('ଫିକ୍ସଚର ଜେନା',{exact:false}).waitFor();
  assert.deepEqual(usedLocations,['','19','19-3','','19','19-3']);
  assert.equal(await page.locator('a[href^="/signin-with-chatgpt"]').count(),0);
  if (evidence) await page.screenshot({path:resolve(evidence,'06-anonymous-live-odisha.png'),fullPage:true});
  assert.deepEqual(external, [], 'The browser smoke made an external request');
  assert.deepEqual(errors, [], 'The browser smoke raised a page error');
  console.log('Signed-out browser smoke passed: village filters, name matching, map PDF, two-khata RoR PDF, interactive Odisha map, and signed-out Odisha tenant search and batch fallback with no live portal calls.');
} finally {
  if (browser) await browser.close();
  await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));
}
