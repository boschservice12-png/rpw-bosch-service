/* Valódi PostgreSQL indítása az integrációs tesztekhez.
   Nem mock: igazi SQL-függvények, igazi RLS, igazi tranzakciók. */
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs'), path = require('path');
const MIG = path.resolve(__dirname, '..', '..', '_migrations');

let pg = null, port = 55500 + Math.floor(Math.random()*400);

// ── 2026-08-29 — PORTUTKOZES ELLEN ───────────────────────────────
// A veletlen port utkozhet, ha tobb integracios teszt fut egymas mellett
// (a negyedik teszt hozzaadasa utan ez elo is fordult egyszer). Nem
// hagyjuk veletlenre: ha a port foglalt, uj portot probalunk.
async function start(){
  let utolsoHiba = null;
  for (let proba = 0; proba < 6; proba++) {
    const dir = '/tmp/rpwpg-' + process.pid + '-' + port;
    pg = new EmbeddedPostgres({ databaseDir:dir, user:'postgres', password:'pw',
                                port, persistent:false, createPostgresUser:true });
    try {
      await pg.initialise();
      await pg.start();
      break;
    } catch (e) {
      utolsoHiba = e;
      try { await pg.stop(); } catch(_) {}
      pg = null;
      port = 55500 + Math.floor(Math.random()*400);   // uj port, ujraprobalunk
    }
  }
  if (!pg) throw new Error('Nem indult el a teszt-adatbazis 6 probalkozas utan: '
                           + (utolsoHiba && utolsoHiba.message));
  const c = pg.getPgClient();
  await c.connect();
  // A Supabase `anon` és `authenticated` szerepei — a migrációk ezekre
  // hivatkoznak. Éles Supabase-en már léteznek.
  await c.query("do $$ begin"
    + " if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;"
    + " if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;"
    + " end $$;");
  await c.query('grant usage on schema public to anon, authenticated');
  return c;
}
async function stop(){ try{ if(pg) await pg.stop(); }catch(e){} }

// Egy migrációs fájl futtatása. A fájl végi ELLENŐRZŐ lekérdezések
// a `commit;` UTÁN vannak — azokat külön futtatjuk.
function split(sql){
  const i = sql.lastIndexOf('\ncommit;');
  if(i < 0) return { body: sql, checks: '' };
  return { body: sql.slice(0, i + 8), checks: sql.slice(i + 8) };
}
async function migrate(c, file){
  const sql = fs.readFileSync(path.join(MIG, file), 'utf8');
  const { body } = split(sql);
  await c.query(body);
}
async function rollback(c, file){
  const sql = fs.readFileSync(path.join(MIG, file), 'utf8');
  const { body } = split(sql);
  await c.query(body);
}
// A 009 (szuk ugyfel-ut) valodi elore-migracio: a lancban a helye a 005
// UTAN van, kulonben a 005 vegigsopro `revoke all on function` visszavonna
// a grantjait.
// A 008 SZANDEKOSAN NINCS a lancban: az az ELO adatbazis alakjara szabott
// lezaras (app_session, hianyzo rpw_transition...), a sajat tesztje a
// _tests/integration/test-int-rls-live.js.
const ALL = ['001_base_schema.sql','002_server_rpc.sql','003_business_requirements.sql',
             '004_staff_posts_legacy.sql','005_rls_lockdown.sql','006_workflow_enforcement.sql',
             '007_pin_lockout_admin.sql','009_client_upload_path.sql'];

module.exports = { start, stop, migrate, rollback, ALL, split };
