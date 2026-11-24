import {normalize,suggestSurname} from './core.mjs';

export const recordLanguages = {
  as:['Assamese','assamese'], bn:['Bengali','bengali'], gu:['Gujarati','gujarati'], hi:['Hindi','devanagari'],
  kn:['Kannada','kannada'], kok:['Konkani','devanagari'], ml:['Malayalam','malayalam'], mr:['Marathi','devanagari'],
  mni:['Meitei','manipuri'], ne:['Nepali','devanagari'], or:['Odia','oriya'], pa:['Punjabi','gurmukhi'],
  sat:['Santali','ol_chiki'], ta:['Tamil','tamil'], te:['Telugu','telugu'], ur:['Urdu','urdu']
};

// Suggested writing systems for search review, since a portal can contain several local languages.
const stateLanguages = {
  'Andaman and Nicobar Islands':['hi','bn','ta'], 'Andhra Pradesh':['te'], 'Arunachal Pradesh':['hi'], Assam:['as','bn'],
  Bihar:['hi','ur'], Chandigarh:['pa','hi'], Chhattisgarh:['hi'], 'Dadra and Nagar Haveli and Daman and Diu':['gu','mr'],
  Delhi:['hi','pa','ur'], Goa:['kok','mr'], Gujarat:['gu'], Haryana:['hi','pa'], 'Himachal Pradesh':['hi'],
  'Jammu and Kashmir':['ur','hi'], Jharkhand:['hi','sat'], Karnataka:['kn'], Kerala:['ml'], Ladakh:['ur','hi'],
  Lakshadweep:['ml'], 'Madhya Pradesh':['hi'], Maharashtra:['mr'], Manipur:['mni','bn'],
  Meghalaya:[], Mizoram:[], Nagaland:[], Odisha:['or'], Puducherry:['ta','te','ml'], Punjab:['pa'],
  Rajasthan:['hi'], Sikkim:['ne','hi'], 'Tamil Nadu':['ta'], Telangana:['te','ur'], Tripura:['bn'],
  'Uttar Pradesh':['hi','ur'], Uttarakhand:['hi'], 'West Bengal':['bn','ne']
};

export const suggestedLanguages = state => stateLanguages[state] ?? [];

const common = {
  or:{debendra:['ଦେବେନ୍ଦ୍ର'],devendra:['ଦେବେନ୍ଦ୍ର'],mahendra:['ମହେନ୍ଦ୍ର'],narendra:['ନରେନ୍ଦ୍ର'],rajendra:['ରାଜେନ୍ଦ୍ର'],soumendra:['ସୌମେନ୍ଦ୍ର'],kumar:['କୁମାର'],premalata:['ପ୍ରେମଲତା']},
  as:{das:['দাস'],borah:['বৰা'],barua:['বৰুৱা'],deka:['ডেকা']},
  bn:{sarkar:['সরকার'],roy:['রায়','রয়'],mukherjee:['মুখার্জী','মুখোপাধ্যায়']},
  gu:{patel:['પટેલ'],shah:['શાહ'],desai:['દેસાઈ']},
  hi:{amit:['अमित'],kumar:['कुमार'],devendra:['देवेन्द्र','देवेंद्र'],verma:['वर्मा'],chaudhary:['चौधरी'],gupta:['गुप्ता'],yadav:['यादव']},
  kn:{gowda:['ಗೌಡ'],hegde:['ಹೆಗ್ಡೆ'],shetty:['ಶೆಟ್ಟಿ']},
  kok:{naik:['नाईक','नायक']}, ml:{nair:['നായർ'],menon:['മേനോൻ'],pillai:['പിള്ള']},
  mr:{patil:['पाटील'],deshmukh:['देशमुख'],kulkarni:['कुलकर्णी'],shinde:['शिंदे']},
  mni:{singh:['ꯁꯤꯡꯍ'],devi:['ꯗꯦꯕꯤ']}, ne:{rai:['राई'],thapa:['थापा'],tamang:['तामाङ']},
  pa:{singh:['ਸਿੰਘ'],kaur:['ਕੌਰ'],sidhu:['ਸਿੱਧੂ'],sandhu:['ਸੰਧੂ']}, sat:{murmu:['ᱢᱩᱨᱢᱩ'],soren:['ᱥᱚᱨᱮᱱ']},
  ta:{rajan:['ராஜன்'],murugan:['முருகன்'],pillai:['பிள்ளை']},
  te:{rao:['రావు'],reddy:['రెడ్డి'],naidu:['నాయుడు']}, ur:{khan:['خان'],ahmad:['احمد'],ahmed:['احمد'],ali:['علی'],hussain:['حسین']}
};

