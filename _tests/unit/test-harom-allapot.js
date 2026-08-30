// ════════════════════════════════════════════════════════════════
//  A HÁROM ÁLLAPOT — Ferenc modellje (2026-08-30)
//  ----------------------------------------------------------------
//  1. AVIZARE DAUNĂ (flux=doar_dosar): a szerviz nem javít, csak GYŰJT
//     és ÁTAD. Iratok + 6 autó-fotó + kárfotók, EGY fájlban, amit a
//     biztosító portáljára másolnak. Az autó sokszor ott sincs.
//  2. DESCHIDE DOSAR = RECEPCIÓ (flux=reparatie): az avizare fotói +
//     OCR + a recepció kitöltése. Innen megy tovább a 7 fázis.
//  3. MAGÁNÜGY (damageType=auto): a TELJES recepció-lap; az ügyféladat
//     fakultatív, a fotók kötelezők.
//
//  A HIBA, AMIT EZ JAVÍT: a fázis-szabályok nem ismerték a „csak
//  dosszié" esetet — a `doar_dosar` szó NULLASZOR fordult elő a
//  rpw-workflow.js-ben. Ezért egy iratgyűjtő dossziétól is műhelyi
//  bevételezést kért (talon-fotó, 6 áttekintő kép, elem-státuszok,
//  damage report). 2026-08-30-án 33 munkából 18 állt ezen.
//
//  A HÍD: az iratlistába feltöltött hat autó-fotó UGYANAZ a hat kép,
//  amit a recepció vár. A híd OLVASÁSKOR húzódik meg — nem másolunk
//  adatot, így nincs elavuló másolat, és visszafordítható.
// ════════════════════════════════════════════════════════════════
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..','..');

let pass=0, fail=0;
const ok=(c,m)=>{ c?pass++:(fail++,console.log('  x '+m)); };
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e), m+'  got='+JSON.stringify(g));

// az ELES iratlista kell hozza
global.window=global; global.location={protocol:'https:',href:'https://x/'};
eval(fs.readFileSync(path.join(ROOT,'rpw-config.js'),'utf8'));
const W=require(path.join(ROOT,'rpw-workflow.js'));

const HAT_FOTO=['foto_fata','foto_spate','foto_stanga','foto_dreapta','foto_serie_caroserie','foto_km'];
const IRATOK=['constatare_amiabila','pag_buletin','pag_talon_fata','pag_talon_verso',
              'pag_permis_fata','pag_permis_verso','declaratie_dauna','polita_rca',
              'vin_buletin','vin_talon','vin_permis'];
const MIND=IRATOK.concat(HAT_FOTO).concat(['foto_avarii']);
const acte=k=>Object.fromEntries(k.map(x=>[x,[{url:'https://s/x.jpg',path:'p/x.jpg'}]]));

const avizare=k=>({id:'A', flux:'doar_dosar', doarDosar:true, damageType:'asig',
  dosarStatus:'deschid', dosarActe:acte(k), photos:[], elements:{},
  phase:1, phases:{1:{status:'pending'}}});
const javitas=k=>({id:'J', flux:'reparatie', doarDosar:false, damageType:'asig',
  dosarStatus:'deschid', dosarActe:acte(k), photos:[], elements:{},
  phase:1, phases:{1:{status:'pending'}}});

console.log('\n1. A HAT autó-fotó: 4 oldal + alvázszám + kilométeróra');
{
  const DA=global.RPW_DAUNA_DOCS||[];
  const fotoSlotok=[];
  DA.filter(g=>g.photo).forEach(g=>g.items.forEach(i=>fotoSlotok.push(i.key)));
  HAT_FOTO.forEach(k=>ok(fotoSlotok.indexOf(k)>=0, 'az iratlistában van rekesz erre: '+k));
  ok(fotoSlotok.indexOf('foto_km')>=0, 'a KILOMETRAJ rekesz felvéve (ez hiányzott)');
  ok(fotoSlotok.indexOf('foto_avarii')>=0, '  a kárfotó külön rekesz, a hat FÖLÖTT');
}

