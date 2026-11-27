import {mountNameReview} from './name-review.mjs';
import {criteriaFrom} from './search.mjs';
import {portals} from './portals.mjs';

const storageKey='india-land-search.name-library.v1';
const odiaKeys=[
  ['Vowels','ଅ ଆ ଇ ଈ ଉ ଊ ଋ ଏ ଐ ଓ ଔ'],
  ['Consonants','କ ଖ ଗ ଘ ଙ ଚ ଛ ଜ ଝ ଞ ଟ ଠ ଡ ଢ ଣ ତ ଥ ଦ ଧ ନ ପ ଫ ବ ଭ ମ ଯ ର ଲ ଳ ଵ ଶ ଷ ସ ହ ୟ ୱ ଡ଼ ଢ଼'],
  ['Signs','ା ି ୀ ୁ ୂ ୃ େ ୈ ୋ ୌ ଂ ଃ ଁ ୍ ଼']
];
let library;
try { library=JSON.parse(localStorage.getItem(storageKey)); } catch { /* Names remain usable in this tab. */ }

export function mountNameLibrary(root,{draft,escape,demo,observe,onUse}){
  const initial=(!demo && library ? library : draft)??{};
  const {state,names}=criteriaFrom({...initial,state:initial.state||'Odisha'});
  root.innerHTML=`
    <section class="card name-library">
      <h2>Your search names</h2>
      <p>Review the spellings you want to use across searches. Saved names stay in this browser.</p>
      <label class="label">Search state<select id="library-state">${portals.map(({name})=>`<option>${escape(name)}</option>`).join('')}</select></label>
      <label class="label">Names to review<textarea id="library-names" rows="4" maxlength="3000" dir="auto" placeholder="Enter one name per line">${escape(names)}</textarea></label>
      <details class="live-location odia-keys"><summary>Type in Odia</summary>
        <p>Insert letters or signs at the cursor. Use ୍ between consonants to form a conjunct.</p>
        <div id="odia-keys"></div>
      </details>
      <div class="name-review" id="library-review" hidden></div>
      <div class="actions library-actions">
        <button type="button" class="button secondary" id="save-library">Save names</button>
        <button type="button" class="button primary" id="use-library">Use on Home</button>
      </div><p id="library-status" role="status"></p>
    </section>`;
  const select=root.querySelector('#library-state');
  const textarea=root.querySelector('#library-names');
  const status=root.querySelector('#library-status');
  const review=mountNameReview(root.querySelector('#library-review'),escape,()=>{status.textContent='';},false,observe,initial.approval);
  select.value=state;
  const update=()=>{status.textContent='';review.update(select.value,textarea.value);};
  update();
  select.onchange=textarea.oninput=update;
  const keys=root.querySelector('#odia-keys');
  for (const [label,letters] of odiaKeys){
    const row=document.createElement('fieldset'), legend=document.createElement('legend');
    legend.textContent=label;row.append(legend);
    for(const letter of letters.split(' ')){
      const key=document.createElement('button');
      key.className='button secondary';key.type='button';key.lang='or';
      key.textContent=(label==='Signs'?'◌':'')+letter;
      key.onclick=()=>{
        const from=textarea.selectionStart,to=textarea.selectionEnd;
        if (textarea.value.length-(to-from)+letter.length>textarea.maxLength)return;
        textarea.setRangeText(letter,from,to,'end');
        textarea.focus();
        update();
      };
      row.append(key);
    }
    keys.append(row);
  }
  function save(){
    if(!review.confirmed())return;
    const entry={state:select.value,names:textarea.value,approval:review.approval()};
    if(demo){status.textContent='Sample names are ready for this demo.';return entry;}
    library=entry;
    try {localStorage.setItem(storageKey,JSON.stringify(entry));status.textContent=entry.names.trim()?'Names and spellings saved.':'Saved names cleared.';}
    catch {status.textContent='Names and spellings saved for this tab.';}
    return entry;
  }
  root.querySelector('#save-library').onclick=save;
  root.querySelector('#use-library').onclick=()=>{
    if(!textarea.value.trim()){status.textContent='Enter a name to use on Home.';textarea.focus();return;}
    const entry=save();
    if(entry)onUse(entry);
  };
}
