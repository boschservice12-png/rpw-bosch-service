# REMAINING-RISKS.md

Ismert maradék kockázatok — **súly szerint**, nem sorrendben.
Az „igazolva" oszlop megmondja, hogy állítás vagy mérés.

---

## 🔴 Élesítést blokkoló

### 1. Tíz aktív dolgozónak nincs PIN-je
| | |
|---|---|
| **Mi a kockázat** | Az `AUTH_REQUIRED:true` a 11 aktív dolgozóból 10-et kizár |
| **Miért nincs megoldva** | Ez nem technikai kérdés — emberenként PIN-t kell kiosztani |
| **Ki oldja meg** | **EMBERI DÖNTÉS** — `Echipă → Personal` lapon |
| **Igazolva** | — |

### 2. A migrációk nem futottak le éles adatbázison
| | |
|---|---|
| **Mi a kockázat** | Amíg nem futnak, az `rpw_jobs` táblán él az `anon rw qual:true` szabály: az anon kulcs birtokában bárki közvetlenül olvashat és írhat, az RPC-ket megkerülve |
| **Miért nincs megoldva** | Az 1. alapelv tiltja az éles adatbázis módosítását |
| **Igazolva** | Az öt migráció **valódi PostgreSQL-en lefutott**, rollbackkel és újrafuttatással együtt — de *tesztadatbázison* |
| **Következő lépés** | `DEPLOYMENT.md` szerint, staging környezetben |

### 3. A staging ellenőrzés nem történt meg
| | |
|---|---|
| **Mi a kockázat** | Valódi login, két böngészős ütközés, signed URL, OCR, e-mail, CSP — egyik sincs élesben mérve |
| **Igazolva** | — **NEM VOLT IGAZOLHATÓ** |
| **Következő lépés** | `MANUAL-STAGING-CHECKLIST.md` |

---

## 🟠 Közepes

### 4. A `'unsafe-inline'` a script-src-ben marad
| | |
|---|---|
| **Mi a kockázat** | XSS esetén a beszúrt inline script lefut, és a `localStorage`-ban lévő munkamenet-token kiolvasható |
| **Miért marad** | Az alkalmazás 12 oldalon, több száz helyen használ inline scriptet és `onclick` kezelőt. Eltávolítása nonce/hash bevezetését és teljes handler-refaktort igényel — enélkül az alkalmazás **megbénulna** |
| **Enyhítés** | A `netlify.toml` tartalmaz **report-only** szigorú CSP-t stagingre: méri, mi törne el, blokkolás nélkül |
| **Igazolva** | Az XSS-escape unit teszttel (95 állítás), a `javascript:` séma tiltása a `openLB()`-ben |

### 5. A tartalmi fázisszabályok kliens- és szerveroldalon is léteznek
| | |
|---|---|
| **Mi a kockázat** | A `rpw-workflow.js` UX-előellenőrzése és a `rpw_phase_requirements` tábla eltérhet |
| **Enyhítés** | A **szerver** dönt: a `rpw_transition` a táblából ellenőriz, és `requirements_missing` + `missing[]` listát ad vissza. A kliens ugyanezt a listát kérheti le (`rpw_requirements`) — így egy forrás marad |
| **Ami hátravan** | A `rpw-workflow.js` átállítása a szervertől kapott listára. Ma még saját szabályokat is tartalmaz |
| **Igazolva** | Integrációs teszt: kötelező dokumentum nélkül **közvetlen RPC-hívással sem** zárható fázis |

### 6. ~~A `rpw-data.js` egyetlen oldalon sincs betöltve~~ — ✅ MEGSZŰNT (V4)
| | |
|---|---|
| **Mi volt** | A javított fájl halott kód volt — a `SERVER_TRANSITIONS:true` önmagában nem irányította át a forgalmat |
| **Most** | 11 oldal tölti be, `RPWData.init`-tel; a fázisátmenetek a szerverre mennek |
| **Igazolva** | `grep -l "rpw-data.js" *.html` → 11 oldal · `test-fe-transition.js`: valódi oldalkód jsdom-ban, mind a 7 fázisoldal |

