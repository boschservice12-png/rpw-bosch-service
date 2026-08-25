// ════════════════════════════════════════════════════════════════
//  P0.6 — PRIVÁT DOKUMENTUMTÁROLÁS
//  Elfogadási feltétel a promptból:
//   · a közvetlen publikus fájl-URL nem működik
//   · minden elérés időkorlátos aláírt URL-lel
//   · a dokumentum-előnézet és a ZIP továbbra is működik
// ════════════════════════════════════════════════════════════════
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','..');
const R=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:(fail++,console.log('  ✗ '+m))};
const eq=(g,e,m)=>ok(JSON.stringify(g)===JSON.stringify(e),m+'  got='+JSON.stringify(g));

console.log('\n1. A kapcsoló be van kapcsolva');
{
  const c=R('rpw-config.js');
  ok(/STORAGE_PRIVATE:\s*true/.test(c),'STORAGE_PRIVATE: true');
}

console.log('\n2. Nincs több KÖZVETLEN publikus URL a lapokon');
['rpw-dosar.html','rpw-evaluare-red.html','rpw-inchidere-red.html',
 'rpw-recepcio-red.html','rpw-upload.html'].forEach(function(f){
  const s=R(f);
  ok(!/getPublicUrl/.test(s), f+': nincs getPublicUrl');
  ok(/RPWPhotos\.signedUrl/.test(s), f+': aláírt URL-t használ');
  ok(/src="rpw-photos\.js"/.test(s), f+': betölti a photos modult');
});

console.log('\n3. A modul PRIVÁT módban NEM esik vissza publikusra');
{
  const g=global, old={window:g.window,self:g.self};
  const win={RPW_CFG:{STORAGE_PRIVATE:true,BUCKET:'rpw-photos'}}; win.self=win; g.window=win; g.self=win;
  eval(R('rpw-photos.js'));
  const P=win.RPWPhotos;
  // olyan supabase-báb, ahol az aláírás HIBÁZIK
  const sbBad={storage:{from:()=>({
    createSignedUrl:async()=>({error:{message:'nope'},data:null}),
    getPublicUrl:()=>({data:{publicUrl:'https://PUBLIKUS/kiszivargott.jpg'}})
  })}};
  P.signedUrl(sbBad,'j1/talon.jpg').then(function(u){
    eq(u,'','aláírás hibánál ÜRES — NEM ad publikus URL-t');
    // és ha nem privát, akkor visszaeshet (régi viselkedés megőrizve)
    win.RPW_CFG.STORAGE_PRIVATE=false;
    return P.signedUrl(sbBad,'j1/talon.jpg');
  }).then(function(u2){
    ok(/PUBLIKUS/.test(u2),'nem-privát módban a régi fallback megmarad');
    win.RPW_CFG.STORAGE_PRIVATE=true;

    // sikeres aláírás
    const sbOk={storage:{from:()=>({
      createSignedUrl:async(p,exp)=>({error:null,data:{signedUrl:'https://x/sign?token=abc&exp='+exp}})
    })}};
    return P.signedUrl(sbOk,'j1/talon.jpg',{expiresSec:600});
  }).then(function(u3){
    ok(/sign\?token=/.test(u3),'sikeres aláírásnál aláírt URL jön');
    ok(/exp=600/.test(u3),'  a megadott lejárattal (időkorlátos)');
    Object.assign(g,old);

    console.log('\n4. A rpw-data.js sem ad publikus URL-t privát módban');
    {
      const d=R('rpw-data.js');
      ok(/STORAGE_PRIVATE===true\) return ''/.test(d),'privát módban üres, nem halott link');
      const i=d.indexOf("STORAGE_PRIVATE===true"), j=d.indexOf('getPublicUrl');
      ok(i>=0 && i<j,'  az ellenőrzés MEGELŐZI a publikus ágat');
    }

    console.log('\n5. A ZIP is aláírt URL-ből dolgozik');
    {
      const z=R('rpw-inchidere-red.html');
      ok(/signedUrl\(sb,keys\[key\]/.test(z),'a ZIP-hez is aláírt URL');
      ok(/if\(pub\)\{var b2=await fetchBlob/.test(z),'  üres URL-nél nem próbál letölteni');
    }

    console.log('\n'+(fail?'✗ ':'✓ ')+pass+' pass / '+fail+' fail');
    process.exit(fail?1:0);
  }).catch(function(e){
    console.log('  ✗ KIVÉTEL: '+e.message); process.exit(1);
  });
}
