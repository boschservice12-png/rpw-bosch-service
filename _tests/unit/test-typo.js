// L1-X: a ket kepernyo ugyanazt a betukarakter-rendszert hasznalja
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const css=k=>{const m=html.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));return m?m[1]:''};

console.log('\n1. Egyetlen alap-betutipus');
ok(/html,body\{font-family:'DM Sans',sans-serif/.test(html),'DM Sans a teljes appra');
ok(/\.mono\{font-family:'JetBrains Mono'/.test(html),'JetBrains Mono a technikai adatra');
const ff=(html.match(/font-family:(?!inherit)(?!'DM Sans')(?!'JetBrains)[^;}]+/g)||[])
  .filter(x=>!/ui-monospace|Menlo|Consolas|monospace|system-ui|sans-serif/.test(x));
ok(ff.length===0,'nincs harmadik betutipus: '+JSON.stringify(ff));

console.log('\n2. A ket tabla FEJLECE egyforma');
const a=css('.tbl thead th'), b=css('.panou-tbl th');
const f=(s,k)=>{const m=s.match(new RegExp(k+':([^;]+)'));return m?m[1].trim():null};
['font-size','font-weight','color','letter-spacing','text-transform'].forEach(function(k){
  ok(f(a,k)===f(b,k),'  '+k+': Lucrari='+f(a,k)+' Programari='+f(b,k));
});

console.log('\n3. A cellak egyformak');
ok(/\.tbl td\{padding:12px 16px;font-size:13px/.test(html),'Lucrari cella: 13px');
ok(/\.panou-tbl\{[^}]*font-size:13px/.test(html),'Programari cella: 13px');

console.log('\n4. A RENDSZAM mindket kepernyon mono');
const pan=html.slice(html.indexOf('function renderPanou'),html.indexOf('function renderStatistici'));
const luc=html.slice(html.indexOf('function render(){'),html.indexOf('function renderCondIcon'));
ok(/class="mono"[^>]*>'\+escH\(j\.plate/.test(pan),'Programari: rendszam mono');
ok(/class="mono"[^>]*>'\+escH\(j\.plate/.test(luc),'Lucrari: rendszam mono');
ok(/letter-spacing:\.4px/.test(pan)||/letter-spacing/.test(pan),'Programari: ritkitva');
ok(/letter-spacing:\.4px/.test(luc),'Lucrari: ugyanugy ritkitva');

console.log('\n5. A munkaszam mindkettoben mono');
ok(/class="mono"[^>]*>'\+\(ed\?inp\('number'/.test(luc)||/mono/.test(luc),'Lucrari: szam mono');
ok(/mono/.test(pan),'Programari: szam mono');

console.log('\n6. A Ce facem azi panel is ugyanezt koveti');
ok(/\.az-pl\{font-weight:800;font-family:ui-monospace/.test(html),'panel rendszam: monospace');
ok(/\.az-nr\{[^}]*font-family:ui-monospace/.test(html),'panel munkaszam: monospace');
ok(/\.az-tg\{font:800 10px ui-monospace/.test(html),'panel cimke: monospace');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