### 7. Kilenc oldal duplikált runtime-ja
| | |
|---|---|
| **Mi a kockázat** | Ugyanaz a logika (betöltés, cache, konfliktus, mentés) ~5000 sorban szétszórva; egy javítás kilenc helyen kell |
| **Miért nincs megoldva** | A tesztek az oldalak *viselkedését* mérik, nem a szerkezetüket — refaktor után a zöld teszt nem bizonyítaná a változatlanságot |
| **Javaslat** | Oldalanként, külön körökben, oldalankénti tesztekkel |

---

## 🟡 Alacsony

### 8. A munkamenet-token `localStorage`-ban
`httpOnly` süti csak saját backenddel lenne lehetséges; a Supabase anon-kulcsos modellben nem. Enyhítés: 12 órás lejárat, kijelentkezéskor teljes törlés, szerveroldali visszavonás.

### 9. A rendszám maszkolva, de felismerhető
`MS-01-ABC` → `MS-…-ABC`. **Jogalap:** a dolgozónak fel kell ismernie az autót a listán. **Kockázat:** a maszkolt alak szűk körben visszafejthető lehet (egy műhely napi 10-20 autója). A teljes rendszám csak a szerverről jön, a munka megnyitásakor.

### 10. A rate-limit példányonkénti memóriában
A Netlify-funkciók hidegindításkor nullázódnak. Durva abúzus ellen véd, elosztott támadás ellen nem. Valódi megoldás külső tárolót igényel.

### 11. A kivezetett RPC-k léteznek
`rpw_patch`, `rpw_login`, `rpw_team`, `rpw_next_job_number` — nincs bennük bérlővédelem. **Nem kapnak GRANT-ot** a `005`-ben, tehát production-ban nem hívhatók; `deprecated` választ adnak. Az RPC-konzisztencia teszt külön ellenőrzi, hogy nem kaptak jogot.

---

## Amit szándékosan NEM oldottam meg

**Nem futtattam éles adatbázison semmit.** Az 1. alapelv ezt tiltja, és ez a helyes: egy hibás migráció élesben megállítaná a műhelyt.

**Nem állítottam „minden teszt sikeres"-t.** A staging nem futott, ezért a tesztfuttató is `NOT VERIFIED`-et ír ki, és a `TEST-REPORT.md` is ezt tükrözi.

---

# V4 — új és megváltozott kockázatok

## Amit a V4 megszüntetett

| Korábbi kockázat | Állapot |
|---|---|
| A `rpw_patch_v3` megkerülte a workflow-t | ✅ **megszűnt** — 9 megkerülési kísérlet elutasítva valódi adatbázison |
| A HTML-oldalak nem használták a `rpw_transition`-t | ✅ **megszűnt** — mind a 7 fázisoldal bizonyítva valódi UI-kóddal |
| Bárki írhatott bármely mezőt | ✅ **megszűnt** — 30 mezőszintű jogosultsági szabály |
| A `rpw_job_trash` nem kért `delete` jogot | ✅ **megszűnt** |
| A `verifyServer` hálózati hibánál továbbengedett | ✅ **megszűnt** — production-ban fail-closed |

## 🟠 Ami maradt vagy új

### A `rpw-workflow.js` kettős szerepe
A modul **továbbra is tartalmazza** a helyi fázislogikát (`completePhase`, `skipPhase`, `setState`). Élesben ez **nem fut le** — a `commitCriticalTransition` a szerverre megy —, de a kód ott van.

**Miért maradt:** a fejlesztői (szerver nélküli) mód és az UX-előnézet erre épül. Eltávolítása a teljes offline működést törölné.

**Kockázat:** ha valaki a jövőben KÖZVETLENÜL hívja a `RPWWorkflow.completePhase()`-t a tölcsér megkerülésével, helyben „done"-t kapna — a szerver viszont **nem** fogadná el a mentést (`protected_workflow_field`). Tehát adatromlás nem keletkezik, de a felület félrevezető lehetne a mentésig.

**Enyhítés:** a statikus workflow-audit minden ilyen hívást megtalál.

