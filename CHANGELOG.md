# CHANGELOG.md

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
