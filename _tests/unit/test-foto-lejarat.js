// ════════════════════════════════════════════════════════════════
//  A TAROLT KEP-LINK LEJAR — megjeleniteskor UJRA kell irni
//  (Ferenc, 2026-08-27: "megerkezett, de a fotok hianyoznak")
//
//  A feltoltes egy ORAIG ervenyes alairt URL-t ment a rekordba
//  (exp - iat = 3600). Masnap az a link halott. Aki a tarolt url-t
//  rajzolja ki, toroett kepet mutat. A megoldas: a rekordban a PATH is
//  ott van — abbol mindig friss alairas keszul a megjeleniteskor.
// ════════════════════════════════════════════════════════════════
const path=require('path');
const {JSDOM}=require(path.join(__dirname,'..','..','node_modules','jsdom'));
const ROOT=path.resolve(__dirname,'..','..');

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const LEJART='https://storage/rpw-photos/a.jpg?token=REGI';
const FRISS =p=>'https://storage/'+p+'?token=FRISS';

function sbMock(hibas){
  return {storage:{from:()=>({createSignedUrl:async(p)=>
    hibas?{data:null,error:{message:'nem'}}:{data:{signedUrl:FRISS(p)},error:null}})}};
}

(async()=>{
const dom=new JSDOM('<!DOCTYPE html><body>'
  +'<img id="kep"  data-rpw-path="jo/kep.jpg" src="'+LEJART+'">'
  +'<a   id="link" data-rpw-path="jo/irat.pdf" href="'+LEJART+'">PDF</a>'
  +'<img id="ures" data-rpw-path="" src="'+LEJART+'">'
  +'<img id="kesz" data-rpw-path="jo/mas.jpg" src="'+LEJART+'" data-rpw-done="1">'
  +'<img id="nincs" src="'+LEJART+'">'
  +'</body>',{url:'https://rpw.teszt/'});
const w=dom.window;
global.self=w; global.window=w; global.document=w.document;
delete require.cache[require.resolve(path.join(ROOT,'rpw-photos.js'))];
require(path.join(ROOT,'rpw-photos.js'));
const P=w.RPWPhotos;
const $=id=>w.document.getElementById(id);

console.log('\n1. A megjeleniteskor MINDIG friss alairas keszul');
{
  await P.hydrate(sbMock());
  await sleep(30);
  ok($('kep').src===FRISS('jo/kep.jpg'),
     'a KEP src-je frissul  ("'+$('kep').src.slice(-24)+'")');
  ok($('link').href===FRISS('jo/irat.pdf'),
     'a LINK href-je is frissul — ez hianyzott eddig  ("'+$('link').href.slice(-24)+'")');
  ok($('kep').getAttribute('data-rpw-done')==='1','a kep meg van jelolve keszkent');
  ok($('link').getAttribute('data-rpw-done')==='1','  a link is');
}

console.log('\n2. Amit NEM szabad elrontani');
{
  ok($('nincs').src===LEJART,'path nelkuli elemhez nem nyulunk');
  ok($('ures').src===LEJART,'ures path eseten sem irunk fölé');
  ok($('ures').getAttribute('data-rpw-done')==='1','  de megjeloljuk, hogy ne probaljuk ujra');
  ok($('kesz').src===LEJART,'a mar kesz elemet nem irjuk ujra');
}

console.log('\n3. Ha a szerver nem ad alairast, a regi marad — nem uritjuk ki');
{
  const d2=new JSDOM('<!DOCTYPE html><body><img id="a" data-rpw-path="x/y.jpg" src="'+LEJART+'"></body>',
    {url:'https://rpw.teszt/'});
  global.self=d2.window; global.window=d2.window; global.document=d2.window.document;
  delete require.cache[require.resolve(path.join(ROOT,'rpw-photos.js'))];
  require(path.join(ROOT,'rpw-photos.js'));
  await d2.window.RPWPhotos.hydrate(sbMock(true),{private:true});
  await sleep(30);
  const el=d2.window.document.getElementById('a');
  ok(el.src===LEJART,'hibas alairasnal a kep nem tunik el teljesen');
  ok(el.getAttribute('data-rpw-done')==='1','  es nem porgunk rajta ujra');
}

console.log('\n4. A dosszie-lap MINDEN kep-helye visz path-ot');
{
  const fs=require('fs');
  const src=fs.readFileSync(path.join(ROOT,'rpw-dosar.html'),'utf8');
  // "Documente client" — ez volt a hianyzo darab
  ok(/_cu\.forEach[\s\S]{0,400}?<a href="'\+escU\(u\.url\)\+'" data-rpw-path=/.test(src),
     'az ugyfel-dokumentum LINKJE visz path-ot');
  ok(/_cu\.forEach[\s\S]{0,600}?<img src="'\+escU\(u\.url\)\+'" data-rpw-path=/.test(src),
     'az ugyfel-dokumentum KEPE is');
  ok(/class="acte-doc"/.test(src) && /data-rpw-path="'\+escA\(u\.path\|\|''\)\+'" target="_blank" class="acte-doc"/.test(src),
     'az irat-PDF linkje is');
  // a ZIP-export sem a halott linkrol tolt
  ok(/RPWPhotos\.signedUrl\(sb,u\.path\)/.test(src),
     'a ZIP-export friss alairassal tolt, nem a tarolt linkrol');
}

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
