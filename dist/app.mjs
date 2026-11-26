import {mountTour} from './guided-tour.mjs';
import {normalize,parcelKey,safeURL,sourceCaste,suggestSurname,validateWorkspace,matchRows} from './core.mjs';
import {download,localStore,savedLookupStore,zipWorkspace,importFile,exportWorkbook,mergeROR,savedHoldings,combineSavedHoldings,exportRORBundle} from './files.mjs';
import {drawMap,makeMapPDF,colours} from './maps.mjs';
import {portals,directoryURL} from './portals.mjs';
import {mountOfficialOdisha} from './official-odisha.mjs';
import {renderHomeSearch} from './home-search.mjs';
import {assignImportState} from './search.mjs';
import {mountOdishaLookup} from './odisha-lookup.mjs';
import {mountLookupWorkspace,saveLookup} from './lookup-workspace.mjs';
import {demoNames, demoPlace, loadDemoWorkspace} from './demo.mjs';
import {mountWorkspaceSheet,withPublicGeometry} from './workspace-maps.mjs';
import {plotNumber} from './sheet-overlays.mjs';

if (navigator.serviceWorker) void navigator.serviceWorker.register('./offline-worker.js').catch(()=>{});

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const number = new Intl.NumberFormat('en-IN');
const labels = {overview:'Home',plots:'Plot records',names:'Name matching',maps:'Village maps',ror:'Records of Rights',workspace:'Workspace',portals:'State portals'};
const tag = (url,title) => safeURL(url) ? `<a href="${escape(safeURL(url))}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>` : '';
const legend = () => `<div class="legend">${Object.entries({full:'Specific name',surname:'Surname',none:'Not selected',missing:'Missing info'}).map(([key,value])=>`<span><i style="background:${colours[key]}"></i>${value}</span>`).join('')}</div>`;
const empty = message => `<div class="empty">${escape(message)}</div>`;
const defaultRules = () => ({surnames:[],names:[],useCaste:false,caste:sourceCaste});

let workspace = null, matches = [], byKey = new Map(), selected = 'overview', store, busy = false, request = 0;
let importState = '', pendingLookup;
let plotPage = 0, query = '', rowFilter = 'all', plotSheet = '', rorPage = 0, mapSheet = '', lastView = 'overview';
const size = 40;
const demoSession = new URLSearchParams(location.search).get('demo')==='1';
const demoLink = '<a class="button secondary" href="?demo=1">Try guided demo</a>';
const worker = typeof Worker !== 'undefined' ? new Worker('./matcher.mjs',{type:'module'}) : null;
const status = (message = '', error = false) => { $('status').hidden = !message; $('status').textContent=message;$('status').classList.toggle('error',error); };

function matched(data) {
  if (!worker) return Promise.resolve(matchRows(data.rows,data.rules));
  const id=++request;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>cleanup(()=>reject(Error('Name matching timed out. Try a smaller workspace.'))),45000);
    const listener=event=>{if(event.data.id===id)cleanup(()=>event.data.error?reject(Error(event.data.error)):resolve(event.data.matches));};
    const cleanup=done=>{clearTimeout(timeout);worker.removeEventListener('message',listener);done();};
    worker.addEventListener('message',listener);
    worker.postMessage({id,rows:data.rows,rules:data.rules});
  });
}

async function activate(next) {
  validateWorkspace(next);
  next=await withPublicGeometry(next);
  const result=await matched(next);
  workspace=next;matches=result;
  byKey=new Map(next.rows.map((row,i)=>[parcelKey(row),result[i]]));
  mapSheet=next.summary.find(sheet=>next.geometry?.[sheet.gis])?.gis ?? '';
  plotSheet='';query='';plotPage=0;rorPage=0;
}

async function persist() {
  if (workspace?.demo || !store) return false;
  try { await store.write(workspace);return true; }
  catch { return false; }
}

