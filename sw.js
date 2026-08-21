// RPW service worker — minimális, telepítést engedélyező.
// SZÁNDÉKOSAN NINCS offline cache: a fetch mindig a hálózatra megy,
// így a kézi (browse-upload) deploy után SOHA nincs elavult verzió.
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.clients ? self.clients.claim() : Promise.resolve()); });
// Van fetch-figyelő (ez kell a telepíthetőséghez), de nem hívunk respondWith-et
// → a böngésző normálisan, hálózatról tölt. Nincs stale cache.
self.addEventListener('fetch', function(){ /* pass-through */ });
