import {normalize} from './core.mjs';
import {locationLinks,mountParcelBasemap} from './parcel-basemap.mjs';

const assets=new Map();
const nameKey=value=>normalize(value).replace(/[^\p{L}\p{M}\p{N}]/gu,'');
function load(file) {
  if (!assets.has(file)) assets.set(file,fetch(new URL(file,import.meta.url)).then(response=>{
    if (!response.ok) throw Error('The Odisha village boundary file could not be opened.');
    return response.json();
  }).catch(error=>{assets.delete(file);throw error;}));
  return assets.get(file);
}

function ring(encoded) {
  const coordinates=[];
  let x=810000,y=170000,xOffset,value=0,shift=0;
  for (const digit of encoded) {
    const number=digit.charCodeAt(0)-63;
    value+=(number&31)<<shift;
    if (number>=32) {shift+=5;continue;}
    const offset=value&1 ? -(value+1)/2 : value/2;
    if (xOffset===undefined) xOffset=offset;
    else {
      x+=xOffset;y+=offset;
      coordinates.push([x/10000,y/10000]);
      xOffset=undefined;
    }
    value=0;shift=0;
  }
  coordinates.push(coordinates[0]);
  return coordinates;
}

export function boundaryPlace(row,district) {
  const [id,village,tehsil,lon,lat,shape,portalCode,riCode,ri]=row;
  return {id,state:'Odisha',district,tehsil,village,portalCode,riCode,ri,center:[lon/10000,lat/10000],
    polygons:shape.split(':').map(part=>part.split('!').map(ring))};
}

