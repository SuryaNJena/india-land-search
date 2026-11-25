import assert from 'node:assert/strict';
import test from 'node:test';
import {makeBhulekhReader,makeBhunakshaLayerReader,makeBhunakshaLocationReader,makeBhunakshaPlotReader,
  makeBhunakshaReader,makeLandReviewWorker} from '../worker/odisha.mjs';

const place={id:'4-1-1-1',districtCode:'4',tehsilCode:'1',villageCode:'1',riCode:'1'};
const gis='04010100101', origin='https://example.test';
const post=(path,body)=>new Request(origin+'/api/odisha/'+path,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)
});
const viewerPlot={has_data:'Y',ID:'fixture-parcel',gisCode:gis,plotNo:'58',info:'Fixture info'};
const extent=(bounds)=>Object.fromEntries([['gisCode',gis],...['xmin','ymin','xmax','ymax'].map((k,i)=>[k,bounds[i]])]);

test('standalone cadastral directory follows the official master and district RI hierarchy',async()=>{
  const calls=[];
  const reader=makeBhunakshaLocationReader(async (url,options)=>{
    calls.push({url,options});
    if (url.pathname==='/') return new Response('<select id="drpdistict"><option>Choose</option><option value="4">Dhenkanal</option></select>');
    return new Response('<select id="level_3"><option value="42">Wrong</option></select><select name="level_4"><option value="0">Select</option><option value="01">1 &nbsp; Fixture <b>village</b></option></select>');
  });
  const site=makeLandReviewWorker({assets:{},readMapLocations:reader});
  assert.deepEqual(await (await site.fetch(post('map-locations',{location:''}))).json(),{options:[{code:'4',label:'Dhenkanal'}]});
  const result=await (await site.fetch(post('map-locations',{location:'4-1-1'}))).json();
  assert.deepEqual(result,{options:[{code:'1',label:'Fixture village'}]});
  assert.deepEqual(await (await site.fetch(post('map-locations',{location:'4-1-1'}))).json(),result);
  assert.equal(calls.length,2);
  assert.equal(calls[1].url.origin,'https://bhunakshaodisha.nic.in:8443');
  assert.deepEqual(Object.fromEntries(calls[1].options.body),{OP:'2',state:'21',level:'4',selections:'4,1,1'});
  assert.equal((await site.fetch(post('map-locations',{location:'4-1-1-1'}))).status,400);
});

test('cadastral directory returns plain labels after decoding official option text',async()=>{
  const reader=makeBhunakshaLocationReader(async ()=>new Response('<select id="drpdistict">'+
    '<option value="4">Dhenkanal &amp; nearby</option><option value="5">&lt;note&gt;Do not show&lt;/note&gt;</option>'+
    '<option value="6"><em>District</em> <strong>six</strong></option></select>'));
  assert.deepEqual(await reader([]),{options:[{code:'4',label:'Dhenkanal & nearby'},
    {code:'5',label:'5'},{code:'6',label:'District six'}]});
});

test('an exact plot number uses one assigned OP=5 response and verifies sheet and plot identity',async()=>{
  const calls=[];
  const readPlot=makeBhunakshaPlotReader(async (url,options)=>{
    calls.push({url,options});
    return Response.json(viewerPlot);
  });
  const site=makeLandReviewWorker({assets:{},readPlot});
  const result=await site.fetch(post('maps',{location:place.id,sheet:'01',parcel:{number:'58'}}));
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{info:'Fixture info',area:'',khata:'',front:'',back:'',id:'fixture-parcel',number:'58'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].url.origin,'https://bhunakshaodisha.nic.in:8443');
  assert.deepEqual(Object.fromEntries(calls[0].url.searchParams),{OP:'5',state:'21',levels:'4,1,1,1,01,',plotno:'58'});
  const wrong=makeBhunakshaPlotReader(async ()=>Response.json({...viewerPlot,gisCode:'04010100102'}));
  await assert.rejects(wrong(place,'01',{number:'58'}),/verify the selected parcel/);
});

test('native WMS themes stay separate from geographic placement',async()=>{
  const calls=[];
  const readMapLayers=makeBhunakshaLayerReader(async (url,options)=>{
    calls.push(options.body);
    if (url.pathname.endsWith('getVVVVExtentGeoref')) {
      return Response.json(extent(options.body.get('srs')==='0'?[964,816,1811,1618]:[null,null,null,null]));
    }
    const type=options.body.get('layerType');
    return type==='TABLE_THEMES'?Response.json([{id:'theme-1',layerType:type,layerDescription:'Fixture theme',sldRule:'ignored'}])
      :new Response(null,{status:204});
  });
  const site=makeLandReviewWorker({assets:{},readMapLayers});
  const result=await (await site.fetch(post('maps',{location:place.id,sheet:'01',layers:true}))).json();
  assert.equal(result.geographicRaster,undefined);
  assert.deepEqual(result.bounds,[964,816,1811,1618]);
  assert.equal(new URL(result.nativeRaster).searchParams.get('LAYERS'),'VILLAGE_MAP');
  const [{label,kind,url}]=result.layers;
  assert.equal(label,'Fixture theme');
  assert.equal(kind,'theme');
  assert.equal(new URL(url).searchParams.get('theme_codes'),'theme-1,');
  assert.equal(new URL(url).searchParams.get('BBOX'),'964,816,1811,1618');
  assert.equal(calls[0].get('gisLevels'),'4,1,1,1,01,');
  assert.equal(calls[1].get('giscode'),gis);
  assert.equal(calls.length,5);
  assert.equal((await site.fetch(post('maps',{location:place.id,sheet:'',layers:true}))).status,400);
});

