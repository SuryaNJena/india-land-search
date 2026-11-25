import {colours} from './maps.mjs';
import {download} from './files.mjs';

const tileSize=256;
const maxLatitude=85.05112878;
const initialCenter=[85.3,20.5];
const standardTiles='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const levelColour={full:colours.full,surname:colours.surname};
const pinColor='#1769aa';

const validPosition=position=>Array.isArray(position) &&
  Number.isFinite(position[0]) && Number.isFinite(position[1]) &&
  Math.abs(position[0])<=180 && Math.abs(position[1])<=maxLatitude;

export function projectPosition([longitude,latitude], zoom) {
  const world=tileSize*2**zoom;
  const radians=Math.max(-maxLatitude,Math.min(maxLatitude,latitude))*Math.PI/180;
  return [world*(longitude+180)/360,world*(.5-Math.asinh(Math.tan(radians))/(2*Math.PI))];
}

export function unprojectPosition([x,y], zoom) {
  const world=tileSize*2**zoom;
  return [x/world*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/world)))*180/Math.PI];
}

function polygons(geometry) {
  if (geometry?.type==='Polygon') return [geometry.coordinates];
  if (geometry?.type==='MultiPolygon') return geometry.coordinates;
  return [];
}

export function wgs84Parcels(geographic) {
  if (typeof geographic?.source!=='string' || !geographic.source.trim() || !Array.isArray(geographic.features)) return [];
  return geographic.features.filter(feature=>{
    const shapes=polygons(feature?.geometry);
    if (!feature?.properties?.id && feature?.properties?.id!==0) return false;
    return Array.isArray(shapes) && shapes.length && shapes.every(polygon=>
      Array.isArray(polygon) && polygon.length && polygon.every(ring=>
        Array.isArray(ring) && ring.length>=4 && ring.every(validPosition) &&
        ring[0][0]===ring.at(-1)[0] && ring[0][1]===ring.at(-1)[1]));
  });
}

export function locationLinks(position) {
  if (!validPosition(position)) return null;
  const [lon,lat]=position.map(value=>value.toFixed(6));
  const osm=new URL('https://www.openstreetmap.org/');
  osm.search=new URLSearchParams({mlat:lat,mlon:lon});
  osm.hash='map=17/'+lat+'/'+lon;
  const google=new URL('https://www.google.com/maps/search/');
  google.search=new URLSearchParams({api:'1',query:lat+','+lon});
  return {osm:osm.href,google:google.href};
}

const wrapLongitude=value=>((value+180)%360+360)%360-180;

function featureBounds(features,pins=[]) {
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  function include([lon,lat]) {
    bounds[0]=Math.min(lon,bounds[0]);
    bounds[1]=Math.min(lat,bounds[1]);
    bounds[2]=Math.max(lon,bounds[2]);
    bounds[3]=Math.max(lat,bounds[3]);
  }
  for (const pin of pins) include(pin);
  for (const feature of features) {
    for (const polygon of polygons(feature.geometry)) {
      for (const ring of polygon) for (const point of ring) include(point);
    }
  }
  return Number.isFinite(bounds[0]) ? bounds : null;
}

export function fitViewport(bounds,width,height) {
  if (!bounds) return {center:initialCenter,zoom:7};
  const [left,bottom,right,top]=bounds;
  const [x0,y0]=projectPosition([left,top],0);
  const [x1,y1]=projectPosition([right,bottom],0);
  const scale=Math.min(Math.max(width-48,1)/(x1-x0 || .000001),Math.max(height-48,1)/(y1-y0 || .000001));
  return {center:unprojectPosition([(x0+x1)/2,(y0+y1)/2],0),zoom:Math.max(0,Math.min(19,Math.floor(Math.log2(scale))))};
}

export function tilesForViewport(center,zoom,width,height) {
  const [cx,cy]=projectPosition(center,zoom);
  const count=2**zoom;
  const left=cx-width/2, top=cy-height/2;
  const tiles=[];
  for (let y=Math.max(0,Math.floor(top/tileSize));y<=Math.min(count-1,Math.floor((top+height-1)/tileSize));y++) {
    for (let x=Math.floor(left/tileSize);x<=Math.floor((left+width-1)/tileSize);x++) {
      tiles.push({x:(x%count+count)%count,y,z:zoom,column:x,left:x*tileSize-left,top:y*tileSize-top});
    }
  }
  return tiles;
}

