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
  assert.match(home, /connect-src 'self' https:\/\/bhulekh\.ori\.nic\.in;/);
  assert.match(home, /img-src [^;]+https:\/\/bhunakshaodisha\.nic\.in:8443/);
  assert.doesNotMatch(home, /(?:connect-src|img-src) [^;]*\*/);
  await asset('app.mjs', /^text\/javascript/);
  await asset('odisha-live-search.mjs', /^text\/javascript/);
  await asset('style.css', /^text\/css/);
  await asset('vendor/pdf-lib.js', /^text\/javascript/);
  const runtime=await (await asset('runtime.mjs', /^text\/javascript/)).text();
  assert.match(runtime, /hosted:false, indexBase:"", pages:true/);
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
