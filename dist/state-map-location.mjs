import {geographyKey} from './state-geography.mjs';

// District identifiers from the NWDP reference release mapped to the public cadastral directory.
const cgDistricts={
  374:'45',375:'40',376:'61',377:'59',378:'43',379:'54',380:'56',381:'60',
  382:'57',383:'55',384:'53',385:'58',386:'41',387:'44',388:'42',389:'39',
  636:'47',637:'46',642:'48',643:'49',644:'50',645:'51',646:'62',647:'63',
  648:'64',649:'65',650:'52',734:'66'
};
const cgVillages={
  '434821':{district:'41',name:'Tangarghat',levels:['41','08','03','289']},
  '439781':{district:'57',name:'Adhchara',levels:['57','08','01','028']}
};
const cgDistrictNames={
  bastar:'45',bilaspur:'40',dantewada:'61',dhamtari:'59',durg:'43',janjgirchampa:'54',
  jashpur:'56',kanker:'60',kabirdham:'57',korba:'55',korea:'53',mahasamund:'58',raigarh:'41',
  raipur:'44',rajnandgaon:'42',surguja:'39',bijapur:'47',narayanpur:'46',sukma:'48',
  kondagaon:'49',balodabazar:'50',gariyaband:'51',balod:'62',mungeli:'63',surajpur:'64',
  balrampur:'65',bemetara:'52',gaurellapendramarwahi:'66'
};

export function officialVillagePath(place) {
  if (place?.state!=='Chhattisgarh') return [];
  const district=place.districtCode?cgDistricts[place.districtCode]:cgDistrictNames[geographyKey(place.district)];
  const village=cgVillages[place.lgd??place.id];
  if (!district) return [];
  if (village?.district===district && geographyKey(village.name)===geographyKey(place.village)) return [...village.levels];
  return [district];
}

export function matchOfficialLocation(options, code, label) {
  const name=geographyKey(label);
  const matches=code?options.filter(item=>item.code===code)
    :name?options.filter(item=>geographyKey(item.label)===name):[];
  return matches.length===1?matches[0]:undefined;
}
