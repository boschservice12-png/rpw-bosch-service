// ════════════════════════════════════════════════════════════════
//  rpw-storage — A FOTÓTÁROLÓ KAPUJA (RPW-003)
//  ----------------------------------------------------------------
//  A kliens SOHA nem fér közvetlenül a tárolóhoz. Minden fotó-művelet
//  ide jön; a kapu ellenőriz, és csak időkorlátos, egyetlen fájlra szóló
//  aláírt URL-t ad ki. A service-kulcs a Supabase futtatókörnyezetében
//  marad (Edge Function), a kliens soha nem látja.
//
//  Ez a fájl TISZTA LOGIKA: nincs benne hálózat, se Deno, se Node API.
//  A függőségeket (rpc, sign, audit) a hívó adja — így Node-ban is
//  tesztelhető, és a Deno-belépési pont (index.ts) csak bekötés.
//
//  Műveletek:
//    dolgozó (munkamenet-token kell):  sign-upload · sign-read · remove
//    ügyfél  (WhatsApp-link, token nélkül): client-sign-upload · client-sign-read
//
//  Hiba esetén a válasz NEM árulja el, hogy a munka létezik-e (403 / not_allowed).
// ════════════════════════════════════════════════════════════════

export const LIMITS = { readPaths: 60, removePaths: 20, readExpiresSec: 3600 };

// RPW-<uuid> — a rpw-util.js jobId() formátuma
const JOB_RE  = /^RPW-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// a munka mappáján belüli rész: betű, szám, _ . - és legfeljebb egy almappa
const REST_RE = /^(?:[A-Za-z0-9_-]{1,40}\/)?[A-Za-z0-9_.-]{1,160}$/;
// az ügyfél-feltöltő (rpw-upload.html) által adott nevek: közvetlenül a munka mappájában
const CLIENT_NAME_RE = /^(?:acta_[A-Za-z0-9_-]{1,60}|client)_[0-9]{10,16}_[a-z0-9]{1,8}\.[a-z0-9]{1,6}$/;

export function parsePath(p){
  if (typeof p !== 'string' || p.length > 220) return null;
  if (p.indexOf('..') >= 0 || p.indexOf('//') >= 0 || p.charAt(0) === '/') return null;
  const i = p.indexOf('/');
  if (i <= 0) return null;
  const jobId = p.slice(0, i), rest = p.slice(i + 1);
  if (!JOB_RE.test(jobId) || !REST_RE.test(rest)) return null;
  return { jobId, rest, path: p };
}

export function isClientName(rest){ return CLIENT_NAME_RE.test(rest); }

function unwrap(v){
  if (typeof v === 'string'){ try { return JSON.parse(v); } catch(e){ return null; } }
  return v;
}

const deny  = (code) => ({ status: 403, body: { ok:false, error: code || 'not_allowed' } });
const bad   = (code) => ({ status: 400, body: { ok:false, error: code || 'bad_request' } });
const fail  = (code) => ({ status: 502, body: { ok:false, error: code || 'storage_error' } });
const unauth = ()    => ({ status: 401, body: { ok:false, error: 'unauthorized' } });

async function session(deps, token){
  if (typeof token !== 'string' || token.length < 32) return null;
  const s = unwrap(await deps.rpc('rpw2_session', { p_token: token }));
  if (!s || s.ok !== true || !s.employee || !s.employee.shop_id) return null;
  return s.employee;
}

async function ownsJob(deps, token, jobId){
  const r = unwrap(await deps.rpc('rpw_job_get', { p_token: token, p_id: jobId }));
  return !!(r && r.ok === true);
}

async function clientJobOpen(deps, jobId){
  const r = unwrap(await deps.rpc('rpw_client_job_get', { p_job_id: jobId }));
  return !!(r && r.ok === true);
}

function parseAll(paths, max){
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > max) return null;
  const out = [];
  for (const p of paths){ const x = parsePath(p); if (!x) return null; out.push(x); }
  return out;
}

