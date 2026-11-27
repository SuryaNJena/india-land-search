import {drawMap,newSheetView,panSheetView,parcelFocus,sheetProjection} from './maps.mjs';
import {plotNumber} from './sheet-overlays.mjs';
import {copyReport,holdingFields} from './live-ror.mjs';
import {readPublicReport,sheetGIS} from './odisha-lookup-source.mjs';

export function plotOnSheet(geometry,expectedGIS,number,id){
  if(geometry?.gis!==expectedGIS)return;
  const matches=geometry.features.filter(feature=>plotNumber(feature.properties.kide)===number);
  const exact=id && geometry.features.find(feature=>String(feature.properties.id)===String(id));
  if(exact)return matches.includes(exact)?exact:undefined;
  if(matches.length===1)return matches[0];
}

export async function mountPlotPreview(panel,{place,sheet,number,data,loadSheet}){
  const state=panel.querySelector('[data-preview-status]'), frame=panel.querySelector('.map-frame');
  try {
    const geometry=await loadSheet();
    if(!panel.isConnected)return;
    const feature=plotOnSheet(geometry,sheetGIS(place,sheet),number,data.id);
    if(!feature){state.textContent='This plot could not be placed on the available sheet.';return;}
    const canvas=frame.querySelector('canvas'), projection=sheetProjection(geometry.features,canvas);
    if(!projection){state.textContent='BhuNaksha supplied no drawable parcels on this sheet.';return;}
    const button=panel.querySelector('[data-zoom-preview]');
    const {width,height}=canvas;
    const target=parcelFocus(feature,projection);
    const zoom=Math.max(1,Math.min(10,width*.5/target.width,height*.5/target.height));
    const fit=panSheetView({zoom,x:width/2-target.x*zoom,y:height/2-target.y*zoom},0,0,width,height);
    let focused=false;
    const draw=()=>drawMap(canvas,geometry.features,geometry.gis,new Map(),{
      project:projection,view:focused?fit:newSheetView(),selected:geometry.gis+'/'+feature.properties.id,selectionFill:true,plain:true
    });
    button.onclick=()=>{focused=!focused;button.textContent=focused?'Fit sheet':'Zoom to plot';draw();};
    canvas.setAttribute('aria-label','Cadastral sheet with plot '+number+' shaded');
    draw();frame.hidden=false;button.hidden=false;
    state.textContent=geometry.captured?'BhuNaksha sheet snapshot · '+geometry.captured:'BhuNaksha cadastral sheet';
  } catch(error) {
    if(panel.isConnected)state.textContent=error.message||'The cadastral sheet was unavailable.';
  }
}

export function mountHoldingPreview(root,{place,khata,side}){
  const status=root.querySelector('[data-holding-status]'), output=root.querySelector('[data-holding-output]');
  let controller, loaded=false;
  root.ontoggle=async()=>{
    if(!root.open){controller?.abort();return;}
    if(loaded || controller&&!controller.signal.aborted)return;
    const attempt=new AbortController();
    controller=attempt;status.textContent='Reading the linked Bhulekh record…';
    try{
      const html=await readPublicReport(place,khata,side,attempt.signal);
      if(!root.isConnected || attempt.signal.aborted)return;
      const fields=side==='front'?holdingFields(document,html,khata):[];
      if(fields.length){
        const list=document.createElement('dl');list.className='plot-facts';
        for(const [label,value] of fields){
          const field=document.createElement('div'),term=document.createElement('dt'),valueNode=document.createElement('dd');
          term.textContent=label;valueNode.textContent=value;field.append(term,valueNode);list.append(field);
        }
        output.replaceChildren(list);
      }else output.replaceChildren(copyReport(document,html,side));
      loaded=true;status.textContent='Official Bhulekh '+(side==='front'?'front':'back')+' page · Khata '+khata;
    }catch(error){
      if(!attempt.signal.aborted && root.isConnected)status.textContent=(error.message||'The official record was unavailable.')+' Open the official RoR link or close and reopen to retry.';
    }finally{if(controller===attempt)controller=undefined;}
  };
}
