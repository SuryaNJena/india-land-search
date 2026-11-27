import {strict as assert} from 'node:assert';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveRelease} from './serve-release.mjs';

const directory = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../pages-out/',import.meta.url));
const {url,server} = await serveRelease(directory);
async function asset(path, type) {
  const response = await fetch(new URL(path,url));
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('content-type'), type, path);
  return response;
}
try {
  const home = await (await asset('?demo=1', /^text\/html/)).text();
  assert.match(home, /<title>India Land Search<\/title>/);
  assert.match(home, /src="app\.mjs"/);
  assert.match(home, /connect-src 'self' https:\/\/bhulekh\.ori\.nic\.in(?: https:\/\/[^;]+)?;/);
  assert.match(home, /img-src [^;]+https:\/\/tile\.openstreetmap\.org[^;]*;/);
  assert.match(home, /form-action 'self' https:\/\/app1bhunakshaodisha\.nic\.in[^;]*;/);
  assert.match(home, /<footer[^>]*id="government-data-notice"/, 'Contest notice is available in the app shell');
  assert.match(home, /has obtained no separate licence to reuse it/);
  assert.match(home, /shown only for the contest demonstration/);
  await asset('app.mjs', /^text\/javascript/);
  await asset('state-sources.mjs', /^text\/javascript/);
  await asset('state-maps.mjs', /^text\/javascript/);
  await asset('state-geography.mjs', /^text\/javascript/);
  const cgDistricts=await (await asset('region-cg-districts.json', /^application\/json/)).json();
  assert.equal(cgDistricts.length,28);
  const cgVillages=await (await asset('region-cg-villages.json', /^application\/json/)).json();
  assert.ok(cgVillages.rows.some(row=>row[1]==='Adhchara'));
  assert.match(home,/img-src [^;]+https:\/\/upbhunaksha\.gov\.in/);
  await asset('app.webmanifest', /^application\/manifest\+json/);
  await asset('offline-worker.js', /^text\/javascript/);
  const boundaries=await (await asset('odisha-boundary-districts.json', /^application\/json/)).json();
  assert.equal(boundaries.length,30);
  const snapshots=await (await asset('odisha-map-snapshots.json', /^application\/json/)).json();
  assert.ok(snapshots.villages['3-11-102-8']['01'].features.length);
  assert.match(home, /img-src [^;]+https:\/\/bhunakshaodisha\.nic\.in:8443/);
  assert.doesNotMatch(home, /(?:connect-src|img-src) [^;]*\*/);
  await asset('odisha-live-search.mjs', /^text\/javascript/);
  await asset('style.css', /^text\/css/);
  await asset('vendor/pdf-lib.js', /^text\/javascript/);
  const runtime=await (await asset('runtime.mjs', /^text\/javascript/)).text();
  const config=/export const runtime = (\{.*\});/.exec(runtime);
  assert.ok(config, 'Pages runtime is generated');
  const settings=JSON.parse(config[1]);
  assert.equal(settings.pages,true);
  assert.equal(settings.hosted,Boolean(settings.apiBase));
  if (settings.apiBase) assert.ok(home.includes(settings.apiBase),'CSP allows the configured API origin');
  assert.equal((await fetch(new URL('server/index.js',url))).status,404);
  await asset('name-dictionary.mjs', /^text\/javascript/);
  const dictionary=await (await asset('name-dictionary-or.json', /^application\/json/)).json();
  assert.ok(Object.keys(dictionary).length>80000);
  const maps=await (await asset('odisha-map-snapshots.json', /^application\/json/)).json();
  assert.ok(maps.villages['19-3-79-8']['01'].features.length>1000);
  const directory = await (await asset('villages.json', /^application\/json/)).json();
  assert.equal(directory.state, 'Odisha');
  assert.ok(directory.rows.length > 50_000, 'Odisha directory is populated');
  assert.equal((await fetch(new URL('/api/odisha/index-search',url))).status, 404);
  assert.equal((await fetch(new URL('/landreview/%2e%2e%2fLICENSE',url))).status, 404);
  console.log('Offline Pages smoke passed at ' + url.pathname);
} finally {
  await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));
}
