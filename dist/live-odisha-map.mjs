import {drawMap} from './maps.mjs';

export function mountLiveOdishaMap(root,locations,escape,tag) {
  root.innerHTML=`<summary>BhuNaksha village map</summary><div class="toolbar"><label class="label">Village<select id="bhu-village">${locations.map((place,i)=>`<option value="${i}">${escape(place.village)} · ${escape(place.tehsil)}</option>`).join('')}</select></label><label class="label">Sheet<select id="bhu-sheet" disabled></select></label></div><p id="bhu-status" role="status"></p><button class="plain-link" type="button" id="bhu-retry" hidden>Retry map</button><div class="map-frame" id="bhu-canvas-frame" hidden><canvas id="bhu-canvas" width="900" height="590" aria-label="BhuNaksha village map. Click a parcel to read its plot number."></canvas></div><p class="muted">${tag('https://bhunakshaodisha.nic.in/','Open official BhuNaksha portal')}</p>`;
  const village=root.querySelector('#bhu-village'), sheet=root.querySelector('#bhu-sheet');
  const canvas=root.querySelector('#bhu-canvas'), status=root.querySelector('#bhu-status'), frame=root.querySelector('#bhu-canvas-frame');
  const retry=root.querySelector('#bhu-retry');
  let pending, loaded=false, geometry, paths=[];

  async function request(place,sheetCode,signal) {
    const placeCodes=[place.districtCode,place.tehsilCode,place.villageCode,place.riCode].join('-');
    const response=await fetch('/api/odisha/maps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:placeCodes,sheet:sheetCode}),signal});
    const data=await response.json();
    if (!response.ok) throw Error(data.error||'BhuNaksha is unavailable.');
    return data;
  }

  const render = selected=>{
    paths=drawMap(canvas,geometry.features,geometry.gis,new Map(),{labels:geometry.features.length<600,plain:true,selected});
  };

  async function load(sheetCode) {
    pending?.abort();
    const abort = new AbortController(); pending=abort;
    const place=locations[Number(village.value)];
    frame.hidden=true; sheet.disabled=true; retry.hidden=true;
    status.textContent=`Loading ${sheetCode?`sheet ${sheetCode}`:'map sheets'} from BhuNaksha…`;
    try {
      if (!sheetCode) {
        const directory=await request(place,'',abort.signal);
        if (!directory.sheets?.length) throw Error('BhuNaksha returned no sheets for this village.');
        if (abort.signal.aborted) return;
        sheet.innerHTML=directory.sheets.map(code=>`<option>${escape(code)}</option>`).join('');
        sheetCode=sheet.value;
      }
      const next=await request(place,sheetCode,abort.signal);
      if (abort.signal.aborted) return;
      geometry=next;
      frame.hidden=false; render();
      const copy=geometry.captured ? `Saved BhuNaksha map from ${geometry.captured}. ` : '';
      status.textContent=`${copy}${geometry.features.length} mapped parcels. Click a parcel to see its plot number.`;
    } catch(error) {
      if (!abort.signal.aborted) {
        status.textContent=error instanceof SyntaxError?'LandReview could not load the BhuNaksha map. Open the official portal below.':error.message;
        retry.hidden=false;
      }
    } finally {
      if (!abort.signal.aborted) sheet.disabled=!sheet.options.length;
    }
  }

  root.ontoggle=()=>{if (root.open&&!loaded){loaded=true;void load();}};
  village.onchange=()=>{sheet.replaceChildren();void load();};
  sheet.onchange=()=>void load(sheet.value);
  retry.onclick=()=>void load(sheet.value);
  canvas.onclick=event=>{
    const bounds=canvas.getBoundingClientRect();
    const x=(event.clientX-bounds.left)*canvas.width/bounds.width, y=(event.clientY-bounds.top)*canvas.height/bounds.height;
    const context=canvas.getContext('2d');
    const hit=paths.findLast(({path})=>context.isPointInPath(path,x,y,'evenodd'));
    if (!hit) return;
    const parcel=geometry.features.find(item=>`${geometry.gis}/${item.properties.id}`===hit.key);
    if (!parcel) return;
    render(hit.key);
    status.textContent=parcel.properties.kide ? `Plot ${parcel.properties.kide} · Sheet ${geometry.sheet}` : `Selected parcel · Sheet ${geometry.sheet}`;
  };
}
