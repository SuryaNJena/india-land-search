export const normalize = value => String(value ?? '').normalize('NFC').replace(/[\u200c\u200d]/gu, '').trim().replace(/\s+/gu, ' ').toLowerCase();
export const parcelKey = row => `${row.gis}/${row.id}`;
export const liveNameLimit = 1000;
const edge = '[\\p{L}\\p{M}\\p{N}]';
const esc = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compile = values => [...new Map(values.map(x => [normalize(x), x]).filter(([key]) => key)).entries()]
  .map(([key, value]) => [value, new RegExp(`(?<!${edge})${esc(key)}(?!${edge})`, 'u')]);

function matchTerms(values) {
  const patterns = compile(values);
  const prefilter = patterns.length>12 ? new RegExp(`(?<!${edge})(?:${patterns.map(([name])=>esc(normalize(name))).join('|')})(?!${edge})`,'u') : null;
  return source => source && (!prefilter || prefilter.test(source)) ? patterns.filter(([,pattern])=>pattern.test(source)).map(([name])=>name) : [];
}

export function countObservedNames(rows, names) {
  const match = matchTerms(names);
  const counts = new Map();
  for (const row of rows) {
    if (row.status !== 'Retrieved') continue;
    for (const name of match(normalize(row.info))) counts.set(name,(counts.get(name) ?? 0)+1);
  }
  return new Map(names.filter(name=>counts.has(name)).map(name=>[name,counts.get(name)]));
}

export function extractCaste(info, groups) {
  const values = [...String(info ?? '').matchAll(/ଜା\s*[:ଃ]\s*/gu)].map(match => info.slice(match.index + match[0].length)
    .split(/[,;।\n]|\s+ବା\s*[:ଃ]|\s+ଜା\s*[:ଃ]|\s+କିସ୍ମତ/u)[0].trim()).filter(Boolean);
  const raw = [...new Set(values)];
  const labels = raw.map(normalize);
  const aliases = new Map((groups ?? []).flatMap(group => group.aliases.map(alias => [normalize(alias), group.label])));
  const matched = labels.map(label => aliases.get(label));
  const compound = labels.some(label => [...aliases.keys()].some(alias => label.startsWith(`${alias} `)));
  const status = !raw.length ? 'Missing' : matched.every(Boolean) ? 'Matches supplied caste labels' : matched.some(Boolean) || compound ? 'Mixed / review' : 'Does not match supplied caste labels';
  return { raw: raw.join('; '), status, groups: [...new Set(matched.filter(Boolean))].join('; ') };
}

export function matchRows(rows, rules) {
  const surname = matchTerms(rules.surnames ?? []);
  const full = matchTerms(rules.names ?? []);
  return rows.map(row => {
    const source = row.status === 'Retrieved' ? normalize(row.info) : '';
    const surnameHits = surname(source);
    const fullHits = full(source);
    const caste = extractCaste(row.info, rules.caste ?? []);
    const eligible = !rules.useCaste || caste.status === 'Matches supplied caste labels';
    return { surname: surnameHits, full: fullHits, caste, surnameSelected: eligible && !!surnameHits.length,
      fullSelected: eligible && !!fullHits.length, level: eligible && fullHits.length ? 'full' : eligible && surnameHits.length ? 'surname' : row.status === 'Retrieved' ? 'none' : 'missing' };
  });
}

export function validateWorkspace(data) {
  if (!data || !Array.isArray(data.rows) || !data.rows.length || data.rows.length > 100000) throw Error('Expected between 1 and 100,000 plot records.');
  const keys = new Set();
  for (const row of data.rows) {
    if (!row || typeof row.gis !== 'string' || typeof row.id !== 'string' || !row.gis || !row.id || typeof row.info !== 'string') throw Error('Each row needs a map code, parcel ID and source text field.');
    const key = parcelKey(row);
    if (keys.has(key)) throw Error(`Duplicate parcel identity: ${key}`);
    keys.add(key);
  }
  if (!data.rules || !['surnames', 'names'].every(key => Array.isArray(data.rules[key]) && data.rules[key].every(x => typeof x === 'string'))) throw Error('Invalid matching rules.');
  if (data.rules.caste && (!Array.isArray(data.rules.caste) || !data.rules.caste.every(group => typeof group?.label === 'string' && Array.isArray(group.aliases) && group.aliases.every(x => typeof x === 'string')))) throw Error('Invalid caste label list.');
  if (!Array.isArray(data.summary)) data.summary = [];
  return data;
}