const roman = /^[a-z\u00c0-\u024f]+(?:[ '\u2019-][a-z\u00c0-\u024f]+)*$/iu;
const phonemes = {aa:'ā',ee:'ī',ii:'ī',oo:'ū',uu:'ū',chh:'ch',ch:'c',sh:'ś',tt:'ṭ',dd:'ḍ',th:'th',dh:'dh',ph:'ph',bh:'bh',kh:'kh',gh:'gh',jh:'jh',ny:'ñ',ng:'ṅ',qu:'k',ck:'k',w:'v',x:'ks',z:'j',f:'ph',q:'k'};
const phoneticRoman = word => word.replace(/aa|ee|ii|oo|uu|chh|ch|sh|tt|dd|th|dh|ph|bh|kh|gh|jh|ny|ng|qu|ck|[wxfzq]/g,x=>phonemes[x]);
const useShortEO = new Set(['kn','ml','ta','te','mni']);

function candidatesForWord(source, language, transliterator) {
  const word = normalize(source);
  const curated = [...(common[language]?.[word] ?? []), ...suggestSurname(word,language).filter(item=>item.source==='Curated spelling').map(item=>item.variant)];
  const raw = phoneticRoman(word);
  const base = useShortEO.has(language) ? raw : raw.replace(/[eo]/g,vowel=>vowel==='e'?'ē':'ō');
  const loose = word.endsWith('a') ? base.replace(/a$/,'ā') : base;
  const alternatives = [...new Set([loose,base,loose.replace(/e/g,'ē').replace(/o/g,'ō')])];
  const phonetic = alternatives.flatMap(spelling=>{
    if (!transliterator) return [];
    const result = transliterator.t(spelling,'iso',recordLanguages[language][1]);
    if (language==='ur') return [result.replace(/[\u064b-\u065f]/g,''),result];
    const shorter = result.replace(/[\u094d\u09cd\u0a4d\u0acd\u0b4d\u0bcd\u0c4d\u0ccd\u0d4d\uabed]$/u,'');
    return useShortEO.has(language) ? [result,shorter] : [shorter,result];
  }).filter(value=>value && !/[a-z]/i.test(value));
  return [...new Set([...curated,...phonetic])].slice(0,4).map(value=>({value,curated:curated.includes(value)}));
}

export function proposeNames(terms,languages,transliterator=globalThis.Sanscript) {
  const results = [];
  for (const original of terms.filter(term=>roman.test(term))) {
    const parts = original.split(/[ '\u2019-]+/u);
    if (parts.length>8) continue;
    for (const language of languages.filter(language=>Object.hasOwn(recordLanguages,language))) {
      const choices = parts.map(word=>candidatesForWord(word,language,transliterator));
      if (choices.some(items=>!items.length)) continue;
      const best = choices.map(items=>items[0]);
      const drafts = [best,...choices.flatMap((items,i)=>items.slice(1).map(item=>best.map((value,j)=>i===j?item:value)))];
      const ranked = drafts.toSorted((a,b)=>b.filter(x=>x.curated).length-a.filter(x=>x.curated).length);
      for (const words of ranked.slice(0,4)) {
        results.push({original,language,spelling:words.map(x=>x.value).join(' '),curated:words.every(x=>x.curated)});
      }
    }
  }
  return [...new Map(results.map(item=>[`${normalize(item.original)}|${item.language}|${normalize(item.spelling)}`,item])).values()];
}

export function proposeNameOrders(terms, localized) {
  const sources = [...localized,...terms.map(original=>({original,spelling:original,language:'',curated:false}))];
  const seen = new Set(sources.map(item=>normalize(item.spelling)));
  const suggestions = [];
  for (const item of sources) {
    const words = item.spelling.trim().split(/\s+/u);
    if (words.length<2 || words.length>8 || words.some(word=>!/^\p{L}/u.test(word))) continue;
    const parts = words.length===2 ? words : [words[0],words.slice(1,-1).join(' '),words.at(-1)];
    const orders = parts.length===2 ? [[1,0]] : [[2,1,0],[2,0,1],[0,2,1],[1,0,2],[1,2,0]];
    for (const order of orders) {
      const spelling=order.map(index=>parts[index]).join(' ');
      const normalized=normalize(spelling);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        suggestions.push({...item,spelling,reordered:true});
      }
    }
  }
  return suggestions;
}
