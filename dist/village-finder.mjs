import {normalize} from './core.mjs';

const key = value => normalize(value).replace(/[\s'’_-]+/gu, '');
const order = new Intl.Collator('en-IN');
let directory;

export function findVillages(rows, input, state = '', limit = 20) {
  const query = key(input);
  if (query.length < 2) return {total:0, results:[]};
  const hits = [];
  for (const row of rows) {
    if (state && row.state !== state) continue;
    const names = [row.village, row.local, ...(row.aliases ?? [])].map(key);
    const score = names.includes(query) ? 0 : names.some(name => name.startsWith(query)) ? 1 : -1;
    if (score >= 0) hits.push({row, score});
  }
  hits.sort((a,b) => a.score-b.score || order.compare(a.row.village,b.row.village) ||
    order.compare(a.row.district,b.row.district) || order.compare(a.row.tehsil,b.row.tehsil) || order.compare(a.row.id,b.row.id));
  return {total:hits.length, results:hits.slice(0,limit).map(hit=>hit.row)};
}

async function readDirectory() {
  const response = await fetch(new URL('./villages.json', import.meta.url));
  if (!response.ok) throw Error('The village directory could not be loaded.');
  const {rows,source,state} = await response.json();
  if (!Array.isArray(rows)) throw Error('The village directory is unavailable.');
  return {rows:rows.map(([id,village,local,district,tehsil,portalCode,riCode,ri,aliases])=>
    ({id,village,local,district,tehsil,state,portalCode,riCode,ri,aliases})),source};
}

export function mountVillageFinder(root, escape, choose, samplePlace) {
  root.innerHTML = `<summary>Find a village by name</summary>
    <label class="label">Village name<input type="search" maxlength="100" placeholder="English or local script" autocomplete="off"></label>
    <label><input type="checkbox"> Limit to the selected state</label>
    <p role="status" class="muted"></p><div class="actions village-results"></div>`;
  const input = root.querySelector('input[type="search"]');
  const filter = root.querySelector('input[type="checkbox"]');
  const status = root.querySelector('[role="status"]');
  const matches = root.querySelector('.village-results');
  let state = '', revision = 0, delay;
  async function refresh() {
    clearTimeout(delay);
    const request = ++revision;
    const query = input.value;
    matches.replaceChildren();
    if (key(query).length < 2) { status.textContent='Enter at least two characters.'; return; }
    status.textContent='Finding villages…';
    try {
      if (!samplePlace) directory ??= readDirectory().catch(error=>{directory=undefined;throw error;});
      const {rows,source} = samplePlace ? {rows:[samplePlace],source:'Fictional demo directory'} : await directory;
      if (revision !== request || !root.isConnected) return;
      const {total,results} = findVillages(rows,query,filter.checked?state:'');
      status.textContent = total
        ? `Showing ${results.length} of ${total} matches · ${source}`
        : `No village matched in this directory · ${source}`;
      matches.innerHTML = results.map((row,i)=>`<button type="button" class="button secondary" data-village="${i}">${escape(row.village)}${row.local?` · ${escape(row.local)}`:''} <span class="muted">${escape([row.tehsil,row.district,row.state,samplePlace ? 'Sample record' : row.portalCode ? `Bhulekh ${row.portalCode}` : `LGD ${row.id}`].join(', '))}</span></button>`).join('');
      matches.querySelectorAll('[data-village]').forEach(button=>{
        button.onclick=()=>choose(results[Number(button.dataset.village)]);
      });
    } catch (error) {
      if (revision === request) status.textContent=error.message;
    }
  }
  input.oninput=()=>{ revision++; matches.replaceChildren(); clearTimeout(delay); delay=setTimeout(refresh,180); };
  input.onkeydown=event=>{ if (event.key==='Enter') {event.preventDefault();void refresh();} };
  filter.onchange=()=>void refresh();
  return selectedState=>{
    state=selectedState;
    filter.disabled=!state;
    if (!state) filter.checked=false;
    if (filter.checked && input.value) void refresh();
  };
}
