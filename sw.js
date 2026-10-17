// Flutlicht service worker.
// Makes the app installable and keeps the last loaded page so the app still
// opens without a connection. Every page load goes to the network first: the
// app must always run the newest version; on a weak signal it waits at most
// NET_WAIT and then opens the saved copy. Everything that is not a page load
// (Firebase, fonts, images) is left to the browser untouched.
const CACHE='footy-page-v1';
const NET_WAIT=1000; // ms
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||r.mode!=='navigate')return;
  // One cached copy per page (index.html, report.html), whatever the query
  const key=new URL(r.url);key.search='';key.hash='';
  // no-cache: always ask the server whether the page changed (a quick 304 when
  // not). Without it a copy from the HTTP cache (GitHub Pages: 10 min) could
  // open an old version right after a deploy, and the app then reloaded itself.
  const net=fetch(r.url,{cache:'no-cache',credentials:'same-origin'})
    .then(res=>res.redirected?fetch(r):res)
    .catch(()=>fetch(r))
    .then(res=>{
      // Whenever the server answers (also after the wait below gave up), keep the copy.
      if(res&&res.ok&&res.type==='basic'){
        const copy=res.clone();
        e.waitUntil(caches.open(CACHE).then(c=>c.put(key.href,copy)).catch(()=>{}));
      }
      return res;
    });
  e.waitUntil(net.catch(()=>{}));
  // Weak signal (pitch, changing room): wait for the server at most NET_WAIT ms,
  // then open the saved copy. Offline the saved copy opens at once.
  e.respondWith(caches.match(key.href).then(hit=>{
    if(!hit)return net;
    let t;
    const late=new Promise(res=>{t=setTimeout(()=>res(hit),NET_WAIT);});
    return Promise.race([net.catch(()=>hit),late]).finally(()=>clearTimeout(t));
  }));
});