async function task(message, handler) {
  if(busy) return;
  busy=true; status(message); $('import').disabled=true; $('backup').disabled=true;
  try {await handler();}
  catch(error){status(error.message||String(error),true);}
  finally{busy=false;$('import').disabled=false;$('backup').disabled=!workspace;}
}

let officialVillage, mapSearchHits;
function navigate(view,{village,hits}={}) { $('nav-toggle').setAttribute('aria-expanded','false'); selected=view; officialVillage=village; mapSearchHits=hits; status(); render(); }
function matchingCount(kind) { return matches.filter(m=>kind==='full'?m.fullSelected:m.surnameSelected).length; }
function metric(count, label, accent='') { return `<div class="stat ${accent}"><small>${escape(label)}</small><strong>${number.format(count)}</strong></div>`; }
const maps = () => (workspace?.summary ?? []).filter(m => workspace.geometry?.[m.gis]?.features?.length);
function chooseImport(state = '') {
  if (busy) return;
  importState = state;
  $('file').click();
}

function overview() {
  const search = '<section id="home-search" class="card home-search"></section>';
  const mountSearch = () => renderHomeSearch($('home-search'), {workspace,escape,tag,openPlot:showPlot,openMap:hits=>navigate('maps',{hits}),openOfficial:village=>navigate('portals',{village}),importRecords:chooseImport,onSave:saveLookup});
  if (!workspace) {
    $('view').innerHTML = `${search}<section class="card"><div class="card-head"><div><h2>Records and maps</h2><p>Open an official portal, import records you already have, or explore with fictional plots.</p></div></div><div class="actions">${demoLink}<button class="button secondary" id="go-portals">Open official sources</button></div></section>`;
    mountSearch();
    $('view').querySelector('[href="?demo=1"]').onclick=event=>{event.preventDefault();$('take-tour').click();};
    $('go-portals').onclick=()=>navigate('portals');
    return;
  }
  const count = workspace?.rows.length ?? 0, first = maps()[0];
  const guide=workspace.demo?`<section class="card demo-guide"><h2>Guided India Land Search demo</h2><p>All example holdings, maps, and RoRs are fictional. This demo runs entirely in this tab.</p><div class="actions"><button type="button" class="button primary" id="demo-place">Find sample village</button><button type="button" class="button secondary" id="demo-names">Review name variants</button><button type="button" class="button secondary" id="demo-map">Open matched map</button><button type="button" class="button secondary" id="demo-ror">Open sample RoRs</button><a class="button secondary" href="?">Return to India Land Search</a></div></section>`:'';
  $('view').innerHTML=`${guide}${search}<section class="hero"><div><h2>${escape(workspace.title)}</h2><p>${workspace.demo?'Explore the workflow with fictional plots.':'Review parcel matches, inspect source text, and export maps and Records of Rights.'}</p><div class="actions"><button class="button primary" id="review-plots">Review plots</button></div></div><canvas id="hero-map" width="420" height="220" aria-label="Decorative parcel map"></canvas></section>
  <div class="stats">${metric(count,'Plot entries')}${metric(matchingCount('surname'),'Surname criteria')}${metric(matchingCount('full'),'Specific-name criteria','accent')}${metric(Object.keys(workspace?.pdfs||{}).length,'Saved RoR PDFs')}</div>
  <div class="layout"><section class="card"><div class="card-head"><div><h2>Village overview</h2><p>${first?`${escape(first.name)} · Sheet ${escape(first.sheet)}`:'Parcel geometry from your workspace'}</p></div><button class="button secondary" id="go-maps">Open maps</button></div>${first?'<div class="map-frame"><canvas width="850" height="540" id="overview-map" aria-label="Village overview map"></canvas></div>'+legend():empty('Import a workspace with parcel geometry to view a map.')}</section>
  <div class="stack"><section class="card"><div class="card-head"><div><h2>Review criteria</h2><p>${workspace?.rules.useCaste?'Name and source caste labels':'Name matching'}</p></div><button id="go-names" class="button secondary">Edit</button></div><ul class="list"><li>Approved surnames <strong>${workspace?.rules.surnames.length??0}</strong></li><li>Specific name variants <strong>${workspace?.rules.names.length??0}</strong></li><li>Map sheets <strong>${maps().length}</strong></li></ul></section><section class="card"><h2>State portals</h2><p>Find the official land-record service for any state or union territory. Import the files you obtain there.</p><button id="go-portals" class="button secondary">Browse portals</button></section></div></div>`;
  if (first) {
    const art=workspace.geometry[first.gis];
    drawMap($('hero-map'),art.features,first.gis,byKey);
    drawMap($('overview-map'),art.features,first.gis,byKey,{labels:art.features.length<250});
  }
  mountSearch();
  $('demo-place')?.addEventListener('click',()=>{
    const finder=$('village-finder');
    finder.open=true;
    const input=finder.querySelector('input[type="search"]');
    input.value=demoPlace.village;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
  });
  $('demo-names')?.addEventListener('click',()=>{
    const input=$('home-search-form').elements.namedItem('names');
    input.value=['Asha Jena','Gopal Yena',...demoNames].join('\n');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    $('variant-heading')?.focus();
  });
  $('demo-map')?.addEventListener('click',()=>navigate('maps'));
  $('demo-ror')?.addEventListener('click',()=>navigate('ror'));
  $('review-plots')?.addEventListener('click',()=>navigate('plots'));
  $('go-maps').onclick=()=>navigate('maps');$('go-names').onclick=()=>navigate('names');$('go-portals').onclick=()=>navigate('portals');
}

