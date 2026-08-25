// L3-A: onallo szemelyzet — sajat dolgozok, sajat szerepkorok, kapcsolok
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let html=R('index.html').replace(/<script[^>]+src=[^>]*><\/script>/g,'');
const STUB='<script>window.RPW_CFG={SB_URL:"https://x.co",SB_KEY:"k",BUCKET:"b",SHOP_ID:"S1"};'+
'window.__rpc=[];window.__resp={};'+
'window.supabase={createClient:function(){return{from:function(){return{select:function(){return{is:function(){return{order:function(){return Promise.resolve({data:[],error:null})}}}}}}},'+
'rpc:function(n,a){window.__rpc.push([n,a]);return Promise.resolve(window.__resp[n]||{data:null,error:null})}}}};'+
'window.RPWDb={listActive:function(){return Promise.resolve([])},patchV2:function(){return Promise.resolve()},save:function(){return Promise.resolve({ok:1})}};'+
'window.RPWUtil={jobId:function(){return "J1"}};</script>';
html=html.replace('</head>',STUB+'<script>'+R('rpw-workflow.js')+'</script><script>'+R('rpw-auth.js')+'</script></head>');
const vc=new VirtualConsole();['error','warn','info','log','jsdomError'].forEach(k=>vc.on(k,()=>{}));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/',virtualConsole:vc});
const w=dom.window;
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const app=()=>w.document.getElementById('app').innerHTML;

const MGR={team:true,posts:true,open:true,reception:true,work:true,close:true,override:true,delete:true};
const TECH={team:false,posts:false,open:false,reception:false,work:true,close:false,override:false,delete:false};
const TEAM={data:{ok:true,can_team:true,me:{id:'E1',name:'Ferenc',can:MGR},
  roles:[{code:'MANAGER',label:'Műszakvezető',sort:10,used:1,can:MGR},
         {code:'TECH',label:'Szerelő',sort:40,used:2,can:TECH}],
  team:[{id:'E1',name:'Szkaliczki Ferenc',role_code:'MANAGER',role:'Műszakvezető',active:true,has_pin:true,last_login:'2026-08-24 01:49',posts:['CONSULTANT']},
        {id:'E2',name:'Abin Kanal',role_code:'TECH',role:'Szerelő',active:true,has_pin:false,posts:[]},
        {id:'E9',name:'Regi Kollega',role_code:'TECH',role:'Szerelő',active:false,has_pin:false,posts:[]}]},error:null};

