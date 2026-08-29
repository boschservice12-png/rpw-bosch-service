// ════════════════════════════════════════════════════════════════
//  IRATBESOROLÁS — AI-JAVASLAT, EMBERI DÖNTÉS
//  ----------------------------------------------------------------
//  A `classify` funkció készen állt, de SEHOL nem hívtuk. Ez a teszt
//  a bekötést méri:
//    · a modell szótára a dosszié RÉSEIT követi
//    · a javaslat sosem ír a dossziéba magától
//    · két azonos irat nem kerül ugyanabba a résbe
//    · a károsult/vétkes kérdést NEM találgatjuk
//  Plusz a felület két élő hibája, amit ez a kör javított.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  x ' + m)); };
const eq = (g, e, m) => ok(JSON.stringify(g) === JSON.stringify(e), m + '  got=' + JSON.stringify(g));

// A konfiguráció a valódi fájlból — nem másolat.
const cfgSrc = R('rpw-config.js');
const g = { location:{ protocol:'https:' }, console:{ log(){} } };
g.window = g;
new Function('window','location','console', cfgSrc)(g, g.location, g.console);
const DOCS = g.RPW_DAUNA_DOCS;

global.window = undefined;
const C = require(path.join(ROOT, 'rpw-classify.js'));
const O = { docs: DOCS };

console.log('\n1. A konfiguráció és a szótár ugyanarról beszél');
{
  const slots = [];
  DOCS.forEach(gr => (gr.items||[]).forEach(it => slots.push(it.key)));
  ok(slots.length === 19, 'a dosszié 19 rése (' + slots.length + ')');

  // Minden közvetlen megfeleltetés LÉTEZŐ résre mutat
  const rossz = Object.keys(C.DIRECT).filter(t => slots.indexOf(C.DIRECT[t]) < 0);
  ok(rossz.length === 0, 'minden közvetlen típus létező résre mutat' + (rossz.length?' — '+rossz.join(', '):''));

  // A személyhez kötött iratok mindkét vége létező rés (ahol van)
  const rossz2 = [];
  Object.keys(C.PERSON).forEach(t => C.PERSON[t].forEach(k => { if(k && slots.indexOf(k)<0) rossz2.push(t+'→'+k); }));
  ok(rossz2.length === 0, 'a személyhez kötött rések is léteznek' + (rossz2.length?' — '+rossz2.join(', '):''));

  // A szerver szótára és a kliensé UGYANAZ
  const H = require(path.join(ROOT, 'functions', '_shared.js'));
  const kliens = Object.keys(C.DIRECT).concat(Object.keys(C.PERSON)).concat(['altceva']).sort();
  eq(H.CLASSIFY_TYPES.slice().sort(), kliens, 'a szerver és a kliens szótára egyezik');
  eq(Object.keys(H.CLASSIFY_ALIAS).sort(), Object.keys(C.ALIAS).sort(), 'az alias-tábla is');
}

console.log('\n2. A régi, szűkebb szótár nem vész el');
{
  eq(C.mapType('talon'), 'talon_fata', 'talon → talon_fata');
  eq(C.mapType('constatare'), 'constatare_amiabila', 'constatare → constatare_amiabila');
  eq(C.mapType('foto_lateral_stg'), 'foto_stanga', 'foto_lateral_stg → foto_stanga');
  eq(C.mapType('foto_lateral_dr'), 'foto_dreapta', 'foto_lateral_dr → foto_dreapta');
  eq(C.mapType('foto_elem'), 'foto_avarii', 'foto_elem → foto_avarii');
  eq(C.mapType('polita_rca'), 'polita_rca', 'az új típus változatlan');

  const H = require(path.join(ROOT, 'functions', '_shared.js'));
  eq(H.validateClassify({type:'talon',confidence:.9,label:'x'}).type, 'talon_fata',
     'a SZERVER is fordít — a régi válasz nem esik altceva-ba');
  eq(H.validateClassify({type:'kitalalt',confidence:.9}).type, 'altceva', 'ismeretlen típus → altceva');
  eq(H.validateClassify({type:'buletin',confidence:5}).confidence, 0, 'tartományon kívüli bizonyosság → 0');
}

