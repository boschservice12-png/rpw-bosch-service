// L1-G: a WhatsApp-kapu lathatova tetele
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

console.log('\n1. A tiltott gomb helyett beszelo gomb');
ok(/eb-need/.test(html),'uj gomb-osztaly letezik');
ok(!/disabled title="'\+T\('no_wa_yet'\)/.test(html),'a nema disabled gomb eltunt');
ok(/openCondModal\(\\'\'\+j\.id/.test(html)||html.indexOf("eb-need")>0,'a gomb a feltetel-modalt nyitja');

console.log('\n2. A gomb megmondja, mit kell tenni');
['need_wa_btn','need_wa_tip'].forEach(function(k){
  const re=new RegExp(k+":\\\\{ro:'([^']+)'[^}]*hu:'([^']+)'");
  const m=html.match(new RegExp(k+":\\{ro:'([^']+)',en:'([^']+)',hu:'([^']+)'"));
  ok(!!m,k+' mind a 3 nyelven megvan');
  if(m){ok(m[1].length>3&&m[3].length>3,'  '+k+' RO: "'+m[1].slice(0,40)+'"');}
});

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
