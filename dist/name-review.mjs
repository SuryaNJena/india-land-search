import {normalize} from './core.mjs';
import {searchTerms} from './search.mjs';
import {proposeNames,proposeNameOrders,recordLanguages,suggestedLanguages} from './name-variants.mjs';

const key = 'landreview.home-name-review';
let saved;
try { saved=JSON.parse(localStorage.getItem(key)); } catch { /* Review remains available in this tab. */ }

export function mountNameReview(root, escape, onEdit) {
  let state='', text='', choice='', drafts=[], approval;
  const signature = () => JSON.stringify([state,searchTerms(text).map(normalize),choice]);
  const languages = () => choice ? [choice] : suggestedLanguages(state);
  const options = Object.entries(recordLanguages).toSorted(([,a],[,b])=>a[0].localeCompare(b[0]));
  const selected = () => approval?.signature===signature() && Array.isArray(approval.spellings) ? approval.spellings : [];

  const summary = length => length ? `${length} additional ${length===1?'spelling':'spellings'} selected for search.` : 'Only the names you typed will be searched.';

  function record(spellings) {
    approval={signature:signature(),state,choice,spellings};
    saved=approval;
    try { localStorage.setItem(key,JSON.stringify(approval)); } catch { /* Review remains available in this tab. */ }
    onEdit();
    root.querySelector('#variant-status').textContent=summary(spellings.length);
  }

  function render() {
    if (!state || !searchTerms(text).length) { root.hidden=true; return; }
    root.hidden=false;
    const active = new Set(selected().map(normalize));
    const approved = approval?.signature===signature();
    const ordersOpen=root.querySelector('.name-orders')?.open;
    const cards= drafts.map((item,index)=>`<label class="variant-option"><input type="checkbox" data-spelling="${index}" ${active.has(normalize(item.spelling))?'checked':''}><span><strong ${item.language?`lang="${item.language}"`:''} dir="auto">${escape(item.spelling)}</strong><small>${escape(item.original)} · ${escape(recordLanguages[item.language]?.[0] || 'Typed spelling')}${item.curated && !item.reordered?' · Common spelling':''}</small></span></label>`);
    const originalOrder=cards.filter((_,i)=>!drafts[i].reordered);
    const otherOrders=cards.filter((_,i)=>drafts[i].reordered);
    root.innerHTML = `<div class="variant-head"><div><h3 id="variant-heading" tabindex="-1">Review name spellings</h3><p>Checked spellings are included when you search, along with the names you typed.</p></div><label class="label">Record language<select id="variant-language"><option value="">${escape(suggestedLanguages(state).map(code=>recordLanguages[code][0]).join(', ') || 'Latin spelling')}</option>${options.map(([code,[name]])=>`<option value="${code}">${escape(name)}</option>`).join('')}</select></label></div>
      ${drafts.length ? `<div class="actions"><button class="button secondary" type="button" id="select-spellings">Select all</button><button class="button secondary" type="button" id="clear-spellings">Clear all</button></div><div class="variant-options">${originalOrder.join('')}</div>${otherOrders.length?`<details class="name-orders" ${ordersOpen?'open':''}><summary>Other name orders (${otherOrders.length})</summary><div class="variant-options">${otherOrders.join('')}</div></details>`:''}`:''}
      <p id="variant-status" role="status">${approved ? summary(active.size) : drafts.length ? '' : 'You can enter local-script spellings directly in the names box.'}</p>`;
    const select = root.querySelector('#variant-language');
    select.value=choice;
    select.onchange=()=>{choice=select.value;onEdit();update(state,text);root.querySelector('#variant-language')?.focus();};
    const saveChecked=()=>{
      const checked=[...root.querySelectorAll('[data-spelling]:checked')].map(box=>drafts[Number(box.dataset.spelling)].spelling);
      record([...new Set(checked)]);
    };
    const setAll = checked=>{
      root.querySelectorAll('[data-spelling]').forEach(box=>{box.checked=checked;});
      saveChecked();
    };
    root.querySelector('#select-spellings')?.addEventListener('click',()=>setAll(true));
    root.querySelector('#clear-spellings')?.addEventListener('click',()=>setAll(false));
    root.querySelectorAll('.variant-options').forEach(group=>{
      group.addEventListener('change',saveChecked);
    });
  }

  function update(nextState,nextText) {
    if (nextState!==state) choice=saved?.state===nextState && Object.hasOwn(recordLanguages,saved.choice) ? saved.choice : '';
    state=nextState; text=nextText;
    const terms=searchTerms(text).slice(0,30);
    const localized=proposeNames(terms,languages());
    drafts=[...localized,...proposeNameOrders(terms,localized)];
    if (saved?.signature===signature() && approval?.signature!==signature()) approval=saved;
    render();
  }

  return {
    update,
    names: () => searchTerms([...searchTerms(text),...selected()].join('\n')),
    confirmed() {
      if (!drafts.length || approval?.signature===signature()) return true;
      root.querySelector('#variant-status').textContent='Check a suggestion or use Clear all to search only what you typed.';
      root.querySelector('#variant-heading')?.focus();
      return false;
    }
  };
}
