# DEPLOYMENT.md

Az élesítés **sorrendje számít**. A lépések visszafelé is végigjárhatók.

---

## ⚠ Mielőtt bármit csinálnál

**Ma 11 aktív dolgozóból 1 tud belépni** (Ferenc). Az `AUTH_REQUIRED: true` a többi 10 embert **kizárja**.

**Ez emberi döntés, nem technikai lépés.** Amíg nincs mindenkinek PIN-je, a staging konfigurációt ne kapcsold be.

PIN kiosztás: `Echipă` lap → `Personal` → az ember sora → PIN beállítása.

---

## 0. Előkészítés

```bash
npm ci            # reprodukálható telepítés
npm test          # elvárt: minden zöld, 0 el sem indult
cp rpw-config.js rpw-config.js.bak
```

Adatbázis-mentés a Supabase felületén *(Database → Backups)*, vagy:
```sql
create table rpw_jobs_backup_20260824 as select * from rpw_jobs;
```

## 1. Migrációk — SZIGORÚ SORREND

**A számozás a függőségeket követi.** Minden migráció csak olyan
függvényre hivatkozik, amit egy korábbi már létrehozott — ezt a
`test-rpc-consistency.js` és a `test-int-migrations.js` ellenőrzi.

| # | Fájl | Mit tesz | Visszavonás |
|---|---|---|---|
| 001 | `001_base_schema.sql` | Táblák, indexek, `jsonb_deep_merge` | `001_rollback.sql` ⚠ adatvesztés |
| 002 | `002_server_rpc.sql` | Munkamenet + adat-RPC-k, **atomi verziózár** | `002_rollback.sql` |
| 003 | `003_business_requirements.sql` | Szabálytábla + `rpw_transition` + capabilities | `003_rollback.sql` |
| 004 | `004_staff_posts_legacy.sql` | Személyzet, posztok, kivezetett utak | `004_rollback.sql` |
| 005 | `005_rls_lockdown.sql` | **RLS-lezárás** | `005_rollback.sql` |
| 006 | `006_workflow_enforcement.sql` | **Védett workflow-mezők**, patch-jogosultság, trash-jog, rework-szignatúra | `006_rollback.sql` |

⚠ **Az `001` éles rendszeren NEM futtatandó** — ott a séma már létezik.
Minden lépése `if not exists`, tehát ártalmatlan, de a rollbackje
**adatvesztéssel jár**. Éles rendszeren a `002`-vel kezdj.

**Minden migráció végén ellenőrző lekérdezések vannak** a várt eredménnyel.
Futtasd le őket, és hasonlítsd össze.

### A kliens és a szerver sorrendje

⚠ Az `005` CSAK akkor futtatható, ha a kliens már a `v3` úton van.

```
1. 002, 003, 004 lefuttatása                              (szerver előbb)
2. rpw-config.js → PATCH_RPC:'rpw_patch_v3', AUTH_REQUIRED:true
3. kipróbálás: nyiss meg egy munkát, ments, zárj fázist
4. rpw-config.js → SERVER_TRANSITIONS:true
5. újabb kipróbálás — fázisváltás, ütközés két böngészőből
6. 005_rls_lockdown.sql                                   (a lezárás)
7. 006_workflow_enforcement.sql                           (a workflow-védelem)

   ⚠ A 006 UTÁN a normál patch már NEM módosíthat workflow-mezőt.
   Ha a kliens régi (V3), a fázislezárás elszáll. Ezért a 006 CSAK
   a V4 kliens kitelepítése után futtatható.

8. kipróbálás: fázislezárás, dosszié-lezárás, rework, skip
9. MANUAL-STAGING-CHECKLIST.md végigjárása
10. rpw-config.js → a kilenc PRODUCTION-feltétel
```

### Tiszta adatbázison — ellenőrzött

```bash
node _tests/run-all.js --integration
```
Ez ténylegesen végigjárja: alapséma → migrációk → ellenőrzések →
rollback fordított sorrendben → migrációk újrafuttatása.

## 2. Környezeti változók (Netlify)

| Változó | Mire |
|---|---|
| `SUPABASE_URL` | az adatbázis címe |
| `SUPABASE_ANON_KEY` | kliens-kulcs |
| `ANTHROPIC_API_KEY` | OCR és osztályozás |
| `RESEND_API_KEY` | levélküldés |
| `ALLOWED_ORIGINS` | mely oldalak hívhatják a funkciókat |

**Nincs `REQUIRE_FN_AUTH`** — a hitelesítés nem kapcsolható ki.

## 3. Staging ellenőrzés

```bash
cp rpw-config.staging.js rpw-config.js
```

Ellenőrizd sorban:

- [ ] belépés PIN-nel működik
- [ ] munka megnyitása, mentés, fázisváltás
- [ ] **két böngészőből ugyanaz a munka** → a második mentés `version_conflict`-ot ad, nem ír felül
- [ ] fotó feltöltés és megjelenítés (signed URL)
- [ ] OCR egy talonra
- [ ] kosárba tétel, visszaállítás, végleges törlés
- [ ] kijelentkezés → a `localStorage` kiürül
- [ ] `PRODUCTION:true` + szándékosan rossz flag → az alkalmazás **nem indul**

## 4. Production — KILENC feltétel

```js
AUTH_REQUIRED: true,
PATCH_RPC: 'rpw_patch_v3',
SERVER_TRANSITIONS: true,
STORAGE_PRIVATE: true,
RLS_LOCKDOWN_VERIFIED: true,          // az 005 lefutott ÉS ellenőrizve
RPC_CONSISTENCY_VERIFIED: true,       // node _tests/run-all.js --unit zöld
BUSINESS_GATES_SERVER_SIDE: true,     // a szabálytábla él
INTEGRATION_TESTS_PASSED: true,       // --integration zöld
ALL_ACTIVE_EMPLOYEES_HAVE_PIN: true,  // 👤 EMBERI ELLENŐRZÉS
PRODUCTION: true
```

Bármelyik hiányzik → a production-őr **megállítja** az alkalmazást.

⚠ Az utolsó öt neve szándékosan „VERIFIED"/„PASSED". **Ne állítsd
`true`-ra, amíg tényleg nem ellenőrizted** — ezzel a saját védelmedet
kapcsolnád ki.

A kliens induláskor a **szervert is megkérdezi** (`rpw_server_capabilities`):
ha a séma-verzió vagy a támogatott RPC-k nem stimmelnek, megáll.

---

## Visszaállás

**Mindig a klienssel kezdd, utána a szervert:**

```bash
cp rpw-config.js.bak rpw-config.js        # 1. kliens vissza v2-re
```
```sql
\i _migrations/006_rollback.sql            -- 2. workflow-védelem vissza
\i _migrations/005_rollback.sql            -- 3. RLS vissza
\i _migrations/004_rollback.sql            -- 4. személyzet/posztok
\i _migrations/003_rollback.sql            -- 5. szabályok, átmenetek
\i _migrations/002_rollback.sql            -- 6. adat-RPC-k
-- ⚠ 001_rollback.sql: ADATVESZTÉS — éles rendszeren SOHA
```

⚠ Fordított sorrendben a mentés leáll a két lépés között.
