# CHANGELOG.md

## 2026-09-04 — „Építési hiány" — a megoldás egyetlen oldalon létezett

Ferenc megfigyelése, ami eldöntötte az ügyet: **„az avizare daună felén a
fotók működnek, a recepción nem, a reconstatare-n sem — szerintem
hiányzik a megoldás a rendszerből."** Igaza volt, és a kód meg is
mutatta, miért.

### A természetes kísérlet

| Oldal | Hogyan olvassa be a fotót | Eredmény |
|---|---|---|
| **avizare daună** (`rpw-upload.html`) | `createObjectURL` + **`img.onerror`-ág** + a Blob **közvetlen** feltöltése | ✅ működik |
| recepció / evaluare | `fetch(dataUrl)` | ❌ a CSP blokkolja |
| **reconstatare** | saját `resize()` — **semmilyen hibaág** | ❌ néma elakadás |
| **lezárás** (`rpw-inchidere`) | ugyanaz a hibaág nélküli `resize()` | ❌ *(még nem ért oda senki)* |

**Minden oldal újraírta a saját fotó-kódját, és elsodródtak.** A helyes
minta pontosan EGY helyen létezett. Ez az „építési hiány".

A `rpw-reconstatare-red.html` ráadásul **be sem töltötte a
`rpw-photos.js`-t** — a közös réteg szó szerint hiányzott a lapról.

### Amit ez a kör csinált

- **`RPWPhotos.fileToDataUrl()`** — EGY implementáció, a működő avizare
  daună minta alapján: objectURL-ről dekódol (nincs több megabájtos
  `data:` URL), van kép- és olvasási hibaága, van időkorlátja, és
  felszabadítja az objectURL-t.
- **reconstatare**: betölti a közös réteget, a saját `resize()`-a ezt
  hívja, és a fotó-küldés sem `fetch`-eli a `data:` URL-t (az is CSP-be
  ütközött volna).
- **lezárás**: ugyanez — **ezt a tesztünk találta meg, nem panasz.**
- mindkét lapon a fájlválasztó nullázódik: ugyanaz a fotó újra választható.

### A teszt, ami mostantól őrzi — REPO-SZINTEN

A `test-ocr-schema.js` 10. szakasza minden `.html` lapot végignéz, és
megköveteli, hogy **egyik se** fetch-eljen `data:` URL-t, **minden**
képet dekódoló lapon legyen `img.onerror`, és **minden** fotót kezelő lap
töltse be a `rpw-photos.js`-t. Így nem sodródhat el újra.

**Két saját hiba ebben a körben, kimondva:**
1. A szűrőm a *kommentemre* illeszkedett kód helyett — sorszintű szűrésre
   írtam át, mert a blokk-kommentes változat kódot is elnyelt.
2. Egy állításom csak azt mérte, hogy *szerepel-e* a `fileToDataUrl` a
   lapon; a védő `if(...)` miatt akkor is igaz volt, ha a tényleges hívást
   kivettem. A hívást méri mostantól.

Teljes futás zöld: unit 45/2980 · integration 5/350 · frontend 5/480 ·
static 1/2 — 0 hibás. Mutáció: 9, mind elkapva.


## 2026-09-03 — „A fotókat nem veszi be, nem olvas az OCR" — két hiba egy úton

Ferenc jelzése. Két, egymástól **független** hiba ült ugyanazon az úton:
az egyik a fotót nem engedte be, a másik az AI válaszát dobta el.
Egyiket sem fogta meg teszt.

### 🔴 1. A szűrő MÁS mezőneveket ismert, mint amit a prompt kért

A `functions/ocr.js` promptja `brand` / `year` / `owner` / `daune` néven
kérte az adatot az AI-tól, a `functions/_shared.js` `OCR_SCHEMA` viszont
`marca` / `an` / `proprietar` / `elemente` néven engedett át. A
`validateOcr` az ismeretlen kulcsot **némán eldobta**, és a válasz
**200-zal, üresen** ment vissza. Amit ez elvitt:

| Típus | Elveszett mező | Amit a felhasználó látott |
|---|---|---|
| talon | `brand`, `year`, `capacitate`, `owner` | rendszám és VIN beíródott, a márka/évjárat/tulajdonos nem |
| buletin | `name`, `address` | csak a CNP jött át |
| constatare | `proprietar`, `daune` | **a KÁRLISTA minden alkalommal elveszett** — 0 elem |
| audatex | **mind a 8** | `no_known_fields` → **502 minden importnál** |

A séma mostantól a prompt mezőneveit ismeri (a régieket megtartva), és a
tömbök (`daune`) elemeit is átengedi — elemenként megszűrve: csak
egyszerű értékek, legfeljebb 200 elem, kulcsonként 300 karakter. A
szigor megmarad: ismeretlen mező továbbra is kiesik, értelmezhetetlen
válasz továbbra is 502.

### 🔴 2. A fotó-beolvasás NÉMÁN elakadt

A `resizeFile()` Promise-ának **nem volt elutasító ága**, és sem az
olvasás (`r.onerror`), sem a dekódolás (`img.onerror`) hibája nem volt
lekezelve:

```js
return new Promise(function(res){        // <- nincs rej
  var r=new FileReader();
  r.onload=function(e){
    var img=new Image();
    img.onload=function(){ … res(…) };   // <- ha sosem fut le, a Promise
    img.src=e.target.result;             //    SOHA nem dől el
  };
  r.readAsDataURL(file);
});
```

Ha a böngésző nem tudta megnyitni a fájlt — **iPhone HEIC asztali gépen,
PDF-be szkennelt irat, sérült kép** —, akkor nem történt semmi:
se feltöltés, se hibaüzenet, se pörgő. Pontosan ez a „nem veszi be".

