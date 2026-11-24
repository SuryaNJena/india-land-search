import {mkdir,open,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {makeBhulekhReader} from '../worker/odisha.mjs';

const [listPath,folder,max='10']=process.argv.slice(2);
const batch=Number(max);
if (!listPath || !folder || !Number.isInteger(batch) || batch<1 || batch>100) {
  throw Error('Usage: node scripts/collect-bhulekh.mjs <verified-village-ids.json> <private-output-directory> [batch-size]');
}
const ids=JSON.parse(await readFile(listPath,'utf8'));
if (!Array.isArray(ids) || !ids.every(id=>typeof id==='string' && /^[1-9]\d{0,5}(?:-[1-9]\d{0,5}){2}$/.test(id))) {
  throw Error('Expected an array of verified Bhulekh village IDs.');
}

await mkdir(folder,{recursive:true});
const lock=join(folder,'.collect.lock'), pause=join(folder,'pause.json');
const lease=await open(lock,'wx');
const readOptional=async file=>readFile(file,'utf8').catch(error=>{if (error.code==='ENOENT') return null; throw error;});
const checkpoint=async (file,data)=>{
  await writeFile(file+'.tmp',JSON.stringify(data),{encoding:'utf8',mode:0o600});
  await rename(file+'.tmp',file);
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(ms,1000)));
const readVillage=makeBhulekhReader(async (url,options)=>{
  const response=await fetch(url,options);
  if ([401,403,429,503].includes(response.status)) {
    const retry=response.headers.get('Retry-After'), now=Date.now();
    const retryAt=retry && /^\d+$/.test(retry) ? now+Number(retry)*1000 : Date.parse(retry??'');
    await checkpoint(pause,{status:response.status,until:[401,403].includes(response.status)?null:Math.max(now+60000,Number.isFinite(retryAt)?retryAt:0)});
    await response.body?.cancel();
    throw Error(`Collection paused by HTTP ${response.status}.`);
  }
  return response;
},delay);
try {
  const pending=await readOptional(pause);
  if (pending) {
    const {until}=JSON.parse(pending);
    if (until===null) throw Error('The portal denied access. Review the source before clearing pause.json.');
    if (Date.now()<until) throw Error(`Collection is paused until ${new Date(until).toISOString()}.`);
    await unlink(pause);
  }
  let done=0;
  for (const id of new Set(ids)) {
    if (done>=batch) break;
    const file=join(folder,id+'.json');
    if (await readOptional(file)) continue;
    const [districtCode,tehsilCode,villageCode]=id.split('-');
    const data=await readVillage({districtCode,tehsilCode,villageCode});
    await checkpoint(file,{id,captured:new Date().toISOString(),...data});
    console.log(`${id}: ${data.tenants.length} entries checkpointed`);
    done++;
  }
} finally {
  await lease.close();
  await unlink(lock);
}