### A `prepare` ág kettős mentése
Az `evaluare` és az `inchidere` oldalon a lezárás előtt egy **normál patch** is megy (a `evalData.status`, illetve a `closing.closedAt` miatt). Ha a patch sikerül, de az átmenet elbukik, a normál mező **elmentve marad**, a fázis viszont nem zárul le.

**Miért így:** a fordított sorrend rosszabb lenne — a lezárt fázis után elveszett adat.
**Kockázat:** alacsony; a felhasználó újrapróbálhatja, az adat nem vész el.

### A rendszám maszkolása
`MS-01-ABC` → `MS-…-ABC`. Egy műhely napi 10–20 autójánál a maszkolt alak szűk körben visszafejthető.
**Jogalap:** a dolgozónak fel kell ismernie az autót a listán.

### `'unsafe-inline'` a CSP-ben
Változatlan a V3 óta. Report-only staging fejléc készen áll a méréshez.

---

# 2026-08-25 — az összefésülés után

## Amit a `007` megszüntetett

| Korábbi kockázat | Állapot |
|---|---|
| A zárolás-jelző nem létező RPC-t hívott — a vezető azt hitte, nincs zárolt kollégája | ✅ **megszűnt** — `rpw2_pin_status`, valódi adatbázison igazolva |
| A zárolást 15 percnél hamarabb nem lehetett feloldani | ✅ **megszűnt** — `rpw2_pin_unlock`, joghoz kötve, auditálva |
| A felület szigorúbb PIN-szabályt ígért, mint amit a szerver betartatott | ✅ **megszűnt** — `weak_pin` + `pin_taken` a szerveren |

## 🟠 Ami ÚJ

### A `007` nem futott le éles adatbázison
| | |
|---|---|
| **Mi a kockázat** | Amíg nem fut, a `Personal` lap zárolás-jelzője és feloldó gombja **továbbra sem jelenik meg** — a hiba csendes marad |
| **Miért nincs megoldva** | Az 1. alapelv tiltja az éles adatbázis módosítását |
| **Igazolva** | A `007` valódi PostgreSQL-en lefutott, rollbackkel és újrafuttatással — *tesztadatbázison* |
| **Következő lépés** | `DEPLOYMENT.md` 9. lépés |

### A meglévő PIN-ek lehetnek gyengék vagy ütközők
A `007` **csak az új beállításra** szigorít. Aki ma `1234`-gyel lép be, azzal
holnap is be fog. **Jogalap:** a visszamenőleges kényszerítés kizárná a
dolgozókat a rendszerből, ami rosszabb, mint a gyenge PIN.
**Következő lépés:** a PIN-kiosztás (1. kockázat) során a `007` már szűr —
a két feladat egyszerre elvégezhető.

### Az iratbesorolás élesben nincs mérve
| | |
|---|---|
| **Mi a kockázat** | A besorolás minősége csak VALÓDI iratokon derül ki. Rossz javaslat esetén a kolléga rossz résbe tölthet — ha nem nézi meg |
| **Mi védi** | A javaslat sosem ír magától: a lista jóváhagyásig semmit nem tölt fel, a bizonytalan sor üresen marad, a felülírás veszélye ki van írva |
| **Ami NEM védi** | Ha valaki gondolkodás nélkül nyomja a „Încarcă"-t. A rossz rés viszont **javítható** — törlés + újratöltés, és a törlés most már működik |
| **Igazolva** | Logika és felület: 105 állítás, ebből 18 valódi lapkódon. A modell TALÁLATI ARÁNYA: nincs mérve — valódi iratok kellenek hozzá |
| **Következő lépés** | `MANUAL-STAGING-CHECKLIST.md` 12b |

### ~~A `rpw-queue.js` be nem kötött képesség~~ — ✅ BEKÖTVE (2026-08-25)
11 lap tölti be, a `RPWData.init` újratöltés után elindítja, a `RPWSave`
tölti. Az offline mentés **túléli a frissítést**. Igazolva: `test-queue.js`
(44 állítás), a teljes úttal.

**Ami a bekötésből hátravan:** az IndexedDB-út **élesben nincs mérve**. A
teszt memóriatáron fut (két külön példány, ugyanaz a tár) — a valódi
IndexedDB viselkedése (kvóta, privát ablak, több fül egyszerre) staging-et
igényel. `MANUAL-STAGING-CHECKLIST.md` 9. pont.

