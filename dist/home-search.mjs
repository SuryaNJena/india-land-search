import {liveNameLimit,parcelKey} from './core.mjs';
import {drawMap} from './maps.mjs';
import {portals} from './portals.mjs';
import {statePaths} from './india-states.mjs';
import {criteriaFrom, findRecords, locationFields, searchIndex} from './search.mjs';
import {mountNameReview} from './name-review.mjs';
import {mountOdishaScope} from './odisha-scope.mjs';
import {mountLiveOdishaMap} from './live-odisha-map.mjs';
import {mountVillageFinder} from './village-finder.mjs';
import {runtime} from './runtime.mjs';
import {mountIndexedResults} from './indexed-results.mjs';

const storageKey = 'landreview.home-search';
const fields = {district:'District', tehsil:'Tehsil / taluk', ri:'RI / revenue circle', village:'Villages'};
const count = new Intl.NumberFormat('en-IN');
let criteria;
try { criteria = criteriaFrom(JSON.parse(localStorage.getItem(storageKey))); }
catch { criteria = criteriaFrom(); }
let submitted = Boolean(criteria.state && criteria.names.trim());

function saveSearch() {
  try { localStorage.setItem(storageKey, JSON.stringify(criteria)); } catch { /* Current tab still retains the search. */ }
}

function parcelAt(canvas, event, hits) {
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * canvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * canvas.height / bounds.height;
  const context = canvas.getContext('2d');
  return hits.findLast(({path}) => context.isPointInPath(path, x, y, 'evenodd'))?.key;
}