export function mountOdishaBoundaries(root,{tag,onChoose}) {
  root.innerHTML='<h3>Odisha village boundaries</h3>'+
    '<div class="search-fields"><label class="label">Boundary district<select data-boundary-district disabled></select></label>'+
    '<label class="label">Boundary tehsil<select data-boundary-tehsil disabled></select></label>'+
    '<label class="label">Filter village names<input type="search" data-boundary-query></label>'+
    '<label class="label">Boundary village<select data-boundary-village disabled></select></label></div>'+
    '<p role="status" data-boundary-status class="muted">Loading Odisha districts…</p>'+
    '<div class="map-frame"><canvas data-boundary-map width="850" height="490" aria-label="Odisha village boundaries"></canvas></div>'+
    '<div class="actions boundary-actions"><button type="button" class="button secondary" data-boundary-use disabled>Use this village</button>'+
    '<button type="button" class="button secondary" data-boundary-fit>Fit boundaries</button><span data-boundary-links></span></div>'+
    '<details class="live-location" data-boundary-osm hidden><summary>Village boundary on OpenStreetMap</summary><div></div></details>'+
    '<p class="muted">Simplified reference boundaries. '+tag('https://nwdp.nwic.gov.in/dataset/village-boundary','Survey of India boundaries via National Water Data Portal')+'</p>';
  const get=name=>root.querySelector('[data-boundary-'+name+']');
  const district=get('district'),tehsil=get('tehsil'),village=get('village'),query=get('query');
  const canvas=get('map'),status=get('status'),use=get('use'),links=get('links');
  const osm=get('osm');
  let records=[],filtered=[],selected,paths=[],version=0,releaseMap;
  function referenceMap() {
    releaseMap?.();
    releaseMap=undefined;
    osm.hidden=!selected;
    if (!selected || !osm.open) return;
    const geographic={source:selected.village+' · Survey of India reference village boundary',
      features:[{type:'Feature',properties:{id:selected.id||selected.village,name:selected.village},
        geometry:{type:'MultiPolygon',coordinates:selected.polygons}}]};
    releaseMap=mountParcelBasemap(osm.querySelector('div'),{geographic,referenceBoundary:true});
  }
  osm.ontoggle=referenceMap;
  function setOptions(select,placeholder,list) {
    select.replaceChildren(new Option(placeholder,''),...list.map(([value,label])=>new Option(label,value)));
    select.disabled=!list.length;
  }
  function draw(fitSelection=true) {
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    paths=[];
    use.disabled=!selected;
    const external=selected && locationLinks(selected.center);
    links.innerHTML=external ? tag(external.google,'Village location in Google Maps')+' '+tag(external.osm,'Village location in OpenStreetMap') : '';
    if (!filtered.length) return;
    const extent=[Infinity,Infinity,-Infinity,-Infinity];
    for (const place of selected && fitSelection ? [selected] : filtered) {
      for (const polygon of place.polygons) for (const [x,y] of polygon[0]) {
        extent[0]=Math.min(extent[0],x);extent[1]=Math.min(extent[1],y);
        extent[2]=Math.max(extent[2],x);extent[3]=Math.max(extent[3],y);
      }
    }
    const [left,bottom,right,top]=extent;
    const cos=Math.cos((top+bottom)*Math.PI/360);
    const scale=Math.min((canvas.width-100)/(Math.max(.003,right-left)*cos),(canvas.height-100)/Math.max(.003,top-bottom));
    const pixel=([x,y])=>[canvas.width/2+(x-(left+right)/2)*scale*cos,canvas.height/2-(y-(bottom+top)/2)*scale];
    const visible=filtered.filter(place=>{
      const [x,y]=pixel(place.center);
      return x>=-150 && x<=canvas.width+150 && y>=-150 && y<=canvas.height+150;
    });
    for (const place of [...visible.filter(place=>place!==selected),...(selected?[selected]:[])]) {
      const path=new Path2D();
      for (const polygon of place.polygons) for (const outline of polygon) {
        path.moveTo(...pixel(outline[0]));
        for (const xy of outline.slice(1)) path.lineTo(...pixel(xy));
        path.closePath();
      }
      ctx.fillStyle=selected===place?'#66ae93':'#e0eee6';
      ctx.strokeStyle=selected===place?'#155947':'#7b9387';
      ctx.lineWidth=selected===place?2.1:0.65;
      ctx.fill(path,'evenodd');ctx.stroke(path);
      paths.push({path,place});
    }
    ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    const labelled=filtered.length<=18 ? visible : selected ? [selected] : [];
    for (const place of labelled) {
      const [x,y]=pixel(place.center);
      if (x<0 || y<0 || x>canvas.width || y>canvas.height) continue;
      ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.strokeText(place.village,x,y);
      ctx.fillStyle='#173d30';ctx.fillText(place.village,x,y);
    }
  }
  function update() {
    const wanted=nameKey(query.value);
    selected=undefined;
    filtered=records.filter(place=>(!tehsil.value || tehsil.value===place.tehsil) && (!wanted || nameKey(place.village).includes(wanted)));
    setOptions(village,'Choose village',filtered.map((place,i)=>[String(i),place.village+(place.tehsil?' · '+place.tehsil:'')]));
    status.textContent=filtered.length ? filtered.length.toLocaleString('en-IN')+' village boundaries.' : 'No village boundary matches these filters.';
    draw();referenceMap();
  }
  function choose(place) {
    selected=place;
    village.value=place ? String(filtered.indexOf(place)) : '';
    if (place) status.textContent=[place.village,place.tehsil,place.district].filter(Boolean).join(' · ');
    draw();referenceMap();
  }
  district.onchange=async()=>{
    const request=++version;
    records=[];setOptions(tehsil,'All tehsils',[]);update();
    if (!/^[a-z]+$/u.test(district.value)) return;
    const code=district.value,label=district.selectedOptions[0].textContent;
    status.textContent='Loading '+label+' village boundaries…';
    try {
      const rows=await load('odisha-boundaries-'+code+'.json');
      if (request!==version || !root.isConnected) return;
      records=rows.map(row=>boundaryPlace(row,label));
      setOptions(tehsil,'All tehsils',[...new Set(records.map(place=>place.tehsil).filter(Boolean))].sort().map(name=>[name,name]));
      update();
    } catch(error) {if (request===version) status.textContent=error.message;}
  };
  tehsil.onchange=query.oninput=update;
  village.onchange=()=>choose(village.value===''?undefined:filtered[Number(village.value)]);
  get('fit').onclick=()=>draw(false);
  use.onclick=()=>{if (selected) onChoose(selected);};
  canvas.onclick=event=>{
    const box=canvas.getBoundingClientRect();
    const x=(event.clientX-box.left)*canvas.width/box.width,y=(event.clientY-box.top)*canvas.height/box.height;
    const ctx=canvas.getContext('2d');
    const place=paths.findLast(entry=>ctx.isPointInPath(entry.path,x,y,'evenodd'))?.place;
    if (place) choose(place);
  };
  void load('odisha-boundary-districts.json').then(rows=>{
    if (!root.isConnected) return;
    setOptions(district,'Choose district',rows.map(([id,name])=>[id,name]));
    status.textContent='Choose a district to see the village borders.';
  },error=>{if (root.isConnected) status.textContent=error.message;});
}