### A halott CSS nem mérhető statikusan
~48 osztály látszik használatlannak, de a lapok tizenegy helyen futásidőben
építenek osztálynevet. **Vizuális teszt nincs**, ami elkapná a téves törlést.
Ezért ezek maradnak. Feloldás: képernyőkép-összehasonlítás staging ellen —
addig a CSS-takarítás több kockázat, mint haszon.

### Az `ANTHROPIC_API_KEY` egyetlen ponton dől el
Ha a kulcs hiányzik vagy lejár, a `classify` 500-at ad, és **minden** sor
„nem ismerem fel" lesz. Ez nem törés — a kézi választás megmarad —, de a
funkció értéke elvész, és ezt csak a felületen látni. Riasztás nincs rá.

### A dosszié-útvonal élesben nincs mérve
Az alkalmi dosszié 2026-08-25-i útvonala (kék gomb → ablak → mentés → a
dosszié lapja) **unit- és jsdom-szinten** igazolt. Valódi böngészőben,
valódi szerverrel nem — `MANUAL-STAGING-CHECKLIST.md` 13. pont.

### A beléptetés 11 emberből 6-ot kizárna — és két hely mást mond
**Mérve 2026-08-29-én, élő adatbázison, csak olvasással.**

Az `AUTH_REQUIRED=true` kitétele ma a következőt tenné:

| élő szerep | fő | RPW-hozzáférés |
|---|---|---|
| Recepció, Karosszéria, Festő, Műszakvezető, Irodavezető | 1–1 | **van** |
| Szerelő | **4** | nincs |
| Sofőr | 1 | nincs |
| Egyéb | 1 | nincs |

**5 fő tudna belépni, 6 fő kizárva.**

