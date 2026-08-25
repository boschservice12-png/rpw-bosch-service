/* Valódi PostgreSQL indítása az integrációs tesztekhez.
   Nem mock: igazi SQL-függvények, igazi RLS, igazi tranzakciók. */
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');
const fs = require('fs'), path = require('path');
const MIG = path.resolve(__dirname, '..', '..', '_migrations');

let pg = null, port = 55500 + Math.floor(Math.random()*400);

async function start(){
  const dir = '/tmp/rpwpg-' + process.pid + '-' + port;
  pg = new EmbeddedPostgres({ databaseDir:dir, user:'postgres', password:'pw',
                              port, persistent:false, createPostgresUser:true });
  await pg.initialise();
  await pg.start();
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
const ALL = ['001_base_schema.sql','002_server_rpc.sql','003_business_requirements.sql',
             '004_staff_posts_legacy.sql','005_rls_lockdown.sql','006_workflow_enforcement.sql',
             '007_pin_lockout_admin.sql','008_job_create_deprecations.sql'];

module.exports = { start, stop, migrate, rollback, ALL, split };
