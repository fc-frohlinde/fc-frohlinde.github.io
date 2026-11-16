// Flutlicht moved to flutlichtapp.de (16.11.2026). This replaces the old
// service worker on the old address: it clears its saved pages, removes
// itself and reloads open windows, which then land on the forwarding page.
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){
  e.waitUntil((async function(){
    try{var ks=await caches.keys();await Promise.all(ks.map(function(k){return caches.delete(k);}));}catch(x){}
    try{await self.registration.unregister();}catch(x){}
    try{var cs=await self.clients.matchAll({type:'window'});cs.forEach(function(c){try{c.navigate(c.url);}catch(x){}});}catch(x){}
  })());
});
