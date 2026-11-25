import {cp,lstat,mkdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {officialMapBase} from './dist/odisha-endpoints.mjs';

const root=await realpath(new URL('./',import.meta.url));
const source=join(root,'dist');
const target=join(root,'pages-out');
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
  'app.mjs','core.mjs','demo.mjs','files.mjs','home-search.mjs','indexed-results.mjs','live-odisha-map.mjs','live-ror.mjs','odisha-scope.mjs',
  'india-states.mjs','maps.mjs','matcher.mjs','name-review.mjs','name-variants.mjs','odisha-endpoints.mjs','official-odisha.mjs',
  'parcel-basemap.mjs','portals.mjs','search.mjs','sheet-overlays.mjs','style.css',
  'village-finder.mjs','villages.json','workspace-maps.mjs'
];
await Promise.all([
  ...files.map(file=>cp(join(source,file),join(target,file))),
  cp(join(source,'vendor'),join(target,'vendor'),{recursive:true}),
  cp(join(root,'worker','odisha-map-snapshots.json'),join(target,'odisha-map-snapshots.json')),
  writeFile(join(target,'runtime.mjs'), 'export const runtime = {hosted:false, indexBase:"", pages:true};\n'),
  writeFile(join(target,'index.html'), (await readFile(join(source,'index.html'),'utf8')).replace('  <meta name="description"',"  <meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self' https://bhulekh.ori.nic.in; img-src 'self' data: blob: "+mapOrigins.join(' ')+"; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'\">\n"+'  <meta name="description"')),
  writeFile(join(target,'.nojekyll'),'')
]);