function table(rows, ror=false) {
  if(!rows.length)return empty(ror?'No plots meet the current specific-name criteria.':'No plots match this search.');
  return `<div class="table-scroll"><table><thead><tr><th>Village / sheet</th><th>Plot</th><th>Khata</th><th>${ror?'RoR document':'Match'}</th><th>Source caste</th></tr></thead><tbody>${rows.map(i=>{const row=workspace.rows[i],m=matches[i],doc=workspace.pdfs?.[parcelKey(row)];return `<tr><td>${escape(row.village)} <span class="muted">/ ${escape(row.sheet)}</span></td><td><button class="plain-link" data-plot="${i}">${escape(row.plot)}</button></td><td>${escape(row.khata||'—')}</td><td>${ror?(doc?'<span class="badge">Saved PDF</span>':'<span class="muted">Source links</span>'):`<span class="badge ${m.level}">${({full:'Specific name',surname:'Surname',none:'Not selected',missing:'Missing info'})[m.level]}</span>`}</td><td>${escape(m.caste.raw||'—')}</td></tr>`;}).join('')}</tbody></table></div>`;
}

const paged = (total,page) => `<div class="pagination"><span class="muted">${total?`${page*size+1}–${Math.min(total,(page+1)*size)} of ${number.format(total)}`:'0 records'}</span><div class="actions"><button class="button secondary" id="previous" ${page===0?'disabled':''}>Previous</button><button class="button secondary" id="next" ${(page+1)*size>=total?'disabled':''}>Next</button></div></div>`;
const bindTable = (body,page,handler) => {
  body.querySelectorAll('[data-plot]').forEach(button=>button.onclick=()=>showPlot(Number(button.dataset.plot)));
  $('previous').onclick=()=>handler(page-1);$('next').onclick=()=>handler(page+1);
};

const officialLookup = () => demoSession ? '' : '<section class="card" id="official-odisha-lookup"></section>';

function openSavedLookup(item) {
  const view={map:'maps',plot:'plots',ror:'ror'}[item.kind];
  if (!view) return;
  pendingLookup=item;
  navigate(view);
}

function mountOfficialLookup(mode) {
  const root=$('official-odisha-lookup');
  if (!root) return;
  const initial=pendingLookup;
  pendingLookup=undefined;
  mountOdishaLookup(root,mode,{escape,tag,onSave:saveLookup,initial});
}

