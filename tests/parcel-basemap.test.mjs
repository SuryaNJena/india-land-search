import assert from 'node:assert/strict';
import test from 'node:test';
import {fitViewport,locationLinks,projectPosition,tilesForViewport,unprojectPosition,wgs84Parcels} from '../dist/parcel-basemap.mjs';

const outline=[[86.5,20.4],[86.501,20.4],[86.5,20.401],[86.5,20.4]];
const parcel=(ring=outline)=>({type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{id:'15',kide:'10'}});

test('Only verified geographic parcel payloads activate the geographic overlay',()=>{
  assert.deepEqual(wgs84Parcels({features:[parcel()]}),[]);
  assert.deepEqual(wgs84Parcels({source:'Fixture with verified WGS84 source',features:[
    parcel(), parcel([[1000,20],[1001,20],[1000,21],[1000,20]]), parcel([...outline.slice(0,-1),[85,20]])
  ]}),[parcel()]);
});

test('Web Mercator round trips an Odisha reference pin and fits a small parcel',()=>{
  const position=[86.499123,20.400321];
  const roundTrip=unprojectPosition(projectPosition(position,17),17);
  roundTrip.forEach((value,i)=>assert.ok(Math.abs(value-position[i])<1e-8));
  const viewport=fitViewport([86.5,20.4,86.501,20.401],640,380);
  assert.ok(viewport.zoom>=17 && viewport.zoom<=19);
  assert.ok(viewport.center[0]>86.5 && viewport.center[0]<86.501);
  assert.ok(viewport.center[1]>20.4 && viewport.center[1]<20.401);
});

test('Visible tiles wrap longitude only and keep all tile requests on the tile grid',()=>{
  const tiles=tilesForViewport([179.9,20.4],2,640,380);
  assert.ok(tiles.length>1);
  assert.ok(tiles.some(tile=>tile.x===0 && tile.column===4));
  tiles.forEach(({x,y,z})=>assert.ok(x>=0 && y>=0 && x<2**z && y<2**z));
});

test('Map provider URLs respect latitude and longitude order and reject bad pins',()=>{
  const links=locationLinks([86.5,20.4]);
  const google=new URL(links.google),osm=new URL(links.osm);
  assert.equal(google.searchParams.get('query'),'20.400000,86.500000');
  assert.equal(osm.searchParams.get('mlat'),'20.400000');
  assert.equal(osm.searchParams.get('mlon'),'86.500000');
  assert.equal(locationLinks([500,20]),null);
  assert.equal(locationLinks([null,20]),null);
});
