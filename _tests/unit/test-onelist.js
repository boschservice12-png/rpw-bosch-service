// L1-M (v2, K-19): kulon Avizare dauna ful — Ferenc 2026-08-25-i dontese.
// Az aznap reggeli "egy lista" osszevonas TUDATOSAN visszafordult: a
// biztositos karugyek sajat fulon elnek, es OTT is nyilnak.
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};

console.log('\n1. Az Avizare dauna SAJAT ful (K-19)');
ok(html.indexOf("setPanouTab(\\'dosare\\')")>=0,'a ful gombja letezik');
ok(/tab==='dosare'\?dosare:/.test(html),'a ful a dosare listat mutatja');
ok(!/var deAzi=viitoare\.concat\(dosare\)/.test(html),'az osszevonas megszunt');
ok(!/tab==='dosare'\)tab='viitoare'/.test(html),'nincs tobbe atiranyitas');
ok(/tab-count">'\+dosare\.length/.test(html),'sajat szamlaloja van');

console.log('\n2. A dossziek a FULON nyilnak — a felugro modal kivezetve');
ok(/if\(tab==='dosare'\)\{[\s\S]{0,600}onclick="dosarTarziu\(\)"/.test(html),'Deschide dosar dauna gomb a fulon');
ok(/if\(tab==='dosare'\)\{[\s\S]{0,900}onchange="dosarFisier\(event\)"/.test(html),'Preluare (fajl) gomb a fulon');
ok(!/showDosar/.test(html),'a felugro modal minden nyoma eltunt');
ok(!/openDosarModal/.test(html),'  a nyito fuggveny is');

console.log('\n3. Az ADATMODELL erintetlen');
ok(/categorizeJob\(j\)==='dosare'/.test(html),'categorizeJob valtozatlanul kulon kezeli');
ok(/if\(job\.flux==='doar_dosar'\) *return 'dosare'/.test(html),'a dontesi lanc valtozatlan');

console.log('\n4. Savonkent mas status');
ok(/if\(tab==='dosare'\)\{[\s\S]{0,600}acteCount/.test(html),'dosar sor -> iratszamlalo');
ok(/st_predat|st_inchis/.test(html),'atadva / lezarva allapot is megjelenik');
ok(/tab==='viitoare'\)\{[\s\S]{0,300}st_astept/.test(html),'programare sor -> "varjuk az autot"');

console.log('\n5. K-19: biztositos javitas KET allapota a Viitoare soron');
ok(/damageType==='asig'/.test(html) && /dd2-open/.test(html) && /dd2-aviz/.test(html),'ketallapotu jelveny letezik');
ok(/dosarStatus==='deschis'/.test(html),'  a dosarStatus dont');
ok(/st_dosar_deschis/.test(html) && /st_avizare/.test(html),'  mindket felirat megvan');

console.log('\n6. Muveletek soronkent');
ok(/tab==='dosare'\)\{[\s\S]{0,300}deschideDosar/.test(html.slice(html.indexOf('displayed.forEach'))),'dosar soron Deschide dosarul');
ok(/deschideLucrare/.test(html),'programare soron -> recepcio');
ok(!/fx-b/.test(html),'a rendszam melletti jelveny tovabbra sincs');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
if(fail)process.exit(1);
