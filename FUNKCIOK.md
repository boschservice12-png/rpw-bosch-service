# RPW funkció-nyilvántartás (v2)

> Ezt a fájlt **gép írja**: `npm run funkciok`. Forrás: `_registry/funkciok.json`.
> A **státuszt is gép számolja** (`derive.js`) a teszteredményből + kódhorgonyokból +
> az `evidence.json` emberi bizonyítékaiból. Kézzel átírni tilos.

Gépi futás: `2026-08-25T18:06:19.480Z`

## Vezetői összefoglaló

| Mutató | Érték |
|---|---:|
| Összes regisztrált tétel | 84 |
| Üzleti képességek | 8 |
| Biztonsági kontrollok | 17 |
| P0 funkciók (aktív) | 28 |
| P0 teljesen igazolt (production) | 0 |
| P0 blokkolt/alvó | 5 |
| Deprecated | 4 |
| Teszt nélkül | 5 |
| Stagingen igazolt | 0 |
| Productionben igazolt | 0 |

**Súlyozott készültség** (P0=10p, P1=5p, P2=2p, P3=1p): összesített **35%** · P0 **39%** · P1 **29%** · üzleti lánc **40%** · biztonság **36%** · tesztelési **94%** · production **0%**

> Egy P0-hiány nem rejthető el sok kész UI-funkcióval: a súlyozás miatt a P0-oszlop
> önállóan mutatja a kritikus mag állapotát.

## Értéklánc szerinti nézet

