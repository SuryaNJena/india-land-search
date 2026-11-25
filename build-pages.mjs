import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {configureOfflineWorker} from './scripts/offline-assets.mjs';

const source=new URL('./dist/',import.meta.url);
const target=new URL('./pages-out/',import.meta.url);
const option=process.env.LANDREVIEW_INDEX_ORIGIN;
let indexBase='';
if (option) {
  const url=new URL(option);
  if (url.protocol!=='https:' || url.href!==url.origin+'/') throw Error('LANDREVIEW_INDEX_ORIGIN must be an HTTPS origin.');
  indexBase=url.origin;
}
await mkdir(target,{recursive:true});
for (const entry of await readdir(source,{withFileTypes:true})) {
  if (entry.isFile() && ['.html','.css','.js','.mjs','.json','.txt','.svg','.webmanifest'].includes(extname(entry.name))) {
    await cp(new URL(entry.name,source),new URL(entry.name,target));
  }
}
await cp(new URL('./worker/odisha-map-snapshots.json',import.meta.url),new URL('odisha-map-snapshots.json',target));
await cp(new URL('vendor/',source),new URL('vendor/',target),{recursive:true});
await writeFile(new URL('runtime.mjs',target),`export const runtime = ${JSON.stringify({hosted:false,indexBase,pages:true})};\n`);
const files=[...(await readdir(target,{withFileTypes:true})).filter(file=>file.isFile()).map(file=>file.name),
  ...(await readdir(new URL('vendor/',target),{withFileTypes:true})).filter(file=>file.isFile()).map(file=>'vendor/'+file.name)];
const assets=Object.fromEntries(await Promise.all(files.sort().map(async file=>[file,await readFile(new URL(file,target),'utf8')])));
const serviceWorker=configureOfflineWorker(await readFile(new URL('offline-worker.js',source),'utf8'),assets);
await writeFile(new URL('offline-worker.js',target),serviceWorker);
await writeFile(new URL('.nojekyll',target),'');
