import { parcelKey } from './core.mjs';

export const colours = { full:'#b9a4e8', surname:'#f3bf5f', none:'#e4ebe6', missing:'#ffffff' };
const rings = feature => feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates.flat() : [];

function fit(features,width,height,pad) {
  const bounds = [Infinity,Infinity,-Infinity,-Infinity];
  for (const feature of features) for (const ring of rings(feature)) for (const [x,y] of ring) {
    bounds[0]=Math.min(bounds[0],x); bounds[1]=Math.min(bounds[1],y); bounds[2]=Math.max(bounds[2],x); bounds[3]=Math.max(bounds[3],y);
  }
  if (!bounds.every(Number.isFinite)) return null;
  const [x0,y0,x1,y1] = bounds, dx=x1-x0 || 1, dy=y1-y0 || 1;
  const scale = Math.min((width-2*pad)/dx,(height-2*pad)/dy);
  return ([x,y]) => [(width-dx*scale)/2+(x-x0)*scale,(height-dy*scale)/2+(y1-y)*scale];
}

const keyOf = (feature,gis) => parcelKey({gis,id:feature.properties?.id});
export function drawMap(canvas, features, gis, result, options={}) {
  const ctx = canvas.getContext('2d'), {width,height} = canvas;
  ctx.clearRect(0,0,width,height);
  const project = fit(features,width,height,24);
  if (!project) return [];
  const hits=[];
  ctx.lineWidth=1.3;
  ctx.font='11px system-ui'; ctx.textAlign='center';
  for (const feature of features) {
    const path=new Path2D(); let firstRing;
    for (const ring of rings(feature)) {
      const points=ring.map(project); if (points.length < 3) continue;
      firstRing ??= points;
      path.moveTo(...points[0]); for (const p of points.slice(1)) path.lineTo(...p); path.closePath();
    }
    if (!firstRing) continue;
    const key=keyOf(feature,gis);
    ctx.fillStyle=options.plain ? '#fff' : colours[result.get(key)?.level ?? 'missing']; ctx.fill(path,'evenodd');
    ctx.strokeStyle='#64796c'; ctx.stroke(path);
    if (options.labels) {
      const [x,y]=firstRing.reduce(([x,y],p)=>[x+p[0]/firstRing.length,y+p[1]/firstRing.length],[0,0]);
      if (ctx.isPointInPath(path,x,y,'evenodd')) {ctx.fillStyle='#233d34';ctx.fillText(feature.properties?.kide ?? '',x,y);}
    }
    hits.push({path,key});
  }
  const selected=options.selected && hits.find(hit=>hit.key===options.selected);
  if (selected) { ctx.lineWidth=3; ctx.strokeStyle='#0f5344'; ctx.stroke(selected.path); }
  return hits;
}

export async function makeMapPDF(sheets,geometry,results,plain) {
  const {PDFDocument, StandardFonts, rgb} = globalThis.PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const colour = value => rgb(...value.slice(1).match(/../g).map(x=>parseInt(x,16)/255));
  const text = s => String(s ?? '').replace(/[^\x20-\x7e]/g,'').slice(0,100);
  for (const sheet of sheets) {
    const features = geometry[sheet.gis]?.features ?? [];
    if (!features.length) continue;
    const page = doc.addPage([842,1191]);
    page.drawText(text(`${sheet.name} ${sheet.village} | Sheet ${sheet.sheet}`),{x:39,y:1134,size:23,font:bold,color:colour('#193b30')});
    page.drawText(`${features.length} mapped plot entries | ${plain?'Uncoloured overview':'Name and source criteria overview'}`,{x:40,y:1109,size:11,font});
    if (!plain) Object.entries({full:'Specific name',surname:'Surname',none:'Not selected',missing:'Missing info'}).forEach(([key,label],i)=>{
      const x=40+i*154;
      page.drawRectangle({x,y:1083,width:11,height:11,color:colour(colours[key]),borderWidth:.5,borderColor:colour('#64796c')});
      page.drawText(label,{x:x+17,y:1084,size:9,font});
    });
    const project=fit(features,842,990,38);
    for (const feature of features) {
      const paths=rings(feature).map(r=>r.map(project)).filter(r=>r.length>2);
      const path=paths.map(r=>r.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')+' Z').join(' ');
      if (!path) continue;
      const result=results.get(keyOf(feature,sheet.gis));
      page.drawSvgPath(path,{x:0,y:1058,color:plain?rgb(1,1,1):colour(colours[result?.level??'missing']),borderWidth:.45,borderColor:colour('#64796c')});
      const ring=paths[0], centre=ring.reduce(([x,y],p)=>[x+p[0]/ring.length,y+p[1]/ring.length],[0,0]);
      const label=text(feature.properties?.kide);
      if(label) page.drawText(label,{x:centre[0]-font.widthOfTextAtSize(label,6)/2,y:1058-centre[1],size:6,font,color:colour('#243c33')});
    }
    page.drawText('LandReview | Source cadastral geometry | Local sheet coordinates | Review copy',{x:40,y:35,size:9,font});
  }
  if (!doc.getPageCount()) throw Error('This workspace has no importable map geometry.');
  return doc.save();
}
