import {runtime} from './runtime.mjs';
import {mountLiveOdishaMap} from './live-odisha-map.mjs';
import {printHoldings} from './live-ror.mjs';

export async function mountIndexedResults(root,{names,location,escape,tag,signal,onGeography,fallback=[]}) {
  const selected = new Map();
  const key = hit => hit.location.id+'/'+hit.khata;
  const portalLink=()=>tag('https://bhulekh.ori.nic.in/','Open official Bhulekh portal');
  const showUnavailable=message=>{
    root.innerHTML=`<h3>Odisha land records</h3><p role="status">${escape(message)}</p>
      ${fallback.length?'<p>Use the names you already entered to search Bhulekh directly.</p>':''}
      <div class="actions">${fallback.map(({label},i)=>`<button type="button" class="button secondary" data-fallback="${i}">${escape(label)}</button>`).join('')}${portalLink()}</div>`;
    root.querySelectorAll('[data-fallback]').forEach(button=>button.onclick=fallback[Number(button.dataset.fallback)].run);
  };
  let offset=0;
  async function showPage() {
    root.innerHTML='<h3>Odisha land records</h3><p role="status">Searching the Odisha index…</p>';
    try {
      const response=await fetch(runtime.indexBase+'/api/odisha/index-search',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({names,location,offset}),signal});
      const data=await response.json();
      if (signal.aborted) return;
      if (response.status===503 && data.code==='index_not_loaded') {
        showUnavailable('The Odisha index has no dataset loaded, so your index search did not run.');
        return;
      }
      if (!response.ok) throw Error(data.error||'The Odisha index is unavailable.');
      const {hits,coverage,next}=data;
      const maps=[...new Map(hits.filter(hit=>hit.location.riCode).map(hit=>[hit.location.id,hit.location])).values()];
      const status=coverage.complete
        ? 'Coverage confirmed for the search area.'
        : 'Coverage is incomplete. Additional matches may exist.';
      root.innerHTML=`<h3>Odisha land records</h3><p role="status">${escape(status)} ${escape(coverage.scanned)} of ${escape(coverage.expected)} villages indexed · ${escape(coverage.captured)} · ${escape(coverage.source)}</p>
        ${hits.length?`<ul>${hits.map((hit,i)=>`<li><strong>${escape(hit.tenant)}</strong> · ${escape([hit.location.village,hit.location.tehsil,hit.location.district].join(', '))}
          <div class="actions"><span>Khata ${escape(hit.khata)}</span>${tag(hit.front,'RoR front')}${tag(hit.back,'RoR back')}${runtime.hosted&&hit.front&&hit.back?`<label><input type="checkbox" data-holding="${i}" ${selected.has(key(hit))?'checked':''}> Include in PDF</label>`:''}</div>
          <p class="muted">${hit.plots.length?`Plots ${escape(hit.plots.join(', '))}`:'Plot details unavailable in the index.'}</p></li>`).join('')}</ul>`:'<p>No matching names in the indexed records.</p>'}
        <div class="actions"><button type="button" class="button secondary" data-prev ${offset?'':'disabled'}>Previous</button>
        <button type="button" class="button secondary" data-next ${next===null?'disabled':''}>Next</button>
        ${runtime.hosted?'<button type="button" class="button secondary" data-print>Print selected RoRs / Save PDF</button>':''}</div>
        <p class="muted" role="status" data-export-status></p>${runtime.hosted&&maps.length?'<details class="live-location live-map"></details>':''}
        ${tag('https://bhulekh.ori.nic.in/','Open official Bhulekh portal')}`;
      const exportStatus=root.querySelector('[data-export-status]');
      const print=root.querySelector('[data-print]');
      if (print) {
        const update=()=>{
          print.disabled=!selected.size;
          exportStatus.textContent=selected.size?`${selected.size} selected khatas. Choose Save as PDF in the print dialog.`:'';
        };
        root.querySelectorAll('[data-holding]').forEach(box=>box.onchange=()=>{
          const hit=hits[Number(box.dataset.holding)];
          if (box.checked) selected.set(key(hit),hit); else selected.delete(key(hit));
          root.querySelectorAll('[data-holding]').forEach(candidate=>{candidate.checked=selected.has(key(hits[Number(candidate.dataset.holding)]));});
          update();
        });
        print.onclick=()=>void printHoldings([...selected.values()],exportStatus,print);
        update();
      }
      root.querySelector('[data-prev]').onclick=()=>{offset=Math.max(0,offset-30);void showPage();};
      root.querySelector('[data-next]').onclick=()=>{offset=next;void showPage();};
      if (runtime.hosted && maps.length) {
        const plots=new Map(maps.map(place=>[place.id,new Set(hits.filter(hit=>hit.location.id===place.id).flatMap(hit=>hit.plots))]));
        mountLiveOdishaMap(root.querySelector('.live-map'),maps,escape,tag,plots,new Map(),names,{onGeography});
      }
    } catch (error) {
      if (!signal.aborted) showUnavailable('The Odisha index search could not finish. '+error.message);
    }
  }
  await showPage();
}