### 1. Belépés

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-001** | Belepes (login) | SC | P0 | Office | ⚪ DEPRECATED | F-002 | `unit/test-deprecation.js` | — |
| **F-002** | Munkamenet ellenorzese | SC | P0 | Office | 🔵 INTEGRATION_VERIFIED | F-104 | `integration/test-int-tenant.js` | — |
| **F-003** | Kilepes (logout) | SC | P1 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-rpc-consistency.js` | — |
| **F-006** | Nevsor (roster) lekerese | DO | P1 | Office | 🔵 INTEGRATION_VERIFIED | F-016 | `integration/test-int-tenant.js` | — |
| **F-010** | PIN beallitasa | SC | P0 | Office | 🔵 INTEGRATION_VERIFIED | F-016 | `integration/test-int-tenant.js` | — |
| **F-011** | PIN allapot (hanyadik hibas probalkozas, zarolva?) | SC | P1 | Office | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-tenant.js` | — |
| **F-012** | PIN zarolas feloldasa adminkent | AO | P1 | Office | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-tenant.js` | — |
| **F-013** | Gyenge PIN elutasitasa (1234, 0000, 111111) | SC | P1 | Office | 🟠 DORMANT |  | `integration/test-int-tenant.js` | — |
| **F-016** | Belepes uj uton (rpw2_login, tokenes munkamenet) | SC | P0 | Office | 🔵 INTEGRATION_VERIFIED | F-002 | `integration/test-int-tenant.js` | — |

### 2. Munkalap létrehozása

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-101** | Uj munkalap ablak megnyitasa | UC | P1 | Reception | 🟡 UNIT_VERIFIED | F-120 | `unit/test-entry.js` | — |
| **F-102** | Rendszam bevitel es normalizalas | UC | P1 | Reception | 🟡 UNIT_VERIFIED |  | `unit/test-case.js` | — |
| **F-103** | Kovetkezo munkalapszam kerese a szervertol | DO | P1 | Reception | ⚪ DEPRECATED | F-120 | `unit/test-deprecation.js` | — |
| **F-117** | Meglevo munkalap szerkesztese | UC | P2 | Reception | 🟡 UNIT_VERIFIED |  | `unit/test-edit.js` | — |
| **F-118** | Idopont (programare) ablak | UC | P2 | Reception | 🟡 UNIT_VERIFIED |  | `unit/test-prog.js` | — |
| **F-119** | Idopont-athelyezes (reprogramare) | BC | P1 | Reception | 🟡 UNIT_VERIFIED |  | `unit/test-acceptance.js` | — |
| **F-120** | Munkalap szerveroldali letrehozasa (szam, kezdo allapot, tenant, actor, audit a szerveren) | BC | P0 | Reception | 🟠 DORMANT | F-107 F-111 | `integration/test-int-jobcreate.js` | — |

### 3. Adatmentés

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-104** | Munkalapok listaja | DO | P0 | Production | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-workflow.js` | — |
| **F-105** | Egy munkalap betoltese | DO | P0 | Production | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-workflow.js` | — |
| **F-106** | Mentes regi uton (v2/v1, vedelem nelkul) — KIVEZETES ALATT | DO | P0 | Production | ⚪ DEPRECATED |  | `unit/test-save-consolidation.js` | — |
| **F-107** | Mentes vedett uton (v3, munkafolyamat-mezok tiltva) | DO | P0 | Production | 🟠 DORMANT | F-110 | `unit/test-save-consolidation.js` | — |
| **F-108** | Verzioutkozes kezelese (ketten irtak egyszerre) | DO | P0 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-conflict.js` | — |
| **F-109** | Vedett mezok kiszurese mentes elott | SC | P0 | Production | 🔵 INTEGRATION_VERIFIED | F-111 | `integration/test-int-workflow.js` | — |
| **F-110** | Szerveroldali elutasitas felismerese (nem nemul el a hiba) | SC | P0 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-save-consolidation.js` | — |
| **F-301** | Offline sor - a mentes akkor is megmarad, ha nincs net | I | P1 | Production | 🟡 UNIT_VERIFIED | F-303 | `unit/test-queue.js` | — |
| **F-302** | Kozos sor-peldany (mindenki ugyanabba a sorba ir) | I | P1 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-queue.js` | — |
| **F-303** | Sor ujraindul oldal-ujratoltes utan | I | P1 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-queue.js` | — |
| **F-304** | Szinkron-allapot kijelzese (mentve / var / hiba) | UC | P0 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-sync-state.js` | — |
| **F-305** | Helyi gyorsitotar (offline is latszik a munkalap) | I | P1 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-delete.js` | — |
| **F-306** | Regi kulcsok takaritasa induláskor | I | P2 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-delete.js` | — |
| **F-307** | Belepesi kulcsok VEDELME a takaritastol | SC | P1 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-delete.js` | — |
| **F-308** | Rendszam maszkolasa a gyorsitotarban | SC | P1 | Production | 🟡 IMPLEMENTED |  | **NINCS** | — |
| **F-309** | Figyelmeztetes kilepeskor, ha van mentetlen adat | UC | P1 | Production | 🟡 IMPLEMENTED |  | **NINCS** | — |
| **F-906** | JSON melysegi osszefesules a mentesnel | I | P1 | Platform | 🟡 UNIT_VERIFIED |  | `unit/test-queue.js` | — |

### 4. Dokumentumok

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-201** | Avizare dauna ablak megnyitasa | UC | P1 | Reception | 🟡 UNIT_VERIFIED | F-202 F-203 | `unit/test-dosare.js` | — |
| **F-202** | Deschide dosar dauna - a dossziet MI nyitjuk (urlap nelkul, egybol a dosszie lapra) | BC | P0 | Reception | 🟡 UNIT_VERIFIED | F-204 | `unit/test-entry.js` | — |
| **F-203** | Preluare dosar dauna - meglevo dosszie atvetele fajlbol | BC | P1 | Reception | 🟡 UNIT_VERIFIED | F-204 | `unit/test-dosare.js` | — |
| **F-215** | Duplikatum-figyelmeztetes a dosszie lapon (ugyanaz a rendszam + biztosito + karszam) | SC | P1 | Reception | 🟡 UNIT_VERIFIED |  | `unit/test-dup-dosar.js` | — |
| **F-204** | Dosszie oldal iratrekeszekkel | BC | P0 | Reception | 🟡 UNIT_VERIFIED | F-112 | `unit/test-dosarflux.js` | — |
| **F-205** | Irat feltoltese egy rekeszbe | BC | P0 | Reception | 🟡 UNIT_VERIFIED | F-112 | `unit/test-classify.js` | — |
| **F-206** | Irat torlese a rekeszbol | DO | P1 | Reception | 🟡 UNIT_VERIFIED |  | `unit/test-dialogs.js` | — |
| **F-207** | Iratszamlalo (hany irat van meg) | UC | P1 | Reception | 🟡 UNIT_VERIFIED |  | `unit/test-dosare.js` | — |
| **F-208** | Tomeges feltoltes - sok kep egyszerre | BC | P1 | Reception | 🟡 UNIT_VERIFIED | F-209 | `unit/test-classify.js` | — |
| **F-209** | AI iratbesorolas - javaslat a rekeszre | I | P1 | Reception | 🟡 UNIT_VERIFIED | F-205 | `unit/test-classify.js` | — |
| **F-210** | AI iratbesorolas - szerver oldal (Claude) | I | P1 | Reception | 🟠 DORMANT | F-209 | `unit/test-p0-7-functions.js` | — |
| **F-211** | OCR - szoveg kiolvasasa kepbol | I | P1 | Reception | 🟠 DORMANT |  | `unit/test-p0-7-functions.js` | — |
| **F-213** | Fotok kezelese (tomorites, tarolas) | I | P1 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-p0-6-storage.js` | — |
| **F-214** | Regi base64 kepek atkoltoztetese | I | P2 | Production | 🟡 UNIT_VERIFIED |  | `unit/test-p0-6-storage.js` | — |