console.log('\n2. A HÍD — egy fotózás, két helyre');
{
  eq(W.overviewPhotoCount(avizare(HAT_FOTO)), 6,
     'a hat irat-fotó a recepció hat áttekintő fotójaként számít');
  eq(W.overviewPhotoCount(avizare(['foto_fata','foto_spate'])), 2, '  kettő az kettő');
  eq(W.overviewPhotoCount({}), 0, '  üres munkán nulla');

  // a REGI ut valtozatlanul mukodik
  eq(W.overviewPhotoCount({photoKeys:{ov_0:1,ov_1:1,ov_2:1,ov_3:1,ov_4:1,ov_5:1}}), 6,
     'a régi, indexelt photoKeys ugyanúgy hat');
  eq(W.overviewPhotoCount({photoKeys:{ov_front:1,ov_back:1,ov_left:1,ov_right:1,ov_serieCaros:1,ov_km:1}}), 6,
     '  a nevesített kulcsok is');

  // NEM szamoljuk ketszer ugyanazt a poziciot
  eq(W.overviewPhotoCount({photoKeys:{ov_0:1,ov_front:1}, dosarActe:acte(['foto_fata'])}), 1,
     'ugyanaz a pozíció három forrásból is EGY — nincs duplán számolás');

  // vegyes
  eq(W.overviewPhotoCount({photoKeys:{ov_0:1,ov_1:1,ov_2:1},
      dosarActe:acte(['foto_dreapta','foto_serie_caroserie','foto_km'])}), 6,
     'három kulcsból + három iratból is kijön a hat');
}

console.log('\n3. A talon is átjön az iratlistából');
{
  const j=javitas(HAT_FOTO.concat(['pag_talon_fata']));
  const hiany=W.canCompletePhase(j,1).missing;
  ok(hiany.indexOf('wf_talon_missing')<0, 'a pag_talon_fata elfogadható talon-fotóként');
  ok(hiany.indexOf('wf_overview_missing')<0, '  és a hat áttekintő fotó is megvan');
}

console.log('\n4. AVIZARE: akkor kész, amikor a FÁJL elkészíthető');
{
  const teljes=W.canCompletePhase(avizare(MIND),1);
  eq(teljes.ok, true, 'hiánytalan iratlistával a dosszié LEZÁRHATÓ');
  eq(teljes.missing, [], '  és nincs mit felsorolni');

  const nincsKm=W.canCompletePhase(avizare(MIND.filter(k=>k!=='foto_km')),1);
  eq(nincsKm.ok, false, 'egyetlen hiányzó fotó is megállítja');
  eq(nincsKm.missing, ['wf_acte_incomplete'], '  és megnevezi az okot');
  eq(W.acteHianyzo(avizare(MIND.filter(k=>k!=='foto_km'))),
     ['Foto kilometraj / Kilometraj (bord)'], '  tételesen is megmondja, mi hiányzik');

  // ES AMIT NEM KER
  const m=W.canCompletePhase(avizare(MIND),1).missing;
  ['wf_elements_incomplete','wf_damage_report_missing','wf_proof_photo_missing','wf_talon_missing']
    .forEach(k=>ok(m.indexOf(k)<0, '  NEM kér műhelyi bevételezést: '+k));
}

console.log('\n5. JAVÍTÁS: a recepció TOVÁBBRA IS kötelező');
{
  const j=W.canCompletePhase(javitas(MIND),1);
  eq(j.ok, false, 'hiánytalan iratlista MÉG NEM elég a javítási úton');
  ok(j.missing.indexOf('wf_elements_incomplete')>=0, '  az elem-státuszok kellenek');
  ok(j.missing.indexOf('wf_damage_report_missing')>=0, '  és a damage report is');
}

console.log('\n6. A „csak dosszié" felismerése — a lappal AZONOS szabály');
{
  ok(W.csakDosszie({flux:'doar_dosar'})===true, 'flux=doar_dosar');
  ok(W.csakDosszie({flux:null,doarDosar:true})===true, '  a régi, flux nélküli alak is');
  ok(W.csakDosszie({flux:'reparatie',doarDosar:true})===false,
     '  de a flux ERŐSEBB: reparatie az reparatie');
  ok(W.csakDosszie({flux:'reparatie'})===false, 'reparatie nem csak-dosszié');
  ok(W.csakDosszie({})===false, '  üres munka sem');
  ok(W.csakDosszie(null)===false, '  és a null sem dob');
}

console.log('\n7. A híd nem ír adatot — visszafordítható');
{
  const j=avizare(HAT_FOTO);
  const elotte=JSON.stringify(j);
  W.canCompletePhase(j,1);
  W.overviewPhotoCount(j);
  // a migrateJob normalizal (phases stb.), de photoKeys-t NEM gyarthat a hidbol
  ok(!j.photoKeys || Object.keys(j.photoKeys).length===0,
     'a híd NEM írt photoKeys-t — nincs elavuló másolat');
  ok(JSON.stringify(j.dosarActe)===JSON.stringify(avizare(HAT_FOTO).dosarActe),
     '  és az iratlistához sem nyúlt');
}

console.log('\n' + (fail ? 'x ' : 'OK ') + pass + ' pass / ' + fail + ' fail');
process.exit(fail?1:0);