console.log('\n3. A biztos javaslat a helyes résbe mutat');
{
  const biztos = t => C.suggestSlot({type:t, confidence:0.95}, {}, O);
  eq(biztos('polita_rca').slot, 'polita_rca', 'poliță');
  eq(biztos('declaratie_dauna').slot, 'declaratie_dauna', 'declarație');
  eq(biztos('imputernicire').slot, 'imputernicire_doc', 'împuternicire → a rés MÁS nevű');
  eq(biztos('foto_serie_caroserie').slot, 'foto_serie_caroserie', 'VIN-fotó');
  eq(biztos('foto_stanga').slot, 'foto_stanga', 'bal oldal');
  eq(biztos('proces_verbal').slot, 'proces_verbal', 'rendőrségi jegyzőkönyv');
  eq(biztos('polita_rca').reason, 'ok', 'az indoklás: ok');
  eq(biztos('polita_rca').low, false, 'nem bizonytalan');
}

console.log('\n4. Károsult vagy vétkes — NEM találgatunk, a szabad rést ajánljuk');
{
  const b = (acte) => C.suggestSlot({type:'buletin', confidence:0.95}, acte, O);
  eq(b({}).slot, 'pag_buletin', 'üres dossziénál a károsulté (ő a gyakori eset)');
  eq(b({pag_buletin:[{url:'x'}]}).slot, 'vin_buletin', 'ha a károsulté megvan → a vétkesé');
  const tele = b({pag_buletin:[{url:'x'}], vin_buletin:[{url:'y'}]});
  eq(tele.slot, null, 'ha mindkettő megvan → NINCS javaslat');
  eq(tele.reason, 'ocupat', '  és az indoklás megmondja, miért');
  ok(tele.low === true, '  a felület nem választ előre');

  // a vétkesnek NINCS talon-verso: ilyenkor sincs kitalálás
  const tv = C.suggestSlot({type:'talon_verso', confidence:0.95}, {pag_talon_verso:[{url:'x'}]}, O);
  eq(tv.slot, null, 'talon verso: a vétkesnek nincs ilyen rése → nincs javaslat');
  eq(tv.reason, 'ocupat', '  indoklással');

  eq(C.suggestSlot({type:'talon_fata', confidence:0.95}, {pag_talon_fata:[{url:'x'}]}, O).slot,
     'vin_talon', 'a vétkes talonja EGY rés (nincs fata/verso)');
}

console.log('\n5. „Egyik vagy másik" csoport: a testvért ajánljuk');
{
  const c = C.suggestSlot({type:'constatare_amiabila', confidence:0.95},
                          {constatare_amiabila:[{url:'x'}]}, O);
  eq(c.slot, 'proces_verbal', 'ha a constatare megvan, a PV a szabad hely');
  eq(C.suggestSlot({type:'constatare_amiabila', confidence:0.95},
      {constatare_amiabila:[{url:'x'}], proces_verbal:[{url:'y'}]}, O).reason, 'ocupat',
     'ha mindkettő megvan → nincs javaslat');
}

console.log('\n6. A gyűjtőrés mindig fogad');
{
  ok(C.isMulti('foto_avarii', DOCS), 'a foto_avarii több fájlos');
  ok(!C.isMulti('polita_rca', DOCS), 'a poliță nem');
  const a = {foto_avarii:[{url:'1'},{url:'2'},{url:'3'}]};
  eq(C.suggestSlot({type:'foto_avarii', confidence:0.95}, a, O).slot, 'foto_avarii',
     'három fotó után is fogad negyediket');
}

