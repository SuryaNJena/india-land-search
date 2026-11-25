const assets = {or:new URL('./name-dictionary-or.json',import.meta.url)};
const downloads = new Map();

export function loadNameDictionary(language) {
  if (!Object.hasOwn(assets,language)) return;
  if (!downloads.has(language)) {
    downloads.set(language,fetch(assets[language]).then(response=>{
      if (!response.ok) throw Error('The spelling dictionary could not be loaded.');
      return response.json();
    }).catch(error=>{
      downloads.delete(language);
      throw error;
    }));
  }
  return downloads.get(language);
}
