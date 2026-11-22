import { normalize, parcelKey, safeURL, sourceCaste, validateWorkspace } from './core.mjs';

const maxFile = 100 * 1024 * 1024;
const utf8 = new TextEncoder();
const readJSON = async file => JSON.parse(await file.async('string'));
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const getZip = () => new globalThis.JSZip();
const asPDF = () => globalThis.PDFLib;

export function download(name, payload, type = 'application/octet-stream') {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(payload instanceof Blob ? payload : new Blob([payload], {type}));
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}

export function localStore() {
  const open = indexedDB.open('landreview', 1);
  return new Promise((resolve,reject) => {
    open.onupgradeneeded = () => open.result.createObjectStore('workspace');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve({
      read() { return new Promise((ok,fail) => { const r = open.result.transaction('workspace').objectStore('workspace').get('active'); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); }); },
      write(data) { return new Promise((ok,fail) => { const tx = open.result.transaction('workspace','readwrite'); tx.objectStore('workspace').put(data, 'active'); tx.oncomplete = ok; tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error); }); }
    });
  });
}

export async function zipWorkspace(data) {
  const zip = getZip();
  const {pdfs = {}, ...workspace} = data;
  const files = {}, pdfIndex = {};
  async function entry(name, bytes) {
    files[name] = {size:bytes.byteLength, sha256:await digest(bytes)};
    zip.file(name,bytes);
  }
  for (const [key, doc] of Object.entries(pdfs)) {
    const path = `ror/${Object.keys(pdfIndex).length+1}.pdf`;
    await entry(path, doc.bytes);
    pdfIndex[key] = {path, name:doc.name};
  }
  await entry('workspace.json',utf8.encode(JSON.stringify({...workspace,pdfIndex})));
  zip.file('manifest.json', JSON.stringify({format:'landreview',version:1,files}));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

export async function importFile(file) {
  if (file.size > maxFile) throw Error('This file exceeds the 100 MB import limit. Split it into smaller workspaces.');
  if (/\.json$/i.test(file.name)) {
    const data = JSON.parse(await file.text());
    data.rules ??= {surnames:['ଜେନା','ଯେନା'],names:data.names ?? [],caste:sourceCaste,useCaste:false};
    return validateWorkspace(data);
  }
  const zip = await getZip().loadAsync(await file.arrayBuffer());
  if (/\.xlsx?m$/i.test(file.name) || /\.xlsx$/i.test(file.name)) return importWorkbook(zip);
  if (!zip.file('manifest.json') || !zip.file('workspace.json')) throw Error('This ZIP is not a LandReview workspace. Select LandReview_Odisha_Workspace.zip or a Site backup.');
  const manifest = await readJSON(zip.file('manifest.json'));
  if (manifest.format !== 'landreview' || manifest.version !== 1) throw Error('Unsupported workspace version.');
  const list = Object.entries(manifest.files ?? {});
  if (list.length > 10000 || !list.length || list.some(([, f]) => !Number.isSafeInteger(f.size) || f.size < 1) || list.reduce((n,[,f])=>n+f.size,0)>maxFile) throw Error('Workspace manifest exceeds supported import limits.');
  const verified = new Map();
  for (const [path, file] of list) {
    const item = zip.file(path);
    if (!item || item._data?.uncompressedSize !== file.size) throw Error(`Missing or invalid file size: ${path}`);
    const bytes = await item.async('uint8array');
    if (bytes.length !== file.size || await digest(bytes) !== file.sha256) throw Error(`Checksum failed: ${path}`);
    verified.set(path,bytes);
  }
  const bytes = verified.get('workspace.json');
  if (!bytes) throw Error('Workspace manifest lacks record data.');
  const {pdfIndex, ...data} = JSON.parse(new TextDecoder().decode(bytes));
  validateWorkspace(data);
  data.pdfs = {};
  const keys = new Set(data.rows.map(parcelKey));
  for (const [key, pdf] of Object.entries(pdfIndex ?? {})) {
    const bytes = verified.get(pdf.path);
    if (!keys.has(key) || !bytes || new TextDecoder().decode(bytes.subarray(0,5)) !== '%PDF-') throw Error('Invalid parcel document in workspace.');
    data.pdfs[key] = {name:pdf.name, bytes};
  }
  return data;
}

const parseXML = value => {
  const doc = new DOMParser().parseFromString(value,'application/xml');
  if(doc.querySelector('parsererror')) throw Error('Invalid spreadsheet XML.');
  return doc;
};
const elements = (node, name) => [...node.getElementsByTagNameNS('*',name)];

async function importWorkbook(zip) {
  const read = async path => {
    const file = zip.file(path);
    if (!file || file._data?.uncompressedSize > maxFile) throw Error(`Workbook part missing or too large: ${path}`);
    return parseXML(await file.async('string'));
  };
  const wb = await read('xl/workbook.xml');
  const plot = elements(wb,'sheet').find(x => x.getAttribute('name') === 'Plots');
  if (!plot) throw Error('Excel import requires a Plots tab with Map code, Parcel ID and plot information.');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const id = plot.getAttribute('r:id');
  const target = elements(rels,'Relationship').find(x => x.getAttribute('Id') === id)?.getAttribute('Target');
  if (!target || !/^(?:\/xl\/)?worksheets\/sheet\d+\.xml$/.test(target)) throw Error('Unsupported Plots worksheet location.');
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const doc = await read(path);
  const strings = zip.file('xl/sharedStrings.xml') ? elements(await read('xl/sharedStrings.xml'),'si').map(e => elements(e,'t').map(t=>t.textContent).join('')) : [];
  const values = cell => {
    const value = elements(cell,'v')[0]?.textContent ?? '';
    if (cell.getAttribute('t') === 's') return strings[Number(value)] ?? '';
    if (cell.getAttribute('t') === 'inlineStr') return elements(cell,'t').map(x=>x.textContent).join('');
    return value;
  };
  const file = path.split('/').pop();
  const links = new Map();
  const relPath = `xl/worksheets/_rels/${file}.rels`;
  if (zip.file(relPath)) {
    const targets = new Map(elements(await read(relPath),'Relationship').map(r => [r.getAttribute('Id'),safeURL(r.getAttribute('Target'))]));
    for (const link of elements(doc,'hyperlink')) links.set(link.getAttribute('ref'),targets.get(link.getAttribute('r:id')));
  }
  const [header,...records] = elements(doc,'row');
  if (!header) throw Error('Plots sheet is empty.');
  const columns = new Map(elements(header,'c').map(cell => [normalize(values(cell)),cell.getAttribute('r').replace(/\d+$/,'')]));
  const names = new Set(), surnames = new Set(), rows = [], summary = new Map();
  for (const record of records) {
    const cells = new Map(elements(record,'c').map(cell => [cell.getAttribute('r').replace(/\d+$/,''),cell]));
    const cell = label => cells.get(columns.get(normalize(label)));
    const get = label => cell(label) ? values(cell(label)) : '';
    const link = label => { const c=cell(label); return c ? safeURL(links.get(c.getAttribute('r')) || /\bHYPERLINK\("([^"]+)"/i.exec(elements(c,'f')[0]?.textContent ?? '')?.[1] || values(c)) : ''; };
    if (!get('Parcel ID')) continue;
    const row = {id:get('Parcel ID'),gis:get('Map code'),info:get('Original plot information'),village:get('Village'),village_code:get('Village code'),sheet:get('Sheet'),plot:get('Plot'),khata:get('Khata'),area_acres:get('Area (acres)'),status:get('Collection status') || (get('Original plot information') ? 'Retrieved' : 'No plot information'),confirmed:get('Family ownership review'),source:link('Plot lookup URL'),front:link('ROR Front'),back:link('ROR Back'),caste:get('Caste (source text)'),state:get('State'),district:get('District'),district_code:get('District code'),tehsil:get('Tehsil') || get('Taluk'),tehsil_code:get('Tehsil code') || get('Taluk code'),ri:get('RI') || get('Revenue circle'),ri_code:get('RI code') || get('Revenue circle code')};
    rows.push(row);
    if (!summary.has(row.gis)) summary.set(row.gis,{gis:row.gis,name:row.village,sheet:row.sheet,village:row.village_code,count:0});
    summary.get(row.gis).count++;
    for (const name of (get('Specific matched variants') || get('Specific matched strings')).split(';').map(s=>s.trim()).filter(Boolean)) names.add(name);
    for (const name of get('Surname matched strings').split(';').map(s=>s.trim()).filter(Boolean)) surnames.add(name);
  }
  return validateWorkspace({title:'Imported plots',rows,summary:[...summary.values()],geometry:{},pdfs:{},rules:{surnames:[...surnames],names:[...names],caste:sourceCaste,useCaste:columns.has('caste (source text)')}});
}

const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[<>&"']/g, a=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'})[a]);
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const relSchema = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageSchema = 'http://schemas.openxmlformats.org/package/2006/relationships';
function column(index) { let x = ''; for (let n=index+1;n;n=Math.floor((n-1)/26)) x=String.fromCharCode(65+(n-1)%26)+x;return x; }

export async function exportWorkbook(rows, matches, state = '') {
  const zip = getZip();
  const labels = ['Village','Village code','Sheet','Plot','Khata','Area (acres)','Surname matched strings','Specific matched variants','Original plot information','Caste (source text)','Caste label match status','Caste label group','Surname + criteria','Specific name + criteria','Collection status','Family ownership review','Map code','Parcel ID','ROR Front','ROR Back','Plot lookup URL','State','District','District code','Tehsil','Tehsil code','RI','RI code'];
  const dimensions = `A1:${column(labels.length-1)}${rows.length+1}`;
  const lines = [], hyperlinks = [], relationships = [];
  const rowXML = (line, i, bold = false) => `<row r="${i}">${line.map((value,j) => { const cell = `${column(j)}${i}`; return typeof value === 'boolean' ? `<c r="${cell}" t="b"><v>${Number(value)}</v></c>` : `<c r="${cell}"${bold?' s="1"':''} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`; }).join('')}</row>`;
  lines.push(rowXML(labels,1,true));
  rows.forEach((row,i) => {
    const m = matches[i];
    const urls = [row.front,row.back,row.source].map(safeURL);
    urls.forEach((url,j) => {if (url) { const id = `rId${relationships.length+1}`; hyperlinks.push(`<hyperlink ref="${column(18+j)}${i+2}" r:id="${id}"/>`); relationships.push(`<Relationship Id="${id}" Type="${relSchema}/hyperlink" Target="${xml(url)}" TargetMode="External"/>`); }});
    const locations = ['district','tehsil','ri'].flatMap(key => [row[`${key}_name`] || row[key], row[`${key}_code`] || (row[`${key}_name`] ? row[key] : '')]);
    lines.push(rowXML([row.village,row.village_code,row.sheet,row.plot,row.khata,row.area_acres,m.surname.join('; '),m.full.join('; '),row.info,m.caste.raw,m.caste.status,m.caste.groups,m.surnameSelected,m.fullSelected,row.status,row.confirmed,row.gis,row.id,...urls,row.state || state,...locations],i+2));
  });
  zip.file('[Content_Types].xml',header+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels',`${header}<Relationships xmlns="${packageSchema}"><Relationship Id="rId1" Type="${relSchema}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml',`${header}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${relSchema}"><sheets><sheet name="Plots" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',`${header}<Relationships xmlns="${packageSchema}"><Relationship Id="rId1" Type="${relSchema}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relSchema}/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml',`${header}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml',`${header}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${relSchema}"><dimension ref="${dimensions}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="8" width="22" customWidth="1"/><col min="9" max="9" width="65" customWidth="1"/><col min="10" max="${labels.length}" width="26" customWidth="1"/></cols><sheetData>${lines.join('')}</sheetData><autoFilter ref="${dimensions}"/>${hyperlinks.length?`<hyperlinks>${hyperlinks.join('')}</hyperlinks>`:''}</worksheet>`);
  if (relationships.length) zip.file('xl/worksheets/_rels/sheet1.xml.rels',`${header}<Relationships xmlns="${packageSchema}">${relationships.join('')}</Relationships>`);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}

export async function mergeROR(front, back) {
  const {PDFDocument} = asPDF();
  const output = await PDFDocument.create();
  for (const blob of [front,back]) {
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    if (doc.getForm().getFields().some(f=>f.constructor.name === 'PDFSignature')) throw Error('This PDF has a signature field. Keep the original pages as separate documents.');
    for (const page of await output.copyPages(doc,doc.getPageIndices())) output.addPage(page);
  }
  return output.save();
}

export async function exportRORBundle(rows, matches, pdfs) {
  const zip = getZip();
  const csv = value => `"${String(value ?? '').replace(/"/g,'""')}"`;
  const lines = ['Village,Sheet,Plot,Khata,Caste,PDF,Official front,Official back'];
  rows.forEach((row,i) => {
    const doc = pdfs?.[parcelKey(row)];
    const path = doc ? `RoR/${String(i+1).padStart(3,'0')}_${doc.name.replace(/[^A-Za-z0-9_.-]/g,'_')}` : '';
    if (doc) zip.file(path,doc.bytes);
    lines.push([row.village,row.sheet,row.plot,row.khata,matches[i].caste.raw,path,safeURL(row.front),safeURL(row.back)].map(csv).join(','));
  });
  zip.file('RoR-index.csv','\ufeff'+lines.join('\r\n'));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
