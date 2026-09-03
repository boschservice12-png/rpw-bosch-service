// test-ocr-model.js — az OCR es a classify VALODI keresenek ellenorzese
//
// Nem a forrast olvassa: BETOLTI a fuggvenyt, kicsereli a fetch-et, es
// megnezi, mit kuldott volna el az Anthropic API-nak.
//
// Miert kell ez: a Sonnet 5-on a gondolkodas ALAPBOL BEKAPCSOL, ha a
// keresben nincs `thinking` mezo. A Netlify szinkron fuggvenyre 10 mp jut,
// a classify max_tokens-e pedig 200 — mindketto elhasalna tole. Ez a teszt
// azt orzi, hogy a kikapcsolas ki ne essen egy kesobbi atirasnal.

var pass=0, fail=0;
function ok(c,m){ if(c){pass++;console.log('  v '+m);} else {fail++;console.log('  X '+m);} }

process.env.ANTHROPIC_API_KEY = 'teszt-kulcs';
process.env.SUPABASE_URL      = 'https://pelda.supabase.co';
process.env.SUPABASE_ANON_KEY = 'teszt-anon-kulcs';

// 1x1 fekete JPEG base64-ben (a magic-byte felismeresnek valodi fejlec kell)
var JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
           'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
           'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function esemeny(body){
  return { httpMethod:'POST',
           headers:{ origin:'https://rpw-bosch-service.netlify.app',
                     authorization:'Bearer '+'t'.repeat(48) },
           body: JSON.stringify(body) };
}

// A fetch-et lecsereljuk: a Supabase-nek ervenyes munkamenetet adunk vissza,
// az Anthropic-hivast pedig ELKAPJUK es eltesszuk.
function futtat(modulUt, body, aiValasz){
  delete require.cache[require.resolve(modulUt)];
  delete require.cache[require.resolve('../../functions/_shared.js')];
  var elkapott = null;
  global.fetch = function(url, opts){
    if(String(url).indexOf('anthropic.com') >= 0){
      elkapott = JSON.parse(opts.body);
      return Promise.resolve({ ok:true, status:200,
        json:function(){ return Promise.resolve(aiValasz); },
        text:function(){ return Promise.resolve(''); } });
    }
    // Supabase rpw2_session
    return Promise.resolve({ ok:true, status:200,
      json:function(){ return Promise.resolve({ ok:true,
        employee:{ id:'e1', name:'Teszt', role:'MANAGER', shop_id:'s1' } }); } });
  };
  var mod = require(modulUt);
  var h = mod.handler || mod.exports && mod.exports.handler;
  return Promise.resolve(h(esemeny(body))).then(function(res){
    return { kildott: elkapott, valasz: res };
  });
}

var OCR_AI = { content:[{ type:'text', text:'{"plate":"MS-50-BSS","vin":"UU1KSDACH12345678",'+
                                            '"brand":"DACIA","model":"LOGAN","year":"2009",'+
                                            '"capacitate":"1598","owner":"POPESCU ION"}' }] };
var CLS_AI = { content:[{ type:'text', text:'{"type":"talon_fata","confidence":0.9,"label":"talon"}' }] };

(async function(){

console.log('\n1. Az OCR a Sonnet 5-ot hivja, gondolkodas nelkul');
var r = await futtat('../../functions/ocr.js', {image:JPEG, type:'talon'}, OCR_AI);
ok(r.kildott !== null, 'a hivas tenylegesen eljutott az AI-ig (KONTROLL)');
ok(r.kildott && r.kildott.model === 'claude-sonnet-5', 'model = claude-sonnet-5');
ok(r.kildott && r.kildott.model !== 'claude-sonnet-4-5', 'NEM a regi sonnet-4-5');
ok(r.kildott && r.kildott.thinking && r.kildott.thinking.type === 'disabled',
   'thinking: disabled — kulonben a Sonnet 5 gondolkodna, es a 10 mp keves lenne');
ok(r.valasz && r.valasz.statusCode === 200, 'a valasz 200');

console.log('\n2. A classify is a Sonnet 5-ot hivja, gondolkodas nelkul');
var c = await futtat('../../functions/classify.js', {image:JPEG}, CLS_AI);
ok(c.kildott !== null, 'a hivas tenylegesen eljutott az AI-ig (KONTROLL)');
ok(c.kildott && c.kildott.model === 'claude-sonnet-5', 'model = claude-sonnet-5');
ok(c.kildott && c.kildott.thinking && c.kildott.thinking.type === 'disabled',
   'thinking: disabled — a max_tokens itt 200, azt a gondolkodas egymaga felenne');
ok(c.kildott && c.kildott.max_tokens === 200, 'max_tokens valtozatlan (200)');

console.log('\n3. A valasz NEM a 0. blokkot felteti szovegnek');
// Ha valaha bekapcsol a gondolkodas, az elso blokk `thinking` lesz, `.text`
// nelkul. A regi kod ilyenkor CSENDBEN ures szoveget kapott volna.
var AI_GONDOLKODVA = { content:[
  { type:'thinking', thinking:'...' },
  { type:'text', text:'{"plate":"MS-50-BSS","vin":"UU1KSDACH12345678","brand":"DACIA",'+
                      '"model":"LOGAN","year":"2009","capacitate":"1598","owner":"POPESCU ION"}' }] };
var g = await futtat('../../functions/ocr.js', {image:JPEG, type:'talon'}, AI_GONDOLKODVA);
ok(g.valasz && g.valasz.statusCode === 200,
   'gondolkodas-blokk utan is megtalalja a szoveget (nem 502)');
var gb = g.valasz && JSON.parse(g.valasz.body);
ok(gb && gb.fields && gb.fields.plate === 'MS-50-BSS', 'a rendszam atjott');

console.log('\n4. KONTROLL: ha az AI tenyleg szemetet ad, az 502 marad');
var sz = await futtat('../../functions/ocr.js', {image:JPEG, type:'talon'},
                      { content:[{type:'text', text:'nem json'}] });
ok(sz.valasz && sz.valasz.statusCode === 502, 'ertelmezhetetlen valasz -> 502');

console.log('\n'+(fail?'X ':'v ')+pass+' pass / '+fail+' fail');
process.exit(fail?1:0);
})();
