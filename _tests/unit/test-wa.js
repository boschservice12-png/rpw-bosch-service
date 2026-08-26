// L1-G: a WhatsApp-kapu lathatova tetele
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

// 2026-08-26 (Ferenc): a "Contacteaza clientul" szoveges gomb helyere a
// VALODI WhatsApp jel kerult a Kapcsolat oszlopban. A szandek valtozatlan:
// ne legyen nema tiltott gomb, es legyen LATHATO ut elore.
console.log('\n1. A tiltott gomb helyett beszelo WhatsApp jel');
ok(!/disabled title="'\+T\('no_wa_yet'\)/.test(html),'a nema disabled gomb eltunt');
ok(!/need_wa_btn/.test(html),'a "Contacteaza clientul" szoveges gomb kivezetve (nem maradt halott felirat)');
// F-4 (Ferenc, 2026-08-26): telefon nelkul a jel oda visz, ahol
// MEGOLDHATO — dossziénal a dosszie-lapra (ott irod be a szamot),
// javitasnal a kezi bejeloles ablakaba. Egyik esetben sem zsakutca.
ok(/wa-btn nofon/.test(html),'telefon nelkul sajat, tompa jel');
ok(/nofon[\s\S]{0,400}deschideDosar/.test(html),'  dossziénal a dosszie-lapra visz');
ok(/nofon[\s\S]{0,400}openCondModal/.test(html),'  javitasnal a kezi bejeloles ablakaba');
ok(/\.wa-btn svg\{/.test(html),'a jel valodi SVG (nem emoji)');
ok(!/>💬<\/button>/.test(html),'a 💬 emoji nem maradt gombfeliratkent');

console.log('\n2. A jel megmondja, mit kell tenni');
['need_wa_tip','no_wa_yet','wa_no_phone'].forEach(function(k){
  const m=html.match(new RegExp(k+":\\{ro:'([^']+)',en:'([^']+)',hu:'([^']+)'"));
  ok(!!m,k+' mind a 3 nyelven megvan');
  if(m){ok(m[1].length>3&&m[3].length>3,'  '+k+' RO: "'+m[1].slice(0,40)+'"');}
});
ok(/title="'\+waTitle\+'"/.test(html),'a jelen ott a magyarazo cimke');

console.log('\n3. A kapu szabalya VALTOZATLAN (nem lazitottunk)');
ok(/var canOpen=cnd\.whatsapp/.test(html),'canOpen tovabbra is a whatsapp feltetel');
ok(/if\(!job\.conditions\|\|!job\.conditions\.whatsapp\)\{toast\(T\('no_wa_yet'\),1\);return\}/.test(html),
   'deschideLucrare() szerver-oldali ellenorzese erintetlen — a gomb megkerulese sem mukodik');

console.log('\n4. A kezi bejeloles utja letezik (a "B" resz)');
ok(/cond_q_wa/.test(html),'feltetel-modalban ott a WhatsApp sor');
ok(/setCondDraft\(\\'whatsapp\\',true\)/.test(html),'kezzel Da-ra allithato');
ok(/ondblclick="openCondModal/.test(html),'dupla kattintas is nyitja (regi ut megmaradt)');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
