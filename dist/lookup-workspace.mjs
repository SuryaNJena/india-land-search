import {savedLookupStore} from './files.mjs';
import {plotNumber} from './sheet-overlays.mjs';

const labels={map:'Village map',plot:'Plot record',ror:'Record of Rights'};
const changes=new EventTarget();
const numberCode=value=>{
  const code=plotNumber(value);
  return /^\d{1,6}$/.test(code) && Number(code)>0 ? String(Number(code)) : '';
};

export function lookupEntry(item, savedAt = Date.now()) {
  const {kind,place={},data}=item;
  if (!Object.hasOwn(labels,kind) || !data || typeof data!=='object' || Array.isArray(data)) {
    throw Error('Only a completed map, plot, or Record of Rights lookup can be saved.');
  }
  const [district,tehsil,village,ri]=String(place.id??'').split('-');
  const districtCode=numberCode(place.districtCode??district);
  const tehsilCode=numberCode(place.tehsilCode??tehsil);
  const villageCode=numberCode(place.villageCode??village);
  const riCode=numberCode(place.riCode??ri);
  if (!districtCode || !tehsilCode || !villageCode || (kind!=='ror' && !riCode)) {
    throw Error('The lookup is missing official location codes.');
  }
  const id=[districtCode,tehsilCode,villageCode].join('-');
  const sheet=numberCode(item.sheet??data.sheet).padStart(2,'0');
  if (kind!=='ror' && (!Number(sheet) || sheet.length>3)) throw Error('The lookup is missing a valid map sheet.');
  const number=plotNumber(item.number??data.number);
  const khata=plotNumber(item.khata??data.khata);
  if (kind==='plot' && !/^[\p{L}\p{M}\p{N}./-]{1,80}$/u.test(number)) throw Error('The lookup is missing a valid plot number.');
  if (kind==='ror' && !/^\d{1,12}(?:\/\d{1,12}){0,4}$/.test(khata)) throw Error('The lookup is missing a valid khata number.');
  const parcel=String(item.parcelId??data.id??'');
  const parcelKey=/^[A-Za-z0-9_-]{1,128}$/.test(parcel) ? `id:${parcel}` : `number:${number}`;
  const keyParts=kind==='ror' ? [kind,id,khata] : [kind,id,riCode,sheet,...(kind==='plot'?[parcelKey]:[])];
  const title=String(item.title??'').trim().slice(0,200) ||
    (kind==='map' ? `Sheet ${sheet}` : kind==='plot' ? `Plot ${number} · Sheet ${sheet}` : `Khata ${khata}`);
  return {
    kind,key:keyParts.join('/'),place:{...place,id,districtCode,tehsilCode,villageCode,riCode},data,savedAt,title,
    ...(kind!=='ror'?{sheet}:{}),...(kind==='plot'?{number}:{}),...(kind==='ror'?{khata}:{})
  };
}

export async function saveLookup(item) {
  const entry=lookupEntry(item);
  await savedLookupStore.put(entry);
  changes.dispatchEvent(new Event('saved'));
  return entry;
}

function locationLabel(place) {
  return [place.village,place.tehsil,place.district].filter(Boolean).join(', ') || `Odisha locality ${place.id}`;
}

const timestamp=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'});

