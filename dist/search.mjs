import {matchRows, normalize} from './core.mjs';
import {portals} from './portals.mjs';

const states = new Map(portals.map(({name}) => [normalize(name), name]));
states.set('orissa', 'Odisha');
const odishaSource = /^(?:https?:\/\/)(?:app\d+)?bhunakshaodisha\.nic\.in(?=[:/]|$)/i;
export const locationFields = ['district', 'tehsil', 'ri', 'village'];
const legacyOdisha = {
  district: {'3':'Cuttack|କଟକ', '19':'Kendrapara|କେନ୍ଦ୍ରାପଡ଼ା'},
  tehsil: {'3/11':'Mahanga|ମାହାଙ୍ଗା', '3/15':'Nischintakoili|ନିଶ୍ଚିନ୍ତକୋଇଲି', '19/8':'Derabish|Derabis|ଡେରାବିଶ'},
  ri: {'3/11/8':'Kurujanga|କୁରୁଜଙ୍ଗା', '3/15/1':'Bishnupur|ବିଷ୍ଣୁପୁର', '19/8/17':'Chandol|Chandola|ଚାନ୍ଦୋଳ'}
};

export const canonicalState = value => states.get(normalize(value)) || '';
export const searchTerms = text => [...new Map(String(text ?? '').split(/[,;\n]/u)
  .map(term => [normalize(term), term.trim()]).filter(([key]) => key)).values()];

export function criteriaFrom(value = {}) {
  return {
    state: canonicalState(value?.state),
    names: String(value?.names ?? '').slice(0, 3000),
    ...Object.fromEntries(locationFields.map(field => [field, String(value?.[field] ?? '').slice(0, 500)]))
  };
}

function stateFor(row, sheet, workspace) {
  const declared = [row.state, sheet?.state, workspace?.state].map(canonicalState).find(Boolean);
  return declared || ([row.source, sheet?.base].some(x => odishaSource.test(x ?? '')) ? 'Odisha' : '');
}

export function searchIndex(workspace) {
  const sheets = new Map((workspace?.summary ?? []).map(sheet => [sheet.gis, sheet]));
  return (workspace?.rows ?? []).map((row, index) => {
    const sheet = sheets.get(row.gis);
    const state = stateFor(row, sheet, workspace);
    const codes = [row.district_code || row.district || sheet?.district,
      row.tehsil_code || row.tehsil || sheet?.tehsil, row.ri_code || row.ri || sheet?.ri];
    const location = Object.fromEntries(locationFields.map((field, level) => {
      const known = state === 'Odisha' ? legacyOdisha[field]?.[codes.slice(0, level + 1).join('/')]?.split('|') ?? [] : [];
      const values = [row[`${field}_name`], sheet?.[`${field}_name`], ...known, row[field],
        field === 'village' ? sheet?.name : sheet?.[field], row[`${field}_code`],
        field === 'village' ? sheet?.village : sheet?.[`${field}_code`]].filter(value => value != null && value !== '');
      return [field, [...new Set(values.map(String))]];
    }));
    return {index, state, location};
  });
}

export function assignImportState(workspace, state) {
  const validState = canonicalState(state);
  if (!validState) return workspace;
  const index = searchIndex(workspace);
  return {...workspace, rows: workspace.rows.map((row, i) => index[i].state ? row : {...row, state:validState})};
}

const placeKey = value => normalize(value).replace(/^0+(?=\d+$)/u, '');

export function findRecords(workspace, index, criteria) {
  const names = searchTerms(criteria.names);
  const filters = locationFields.map(field => [field, searchTerms(criteria[field]).map(placeKey)]);
  const inState = index.filter(entry => entry.state === criteria.state);
  const scoped = inState.filter(({location}) => filters.every(([field, wanted]) =>
    !wanted.length || location[field].some(value => wanted.includes(placeKey(value)))));
  const rows = scoped.map(({index}) => workspace.rows[index]);
  const matches = matchRows(rows, {names});
  return {
    stateCount: inState.length,
    scopedCount: scoped.length,
    searchable: rows.filter(row => row.status === 'Retrieved' && normalize(row.info)).length,
    hits: scoped.flatMap(({index}, i) => matches[i].fullSelected ? [{index, terms:matches[i].full}] : [])
  };
}
