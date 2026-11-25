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
  await page.goto(url.href);
  const officialCalls=[];
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  await page.route('https://bhunakshaodisha.nic.in:8443/bhunaksha/WMS?*',route=>{
    const request=new URL(route.request().url());
    officialCalls.push(request.searchParams.get('LAYERS'));
    assert.equal(request.searchParams.get('gis_code'),'04010100101');
    return route.fulfill({contentType:'image/png',body:png});
  });
  await page.route('https://bhulekh.ori.nic.in/ViewRoR.aspx?*',route=>{
    const request=new URL(route.request().url());
    const side=request.searchParams.get('type');
    officialCalls.push(side);
    assert.equal(request.searchParams.get('KhataNo'),'12/3');
    assert.equal(route.request().headers().cookie,undefined);
    const body=side==='front'?'<p>Fixture official front</p><img src="https://unexpected.example/inactive.png">'
      :'<table id="gvRorBack"><tr><td>Fixture schedule</td></tr></table>';
    return route.fulfill({contentType:'text/html',headers:{'Access-Control-Allow-Origin':'*'},body:'<div id="ContentArea">'+body+'</div>'});
  });
  await click('State portals');
  await page.getByText('Odisha maps and RoR lookup',{exact:true}).click();
  await page.getByRole('link',{name:'ORSAC village boundaries',exact:true}).waitFor();
  assert.deepEqual(officialCalls,[]);
  await page.getByText('BhuNaksha sheet and Plot Info',{exact:true}).click();
  await click('Fill verified map example');
  await click('Load map image');
  await page.getByText('Live BhuNaksha sheet image.',{exact:true}).waitFor();
  await click('Find official Plot Info');
  const plotLink=await page.getByRole('link',{name:'Open exact BhuNaksha Plot Info in a new tab'}).getAttribute('href');
  assert.equal(new URL(plotLink).searchParams.get('plotno'),'58');
  const fixtureRoR='https://bhulekh.ori.nic.in/ViewRoR.aspx?DistCode=4&TehCode=1&VillCode=1&KhataNo=12%2F3&type=front';
  await page.getByLabel('Add the Plot Info JSON saved from that tab',{exact:true}).setInputFiles({
    name:'plot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
      has_data:'Y',ID:'fixture-parcel',gisCode:'04010100101',plotNo:'58',info:'Fixture source text',plotInfoLinks:'<a href="'+fixtureRoR+'">RoR</a>'
    }))
  });
  await page.getByText('Fixture source text',{exact:true}).waitFor();
  await click('Highlight imported plot on map');
  await page.getByAltText('Selected parcel overlay',{exact:true}).waitFor();
  await page.getByText('Bhulekh Records of Rights',{exact:true}).click();
  assert.equal(await page.getByLabel('Khata number',{exact:true}).inputValue(),'12/3');
  await click('Load front and back');
  await page.getByText('Both RoR pages are ready.',{exact:true}).waitFor();
  await page.getByText('Back page and plot schedule',{exact:true}).click();
  await page.getByText('Fixture schedule',{exact:true}).waitFor();
  assert.deepEqual(officialCalls,['VILLAGE_MAP','PLOT_LIST','front','back']);
  if (evidence) await page.screenshot({path:resolve(evidence,'06-odisha-official-sources.png'),fullPage:true});
  assert.deepEqual(external, [], 'The browser smoke made an unexpected external request');
  assert.deepEqual(errors, [], 'The browser smoke raised a page error');
  console.log('Signed-out browser smoke passed: village filters, name matching, map PDF, two-khata RoR PDF, interactive Odisha map, and explicit official-source requests.');
} finally {
  if (browser) await browser.close();
  await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));
}
