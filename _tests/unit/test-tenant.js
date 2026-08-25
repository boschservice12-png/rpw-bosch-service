// L1-Z: tobb-berlos szures — minden olvasas a sajat szervizre
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..','..');
const _rd=fs.readFileSync; fs.readFileSync=function(p,e){try{return _rd(p,e)}catch(_){return _rd(path.join(ROOT,String(p).replace(/^.*\//,'')),e)}};
const calls=[];
function Q(t){ this.t=t; this.ops=[]; }
Q.prototype.eq=function(k,v){this.ops.push(['eq',k,v]);return this};
Q.prototype.is=function(k,v){this.ops.push(['is',k,v]);return this};
Q.prototype.not=function(k,o,v){this.ops.push(['not',k,o,v]);return this};
Q.prototype.select=function(c){this.ops.push(['select',c]);return this};
Q.prototype.update=function(o){this.ops.push(['update',o]);return this};
Q.prototype.delete=function(){this.ops.push(['delete']);return this};
Q.prototype.order=function(){calls.push(this);return Promise.resolve({data:[],error:null})};
Q.prototype.single=function(){calls.push(this);return Promise.resolve({data:null,error:null})};
Q.prototype.then=function(r){calls.push(this);return Promise.resolve({data:[],error:null}).then(r)};
const sb={from:t=>new Q(t), rpc:()=>Promise.resolve({data:null,error:null})};

global.window={RPW_CFG:{SHOP_ID:'bc39e3c1-696c-4590-a9ed-d3810df1c02d',SB_URL:'x',SB_KEY:'y'}};
global.self=global.window; global.localStorage={getItem:()=>null,setItem:()=>{}};
eval(fs.readFileSync('rpw-db.js','utf8'));
const DB=window.RPWDb;
const SID='bc39e3c1-696c-4590-a9ed-d3810df1c02d';

let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  x '+m))};
const hasShop=q=>q.ops.some(o=>o[0]==='eq'&&o[1]==='shop_id'&&o[2]===SID);

(async()=>{
console.log('\n1. MINDEN olvasas a sajat szervizre szur');
calls.length=0; await DB.getRow(sb,'j1');
ok(calls.length===1&&hasShop(calls[0]),'getRow');
calls.length=0; await DB.listActive(sb);
ok(calls.length===1&&hasShop(calls[0]),'listActive');
calls.length=0; await DB.listTrashed(sb);
ok(calls.length===1&&hasShop(calls[0]),'listTrashed');

console.log('\n2. Az IRAS/TORLES is');
for(const [n,f] of [['softDelete',()=>DB.softDelete(sb,'j1')],['restore',()=>DB.restore(sb,'j1')],
                    ['purge',()=>DB.purge(sb,'j1')],['purgeAllTrashed',()=>DB.purgeAllTrashed(sb)]]){
  calls.length=0; await f();
  ok(calls.length===1&&hasShop(calls[0]),n);
}

console.log('\n3. A munka azonositoja MELLE kerul, nem helyette');
calls.length=0; await DB.getRow(sb,'j1');
ok(calls[0].ops.some(o=>o[0]==='eq'&&o[1]==='id'&&o[2]==='j1'),'az id szures megmaradt');
ok(hasShop(calls[0]),'  es melle a shop_id');

console.log('\n4. Nem hasal el, ha nincs SHOP_ID');
window.RPW_CFG.SHOP_ID=null;
calls.length=0;
try{ await DB.listActive(sb); ok(calls.length===1,'lefut SHOP_ID nelkul is'); }
catch(e){ ok(false,'KIVETEL: '+e.message) }
ok(!hasShop(calls[0]),'  de nem szur ures ertekre');
window.RPW_CFG.SHOP_ID=SID;

console.log('\n5. A shopId() kiolvashato');
ok(DB.shopId()===SID,'shopId() a configbol');

console.log('\n'+(fail?'x ':'OK ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