const styles=''
  +'.lr-parcel-map{background:#fff;border:1px solid #dbe5dd;border-radius:8px;padding:12px;margin-top:12px;min-width:0}'
  +'.lr-parcel-map p{margin:.35rem 0}.lr-parcel-map [hidden]{display:none!important}'
  +'.lr-parcel-map .lr-map-controls{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end;margin:.5rem 0}'
  +'.lr-parcel-map .lr-map-controls input{width:11ch}'
  +'.lr-parcel-map .lr-map-viewport{height:clamp(280px,47vw,460px);position:relative;overflow:hidden;background:#eaf0ec;border:1px solid #c6d2ca;border-radius:8px}'
  +'.lr-parcel-map canvas,.lr-parcel-map .lr-map-tiles{position:absolute;width:100%;height:100%;inset:0}'
  +'.lr-parcel-map canvas{touch-action:pan-y;cursor:grab}.lr-parcel-map canvas[data-pin-mode]{cursor:crosshair}'
  +'.lr-parcel-map .lr-map-tiles img{position:absolute;width:256px;height:256px;max-width:none}'
  +'.lr-parcel-map .lr-map-credit{position:absolute;right:0;bottom:0;padding:0 5px;background:#fffffff0;font-size:.88rem}'
  +'.lr-parcel-map .lr-map-legend{display:flex;gap:.8rem;flex-wrap:wrap}'
  +'.lr-parcel-map .lr-map-legend i{display:inline-block;width:.8rem;height:.8rem;margin-right:.22rem;border:1px solid #465747;border-radius:2px}'
  +'.lr-parcel-map a{margin-right:.7rem}';

