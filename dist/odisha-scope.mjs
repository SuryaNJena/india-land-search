const storageKey = 'landreview.odisha-villages';
const signIn = '<a class="button secondary" target="_top" href="/signin-with-chatgpt?return_to=%2F">Continue with ChatGPT</a>';
const fields = ['district','tehsil','village'];
const labels = {district:'District',tehsil:'Tehsil',village:'Village'};
const script = /[\u0b01-\u0b7f]/u;
const readable = label => {
  if (!globalThis.Sanscript || !script.test(label)) return label;
  const latin = globalThis.Sanscript.t(label,'oriya','iso').normalize('NFD').replace(/\p{M}/gu,'').replace(/[:\u00b7]/g,'');
  return `${label} · ${latin}`;
};
const directory = new Map();
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
      let choices=directory.get(key);
      if (!choices) {
        const response=await fetch('/api/odisha/locations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:key}),signal:abort.signal});
        const item=await response.json();
        if (response.status===401) {status.innerHTML=`Sign in to load official locations. ${signIn}`;retry.hidden=false;retry.onclick=()=>load(field);return;}
        if (!response.ok) throw Error(item.error || 'Bhulekh is unavailable.');
        choices=item.options;
        directory.set(key,choices);
      }
      select(field).innerHTML=`<option value="">Choose ${labels[field].toLowerCase()}</option>${choices.map(({code,label})=>`<option value="${escape(code)}" data-label="${escape(label)}">${escape(readable(label))} (${escape(code)})</option>`).join('')}`;
      select(field).disabled=false;
      status.textContent=choices.length?'': 'Bhulekh returned no locations for this selection.';
    } catch(error) {
      if (abort.signal.aborted) return;
      status.textContent=error.message;
      retry.hidden=false; retry.onclick=()=>load(field);
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
  add.onclick=()=>{
    const parts=fields.map(field=>branch[field]);
    if (parts.some(value=>!value)) return;
    const id=parts.map(x=>x.code).join('-');
    if (picked.has(id)) {status.textContent='That village is already selected.';return;}
    if (picked.size>=20) {status.textContent='Choose up to 20 villages per live search.';return;}
    picked.set(id,{id,district:parts[0].label,tehsil:parts[1].label,village:parts[2].label});
    status.textContent=`${picked.size} ${picked.size===1?'village':'villages'} selected.`;
    save();
  };
  root.ontoggle=()=>{if (root.open && select('district').options.length<=1 && !pending) void load('district');};
  renderPicked();
  return {open:()=>{ root.open=true; }, targets:()=>[...picked.values()]};
}