A `rpw-roles.js` `EMPLOYEE_ROLE_MAP`-ja csak öt magyar munkakört ismer; a
többi `null`-t ad, amitől a `RPWAuth.login()` `hasRpwAccess:false`-szal
elutasít („Cont valid, dar fără acces la fluxul de vopsitorie").
A kód szerint ez **Ferenc 2026-08-17-i döntése**, nem hiba.

**Az ellentmondás:** az adatbázis `rpw_roles` táblájában a Szerelő
(`TECH`) szerepnek `can_work = true` joga van. A szerep-tábla tehát
megengedi neki a munkát, a kliens-oldali leképezés viszont teljesen
kizárja az RPW-ből. Amíg `AUTH_REQUIRED=false`, ez nem látszik: mindenki
mindent lát. A beléptetés pillanatában a két forrás szétválik, és a
szigorúbb nyer.

**Amíg ez nem dől el, a beléptetés nem tehető ki** — és nélküle a
`008` lezárás sem, mert a dolgozói lapok utána csak bejelentkezve
működnek. A 33 munka addig az anon kulccsal elérhető marad.

Feloldás: vagy a Szerelő/Sofőr/Egyéb valóban nem használja az RPW-t (akkor
a `rpw_roles.can_work` hozandó összhangba), vagy fel kell venni őket a
leképezésbe a saját fázisaikkal.

### A régi Netlify-oldal még él, és ugyanarra az adatbázisra lát

**Ferenc döntése (2026-08-29): a `beamish-arithmetic-e52bce` oldalon
már nem dolgozunk. Az élő cím a `rpw-bosch-service`.**

Amit ma megtettem: a régi cím **lekerült** a Netlify-funkciók
CORS-listájáról (`functions/_shared.js`). Ami ott megnyílik, annak az
OCR-je, az iratbesorolása és a levélküldése CORS-hibára fut. Ez
szándékos: jobb, ha a régi oldal láthatóan nem működik, mint ha
csendben, kilenc napos kódból dolgozna tovább.

**Ugyanaznap, Ferenc utasítására elvégezve: az oldal ÁT LETT NEVEZVE**
`beamish-arithmetic-e52bce` → `rpw-regi-lezarva-2026-08`.

A régi **könyvjelző címe ezzel megszűnt**: aki azt nyitja meg, nem a
kilenc napos alkalmazást kapja. Az oldal maga nem lett törölve — a
deploy-történetével együtt megmaradt, csak más néven. Visszavonható egy
átnevezéssel.

Pontosan ez a mechanizmus tüntette el 2026-08-29-én a telefonról
feltöltött iratot a műhelyi gépről.

**Ami ebből MEGMARADT kockázatnak:**

1. A felszabadult `beamish-arithmetic-e52bce.netlify.app` alnevet
   elvileg **bárki más regisztrálhatja**. A csapat egy régi
   könyvjelzője ekkor idegen tartalomra mutatna. Ezért marad a cím a
   funkciók tiltólistáján — negatív teszt őrzi.
2. Az oldal az **új néven továbbra is kiszolgál**, és a fájljaiban ott
   az anon kulcs, tehát elvben eléri az élő adatbázist. Az új nevet
   senki nem ismeri, de a teljes lezárás az oldal **törlése** lenne —
   ez a Netlify API-n keresztül nem elérhető, a felületen egy kattintás.

| | |
|---|---|
| **Mi a kockázat** | Két különböző kódváltozat írja ugyanazt az adatbázist; az egyik nem kap javítást |
| **Mi történt** | Átnevezve — a régi könyvjelző címe megszűnt |
| **Mi maradt** | Az alnév felszabadult (más regisztrálhatja); az oldal új néven él |
| **Végleges lezárás** | Az oldal törlése a Netlify felületén — **Ferenc**, egy kattintás |
| **Igazolva** | Netlify API: `beamish` néven nincs oldal; a projekt `rpw-regi-lezarva-2026-08`. A CORS-tiltást negatív teszt őrzi (`test-p0-7-functions.js`). **A címet magát innen nem tudtam lekérdezni** — a konténer minden `netlify.app` hívást blokkol (a működő oldal is), ezért ez API-bizonyíték, nem böngésző-bizonyíték |

### A staging ugyanazt az adatbázist használja, mint az éles

A `rpw-config.staging.js` `SB_URL`-je **ugyanaz a projekt**, mint az
élesé (`pxypbbvqinbwesfikkdb`). Külön staging-adatbázis tehát **nincs**.

Ez az RPW-018 (staging-igazolás) szempontjából lényeges: egy „staging"
próba ma **élő adatokon** futna. Amíg nincs külön projekt, a staging
ellenőrzés nem végezhető el biztonságosan — ezért maradt „NEM IGAZOLT".

| | |
|---|---|
| **Mi a kockázat** | A staging-próba éles adatot módosítana |
| **Mi oldja meg** | Külön Supabase-projekt stagingre (Ferenc döntése — költség és idő) |
| **Igazolva** | `rpw-config.js` és `rpw-config.staging.js` `SB_URL`-je azonos; a `test-deploy.js` 6. szakasza rögzíti, hogy **egy** projekt van |

### ~~Régi munkamásolatok a kiszolgált sémában~~ — ✅ ELINTÉZVE (011)

Négy `rpw_jobs_backup_*` tábla ült a `public` sémában, kikapcsolt
RLS-sel, összesen 87 munkasorral — ügyféladatostul. Elérhetők nem
voltak (nem volt rájuk grant, ezt megmértem), de a `public` sémát a
PostgREST kiszolgálja: egyetlen elgépelt `grant` elég lett volna.

2026-08-29: átkerültek a zárt `rpw_archiv` sémába (`011`). Nem törölve —
egy `alter table ... set schema public` visszahozza őket. A törlés külön
döntés, külön napon.

### A régi `foto` tároló 11 árva fájlja — nyitott, kis súly

A Bosch projektben két tároló van: `rpw-photos` (296 fájl, ez az élő) és
`foto` (11 fájl, **utoljára 2026-02-25-én írva**, 20 MB). Mindkettő privát.

Megmértem: a 35 munka közül **egyetlen sem** hivatkozik a `foto` tárolóra.
A 11 fájl tehát árva.

**Nem töröltem.** Fényképek törlése visszafordíthatatlan, és nem tudom,
mi van rajtuk — februári kárfelvételek is lehetnek. Ferenc döntése.