**Javítás:**
- olvasási hiba → beszélő hibaüzenet
- dekódolási hiba → az **eredeti fájl** megy tovább változatlanul; a
  szerver formátum-ellenőrzése dönt (elfogadja, vagy érthetően elutasítja)
- üres vászon (iOS memóriakorlát) → az eredeti megy tovább
- 20 másodperc után időtúllépés — nem örök várakozás
- **mind a 10 fotó-hívás** hibaága kivezetve a felületre (`toast`)
- a fájlválasztó `value`-ja nullázódik: **ugyanaz a fájl újra választható**
  (eddig a második próbálkozás nem váltott eseményt — „megint nem csinál semmit")
- a kicsinyítés a **hosszabb oldalt** nézi: az álló telefonfotók eddig
  teljes méretben mentek fel

### A teszt, ami mostantól őrzi

`_tests/unit/test-ocr-schema.js` — a promptot a **valódi fájlból** olvassa
ki, és megköveteli, hogy minden kért mező átjusson a szűrőn, a kliens
minden olvasott mezője benne legyen a sémában, és a fotó-út minden
hívásának legyen hibaága. 53 állítás.

**Ami NEM változott:** az `AUTH_REQUIRED`, a Storage-beállítás, a
modellválasztás (`claude-sonnet-4-5` — továbbra is aktív) és a
biztonsági szűrés szigora.

### ➕ PDF-be szkennelt irat a recepción

A szerver eddig is fogadott PDF-et, és az **Audatex-import** meg a
**dosszié fájlból** út `accept`-je is engedte — csak a fenti séma-hiba
miatt bukott. A **recepció irat-rései** viszont tényleg nem: `image/*`,
és a tárolás mindent `.jpg` néven, `image/jpeg` típussal tolt fel.

- a 📁 **Import** és a dokumentum-rések mostantól PDF-et is fogadnak
  (a 📷 **Foto** kamera-bevitel marad kép — onnan nem jön PDF)
- a Storage a **valódi** kiterjesztéssel és tartalomtípussal tárol; a
  JOB megjegyzi (`photoPaths` / `photoMime`), a törlés ezt az utat törli
- formátumváltásnál (kép → PDF ugyanabba a résbe) a régi fájl eltakarítva,
  nem marad árván
- **a régi munkák változatlanul működnek:** ahol nincs megjegyzett út,
  ott marad a `.jpg` — ahogy eddig is
- PDF-nél a felület megnyitható **📄 PDF csempét** ad `<img>` helyett
  (egy `<img src="....pdf">` üres négyzet lenne — a bizonyíték eltűnne
  szem elől)

### 🔴 Utójavítás: a nem dekódolható fájl HAZUG címkét kapott volna

Ferenc, ugyanaznap: „**nem tudok fotózni a telefonról** — a kamera
megnyílik, lefotózom, utána nem történik semmi." Ez a fenti 2. pont
(néma elakadás), ami élesben még nincs kint. A saját javításom
átnézésekor viszont **hibát találtam benne**:

A „nem dekódolható → menjen tovább az eredeti" ág és a `mimeOfDataUrl`
együtt azt csinálta, hogy **minden ismeretlen típus `image/jpeg`-gé
vált**:

```js
return MIME_EXT[t] ? t : 'image/jpeg';   // <- az iPhone HEIC-je is
```

Egy telefonról jövő, nem dekódolható HEIC így `.jpg` néven,
`image/jpeg` címkével került volna a tárolóba — **ugyanaz a hibaosztály,
amit a PDF-nél épp most javítottunk**, csak a másik ágon.

- a bejelentett típus **megmarad** (nincs néma `.jpg`-re esés)
- kép-szerű ismeretlen típus (`image/heic`, `image/heif`) a **valódi**
  kiterjesztését kapja, megtisztítva (csak betű/szám, max 8 karakter)
- SVG kizárva — sosem fotó és sosem szkennelt irat
- amit nem tudunk becsületesen eltárolni, azt **nem töltjük fel**:
  beszélő hiba, nem csendes hazugság

Így a bizonyíték a valódi formátumában áll a tárolóban, és az OCR
mondja meg érthetően, ha nem tudja olvasni — üres négyzet és néma
elakadás helyett.

### 🔴 A VALÓDI ok: a feltöltés `data:` URL-t fetch-elt — a CSP blokkolta

Ferenc a telefonon: „**upload failed to fetch**". Ez már a beszélő
hibaüzenet volt — és egyenesen a hibához vezetett.

A feltöltés így csinált Blob-ot a fotóból:

```js
var res = await fetch(dataUrl);   // data:image/jpeg;base64,...
var blob = await res.blob();
```

Egy `data:` URL **fetch-elése KAPCSOLATNAK számít**, tehát a CSP
`connect-src`-je szabályozza. A `netlify.toml`-ban pedig:

```
connect-src 'self' https://*.supabase.co https://api.anthropic.com
```

**nincs benne `data:`** — a 11 (v3) CSP-szigorítás kifejezetten kivette,
ezzel az indoklással: *„connect-src data: és blob: — ezek NEM kellenek
kapcsolathoz, csak img-src-hez."* **Ez az indoklás téves volt:** a kód
igenis fetch-elt `data:` URL-t. A böngésző blokkolta, és a dobott hiba
szó szerint `TypeError: Failed to fetch`.

Ugyanez a sor CSP nélkül is elhasalt volna a telefonon: több megabájtos
`data:` URL fetch-elése mobilon memóriaigényes.

**A megoldás NEM a CSP tágítása** — az gyengítené a védelmet egy olyan
sémára, amit támadó is kihasználhat. Ehelyett a kód nem megy hálózaton:
az új `RPWPhotos.dataUrlToBlob()` helyben, base64-ből állítja elő a
bájtokat. Nincs CSP-függés, nincs mobil memória-korlát.

- `rpw-recepcio-red.html` és `rpw-evaluare-red.html` feltöltése átállítva
- a `rpw-dosar.html` ZIP-exportja is: egy RÉGI rekordban maradt `data:`
  URL eddig csendben „LIPSA (eroare)" sorrá vált az exportban
- **a CSP érintetlen** — teszt rögzíti, hogy a `connect-src`-ben továbbra
  sincs `data:`, az `img-src`-ben viszont marad (a megjelenítéshez kell)


## 2026-08-25 (5) — „Nem tudok törölni" — két hiba egy úton

Két, egymástól független hiba ült a törlés útján. Egyiket sem fogta meg
teszt, mert **mindkettő csak akkor derül ki, ha a gombkezelő tényleg lefut.**

### 🔴 1. Minden oldalbetöltés kijelentkeztetett

A `rpw-cache.js` indulási takarítója (`migrateLegacy`) a **`rpw_auth`**,
`rpw_admin` és `rpw_last_who` kulcsokat is törölte — és ez a takarítás
**minden oldalbetöltéskor** lefut:

```js
try{ if(window.RPWCache){ RPWCache.migrateLegacy(); RPWCache.sweep(); } }catch(e){}
```

Belépsz → betölt az oldal → kiléptet. Az `isAdmin()` a munkamenetből
dolgozik, ezért a törlés `Doar admin poate șterge`-t írt.

A szerveradat ezt megerősítette: **8 belépés három nap alatt**, ugyanattól
az embertől. Nem a felhasználó felejtett el belépni — a rendszer dobta ki.

**Javítás:** a munkamenet-kulcsok külön listára kerültek
(`LEGACY_SESSION`), és **kizárólag kijelentkezéskor** (`wipe`) törlődnek.
A régi, TTL nélküli munkaadat (`rpw_job_*`) takarítása változatlan — az
közös gépen adatvédelmi kérdés.

### 🔴 2. A törlés gombja nem létező függvényt hívott

```js
RPWWorkflow.ask({lang:L(), tone:'danger', …})   // L: sehol nem definiálva
```

Bejelentkezve is `ReferenceError` — a megerősítő ablak **meg sem nyílt**.
Rákattintasz, és nem történik semmi. A nyelvet mindenhol a `gL()` adja.

### A teszt, ami VÉDTE a hibát

A `test-dialogs.js` szó szerint ezt várta el:

```js
ok(/RPWWorkflow\.ask\(\{lang:L\(\),tone:'danger'/.test(idx), 'munka torlese -> danger parbeszed');
```

A szöveg egyezett, tehát zöld volt — miközben a párbeszéd **sosem nyílt
meg**. Egy teszt, ami a forrás betűit nézi, a hibát is rögzítheti.

### Új: `test-delete.js` — a lánc, nem a szöveg

24 állítás. Elindítja a lapot, belép, **megnyomja a gombot**, és megnézi,
mi ért el a szerverig:

* a munkamenet túléli az oldalbetöltést, és csak kijelentkezéskor törlődik
* bejelentkezett vezetőnél a törlés a szerverig megy (`deleted_at`)
* bejelentkezés nélkül nem megy semmi — de a felhasználó üzenetet kap
* programált munkát adminként sem lehet törölni (poka-yoke)

Mindkét hiba visszatételével kipróbálva: **10 állítás bukik el.**

---
## 2026-08-25 (4) — A tartós offline sor bekötése + a mentési út három hibája

A `rpw-queue.js` hónapokig készen állt, és **egyetlen lap sem töltötte be**.
Bekötés közben kiderült, hogy a sor önmagában **nem ért volna semmit**: a
mentési út, amibe be kellett kötni, három ponton romlott.

### 🔴 Amit a bekötés közben találtam — valódi adatbázison igazolva

| # | Hiba | Következmény |
|---|---|---|
| 1 | **A `{ok:false}` sikernek látszott.** A `rpw_patch_v3` az elutasítást a válasz TÖRZSÉBEN adja vissza, a `rpw-save.js` viszont csak a transport-hibát nézte | A felhasználó **zöld pipát** látott („✓ Salvat pe server"), az adat viszont nem került ki. Néma adatvesztés. |
| 2 | **A normál mentés a TELJES munkát küldte**, benne a `phase`, `phases`, `inchis` mezőkkel | A `006` óta a szerver az **egész patch-et elutasítja**, ha védett mező van benne — akkor is, ha az értéke változatlan. Élesítés után **egyetlen mentés sem menne át.** |
| 3 | **A verzió hiányzott.** A `rpw_patch_v3` kötelezően kéri; a `rpw-save.js` alapból `null`-t küldött (`useLock:false`) | `expected_version_required` — a mentés akkor is elbukna, ha az 1–2. nem lenne. |

Mérés a `007`-ig migrált PostgreSQL-en:

```
TELJES munka mentése → {"ok":false,"error":"protected_workflow_field",
                        "fields":["phase","inchis","phases.1.status"]}
CSAK a nem védett     → {"ok":false,"error":"expected_version_required"}
szűrve + verzióval    → {"ok":true}
```

**Javítás:** `stripProtected()` a `rpw-save.js`-ben — a normál mentés a
`006` védett listáját (13 felső szintű mező + `closing` három kulcsa) kiveszi.
A `closing.closedAt` **marad**, a `closing.status` nem. A verzió a v3 úton
mostantól **mindig** megy. A `serverRejection()` pedig elutasításnak veszi,
ami elutasítás.

A **kritikus** mentés (`commitConfirmed`, helyi fázisváltás után) szándékosan
**nem** szűr: az csak akkor fut, ha a szerveroldali átmenet ki van kapcsolva.

### A sor bekötése

| Hol | Mi történik |
|---|---|
| 11 lap | betölti a `rpw-queue.js`-t, a `rpw-data.js` **előtt** |
| `RPWQueue.shared()` | egy lapon EGY sor — különben ugyanarra a dossziéra két rekord születne |
| `RPWData.create` | magától megtalálja a közös sort (`opts.queue:false` → ki) |
| `RPWData.init` | **újratöltés után elindítja** — eddig senki nem indította |
| `online` esemény | a hálózat visszatérésekor is ürít |
| `RPWSave` | offline / kimerült újrapróbálkozás → **a sorba**; igazolt siker → **ki a sorból** |
| `QSTATE` | a sor állapotai lefordulnak arra, amit a lapok jelzője ismer |

**Amit NEM tesz a sorba:** `permission`, `conflict`, `auth`, `rejected` — azt
az újraküldés sem javítaná meg, csak örökre ott ragadna.

`index.html`: a lista mostantól a **verziót is** átveszi a sorból a munkára —
enélkül a panelről indított mentés `expected_version_required`-et kapna.

### Tesztek

* **`test-queue.js`** *(44 állítás)* — a teljes út: offline mentés →
  „újratöltés" (új példány, ugyanaz a tár) → online → megérkezik.
  Kipróbálva mutációval: a bekötés kivételére **elbukik**.
* **`test-int-workflow.js` +21 állítás** — valódi PostgreSQL: a teljes munka
  elutasítva, a szűrt átmegy, verzió nélkül nem, elavult verzióval nem.

---
## 2026-08-25 (3) — Frontend-takarítás

Mérésből, nem érzésből: minden lap betöltődik jsdom-ban a moduljaival, és a
**valódi globálokat** kérdezzük.

### Amit a mérés talált

| Rothadás | Mennyi | Mit tettünk |
|---|---|---|
| **Hiányzó felirat** — a `T('kulcs')` a NYERS KULCSOT írta a képernyőre | 7 | pótolva mindhárom nyelven |
| **Halott függvény** — sehol nem hívott kód | 5 (84 sor) | törölve |
| **Nem létező függvény hívása** — `acteDoneTotal`, az eredményt senki nem használta | 1 | törölve |
| **Halott gomb** — `onclick` nem létező függvényre | 0 | — |

A hiányzó feliratok a felhasználó szeme előtt voltak: az újranyitás kérdése
`reopen_reason`-t írt ki, a hiányos űrlap `incomplete`-et. A `T()` a nem talált
kulcsot **önmagával** adja vissza, ezért a mögé írt `|| 'Motivul…'` tartalék
**soha nem sült el** — igaznak látszó kód, ami hazudik.

A törölt függvények közül a legbeszédesebb az `autoPopulate()` (48 sor): egy
üzleti szabály **második, senki által nem hívott példánya** — az élő verzió a
`syncFromElements()`. Két implementáció ugyanarra a szabályra: az egyik
csendben elavul, és senki nem tudja, melyik az igazság.

### `test-rot.js` — hogy ne jöjjön vissza

44 állítás, tizenhárom lapon. Nem szövegkeresés: a lapok TÉNYLEGESEN
betöltődnek, és ellenőrizzük, hogy

* minden `onclick`/`onchange` **létező** függvényre mutat *(224 kezelő)*
* minden `T('kulcs')` megvan a szótárban *(787 hivatkozás)*
* nincs **duplikált** szótárkulcs — a későbbi csendben felülírja a korábbit

A teszt **elbukik**, ha bármelyik visszatér: elgépelt kezelőnévvel és törölt
felirattal is kipróbálva.

A harmadik ellenőrzés a saját hibámból született: a takarítás közben `ore`
kulcsot vettem fel oda, ahol **már létezett**. A „hiányzik" jelzés téves volt —
a `T()` a román `ore` fordítást nem tudta megkülönböztetni a kulcs nevétől.
A detektor azóta a **szótárat** kérdezi, nem a `T()` visszatérését.

### Amit MÉRTÜNK, de NEM piszkáltunk

**~48 „halott" CSS-osztály.** A lapok tizenegy helyen **futásidőben építenek**
osztálynevet (`class="'+valami+'"`), tehát a statikus keresés nem bizonyíték.
Vizuális teszt nincs, ami elkapná a tévedést — CSS-t törölni ezen az alapon
kockázatosabb, mint hagyni.

**`rpw-queue.js` (198 sor) — egyetlen lap sem tölti be.** Az `RPWData.create`
elfogad `opts.queue`-t, csak senki nem ad neki. Ez nem szemét, hanem **be nem
kötött képesség** (tartós offline sor). Döntést igényel: bekötni vagy elengedni.

---
## 2026-08-25 (2) — A `classify` bekötése + két élő hiba a dosszién

A `functions/classify.js` hónapok óta kész volt, és **sehol nem hívtuk**.
A biztosítós dosszié 19 rését egyesével kellett tölteni.

### Kötegelt feltöltés — AI-javaslat, EMBERI döntés

Egy gomb, egy fájlválasztás: a kolléga kijelöli az összes fényképet, a
`classify` megnézi mindet, és megjavasolja, melyik résbe valók. A lista
**jóváhagyásig nem ír semmit** — sem a tárolóba, sem az adatbázisba.

| Döntés | Miért |
|---|---|
| A modell szótára a **rések** szerint lett újraírva (9 → 17 típus) | a régi `talon`, `foto_lateral_stg` nem feleltethető meg résnek |
| A károsult / vétkes kérdést **nem találgatjuk** | két személyi igazolvány ugyanúgy néz ki; a prompt kifejezetten tiltja |
| 0.85 alatti bizonyosságnál **nincs előválasztás** | a sor üresen marad, a kolléga választ |
| A terv **egyben** készül | különben két „talon față" ugyanabba a résbe menne, és a második csendben felülírná az elsőt |
| A felülírás veszélye **ki van írva a sorra** | nem csendes adatvesztés |
| A régi típusok **alias**-on át élnek tovább | egy korábbi válasz sem esik `altceva`-ba |

### 🔴 Két élő hiba, amit közben találtam

| Hiba | Következmény |
|---|---|
| **A `toast()` nem létezett a `rpw-dosar.html`-en**, de 14 helyről hívtuk | Az `uploadActa` az ELSŐ sorában szállt el, a feltöltési ciklus előtt: **a dossziéba egyetlen irat sem került be**, és a felhasználó hibát sem látott. A ZIP-export ugyanígy. |
| **A `delActa` a nem létező `idx`-et adta át**, a `_stergeActaGo` pedig a nem létező `ix`-szel vágott | A törlés `ReferenceError`-t dobott; ha mégis lefutott volna, **mindig az első fájlt** törli, bármelyik ×-re kattintasz. |

Mindkettő pontosan abban a funkcióban volt, amire a kötegelt feltöltés
épül. Ezért előbb ezek javultak, és csak utána jött az új képesség.

**Egyetlen feltöltési út:** a résenkénti gomb és a kötegelt feltöltés
ugyanazt a `_uploadFileToSlot()`-ot hívja. A tárolóba egy helyről írunk.

### Tesztek

Új `test-classify.js` — **105 állítás**, ebből tizennyolc **valódi
lapkódon** jsdom-ban: a `bulkActe` és a `bulkConfirm` ténylegesen lefut,
és rögzítjük, mi került a tárolóba és mikor. A teszt elbukik, ha a
besorolás bármit feltölt jóváhagyás nélkül.

---
## 2026-08-25 — A V4 és a dosszié/PIN ág összefésülése + `007`

Két ág futott párhuzamosan ugyanarról a pontról (`OWN-STAFF-L3A`):

| Ág | Mit hozott |
|---|---|
| **V4** | szerveroldali fázisátmenetek, `rpw-cache.js`, `rpw-conflict.js`, fail-closed `verifyServer`, migrációk, öt tesztkategória, dokumentáció |
| **dosszié/PIN** | alkalmi dosszié útvonala, PIN-zárolás felülete, PIN-ütközés tiltása |

Az összefésülés **git háromutas** módon történt a közös őstől — egyik ág
munkája sem veszett el. A merge maga konfliktus nélkül ment; a törést a
**tesztek** mutatták meg, négy helyen.

### 🔴 A `007` — három ígéret, amit semmi nem tartott be

A dosszié/PIN ág felülete olyan szerveroldalt feltételezett, ami **nem létezett**:

| Mit ígért a felület | Mi volt a valóság | Javítás |
|---|---|---|
| Zárolás-jelző (piros/sárga) a `Personal` lapon | `rpw2_pin_status` **nincs** — a hívás `try/catch`-ben elnyelődött, a jelző SOHA nem jelent meg | `007`: az RPC megvan, csapatkezelői joggal, saját szervizre szűrve |
| **Deblochează** gomb | `rpw2_pin_unlock` **nincs** — a gomb sem jelent meg, a zárolt kolléga 15 percet várt | `007`: jogot kér, auditba kerül |
| „NU un an, nu cifre identice sau consecutive… Fiecare coleg trebuie să aibă alt PIN" | a `004` `rpw2_pin_set` **csak a hosszt** nézte | `007`: `weak_pin` + `pin_taken` a szerveren, `rpw__pin_weak()` |

A zárolás maga működött (`002`, `rpw_pin_attempt`) — csak **se látni, se
feloldani** nem lehetett. Ez a legrosszabb fajta hiba: a felület azt
állította, hogy nincs zárolt kolléga.

Ráadás: **új PIN-nél a rossz próbálkozások elévülnek.** Enélkül a dolgozó a
friss PIN-jével is zárolva maradt volna.

`007_rollback.sql` visszaállítja a `004`-es állapotot. Séma-verzió: `007`.

### Tesztek — ami a törést megmutatta

| Teszt | Mit mutatott | Mi lett belőle |
|---|---|---|
| `test-rpc-consistency` | a kliens **két nem létező RPC-t** hív | ez adta a `007`-et |
| `test-entry`, `test-acceptance` | a dosszié mentése navigál | a teszt elvárása igazodott a **szándékos** 2026-08-25-i változáshoz |
| `test-render` | a kék gomb `openDosarModal()`-t hív | ugyanaz |

**Új: `test-int-tenant` PIN-szakasz** — valódi PostgreSQL: gyenge PIN,
ütköző PIN, 10 rossz PIN → zárolás, jogosultság, bérlőizoláció, feloldás,
audit, elévülés. A migrációs ciklus a `007`-tel együtt jár körbe
(rollback fordítva, majd újra).

### Őszinteség a tesztharnessen

A `test-acceptance.js` NAV-jelzője minden navigációt
`'rpw-recepcio-red.html'`-ként könyvelt el — a jsdom ugyanis **nem adja meg
a cél URL-t**, és a `location.assign` sem cserélhető ki (belső wrapper,
mérve). A jelző mostantól csak azt állítja, amit tud: *navigált*. A cél
URL-t a `test-entry.js` méri, ahol a `location` sima Node-global.

---
## 2026-08-24 — P0/P1 javítási kör

**A régi csomagot nem írtuk felül.** Ez új verzió.

---

### Adatbázis-migrációk *(fájlként, NEM futtatva)*

| Fájl | Változtatás | Javított kockázat | Kompatibilitás |
|---|---|---|---|
| `_migrations/001_rls_lockdown.sql` | `rpw_jobs "anon rw" qual:true` megszüntetése; force RLS 7 táblán; `search_path` minden SECURITY DEFINER függvényen; grant-tisztítás; a régi (`rpw_patch`, `rpw_patch_v2`, `rpw_login`, `rpw_session`) utak visszavonása | 🔴 Bárki az anon kulccsal közvetlenül olvashatta/írhatta **bármely szerviz** munkáit | **Töréspont**: csak a `v3` kliens után futtatható |
| `_migrations/002_server_transitions.sql` | `rpw_transition(token,id,phase,action,expected_version,reason)`; `rpw_patch_v3` verziózárral | 🔴 A fázisszabályok csak a böngészőben éltek — RPC-hívással bármelyik átugorható volt | Additív; `SERVER_TRANSITIONS:false` mellett nem használt |
| *(mindkettőhöz)* | `001_rollback.sql`, `002_rollback.sql` | — | — |

### Netlify-funkciók

| Fájl | Változtatás | Javított kockázat |
|---|---|---|
| `functions/_shared.js` | **`auth.__token` → `auth.token`** — a mezőt soha senki nem állította be | 🔴 Az `ownsJob` tulajdonjog-ellenőrzés **mindig elbukott** |
| `functions/_shared.js` | `rpw_session` → `rpw2_session`; `shop_id` kötelező | 🟠 Kevert munkamenet-modell |
| `functions/ocr.js` | `H.detectMedia()` dönt a formátumról; ismeretlen → **415** | 🟠 Ismeretlen tartalom „alapértelmezett jpeg"-ként ment az AI-nak |

### Kliens

| Fájl | Változtatás | Javított kockázat |
|---|---|---|
| **`rpw-cache.js`** *(új)* | TTL 24 h, szerviz+dolgozó hatókör, `wipe()` kijelentkezéskor, MIN mód | 🔴 A **teljes** munkaobjektum (`client`, `phone`, `vin`, fotók) TTL nélkül a `localStorage`-ban, közös gépen a következő belépőnek is látszott |
| 9 oldal | 42 gyorsítótár-hívás átterelve a modulra | ugyanaz |
| `rpw-auth.js` | kijelentkezés → `RPWCache.wipe()` | ugyanaz |
| `index.html` | indulási `migrateLegacy()` + 10 percenkénti `sweep()` | régi bejegyzések takarítása |
| **`rpw-db.js`** | **Két párhuzamos „secure" út egyesítése.** A régi `rpw_patch_secure`, `rpw_soft_delete`, `rpw_restore`, `rpw_purge`, `rpw_purge_all_trashed` **nem létezik az adatbázisban** | 🔴 `AUTH_REQUIRED=true` mellett **minden mentés és törlés elszállt volna** |
| `rpw-db.js` | minden válasz `unwrap()`-en megy át | 🔴 A szerver `{ok:false}` elutasítása **sikernek látszott** |
| `rpw-db.js` | `purgeAllTrashed` egyesével töröl | minden törlés külön auditsort kap |
| **`rpw-save.js`** | `else if` → `if`: a verziózár ága sosem futott le, ha volt token | 🔴 Az optimista zár **csendben kikapcsolt volna** |
| `rpw-dosar.html` | `openLB` DOM-építéssel + sémaellenőrzés | 🟠 XSS: a képforrás escape nélkül ment `innerHTML`-be |
| `index.html` | a PIN-figyelmeztetés szövege javítva | A „közös a Red ERP-vel" **már nem igaz** |

### Tesztelés

| Fájl | Változtatás |
|---|---|
| `_tests/run-all.js` | Új futtató: **„el sem indult" külön kategória és hibának számít**; `last-run.json` gépi jelentés; Node/npm/jsdom/build verziók |
| **`_tests/test-security-a-o.js`** *(új)* | A brief 15 biztonsági tesztje (A–O) + P (gyorsítótár) — **89 állítás** |
| 23 tesztfájl | fix fejlesztői útvonalak eltávolítva | 🟠 **6 teszt el sem indult**, és a régi futtató ezt sikernek vette |
| `package-lock.json` *(új)* | 39 csomag rögzítve — `npm ci` reprodukálható |

### Konfiguráció

| Fájl | Változtatás |
|---|---|
| `rpw-config.staging.js` *(új)* | A biztonságos konfiguráció **külön fájlban, NEM aktív**. Előfeltételekkel és a PIN-blokkolóval a fejlécben |

---

## Mérés

```
30 tesztfájl · 1117 állítás · 1117 sikeres · 0 sikertelen · 0 el sem indult · 22,5 s
```
Node v22.22.2 · npm 10.9.7 · jsdom 30.0.1 · 2026-08-24

---

## 2026-08-24 (második kör) — a nyitott tételek lezárása

### 13 — OCR bemenet- és kimenetvalidálás → **KÉSZ**

| Fájl | Változtatás | Javított kockázat |
|---|---|---|
| `functions/_shared.js` | **`validateOcr()`** — típusonkénti mezőséma (`talon`, `buletin`, `constatare`, `audatex`); ismeretlen mezőket eldob, üres eredményt elutasít | 🟠 Az AI válaszát szerkezet-ellenőrzés nélkül fogadtuk el |
| `functions/_shared.js` | `flagUncertain()` bővítve: rendszám, kárszám, **pénzügyi összegek**, órák — mind `needsConfirm:true` | 🟠 Csak `vin`/`cnp` volt jelölve |
| `functions/ocr.js` | **Érvénytelen JSON → 502**, nem 200 | 🔴 Korábban `console.warn`, majd a szemét **sikerként** ment vissza |
| `functions/ocr.js` | Séma-hiba → 502; a válasz `needsHumanReview:true`-t ad | Az AI eredménye **nem vált fázist** |

### 14 — XSS-audit → **KÉSZ**

| Fájl | Változtatás | Javított kockázat |
|---|---|---|
| `_tests/xss-audit.js` *(új)* | Statikus átvizsgáló: 13 219 sor, 1 048 HTML-építő sor | — |
| `index.html` | `s.plate`, `s.client` **escape-elve** a „beragadt munkák" listában | 🔴 Valódi XSS: rendszám és ügyfélnév nyersen HTML-be |
| `rpw-reconstatare-red.html` | `rc.responseNote` **escape-elve** | 🔴 Valódi XSS: a biztosító szabad szövege nyersen HTML-be |
| `_tests/test-xss.js` *(új)* | **95 állítás** — `<img onerror>`, `<script>`, idézőjel, `javascript:`, `svg onload`, zárótag-törés | — |

### 5 + 6 — szerveroldali elutasítás és ütközéskezelés → **KÉSZ**

| Fájl | Változtatás |
|---|---|
| `_migrations/002_server_transitions.sql` | **`rpw__deny()`**: stabil hibakód + **román üzenet** + az **elutasított kísérlet auditálása** (`denied:<kód>`). Az audit hibája nem blokkolja a választ |
| **`rpw-conflict.js`** *(új)* | Ütközéskor a felhasználó **dönt**: újratöltés vagy újraalkalmazás. A helyi módosítás megőrizve. Fázislezárásnál külön figyelmeztetés: **nincs automatikus összefésülés** |
| `index.html` | `onSyncState('conflict')` → párbeszéd; `location.reload()` vagy újraküldés a szerver verziójával |
| 9 oldal | `rpw-conflict.js` betöltve |
| `_tests/test-conflict.js` *(új)* | **27 állítás** |

### Mérés (tiszta könyvtár, `npm ci` után)

```
32 tesztfájl · 1239 állítás · 1239 sikeres · 0 sikertelen · 0 el sem indult · 23,5 s
```

---

## 2026-08-24 (v3) — integrációs és biztonsági javítások

**A v2 csomagot nem írtuk felül.**

### 🔴 Kritikus integrációs hibák

| Fájl | Változtatás | Javított kockázat |
|---|---|---|
| `rpw-data.js` | **Hat NEM LÉTEZŐ RPC** (`rpw_complete_phase`, `rpw_close_job`, `rpw_skip_phase`, `rpw_create_rework`, `rpw_resolve_rework`, `rpw_manager_override`) → egyetlen `rpw_transition` | 🔴 A `SERVER_TRANSITIONS:true` bekapcsolásakor **minden fázisváltás elszállt volna** |
| `rpw-db.js` | `listActive`: a `useSecure()` ág törölve — nem unwrap-elt | 🔴 A `{ok:false}` szerverválasz **sikeres adatként** ment a hívónak |
| `rpw-db.js` | `listTrashed`: `rpw_jobs_trashed` (nem létezik) → `rpw_jobs_list(p_token, p_trashed)` | 🔴 A kosár listázása elszállt volna |
| `rpw-db.js` | `unwrap()`: `{code, message, serverVersion, missing, need, details}` | 🟠 A hibakód, a szerver verziószáma és a hiánylista **elveszett** |

### 🔴 Atomi verziózár

| Fájl | Változtatás |
|---|---|
| `002_server_rpc.sql`, `003_business_requirements.sql` | A verziófeltétel **magában az UPDATE-ben**: `where ... and version = p_expected_version`. Ha nem tér vissza sor: `not_found` vagy `version_conflict` + `server_version` + audit |
| | A `p_expected_version` **kötelező** — hiánynál `expected_version_required` |

**Igazolva:** két külön adatbáziskapcsolat, `Promise.all`, azonos verzió → **pontosan egy sikerül**. Mentésre és fázislezárásra is.

### 🔴 Üzleti kapuk szerveroldalon

| Fájl | Változtatás |
|---|---|
| `003_business_requirements.sql` | **`rpw_phase_requirements`** tábla: 14 alapszabály (fázis, művelet, kód, adatút, ellenőrzés típusa, súlyosság, override-olható, román üzenet) |
| | `rpw__missing()` — a szerver ebből ellenőriz; `rpw_requirements()` — a kliens ugyanezt kéri le |
| | Elutasítás: `requirements_missing` + `missing[]` román üzenetekkel |

**Egy szabályforrás** — nincs két kézzel másolt rendszer.

### 🔴 Migrációs sorrend

Öt migráció, **függőségi sorrendben**: alapséma → RPC-k → szabályok → személyzet → RLS-lezárás. Mindegyikben `begin/commit`, előfeltétel-ellenőrzés (hiánynál `raise exception`), ellenőrző lekérdezés, rollback.

A `005` **csak létező függvényre** grantol — a v2-ben a `001` olyanra adott jogot, amit a `002` hozott létre.

### Egyéb

| Fájl | Változtatás |
|---|---|
| `rpw-guard.js` | **Kilenc** production-feltétel (négy helyett); `rpw_server_capabilities` ellenőrzés; kliens–szerver verzióütközésnél megáll, románul |
| `rpw-cache.js` | A **rendszám maszkolva** (`MS-…-ABC`); teljes tiltólista (`email`, `cnp`, `ocr`, `nrDosar`, `asigurator`…); `scrub()` védőháló beágyazott mezőkre; kijelentkezéskor a konfliktus-payload és az offline sor is törlődik |
| `netlify.toml` | CSP: `frame-src 'none'`, `worker-src 'self'`, `upgrade-insecure-requests`; a `connect-src`-ből kivéve a felesleges `data:`/`blob:`; **report-only** szigorú CSP stagingre |

### Tesztek

| Fájl | Mit |
|---|---|
| `_tests/run-all.js` | **Háromkategóriás**: unit / integration / staging, külön ítélettel. A staging csak `STAGING-VERIFIED.json` alapján lehet `VERIFIED` |
| `_tests/integration/_db.js` | Beágyazott PostgreSQL indítása |
| `_tests/integration/test-int-tenant.js` | **VALÓDI adatbázis**: tenant-izoláció, atomi zár, üzleti kapuk, jogosultság, audit |
| `_tests/integration/test-int-migrations.js` | **VALÓDI adatbázis**: migrációs ciklus, rollback fordítva, újrafuttatás, audit-hiba viselkedése |
| `_tests/unit/test-rpc-consistency.js` | A kliens hívásai vs. a migrációk — ez fogta volna meg a v2 hibáját |
| `_tests/unit/test-list-unwrap.js` | `listActive`/`listTrashed`, hibaobjektum-szerkezet |
| `_tests/gen-report.js` | A `TEST-REPORT.md` **generálása** a `last-run.json`-ból |

### Dokumentáció

`REMAINING-RISKS.md`, `MANUAL-STAGING-CHECKLIST.md`, `FILE-CHANGES.md` — újak.
`SECURITY.md` mostantól jelöli, **mi mivel van igazolva** (integrációs / unit / migráció kész / staging / emberi döntés).

---

## 2026-08-24 (v4) — a biztonságos workflow TÉNYLEGES bekötése

**A V3 csomagot nem írtuk felül.**

A V3-ban elkészült a `rpw_transition`, de **egyetlen HTML-oldal sem használta**. A fázisok továbbra is normál patch-csel záródtak, és a `rpw_patch_v3` tetszőleges deep merge-öt engedett — egy `{"inchis":true}` patch lezárta a dossziét minden ellenőrzés nélkül.

### 🔴 Szerveroldal — `006_workflow_enforcement.sql`

| Változtatás | Javított kockázat |
|---|---|
| **`rpw_protected_fields`** (25 minta) + rekurzív útellenőrzés (`rpw__patch_paths`, `rpw__protected_hits`) | 🔴 A `rpw_patch_v3` MEGKERÜLTE a teljes workflow-t. Nested, `null`, típusváltásos és teljes-objektumos megkerülés is |
| **`rpw_patch_permissions`** (30 szabály) + `rpw__patch_needs` | 🔴 Bármely bejelentkezett dolgozó BÁRMELY mezőt írhatta |
| `rpw_job_trash` **`delete` jogot kér** | 🔴 A V3-ban bárki kosárba tehetett bármit |
| Indoklás **min. 5 érdemi karakter** skip / reopen / rework_open esetén | 🟠 Az üres indoklás átment |
| Külön **`p_rework_id`** és **`p_note`** | 🟠 A `p_reason` egyszerre volt azonosító és indoklás |
| `rpw_server_capabilities`: `protected_fields`, `patch_permissions`, `workflow_enforced` | a kliens ellenőrizni tudja |

Elutasításkor: `protected_workflow_field` + a **konkrét mezőutak** (`phases.7.status`), román üzenettel, és `denied:protected_workflow_field` auditsor — **adattartalom nélkül**.

### 🔴 Kliensoldal — a tölcsér átterelése

| Fájl | Változtatás |
|---|---|
| `rpw-workflow.js` | **`commitCriticalTransition`** — az egyetlen pont, ahol a 9 oldal fázist vált — a szerverre megy, ha `SERVER_TRANSITIONS=true`. A helyi mutáció **NEM fut le**. Sikernél a SZERVER állapotát és verzióját veszi át; elutasításnál a `phase`/`phases`/`inchis`/`rework` **változatlan** |
| | **Offline:** kritikus művelet nem hajtódik végre, a fázis nem lesz „done", RPC sem megy |
| | **Hiányzó verzió:** `no_version` — null verzióval nem indul átmenet |
| | **`prepare`** ág: a lezárás előtti normál mezők (pl. `evalData.status`, `closing.closedAt`) a rendes mentési úton mennek, a fázisváltás előtt |
| `rpw-data.js` | A `{ok:false}` válasz **NEM siker** (a V3-ban az volt); `p_rework_id`/`p_note`; `RPWData.init()` közös példány |
| **11 HTML-oldal** | `rpw-data.js` betöltve — **a függőségei után**; `RPWData.init()` bekötve; **mind a 11 kritikus hívási hely** megjelölve művelettel |
| `rpw-dosar.html` | **`dosarInchide` → 7. fázis lezárása** (korábban közvetlen `{inchis:true}` patch!); **`dosarInapoi` → újranyitás** kötelező indoklással; a `phase` kikerült a patch-ből |
| `index.html` | **`reactiveaza` → újranyitás** indoklással (korábban `job.inchis=false` patch); az előjegyzés nem nyitja újra a munkát |
| `rpw-guard.js` | **`verifyServer` fail-closed**: production módban a hálózati hiba, időtúllépés és hibás válasz is **megállítja** az alkalmazást |
| 11 oldal | `verifyServer` az adatbetöltés **ELŐTT** — nincs versenyhelyzet |

### Tesztek

| Fájl | Mit |
|---|---|
| `_tests/integration/test-int-workflow.js` | **81 állítás valódi PostgreSQL-en**: 9 megkerülési kísérlet, szerepkör-jogosultság, trash-jog, rework-azonosító, rollback |
| `_tests/frontend/test-fe-transition.js` | **176 állítás VALÓDI oldalkóddal** jsdom-ban: mind a 7 fázisoldal + dosar; elutasítás, konfliktus, offline, kettős mentés |
| `_tests/static/test-static-workflow.js` | Statikus workflow-audit dokumentált engedélylistával |
| `_tests/run-all.js` | **Öt kategória**: unit / database integration / frontend integration / static audit / staging |
