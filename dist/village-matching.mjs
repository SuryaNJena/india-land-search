import {normalize} from './core.mjs';

const scripts=[
  [/\p{Script=Oriya}/u,'oriya'],[/\p{Script=Devanagari}/u,'devanagari'],
  [/\p{Script=Bengali}/u,'bengali'],[/\p{Script=Gujarati}/u,'gujarati'],
  [/\p{Script=Gurmukhi}/u,'gurmukhi'],[/\p{Script=Tamil}/u,'tamil'],
  [/\p{Script=Telugu}/u,'telugu'],[/\p{Script=Kannada}/u,'kannada'],
  [/\p{Script=Malayalam}/u,'malayalam']
];

export const localityKey=value=>normalize(value).replace(/[^\p{L}\p{M}\p{N}]/gu,'');

export function villageSpelling(value,transliterator=globalThis.Sanscript) {
  const original=localityKey(value);
  const script=transliterator && scripts.find(([pattern])=>pattern.test(original));
  const roman=script?transliterator.t(original,script[1],'iso'):original;
  const latin=roman.normalize('NFD').replace(/\p{M}/gu,'');
  const folded=/^[a-z]+$/u.test(latin)?latin.replace(/m(?=[gk])/gu,'n').replace(/w/gu,'v').replace(/a$/u,''):'';
  return {original,folded};
}

function editDistance(a,b) {
  let previous=Array.from({length:b.length+1},(_,index)=>index);
  let next=new Array(b.length+1);
  for (let i=0;i<a.length;i++) {
    next[0]=i+1;
    for (let j=0;j<b.length;j++) next[j+1]=Math.min(previous[j]+Number(a[i]!==b[j]),previous[j+1]+1,next[j]+1);
    [previous,next]=[next,previous];
  }
  return previous[b.length];
}

export function villageSpellingScore(query,candidate) {
  const {original:a,folded:x}=query,{original:b,folded:y}=candidate;
  if (!a || !b) return Infinity;
  if (a===b) return 0;
  if (b.startsWith(a)) return 1;
  if (x && y && x===y) return 2;
  const [left,right]=x && y?[x,y]:[a,b];
  if (left.length<4 || right.length<4) return Infinity;
  const limit=Math.max(left.length,right.length)>=8?2:1;
  if (Math.abs(left.length-right.length)>limit) return Infinity;
  const distance=editDistance(left,right);
  return distance<=limit?3+distance:Infinity;
}
