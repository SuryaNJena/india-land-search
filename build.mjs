import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {configureOfflineWorker} from './scripts/offline-assets.mjs';

const dist = new URL('./dist/',import.meta.url);
const types = {'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.txt':'text/plain','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const assets = {};
for (const folder of ['', 'vendor/']) {
  const directory = new URL(folder,dist);
  for (const file of await readdir(directory,{withFileTypes:true})) {
    const type = types[extname(file.name)];
    if (file.isFile() && type) assets[`/${folder}${file.name}`] = {type:`${type}; charset=utf-8`,text:await readFile(new URL(file.name,directory),'utf8')};
  }
}
assets['/favicon.png']={type:'image/png',base64:(await readFile(new URL('favicon.png',dist))).toString('base64')};
assets['/'] = assets['/index.html'];
assets['/offline-worker.js'].text=configureOfflineWorker(assets['/offline-worker.js'].text,
  Object.fromEntries(Object.entries(assets).map(([path,asset])=>[path.slice(1),asset.text])));
const statewide = await readFile(new URL('./worker/statewide.mjs',import.meta.url),'utf8');
const sources=await readFile(new URL('state-sources.mjs',dist),'utf8');
const endpoints=await readFile(new URL('odisha-endpoints.mjs',dist),'utf8');
const app=(await readFile(new URL('./worker/odisha.mjs',import.meta.url),'utf8'))
  .replace(/^import \{stateSources,stateSourcePath\} from '\.\.\/dist\/state-sources\.mjs';\r?\n/m,'')
  .replace(/^import \{officialMapBase,officialRoR\} from '\.\.\/dist\/odisha-endpoints\.mjs';\r?\nexport \{officialMapBase,officialRoR\};\r?\n/m,'');
const snapshots = JSON.parse(await readFile(new URL('./worker/odisha-map-snapshots.json',import.meta.url),'utf8'));
const matcher = await readFile(new URL('core.mjs',dist),'utf8');
const manifest = await readFile(new URL('./.openai/hosting.json',import.meta.url),'utf8');
await Promise.all([mkdir(new URL('server/',dist),{recursive:true}),mkdir(new URL('.openai/',dist),{recursive:true})]);
const bundle = `${matcher}\n${statewide}\n${endpoints}\n${sources}\n${app}\nexport default makeLandReviewWorker({readIndex:readStatewideIndex,assets:${JSON.stringify(assets)},mapSnapshots:${JSON.stringify(snapshots)},matchRows,nameLimit:liveNameLimit});\n`;
await Promise.all([
  writeFile(new URL('server/index.js',dist),bundle),
  writeFile(new URL('.openai/hosting.json',dist),manifest)
]);
const worker = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString('base64')}`);
const home = await worker.default.fetch(new Request('https://landreview.example/'));
if (!home.ok || !(await home.text()).includes('<title>India Land Search</title>')) throw Error('The Worker did not serve the homepage.');
console.log(`Built the Sites Worker with ${Object.keys(assets).length} asset routes.`);