// ── a belépési pont ──────────────────────────────────────────────
// req: { op, token?, path?, paths?, contentType? }
// deps: { rpc(name,args), sign:{ upload(path,{upsert}), read(paths,exp), remove(paths) }, audit(row) }
export async function handle(req, deps){
  if (!req || typeof req !== 'object') return bad();
  const op = req.op;

  // ── DOLGOZÓ ──────────────────────────────────────────────────
  if (op === 'sign-upload' || op === 'sign-read' || op === 'remove'){
    const emp = await session(deps, req.token);
    if (!emp) return unauth();

    if (op === 'sign-upload'){
      const x = parsePath(req.path); if (!x) return bad('bad_path');
      if (!(await ownsJob(deps, req.token, x.jobId))) return deny();
      const s = await deps.sign.upload(x.path, { upsert: true });
      if (!s || s.error || !s.token) return fail();
      return { status: 200, body: { ok:true, path: x.path, token: s.token, signedUrl: s.signedUrl || null } };
    }

    const max = op === 'remove' ? LIMITS.removePaths : LIMITS.readPaths;
    const xs = parseAll(req.paths, max); if (!xs) return bad('bad_paths');
    for (const j of new Set(xs.map(x => x.jobId))){
      if (!(await ownsJob(deps, req.token, j))) return deny();
    }
    const paths = xs.map(x => x.path);

    if (op === 'sign-read'){
      const r = await deps.sign.read(paths, LIMITS.readExpiresSec);
      if (!r || r.error || !Array.isArray(r.data)) return fail();
      return { status: 200, body: { ok:true, urls: r.data.map(u => ({ path: u.path, signedUrl: u.signedUrl || null })) } };
    }

    // remove — sikertelen törléshez NEM írunk auditsort
    const r = await deps.sign.remove(paths);
    if (!r || r.error) return fail();
    for (const j of new Set(xs.map(x => x.jobId))){
      try {
        await deps.audit({ job_id: j, tenant_id: emp.shop_id, actor: 'rpw2:' + (emp.name || emp.id),
                           action: 'photo_remove',
                           patch: { paths: xs.filter(x => x.jobId === j).map(x => x.path) } });
      } catch(e){ /* a törlés megtörtént; az audit hibáját a hívó naplózza */
        return { status: 200, body: { ok:true, removed: paths.length, audit: 'failed' } };
      }
    }
    return { status: 200, body: { ok:true, removed: paths.length } };
  }

  // ── ÜGYFÉL (WhatsApp-link) — csak a saját dosszié, csak az ügyfél-nevek ──
  if (op === 'client-sign-upload'){
    const x = parsePath(req.path); if (!x) return bad('bad_path');
    if (!isClientName(x.rest)) return deny();
    if (!(await clientJobOpen(deps, x.jobId))) return deny();
    // upsert:false — az ügyfél meglévő fájlt NEM írhat felül
    const s = await deps.sign.upload(x.path, { upsert: false });
    if (!s || s.error || !s.token) return fail();
    return { status: 200, body: { ok:true, path: x.path, token: s.token, signedUrl: s.signedUrl || null } };
  }

  if (op === 'client-sign-read'){
    const xs = parseAll(req.paths, LIMITS.readPaths); if (!xs) return bad('bad_paths');
    if (xs.some(x => !isClientName(x.rest))) return deny();
    const jobs = new Set(xs.map(x => x.jobId));
    if (jobs.size !== 1) return deny();
    if (!(await clientJobOpen(deps, [...jobs][0]))) return deny();
    const r = await deps.sign.read(xs.map(x => x.path), LIMITS.readExpiresSec);
    if (!r || r.error || !Array.isArray(r.data)) return fail();
    return { status: 200, body: { ok:true, urls: r.data.map(u => ({ path: u.path, signedUrl: u.signedUrl || null })) } };
  }

  return bad('unknown_op');
}