console.log('\n7. A bizonytalan modellt NEM követjük vakon');
{
  const s = C.suggestSlot({type:'polita_rca', confidence:0.6}, {}, O);
  eq(s.slot, 'polita_rca', 'a javaslat megmarad — mint tipp');
  ok(s.low === true, '  de bizonytalanként jelölve');
  eq(s.reason, 'nesigur', '  az indoklás megmondja');
  ok(C.THRESHOLD === 0.85, 'a küszöb ugyanaz, amit a prompt is megkövetel');

  const n = C.suggestSlot({type:'altceva', confidence:0.99}, {}, O);
  eq(n.slot, null, 'az „altceva" SOHA nem kap rést');
  eq(n.reason, 'necunoscut', '  indoklással');
  eq(C.suggestSlot({type:'', confidence:0.9}, {}, O).slot, null, 'üres típus sem');
  eq(C.suggestSlot({}, {}, O).slot, null, 'hiányzó válasz sem');
}

console.log('\n8. A terv EGYBEN készül — két azonos irat nem üti egymást');
{
  const terv = C.plan([
    {type:'buletin', confidence:0.95},
    {type:'buletin', confidence:0.95},
    {type:'buletin', confidence:0.95}
  ], {}, O);
  eq(terv[0].slot, 'pag_buletin', '1. → károsult');
  eq(terv[1].slot, 'vin_buletin', '2. → vétkes');
  eq(terv[2].slot, null,          '3. → nincs hely, EMBER dönt');
  eq(terv[2].reason, 'ocupat', '  indoklással');

  // a gyűjtőrés viszont mindet elfogadja
  const t2 = C.plan([{type:'foto_avarii',confidence:.95},{type:'foto_avarii',confidence:.95}], {}, O);
  eq(t2.map(x=>x.slot), ['foto_avarii','foto_avarii'], 'két sérülésfotó ugyanabba a gyűjtőbe mehet');

  // a bizonytalan javaslat NEM foglal helyet a következő elől
  const t3 = C.plan([{type:'polita_rca',confidence:.5},{type:'polita_rca',confidence:.95}], {}, O);
  eq(t3[1].slot, 'polita_rca', 'a biztos javaslat megkapja a rést a bizonytalan ellenére');

  // az EREDETI dosszié nem módosul
  const acte = {};
  C.plan([{type:'buletin',confidence:.95}], acte, O);
  eq(Object.keys(acte).length, 0, 'a terv nem ír a dossziéba');
}

console.log('\n9. A legördülő minden rést felkínál, csoportosítva');
{
  const opts = C.slotOptions(DOCS);
  eq(opts.length, 19, 'mind a 19 rés');
  ok(opts.every(o => o.key && o.label && o.group), 'mindegyiknek van címkéje és csoportja');
  const kulcsok = opts.map(o => o.key);
  ok(new Set(kulcsok).size === kulcsok.length, 'nincs duplikált kulcs');
}

console.log('\n10. A hálózati hívás hitelesít, és hibánál nem hazudik');
{
  const w = { RPWAuth:{ fnHeaders:()=>({ 'Content-Type':'application/json', Authorization:'Bearer T' }) } };
  let kapott = null;
  const fakeFetch = async (url, opt) => { kapott = { url, opt };
    return { ok:true, status:200, json: async()=>({ type:'talon', confidence:0.9, label:'talon' }) }; };
  // a modul a saját globáljából olvassa az RPWAuth-ot
  const saved = global.RPWAuth; global.RPWAuth = w.RPWAuth;
  return C.classifyImage('data:image/jpeg;base64,/9j/AAA', { fetch:fakeFetch }).then(async r => {
    eq(kapott.url, '/.netlify/functions/classify', 'a funkciót hívja');
    ok(/Bearer T/.test(kapott.opt.headers.Authorization||''), 'tokent küld (a classify kötelezően kéri)');
    eq(r.type, 'talon_fata', 'a régi típust átfordítja');

    const hiba = await C.classifyImage('data:image/jpeg;base64,x',
      { fetch: async()=>({ ok:false, status:401 }) });
    eq(hiba.type, 'altceva', 'HTTP-hibánál altceva — nem talál ki típust');
    ok(/^http_/.test(hiba.error||''), '  és jelzi a hibát');

    const dob = await C.classifyImage('x', { fetch: async()=>{ throw new Error('net') } });
    eq(dob.type, 'altceva', 'kivételnél is altceva');
    global.RPWAuth = saved;
    tovabb();
  });
}

