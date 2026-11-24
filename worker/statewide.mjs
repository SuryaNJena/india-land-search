// SQLite FTS words are ASCII-encoded so Odia combining marks stay inside each word.
export function indexWords(value) {
  const words = String(value ?? '').normalize('NFC').toLowerCase().replace(/[\u200c\u200d]/gu,'').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return words.map(word=>'x'+[...word].map(letter=>letter.codePointAt(0).toString(16).padStart(6,'0')).join('')).join(' ');
}

export async function readStatewideIndex(db, {names, location='', offset=0}) {
  const terms = [...new Map(names.map(name=>[indexWords(name),name]).filter(([words])=>words))];
  if (!terms.length) return {invalid:true};
  if (!db) return null;
  const version = await db.prepare('SELECT version, source, captured, expected, scanned, statewide FROM landreview_active WHERE id=1').first();
  if (!version) return null;
  const limit=30;
  const query = terms.map(([phrase])=>`"${phrase}"`).join(' OR ');
  const {results} = await db.prepare(`
    SELECT h.id, h.tenant, h.khata, h.plots, v.code, v.district, v.tehsil, v.village, v.ri
      FROM landreview_names n JOIN landreview_holdings h ON h.id=n.rowid
      JOIN landreview_villages v ON v.version=h.version AND v.code=h.village
     WHERE landreview_names MATCH ? AND h.version=? AND (?='' OR v.code=?)
     ORDER BY h.id LIMIT ? OFFSET ?`
  ).bind(query,version.version,location,location,limit+1,offset).all();
  const selected = location ? await db.prepare('SELECT code FROM landreview_villages WHERE version=? AND code=?').bind(version.version,location).first() : null;
  return {
    coverage:{source:version.source,captured:version.captured,scanned:version.scanned,expected:version.expected,
      complete:location ? Boolean(selected) : Boolean(version.statewide) && version.scanned===version.expected},
    next:results.length>limit ? offset+limit:null,
    hits:results.slice(0,limit).map(row=>{
      const [districtCode,tehsilCode,villageCode] = row.code.split('-');
      const value = ' '+indexWords(row.tenant)+' ';
      return {tenant:row.tenant,khata:row.khata,matched:terms.filter(([words])=>value.includes(' '+words+' ')).map(([,name])=>name),
        plots:JSON.parse(row.plots),location:{id:row.code,districtCode,tehsilCode,villageCode,district:row.district,tehsil:row.tehsil,village:row.village,riCode:row.ri}};
    })
  };
}
