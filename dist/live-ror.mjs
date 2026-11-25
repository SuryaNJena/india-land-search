const tags=new Set('TABLE THEAD TBODY TFOOT TR TD TH DIV P SPAN BR HR B STRONG I EM U H1 H2 H3 H4 H5 UL OL LI CENTER FONT'.split(' '));
const discard=new Set('SCRIPT STYLE IFRAME OBJECT INPUT BUTTON LINK IMG NOSCRIPT TEMPLATE SVG'.split(' '));

export function copyReport(doc, html, side) {
  const template=doc.createElement('template');
  template.innerHTML=html;
  const panel=template.content.querySelector('#ContentArea');
  if (!panel) throw Error('The official record page was unavailable.');
  const schedule=panel.querySelector('#gvRorBack');
  if (side==='back' && !schedule?.textContent.trim()) throw Error('The official plot schedule was unavailable.');
  if (side==='front') schedule?.remove();
  function copy(node) {
    if (node.nodeType===3) return doc.createTextNode(node.data);
    if (node.nodeType!==1 || discard.has(node.tagName)) return doc.createDocumentFragment();
    const result=tags.has(node.tagName) ? doc.createElement(node.tagName) : doc.createDocumentFragment();
    if (['TD','TH'].includes(node.tagName)) for (const field of ['rowspan','colspan']) {
      const value=node.getAttribute(field);
      if (/^[1-9]\d?$/.test(value??'')) result.setAttribute(field,value);
    }
    for (const child of node.childNodes) result.append(copy(child));
    return result;
  }
  return copy(side==='back'?schedule:panel);
}

async function hostedReport(hit,side) {
  const response=await fetch('/api/odisha/ror',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({location:hit.location.id,khata:hit.khata,side})});
  const result=await response.json();
  if (!response.ok) throw Error(result.error||'The official record could not be loaded.');
  return result.html;
}

export async function printHoldings(holdings,status,button,loadReport=hostedReport) {
  if (!holdings.length) return;
  if (holdings.length>20) {status.textContent='Select up to 20 khatas per PDF.';return;}
  const windowRef=window.open('','_blank');
  if (!windowRef) {status.textContent='Allow pop-ups to open the printable record.';return;}
  windowRef.opener=null;
  const doc=windowRef.document;
  doc.documentElement.lang='or';
  doc.title='India Land Search Records of Rights';
  const style=doc.createElement('style');
  style.textContent='@page{size:A4 landscape;margin:12mm}body{font:12px "Nirmala UI","Noto Sans Oriya",sans-serif;color:#111}section+section{break-before:page}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #555;padding:4px;overflow-wrap:anywhere}tr{break-inside:avoid}h1{font-size:16px}a{color:inherit}';
  doc.head.append(style);
  doc.body.textContent='Preparing the selected records…';
  const report=doc.createDocumentFragment();
  let active='';
  button.disabled=true;
  try {
    for (const hit of holdings) for (const side of ['front','back']) {
      active=`${hit.location.village}, khata ${hit.khata}, ${side}`;
      status.textContent=`Loading ${active}…`;
      const html=await loadReport(hit,side);
      const section=doc.createElement('section');
      const heading=doc.createElement('h1');
      heading.textContent=`${hit.location.village} · Khata ${hit.khata} · RoR ${side}`;
      const source=doc.createElement('a');
      source.href=hit[side];
      source.textContent='Official Bhulekh record';
      section.append(heading,source,copyReport(doc,html,side));
      report.append(section);
      if (loadReport===hostedReport) await new Promise(resolve=>setTimeout(resolve,1000));
    }
    doc.body.replaceChildren(report);
    await doc.fonts.ready;
    status.textContent='Choose Save as PDF to download every selected khata in one file.';
    windowRef.print();
  } catch (error) {
    windowRef.close();
    status.textContent=`Could not assemble the PDF for ${active}. ${error.message}`;
  } finally {
    button.disabled=false;
  }
}