async function tovabb(){

console.log('\n11. A dosszié-oldal két élő hibája — javítva');
{
  const d = R('rpw-dosar.html');
  ok(/function toast\(m,e\)/.test(d), 'a toast() MOST MÁR létezik ezen az oldalon');
  ok(/t\.textContent=String/.test(d), '  és textContent-tel ír — az üzenet sosem HTML');
  ok(!/_stergeActaGo\(key,idx\)/.test(d), 'a delActa nem a nem létező `idx`-et adja át');
  ok(/onConfirm:function\(\)\{ _stergeActaGo\(key,ix\); \}/.test(d), '  hanem a kapott `ix`-et');
  ok(/arr\.splice\(idx,1\)/.test(d), 'a törlés a KAPOTT indexet vágja ki');
  ok(!/arr\.splice\(ix,1\)/.test(d), '  nem a nem létező `ix`-et (ami mindig az elsőt törölte)');
  ok(/if\(!\(idx>=0\)\|\|idx>=arr\.length\)return/.test(d), '  és tartományon kívülre nem nyúl');

  // a jsdom-próba: az oldal betöltődik, és a függvények tényleg ott vannak
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',
                        { url:'https://x.test/rpw-dosar.html', runScripts:'outside-only' });
  const win = dom.window;
  // RPW-001 ota a lap munkamenet nelkul meg sem epul fel (az or elrejti es
  // a loginra kuld). Ez a probaa a BESOROLAST meri, nem a belepetest —
  // ezert bejelentkezett emberrel indul.
  win.localStorage.setItem('rpw_auth', JSON.stringify({
    token:'t'.repeat(64), name:'Teszt', employeeId:'E1', shopId:'SHOP-A',
    rawRole:'Műszakvezető', role:'manager',
    can:{team:true,posts:true,open:true,reception:true,work:true,close:true,override:true,delete:true},
    exp: Date.now() + 9e6 }));
  win.supabase = { createClient: () => ({ rpc: async()=>({data:null,error:null}),
    from: ()=>({select:()=>({})}), storage:{ from:()=>({}) } }) };
  for (const m of d.matchAll(/<script src="(rpw-[^"]+)"><\/script>/g)) {
    try { win.eval(R(m[1])) } catch(e) {}
  }
  for (const m of d.matchAll(/<script>([\s\S]*?)<\/script>/g)) { try { win.eval(m[1]) } catch(e) {} }
  ok(typeof win.toast === 'function', 'valódi betöltéskor is definiált a toast');
  ok(typeof win.uploadActa === 'function', '  az uploadActa is');
  ok(typeof win.bulkActe === 'function', '  és a kötegelt feltöltés');
  ok(typeof win.RPWClassify === 'object', '  a besoroló modul betöltve');
}

