const shell = /* BUILD_ASSETS */ [];
const scope = new URL(self.registration.scope);
const prefix = 'india-land-search:'+scope.pathname+':';
const version = '/* BUILD_REVISION */';
const cacheName = prefix+version;

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(prefix) && key!==cacheName)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const {request}=event;
  const url=new URL(request.url);
  if (request.method!=='GET' || url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const asset=url.pathname.slice(scope.pathname.length);
  if (asset.startsWith('api/') || request.mode!=='navigate' && !/^(?:vendor\/|boundaries\/)?[a-z0-9_.-]+\.(?:json|html|css|mjs|js|svg|webmanifest)$/iu.test(asset)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    const key=request.mode==='navigate' ? new URL('index.html',scope).href : request;
    try {
      const response=await fetch(request);
      if (response.ok && response.type!=='opaque') {
        try {await cache.put(key,response.clone());} catch { /* Browsing is available if cache storage is full. */ }
      }
      return response;
    } catch {
      return await cache.match(key) ?? Response.error();
    }
  })());
});