function lookupWorkspace() {
  $('view').innerHTML='<div id="lookup-workspace"></div>';
  mountLookupWorkspace($('lookup-workspace'),{escape,onOpen:openSavedLookup});
}

function plots() {
  if (!workspace) {
    $('view').innerHTML=officialLookup();
    mountOfficialLookup('plots');
    return;
  }
  $('view').innerHTML=`${officialLookup()}<section class="card"><div class="card-head"><div><h2>Review plot records</h2><p>Search a village, plot number, name, or phrase from the original record.</p></div><button id="excel" class="button secondary" ${workspace?'':'disabled'}>Export Excel</button></div><div class="toolbar"><input type="search" id="search" aria-label="Search plot records" placeholder="Search plots or owner text" value="${escape(query)}"><select id="plot-sheet" aria-label="Filter by sheet"><option value="">All village sheets</option>${(workspace?.summary??[]).map(s=>`<option value="${escape(s.gis)}" ${plotSheet===s.gis?'selected':''}>${escape(s.name)} · ${escape(s.sheet)}</option>`).join('')}</select><select id="row-filter" aria-label="Filter by match"><option value="all">All records</option><option value="full">Specific name</option><option value="surname">Surname criteria</option><option value="review">Mixed or missing caste</option></select></div><div id="plot-results"></div></section>`;
  $('row-filter').value=rowFilter;
  const results=()=>{
    const normalized=normalize(query), indices=[];
    workspace.rows.forEach((r,i)=>{const m=matches[i];if(plotSheet&&r.gis!==plotSheet)return;if(rowFilter==='full'&&!m.fullSelected||rowFilter==='surname'&&!m.surnameSelected||rowFilter==='review'&&!['Mixed / review','Missing'].includes(m.caste.status))return;if(!normalized||normalize(`${r.village} ${r.plot} ${r.khata} ${r.info}`).includes(normalized))indices.push(i);});
    $('plot-results').innerHTML=table(indices.slice(plotPage*size,(plotPage+1)*size))+paged(indices.length,plotPage);
    bindTable($('plot-results'),plotPage,p=>{plotPage=p;results();});
  };
  $('search').oninput=e=>{query=e.target.value;plotPage=0;results();};
  $('plot-sheet').onchange=e=>{plotSheet=e.target.value;plotPage=0;results();};
  $('row-filter').onchange=e=>{rowFilter=e.target.value;plotPage=0;results();};
  $('excel').onclick=()=>task('Creating Excel workbook…',async()=>{download('India_Land_Search_Plots.xlsx',await exportWorkbook(workspace.rows,matches,workspace.state));status(`Excel exported with ${number.format(workspace.rows.length)} plot entries.`);});
  mountOfficialLookup('plots');
  results();
}

