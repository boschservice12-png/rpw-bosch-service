// ════════════════════════════════════════════════════════════════
//  INTEGRÁCIÓS — F-120: MUNKALAP SZERVEROLDALI LÉTREHOZÁSA (008)
//  VALÓDI PostgreSQL. Azt bizonyítja, hogy a munkalap számát és a
//  kezdő workflow-állapotot a SZERVER adja, a kliens hamisítványát
//  elutasítja, és a deprecated utak nem hívhatók.
// ════════════════════════════════════════════════════════════════
const D = require('./_db.js');
let pass=0, fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));
let c, SHOP, SHOP2, TOK_OPEN, TOK_NOOPEN, TOK_S2;
async function rpc(name,args){
  const keys=Object.keys(args);
  const sql='select '+name+'('+keys.map((k,i)=>k+' => $'+(i+1)).join(', ')+') as r';
  return (await c.query(sql, keys.map(k=>args[k]))).rows[0].r;
}
(async()=>{
c=await D.start();
for(const f of D.ALL) await D.migrate(c,f);
const mkShop=async n=>(await c.query("insert into shops(name) values ($1) returning id",[n])).rows[0].id;
SHOP=await mkShop('JC Service'); SHOP2=await mkShop('Masik Service');
const mk=async(shop,nev,code,can,pin)=>{
  await c.query('insert into rpw_roles(shop_id,code,label,can) values ($1,$2,$2,$3) on conflict do nothing',
    [shop,code,JSON.stringify(can)]);
  const e=await c.query("insert into rpw_employees(shop_id,name,role_code,pin_hash)"
    +" values ($1,$2,$3,crypt($4,gen_salt('bf'))) returning id",[shop,nev,code,pin]);
  return (await rpc('rpw2_login',{p_shop_id:shop,p_employee_id:e.rows[0].id,p_pin:pin})).token;
};
TOK_OPEN  =await mk(SHOP,'Nyito N','OPENER',{open:true,reception:true},'7101');
TOK_NOOPEN=await mk(SHOP,'Szerelo Sz','TECH',{work:true},'7102');
TOK_S2    =await mk(SHOP2,'Idegen I','OPENER2',{open:true},'7103');

console.log('\n1. Érvénytelen token / hiányzó jog');
{
  const r=await rpc('rpw_job_create',{p_token:'x'.repeat(40),p_id:'JC-1',p_data:'{}',p_prefix:'MS-26'});
  eq(r.ok,false,'rossz token -> elutasítás'); eq(r.error,'unauthorized','  unauthorized');
  const r2=await rpc('rpw_job_create',{p_token:TOK_NOOPEN,p_id:'JC-1',p_data:'{}',p_prefix:'MS-26'});
  eq(r2.ok,false,'open jog nélkül -> elutasítás'); eq(r2.error,'not_allowed','  not_allowed');
  const a=await c.query("select 1 from rpw_audit where action='denied:create_not_allowed' and job_id='JC-1'");
  ok(a.rows.length===1,'  és auditálva van');
}

console.log('\n2. Sikeres létrehozás: számot és állapotot a szerver ad');
{
  const r=await rpc('rpw_job_create',{p_token:TOK_OPEN,p_id:'JC-OK-1',
    p_data:JSON.stringify({plate:'MS-44-BSS',client:'Kovacs',flux:'reparatie'}),p_prefix:'MS-26'});
  eq(r.ok,true,'létrejött'); eq(r.existing,false,'  új');
  eq(r.version,1,'  version=1');
  eq(r.data.number,'MS-26-001','  a számot a SZERVER adta');
  eq(r.data.phase,1,'  phase=1');
  eq(r.data.phases['3'].status,'pending','  phases szerver-generált');
  eq(r.data.inchis,false,'  nincs lezárva');
  eq(r.data.plate,'MS-44-BSS','  a normál adat átment');
  const row=await c.query("select shop_id,version from rpw_jobs where id='JC-OK-1'");
  eq(row.rows[0].shop_id,SHOP,'  tenant a TOKENBŐL');
  const a=await c.query("select actor from rpw_audit where action='create' and job_id='JC-OK-1'");
  eq(a.rows[0].actor,'Nyito N','  actor a TOKENBŐL, auditban');
  const r2=await rpc('rpw_job_create',{p_token:TOK_OPEN,p_id:'JC-OK-2',p_data:'{}',p_prefix:'MS-26'});
  eq(r2.data.number,'MS-26-002','a számláló lép');
}

console.log('\n3. Idempotencia: ugyanaz az id kétszer -> nincs második írás');
{
  const before=(await c.query("select count(*) n from rpw_audit where job_id='JC-OK-1'")).rows[0].n;
  const r=await rpc('rpw_job_create',{p_token:TOK_OPEN,p_id:'JC-OK-1',
    p_data:JSON.stringify({plate:'HAMIS'}),p_prefix:'MS-26'});
  eq(r.ok,true,'ok'); eq(r.existing,true,'  existing=true');
  eq(r.data.plate,'MS-44-BSS','  a MEGLÉVŐT adja vissza, nem az újat');
  const after=(await c.query("select count(*) n from rpw_audit where job_id='JC-OK-1'")).rows[0].n;
  eq(after,before,'  nincs új audit-sor (nem írt)');
}

console.log('\n4. Hamisított workflow-állapot: elutasítás, nem szűrés');
{
  const r=await rpc('rpw_job_create',{p_token:TOK_OPEN,p_id:'JC-HAMIS-1',
    p_data:JSON.stringify({plate:'X',phase:7,inchis:true}),p_prefix:'MS-26'});
  eq(r.ok,false,'phase/inchis a kliensről -> elutasítás');
  eq(r.error,'protected_field','  protected_field');
  const row=await c.query("select 1 from rpw_jobs where id='JC-HAMIS-1'");
  ok(row.rows.length===0,'  és semmi nem jött létre');
  const r2=await rpc('rpw_job_create',{p_token:TOK_OPEN,p_id:'JC-HAMIS-2',
    p_data:JSON.stringify({shop_id:SHOP2,version:99}),p_prefix:'MS-26'});
  eq(r2.ok,false,'shop_id/version a kliensről -> elutasítás');
}

console.log('\n5. Tenant-izoláció');
{
  const r=await rpc('rpw_job_create',{p_token:TOK_S2,p_id:'JC-OK-1',p_data:'{}',p_prefix:'ZZ'});
  eq(r.ok,false,'másik tenant nem veheti át a meglévő id-t');
  eq(r.error,'id_taken','  id_taken — adatot nem szivárogtat');
  ok(!r.data,'  a másik tenant adatából semmit nem kap');
  const r2=await rpc('rpw_job_create',{p_token:TOK_S2,p_id:'JC-S2-1',p_data:'{}',p_prefix:'MS-26'});
  eq(r2.data.number,'MS-26-001','a számláló TENANTONKÉNT külön indul');
}

console.log('\n6. Deprecated utak: nincs EXECUTE jog');
{
  for(const [fn,args] of [
    ['rpw_patch',"('X','{}'::jsonb)"],
    ['rpw_login',"('"+SHOP+"'::uuid,'0000')"],
  ]){
    let denied=false;
    try{ await c.query("set role anon"); await c.query("select "+fn+args); }
    catch(e){ denied=/permission denied/i.test(e.message); }
    finally{ await c.query("reset role"); }
    ok(denied, fn+': anon szerepben permission denied');
  }
}

console.log('\n'+(fail?'✗ ':'OK ')+pass+' pass / '+fail+' fail');
await D.stop();
process.exit(fail?1:0);
})().catch(async e=>{console.error(e);try{await D.stop()}catch(_){};process.exit(1)});
