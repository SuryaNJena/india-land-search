// A separate demo document keeps the visitor's current search and workspace intact.
export function mountTour(button){
  let dialog,frame,step=0,active;
  const steps=[
    ['Find a village','Try the village field with the fictional demo locality.','overview','#demo-place','#village-finder'],
    ['Review the names','Inspect the suggested spellings for the sample family.','overview','#demo-names','#home-name-review'],
    ['Inspect the map','Zoom or select a parcel on the sample sheet.','maps',null,'#workspace-sheet'],
    ['Read the record','Choose the sample khatas for a combined Record of Rights.','ror',null,'.holding-choices']
  ];
  function isolate(target){
    const doc=frame.contentDocument;
    doc.querySelectorAll('[data-tour-inert]').forEach(el=>{el.inert=false;el.removeAttribute('data-tour-inert');});
    active?.classList.remove('tour-target');
    active=target;
    if(!active)return;
    active.classList.add('tour-target');
    for(let el=target;el&&el!==doc.body;el=el.parentElement){
      for(const sib of el.parentElement.children)if(sib!==el&&!sib.inert){sib.inert=true;sib.dataset.tourInert='';}
    }
    active.scrollIntoView({block:'center',behavior:'instant'});
  }
  function display(){
    const [title,help,view,trigger,selector]=steps[step],doc=frame.contentDocument;
    isolate(null);doc.querySelector('[data-view="'+view+'"]').click();
    if(trigger)doc.querySelector(trigger)?.click();
    isolate(doc.querySelector(selector));
    dialog.querySelector('h2').textContent=title;
    dialog.querySelector('p').textContent=(step+1)+' of '+steps.length+' · '+help;
    dialog.querySelector('[data-back]').disabled=step===0;
    dialog.querySelector('[data-next]').textContent=step===steps.length-1?'Finish':'Next';
  }
  button.onclick=()=>{
    if(dialog?.open)return;
    step=0;dialog=document.createElement('dialog');dialog.className='tour-dialog';dialog.setAttribute('aria-labelledby','tour-title');
    dialog.innerHTML='<div class="tour-bar"><div><h2 id="tour-title">Guided family search</h2><p aria-live="polite">Loading the fictional workspace…</p></div><div class="actions"><button class="button secondary" data-back disabled>Back</button><button class="button primary" data-next disabled>Next</button><button class="button secondary" data-end>End tour</button></div></div><iframe title="Interactive fictional land records"></iframe>';
    frame=dialog.querySelector('iframe');document.body.append(dialog);dialog.showModal();
    dialog.onclose=()=>{dialog.remove();active=undefined;button.focus();};
    dialog.querySelector('[data-end]').onclick=()=>dialog.close();
    dialog.querySelector('[data-back]').onclick=()=>{step--;display();};
    dialog.querySelector('[data-next]').onclick=()=>{if(step===steps.length-1)dialog.close();else {step++;display();}};
    frame.onload=()=>{
      const doc=frame.contentDocument;
      doc.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close();}});
      const prepare=()=>{
        if(!dialog.open||!doc.querySelector('#demo-place'))return false;
        display();dialog.querySelector('[data-next]').disabled=false;return true;
      };
      if(!prepare()){const obs=new MutationObserver(()=>{if(prepare()||!dialog.open)obs.disconnect();});obs.observe(doc.body,{childList:true,subtree:true});}
    };
    frame.src=new URL('?demo=1&tour=1',location.href).href;
  };
}