function showPlot(i, searchMatches) {
  const row=workspace.rows[i],m=matches[i],key=parcelKey(row),doc=workspace.pdfs?.[key];
  $('detail-content').innerHTML=`<h2>${escape(row.village)} · Plot ${escape(row.plot)}</h2><p>Sheet ${escape(row.sheet)} · Khata ${escape(row.khata||'—')}</p><pre>${escape(row.info||'No plot information.')}</pre><p><strong>Caste evidence</strong> ${escape(m.caste.raw||'Missing')} · ${escape(m.caste.status)}</p><p><strong>Name variants</strong> ${escape([...m.full,...m.surname].join(' · ')||'None')}</p><div class="actions">${tag(row.front,'Official front')}${tag(row.back,'Official back')}${doc?'<button class="button primary" id="get-ror">Download saved RoR</button>':''}</div><details class="ror-upload"><summary>Add front and back PDF copies</summary><p>Choose both pages for this parcel. Keep signed documents as originals.</p><label class="label">Front PDF<input type="file" id="front-upload" accept="application/pdf,.pdf"></label><label class="label">Back PDF<input type="file" id="back-upload" accept="application/pdf,.pdf"></label><button id="combine" class="button secondary">Combine and save</button><p id="ror-status" role="status"></p></details>`;
  if (searchMatches?.length) {
    const terms = document.createElement('p');
    terms.innerHTML = `<strong>Homepage search</strong> ${escape(searchMatches.join(' · '))}`;
    $('detail-content').querySelector('pre').after(terms);
  }
  $('get-ror')?.addEventListener('click',()=>download(doc.name,doc.bytes,'application/pdf'));
  $('combine').onclick=async()=>{
    const front=$('front-upload').files[0],back=$('back-upload').files[0];
    if(!front||!back){$('ror-status').textContent='Choose a front and a back PDF.';return;}
    if(front.size+back.size>30*1024*1024){$('ror-status').textContent='The front and back together must be 30 MB or smaller.';return;}
    $('combine').disabled=true;
    try {
      const bytes=await mergeROR(front,back);
      workspace.pdfs??={};workspace.pdfs[key]={name:`RoR_${row.gis}_${row.plot}.pdf`,bytes};
      const saved = await persist(); if (lastView==='ror')render();
      $('ror-status').textContent=saved?'Combined PDF saved in this browser.':'Combined PDF is in this session. Back up the workspace to retain it.';
      download(workspace.pdfs[key].name,bytes,'application/pdf');
    } catch(error){$('ror-status').textContent=error.message;}finally{$('combine').disabled=false;}
  };
  if(!$('detail').open)$('detail').showModal();
}

const split = input => [...new Map(input.split(/\n|;/u).map(x=>[normalize(x),x.trim()]).filter(([x])=>x)).values()];
function names() {
  if (!workspace) {
    $('view').innerHTML='<section class="card home-search" id="name-lookup"><p role="status">Opening name review…</p></section>';
    const root=$('name-lookup');
    void savedLookupStore.list().catch(()=>[]).then(items=>{
      if (!root.isConnected) return;
      const plots=items.filter(item=>item.kind==='plot' && item.data?.info);
      const local=plots.length ? {state:'Odisha',rows:plots.map(item=>({
        ...item.place,state:'Odisha',gis:item.place.id+'/'+item.place.riCode+'/'+item.sheet,id:item.key,
        sheet:item.sheet,plot:item.number,khata:item.data.khata,info:item.data.info,status:'Retrieved'
      }))} : null;
      renderHomeSearch(root,{workspace:local,escape,tag,openPlot:i=>openSavedLookup(plots[i]),openOfficial:village=>navigate('portals',{village}),importRecords:chooseImport,onSave:saveLookup});
    });
    return;
  }
  const rules=workspace.rules;
  $('view').innerHTML=`<div class="layout"><section class="card"><div class="card-head"><div><h2>Approved matching rules</h2><p>Use one spelling per line. The specific-name list can include middle-name and surname combinations.</p></div></div><label class="label">Surname variants<textarea id="surname-lines" rows="4">${escape(rules.surnames.join('\n'))}</textarea></label><label class="label">Specific full-name variants<textarea id="full-lines" rows="7">${escape(rules.names.join('\n'))}</textarea></label><label class="check"><input id="use-caste" type="checkbox" ${rules.useCaste?'checked':''}> Require an approved source caste label</label><label class="label">Caste label groups<textarea id="caste-lines" rows="3" placeholder="Separate equivalent spellings with commas">${escape((rules.caste??[]).map(g=>g.aliases.join(', ')).join('\n'))}</textarea></label><button id="apply-rules" class="button primary">Apply and rematch</button></section><section class="card"><div class="card-head"><div><h2>Suggest surname spellings</h2><p>Approve a spelling after checking it against the local record.</p></div></div><label class="label">English or local-script surname<input id="surname-input" placeholder="Jena"></label><label class="label">Record language<select id="language"><option value="or">Odia</option><option value="hi">Hindi</option><option value="mr">Marathi</option><option value="bn">Bengali</option><option value="te">Telugu</option><option value="manual">Other script (enter spelling)</option></select></label><button id="suggest" class="button secondary">Find variants</button><div id="candidates" aria-live="polite"></div></section></div>`;
  $('suggest').onclick=()=>{
    const input=$('surname-input').value, lang=$('language').value;
    const candidates=suggestSurname(input,lang);
    const observed = candidates.length ? matchRows(workspace.rows,{surnames:candidates.map(c=>c.variant)}) : [];
    const counts=candidates.map(c=>[c.variant,observed.filter(m=>m.surname.includes(c.variant)).length]).filter(([,n])=>n);
    const ranked=suggestSurname(input,lang,counts);
    $('candidates').innerHTML=ranked.length?ranked.map((c,i)=>`<div class="candidate"><div><strong>${escape(c.variant)}</strong><small>${escape(c.source)}</small></div><button class="button secondary" data-candidate="${i}">Add variant</button></div>`).join(''):empty('No local suggestion. Enter a spelling from the original record.');
    $('candidates').querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>{const input=$('surname-lines');input.value=split(`${input.value}\n${ranked[Number(b.dataset.candidate)].variant}`).join('\n');b.disabled=true;b.textContent='Added';});
  };
  $('apply-rules').onclick=()=>task('Reapplying name rules…',async()=>{
    const caste=$('caste-lines').value.split('\n').map(line=>line.split(',').map(v=>v.trim()).filter(Boolean)).filter(x=>x.length).map(aliases=>({label:aliases[0],aliases}));
    if($('use-caste').checked&&!caste.length)throw Error('Add a source caste label before enabling that filter.');
    const next={...workspace,rules:{surnames:split($('surname-lines').value),names:split($('full-lines').value),caste,useCaste:$('use-caste').checked},ruleVersion:new Date().toISOString()};
    await activate(next);const saved=await persist();render();status(saved?'Matching rules saved and results updated.':'Results updated for this session. Use a backup to keep the rules.');
  });
}

