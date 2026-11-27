import {cp,lstat,mkdir,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {configureOfflineWorker} from './scripts/offline-assets.mjs';
import {reportPortal} from './dist/odisha-lookup-source.mjs';
import {officialMapBase} from './dist/odisha-endpoints.mjs';

const root=await realpath(new URL('./',import.meta.url));
const source=join(root,'dist');
const target=join(root,'pages-out');
const apiBase=(process.env.LANDREVIEW_API_BASE??'').trim().replace(/\/+$/,'');
let apiOrigin='';
if (apiBase) {
  const apiURL=new URL(apiBase);
  if (apiURL.protocol!=='https:' || apiURL.username || apiURL.password || apiURL.pathname!=='/' || apiURL.search || apiURL.hash) {
    throw Error('LANDREVIEW_API_BASE must be an HTTPS origin without a path, query, or credentials.');
  }
  apiOrigin=apiURL.origin;
}
const prior=await lstat(target).catch(error=>{
  if (error.code!=='ENOENT') throw error;
  return null;
});
if (prior) {
  if (!prior.isDirectory() || prior.isSymbolicLink()) throw Error('pages-out must be a local build directory.');
  await rm(target,{recursive:true,force:true});
}
await mkdir(target,{recursive:true});
const mapOrigins=[...new Set(Array.from({length:30},(_,i)=>new URL(officialMapBase(String(i+1))).origin))];
const files=[
  'location-atlas.mjs','atlas-boundaries.json','odisha-district-polygons.json','shared-villages.mjs','field-panorama.css','guided-tour.mjs','favicon.png','app-icon.svg','app.mjs','app.webmanifest','core.mjs','demo.mjs','files.mjs','home-search.mjs','indexed-results.mjs','live-odisha-map.mjs','live-ror.mjs','odisha-endpoints.mjs','official-odisha.mjs','odisha-scope.mjs',
  'india-states.mjs','maps.mjs','matcher.mjs','name-library.mjs','name-review.mjs','name-variants.mjs',
  'parcel-basemap.mjs','portals.mjs','state-sources.mjs','state-maps.mjs','search.mjs','sheet-overlays.mjs','style.css',
  'plot-profile.mjs','lookup-workspace.mjs','name-dictionary.mjs','name-dictionary-or.json','name-dictionary-or-NOTICE.txt',
  'odisha-boundary-districts.json','odisha-boundaries.mjs','odisha-live-search.mjs','odisha-lookup-source.mjs',
  'odisha-lookup.mjs','offline-worker.js','village-finder.mjs','villages.json','workspace-maps.mjs'
];
files.push(...(await readdir(source)).filter(file=>/^odisha-boundaries-[a-z]+\.json$/.test(file)));
const bhuOrigins=mapOrigins.sort().join(' ');
const csp=["default-src 'self'", "script-src 'self'", "worker-src 'self'", "manifest-src 'self'", "connect-src 'self' "+new URL(reportPortal).origin+(apiOrigin?' '+apiOrigin:''), "img-src 'self' data: blob: https://tile.openstreetmap.org https://upbhunaksha.gov.in "+bhuOrigins,
  "form-action 'self' "+bhuOrigins, "style-src 'self' 'unsafe-inline'", "object-src 'none'", "base-uri 'none'"].join('; ');
const homepage=(await readFile(join(source,'index.html'),'utf8')).replace('  <meta name="description"',  `  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <meta name="description"`);
await Promise.all([
  ...files.map(file=>cp(join(source,file),join(target,file))),
  cp(join(source,'vendor'),join(target,'vendor'),{recursive:true}),
  cp(join(root,'worker','odisha-map-snapshots.json'),join(target,'odisha-map-snapshots.json')),
  writeFile(join(target,'runtime.mjs'), 'export const runtime = '+JSON.stringify({hosted:Boolean(apiBase),indexBase:'',pages:true,apiBase})+';\n'),
  writeFile(join(target,'index.html'),homepage),
  writeFile(join(target,'.nojekyll'),'')
]);

const assets=[...files,'index.html','runtime.mjs','odisha-map-snapshots.json',
  ...(await readdir(join(target,'vendor'),{withFileTypes:true})).filter(item=>item.isFile()).map(item=>'vendor/'+item.name)];
const contents=Object.fromEntries(await Promise.all(assets.sort().map(async file=>[file,await readFile(join(target,file),'utf8')])));
await writeFile(join(target,'offline-worker.js'),configureOfflineWorker(contents['offline-worker.js'],contents));
