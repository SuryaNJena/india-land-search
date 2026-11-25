import assert from 'node:assert/strict';
import test from 'node:test';
import {officialMapBase,officialRoR} from '../dist/odisha-endpoints.mjs';
import {mapImageURL,plotLookup,readSavedPlot,reportPair} from '../dist/official-odisha.mjs';

const place={districtCode:'4',tehsilCode:'1',riCode:'1',villageCode:'1',sheet:'01'};

test('The master map host routes the selected sheet and serves only the requested WMS extent',()=>{
  assert.equal(officialMapBase('4'),'https://bhunakshaodisha.nic.in:8443/bhunaksha/');
  assert.equal(officialMapBase('3'),'https://app4bhunakshaodisha.nic.in:8443/bhunaksha/');
  const url=mapImageURL(place,[964,816,1811,1618]);
  assert.equal(url.searchParams.get('gis_code'),'04010100101');
  assert.equal(url.searchParams.get('LAYERS'),'VILLAGE_MAP');
  assert.equal(url.searchParams.get('BBOX'),'964,816,1811,1618');
  assert.equal(mapImageURL(place,[964,816,1811,1618],'parcel').searchParams.get('LAYERS'),'PLOT_LIST');
  assert.throws(()=>mapImageURL(place,[1,0,0,1]),/bounds/i);
});

test('Saved Plot Info must match the exact sheet and plot number',()=>{
  const url=plotLookup(place,'୫୮');
  assert.equal(url.searchParams.get('levels'),'4,1,1,1,01,');
  assert.equal(url.searchParams.get('plotno'),'58');
  const official=officialRoR(place,'12/3','front');
  const saved={has_data:'Y',ID:'parcel',gisCode:'04010100101',plotNo:'58',info:'Fixture',
    plotInfoLinks:'<a href="'+official.replaceAll('&','&amp;')+'">Report</a>'};
  assert.equal(readSavedPlot(saved,place,'୫୮').khata,'12/3');
  assert.throws(()=>readSavedPlot({...saved,plotNo:'58/2'},place,'58'),/does not match/i);
  assert.equal(readSavedPlot({...saved,plotInfoLinks:'<a href="https://different.example/?KhataNo=12">Fixture</a>'},place,'58').khata,'');
});

test('Bhulekh loads one known khata directly and stops on an upstream refusal',async()=>{
  const calls=[];
  const load=async(url,options)=>{
    calls.push([url.href,options.credentials]);
    return new Response('<div id="ContentArea"><table id="gvRorBack"></table></div>');
  };
  const reports=await reportPair(place,'12/3',load,()=>Promise.resolve());
  assert.deepEqual(calls,[[officialRoR(place,'12/3','front'),'omit'],[officialRoR(place,'12/3','back'),'omit']]);
  assert.match(reports.back,/gvRorBack/);
  let count=0;
  await assert.rejects(reportPair(place,'12',async()=>{
    count++; return new Response(null,{status:429});
  },()=>Promise.resolve()),/ask|wait/i);
  assert.equal(count,1);
});
