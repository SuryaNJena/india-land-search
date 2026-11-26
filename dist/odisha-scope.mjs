import {loadBhulekhLocations} from './odisha-live-search.mjs';
import {lookupPlace,rememberPlace,selectedPlaces} from './shared-villages.mjs';

const fields = ['district','tehsil','village'];
const labels = {district:'District',tehsil:'Tehsil',village:'Village'};
const script = /[\u0b01-\u0b7f]/u;
const readable = label => {
  if (!globalThis.Sanscript || !script.test(label)) return label;
  const latin = globalThis.Sanscript.t(label,'oriya','iso').normalize('NFD').replace(/\p{M}/gu,'').replace(/[:\u00b7]/g,'');
  return `${label} · ${latin}`;
};
export function mountOdishaScope(root,escape,onEdit) {
  const branch={};
  let pending;
  root.innerHTML=`<summary>Browse the official Bhulekh directory</summary><div class="search-fields">${fields.map((field,i)=>`<label class="label">${labels[field]}<select id="directory-${field}" ${i?'disabled':''}><option value="">Choose ${labels[field].toLowerCase()}</option></select></label>`).join('')}</div><div class="actions"><button class="button secondary" type="button" id="add-live-village" disabled>Add village</button><button class="plain-link" type="button" id="retry-place-list" hidden>Retry loading locations</button></div><p role="status" id="directory-status" class="muted"></p><div id="picked-villages"></div>`;
  const select = field=>root.querySelector(`#directory-${field}`);
  const status=root.querySelector('#directory-status');
  const add=root.querySelector('#add-live-village');
  const retry=root.querySelector('#retry-place-list');
  const option = field=>{
    const choice=select(field).selectedOptions[0];
    return choice?.value?{code:choice.value,label:choice.dataset.label}:null;
  };

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
    try {
      rememberPlace({...place,portalCode:place.id,state:'Odisha'});
      status.textContent=place.village+' added.';
      onEdit();
    }catch(error){status.textContent=error.message;}
  };
  root.ontoggle=()=>{if (root.open && select('district').options.length<=1 && !pending) void load('district');};
  return {
    focusLocation() {
      root.open=true;
      const next=select(fields.find(field=>!branch[field]) ?? 'village');
      (next.disabled ? root.querySelector('summary') : next).focus();
    },
    targets() {
      const picked=selectedPlaces().map(lookupPlace).filter(Boolean);
      return picked.length ? picked : selectedVillage() ? [selectedVillage()] : [];
    },
    tehsil() {
      const {district,tehsil}=branch;
      if (district && tehsil) return {id:district.code+'-'+tehsil.code,district:district.label,tehsil:tehsil.label};
    }
  };
}