export function mountLookupWorkspace(root,{escape,onOpen}) {
  root.innerHTML=`<section class="card" data-saved-lookup-workspace>
    <div class="card-head"><div><h2>Saved lookup workspace</h2><p>Successful lookups are saved automatically in this browser.</p></div></div>
    <div class="toolbar">
      <label class="label">Lookup type<select id="lookup-kind"><option value="">All lookup types</option>
        <option value="map">Village maps</option><option value="plot">Plot records</option><option value="ror">Records of Rights</option>
      </select></label>
      <label class="check"><input id="lookup-select-all" type="checkbox" disabled> Select all shown</label>
      <button type="button" class="button secondary" id="lookup-remove-selected" disabled>Remove selected</button>
      <span id="lookup-selection-count" class="muted"></span>
    </div>
    <p role="status" id="lookup-workspace-status">Loading saved lookups…</p>
    <div id="lookup-items"></div>
  </section>`;
  const view=root.querySelector('[data-saved-lookup-workspace]');
  const filter=view.querySelector('#lookup-kind');
  const all=view.querySelector('#lookup-select-all');
  const remove=view.querySelector('#lookup-remove-selected');
  const selection=view.querySelector('#lookup-selection-count');
  const status=view.querySelector('#lookup-workspace-status');
  const panel=view.querySelector('#lookup-items');
  const selected=new Set();
  let items=[],visible=[],revision=0,removing=false;

  function updateSelection() {
    const some=visible.some(item=>selected.has(item.key));
    all.disabled=removing || !visible.length;
    all.checked=some && visible.every(item=>selected.has(item.key));
    all.indeterminate=some && !all.checked;
    remove.disabled=removing || !selected.size;
    selection.textContent=selected.size ? `${selected.size} selected` : '';
  }

  function render() {
    visible=items.filter(item=>!filter.value || item.kind===filter.value);
    panel.innerHTML=visible.length ? `<div class="table-scroll"><table><thead><tr>
      <th scope="col">Select</th><th scope="col">Saved item</th><th scope="col">Location</th>
      <th scope="col">Saved</th><th scope="col">Actions</th>
      </tr></thead><tbody>${visible.map((item,i)=>{
        const title=escape(item.title);
        const location=escape(locationLabel(item.place));
        const saved=Number.isFinite(item.savedAt) ? escape(timestamp.format(item.savedAt)) : '';
        return `<tr>
          <td><input type="checkbox" data-lookup-select="${i}" aria-label="Select ${title} · ${location}" ${selected.has(item.key)?'checked':''}></td>
          <td><strong>${title}</strong><br><span class="muted">${labels[item.kind]}</span></td>
          <td>${location}</td><td>${saved}</td>
          <td><div class="actions">
            <button type="button" class="button secondary" data-lookup-open="${i}" aria-label="Open ${title} · ${location}">Open</button>
            <button type="button" class="plain-link" data-lookup-remove="${i}" aria-label="Remove ${title} · ${location}">Remove</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : `<div class="empty">${items.length?'No items match this lookup type.':'Maps, plot records, and Records of Rights you look up will appear here.'}</div>`;
    panel.querySelectorAll('[data-lookup-select]').forEach((box,i)=>{
      box.onchange=()=>{
        const key=visible[i].key;
        if (box.checked) selected.add(key);
        else selected.delete(key);
        updateSelection();
      };
    });
    panel.querySelectorAll('[data-lookup-open]').forEach((button,i)=>{
      button.onclick=async()=>{
        try { await onOpen(visible[i]); }
        catch (error) { status.textContent=error.message || 'Could not open the saved lookup.'; }
      };
    });
    panel.querySelectorAll('[data-lookup-remove]').forEach((button,i)=>{
      button.onclick=()=>void removeItems([visible[i].key]);
    });
    updateSelection();
  }

  async function refresh(message='') {
    const capture=++revision;
    try {
      const stored=await savedLookupStore.list();
      if (capture!==revision || !view.isConnected) return;
      items=stored.sort((a,b)=>b.savedAt-a.savedAt);
      const keys=new Set(items.map(item=>item.key));
      for (const key of selected) if (!keys.has(key)) selected.delete(key);
      status.textContent=message;
      render();
    } catch (error) {
      if (capture===revision && view.isConnected) status.textContent=`Could not load saved lookups. ${error.message}`;
    }
  }

  async function removeItems(keys) {
    if (removing || !keys.length) return;
    removing=true;
    updateSelection();
    try {
      await savedLookupStore.remove(keys);
      for (const key of keys) selected.delete(key);
      await refresh(`Removed ${keys.length} ${keys.length===1?'lookup':'lookups'}.`);
    } catch (error) {
      status.textContent=`Could not remove the selected lookups. ${error.message}`;
    } finally {
      removing=false;
      updateSelection();
    }
  }

  filter.onchange=render;
  all.onchange=()=>{
    for (const item of visible) {
      if (all.checked) selected.add(item.key);
      else selected.delete(item.key);
    }
    render();
  };
  remove.onclick=()=>void removeItems([...selected]);
  function dispose() {
    changes.removeEventListener('saved',saved);
    observer.disconnect();
  }
  function saved() {
    if (view.isConnected) void refresh();
    else dispose();
  }
  const observer=new MutationObserver(()=>{
    if (!view.isConnected) dispose();
  });
  observer.observe(root,{childList:true});
  if (root.parentElement) observer.observe(root.parentElement,{childList:true});
  changes.addEventListener('saved',saved);
  void refresh();
}