export function mountParcelBasemap(root,{geographic,geographicRaster,referenceBoundary=false,highlights=new Set(),tileTemplate=standardTiles,pinState={}}={}) {
  if (root.tagName==='DETAILS') {
    root.innerHTML='<summary>Geographic map and location pin</summary><div class="lr-parcel-map"></div>';
  }
  const panel=root.querySelector('.lr-parcel-map')??root;
  panel.classList.add('lr-parcel-map');
  panel.innerHTML='<style>'+styles+'</style>'
    +'<p data-coverage></p>'
    +'<div class="lr-map-controls">'
    +'<button type="button" class="button secondary" data-tiles aria-pressed="false">Show OpenStreetMap</button>'
    +'<button type="button" class="button secondary" data-fit>Fit map</button>'
    +'<button type="button" class="button secondary" data-zoom="1" aria-label="Zoom in">+</button>'
    +'<button type="button" class="button secondary" data-zoom="-1" aria-label="Zoom out">−</button>'
    +'<button type="button" class="button secondary" data-pin-mode aria-pressed="false">Place a pin</button>'
    +'<button type="button" class="button secondary" data-gps>Use my location</button>'
    +'<button type="button" class="button secondary" data-clear hidden>Clear pin</button>'
    +'</div>'
    +'<div class="lr-map-viewport"><div class="lr-map-tiles" aria-hidden="true"></div>'
    +'<canvas tabindex="0" aria-label="Map. Use arrow keys to pan and plus or minus to zoom. Use the coordinate fields to add a pin with the keyboard."></canvas>'
    +'<span class="lr-map-credit" hidden>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></span></div>'
    +'<form class="lr-map-controls"><label class="label">Latitude<input name="lat" required type="number" min="-85.05112878" max="85.05112878" step="any" inputmode="decimal"></label>'
    +'<label class="label">Longitude<input name="lon" required type="number" min="-180" max="180" step="any" inputmode="decimal"></label>'
    +'<button class="button secondary">Set coordinate pin</button></form>'
    +'<div class="lr-map-legend" hidden><span><i style="background:'+colours.full+'"></i>Specific-name match</span><span><i style="background:'+colours.surname+'"></i>Surname match</span></div>'
    +'<p data-status role="status"></p><p data-links hidden>'
    +'<a data-google target="_blank" rel="noopener noreferrer">Open pin in Google Maps</a>'
    +'<a data-osm target="_blank" rel="noopener noreferrer">Open pin in OpenStreetMap</a></p>'
    +'<button type="button" class="button secondary" data-download hidden>Download matched parcels as GeoJSON</button>'
    +'<p class="muted">Pins in this view are for reference. OpenStreetMap receives requests for visible tiles only after you turn it on.</p>';

  const features=wgs84Parcels(geographic);
  const matched=feature=>{
    const id=String(feature.properties.id);
    if (!highlights.has(id)) return null;
    const value=highlights.get?.(id);
    return value==='surname' || value?.level==='surname' ? 'surname' : 'full';
  };
  const matchingFeatures=features.filter(matched);
  const canvas=panel.querySelector('canvas');
  const viewport=panel.querySelector('.lr-map-viewport');
  const images=panel.querySelector('.lr-map-tiles');
  const credit=panel.querySelector('.lr-map-credit');
  const form=panel.querySelector('form');
  const status=panel.querySelector('[data-status]');
  const tileButton=panel.querySelector('[data-tiles]');
  const pinButton=panel.querySelector('button[data-pin-mode]');
  const gpsButton=panel.querySelector('[data-gps]');
  const clearButton=panel.querySelector('[data-clear]');
  const downloadButton=panel.querySelector('[data-download]');
  const links=panel.querySelector('[data-links]');
  const coverage=panel.querySelector('[data-coverage]');
  const nodes=new Map();
  let center=initialCenter, zoom=7, pin, pinMode=false, tiles=false, start, dirty=true;
  let tileFailures=0;
  let gpsRequest=0;
  const extent=geographicRaster?.bounds;
  const rasterPoints=geographicRaster?.projection==='EPSG:3857' &&
    Array.isArray(extent) && extent.length===4 && extent[0]<extent[2] && extent[1]<extent[3]
    ? [[extent[0],extent[3]],[extent[2],extent[1]]] : [];
  const imaging=rasterPoints.length && rasterPoints.every(validPosition);
  const raster=imaging?new Image():null;
  if (raster) {
    raster.alt='Official BhuNaksha cadastral layer';
    raster.style.position='absolute';
    raster.style.maxWidth='none';
    raster.style.pointerEvents='none';
    raster.onerror=()=>{if (canvas.isConnected) status.textContent='The official geographic overlay image is unavailable.';};
    raster.src=geographicRaster.url;
    raster.hidden=true;
    viewport.insertBefore(raster,canvas);
  }
  const bounds=featureBounds(matchingFeatures.length?matchingFeatures:features,raster? rasterPoints:[]);
  coverage.textContent=features.length
    ? referenceBoundary ? geographic.source : features.length+' geographic parcels · '+matchingFeatures.length+' matched · '+geographic.source
    : raster ? geographicRaster.source
      : 'Geographic parcel boundaries are unavailable for this sheet. You can use this map to place a reference pin.';
  downloadButton.hidden=!matchingFeatures.length;
  panel.querySelector('.lr-map-legend').hidden=!matchingFeatures.length;

  const dimensions=()=>[viewport.clientWidth,viewport.clientHeight];
  function drawTiles(width,height) {
    credit.hidden=!tiles;
    if (!tiles) return;
    const visible=new Set();
    for (const tile of tilesForViewport(center,zoom,width,height)) {
      const key=tile.z+'/'+tile.x+'/'+tile.y+'/'+tile.column;
      visible.add(key);
      let image=nodes.get(key);
      if (!image) {
        image=new Image();
        image.alt='';
        image.decoding='async';
        image.referrerPolicy='strict-origin-when-cross-origin';
        image.onerror=()=>{
          if (tiles && ++tileFailures===1) {
            status.textContent='Some background tiles are unavailable. The supplied parcel outline and pin can still be viewed.';
          }
        };
        image.src=tileTemplate.replace('{z}',tile.z).replace('{x}',tile.x).replace('{y}',tile.y);
        images.append(image);
        nodes.set(key,image);
      }
      image.style.left=tile.left+'px';
      image.style.top=tile.top+'px';
    }
    for (const [key,image] of nodes) if (!visible.has(key)) {image.remove();nodes.delete(key);}
  }

  function draw() {
    const [width,height]=dimensions();
    if (!width || !height) return;
    const scale=window.devicePixelRatio||1;
    canvas.width=Math.round(width*scale);
    canvas.height=Math.round(height*scale);
    const ctx=canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale,scale);
    const [cx,cy]=projectPosition(center,zoom);
    function pixel(position) {
      const [x,y]=projectPosition(position,zoom);
      return [x-cx+width/2,y-cy+height/2];
    }
    drawTiles(width,height);
    if (raster) {
      const [left,top]=pixel(rasterPoints[0]), [right,bottom]=pixel(rasterPoints[1]);
      raster.hidden=false;
      Object.assign(raster.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
    }
    for (const feature of features) {
      const level=matched(feature);
      const path=new Path2D();
      for (const polygon of polygons(feature.geometry)) for (const ring of polygon) {
        path.moveTo(...pixel(ring[0]));
        for (const point of ring.slice(1)) path.lineTo(...pixel(point));
        path.closePath();
      }
      ctx.fillStyle=levelColour[level]??'#e4ebe6';
      ctx.globalAlpha=level ? .75 : .32;
      ctx.fill(path,'evenodd');
      ctx.globalAlpha=1;
      ctx.lineWidth=level?2:1;
      ctx.strokeStyle=level==='surname'?'#8f5a14':level?'#5e417c':'#61786b';
      ctx.stroke(path);
      const plot=referenceBoundary ? feature.properties.name : feature.properties.kide;
      if (plot && (referenceBoundary || level && zoom>=15)) {
        const ring=polygons(feature.geometry)[0][0];
        const selectedBounds=featureBounds([feature]);
        const [x,y]=pixel([(selectedBounds[0]+selectedBounds[2])/2,(selectedBounds[1]+selectedBounds[3])/2]);
        if (ring.length>3 && ctx.isPointInPath(path,x*scale,y*scale,'evenodd')) {
          ctx.font='600 11px system-ui';
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeText(String(plot),x,y);
          ctx.fillStyle='#18382d';ctx.fillText(String(plot),x,y);
          ctx.textAlign='start';ctx.textBaseline='alphabetic';
        }
      }
    }
    if (pin) {
      const [x,y]=pixel(pin);
      ctx.beginPath();
      ctx.arc(x,y,7,0,Math.PI*2);
      ctx.fillStyle=pinColor;ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke();
      ctx.font='600 13px system-ui';
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeText('Reference pin',x+11,y+4);
      ctx.fillStyle=pinColor;ctx.fillText('Reference pin',x+11,y+4);
    }
  }

  function fit(frames=pin?[pin]:[]) {
    const [width,height]=dimensions();
    if (!width || !height) return;
    const frame=frames.length?featureBounds(matchingFeatures.length?matchingFeatures:features,
      raster?[...rasterPoints,...frames]:frames):bounds;
    ({center,zoom}=fitViewport(frame,width,height));
    dirty=false;
    draw();
  }

  function pan(x,y) {
    const [cx,cy]=projectPosition(center,zoom);
    const [longitude,latitude]=unprojectPosition([cx+x,cy+y],zoom);
    center=[wrapLongitude(longitude),Math.max(-maxLatitude,Math.min(maxLatitude,latitude))];
    draw();
  }

  function changeZoom(amount) {
    zoom=Math.max(0,Math.min(19,zoom+amount));
    draw();
  }

  function setPinMode(value) {
    pinMode=value;
    canvas.toggleAttribute('data-pin-mode',value);
    pinButton.setAttribute('aria-pressed',String(value));
    if (value) status.textContent='Click a point on the map to place the reference pin.';
  }

  function setPin(position,label) {
    const urls=locationLinks(position);
    if (!urls) {status.textContent='Enter valid latitude and longitude for the geographic map.';return;}
    gpsRequest++;
    gpsButton.disabled=false;
    pin=[...position];
    pinState.position=pin;
    pinState.label=label;
    form.elements.lon.value=position[0].toFixed(6);
    form.elements.lat.value=position[1].toFixed(6);
    clearButton.hidden=false;
    links.hidden=false;
    links.querySelector('[data-google]').href=urls.google;
    links.querySelector('[data-osm]').href=urls.osm;
    setPinMode(false);
    fit();
    status.textContent=label+' · '+form.elements.lat.value+', '+form.elements.lon.value;
  }

  const resize=()=>{
    if (!viewport.isConnected) {observer.disconnect();return;}
    if (dirty) fit(); else draw();
  };
  const observer=new ResizeObserver(resize);
  observer.observe(viewport);

  tileButton.onclick=()=>{
    tiles=!tiles;
    tileFailures=0;
    tileButton.setAttribute('aria-pressed',String(tiles));
    tileButton.textContent=tiles?'Hide OpenStreetMap':'Show OpenStreetMap';
    if (!tiles) {images.replaceChildren();nodes.clear();}
    draw();
  };
  panel.querySelector('[data-fit]').onclick=()=>fit();
  panel.querySelectorAll('[data-zoom]').forEach(button=>button.onclick=()=>changeZoom(Number(button.dataset.zoom)));
  pinButton.onclick=()=>setPinMode(!pinMode);
  gpsButton.onclick=()=>{
    if (!navigator.geolocation) {status.textContent='Device location is unavailable here. Use the coordinate fields or place a pin on the map.';return;}
    const request=++gpsRequest;
    gpsButton.disabled=true;
    status.textContent='Requesting device location…';
    navigator.geolocation.getCurrentPosition(position=>{
      if (request!==gpsRequest || !viewport.isConnected) return;
      gpsButton.disabled=false;
      const {longitude,latitude,accuracy}=position.coords;
      setPin([longitude,latitude],'Device pin · estimated accuracy '+Math.round(accuracy)+' m');
    },()=>{
      if (request!==gpsRequest || !viewport.isConnected) return;
      gpsButton.disabled=false;
      status.textContent='Device location was unavailable. Use the coordinate fields or place a pin on the map.';
    },{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  };
  clearButton.onclick=()=>{
    gpsRequest++;
    gpsButton.disabled=false;
    pin=undefined;
    delete pinState.position;
    delete pinState.label;
    clearButton.hidden=true;
    links.hidden=true;
    links.querySelectorAll('a').forEach(anchor=>anchor.removeAttribute('href'));
    form.reset();
    setPinMode(false);
    status.textContent='Reference pin cleared.';
    fit([]);
  };
  form.onsubmit=event=>{
    event.preventDefault();
    setPin([form.elements.lon.valueAsNumber,form.elements.lat.valueAsNumber],'Coordinate pin');
  };
  canvas.onpointerdown=event=>{
    if (!event.isPrimary || event.button!==0) return;
    start=[event.clientX,event.clientY];
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointercancel=()=>{start=undefined;};
  canvas.onpointerup=event=>{
    if (!start) return;
    const delta=[start[0]-event.clientX,start[1]-event.clientY];
    start=undefined;
    if (Math.hypot(...delta)>=5) {pan(...delta);return;}
    if (!pinMode) return;
    const rect=viewport.getBoundingClientRect();
    const [cx,cy]=projectPosition(center,zoom);
    const [lon,lat]=unprojectPosition([event.clientX-rect.left+cx-rect.width/2,event.clientY-rect.top+cy-rect.height/2],zoom);
    setPin([wrapLongitude(lon),lat],'Map pin');
  };
  canvas.onkeydown=event=>{
    const moves={ArrowLeft:[-90,0],ArrowRight:[90,0],ArrowUp:[0,-90],ArrowDown:[0,90]};
    if (Object.hasOwn(moves,event.key)) pan(...moves[event.key]);
    else if (['+','=','-'].includes(event.key)) changeZoom(event.key==='-'?-1:1);
    else return;
    event.preventDefault();
  };
  downloadButton.onclick=()=>{
    const featureCollection={type:'FeatureCollection',features:matchingFeatures.map(feature=>({
      type:'Feature',geometry:feature.geometry,properties:{
        id:String(feature.properties.id),plot:String(feature.properties.kide??''),match:matched(feature)
      }
    }))};
    download('matched-parcels.geojson',JSON.stringify(featureCollection),'application/geo+json');
  };
  if (validPosition(pinState.position)) setPin(pinState.position,pinState.label??'Reference pin');
  else fit();
  return ()=>observer.disconnect();
}
