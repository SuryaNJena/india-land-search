import {loadBhulekhLocations} from './odisha-live-search.mjs';

const storageKey = 'landreview.odisha-villages';
const fields = ['district','tehsil','village'];
const labels = {district:'District',tehsil:'Tehsil',village:'Village'};
const script = /[\u0b01-\u0b7f]/u;
const readable = label => {
  if (!globalThis.Sanscript || !script.test(label)) return label;
  const latin = globalThis.Sanscript.t(label,'oriya','iso').normalize('NFD').replace(/\p{M}/gu,'').replace(/[:\u00b7]/g,'');
  return `${label} · ${latin}`;
};
let persisted=[];
try {
  const value=JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(value)) persisted=value.slice(0,20).filter(place=>typeof place.id==='string' && /^[1-9]\d{0,5}(?:-[1-9]\d{0,5}){2}$/.test(place.id));
} catch { /* A fresh browser can pick villages from the directory. */ }

export function mountOdishaScope(root,escape,onEdit) {
  const picked=new Map(persisted.map(place=>[place.id,place]));
  const branch={};
  let pending;
  root.innerHTML=`<summary>Choose villages from Bhulekh</summary><div class="search-fields">${fields.map((field,i)=>`<label class="label">${labels[field]}<select id="directory-${field}" ${i?'disabled':''}><option value="">Choose ${labels[field].toLowerCase()}</option></select></label>`).join('')}</div><div class="actions"><button class="button secondary" type="button" id="add-live-village" disabled>Add village</button><button class="plain-link" type="button" id="retry-place-list" hidden>Retry loading locations</button></div><p role="status" id="directory-status" class="muted"></p><div id="picked-villages"></div>`;
  const select = field=>root.querySelector(`#directory-${field}`);
  const status=root.querySelector('#directory-status');
  const add=root.querySelector('#add-live-village');
  const retry=root.querySelector('#retry-place-list');
  const retained=root.querySelector('#picked-villages');
  const option = field=>{
    const choice=select(field).selectedOptions[0];
    return choice?.value?{code:choice.value,label:choice.dataset.label}:null;
  };

  function renderPicked() {
    retained.innerHTML=picked.size?`<div class="location-chips">${[...picked.values()].map(x=>`<button type="button" class="button secondary" data-remove="${escape(x.id)}" aria-label="Remove ${escape(x.village)}">${escape(x.village)} · ${escape(x.tehsil)} <span aria-hidden="true">×</span></button>`).join('')}</div>`:'';
    retained.querySelectorAll('[data-remove]').forEach(button=>{button.onclick=()=>{picked.delete(button.dataset.remove);save();};});
  }

  function save() {
    persisted=[...picked.values()];
    try { localStorage.setItem(storageKey,JSON.stringify(persisted)); } catch { /* Selection remains in this tab. */ }
    renderPicked(); onEdit();
  }

  async function load(field) {
    const index=fields.indexOf(field);
    const key=fields.slice(0,index).map(field=>branch[field].code).join('-');
    pending?.abort();
    const abort=new AbortController();
    pending=abort;
    retry.hidden=true;
    status.textContent=`Loading ${labels[field].toLowerCase()} choices…`;
    try {
      const choices=await loadBhulekhLocations(key,abort.signal);
      if (abort.signal.aborted) return;
      select(field).innerHTML=`<option value="">Choose ${labels[field].toLowerCase()}</option>${choices.map(({code,label})=>`<option value="${escape(code)}" data-label="${escape(label)}">${escape(readable(label))} (${escape(code)})</option>`).join('')}`;
      select(field).disabled=false;
      status.textContent=choices.length?'': 'Bhulekh returned no locations for this selection.';
    } catch(error) {
      if (abort.signal.aborted) return;
      status.textContent=error.message;
      retry.hidden=false; retry.onclick=()=>load(field);
    } finally {
      if (pending===abort) pending=undefined;
    }
  }

  fields.forEach((field,i)=>{
    select(field).onchange=()=>{
      branch[field]=option(field);
      pending?.abort(); status.textContent=''; retry.hidden=true;
      for (const next of fields.slice(i+1)) {
        branch[next]=null;
        select(next).innerHTML=`<option value="">Choose ${labels[next].toLowerCase()}</option>`;
        select(next).disabled=true;
      }
      add.disabled=!branch.village;
      if (branch[field] && fields[i+1]) void load(fields[i+1]);
    };
  });
  function selectedVillage() {
    const parts=fields.map(field=>branch[field]);
    if (parts.some(value=>!value)) return;
    const [district,tehsil,village]=parts.map(item=>item.label);
    return {id:parts.map(item=>item.code).join('-'),district,tehsil,village};
  }
  add.onclick=()=>{
    const place=selectedVillage();
    if (!place) return;
    if (picked.has(place.id)) {status.textContent='That village is already selected.';return;}
    if (picked.size>=20) {status.textContent='Choose up to 20 villages per live search.';return;}
    picked.set(place.id,place);
    status.textContent=`${picked.size} ${picked.size===1?'village':'villages'} selected.`;
    save();
  };
  root.ontoggle=()=>{if (root.open && select('district').options.length<=1 && !pending) void load('district');};
  renderPicked();
  return {
    focusLocation() {
      root.open=true;
      const next=select(fields.find(field=>!branch[field]) ?? 'village');
      (next.disabled ? root.querySelector('summary') : next).focus();
    },
    targets() {
      const current=selectedVillage();
      return [...new Map([...(current ? [[current.id,current]] : []),...picked]).values()].slice(0,20);
    },
    tehsil() {
      const {district,tehsil}=branch;
      if (district && tehsil) return {id:district.code+'-'+tehsil.code,district:district.label,tehsil:tehsil.label};
    }
  };
}
