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
  const offlineGuard=route=>{
    const destination = new URL(route.request().url());
    if (destination.origin !== url.origin) {
      if(destination.origin==='https://tile.openstreetmap.org' && route.request().resourceType()==='image') return route.abort();
      external.push(destination.origin);
      return route.abort();
    }
    return route.continue();
  };
  await context.route('**/*',offlineGuard);
  let page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => {errors.push(error.message);console.error(error.stack);});
  const click = name => page.getByRole('button',{name,exact:true}).click();
  await page.goto(url.href);
  await click('Take a tour');
  const tour=page.getByRole('dialog');
  await tour.frameLocator('iframe').locator('body.tour-document').waitFor();
  assert.equal(await tour.frameLocator('iframe').locator('.sidebar').isVisible(),false);
  const advance=tour.getByRole('button',{name:'Next'});
  await advance.click();
  await tour.getByRole('heading',{name:'Review the names'}).waitFor();
  await tour.getByRole('button',{name:'Back'}).click();
  await advance.click();await advance.click();
  await tour.frameLocator('iframe').locator('#workspace-sheet.tour-target').waitFor();
  await advance.click();await tour.getByRole('button',{name:'Finish'}).click();
  assert.equal(await tour.count(),0);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#nav-toggle').click();
  assert.equal(await page.locator('#workspace-nav button:visible').count(),8);
  await click('Home');
  assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await click('Start with a name');
  await page.getByLabel('Names or surnames').fill('Jena');
  await click('Continue to villages');
  await page.getByLabel('State or union territory').selectOption('Odisha');
  await click('Review search');
  await page.getByText(/3 of 3 ·/).waitFor();
  await click('Find villages');
  if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:resolve(evidence,'10-panorama-mobile.png')});}
  await page.setViewportSize({width:1440,height:1000});
  if(evidence)await page.screenshot({path:resolve(evidence,'11-panorama-desktop.png')});
  await click('Land revenue');
  await page.getByRole('heading',{name:'Odisha land revenue and water tax'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Open e-Pauti payment'}).getAttribute('href'),'https://odishalandrevenue.nic.in/OnlineRTrent.aspx');
  await click('Name matching');
  await page.getByRole('heading',{name:'Your search names',exact:true}).waitFor();
  assert.equal(await page.locator('#home-search-form').count(),0);
  assert.equal(await page.locator('#workspace-nav .nav-purpose').count(),8);
  await page.getByLabel('Names to review').fill('Samal');
  await page.getByText(/in the spelling dictionary/).waitFor();
  await page.getByText('Type in Odia',{exact:true}).click();
  await page.getByRole('button',{name:'ଜ',exact:true}).click();
  assert.match(await page.getByLabel('Names to review').inputValue(),/ଜ/);
  await page.getByLabel('Names to review').fill('Samal');
  await click('Select all');
  const approved=await page.locator('[data-spelling]:checked').count();
  assert.ok(approved>0);
  await click('Save names');
  if(evidence)await page.screenshot({path:resolve(evidence,'12-name-library.png')});
  await page.reload();
  await click('Name matching');
  assert.equal(await page.getByLabel('Names to review').inputValue(),'Samal');
  await click('Use on Home');
  await page.getByRole('heading',{name:'Search names in land records',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Names or surnames').inputValue(),'Samal');
  assert.ok(await page.locator('[data-spelling]:checked').count()>0);
  for (const name of ['Village maps','Plot records','Records of Rights']) {
    await click(name);
    await page.locator('[data-shared-picker] input').waitFor();
    if (name==='Plot records') {
      const bar=page.locator('.odisha-lookup-actions');
      assert.equal(await bar.evaluate(form=>{
        const bottom=element=>element.getBoundingClientRect().bottom;
        return Math.abs(bottom(form.querySelector('input[name=number]'))-bottom(form.querySelector('button')))<2;
      }),true);
    }
  }
  await click('Workspace');
  await page.getByRole('heading',{name:'Workspace',exact:true}).waitFor();

  await click('Home');
  await page.setViewportSize({width:915,height:720});
  await page.locator('#home-atlas .lr-map-coordinates').waitFor();
  assert.equal(await page.locator('#workspace-nav').evaluate(nav=>[...nav.querySelectorAll('.nav-copy')].every(label=>label.scrollWidth<=label.clientWidth+1)),true);
  const aligned=await page.locator('#home-atlas .lr-map-coordinates').evaluate(form=>{
    const bottom=node=>node.getBoundingClientRect().bottom;
    return Math.abs(bottom(form.querySelector('input[name=lon]'))-bottom(form.querySelector('button')))<2;
  });
  assert.equal(aligned,true);
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('State or union territory').selectOption('Chhattisgarh');
  const cgDistrict=page.getByLabel('Choose a district in Chhattisgarh');
  await cgDistrict.selectOption({label:'Kabirdham'});
  await page.getByText('Survey of India · Village boundaries',{exact:true}).waitFor();
  await page.locator('#village-finder input').fill('Adhchara');
  await page.locator('#village-finder [data-village]').filter({hasText:'Adhchara'}).first().click();
  assert.equal(await page.locator('[name="village"]').inputValue(),'Adhchara');
  await page.locator('#village-finder input').fill('Tangarghat');
  await page.locator('#village-finder [data-village]').filter({hasText:'Tangarghat'}).first().click();
  await click('Village maps');
  assert.equal(await page.locator('#official-state').inputValue(),'Chhattisgarh');
  const activeVillage=page.getByLabel('Active village');
  assert.match(await activeVillage.inputValue(),/434821$/);
  await activeVillage.selectOption({label:'Adhchara · Pandariya · Kabirdham'});
  await page.getByText('Reference atlas',{exact:true}).click();
  const stateAtlas=page.locator('[data-state-atlas].lr-parcel-map');
  await stateAtlas.waitFor();
  assert.equal(await stateAtlas.evaluate(map=>getComputedStyle(map).backgroundColor===getComputedStyle(map.closest('.card')).backgroundColor),true);
  await page.locator('[data-state-villages] summary').click();
  await page.getByRole('button',{name:'Remove Tangarghat'}).click();
  await page.getByRole('button',{name:'Remove Adhchara'}).click();
  await click('Home');
  await page.getByLabel('State or union territory').selectOption('Odisha');
  const districtPicker=page.getByLabel('Choose an Odisha district');
  await districtPicker.waitFor();
  const atlasCanvas=page.locator('#home-atlas canvas');
  await atlasCanvas.click({position:{x:5,y:5}});
  await districtPicker.waitFor();
  const districtPoint=await atlasCanvas.evaluate(async canvas=>{
    const {fitViewport,projectPosition}=await import(new URL('parcel-basemap.mjs',location.href));
    const districts=await (await fetch(new URL('odisha-district-polygons.json',location.href))).json();
    const bounds=[Infinity,Infinity,-Infinity,-Infinity];
    for(const d of districts)for(const polygon of d.polygons)for(const ring of polygon)for(const [x,y] of ring){
      bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);
      bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
    }
    const {clientWidth:width,clientHeight:height}=canvas;
    const {center,zoom}=fitViewport(bounds,width,height,true);
    const [x,y]=projectPosition(districts.find(d=>d.code==='cuttack').label,zoom);
    const [cx,cy]=projectPosition(center,zoom);
    return {x:x-cx+width/2,y:y-cy+height/2};
  });
  await atlasCanvas.click({position:districtPoint});
  await page.getByRole('button',{name:'Odisha districts'}).waitFor();
  await page.getByRole('button',{name:'Odisha districts'}).click();
  await districtPicker.waitFor();
  await page.locator('#village-finder input').fill('Bharatpada');
  await page.locator('#village-finder [data-village]').filter({hasText:'Mahanga'}).first().click();
  assert.equal(await page.locator('[name="village"]').inputValue(),'Bharatpada');
  await page.locator('#home-atlas [data-tiles][aria-pressed="true"]').waitFor();
  if (evidence) {
    await mkdir(evidence,{recursive:true});
    await page.locator('#home-atlas').screenshot({path:resolve(evidence,'09-odisha-village-boundaries.png')});
  }
  const chooseLocation=async()=>{
    assert.equal(await page.locator('[data-odisha-code="villageCode"]').inputValue(),'102');
  };
  await click('Village maps');
  await chooseLocation();
  await click('Open village map');
  await page.locator('.bhu-interactive #bhu-canvas').waitFor();
  assert.equal(await page.locator('#bhu-geographic').count(),0);
  assert.equal(await page.locator('[data-location-atlas] canvas').count(),1);
  await page.getByText('Parcel overlay on the atlas',{exact:true}).click();
  await page.locator('[data-atlas-geojson]').setInputFiles({
    name:'bad-sheet.geojson',mimeType:'application/geo+json',
    buffer:Buffer.from('{"type":"FeatureCollection","features":[]}')
  });
  await page.getByText(/No geographic parcels in that file match/).waitFor();
  await page.locator('.bhu-interactive .bhu-map-zoom').getByRole('button',{name:'Zoom in'}).click();
  await page.getByText('141%',{exact:true}).waitFor();
  await page.locator('.bhu-interactive .bhu-map-zoom').getByRole('button',{name:'Fit sheet'}).click();
  await page.getByText('Village map loaded.',{exact:true}).waitFor();
  await page.getByText('Official BhuNaksha layers',{exact:true}).click();
  await page.getByText('Layers are drawn over the official native sheet.',{exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'Plot number on this sheet'}).fill('9');
  await click('Find plot');
  await page.getByRole('heading',{name:'Plot Info · 9',exact:true}).waitFor();
  assert.equal(new URL(await page.locator('#bhu-plot-info a').getAttribute('href')).searchParams.get('plotno'),'9');
  await click('Plot records');
  await chooseLocation();
  await page.getByLabel('Plot number',{exact:true}).fill('9');
  await click('Find Plot Info');
  const plotLink=page.getByRole('link',{name:'Open official Plot Info',exact:true});
  assert.equal(new URL(await plotLink.getAttribute('href')).port,'8443');
  await page.getByLabel('Add the Plot Info JSON saved from BhuNaksha').setInputFiles({
    name:'plot-fixture.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({has_data:'Y',ID:'fixtureparcel',gisCode:'03110810201',plotNo:'9',info:'Synthetic plot record',plotInfoLinks:'<a href="https://bhulekh.ori.nic.in/ViewRoR.aspx?DistCode=3&TehCode=11&VillCode=102&KhataNo=147&type=front">Front</a>'}))
  });
  await page.getByText('Plot Info loaded.',{exact:true}).waitFor();
  const parcelPreview=page.getByRole('img',{name:'Cadastral sheet with plot 9 shaded'});
  await parcelPreview.waitFor();
  assert.equal(await parcelPreview.evaluate(canvas=>{
    const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    return data.some((r,i)=>i%4===0&&r===68&&data[i+1]===58&&data[i+2]===114&&data[i+3]===255);
  }),true);
  const linkedFront='https://bhulekh.ori.nic.in/ViewRoR.aspx?**KhataNo=147**';
  await page.route(linkedFront,route=>route.fulfill({contentType:'text/html',
    body:'<div id="ContentArea"><table id="gvfront"><tr><td id="gvfront_ctl02_lblName">Fixture recorded holder</td><td id="gvfront_ctl02_lblKhatiyanslNo">147</td></tr></table></div>'}));
  await page.getByText('Recorded holders and holding details',{exact:true}).click();
  await page.getByText('Fixture recorded holder',{exact:true}).waitFor();
  await page.unroute(linkedFront);
  await click('Land revenue for this khata');
  await page.getByRole('heading',{name:'Holding to look up'}).waitFor();
  assert.equal(await page.locator('.revenue-card dd').last().textContent(),'147');
  const directSides=[];
  await page.route('https://bhulekh.ori.nic.in/ViewRoR.aspx?**',async route=>{
    const requested=new URL(route.request().url());
    assert.equal(requested.searchParams.get('KhataNo'),'42');
    const side=requested.searchParams.get('type');
    directSides.push(side);
    await route.fulfill({status:200,headers:{'Content-Type':'text/html','Access-Control-Allow-Origin':'*'},
      body:side==='front'?'<div id="ContentArea">Fictional report front</div>':'<div id="ContentArea"><table id="gvRorBack"><tr><td>Fictional back schedule</td></tr></table></div>'});
  });
  await click('Records of Rights');
  await chooseLocation();
  await page.getByLabel('Khata number',{exact:true}).fill('42');
  await click('Load front and back');
  await page.getByText('Both RoR pages are ready.',{exact:true}).waitFor();
  assert.deepEqual(directSides,['front','back']);
  await page.reload();
  await click('Workspace');
  const saved=page.locator('#lookup-items [data-lookup-open]');
  await saved.nth(2).waitFor();
  assert.equal(await saved.count(),3);
  await click('Home');
  await page.getByLabel('State or union territory').selectOption('Odisha');
  await page.locator('#village-finder button[aria-label^="Remove "]').first().click();
  await page.getByLabel('Names or surnames').fill('Synthetic plot record');
  await click('Clear all');
  await click('Search loaded records');
  await page.getByRole('heading',{name:'1 matching plot entry',exact:true}).waitFor();
  await click('Workspace');
  await page.getByRole('button',{name:/Open Khata 42/}).click();
  await page.getByText('Back page and plot schedule',{exact:true}).click();
  await page.getByText('Fictional back schedule',{exact:true}).waitFor();
  assert.deepEqual(directSides,['front','back']);
  await click('Workspace');
  await page.getByLabel('Select all shown').check();
  await click('Remove selected');
  await saved.first().waitFor({state:'detached'});
  await page.goto(new URL('?demo=1',url).href);
  await click('Village maps');
  await page.getByRole('link',{name:'Exit demo',exact:true}).click();
  assert.equal(new URL(page.url()).search,'');
  await page.goto(new URL('?demo=1',url).href);
  await page.getByRole('link',{name:'India Land Search',exact:true}).click();
  assert.equal(new URL(page.url()).search,'');
  await page.getByRole('heading',{name:'Search names in land records',exact:true}).waitFor();
  await click('Name matching');
  assert.equal(await page.getByLabel('Names to review').inputValue(),'Samal');
  await page.goto(new URL('?demo=1',url).href);
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
  assert.equal(records.suggestedFilename(),'India_Land_Search_Fictional_RoRs.pdf');
  const {PDFDocument} = createRequire(import.meta.url)('../dist/vendor/pdf-lib.js');
  assert.equal((await PDFDocument.load(await readFile(await map.path()))).getPageCount(), 1);
  assert.equal((await PDFDocument.load(await readFile(await records.path()))).getPageCount(), 4);
  if (evidence) {
    await records.saveAs(resolve(evidence,records.suggestedFilename()));
    await map.saveAs(resolve(evidence,map.suggestedFilename()));
    await page.screenshot({path:resolve(evidence,'03-roR-export.png'),fullPage:true});
  }
  await page.evaluate(()=>localStorage.removeItem('landreview.home-search'));
  await page.goto(url.href);
  await page.getByLabel('State or union territory').selectOption('Odisha');
  await page.getByLabel('Names or surnames').fill('ଫିକ୍ସଚର');
  await click('Search loaded records');
  await page.getByRole('button',{name:'Import records for Odisha'}).waitFor();
  await page.locator('#file').setInputFiles({
    name:'saved-workspace.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
      title:'Saved record fixture',state:'Odisha',
      rows:[{id:'parcel',gis:'fixture',village:'Fixture Village',sheet:'01',plot:'12/3',khata:'9',
        info:'ଫିକ୍ସଚର ଜେନା',status:'Retrieved',front:'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=front'}],
      summary:[{gis:'fixture',name:'Fixture Village',sheet:'01'}],
      geometry:{fixture:{features:[{properties:{id:'parcel',kide:'12/3'},geometry:{type:'Polygon',
        coordinates:[[[0,0],[10,0],[10,8],[0,8],[0,0]]]}}]}},
      rules:{names:[],surnames:[]}
    }))
  });
  await page.getByRole('heading',{name:'1 matching plot entry',exact:true}).waitFor();
  await click('Show matches on map');
  await page.getByRole('heading',{name:'Village overviews',exact:true}).waitFor();
  await click('Zoom in');
  await page.getByText('141%',{exact:true}).waitFor();
  await click('Zoom in');
  await page.getByText('200%',{exact:true}).waitFor();
  await click('Fit sheet');
  await page.getByText('100%',{exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'Find plot number'}).fill('୧୨/୩');
  await click('Find plot');
  await page.getByRole('heading',{name:'Plot Info · 12/3',exact:true}).waitFor();
  await page.getByText('ଫିକ୍ସଚର ଜେନା',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Official RoR front',exact:true}).getAttribute('href'),'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=front');
  if (evidence) await page.screenshot({path:resolve(evidence,'04-pages-imported-map.png'),fullPage:true});
  await page.getByText('Geographic parcels and reference pin',{exact:true}).click();
  await page.locator('#workspace-sheet').getByLabel('Latitude',{exact:true}).fill('20.5');
  await page.locator('#workspace-sheet').getByLabel('Longitude',{exact:true}).fill('86.4');
  await page.locator('#workspace-sheet').getByRole('button',{name:'Set coordinate pin'}).click();
  await page.getByText('Coordinate pin · 20.500000, 86.400000',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Show OpenStreetMap'}).count(),0);
  await page.reload();
  await page.getByRole('heading',{name:'Saved record fixture',exact:true}).waitFor();
  await context.close();
  const hostedContext=await browser.newContext({acceptDownloads:true,serviceWorkers:'block',viewport:{width:1440,height:1000}});
  await hostedContext.route('**/*',offlineGuard);
  page=await hostedContext.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  const mapPage=new URL('interactive-map-smoke',url);
  await page.route(mapPage.href+'*',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><title>Interactive Odisha map fixture</title><link rel="stylesheet" href="./style.css"><link rel="stylesheet" href="./field-panorama.css">'+
    '<main style="grid-column:1/-1;max-width:1100px"><div id="test-atlas"></div><details class="live-location"></details></main>'+
    '<script type="module">'+
    "import {mountLiveOdishaMap} from './live-odisha-map.mjs';"+
    "import {mountLocationAtlas} from './location-atlas.mjs';"+
    "const atlas=mountLocationAtlas(document.querySelector('#test-atlas'));atlas.show([], 'Odisha');"+
    "const plotTexts=window.plotTexts=[];const draw=CanvasRenderingContext2D.prototype.fillText;"+
    "CanvasRenderingContext2D.prototype.fillText=function(label,...args){if(this.canvas.id==='bhu-canvas')plotTexts.push(label);return draw.call(this,label,...args);};"+
    "const place={id:'19-3-79',districtCode:'19',tehsilCode:'3',villageCode:'79',riCode:'8',village:'Fixture village',tehsil:'Fixture tehsil'};"+
    "const tag=(href,label)=>href?'<a href=\"'+href+'\">'+label+'</a>':'';"+
    "const manual=Boolean(location.search);"+
    "mountLiveOdishaMap(document.querySelector('details'),[place],String,tag,new Map(),manual?new Map():new Map([[place.id,['7','8','9','10']]]),manual?[]:['Fixture Name'],{onGeography:atlas.setParcelOverlay,manualNameSearch:manual,homeNameTerms:['Fixture Name']});"+
    '</script>'}));
  const requests=[], scheduleRequests=[];
  const fallbackPortal='https://bhunakshaodisha.nic.in:8443/bhunaksha/#home-pane';
  const rectangularParcel=(id,kide,x)=>({properties:{id,kide},geometry:{type:'Polygon',
    coordinates:[[[x,0],[x+90,0],[x+90,100],[x,100],[x,0]]]}});
  const features=[rectangularParcel('a','12',0),rectangularParcel('b','12/3',105),rectangularParcel('c','43',210),rectangularParcel('d','46',315)];
  await page.route('**/api/odisha/maps',route=>{
    const {parcel,sheet}=route.request().postDataJSON();
    if (parcel) {
      requests.push(parcel);
      if (parcel.id==='b' && requests.filter(item=>item.id==='b').length<=2) {
        return route.fulfill({status:502,json:{error:'India Land Search couldn’t retrieve Plot Info from BhuNaksha.',portal:fallbackPortal}});
      }
      const details=parcel.id==='c'
        ? {info:'Parent: Fixture Name\nDetails from BhuNaksha',area:'0.52 acres',khata:'150',
          front:'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=front',back:'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=back'}
        : {info:'Different name'};
      return route.fulfill({json:details});
    }
    return route.fulfill({json:sheet?{sheet,gis:'19030807901',features}:{sheets:['01']}});
  });
  await page.route('**/api/odisha/ror',route=>{
    const {khata,...scope}=route.request().postDataJSON();
    assert.deepEqual(scope,{location:'19-3-79',side:'back',plots:true});
    scheduleRequests.push(khata);
    if (khata==='150') return route.fulfill({json:{plots:['43','46']}});
    return route.fulfill({json:{plots:[khata==='10'?'12/3':'900/'+khata]}});
  });
  await page.goto(mapPage.href);
  await page.getByText('BhuNaksha village map',{exact:true}).click();
  await page.getByText(/1 direct match · 2 khata-only on sheet 01/).waitFor({timeout:20000});
  await page.getByText(/Plot Info unavailable for 1/).waitFor();
  assert.equal(await page.locator('#bhu-discovery progress').getAttribute('max'),'4');
  assert.deepEqual(scheduleRequests,['7','8','9','10','150']);
  assert.deepEqual(requests,[{id:'a',number:'12'},{id:'b',number:'12/3'},{id:'c',number:'43'},{id:'d',number:'46'}]);
  assert.equal(await page.locator('#bhu-plot-info').isVisible(),false);
  const polygon=(id,number,x)=>({type:'Feature',properties:{giscode:'19030807901',id,kide:number},
    geometry:{type:'Polygon',coordinates:[[[x,20.5],[x+.001,20.5],[x+.001,20.501],[x,20.501],[x,20.5]]]}});
  await page.getByText('Parcel overlay on the atlas',{exact:true}).click();
  await page.locator('[data-atlas-geojson]').setInputFiles({name:'sheet.geojson',mimeType:'application/geo+json',
    buffer:Buffer.from(JSON.stringify({type:'FeatureCollection',features:[polygon('c','43',86.27),polygon('d','46',86.271)]}))});
  await page.locator('#test-atlas').getByText('2 geographic parcels · 1 direct match · 1 matching khata only', {exact:false}).waitFor();
  assert.equal(await page.locator('#test-atlas canvas').count(),1);
  assert.equal(await page.locator('#bhu-geographic').count(),0);
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
  await page.getByRole('searchbox',{name:'Plot number on this sheet'}).fill('୪୩');
  await click('Find plot');
  await page.getByRole('heading',{name:'Plot Info · 43',exact:true}).waitFor();
  await page.getByText('Search match · Fixture Name',{exact:true}).waitFor();
  await page.getByText(/1 direct match · 2 khata-only on sheet 01/).waitFor();
  assert.equal(await page.getByRole('link',{name:'RoR front',exact:true}).getAttribute('href'),'https://bhulekh.ori.nic.in/ViewRoR.aspx?type=front');
  assert.deepEqual(requests,[{id:'a',number:'12'},{id:'b',number:'12/3'},{id:'c',number:'43'},{id:'d',number:'46'}]);
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
  const beforeManual=requests.length;
  await page.goto(mapPage.href+'?manual=1');
  await page.getByText('BhuNaksha village map',{exact:true}).click();
  const mapNames=page.getByLabel('Names to find on this sheet');
  await mapNames.waitFor();
  assert.equal(await mapNames.inputValue(),'');
  await click('Use names from Home');
  assert.equal(await mapNames.inputValue(),'Fixture Name');
  assert.equal(await page.locator('#bhu-discovery').isVisible(),false);
  assert.equal(requests.length,beforeManual);
  const parcelLookup=page.waitForRequest(request=>request.url().endsWith('/api/odisha/maps') && request.postDataJSON()?.parcel);
  await click('Search plot names');
  await parcelLookup;
  await click('Clear names');
  await page.getByText('Names cleared. Parcel checks stopped.').waitFor();
  assert.equal(await mapNames.inputValue(),'');
  assert.equal(await page.locator('#bhu-discovery').isVisible(),false);
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
  const exactPlotLink=await page.getByRole('link',{name:'Open exact BhuNaksha Plot Info in a new tab'}).getAttribute('href');
  assert.equal(new URL(exactPlotLink).searchParams.get('plotno'),'58');
  const fixtureRoR='https://bhulekh.ori.nic.in/ViewRoR.aspx?DistCode=4&TehCode=1&VillCode=1&KhataNo=12%2F3&type=front';
  await page.getByLabel('Add the Plot Info JSON saved from that tab',{exact:true}).setInputFiles({
    name:'plot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
      has_data:'Y',ID:'fixture-parcel',gisCode:'04010100101',plotNo:'58',info:'<b>Fixture source text</b>',plotInfoLinks:'<a href="'+fixtureRoR+'">RoR</a>'
    }))
  });
  await page.getByText('<b>Fixture source text</b>',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-plot-info] b').count(),0);
  await click('Highlight imported plot on map');
  const overlay=page.getByAltText('Selected parcel overlay',{exact:true});
  await overlay.waitFor();
  assert.deepEqual(await overlay.boundingBox(),await page.getByAltText('Live cadastral sheet from BhuNaksha',{exact:true}).boundingBox());
  await page.getByText('Bhulekh Records of Rights',{exact:true}).click();
  assert.equal(await page.getByLabel('Khata number',{exact:true}).inputValue(),'12/3');
  await click('Load front and back');
  await page.getByText('Both RoR pages are ready.',{exact:true}).waitFor();
  await page.getByText('Back page and plot schedule',{exact:true}).click();
  await page.getByText('Fixture schedule',{exact:true}).waitFor();
  assert.deepEqual(officialCalls,['VILLAGE_MAP','PLOT_LIST','front','back']);
  if (evidence) await page.screenshot({path:resolve(evidence,'06-odisha-official-sources.png'),fullPage:true});
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
  await page.evaluate(()=>localStorage.removeItem('landreview.home-search'));
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
  await page.getByText('Browse the official Bhulekh directory',{exact:true}).click();
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
  assert.deepEqual(external, [], 'The browser smoke made an unmocked external request');
  const install=await browser.newContext({serviceWorkers:'allow'});
  const offline=await install.newPage();
  await offline.goto(url.href);
  await offline.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await install.setOffline(true);
  await offline.reload({waitUntil:'domcontentloaded'});
  await offline.getByRole('heading',{name:'Search names in land records',exact:true}).waitFor();
  await install.close();
  assert.deepEqual(errors, [], 'The browser smoke raised a page error');
  console.log('Browser smoke passed: workspaces, name variants and dictionary, official maps and RoR, and signed-out Odisha search with batch fallback.');
} finally {
  if (browser) await browser.close();
  await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));
}