function mapView(searchHits) {
  const rowByKey=new Map((workspace?.rows??[]).map((row,index)=>[parcelKey(row),{row,index}]));
  const results=searchHits?new Map(searchHits.map(({index,terms})=>[parcelKey(workspace.rows[index]),{level:'full',full:terms}])):byKey;
  const parcels=new Map(maps().map(sheet=>[sheet.gis,workspace.geometry[sheet.gis].features]));
  function belongs(sheet,feature) {
    const key=parcelKey({gis:sheet.gis,id:feature.properties?.id}), row=rowByKey.get(key)?.row;
    return Boolean(row && (!feature.properties.kide || !row.plot || plotNumber(row.plot)===plotNumber(feature.properties.kide)));
  }
  const matchesMap=new Map();
  for (const sheet of maps()) {
    for (const feature of parcels.get(sheet.gis)) {
      if (!belongs(sheet,feature)) continue;
      const key=parcelKey({gis:sheet.gis,id:feature.properties?.id});
      if (results.has(key)) matchesMap.set(key,results.get(key));
    }
  }
  const matched=sheet=>parcels.get(sheet.gis).some(feature=>['full','surname'].includes(matchesMap.get(parcelKey({gis:sheet.gis,id:feature.properties?.id}))?.level));
  const sheets=searchHits?maps().filter(matched):maps();
  if (!sheets.length) {
    $('view').innerHTML=officialLookup()+(searchHits?empty('No matched parcels have corresponding map geometry.'):'');
    mountOfficialLookup('maps');
    return;
  }
  if (!sheets.some(sheet=>sheet.gis===mapSheet)) mapSheet=sheets[0].gis;
  $('view').innerHTML=`${officialLookup()}<section class="card"><div class="card-head"><div><h2>Village overviews</h2><p>${searchHits?'Showing the current name search matches.':'Select a parcel to read the saved source record.'}</p></div><button id="map-export" class="button primary">Export map PDF</button></div>
    <div class="toolbar"><select id="map-sheet" aria-label="Village sheet">${sheets.map(sheet=>`<option value="${escape(sheet.gis)}" ${sheet.gis===mapSheet?'selected':''}>${escape(sheet.name)} · Sheet ${escape(sheet.sheet)}</option>`).join('')}</select>
    <label class="check"><input id="plain-map" type="checkbox"> Uncoloured</label><label class="check"><input id="matched-sheets-only" type="checkbox" checked> Export only sheets with name matches</label></div><p id="sheet-source" class="muted"></p><div id="workspace-sheet"></div>${legend()}</section>`;
  const pinState={};
  let viewer;
  function openSheet() {
    viewer?.close();
    const sheet=sheets.find(value=>value.gis===mapSheet), geometry=workspace.geometry[mapSheet];
    const rows=new Map(geometry.features.filter(feature=>belongs(sheet,feature)).map(feature=>{
      const key=parcelKey({gis:sheet.gis,id:feature.properties.id});
      return [key,rowByKey.get(key)];
    }));
    const source=sheet.captured||geometry.captured;
    $('sheet-source').textContent=source?'BhuNaksha geometry captured '+source+'. Plot Info comes from loaded records.':'';
    viewer=mountWorkspaceSheet($('workspace-sheet'),{sheet,geometry,highlights:()=>matchesMap,
      plain:()=>$('plain-map').checked,rows,escape,tag,inspect:showPlot,pinState});
  }
  $('map-sheet').onchange=event=>{mapSheet=event.target.value;openSheet();};
  $('plain-map').onchange=()=>viewer.redraw();
  $('map-export').onclick=()=>task('Rendering village map PDF…',async()=>{
    const selection=$('matched-sheets-only').checked?sheets.filter(matched):sheets;
    if (!selection.length) throw Error('No sheets have name matches. Clear the sheet filter to export every overview.');
    const bytes=await makeMapPDF(selection,workspace.geometry,matchesMap,$('plain-map').checked);
    download('India_Land_Search_Village_Maps.pdf',bytes,'application/pdf');
    status(`Map PDF exported with ${selection.length} overview pages.`);
  });
  mountOfficialLookup('maps');
  openSheet();
}