console.log('\n12. EGYETLEN feltöltési út');
{
  const d = R('rpw-dosar.html');
  ok(/async function _uploadFileToSlot\(f,key\)/.test(d), 'közös feltöltő függvény');
  const feltoltes = (d.match(/sb\.storage\.from\(BUCKET\)\.upload\(/g)||[]).length;
  eq(feltoltes, 1, 'a tárolóba EGY helyről írunk (nem két külön úton)');
  ok(/arr\.push\(await _uploadFileToSlot\(files\[i\],key\)\)/.test(d), 'a résenkénti gomb ezt hívja');
  ok(/arr\.push\(await _uploadFileToSlot\(it\.file,it\.slot\)\)/.test(d), 'a kötegelt feltöltés is');
  ok(/RPWPhotos\.signedUrl/.test(d), 'és aláírt URL-t kér (a bucket privát)');
}

console.log('\n13. A felület semmit nem tölt fel jóváhagyás nélkül');
{
  const d = R('rpw-dosar.html');
  // a bulkActe csak besorol; a feltöltés a bulkConfirm-ban van
  const bulkActe = d.slice(d.indexOf('window.bulkActe='), d.indexOf('function _bulkSlotLabel'));
  ok(!/_uploadFileToSlot/.test(bulkActe), 'a besorolás NEM tölt fel');
  ok(!/_saveActe/.test(bulkActe), '  és nem is ment');
  ok(/it\.slot=t\.low\?null:t\.slot/.test(d), 'bizonytalan javaslatot NEM választ előre');
  const confirm = d.slice(d.indexOf('window.bulkConfirm='));
  ok(/_uploadFileToSlot/.test(confirm), 'a feltöltés a megerősítésben történik');
  ok(/bk_replace/.test(d), 'a felülírás VESZÉLYE ki van írva a sorra');
  ok(/escH\(T\('bk_/.test(d), 'a szövegek escape-elve kerülnek a HTML-be');
  ok(/escH\(it\.name\)/.test(d), 'a fájlnév is — az a felhasználótól jön');
}

console.log('\n14. A prompt a teljes szótárat tanítja');
{
  const p = R('functions/classify.js');
  const H = require(path.join(ROOT, 'functions', '_shared.js'));
  const hianyzo = H.CLASSIFY_TYPES.filter(t => p.indexOf(t) < 0);
  ok(hianyzo.length === 0, 'minden típus szerepel a promptban' + (hianyzo.length?' — '+hianyzo.join(', '):''));
  ok(/NU decide daca actul apartine pagubitului sau vinovatului/.test(p),
     'a prompt megtiltja a károsult/vétkes találgatását');
  ok(/confidence > 0\.85/.test(p), 'a küszöb a promptban is ott van');
  ok(/DOAR JSON/.test(p), 'és csak JSON-t kér');
}

await e2e();

console.log('\n' + (fail?'x ':'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail?1:0);
}

// ════════════════════════════════════════════════════════════════
//  15. VALÓDI OLDALKÓD: a kötegelt feltöltés végigfut jsdom-ban
//  ----------------------------------------------------------------
//  Nem szövegkeresés. A `bulkActe` és a `bulkConfirm` TÉNYLEGESEN
//  lefut, és rögzítjük, mi került a tárolóba és mikor.
// ════════════════════════════════════════════════════════════════
async function e2e(){
  console.log('\n15. A kötegelt feltöltés valódi lapkódon');
  const { JSDOM } = require('jsdom');
  const d = R('rpw-dosar.html');
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',
                        { url:'https://x.test/rpw-dosar.html', runScripts:'outside-only' });
  const win = dom.window;

  // ── a külvilág, amit a lap lát ────────────────────────────────
  const FELTOLTVE = [];                       // ide kerül minden tárolóírás
  const MENTVE = [];                          // és minden adatbázis-mentés
  win.URL.createObjectURL = () => 'blob:teszt';
  win.URL.revokeObjectURL = () => {};
  // A jsdom nem rajzol: a képtömörítés essen vissza az eredeti fájlra.
  win.Image = function(){ const o = {};
    Object.defineProperty(o, 'src', { set(){ setTimeout(()=>{ o.onerror && o.onerror() }, 0) } });
    return o; };
  // A lap INDULÁSKOR megkérdezi a szervert, hogy elég új-e (v4, fail-closed).
  // Ha erre nem jön értelmes válasz, a `rpw-guard.js` NULLÁZZA a configot, és
  // az oldal joggal megáll. Ezért itt egészséges szervert adunk alá — másképp
  // nem a kötegelt feltöltést mérnénk, hanem a verzióőrt.
  const CAP = { ok:true, schema_version:'007', rls_locked:true,
    business_gates_server_side:true, storage_mode:'private',
    rpcs:['rpw_jobs_list','rpw_job_get','rpw_patch_v3','rpw_transition','rpw_job_trash',
          'rpw_job_restore','rpw_job_purge','rpw2_session','rpw2_login','rpw_requirements'] };
  const sbStub = {
    rpc: async (n) => ({ data:(n==='rpw_server_capabilities'?CAP:null), error:null }),
    from: () => ({ select:()=>({ eq:()=>({ single:async()=>({data:null,error:null}) }) }) }),
    storage: { from: () => ({
      upload: async (path) => { FELTOLTVE.push(path); return { error:null } },
      createSignedUrl: async (path) => ({ data:{ signedUrl:'https://signed/'+path }, error:null })
    }) }
  };
  win.supabase = { createClient: () => sbStub };

  // A modell válasza fájlonként, sorban.
  const VALASZOK = [
    { type:'polita_rca',   confidence:0.97, label:'polita' },
    { type:'buletin',      confidence:0.95, label:'CI' },
    { type:'buletin',      confidence:0.95, label:'CI' },
    { type:'altceva',      confidence:0.10, label:'neclar' }
  ];
  let hivas = 0;
  win.fetch = async () => ({ ok:true, status:200, json: async () => VALASZOK[hivas++] || VALASZOK[0] });

  for (const m of d.matchAll(/<script src="(rpw-[^"]+)"><\/script>/g)) { try { win.eval(R(m[1])) } catch(e){} }
  for (const m of d.matchAll(/<script>([\s\S]*?)<\/script>/g))       { try { win.eval(m[1])    } catch(e){} }

  win.RPWPhotos = { signedUrl: async (sb, path) => 'https://signed/' + path };
  win.RPWDb = Object.assign(win.RPWDb || {}, {
    patchV2: async (sb, id, patch) => { MENTVE.push(JSON.parse(JSON.stringify(patch))); }
  });
  win.JOB = { id:'JOB-1', plate:'MS-01-AAA', damageType:'asig', dosarStatus:'deschid',
              flux:'doar_dosar', dosarActe:{}, phases:{} };

  // négy „fénykép" — a tartalom közömbös, a típusuk nem
  const F = n => new win.File([new win.Uint8Array([255,216,255])], n, { type:'image/jpeg' });
  const files = [F('a.jpg'), F('b.jpg'), F('c.jpg'), F('d.jpg')];
  const esemeny = { target:{ files, value:'x' } };

  await win.bulkActe(esemeny);

  eq(FELTOLTVE.length, 0, 'a besorolás után SEMMI nincs feltöltve');
  eq(MENTVE.length, 0,   '  és semmi nincs mentve');
  eq(hivas, 4, 'mind a négy fájl besorolásra ment');
  ok(!!win.document.getElementById('bulkOv'), 'a jóváhagyó ablak megnyílt');

  const sorok = win.document.querySelectorAll('#bulkOv .bulk-r');
  eq(sorok.length, 4, 'négy sor, fájlonként egy');
  const valasztok = win.document.querySelectorAll('#bulkOv select');
  eq(valasztok[0].value, 'polita_rca',  '1. fájl → poliță');
  eq(valasztok[1].value, 'pag_buletin', '2. fájl → károsult személyije');
  eq(valasztok[2].value, 'vin_buletin', '3. fájl → vétkes személyije (nem ütközik)');
  eq(valasztok[3].value, '',            '4. fájl → felismerhetetlen: ÜRESEN marad');

  // az ember felülbírál: a negyediket mégis a sérülésfotókhoz teszi
  win.bulkSet(3, 'foto_avarii');
  eq(win.document.querySelectorAll('#bulkOv select')[3].value, 'foto_avarii',
     'az emberi választás felülírja a javaslatot');

  await win.bulkConfirm();

  eq(FELTOLTVE.length, 4, 'megerősítés után mind a négy fájl feltöltve');
  ok(FELTOLTVE.every(p => p.indexOf('JOB-1/acte/') === 0), '  a munka saját mappájába');
  const acte = win.JOB.dosarActe;
  eq((acte.polita_rca||[]).length,  1, 'a poliță résben egy fájl');
  eq((acte.pag_buletin||[]).length, 1, 'a károsult személyijénél egy');
  eq((acte.vin_buletin||[]).length, 1, 'a vétkesénél egy');
  eq((acte.foto_avarii||[]).length, 1, 'és az emberi választás helyén is egy');
  ok((acte.polita_rca||[])[0].url.indexOf('https://signed/') === 0, 'aláírt URL-lel (a bucket privát)');
  eq(MENTVE.length, 1, 'EGYETLEN mentés a négy fájlra — nem négy külön kör');
  ok(!win.document.getElementById('bulkOv'), 'az ablak bezárult');
}
