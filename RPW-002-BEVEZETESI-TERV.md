# RPW-002 — RLS lezárás: bevezetési terv

> Állapot: **a migráció kész és bizonyított, ÉLESBE MÉG NEM MENT.**
> Az élesítés Ferenc jóváhagyását, mentést és karbantartási ablakot igényel.

## 1. A mai állapot — mért tények

Az élő adatbázison (`pxypbbvqinbwesfikkdb`), **kizárólag olvasó lekérdezésekkel**,
2026-08-29-én:

| Amit megmértünk | Eredmény |
|---|---|
| `rpw_jobs` policy | `"rpw_jobs anon rw"` · `FOR ALL TO anon,authenticated` · `USING(true) WITH CHECK(true)` |
| `rpw_jobs` tábla-jogok | `anon` → **SELECT, INSERT, UPDATE, DELETE** |
| anon kulcs helye | a nyilvánosan kiszolgált `rpw-config.js`-ben |
| Érintett adat | 35 munka, ebből 33 élő |
| Többi `rpw_*` tábla | anon jogosultság **nincs** — a kitettség egyetlen táblán áll |
| Más alkalmazások táblái (`shops`, `employees`, `tools`, `settings`, `admins`…) | anon jogosultság **nincs**; ez a migráció **nem nyúl hozzájuk** |

**Következmény:** aki ismeri az anon kulcsot — ami bárki, aki megnyitja az oldal
forrását —, az ma **olvashatja, módosíthatja és véglegesen törölheti** mind a 33 élő
munkát, az alkalmazás megkerülésével.

## 2. Miért nem a meglévő 005 migráció megy élesbe

A `005_rls_lockdown.sql` a **migrációs vonal** alakjára készült. Az élő adatbázis
más vonalon épült:

| | migrációs vonal | élő adatbázis |
|---|---|---|
| munkamenet-tábla | `rpw_sessions` | **`app_session`** |
| `rpw_transition` | van | **nincs** |
| `rpw_requirements` | van | **nincs** |
| `rpw_can_complete` | van | **nincs** |
| `rpw_cleanup_list` / `_hard_delete` | van | **nincs** |
| `rpw_server_capabilities` | van | **nincs** |
| `rpw_schema_version` | van | **nincs** |

A 005 emiatt élesben az **előfeltétel-ellenőrzésénél megszakadna** — helyesen, mert
olyan függvényekre adna jogot, amelyek nem léteznek.

A 002/003 ráfuttatása **nem megoldás**: azok `rpw_sessions`-re épülő változatra
cserélnék a `rpw2_login` / `rpw2_session` függvényeket, ami **minden bejelentkezett
dolgozót kiléptetne**, és a belépés utána sem működne.

Ezért készült a **`008_rls_lockdown_live.sql`**, amely azt zárja le, ami élesben
ténylegesen nyitva van, és csak arra ad jogot, ami élesben ténylegesen létezik.

## 3. Kötelező sorrend — enélkül a műhely megáll

A mai kliens `AUTH_REQUIRED=false` mellett **közvetlen tábla-olvasással** dolgozik
(`sb.from('rpw_jobs')`). Ha a lezárás előbb fut le, a panel azonnal üres lesz.

```
1. lépés   rpw-config.js:  AUTH_REQUIRED = true
                           PATCH_RPC     = 'rpw_patch_v3'
           → kitesszük élesbe, és MEGVÁRJUK, amíg egy dolgozó belép,
             lát listát, megnyit egy munkát és ment egyet.
           Visszaállás, ha baj van: a két sor visszaírása (percek).

2. lépés   MENTÉS  (lásd 4. pont)

3. lépés   008_rls_lockdown_live.sql  alkalmazása

4. lépés   ellenőrzés (lásd 5. pont)
```

A 11 aktív dolgozó **mindegyikének van PIN-je** (0 PIN nélkül) — az 1. lépés
emiatt nem akad el a beléptetésen.

## 4. Mentés

A lezárás jogosultságokat és szabályokat változtat, **adatot nem**. A mentés
mégis kötelező, mert a 3. lépés előtti állapotot vissza kell tudni állítani.

- Supabase → Database → Backups: **kézi mentés indítása**, a visszaigazolás
  időbélyegének feljegyzése.
- A jogosultsági állapot kiírása a lezárás ELŐTT (a `_tests/integration/test-int-rls-live.js`
  2. szakaszának lekérdezéseivel), hogy legyen mihez hasonlítani.

## 5. Ellenőrzés a lezárás után (go / no-go)

| # | Amit ellenőrzünk | Elvárt |
|---|---|---|
| 1 | Belépés PIN-nel | sikeres |
| 2 | A lista megjelenik, a 33 munka látszik | igen |
| 3 | Egy munka megnyitása és mentése | sikeres |
| 4 | Recepció → fázisindítás | sikeres |
| 5 | Az ügyfél WhatsApp-linkje (feltöltő lap) | működik |
| 6 | Anon kulccsal közvetlen `rpw_jobs` lekérés | **elutasítva** |

Bármelyik 1–5 pont bukása → **NO-GO** → azonnal `008_rollback.sql`.
A 6. pont bukása → a lezárás nem érte el a célját, vizsgálat.

## 6. Rollback

```
_migrations/008_rollback.sql
```

Visszaadja az `rpw_jobs` tábla-jogokat és a megengedő szabályt; a műhely
másodpercek alatt visszaáll. **Figyelem:** ez újra megnyitja az anon
hozzáférést — csak akkor futtasd, ha a visszaállás sürgősebb, mint a hibakeresés.

Ha az 1. lépés (kliens) is vissza kell: a `rpw-config.js` két sorának visszaírása.

## 7. Bizonyíték

`_tests/integration/test-int-rls-live.js` — **valódi PostgreSQL**, az élő adatbázis
alakjára épített fixture-rel. 32 állítás:

- a fixture reprodukálja a mai kitettséget (anon olvas, ír, töröl)
- a 008 után az anon `SELECT / INSERT / UPDATE / DELETE` **mind elutasítva**
- a policy eltűnt, egyetlen tábla-jog sem maradt, az RLS **ki van kényszerítve**
- a tenant-biztos RPC-k továbbra is hívhatók (a műhely dolgozni tud)
- a nem tenant-biztos régi utak (`rpw_patch_v2`, `rpw_login`, `rpw__ctx`) **nem kapnak jogot**
- SHOP_A csak a sajátját listázza; SHOP_B munkájára **`not_found`**
- a rollback visszaállít; a 008 újrafuttatható; hiányzó előfeltételnél megszakad,
  és félbehagyott állapot nem marad

**7 mutáció** vizsgálva (policy marad · jogok maradnak · nincs force · a v2 is jogot
kap · nincs előfeltétel-ellenőrzés · nincs visszavonás · a rollback nem állít vissza)
— **mind a hét elbukott**, ahogy kell.

## 8. Megmaradt kockázat

- **A lezárás élesben még nem futott le.** Amíg nem fut, a 33 munka bárki számára
  elérhető marad az anon kulccsal.
- Az élő függvények törzsét nem másoltuk a tesztbe: a fixture a **jogosultsági
  viselkedést** bizonyítja, az üzleti logikát a `test-int-tenant.js` fedi.
- A staging továbbra sem igazolt (RPW-018).