function ror() {
  if (!workspace) {
    $('view').innerHTML=officialLookup();
    mountOfficialLookup('ror');
    return;
  }
  const indices=matches.flatMap((m,i)=>m.fullSelected?[i]:[]);
  const holdings=savedHoldings(indices.map(i=>workspace.rows[i]),workspace?.pdfs);
  const choice=holdings.length?`<fieldset class="holding-choices"><legend>Choose khatas for the combined PDF</legend>${holdings.map((holding,i)=>`<label class="check"><input type="checkbox" data-holding="${i}" ${holding.document?'checked':'disabled'}> ${escape(holding.village)} · Khata ${escape(holding.khata)} · ${escape(holding.plots.join(', '))}${holding.document?'':' · PDF missing'}</label>`).join('')}</fieldset>`:'';
  $('view').innerHTML=`${officialLookup()}<section class="card"><div class="card-head"><div><h2>Specific-name selection</h2><p>Download the saved front-and-back PDFs and the index for the current selection.</p></div><div class="actions"><button id="ror-combined" class="button primary">Download selected RoRs (PDF)</button><button id="ror-export" class="button secondary" ${indices.length?'':'disabled'}>Export RoR ZIP</button></div></div>${choice}<div id="ror-results"></div></section>`;
  const picked=()=>[...$('view').querySelectorAll('[data-holding]:checked')].map(box=>holdings[Number(box.dataset.holding)]);
  const update=()=>$('ror-combined').disabled=!picked().length;
  $('view').querySelector('.holding-choices')?.addEventListener('change',update);
  update();
  $('ror-combined').onclick=()=>task('Assembling selected Records of Rights…',async()=>{
    const selection=picked();
    const bytes=await combineSavedHoldings(selection);
    download(workspace.demo?'India_Land_Search_Fictional_RoRs.pdf':'India_Land_Search_Selected_RoRs.pdf',bytes,'application/pdf');
    status(`Combined RoR PDF downloaded with ${selection.length} khatas.`);
  });
  const renderPage=()=>{$('ror-results').innerHTML=table(indices.slice(rorPage*size,(rorPage+1)*size),true)+paged(indices.length,rorPage);bindTable($('ror-results'),rorPage,p=>{rorPage=p;renderPage();});};renderPage();
  mountOfficialLookup('ror');
  $('ror-export').onclick=()=>task('Preparing RoR PDFs and index…',async()=>{const rows=indices.map(i=>workspace.rows[i]);const n=rows.filter(r=>workspace.pdfs?.[parcelKey(r)]).length;download('India_Land_Search_RoR_Selection.zip',await exportRORBundle(rows,indices.map(i=>matches[i]),workspace.pdfs));status(`RoR ZIP exported with ${n} saved PDFs and ${rows.length} index entries.`);});
}

