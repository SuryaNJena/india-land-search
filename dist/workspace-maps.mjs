import {mapViewLimit,newSheetView,drawMap,panSheetView,parcelFocus,sheetProjection,zoomSheetView} from './maps.mjs';
import {localMapLayer,plotNumber} from './sheet-overlays.mjs';
import {mountParcelBasemap} from './parcel-basemap.mjs';

let snapshotRequest;
function publicGeometry() {
  return snapshotRequest ??= fetch(new URL('./odisha-map-snapshots.json',import.meta.url),{signal:AbortSignal.timeout(4000)})
    .then(response=>{
      if (!response.ok) throw Error('Public maps are unavailable.');
      return response.json();
    })
    .then(data=>new Map(Object.values(data.villages).flatMap(sheets=>Object.values(sheets))
      .map(sheet=>[sheet.gis,{...sheet,captured:sheet.captured??data.collected}])))
    .catch(()=>{snapshotRequest=undefined; return new Map();});
}

export async function withPublicGeometry(workspace, load=publicGeometry) {
  const candidates=new Map();
  for (const row of workspace.rows) {
    if (!/^\d{11}$/.test(row.gis) || workspace.geometry?.[row.gis]?.features?.length) continue;
    if (!candidates.has(row.gis)) candidates.set(row.gis,new Map());
    candidates.get(row.gis).set(String(row.id),row);
  }
  if (!candidates.size) return workspace;
  const catalog=await load();
  const geometry={...workspace.geometry}, summary=[...workspace.summary];
  for (const [gis,rows] of candidates) {
    const saved=catalog.get(gis);
    const matched=saved?.features.find(feature=>{
      const row=rows.get(String(feature.properties.id));
      return row && plotNumber(row.plot) && plotNumber(row.plot)===plotNumber(feature.properties.kide);
    });
    if (!matched) continue;
    geometry[gis]=saved;
    const row=rows.get(String(matched.properties.id));
    const index=summary.findIndex(sheet=>sheet.gis===gis);
    const entry={name:row.village,sheet:saved.sheet,village:row.village_code,...summary[index],gis,source:'BhuNaksha',captured:saved.captured};
    if (index<0) summary.push(entry); else summary[index]=entry;
  }
  return {...workspace,geometry,summary};
}

