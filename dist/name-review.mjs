import {normalize} from './core.mjs';
import {searchTerms} from './search.mjs';
import {proposeNames,recordLanguages,suggestedLanguages} from './name-variants.mjs';

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

  function record(spellings, redraw = true) {
    approval={signature:signature(),state,choice,spellings};
    saved=approval;
    try { localStorage.setItem(key,JSON.stringify(approval)); } catch { /* Review remains available in this tab. */ }
    onEdit();
    if (redraw) render();
    else root.querySelector('#variant-status').textContent=summary(spellings.length);
  }

  function render() {
    if (!state || !searchTerms(text).length) { root.hidden=true; return; }
    root.hidden=false;
    const active = new Set(selected().map(normalize));
    const approved = approval?.signature===signature();
    root.innerHTML = `<div class="variant-head"><div><h3 id="variant-heading" tabindex="-1">Review name spellings</h3><p>Checked spellings are included when you search, along with the names you typed.</p></div><label class="label">Record language<select id="variant-language"><option value="">${escape(suggestedLanguages(state).map(code=>recordLanguages[code][0]).join(', ') || 'Latin spelling')}</option>${options.map(([code,[name]])=>`<option value="${code}">${escape(name)}</option>`).join('')}</select></label></div>
      ${drafts.length ? `<div class="variant-options">${drafts.map((item,index)=>`<label class="variant-option"><input type="checkbox" data-spelling="${index}" ${active.has(normalize(item.spelling))?'checked':''}><span><strong lang="${item.language}" dir="auto">${escape(item.spelling)}</strong><small>${escape(item.original)} · ${escape(recordLanguages[item.language][0])}${item.curated?' · Common spelling':''}</small></span></label>`).join('')}</div><button class="plain-link" type="button" id="typed-spellings">Use typed spellings only</button>`:''}
      <p id="variant-status" role="status">${approved ? summary(active.size) : drafts.length ? '' : 'You can enter local-script spellings directly in the names box.'}</p>`;
    const select = root.querySelector('#variant-language');
    select.value=choice;
    select.onchange=()=>{choice=select.value;onEdit();update(state,text);root.querySelector('#variant-language')?.focus();};
    root.querySelector('#typed-spellings')?.addEventListener('click',()=>{ record([]);root.querySelector('#variant-heading')?.focus(); });
    root.querySelector('.variant-options')?.addEventListener('change',()=>{
      const checked=[...root.querySelectorAll('[data-spelling]:checked')].map(box=>drafts[Number(box.dataset.spelling)].spelling);
      record([...new Set(checked)],false);
    });
  }

  function update(nextState,nextText) {
    if (nextState!==state) choice=saved?.state===nextState && Object.hasOwn(recordLanguages,saved.choice) ? saved.choice : '';
    state=nextState; text=nextText;
    drafts=proposeNames(searchTerms(text).slice(0,30),languages());
    if (saved?.signature===signature() && approval?.signature!==signature()) approval=saved;
    render();
  }

  return {
    update,
    names: () => searchTerms([...searchTerms(text),...selected()].join('\n')),
    confirmed() {
      if (!drafts.length || approval?.signature===signature()) return true;
      root.querySelector('#variant-status').textContent='Check a suggested spelling or choose Use typed spellings only.';
      root.querySelector('#variant-heading')?.focus();
      return false;
    }
  };
}
