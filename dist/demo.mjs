import {parcelKey} from './core.mjs';
import {mergeROR} from './files.mjs';

export const demoPlace = {
  id:'DEMO', state:'Odisha', district:'Cuttack', tehsil:'Mahanga', ri:'Kurujanga',
  village:'Anandapur Sample', local:'ଆନନ୍ଦପୁର ନମୁନା', aliases:['Demo village']
};
export const demoNames = ['ଆଶା ଜେନା','ଗୋପାଳ ଯେନା'];

export function makeDemoWorkspace() {
  const gis='DEMO-01';
  const people=[demoNames[0],demoNames[1],'ମାୟା ଜେନା','କିରଣ ସାହୁ','ନିଳା ଜେନା','ଦୀପ ନାୟକ','',demoNames[0]];
  const features=[],rows=[];
  const vertices=Array.from({length:5},(_,x)=>Array.from({length:4},(_,y)=>[x*59+y*4+((x+y)%3)*9,y*53+x*2+((x*3+y)%4)*7]));
  for(let x=0;x<4;x++) for(let y=0;y<3;y++) {
    const i=rows.length, id=String(101+i);
    const ring=[vertices[x][y],vertices[x+1][y],vertices[x+1][y+1],vertices[x][y+1],vertices[x][y]];
    const info=people[i%people.length];
    const khata=i===0 || i===7 ? '9' : i===1 || i===9 ? '10' : i===8 ? '9' : String(11+i);
    features.push({type:'Feature',properties:{id,kide:id},geometry:{type:'Polygon',coordinates:[ring]}});
    rows.push({id,gis,plot:id,village:demoPlace.village,village_code:demoPlace.id,district:demoPlace.district,tehsil:demoPlace.tehsil,ri:demoPlace.ri,
      sheet:'01',khata,info,status:info?'Retrieved':'No plot information',confirmed:'Unreviewed'});
  }
  return {title:'Fictional Odisha demo',demo:true,state:demoPlace.state,rows,
    summary:[{gis,name:demoPlace.village,sheet:'01',village:demoPlace.id,count:rows.length,demo:true}],
    geometry:{[gis]:{features}},pdfs:{},rules:{surnames:['ଜେନା','ଯେନା'],names:[...demoNames],useCaste:false,caste:[]}};
}

export async function loadDemoWorkspace() {
  const workspace=makeDemoWorkspace();
  const {PDFDocument,StandardFonts,rgb}=globalThis.PDFLib;
  for (const khata of ['9','10']) {
    const rows=workspace.rows.filter(row=>row.khata===khata);
    const files=[];
    for (const side of ['Front','Back']) {
      const document=await PDFDocument.create();
      const page=document.addPage([595,842]);
      const bold=await document.embedFont(StandardFonts.HelveticaBold);
      const font=await document.embedFont(StandardFonts.Helvetica);
      page.drawRectangle({x:40,y:744,width:515,height:58,color:rgb(.94,.9,.98)});
      page.drawText('FICTIONAL EXAMPLE - NOT AN OFFICIAL RECORD',{x:53,y:770,size:14,font:bold,color:rgb(.31,.19,.44)});
      page.drawText(`Sample Record of Rights | Khata ${khata} | ${side}`,{x:48,y:705,size:18,font:bold});
      const lines=side==='Front' ? [demoPlace.village,`Example holder: ${khata==='9'?'Asha Jena':'Gopal Yena'}`]
        : ['Example plot schedule',`Plots: ${rows.map(row=>row.plot).join(', ')}`];
      lines.forEach((line,i)=>page.drawText(line,{x:48,y:662-i*27,size:14,font}));
      page.drawText('India Land Search demonstration. All names, plots, and holdings on this page are fictional.',{x:48,y:48,size:10,font});
      files.push(new Blob([await document.save()],{type:'application/pdf'}));
    }
    workspace.pdfs[parcelKey(rows[0])]={name:`LandReview_Demo_Khata_${khata}.pdf`,bytes:await mergeROR(...files)};
  }
  return workspace;
}
