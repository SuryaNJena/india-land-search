import {createReadStream, createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {indexWords} from '../worker/statewide.mjs';

const [manifestPath,recordsPath,outputPath] = process.argv.slice(2);
if (!manifestPath || !recordsPath || !outputPath) throw Error('Usage: node scripts/prepare-index.mjs <coverage.json> <holdings.ndjson> <new-output.sql>');
const {readFile} = await import('node:fs/promises');
const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
const {version,source,captured,catalogue,villages} = manifest;
const code = /^[1-9]\d{0,5}(?:-[1-9]\d{0,5}){2}$/;
const khata = /^\d{1,12}(?:\/\d{1,12}){0,4}$/;
const content = (value,max=180) => typeof value==='string' && value.trim() && value.length<=max && !value.includes('\0');
if (!content(version,60) || !content(source) || !/^\d{4}-\d{2}-\d{2}$/.test(captured) ||
    !Array.isArray(catalogue) || !catalogue.length || !catalogue.every(value=>code.test(value)) || !Array.isArray(villages)) {
  throw Error('Provide a dated source, version, official catalogue IDs, and confirmed villages.');
}
const expected = new Set(catalogue);
const checked = new Set();
const districts = new Set(catalogue.map(id=>id.split('-')[0]));
const statewide = districts.size===30 && Array.from({length:30},(_,i)=>String(i+1)).every(id=>districts.has(id));
if (expected.size!==catalogue.length) throw Error('Duplicate catalogue ID.');
for (const place of villages) {
  if (!expected.has(place.code) || checked.has(place.code) || ![place.district,place.tehsil,place.village].every(value=>content(value)) ||
      (place.ri!=null && !/^[1-9]\d{0,5}$/.test(place.ri))) throw Error('Invalid or duplicate confirmed village ID.');
  checked.add(place.code);
}
if (!checked.size) throw Error('No confirmed village coverage.');
const sql = value => value==null ? 'NULL' : "'"+String(value).replaceAll("'","''")+"'";
const values = (...parts) => parts.map(sql).join(',');
const output = createWriteStream(outputPath,{flags:'wx'});
const closed=once(output,'close');
try {
  await once(output,'open');
  const line = async statement => {if (!output.write(statement+';\n')) await once(output,'drain');};
  // Keep the existing active version available until the last statement.
  await line(`INSERT INTO landreview_imports VALUES (${sql(version)})`);
  for (const place of villages) await line(`INSERT INTO landreview_villages VALUES (${values(version,place.code,place.district,place.tehsil,place.village,place.ri)})`);
  const reader=createInterface({input:createReadStream(recordsPath,{encoding:'utf8'}),crlfDelay:Infinity});
  let index=0;
  for await (const text of reader) {
    index++;
    if (!text.trim()) continue;
    const row=JSON.parse(text);
    const plots=row.plots??[];
    if (!checked.has(row.village) || !content(row.tenant,200) || !indexWords(row.tenant) || !khata.test(row.khata) || typeof row.khata!=='string' ||
        !Array.isArray(plots) || plots.length>1000 || !plots.every(plot=>content(plot,60))) throw Error(`Invalid holding in line ${index}.`);
    await line(`INSERT INTO landreview_holdings(version,village,tenant,khata,plots) VALUES (${values(version,row.village,row.tenant,row.khata,JSON.stringify([...new Set(plots)]))})`);
    await line(`INSERT INTO landreview_names(rowid,words) VALUES (last_insert_rowid(),${sql(indexWords(row.tenant))})`);
  }
  await line(`INSERT OR REPLACE INTO landreview_active VALUES (1,${values(version,source,captured,expected.size,checked.size,statewide?1:0)})`);
  output.end();
  await closed;
} catch (error) {
  output.destroy();
  await closed.catch(()=>{});
  if (error.code!=='EEXIST') {
    const {unlink}=await import('node:fs/promises');
    await unlink(outputPath).catch(()=>{});
  }
  throw error;
}
