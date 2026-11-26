export function plotNumber(value) {
  return String(value??'').normalize('NFKC')
    .replace(/[\u0b66-\u0b6f]/gu,digit=>String(digit.charCodeAt(0)-0x0b66))
    .replace(/[\s\u200c\u200d]/gu,'');
}

export function sheetHighlights(sheet, numbers, verified = new Set()) {
  const targets=new Set([...numbers].map(plotNumber).filter(Boolean));
  return new Map(sheet.features
    .filter(feature=>targets.has(plotNumber(feature.properties?.kide)) || verified.has(`${sheet.gis}/${feature.properties?.id}`))
    .map(feature=>{
      const key=`${sheet.gis}/${feature.properties.id}`;
      return [key,{level:verified.has(key)?'full':'holding'}];
    }));
}

export function localMapLayer(file, sheet) {
  if (file?.type!=='FeatureCollection' || !Array.isArray(file.features) || file.features.length>10000) {
    throw Error('Choose a WGS84 GeoJSON FeatureCollection with up to 10,000 parcels.');
  }
  if (file.crs && !['urn:ogc:def:crs:OGC:1.3:CRS84','EPSG:4326','urn:ogc:def:crs:EPSG::4326']
    .includes(file.crs.properties?.name)) throw Error('The GeoJSON must use WGS84 longitude and latitude.');
  const parcelById=new Map(sheet.features.map(feature=>[String(feature.properties.id),feature.properties]));
  const positions=new Map();
  for (const parcel of parcelById.values()) {
    const number=plotNumber(parcel.kide);
    if (!number) continue;
    positions.set(number,positions.has(number)?null:parcel);
  }
  const point=xy=>Array.isArray(xy) && xy.length>=2 && Number.isFinite(xy[0]) && Number.isFinite(xy[1]) &&
    xy[0]>=81 && xy[0]<=89 && xy[1]>=17 && xy[1]<=24;
  const ring=points=>Array.isArray(points) && points.length>=4 && points.every(point) &&
    points[0][0]===points.at(-1)[0] && points[0][1]===points.at(-1)[1];
  const polygon=rings=>Array.isArray(rings) && rings.length>0 && rings.every(ring);
  const features=[];
  const used=new Set();
  for (const feature of file.features) {
    const props=feature?.properties;
    if (String(props?.giscode??'').padStart(11,'0')!==sheet.gis) continue;
    const exact=parcelById.get(String(props.id??''));
    const parcel=exact??positions.get(plotNumber(props.kide));
    if (!parcel || props.kide!=null && plotNumber(props.kide)!==plotNumber(parcel.kide) || used.has(parcel.id)) continue;
    const {type,coordinates}=feature.geometry??{};
    if (!(type==='Polygon' && polygon(coordinates) ||
      type==='MultiPolygon' && Array.isArray(coordinates) && coordinates.length>0 && coordinates.every(polygon))) continue;
    used.add(parcel.id);
    features.push({type:'Feature',properties:{id:String(parcel.id),kide:String(parcel.kide??'')},geometry:{type,coordinates}});
  }
  if (!features.length) throw Error('No geographic parcels in that file match the current sheet and its plot identifiers.');
  return {source:'Your WGS84 file · geographic alignment supplied by you',features};
}