export function mountWorkspaceSheet(root,{sheet,geometry,highlights,plain,rows,escape,tag,inspect,pinState}) {
  root.innerHTML='<div class="bhu-controls"><div class="actions" role="group" aria-label="Map zoom">'+
    '<button class="button secondary" type="button" data-zoom-in aria-label="Zoom in">+</button>'+
    '<button class="button secondary" type="button" data-zoom-out aria-label="Zoom out">−</button>'+
    '<button class="button secondary" type="button" data-fit>Fit sheet</button><output aria-label="Map scale">100%</output></div>'+
    '<form class="actions"><input type="search" maxlength="80" aria-label="Find plot number" placeholder="Plot number, e.g. 12/3" required>'+
    '<button class="button secondary" type="submit">Find plot</button></form></div>'+
    '<p data-find-status role="status"></p><div data-plot-choices class="actions"></div>'+
    '<div class="bhu-map-review"><div class="map-frame bhu-interactive">'+
    '<canvas id="map" tabindex="0" width="1100" height="720" aria-label="Parcel sheet. Use plus or minus to zoom and arrow keys to pan. Select a parcel or use Find plot."></canvas></div>'+
    '<section class="bhu-plot-info" aria-label="Plot Info" aria-live="polite" hidden></section></div>'+
    '<div class="legend"><span><i class="bhu-selected-swatch"></i>Selected plot</span><span>Plot numbers appear from 200% zoom where there is room.</span></div>'+
    '<details data-geo><summary>Geographic parcels and reference pin</summary><label class="label">Add WGS84 parcel GeoJSON for this sheet'+
    '<input type="file" accept=".json,.geojson,application/geo+json"></label><p class="muted">Include this sheet’s map code and a matching parcel ID or exact plot number.</p>'+
    '<p data-geo-status role="status"></p><div data-geo-map></div></details>';
  const get=selector=>root.querySelector(selector);
  const canvas=get('canvas'), panel=get('section'), fit=get('[data-fit]'), output=get('output');
  const plus=get('[data-zoom-in]'), minus=get('[data-zoom-out]');
  const {width,height}=canvas, features=geometry.features, projection=sheetProjection(features,canvas);
  let view=newSheetView(), paths=[], selected, frame=0, drag, geographic=geometry.geographic, unmount;
  const keyOf=feature=>sheet.gis+'/'+feature.properties.id;
  function paint() {
    paths=drawMap(canvas,features,sheet.gis,highlights(),{project:projection,view,
      labels:view.zoom>=2,labelScale:canvas.clientWidth/width,selected:selected && keyOf(selected),plain:plain(),selectionFill:true});
    output.value=Math.round(view.zoom*100)+'%';
    plus.disabled=view.zoom>=mapViewLimit;
    minus.disabled=fit.disabled=view.zoom<=1;
  }
  function redraw() {
    if (!frame) frame=requestAnimationFrame(()=>{frame=0;if (root.isConnected) paint();});
  }
  const zoom=(factor,point=[width/2,height/2])=>{view=zoomSheetView(view,factor,point,width,height);redraw();};
  const pan=(dx,dy)=>{view=panSheetView(view,dx,dy,width,height);redraw();};
  const point=({clientX,clientY})=>{
    const box=canvas.getBoundingClientRect();
    return [(clientX-box.left)*width/box.width,(clientY-box.top)*height/box.height];
  };
  function select(feature,center=false) {
    selected=feature;
    const key=keyOf(feature), record=rows.get(key), row=record?.row;
    const number=feature.properties.kide||row?.plot||'Unnumbered parcel';
    const result=highlights().get(key);
    const match=['surname','full'].includes(result?.level);
    const terms=(result?.[result.level]??[]).join(' · ');
    panel.hidden=false;
    panel.innerHTML='<h3>Plot Info · '+escape(number)+'</h3>'+
      (match?'<p class="bhu-plot-match">Name match'+(terms?' · '+escape(terms):'')+'</p>':'')+
      (row?.khata?'<p>Khata '+escape(row.khata)+'</p>':'')+
      (row?.area_acres?'<p>'+escape(row.area_acres)+' acres</p>':'')+
      '<p class="bhu-plot-source">'+escape(row?.info||'Plot Info is unavailable in this workspace.')+'</p>'+
      (record?'<div class="actions">'+tag(row.front,'Official RoR front')+tag(row.back,'Official RoR back')+
      '<button type="button" class="plain-link" data-record>Open full record</button></div>':'');
    get('[data-record]')?.addEventListener('click',()=>inspect(record.index));
    if (center && projection) {
      const target=parcelFocus(feature,projection);
      const scale=Math.max(1,Math.min(10,width*.55/target.width,height*.55/target.height));
      view=panSheetView({zoom:scale,x:width/2-target.x*scale,y:height/2-target.y*scale},0,0,width,height);
    }
    paint();
  }
  plus.onclick=()=>zoom(Math.SQRT2);
  minus.onclick=()=>zoom(Math.SQRT1_2);
  fit.onclick=()=>{view=newSheetView();redraw();};
  get('form').onsubmit=event=>{
    event.preventDefault();
    const number=plotNumber(get('input[type=search]').value);
    const matches=number?features.filter(feature=>plotNumber(feature.properties.kide)===number):[];
    const list=get('[data-plot-choices]');
    list.replaceChildren();
    get('[data-find-status]').textContent=matches.length===1?'':matches.length?'Choose a parcel with this plot number.':'No exact plot number on this sheet.';
    if (matches.length===1) select(matches[0],true);
    if (matches.length>1) matches.forEach((feature,i)=>{
      const button=document.createElement('button');
      button.className='button secondary';
      button.textContent='Parcel '+(i+1);
      button.onclick=()=>select(feature,true);
      list.append(button);
    });
  };
  canvas.addEventListener('wheel',event=>{
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom(event.deltaY<0?Math.SQRT2:Math.SQRT1_2,point(event));
  },{passive:false});
  canvas.onkeydown=event=>{
    const direction={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]};
    if (event.key==='+' || event.key==='=') zoom(Math.SQRT2);
    else if (event.key==='-') zoom(Math.SQRT1_2);
    else if (Object.hasOwn(direction,event.key)) pan(...direction[event.key]);
    else return;
    event.preventDefault();
  };
  canvas.onpointerdown=event=>{
    if (!event.isPrimary || event.button!==0) return;
    drag={id:event.pointerId,point:point(event),x:event.clientX,y:event.clientY,moved:false};
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove=event=>{
    if (drag?.id!==event.pointerId || !drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4) return;
    drag.moved=true;
    const [x,y]=point(event);
    pan(x-drag.point[0],y-drag.point[1]);
    drag.point=[x,y];
  };
  canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
  canvas.onpointerup=event=>{
    const current=drag;
    drag=null;
    if (current?.id!==event.pointerId || current.moved) return;
    const [x,y]=point(event), context=canvas.getContext('2d');
    const hit=paths.findLast(({path})=>context.isPointInPath(path,x,y,'evenodd'));
    if (hit) select(hit.feature);
  };
  const geo=get('[data-geo]');
  function showGeography() {
    if (!geo.open) return;
    unmount?.();
    const selectedParcels=new Map();
    for (const feature of features) {
      const match=highlights().get(keyOf(feature));
      if (['full','surname'].includes(match?.level)) selectedParcels.set(String(feature.properties.id),match);
    }
    unmount=mountParcelBasemap(get('[data-geo-map]'),{geographic,highlights:selectedParcels,pinState,localOnly:true});
  }
  geo.ontoggle=()=>{
    if (geo.open) showGeography();
    else {unmount?.();unmount=undefined;}
  };
  get('input[type=file]').onchange=async event=>{
    const input=event.currentTarget, file=input.files[0], message=get('[data-geo-status]');
    input.value='';
    if (!file) return;
    try {
      if (file.size>8*1024*1024) throw Error('Choose a GeoJSON file no larger than 8 MB.');
      geographic=localMapLayer(JSON.parse(await file.text()),{...geometry,gis:sheet.gis});
      if (!canvas.isConnected) return;
      message.textContent='Geographic parcels loaded for this sheet.';
      showGeography();
    } catch (error) {message.textContent=error.message;}
  };
  paint();
  return {
    redraw(){if (selected) select(selected);else paint();showGeography();},
    close(){unmount?.();if (frame) cancelAnimationFrame(frame);}
  };
}