### 5. Javítási fázisok

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-111** | Fazisvaltas (recepcio -> evaluare -> ...) | WT | P0 | Production | 🟠 DORMANT | F-112 F-113 | `frontend/test-fe-click.js` | — |
| **F-112** | Fazis-kovetelmenyek (mi hianyzik meg a tovabblepeshez) | WT | P0 | Production | 🟠 DORMANT | F-111 | `unit/test-transition-chain.js` | — |
| **F-401** | Recepcio fazis oldal | WT | P0 | Reception | 🔵 UI_VERIFIED | F-402 | `frontend/test-fe-click.js` | — |
| **F-402** | Evaluare fazis oldal | WT | P0 | Production | 🔵 UI_VERIFIED | F-403 F-404 | `frontend/test-fe-click.js` | — |
| **F-403** | Tinichigerie fazis oldal | WT | P0 | Production | 🔵 UI_VERIFIED | F-404 | `frontend/test-fe-click.js` | — |
| **F-404** | Vopsitorie fazis oldal | WT | P0 | Production | 🔵 UI_VERIFIED | F-405 | `frontend/test-fe-click.js` | — |
| **F-405** | Reconstatare fazis oldal | WT | P0 | Production | 🔵 UI_VERIFIED | F-406 | `frontend/test-fe-click.js` | — |
| **F-408** | Audatex arajanlat importalasa | I | P1 | Production | 🟡 IMPLEMENTED |  | **NINCS** | — |
| **F-504** | Munkaallomasok (posturi) lekerese | DO | P2 | Production | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-workflow.js` | — |
| **F-505** | Munkaallomas mentese | AO | P2 | Production | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-workflow.js` | — |
| **F-506** | Munkalap hozzarendelese munkaallomashoz | DO | P2 | Production | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-workflow.js` | — |

### 6. Minőségkontroll

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-406** | Control fazis oldal | WT | P0 | Quality | 🔵 UI_VERIFIED | F-407 | `frontend/test-fe-click.js` | — |

### 7. Lezárás

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-113** | Lezarhato-e a munkalap | WT | P0 | Production | 🟠 DORMANT | F-409 | `unit/test-transition-chain.js` | — |
| **F-407** | Inchidere (lezaras) fazis oldal | WT | P0 | Office | 🔵 UI_VERIFIED | F-409 | `frontend/test-fe-click.js` | — |
| **F-409** | Dosszie exportalasa lezaraskor | BC | P1 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-oneway.js` | — |