export function safeURL(value) {
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}

export const sourceCaste = [
  {label:'ଖଣ୍ଡାୟତ', aliases:['ଖଣ୍ଡାୟତ','ଖଣ୍ଡାଏତ','ଖଣ୍ଡାଇତ']},
  {label:'ମହାଲାଏକ', aliases:['ମହାଲାଏକ','ମହାଲାୟକ','ମହାଲାଇକ']}
];

const devanagari = ['अआइईउऊएऐओऔ','ा ि ी ु ू े ै ो ौ','कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह','्'];
const odia = ['ଅଆଇଈଉଊଏଐଓଔ','ା ି ୀ ୁ ୂ େ ୈ ୋ ୌ','କଖଗଘଙଚଛଜଝଞଟଠଡଢଣତଥଦଧନପଫବଭମଯରଲୱଶଷସହ','୍'];
const bengali = ['অআইঈউঊএঐওঔ','া ি ী ু ূ ে ৈ ো ৌ','কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলবশষসহ','্'];
const telugu = ['అఆఇఈఉఊఏఐఓఔ','ా ి ీ ు ూ ే ై ో ౌ','కఖగఘఙచఛజఝఞటఠడఢణతథదధనపఫబభమయరలవశషసహ','్'];
const langs = { or:odia, hi:devanagari, mr:devanagari, bn:bengali, te:telugu };
const vowels = 'a aa i ee u oo e ai o au'.split(' ');
const consonants = 'k kh g gh ng ch chh j jh ny tt tth dd ddh nn t th d dh n p ph b bh m y r l w sh ss s h'.split(' ');
const tokens = [...new Set([...vowels,...consonants,'v','f','c'])].sort((a,b) => b.length-a.length);

function phonetic(word, language) {
  const languageRules = langs[language];
  if (!languageRules || !/^[a-z]+$/u.test(word)) return '';
  const [base, marks, letters, halant] = languageRules;
  let output = '', pending = false;
  for (let i = 0; i < word.length;) {
    const token = tokens.find(item => word.startsWith(item,i));
    if (!token) return '';
    i += token.length;
    const vowel = vowels.indexOf(token);
    if (vowel >= 0) {
      output += pending ? vowel ? marks.split(' ')[vowel-1] : '' : base[vowel];
      pending = false;
    } else {
      const letter = {v:'w',f:'ph',c:'k'}[token] ?? token;
      output += (pending ? halant : '') + letters[consonants.indexOf(letter)];
      pending = true;
    }
  }
  return output;
}

export function suggestSurname(input, language, observed = []) {
  const name = normalize(input);
  const dictionary = { or: {jena:['ଜେନା','ଯେନା'], yena:['ଯେନା','ଜେନା'], sahu:['ସାହୁ'], mohanty:['ମହାନ୍ତି','ମହାନ୍ତୀ'], nayak:['ନାୟକ']}, hi:{singh:['सिंह'], sharma:['शर्मा'], yadav:['यादव']}, mr:{patil:['पाटील']}, bn:{das:['দাস'], ghosh:['ঘোষ']}, te:{reddy:['రెడ్డి'], naidu:['నాయుడు']} };
  if (!name) return [];
  const known = dictionary[language]?.[name] ?? [];
  const proposed = /^[a-z]+$/u.test(name) ? phonetic(name, language) : name;
  const result = new Map();
  for (const variant of known) result.set(variant, 'Curated spelling');
  if (proposed && !result.has(proposed)) result.set(proposed, /^[a-z]+$/u.test(name) ? 'Phonetic suggestion' : 'Entered spelling');
  for (const [variant, count] of observed) if (result.has(variant)) result.set(variant, `${result.get(variant)} · observed in ${count} records`);
  return [...result].map(([variant, source]) => ({variant, source}));
}
