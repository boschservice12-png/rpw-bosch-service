// test-csp-data-url.js — a foto NEM fetch(dataUrl)-lel lesz Blob
//
// 2026-09-06: a recepcios fotozas 08-25 ota nema hibaval halt el. A CSP
// connect-src-bol kikerult a `data:`, a lapok viszont fetch(dataUrl)-lel
// csinaltak blobot — es a fetch egy data: URL-re a connect-src ala esik.
//
// Ket dolgot oriz:
//   A) RPWUtil.dataUrlToBlob helyesen bont, ES SOHA nem hiv fetch-et
//   B) amig a CSP connect-src-ben nincs `data:`, EGYETLEN lap sem
//      fetch-elhet data: URL-t. (Ha valaki visszateszi a data:-t, a
//      tilalom magatol feloldodik — a szabaly a CSP-hez van kotve.)
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
var pass=0, fail=0;
function ok(c,m){ if(c){pass++;console.log('  v '+m);} else {fail++;console.log('  X '+m);} }

// ── A) az atalakito ──────────────────────────────────────────────────
console.log('\nA. dataUrlToBlob — helyes, es fetch nelkul');
var fetchHivas=0;
global.fetch=function(){ fetchHivas++; return Promise.reject(new Error('CSP: connect-src blokkol')); };
global.self=global; global.window=global;
require(path.join(ROOT,'rpw-util.js'));
var U=global.RPWUtil;
ok(U && typeof U.dataUrlToBlob==='function', 'RPWUtil.dataUrlToBlob letezik');

// valodi JPEG-fejlec (FF D8 FF E0 ...), base64-ben
var JPEG_B64='/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
var b=U.dataUrlToBlob('data:image/jpeg;base64,'+JPEG_B64);
ok(b instanceof Blob, 'Blob-ot ad vissza');
ok(b.type==='image/jpeg', 'a MIME atjon: '+b.type);
ok(b.size===Buffer.from(JPEG_B64,'base64').length, 'a meret pontosan a dekodolt bajtszam ('+b.size+')');
(async function(){
  var u8=new Uint8Array(await b.arrayBuffer());
  ok(u8[0]===0xFF && u8[1]===0xD8 && u8[2]===0xFF, 'az elso bajtok FF D8 FF (valodi JPEG-fejlec)');
  ok(fetchHivas===0, 'KONTROLL: fetch NEM hivodott (a CSP-nek nincs beleszolasa)');

  var p=U.dataUrlToBlob('data:text/plain,hello%20vilag');
  ok(p.type==='text/plain' && p.size===11, 'nem-base64 (percent) data: URL is megy (11 bajt)');
  var thr=false; try{ U.dataUrlToBlob('nem data url'); }catch(e){ thr=true; }
  ok(thr, 'ervenytelen bemenetre dob, nem ad ures blobot');
  var thr2=false; try{ U.dataUrlToBlob(null); }catch(e){ thr2=true; }
  ok(thr2, 'null-ra dob');

  // ── B) a CSP es a kod egyutt mozog ───────────────────────────────
  console.log('\nB. amig a connect-src-ben nincs data:, egy lap sem fetch-el data: URL-t');
  var toml=fs.readFileSync(path.join(ROOT,'netlify.toml'),'utf8');
  var m=/connect-src([^;"]*)/.exec(toml);
  ok(!!m, 'a netlify.toml-ban van connect-src');
  var vanData=/\bdata:/.test(m?m[1]:'');
  console.log('     connect-src data: '+(vanData?'ENGEDVE':'TILTVA'));
  // A detektor: fetch(...) olyan kifejezessel, ami data URL-t hordoz.
  var FETCH_DATA=/\bfetch\(\s*(dataUrl|du|photos\[[^\]]*\]\.data|[A-Za-z_$][\w$]*\.data)\s*\)/;
  // KONTROLL: a detektornak a REGI kodot el kell kapnia
  ok(FETCH_DATA.test('var res=await fetch(dataUrl);'), 'KONTROLL: a detektor elkapja a regi recepcios sort');
  ok(FETCH_DATA.test('var resp=await fetch(photos[x].data);'), 'KONTROLL: ... es a regi reconstatare sort');
  ok(!FETCH_DATA.test('var blob=RPWUtil.dataUrlToBlob(dataUrl);'), 'KONTROLL: az uj sort NEM kapja el');
  var lapok=fs.readdirSync(ROOT).filter(function(f){return /^rpw-.*\.html$/.test(f)||f==='index.html';});
  var bukott=[];
  lapok.forEach(function(f){
    var src=fs.readFileSync(path.join(ROOT,f),'utf8');
    // Az uj sorokban a fetch csak TARTALEK, egy feltetel mogott — azt a
    // "?RPWUtil.dataUrlToBlob(" elozi meg ugyanabban a sorban. Csak a
    // feltetel NELKULI fetch(dataUrl) tilos.
    src.split('\n').forEach(function(sor,i){
      if(/^\s*\/\//.test(sor)) return;                      // megjegyzes nem fut
      if(FETCH_DATA.test(sor) && sor.indexOf('RPWUtil.dataUrlToBlob(')<0) bukott.push(f+':'+(i+1));
    });
  });
  if(vanData) ok(true, 'a CSP engedi a data:-t — a tilalom nem all fenn');
  else ok(bukott.length===0, 'egyetlen lap sem fetch-el data: URL-t feltetel nelkul'+(bukott.length?' — DE: '+bukott.join(', '):''));
  ok(lapok.length>=10, 'KONTROLL: tenyleg vegignezte a lapokat ('+lapok.length+')');

  console.log('\n'+(fail?'X ':'v ')+pass+' pass / '+fail+' fail');
  process.exit(fail?1:0);
})();
