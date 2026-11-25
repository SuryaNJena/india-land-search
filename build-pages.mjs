import {cp,lstat,mkdir,realpath,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

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
const files=[
  'app.mjs','core.mjs','demo.mjs','files.mjs','home-search.mjs','index.html',
  'india-states.mjs','maps.mjs','matcher.mjs','name-review.mjs','name-variants.mjs',
  'parcel-basemap.mjs','portals.mjs','search.mjs','sheet-overlays.mjs','style.css',
  'village-finder.mjs','villages.json','workspace-maps.mjs'
];
await Promise.all([
  ...files.map(file=>cp(join(source,file),join(target,file))),
  cp(join(source,'vendor'),join(target,'vendor'),{recursive:true}),
  cp(join(root,'worker','odisha-map-snapshots.json'),join(target,'odisha-map-snapshots.json')),
  writeFile(join(target,'.nojekyll'),'')
]);
