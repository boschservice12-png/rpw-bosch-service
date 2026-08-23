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
  function useSecure(){ var a=auth(); return !!(a && a.required() && a.token()); }
  function tok(){ var a=auth(); return a?a.token():null; }
  function nowISO(){ try{ return new Date().toISOString(); }catch(e){ return null; } }

  // ── ÍRÁS: teljes job patch (data JSONB deep-merge) ──
  async function patch(sb, job){
    if(useSecure()) return await sb.rpc('rpw_patch_secure', {p_id:job.id, p_patch:job, p_token:tok()});
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
  function unwrap(res){
    if(res&&res.error) return {error:res.error};
    var d=res&&res.data;
    if(typeof d==='string'){ try{ d=JSON.parse(d) }catch(e){ d=null } }
    if(!d) return {error:{message:'empty'}};
    if(d.ok!==true) return {error:{message:d.error||'denied'}};
    return {data:d};
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
    if(useSecure()) return await sb.rpc('rpw_patch_secure', {p_id:id, p_patch:partial, p_token:tok()});
    // A v3 MAS szignaturaju: tokent var, es az actort/shop_id-t maga vezeti le.
    // A v2 megmarad valtozatlanul — igy a visszaallas egy config-sor.
    if(useV3()){
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
    if(useSecure()){
      var r=await sb.rpc('rpw_job_get', {p_token:tok(), p_id:id});
      if(r && r.error) return {data:null, error:r.error};
      var row=(r && r.data && r.data.length)?r.data[0]:null;
      return {data:row, error:(row?null:{message:'not found'})};
    }
    if(useV3()){
      var r=unwrap(await sb.rpc('rpw_job_get',{p_token:tokenOf(), p_id:id}));
      if(r.error) return {data:null, error:r.error};
      return {data:{id:r.data.id, data:r.data.data, updated_at:r.data.updated_at, version:r.data.version}, error:null};
    }
    return await scoped(sb.from('rpw_jobs').select(cols||'id,data,updated_at,version').eq('id',id)).single();
  }
  // Aktív (nem archivált) lista
  async function listActive(sb, cols){
    if(useSecure()){
      var r=await sb.rpc('rpw_jobs_list', {p_token:tok()});
      return {data:(r&&r.data)||[], error:r?r.error:null};
    }
    if(useV3()){
      var r=unwrap(await sb.rpc('rpw_jobs_list',{p_token:tokenOf(), p_trashed:false}));
      if(r.error) return {data:null, error:r.error};
      return {data:r.data.rows||[], error:null};
    }
    return await scoped(sb.from('rpw_jobs').select(cols||'id,data,updated_at,version').is('deleted_at',null)).order('updated_at',{ascending:false});
  }
  // Archivált (Coș) lista
  async function listTrashed(sb, cols){
    if(useSecure()){
      var r=await sb.rpc('rpw_jobs_trashed', {p_token:tok()});
      return {data:(r&&r.data)||[], error:r?r.error:null};
    }
    if(useV3()){
      var r=unwrap(await sb.rpc('rpw_jobs_list',{p_token:tokenOf(), p_trashed:true}));
      if(r.error) return {data:null, error:r.error};
      return {data:r.data.rows||[], error:null};
    }
    return await scoped(sb.from('rpw_jobs').select(cols||'id,data,deleted_at').not('deleted_at','is',null)).order('deleted_at',{ascending:false});
  }

  // ── ÁLLAPOT-OSZLOP MŰVELETEK ──
  async function softDelete(sb, id){
    if(useSecure()) return await sb.rpc('rpw_soft_delete', {p_id:id, p_token:tok()});
    if(useV3()){
      var r=unwrap(await sb.rpc('rpw_job_trash',{p_token:tokenOf(), p_id:id}));
      return r.error?{error:r.error}:{data:r.data, error:null};
    }
    return await scoped(sb.from('rpw_jobs').update({deleted_at:nowISO()}).eq('id',id));
  }
  async function restore(sb, id){
    if(useSecure()) return await sb.rpc('rpw_restore', {p_id:id, p_token:tok()});
    if(useV3()){
      var r=unwrap(await sb.rpc('rpw_job_restore',{p_token:tokenOf(), p_id:id}));
      return r.error?{error:r.error}:{data:r.data, error:null};
    }
    return await scoped(sb.from('rpw_jobs').update({deleted_at:null}).eq('id',id));
  }
  async function purge(sb, id){
    if(useSecure()) return await sb.rpc('rpw_purge', {p_id:id, p_token:tok()});
    if(useV3()){
      var r=unwrap(await sb.rpc('rpw_job_purge',{p_token:tokenOf(), p_id:id}));
      return r.error?{error:r.error}:{data:r.data, error:null};
    }
    return await scoped(sb.from('rpw_jobs').delete().eq('id',id));
  }
  async function purgeAllTrashed(sb){
    if(useSecure()) return await sb.rpc('rpw_purge_all_trashed', {p_token:tok()});
    return await scoped(sb.from('rpw_jobs').delete().not('deleted_at','is',null));
  }

  var API={ shopId:shopId, actorOf:actorOf, useV3:useV3, tokenOf:tokenOf, useSecure:useSecure, patch:patch, patchV2:patchV2, getRow:getRow, listActive:listActive,
            listTrashed:listTrashed, softDelete:softDelete, restore:restore, purge:purge, purgeAllTrashed:purgeAllTrashed };
  if(typeof module!=='undefined' && module.exports){ module.exports=API; }
  root.RPWDb=API;
})(typeof self!=='undefined'?self:(typeof window!=='undefined'?window:globalThis));