function portalView() {
  $('view').innerHTML=`<section class="card"><div class="card-head"><div><h2>Official land-record directory</h2><p>36 states and union territories. Open the government portal to obtain records for import.</p></div>${tag(directoryURL,'DILRMP directory')}</div><details class="live-location" id="odisha-official-sources"></details><div class="toolbar"><input type="search" id="portal-search" aria-label="Search states and portals" placeholder="Find a state or portal"></div><div class="portal-grid" id="portal-results"></div></section>`;
  mountOfficialOdisha($('odisha-official-sources'),tag,officialVillage);
  const results=()=>{const q=normalize($('portal-search').value);$('portal-results').innerHTML=portals.filter(p=>normalize(`${p.name} ${p.label}`).includes(q)).map(p=>`<article class="card"><span class="badge">${escape(p.mode)}</span><h3>${escape(p.name)}</h3><div class="actions">${tag(p.record,p.label)}${tag(p.map,'Cadastral maps')}</div></article>`).join('')||empty('No portals match your search.');};$('portal-search').oninput=results;results();
}

function render() {
  lastView=selected;
  $('heading').textContent=selected==='overview'?'Field atlas':labels[selected];
  $('crumb').textContent=workspace?.title||'Land records';
  $('backup').disabled=!workspace||busy;
  document.querySelectorAll('.nav').forEach(b=>{const active=b.dataset.view===selected;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  ({overview,plots,names,maps:()=>mapView(mapSearchHits),ror,workspace:lookupWorkspace,portals:portalView})[selected]();
}

$('nav-toggle').onclick=()=>{
  const open=$('nav-toggle').getAttribute('aria-expanded')==='true';
  $('nav-toggle').setAttribute('aria-expanded',String(!open));
};
mountTour($('take-tour'));
if (demoSession) $('take-tour').hidden=true;
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
$('import').onclick=()=>chooseImport();
$('file').onchange=()=>{const file=$('file').files[0],state=importState;$('file').value='';importState='';if(!file)return;task('Validating and importing records…',async()=>{await activate(assignImportState(await importFile(file),state));const saved=await persist();selected='overview';render();status(`Imported ${number.format(workspace.rows.length)} records. ${saved?'Saved in this browser.':'Use Back up workspace to retain this session.'}`);});};
$('backup').onclick=()=>task('Building workspace backup…',async()=>{download('India_Land_Search_Workspace_Backup.zip',await zipWorkspace(workspace));status('Workspace backup downloaded.');});
if (demoSession) {
  $('import').hidden=true;
  await task('Loading fictional records…',async()=>{await activate(await loadDemoWorkspace());render();});
} else {
  render();
  try {store=await localStore();const stored=await store.read();if(stored&&!workspace&&!busy){await activate(stored);render();}}
  catch {status('Browser storage is unavailable. Use workspace backups to keep your data.',true);}
}