export function renderHomeSearch(root, {workspace, escape, tag, openPlot, importRecords}) {
  const index = searchIndex(workspace);
  if (!criteria.state && workspace) {
    const known = new Set(index.map(x => x.state).filter(Boolean));
    if (known.size === 1) criteria.state = [...known][0];
  }
  root.innerHTML = `<div class="card-head"><div><h2>Search names in land records</h2><p>Choose a state and enter a surname or full name. Add a district, tehsil, RI, or village if you know it.</p></div></div>
    <details class="live-location" id="village-finder"></details>
    <form id="home-search-form" novalidate>
      <div class="search-fields">
        <label class="label">State or union territory<select name="state" required><option value="">Choose a state</option>${portals.map(p => `<option>${escape(p.name)}</option>`).join('')}</select></label>
        ${locationFields.map(field => `<label class="label location-input">${fields[field]} <span class="optional">Optional</span><input name="${field}" list="home-${field}" maxlength="500" placeholder="${field === 'village' ? 'Names or codes, separated by commas' : 'Name or code'}"><datalist id="home-${field}"></datalist></label>`).join('')}
        <label class="label search-names">Names or surnames<textarea name="names" rows="3" maxlength="3000" required aria-describedby="home-name-hint" placeholder="Enter one name per line"></textarea><small id="home-name-hint">Use English or the local script. Review any suggested spellings before searching.</small></label>
      </div>
      <div class="name-review" id="home-name-review" hidden></div>
      <details class="live-location" id="odisha-location" hidden></details>
      <div class="actions"><button type="submit" class="button primary" aria-describedby="home-search-feedback">Search records</button><button type="button" id="search-index" class="button secondary" hidden>Search Odisha index</button><button type="button" id="search-bhulekh" class="button secondary" aria-describedby="home-search-feedback" hidden>Search Bhulekh live</button><div id="home-portal-links" class="actions"></div></div>
      <p id="home-search-feedback" role="status"></p>
      <p class="muted" id="home-search-scope"></p>
    </form>
    <details class="search-picker"><summary>Pick a location on the map <span class="optional">Optional</span></summary><div id="home-maps"></div></details>
    <div id="home-search-results" class="search-results"></div>`;
  const form = root.querySelector('form');
  const results = root.querySelector('#home-search-results');
  const mapPicker = root.querySelector('.search-picker');
  const mapBox = root.querySelector('#home-maps');
  const scopeElement = root.querySelector('#odisha-location');
  const submitButton=form.querySelector('[type=submit]');
  const liveButton=form.querySelector('#search-bhulekh');
  const indexButton=form.querySelector('#search-index');
  const feedback=form.querySelector('#home-search-feedback');
  const control = key => form.elements.namedItem(key);
  const loadFields = () => Object.entries(criteria).forEach(([key, value]) => { control(key).value = value; });
  let liveSearch, indexedSearch, selectedVillage;
  const review = mountNameReview(root.querySelector('#home-name-review'),escape,clearResults);
  const odisha = mountOdishaScope(scopeElement,escape,clearResults);
  const refreshVillageFinder = mountVillageFinder(root.querySelector('#village-finder'),escape,place=>{
    selectState(place.state);
    clearResults();
    selectedVillage=place;
    for (const field of locationFields) criteria[field]=place[field]??'';
    loadFields(); saveSearch(); refreshScope();
    feedback.textContent=place.portalCode || !runtime.hosted
      ? `Location filled from ${place.village}.`
      : `Location filled from ${place.village}. Choose it in Bhulekh to run a village-specific live search.`;
  });
  loadFields();
  review.update(criteria.state,criteria.names);

  function clearResults() {
    liveSearch?.abort(); liveSearch=undefined;
    indexedSearch?.abort(); indexedSearch=undefined;
    submitButton.disabled=liveButton.disabled=false;
    feedback.textContent='';
    if (submitted) { submitted=false; showResults(); }
  }

  const reviewedCriteria = () => ({...criteria,names:review.names().join('\n')});

  function refreshScope() {
    const portal = portals.find(p => p.name === criteria.state);
    root.querySelector('#home-portal-links').innerHTML = portal ? tag(portal.record, `Open ${portal.label}`) : '';
    const inState = index.filter(x => x.state === criteria.state);
    const live = criteria.state==='Odisha' && (runtime.hosted || runtime.indexBase);
    refreshVillageFinder(criteria.state);
    const hasLocal = inState.length>0;
    submitButton.textContent = live && !hasLocal ? 'Search live Odisha records' : 'Search loaded records';
    liveButton.hidden = !live || !runtime.hosted;
    indexButton.hidden = !live || !hasLocal;
    liveButton.textContent='Search selected villages on Bhulekh';
    scopeElement.hidden=!live || !runtime.hosted;
    form.querySelectorAll('.location-input').forEach(label=>{label.hidden=live && !hasLocal && !selectedVillage;});
    form.querySelector('#home-search-scope').textContent = live
      ? 'Search the Odisha index by name, or choose a verified village for a scoped lookup.'
      : criteria.state ? 'Search covers loaded records for this state. The official portal is available for fresh lookups.' : '';
    for (const field of locationFields) {
      const options = [...new Set(inState.flatMap(x => x.location[field].slice(0, 1)))].sort((a, b) => a.localeCompare(b));
      root.querySelector(`#home-${field}`).innerHTML = options.map(x => `<option value="${escape(x)}"></option>`).join('');
    }
  }

  async function runLive(targets,names) {
    const abort = new AbortController();
    liveSearch = abort;
    const completed = [], failures = [], shown = new Map();
    const active = () => liveSearch===abort && root.isConnected;
    const listItems = hits => hits.map(hit=>`<li>${escape(hit.tenant)} <span class="muted">· ${escape(hit.matched.join(', '))}</span>${hit.khata?`<div class="actions live-ror-links"><span class="muted">Khata ${escape(hit.khata)}</span>${tag(hit.front,'RoR front')}${tag(hit.back,'RoR back')}</div>`:''}</li>`).join('');
    function paint(message, busy, signin=false) {
      if (!active()) return;
      feedback.textContent=busy ? message : '';
      submitButton.disabled=liveButton.disabled=busy;
      if (!busy) liveSearch=undefined;
      const hitCount=completed.reduce((sum,x)=>sum+x.hits.length,0);
      const groups=completed.map((item,i) => {
        const visible = shown.get(i) ?? 100, total = item.hits.length;
        return `<details class="live-village" ${total?'open':''}><summary>${escape(item.location.village)} (${escape(item.location.villageCode)}) · ${count.format(total)} ${total===1?'match':'matches'}</summary><p class="muted">${escape(item.location.tehsil)}, ${escape(item.location.district)} · ${count.format(item.checked)} tenant options checked</p>${total?`<ul>${listItems(item.hits.slice(0,visible))}</ul>`:'<p>No matching tenant names in this village.</p>'}${total>visible?`<button class="button secondary" data-more="${i}">Show more matches</button>`:''}</details>`;
      }).join('');
      const missing=failures.length?`<ul>${failures.map(([location,error])=>`<li>${escape(location.village)} · ${escape(error)}</li>`).join('')}</ul>`:'';
      const maps=busy?[]:completed.map(item=>item.location).filter(location=>location.riCode);
      results.innerHTML = `<h3>Live Odisha tenant search</h3>${busy?'':`<p role="status">${escape(message)}</p>`}<p>${count.format(completed.length)} of ${count.format(targets.length)} selected ${targets.length===1?'village':'villages'} checked${completed.length?` · ${count.format(hitCount)} matching tenant ${hitCount===1?'entry':'entries'}`:''}.</p>${busy?'<button class="button secondary" id="cancel-live">Cancel search</button>':''}${signin?'<a class="button primary" target="_top" href="/signin-with-chatgpt?return_to=%2F">Continue with ChatGPT</a>':''}${maps.length?'<details class="live-location live-map"></details>':''}${groups}${missing}${tag('https://bhulekh.ori.nic.in/','Open official Bhulekh portal')}`;
      if (maps.length) mountLiveOdishaMap(results.querySelector('.live-map'),maps,escape,tag);
      results.querySelector('#cancel-live')?.addEventListener('click',()=>{abort.abort();paint('Search stopped. Completed villages are listed below.',false);});
      results.querySelectorAll('[data-more]').forEach(button=>{button.onclick=()=>{
        const i=Number(button.dataset.more), start=shown.get(i)??100, hits=completed[i].hits;
        button.previousElementSibling.insertAdjacentHTML('beforeend',listItems(hits.slice(start,start+100)));
        shown.set(i,start+100);
        if (start+100>=hits.length) button.remove();
      };});
    }
    for (const location of targets) {
      if (!active() || abort.signal.aborted) return;
      paint(`Checking ${location.village}…`,true);
      try {
        const response=await fetch('/api/odisha/tenant-search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:location.id,names}),signal:abort.signal});
        const item=await response.json();
        if (response.status===401) { paint('Sign in to run the saved live search, then select Search again.',false,true); return; }
        if (!response.ok) {
          failures.push([location,item.error||'The village could not be checked.']);
          if (response.status===429) { paint('The search paused because Bhulekh or LandReview is busy.',false); return; }
        } else completed.push(item);
      } catch {
        if (abort.signal.aborted || !active()) return;
        failures.push([location,'Unable to reach the live search service.']);
        paint('The live search service could not be reached.',false); return;
      }
    }
    paint(failures.length?'Search finished with some villages unavailable.':'Search finished.',false);
  }

  function showResults() {
    const state = criteria.state;
    if (!submitted || !state) { results.innerHTML = ''; return; }
    const found = findRecords(workspace, index, reviewedCriteria());
    if (state==='Odisha' && (runtime.hosted || runtime.indexBase) && !found.stateCount) {
      results.innerHTML = '<div class="empty"><strong>Your Odisha search is ready.</strong><p>Review suggested spellings. Leave the location blank to search statewide.</p></div>';
      return;
    }
    if (!found.stateCount) {
      results.innerHTML = `<div class="empty"><strong>No ${escape(state)} records loaded</strong><p>Use the state portal to obtain records. Import a LandReview workspace, compatible JSON, or a workbook with a Plots tab to run this saved search.</p>${workspace && !workspace.demo ? '<p>Importing a new file replaces the records open in this browser. Back up the current workspace to keep a copy.</p>' : ''}<button class="button secondary">Import records for ${escape(state)}</button></div>`;
      results.querySelector('button').onclick = () => importRecords(state);
      return;
    }
    if (!found.scopedCount) {
      results.innerHTML = `<div class="empty"><strong>No loaded records cover those location filters.</strong><p>${count.format(found.stateCount)} plot entries are loaded for ${escape(state)}. Clear a location field to widen the search.</p></div>`;
      return;
    }
    const coverage = `<p>Checked ${count.format(found.searchable)} of ${count.format(found.scopedCount)} loaded plot entries with source text in ${escape(state)}.${workspace.demo ? ' These are fictional sample records.' : ''}</p>`;
    if (!found.hits.length) {
      results.innerHTML = `<div class="empty"><strong>${found.searchable ? 'No names matched in the loaded records.' : 'The loaded entries have no searchable plot text.'}</strong>${coverage}</div>`;
      return;
    }
    const pageSize = 40;
    const showPage = page => {
      const start = page * pageSize;
      const rows = found.hits.slice(start, start + pageSize).map(hit => {
        const row = workspace.rows[hit.index];
        return `<tr><td>${escape(row.village || '—')} <span class="muted">${escape(row.sheet ? `/ ${row.sheet}` : '')}</span></td><td><button type="button" class="plain-link" data-search-plot="${hit.index}">${escape(row.plot || row.id)}</button></td><td>${escape(row.khata || '—')}</td><td>${escape(hit.terms.join(' · '))}</td></tr>`;
      }).join('');
      results.innerHTML = `<h3>${count.format(found.hits.length)} matching plot ${found.hits.length === 1 ? 'entry' : 'entries'}</h3>${coverage}<div class="table-scroll"><table><thead><tr><th>Village / sheet</th><th>Plot</th><th>Khata</th><th>Matched names</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="pagination"><span class="muted">${start+1}–${Math.min(start+pageSize, found.hits.length)} of ${count.format(found.hits.length)}</span><div class="actions"><button class="button secondary" data-page="${page-1}" ${!page ? 'disabled' : ''}>Previous</button><button class="button secondary" data-page="${page+1}" ${start+pageSize >= found.hits.length ? 'disabled' : ''}>Next</button></div></div>`;
      results.querySelectorAll('[data-search-plot]').forEach((button, i) => { button.onclick = () => openPlot(found.hits[start+i].index, found.hits[start+i].terms); });
      results.querySelectorAll('[data-page]').forEach(button => { button.onclick = () => showPage(Number(button.dataset.page)); });
    };
    showPage(0);
  }

  function selectState(state) {
    if (criteria.state === state) return;
    clearResults();
    selectedVillage=undefined;
    criteria = criteriaFrom({state, names:criteria.names});
    submitted = false;
    loadFields(); review.update(criteria.state,criteria.names); refreshScope(); showResults();
  }

  function showMaps() {
    if (!mapPicker.open) return;
    const parcelLocations = new Map(index.filter(x => x.state === criteria.state).map(entry => [parcelKey(workspace.rows[entry.index]), entry]));
    const visibleSheets = (workspace?.summary ?? []).filter(sheet => workspace.geometry?.[sheet.gis]?.features?.some(feature =>
      parcelLocations.has(parcelKey({gis:sheet.gis, id:feature.properties?.id}))));
    const paths = Object.entries(statePaths).map(([name, path]) => `<path d="${path}" data-state="${escape(name)}" tabindex="0" role="button" aria-label="${escape(name)}" aria-pressed="${name === criteria.state}"><title>${escape(name)}</title></path>`).join('');
    mapBox.innerHTML = `<div class="picker-maps"><div><h3>Choose a state on the India map</h3><div class="state-map"><svg viewBox="0 0 490 490" aria-label="India state and union territory picker">${paths}</svg></div><p class="muted">Reference boundaries from ${tag('https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/', 'geoBoundaries')} and DataMeet, adapted under ${tag('https://creativecommons.org/licenses/by/2.5/in/', 'CC BY 2.5 India')}.</p></div>
      <div><h3>Pinpoint on a parcel sheet</h3>${visibleSheets.length ? `<label class="label">Map sheet<select id="home-sheet">${visibleSheets.map(s => `<option value="${escape(s.gis)}">${escape(s.name)} · Sheet ${escape(s.sheet)}</option>`).join('')}</select></label><div class="map-frame"><canvas id="home-parcel-map" width="750" height="490" aria-label="Select a parcel to fill the location fields"></canvas></div><p id="home-map-status" class="muted" role="status">Click a parcel to fill the location fields.</p><button type="button" id="use-sheet" class="button secondary">Use this sheet's location</button>` : `<p>${criteria.state ? 'Load a workspace containing parcel maps for this state, or use its official map.' : 'Choose a state to see any parcel sheets loaded for it.'}</p>`}
      ${tag(portals.find(p => p.name === criteria.state)?.map, 'Open official cadastral map')}</div></div>`;
    mapBox.querySelectorAll('[data-state]').forEach(shape => {
      const choose = () => { selectState(shape.dataset.state); showMaps(); mapBox.querySelector('[aria-pressed="true"]')?.focus(); };
      shape.onclick = choose;
      shape.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } };
    });
    if (!visibleSheets.length) return;
    const sheetSelect = mapBox.querySelector('#home-sheet');
    const canvas = mapBox.querySelector('#home-parcel-map');
    const status = mapBox.querySelector('#home-map-status');
    const features = () => workspace.geometry[sheetSelect.value].features;
    let hits;
    const draw = selected => { hits = drawMap(canvas, features(), sheetSelect.value, new Map(), {labels:features().length < 350, selected}); };
    function pick(key, pinpoint = false) {
      const entry = parcelLocations.get(key);
      if (!entry) { status.textContent = 'That parcel has no loaded location details.'; return; }
      const row = workspace.rows[entry.index];
      clearResults();
      for (const field of locationFields) criteria[field] = entry.location[field][0] ?? '';
      submitted = false;
      loadFields(); showResults(); draw(key);
      status.textContent = `Location filled from ${row.village || 'this sheet'}${pinpoint && row.plot ? `, plot ${row.plot}` : ''}. You can edit it before searching.`;
    }
    sheetSelect.onchange = () => { draw(); status.textContent = 'Click a parcel to fill the location fields.'; };
    canvas.onclick = event => { const key = parcelAt(canvas, event, hits); if (key) pick(key, true); };
    mapBox.querySelector('#use-sheet').onclick = () => pick(hits.find(hit => parcelLocations.has(hit.key))?.key);
    draw();
  }

  control('state').onchange = event => { selectState(event.target.value); showMaps(); };
  form.oninput = event => {
    const {name, value} = event.target;
    if (name !== 'state' && Object.hasOwn(criteria,name)) {
      criteria[name] = value;
      if (locationFields.includes(name)) selectedVillage=undefined;
      if (name==='names') review.update(criteria.state,value);
      clearResults();
    }
  };
  function startSearch(scopedPortalSearch = false, forceIndex = false) {
    if (liveSearch) return;
    feedback.textContent='';
    if (!criteria.state) {
      feedback.textContent='Choose a state or union territory.';
      control('state').focus(); return;
    }
    const names=review.names();
    if (!names.length) {
      feedback.textContent='Enter a surname or full name to search.';
      control('names').focus(); return;
    }
    if (!review.confirmed()) {
      feedback.textContent='Check a suggested spelling above or use Clear all to search only what you typed.';
      return;
    }
    saveSearch();
    const found = criteria.state==='Odisha' && !workspace?.demo ? findRecords(workspace,index,reviewedCriteria()) : null;
    if (scopedPortalSearch || forceIndex || (runtime.hosted || runtime.indexBase) && found && !found.scopedCount) {
      if (names.length>liveNameLimit || names.some(x=>x.length>140)) {
        feedback.textContent=`Search up to ${count.format(liveNameLimit)} spellings of 140 characters each.`;
        control('names').focus(); return;
      }
      if (scopedPortalSearch) {
        const targets=selectedVillage?.portalCode ?
          [{id:selectedVillage.portalCode,village:selectedVillage.village}] : odisha.targets();
        if (!targets.length) {
          feedback.textContent='Choose a village in the Bhulekh picker.';
          odisha.focusLocation();
          return;
        }
        indexedSearch?.abort(); indexedSearch=undefined;
        submitted=true;
        void runLive(targets,names);
        results.setAttribute('tabindex','-1'); results.focus();
        return;
      }
      if ((selectedVillage && !selectedVillage.portalCode || !selectedVillage && locationFields.some(field=>criteria[field].trim()))) {
        feedback.textContent='Choose a village with a verified Bhulekh code, or clear the location fields to search statewide.';
        return;
      }
      submitted=true;
      if (names.length>100) {
        feedback.textContent='Choose up to 100 spellings for an index search.';
        return;
      }
      indexedSearch?.abort();
      indexedSearch=new AbortController();
      void mountIndexedResults(results,{names,location:selectedVillage?.portalCode??'',escape,tag,signal:indexedSearch.signal});
    } else {
      indexedSearch?.abort(); indexedSearch=undefined;
      submitted=true;
      showResults();
    }
    results.setAttribute('tabindex', '-1'); results.focus();
  }
  form.onsubmit=event=>{event.preventDefault();startSearch();};
  liveButton.onclick=()=>startSearch(true);
  indexButton.onclick=()=>startSearch(false,true);
  mapPicker.ontoggle = showMaps;
  refreshScope(); showResults();
}
