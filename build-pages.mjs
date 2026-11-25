import {cp,mkdir,readdir,writeFile} from 'node:fs/promises';
import {extname} from 'node:path';

const source=new URL('./dist/',import.meta.url);
const target=new URL('./pages-out/',import.meta.url);
const indexBase='';
await mkdir(target,{recursive:true});
for (const entry of await readdir(source,{withFileTypes:true})) {
  if (entry.isFile() && ['.html','.css','.js','.mjs','.json','.txt'].includes(extname(entry.name))) {
    await cp(new URL(entry.name,source),new URL(entry.name,target));
  }
}
await cp(new URL('vendor/',source),new URL('vendor/',target),{recursive:true});
await writeFile(new URL('runtime.mjs',target),`export const runtime = ${JSON.stringify({hosted:false,indexBase,pages:true})};\n`);
await writeFile(new URL('.nojekyll',target),'');
