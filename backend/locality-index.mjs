import {DatabaseSync} from 'node:sqlite';

// Persist only official location menus. Tenant and parcel responses never enter this index.
export function localityIndex(filename,{now=Date.now}={}){
  const db=new DatabaseSync(filename);
  db.exec('CREATE TABLE IF NOT EXISTS menus (key TEXT PRIMARY KEY, refreshed INTEGER NOT NULL, value TEXT NOT NULL)');
  const get=db.prepare('SELECT value FROM menus WHERE key=? AND refreshed>?');
  const put=db.prepare('INSERT OR REPLACE INTO menus VALUES (?,?,?)');
  const prune=db.prepare('DELETE FROM menus WHERE refreshed<?');
  const month=30*86400000;
  return {
    key(path,input){
      const scope=input?.location??'';
      if(!['/api/odisha/locations','/api/odisha/map-locations'].includes(path) || typeof scope!=='string' ||
         scope && !/^[1-9]\d{0,5}(?:-[1-9]\d{0,5}){0,2}$/.test(scope))return;
      return path+'/'+scope;
    },
    get(key){const row=get.get(key,now()-month);return row&&JSON.parse(row.value);},
    put(key,data){
      if(!Array.isArray(data?.options)||!data.options.length)return;
      const options=data.options.map(({code,label})=>({code,label}));
      if(options.some(o=>!/^\d+$/.test(String(o.code))||typeof o.label!=='string'))return;
      prune.run(now()-month);put.run(key,now(),JSON.stringify({level:data.level,options}));
    },close:()=>db.close()
  };
}

