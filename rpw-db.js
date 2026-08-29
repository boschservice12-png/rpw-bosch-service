/* BUILD: P0.3-TENANT-GUARDED 2026-08-23 */
/* ============================================================
   rpw-db.js — AUTH-TUDATOS ADATRÉTEG (egyetlen belépési pont a DB-hez)
   ------------------------------------------------------------
   Ha RPWAuth.required() === false (ALAPBÓL):
     → a RÉGI anon útvonal, VÁLTOZATLAN viselkedéssel.
   Ha RPWAuth.required() === true (0008 auth aktiválva):
     → token-ellenőrzött SECURITY DEFINER függvények (rpw_*_secure).

   Így az AUTH_REQUIRED=false esetben SEMMI nem változik; a secure ág
   csak az auth élesítése után aktiválódik. Minden metódus a supabase
   {data, error} alakot adja vissza, hogy a hívó kódot ne kelljen átírni.

   Node + böngésző kompatibilis. Globál: window.RPWDb
   ============================================================ */
(function(root){
  'use strict';
  function auth(){ return root.RPWAuth || null; }

  // ── RPW-001 (2026-08-29) — AZ ADATREEG FAIL-CLOSED ───────────────
  // Ez a fajl az EGYETLEN belepesi pont az adatbazishoz. Eddig, ha a
  // munkamenet-or elbukott, az oldal az atiranyitas alatt MEG lefuttatta
  // a listazast es a mentest — a halozaton tehat elment a keres, es a
  // valasz meg is erkezett. Mostantol: nincs munkamenet, nincs egyetlen
  // olvasas es egyetlen iras sem. Egy helyen, minden oldalra.
  //
  // FONTOS: ez KLIENSOLDALI zar. Nem helyettesiti az adatbazis-oldali
  // vedelmet (RLS) — csak azt garantalja, hogy az ALKALMAZAS nem ad ki
  // adatot bejelentkezes nelkul.
  function zarva(){
    try{ var a=auth(); return !!(a && a.required() && !a.session()); }
    catch(e){ return false; }
  }
  var ZAR_HIBA={ code:'auth_required',
                 message:'Sesiune expirată. Autentificați-vă din nou.' };
  function zart(fn){
    return async function(){
      if(zarva()) return { data:null, error:ZAR_HIBA };
      return await fn.apply(null, arguments);
    };
  }
  // ── EGYESÍTETT BIZTONSÁGOS ÚT (2026-08-24) ──────────────────────
  // KÉT párhuzamos „secure" ág volt ebben a fájlban:
  //   · useSecure() → rpw_patch_secure / rpw_soft_delete / rpw_restore / rpw_purge
  //   · useV3()     → rpw_patch_v3 / rpw_job_trash / rpw_job_restore / rpw_job_purge
  // Az első nyert, mert előbb volt ellenőrizve — DE:
  //   1. azok a függvények NEM LÉTEZNEK az adatbázisban (ellenőrizve),
  //      tehát AUTH_REQUIRED=true mellett minden mentés és törlés elszállt volna;
  //   2. nem dolgozta fel a szerver {ok:false} válaszát, így az elutasítás
  //      SIKERNEK látszott — pont a „hibánál álljon meg" elv ellen.
  // Mostantól EGY út van, és minden válasz átmegy az unwrap()-en.
  function useSecure(){ var a=auth(); return !!(a && a.required() && a.token()); }
  function secureOn(){ return useSecure() || useV3(); }
  function tok(){ var a=auth(); return a?a.token():null; }
  function nowISO(){ try{ return new Date().toISOString(); }catch(e){ return null; } }

  // ── ÍRÁS: teljes job patch (data JSONB deep-merge) ──
  async function patch(sb, job){
    // J (2026-08-24): verziózár a hitelesített úton is, és unwrap.
    if(secureOn()){
      var r0=unwrap(await sb.rpc('rpw_patch_v3', {p_token:tokenOf(), p_id:job.id, p_patch:job,
        p_expected_version:(typeof job.version==='number'?job.version:null), p_phase:null}));
      return r0.error?{data:null, error:r0.error}:{data:r0.data, error:null};
    }
    return await sb.rpc('rpw_patch', {p_id:job.id, p_patch:job});
  }
  // rpw_patch_v2 utat használó helyek (dosar akták, ügyfél-feltöltő)
  // opts.rpc: felülírható RPC-név. ALAP: RPW_CFG.PATCH_RPC || 'rpw_patch_v2'
  //   → változatlan élő viselkedés. A valódi verzió-zárt a 0013 (rpw_patch_v3)
  //   alkalmazása UTÁN a RPW_CFG.PATCH_RPC='rpw_patch_v3' kapcsolja be.
  // ── KI CSINALTA (2026-08-23) ────────────────────────────────────
  // Eddig minden mentes 'service' nevre ment — 20 ember, egy nev.
  // Ha valaki be van jelentkezve, a VALODI neve kerul a naploba.
  // Bejelentkezes nelkul marad a regi viselkedes (nem torik el semmi).
  // ── P0.3 (2026-08-23) — SZERVEROLDALI BÉRLŐVÉDELEM ───────────────
  // A kliensoldali shop_id-szűrés NEM biztonság: az "anon rw" RLS-szabály
  // (qual: true) miatt bárki, aki ismerte az anon kulcsot, más cég munkáját
  // olvashatta, módosíthatta és VÉGLEG törölhette — közvetlen táblaművelettel.
  // MOSTANTÓL: minden művelet token-alapú RPC-n megy, a shop_id a
  // MUNKAMENETBŐL jön. Kliensből érkező shop_id-t a szerver nem fogad el.
  // A régi út megmarad: PATCH_RPC:'rpw_patch_v2' → azonnali visszaállás.
  function tokenOf(){
    try{ var A=root.RPWAuth; return (A&&A.token&&A.token())||null }catch(e){ return null }
  }
  function useV3(){
    try{ return (root.RPW_CFG&&root.RPW_CFG.PATCH_RPC)==='rpw_patch_v3' }catch(e){ return false }
  }
  // ── 9 (v3) — A HIBAKÓD NEM VESZHET EL ────────────────────────────
  // KORÁBBAN: {error:{message:d.error}} — a `code` eltűnt, és vele a
  // `server_version` meg a `missing` lista is. Így a konfliktus-
  // párbeszéd nem tudta megkülönböztetni a version_conflict-ot egy
  // jogosultsági hibától.
  // MOSTANTÓL egységes hibaobjektum:
  //   { code, message, serverVersion, missing, details }
  function unwrap(res){
    if(res && res.error){
      // transport-szintű hiba (hálózat, PostgREST)
      var t = res.error;
      return { error: { code: t.code || 'transport',
                        message: t.message || String(t),
                        details: t } };
    }
    var d = res && res.data;
    if(typeof d === 'string'){ try{ d = JSON.parse(d) }catch(e){ d = null } }
    if(!d) return { error: { code:'empty', message:'Răspuns gol de la server.' } };
    if(d.ok !== true){
      return { error: {
        code:          d.error || 'denied',
        message:       d.message || d.error || 'Operațiunea a fost respinsă.',
        serverVersion: (typeof d.server_version === 'number' ? d.server_version : null),
        missing:       (Array.isArray(d.missing) ? d.missing : null),
        need:          d.need || null,
        details:       d
      } };
    }
    return { data: d };
  }
  function actorOf(opts){
    try{
      var AU=root.RPWAuth;
      if(AU && typeof AU.name==='function'){
        var n=AU.name();
        if(n && String(n).trim()) return String(n).trim();
      }
    }catch(e){}
    return (opts && opts.actor) || null;
  }
  function patchRpc(opts){
    return (opts&&opts.rpc) || (root.RPW_CFG&&root.RPW_CFG.PATCH_RPC) || 'rpw_patch_v2';
  }
  async function patchV2(sb, id, partial, opts){
    opts=opts||{};
    // J: a hitelesített út verziózárral és unwrap-pel (lásd a v3 ágat lentebb)
    // A v3 MAS szignaturaju: tokent var, es az actort/shop_id-t maga vezeti le.
    // A v2 megmarad valtozatlanul — igy a visszaallas egy config-sor.
    if(secureOn()){
      var r=unwrap(await sb.rpc('rpw_patch_v3', {
        p_token: tokenOf(), p_id: id, p_patch: partial,
        p_expected_version: (opts.expected!==undefined?opts.expected:null),
        p_phase: opts.phase||null }));
      if(r.error) return {data:null, error:r.error};
      return {data:r.data, error:null};
    }
    return await sb.rpc(patchRpc(opts), {p_id:id, p_patch:partial, p_expected_version:(opts.expected!==undefined?opts.expected:null), p_actor:actorOf(opts), p_phase:opts.phase||null});
  }

  // ── TÖBB-BÉRLŐS SZŰRÉS (2026-08-23) ────────────────────────────
  // Az rpw_jobs mostantól shop_id-t hordoz. MINDEN olvasás a saját
  // szervizre szűr — enélkül egy második cég belépésekor mindenki
  // mindenkiét látná. A szerveroldali RPC-k (secure mód) a tokenből
  // vezetik le a shop-ot, ott nem kell külön szűrni.
  function shopId(){
    try{ return (window.RPW_CFG&&window.RPW_CFG.SHOP_ID)||null }catch(e){ return null }
  }
  function scoped(q){
    var sid=shopId();
    return sid ? q.eq('shop_id', sid) : q;
  }

  // ── OLVASÁS ──
  // Egy sor lekérése (a supabase .single() alakot adja vissza: {data:row, error})
  async function getRow(sb, id, cols){
    // A régi useSecure() ág eltávolítva: nem unwrap-elt, és saját
    // hibaszöveget gyártott a szerveré helyett. EGY út maradt.
    if(secureOn()){
      var r=unwrap(await sb.rpc('rpw_job_get',{p_token:tokenOf(), p_id:id}));
      if(r.error) return {data:null, error:r.error};
      return {data:{id:r.data.id, data:r.data.data, updated_at:r.data.updated_at, version:r.data.version}, error:null};
    }
    return await scoped(sb.from('rpw_jobs').select(cols||'id,data,updated_at,version').eq('id',id)).single();
  }
  // Aktív (nem archivált) lista
  async function listActive(sb, cols){
    // 4 (v3): a régi useSecure() ág TÖRÖLVE — nem unwrap-elt, így a
    // {ok:false} szerverválasz SIKERES ADATKÉNT ment vissza a hívónak.
    if(secureOn()){
      var r=unwrap(await sb.rpc('rpw_jobs_list',{p_token:tokenOf(), p_trashed:false}));
      if(r.error) return {data:null, error:r.error};
      return {data:r.data.rows||[], error:null};
    }
    return await scoped(sb.from('rpw_jobs').select(cols||'id,data,updated_at,version').is('deleted_at',null)).order('updated_at',{ascending:false});
  }
  // Archivált (Coș) lista
  async function listTrashed(sb, cols){
    // 5 (v3): a `rpw_jobs_trashed` RPC NEM LÉTEZIK. Egyetlen listázó
    // van: rpw_jobs_list(p_token, p_trashed).
    if(secureOn()){
      var r=unwrap(await sb.rpc('rpw_jobs_list',{p_token:tokenOf(), p_trashed:true}));
      if(r.error) return {data:null, error:r.error};
      return {data:r.data.rows||[], error:null};
    }
    return await scoped(sb.from('rpw_jobs').select(cols||'id,data,deleted_at').not('deleted_at','is',null)).order('deleted_at',{ascending:false});
  }

  // ── ÁLLAPOT-OSZLOP MŰVELETEK ──
  async function softDelete(sb, id){
    if(secureOn()){
      var r=unwrap(await sb.rpc('rpw_job_trash',{p_token:tokenOf(), p_id:id}));
      return r.error?{error:r.error}:{data:r.data, error:null};
    }
    return await scoped(sb.from('rpw_jobs').update({deleted_at:nowISO()}).eq('id',id));
  }
  async function restore(sb, id){
    if(secureOn()){
      var r=unwrap(await sb.rpc('rpw_job_restore',{p_token:tokenOf(), p_id:id}));
      return r.error?{error:r.error}:{data:r.data, error:null};
    }
    return await scoped(sb.from('rpw_jobs').update({deleted_at:null}).eq('id',id));
  }
  async function purge(sb, id){
    if(secureOn()){
      var r=unwrap(await sb.rpc('rpw_job_purge',{p_token:tokenOf(), p_id:id}));
      return r.error?{error:r.error}:{data:r.data, error:null};
    }
    return await scoped(sb.from('rpw_jobs').delete().eq('id',id));
  }
  async function purgeAllTrashed(sb){
    // A rpw_purge_all_trashed nem létezik az adatbázisban — egyesével törlünk,
    // így minden törlés külön auditsort kap.
    if(secureOn()){
      var lst=await listTrashed(sb);
      var rows=(lst&&lst.data)||[];
      for(var i=0;i<rows.length;i++){ await purge(sb, rows[i].id); }
      return {data:{purged:rows.length}, error:null};
    }
    return await scoped(sb.from('rpw_jobs').delete().not('deleted_at','is',null));
  }

  // Minden adatmuvelet a zaron keresztul megy ki. A segedfuggvenyek
  // (shopId, actorOf, ...) nem nyulnak adathoz, azok valtozatlanok.
  var API={ shopId:shopId, actorOf:actorOf, useV3:useV3, tokenOf:tokenOf, useSecure:useSecure,
            zarva:zarva,
            patch:          zart(patch),
            patchV2:        zart(patchV2),
            getRow:         zart(getRow),
            listActive:     zart(listActive),
            listTrashed:    zart(listTrashed),
            softDelete:     zart(softDelete),
            restore:        zart(restore),
            purge:          zart(purge),
            purgeAllTrashed:zart(purgeAllTrashed) };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWDb=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