test('a geographic WMS raster uses Mercator only with a matching official extent',async()=>{
  const degrees=[85,20,85.01,20.01];
  const r=Math.PI/180, scale=6378137;
  const x=lon=>lon*r*scale, y=lat=>Math.asinh(Math.tan(lat*r))*scale;
  const projected=[x(degrees[0]),y(degrees[1]),x(degrees[2]),y(degrees[3])];
  for (const [mercator,projection] of [[projected,'EPSG:3857'],[[1,2,3,4],'EPSG:4326']]) {
    const reader=makeBhunakshaLayerReader(async (url,options)=>{
      const srs=options.body.get('srs');
      if (!srs) return new Response(null,{status:204});
      return Response.json(extent(srs==='0'?[964,816,1811,1618]:srs==='4326'?degrees:mercator));
    });
    const {geographicRaster}=await reader(place,'01');
    assert.equal(geographicRaster.projection,projection);
    assert.deepEqual(geographicRaster.bounds,degrees);
    const url=new URL(geographicRaster.url);
    assert.equal(url.searchParams.get('SRS'),projection);
    assert.equal(url.searchParams.get('BBOX'),(projection==='EPSG:3857'?projected:degrees).join(','));
    assert.equal(url.searchParams.has('CRS'),false);
  }
});

test('a geographic vector needs explicit WGS84 CRS and visibly valid Odisha polygons',async()=>{
  const features=[{properties:{id:'fixture',kide:'58',giscode:gis},
    geometry:{type:'Polygon',coordinates:[[[85,20],[85.01,20],[85.01,20.01],[85,20]]]}}];
  const crs={type:'name',properties:{name:'EPSG:4326'}};
  const layer=(fixture)=>makeBhunakshaReader(async ()=>Response.json(fixture))(place,'01');
  assert.equal((await layer({features})).geographic,undefined);
  assert.equal((await layer({features,crs})).geographic.features[0].properties.id,'fixture');
  const invalid=structuredClone(features);
  invalid[0].geometry.coordinates[0][0]=[901,802];
  assert.equal((await layer({features:invalid,crs})).geographic,undefined);
});

test('BhuNaksha refreshes an expired public session once and never retries a denial',async()=>{
  const calls=[];
  const readPlot=makeBhunakshaPlotReader(async (url,options)=>{
    calls.push({url,options});
    if (calls.length===1) return new Response('Session expired',{status:440});
    if (calls.length===2) return new Response('Map viewer',{headers:{'Set-Cookie':'JSESSIONID=fixture; HttpOnly'}});
    return Response.json(viewerPlot);
  });
  assert.equal((await readPlot(place,'01',{number:'58'})).id,'fixture-parcel');
  assert.equal(calls.length,3);
  assert.equal(calls[1].url.pathname,'/bhunaksha/');
  assert.equal(calls[2].options.headers.cookie,'JSESSIONID=fixture');
  let deniedCalls=0;
  const denied=makeBhunakshaPlotReader(async ()=>{
    deniedCalls++;
    return new Response('Session expired',{status:403});
  });
  await assert.rejects(denied(place,'01',{id:'fixture-parcel',number:'58'}),{status:403});
  assert.equal(deniedCalls,1);
});

test('Bhulekh restarts only an explicit mid-flow expiry and drops the old cookie',async()=>{
  const calls=[];
  const prefix='ctl00$ContentPlaceHolder1$';
  const form=(selector,label)=>new Response('<input type="hidden" name="__VIEWSTATE" value="f"><select name="'+prefix+selector+'"><option value="4">'+label+'</option></select>',
    {headers:{'Set-Cookie':'ASP.NET_SessionId='+label+'; HttpOnly'}});
  const read=makeBhulekhReader(async (url,options)=>{
    calls.push({url,options});
    return [()=>form('ddlDistrict','old'),()=>new Response(null,{status:302,headers:{Location:'/BhulekhError.aspx'}}),
      ()=>new Response('You have been timed out of the website.'),()=>form('ddlDistrict','fresh'),
      ()=>form('ddlTahsil','tehsil')][calls.length-1]();
  },async()=>{});
  assert.deepEqual(await read({districtCode:'4'},{directory:true}),{level:'tehsil',options:[{code:'4',label:'tehsil'}]});
  assert.equal(calls[1].options.headers.get('cookie'),'ASP.NET_SessionId=old');
  assert.equal(calls[3].options.headers.get('cookie'),null);
  assert.equal(calls[4].options.headers.get('cookie'),'ASP.NET_SessionId=fresh');
});