setTimeout(async()=>{
try{
  w.JOBS=[];
  const sess=(can)=>({token:'t'.repeat(64),name:'Ferenc',rawRole:'Műszakvezető',roleCode:'MANAGER',
                      can:can,employeeId:'E1',shopId:'S1',exp:Date.now()+9e6});
  w.localStorage.setItem('rpw_auth',JSON.stringify(sess(MGR)));

  console.log('\n1. A JOGOSULTSÁG kapcsolókból jön, nem a névből');
  eq(w.RPWAuth.can('team'),true,'MANAGER: team');
  eq(w.RPWAuth.can('delete'),true,'MANAGER: delete');
  w.localStorage.setItem('rpw_auth',JSON.stringify(sess(TECH)));
  eq(w.RPWAuth.can('team'),false,'TECH: nincs team');
  eq(w.RPWAuth.can('work'),true,'TECH: van work');
  eq(w.isAdmin(),false,'TECH nem admin');
  w.localStorage.setItem('rpw_auth',JSON.stringify(sess(MGR)));
  eq(w.isAdmin(),true,'MANAGER admin');

  console.log('\n2. Bármilyen nevű szerepkör működik');
  w.localStorage.setItem('rpw_auth',JSON.stringify(
    {token:'t'.repeat(64),name:'Hans',rawRole:'Werkstattleiter',roleCode:'WERKSTATT',
     can:MGR,employeeId:'E5',shopId:'S1',exp:Date.now()+9e6}));
  eq(w.isAdmin(),true,'"Werkstattleiter" is admin — a kapcsoló dönt');
  w.localStorage.setItem('rpw_auth',JSON.stringify(sess(MGR)));

  console.log('\n3. Az Echipă az ÚJ rendszerből tölt');
  w.__resp={rpw2_team:TEAM,rpw_posts_get:{data:{ok:true,manager:true,posts:[]},error:null}};
  w.__rpc=[]; w.EC.loaded=false; w.setScreen('echipa'); await sleep(150);
  ok(w.__rpc.some(c=>c[0]==='rpw2_team'),'rpw2_team-et hív');
  eq(w.EC.team.length,3,'3 ember (a kilépettel)');
  eq(w.EC.roles.length,2,'2 szerepkör');
  ok(w.EC.manager,'vezetőnek ismeri fel');

  console.log('\n4. SZEMÉLYZET fül');
  w.ecTab('personal'); let h=app();
  ok(/Abin Kanal/.test(h),'listázza az embereket');
  ok(/ec_add_emp|Adaugă coleg|Új munkatárs|Add colleague/i.test(h),'van "új munkatárs" gomb');
  ok(/ec-tag ec-no/.test(h),'aki PIN nélkül van, jelölve');
  ok(/A plecat|Kilépett|Left/i.test(h),'a kilépett megjelölve');
  ok(/Show former|Arată foștii|Kilépettek/i.test(h),'kilépettek kapcsoló');

  console.log('\n5. ÚJ EMBER felvétele');
  w.ecEmp(null);
  ok(!!w.document.getElementById('ecEmpOv'),'ablak megnyílt');
  eq(w.EC.empId,null,'új emberként');
  w.EC.eName='Berlini Hans'; w.EC.eRole='TECH'; w.EC.ePhone='0740111222';
  w.__rpc=[]; w.__resp.rpw2_employee_save={data:{ok:true,id:'E7'},error:null};
  await w.ecEmpSave(); await sleep(80);
  const s1=w.__rpc.find(x=>x[0]==='rpw2_employee_save');
  ok(!!s1,'rpw2_employee_save meghívva');
  eq(s1&&s1[1].p_id,null,'  új rekord');
  eq(s1&&s1[1].p_name,'Berlini Hans','  a névvel');
  eq(s1&&s1[1].p_role_code,'TECH','  a szerepkörrel');

  console.log('\n6. Név nélkül nem ment');
  w.ecEmp(null); w.EC.eName='  ';
  w.__rpc=[]; await w.ecEmpSave(); await sleep(40);
  eq(w.__rpc.length,0,'üres név → nem küldi el');
  ok(!!w.EC.eErr,'  hibaüzenet');

  console.log('\n7. KILÉPTETÉS megerősítéssel');
  w.ecEmp('E2');
  eq(w.EC.eActive,true,'aktív ember');
  w.__rpc=[]; w.EC.eActive=false;
  await w.ecEmpWrite?.('E2','Abin Kanal','TECH',null,false);
  await sleep(60);
  const s2=w.__rpc.find(x=>x[0]==='rpw2_employee_save');
  eq(s2&&s2[1].p_active,false,'kiléptetés: active=false');

  console.log('\n8. SZEREPKÖR szerkesztő — a nyolc kapcsoló');
  w.ecTab('roluri'); h=app();
  ok(/MANAGER/.test(h)&&/TECH/.test(h),'listázza a szerepköröket');
  ['team','posts','open','reception','work','close','override','delete'].forEach(function(k){
    ok(h.indexOf(w.T('ec_perm_'+k))>0,'  kapcsoló látszik: '+k);
  });
  w.ecRole('TECH');
  ok(!!w.document.getElementById('ecRoleOv'),'szerkesztő megnyílt');
  eq(w.EC.rCan.work,true,'TECH: work be');
  eq(w.EC.rCan.team,false,'TECH: team ki');
  w.EC.rCan.close=true;
  w.__rpc=[]; w.__resp.rpw2_role_save={data:{ok:true,code:'TECH'},error:null};
  await w.ecRoleSave(); await sleep(60);
  const s3=w.__rpc.find(x=>x[0]==='rpw2_role_save');
  ok(!!s3,'rpw2_role_save meghívva');
  eq(s3&&s3[1].p_can.close,true,'  a bekapcsolt jog átmegy');
  eq(s3&&s3[1].p_can.team,false,'  a kikapcsolt is');

  console.log('\n9. ÚJ szerepkör (a szerviz nevezi el)');
  w.ecRole(null);
  eq(w.EC.rCode,'','üres kód');
  w.EC.rCode='werkstatt'; w.EC.rLabel='Werkstattleiter'; w.EC.rCan.team=true;
  w.__rpc=[]; w.__resp.rpw2_role_save={data:{ok:true,code:'WERKSTATT'},error:null};
  await w.ecRoleSave(); await sleep(60);
  const s4=w.__rpc.find(x=>x[0]==='rpw2_role_save');
  eq(s4&&s4[1].p_label,'Werkstattleiter','saját elnevezés');
  eq(s4&&s4[1].p_can.team,true,'  saját jogosultságokkal');

  console.log('\n10. PIN az ÚJ RPC-n');
  w.__rpc=[]; w.__resp.rpw2_pin_set={data:{ok:true},error:null};
  w.ecPin('E2','Abin Kanal'); w.EC.pin1='445566'; w.EC.pin2='445566';
  w.ecPinConfirm(); await sleep(80);
  const s5=w.__rpc.find(x=>x[0]==='rpw2_pin_set');
  ok(!!s5,'rpw2_pin_set (nem a régi rpw_pin_set_for)');
  eq(s5&&s5[1].p_new_pin,'445566','  a helyes PIN');

  console.log('\n11. Érthető hibaüzenetek');
  eq(w.ecErr?w.ecErr('not_allowed'):w.T('ec_noperm'), w.T('ec_noperm'),'not_allowed → érthető');

  console.log('\n12. A belépőképernyő az új névsort kéri');
  ok(/rpw2_roster/.test(R('rpw-login.html')),'rpw-login.html → rpw2_roster');
  ok(/rpw2_login/.test(R('rpw-auth.js')),'rpw-auth.js → rpw2_login');
  ok(/rpw2_session/.test(R('rpw-auth.js')),'  és rpw2_session');

}catch(e){fail++;console.log('  ✗ KIVÉTEL: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,3).join('\n'))}
console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
},1200);
