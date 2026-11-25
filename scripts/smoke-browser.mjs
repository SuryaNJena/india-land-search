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
  await page.getByLabel('Latitude',{exact:true}).fill('20.5');
  await page.getByLabel('Longitude',{exact:true}).fill('86.4');
  await click('Set coordinate pin');
  await page.getByText('Coordinate pin · 20.500000, 86.400000',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Show OpenStreetMap'}).count(),0);
  await page.reload();
  await page.getByRole('heading',{name:'Saved record fixture',exact:true}).waitFor();
  assert.deepEqual(external, [], 'The browser smoke made an external request');
  assert.deepEqual(errors, [], 'The browser smoke raised a page error');
  console.log('Standalone browser smoke passed: village filters, workspace import and storage, interactive parcel map, coordinate pin, and PDF exports with no external requests.');
} finally {
  if (browser) await browser.close();
  await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));
}