### 8. Kommunikáció

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-212** | Feltoltesi link kuldese az ugyfelnek | I | P1 | Reception | 🟡 IMPLEMENTED | F-205 | **NINCS** | — |
| **F-410** | WhatsApp ertesites kuldese | I | P1 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-wa.js` | — |
| **F-411** | E-mail kuldes (biztosito, ugyfel) | I | P1 | Office | 🟠 DORMANT |  | `unit/test-p0-7-functions.js` | — |

### 9. Admin

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-004** | Csapat lekerese (regi ut) | DO | P2 | Office | ⚪ DEPRECATED |  | `unit/test-deprecation.js` | — |
| **F-005** | Csapat lekerese (uj ut) | DO | P1 | Office | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-tenant.js` | — |
| **F-007** | Dolgozo mentese | AO | P1 | Office | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-tenant.js` | — |
| **F-008** | Szerepkor mentese | AO | P1 | Office | 🔵 INTEGRATION_VERIFIED |  | `integration/test-int-tenant.js` | — |
| **F-009** | Jogosultsag-kerdes (mit szabad?) | SC | P1 | Office | 🟠 DORMANT |  | `integration/test-int-tenant.js` | — |
| **F-014** | Admin mod kapcsolo a fooldalon | UC | P2 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-p0-5-admin.js` | — |
| **F-015** | Dolgozo/szerepkor/PIN admin ablak | UC | P2 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-pin-dialog.js` | — |
| **F-114** | Munkalap kukaba dobasa | DO | P1 | Office | 🟡 UNIT_VERIFIED | F-115 | `unit/test-delete.js` | — |
| **F-115** | Visszaallitas a kukabol | DO | P1 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-delete.js` | — |
| **F-116** | Vegleges torles | DO | P1 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-delete.js` | — |
| **F-501** | Takaritas: mi torolheto | AO | P1 | Office | 🟡 UNIT_VERIFIED | F-502 | `unit/test-delete.js` | — |
| **F-502** | Takaritas: vegleges torles | DO | P1 | Office | 🟡 UNIT_VERIFIED |  | `unit/test-delete.js` | — |
| **F-503** | Takaritas szaraz futasa (csak megmutatja, nem torol) | AO | P1 | Office | 🟡 IMPLEMENTED | F-502 | **NINCS** | — |

### 10. Infrastruktúra

| szám | mit csinál | kat. | krit. | felelős | státusz | következő | teszt | blokkoló |
|---|---|---|---|---|---|---|---|---|
| **F-901** | Szerver-kepesseg ellenorzes (egyezik-e a kliens es a szerver) | SC | P0 | Platform | 🟡 UNIT_VERIFIED | F-902 | `unit/test-sync-state.js` | — |
| **F-902** | Vesz-leallitas, ha a szerver nem felel meg | SC | P0 | Platform | 🟡 UNIT_VERIFIED |  | `unit/test-sync-state.js` | — |
| **F-903** | Szigoru mod feltetele (mikor allitunk le tenyleg) | SC | P0 | Platform | 🟡 UNIT_VERIFIED |  | `unit/test-p0-1-guard.js` | — |
| **F-904** | Kliens konfiguracio | I | P0 | Platform | 🟡 UNIT_VERIFIED |  | `unit/test-p0-1-guard.js` | — |
| **F-905** | Belso fajlok kizarasa a nyilvanos deploybol | SC | P1 | Platform | 🟡 UNIT_VERIFIED |  | `unit/test-deploy.js` | — |
| **F-907** | Kozos inditasi modul (config->auth->kliens->adat->capabilities->oldal, fail-closed) | I | P1 | Platform | 🟠 BLOCKED |  | `unit/test-bootstrap.js` | az oldalak atallitasa a kozos modulra meg nem tortent meg |

## Színkód

- 🟢 production verified — gépi szintek + emberi staging + production bizonyíték
- 🔵 staging/integration/UI verified — gépileg igazolt
- 🟡 implemented / unit verified — megírva, részben igazolva
- 🟠 blocked / dormant — megírva, de nincs bekötve vagy blokkolt
- ⚪ deprecated — kivezetés alatt/után
- 🔴 planned / hiány — P0-nál ez teszthibát vagy hiányt jelez

A „csak frontend" önmagában nem negatív: egy UI-komponens természeténél fogva frontend-only.

## Kategória-rövidítések

BC=BUSINESS_CAPABILITY · SC=SECURITY_CONTROL · WT=WORKFLOW_TRANSITION · UC=UI_COMPONENT · DO=DATA_OPERATION · I=INTEGRATION · I=INFRASTRUCTURE · AO=ADMIN_OPERATION
