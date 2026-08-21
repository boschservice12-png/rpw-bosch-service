// RPW service worker — nincs offline cache + AKTÍV önttisztítás.
// Cél: soha ne ragadjon be régi verzió egy eszközön (tablet/telefon).
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    // Minden korábbi cache törlése (ha egy régi sw valaha cache-elt)
    try{ var keys=await caches.keys(); await Promise.all(keys.map(function(k){return caches.delete(k);})); }catch(_){}
    // Átvesszük az irányítást azonnal
    try{ if(self.clients && self.clients.claim) await self.clients.claim(); }catch(_){}
    // Az összes nyitott lapnak szólunk, hogy frissüljön a friss verzióra
    try{
      var cs=await self.clients.matchAll({type:'window'});
      cs.forEach(function(c){ try{ c.navigate(c.url); }catch(_){} });
    }catch(_){}
  })());
});
// Pass-through: minden kérés a hálózatról jön, nincs elavult tartalom.
self.addEventListener('fetch', function(){ /* pass-through */ });
