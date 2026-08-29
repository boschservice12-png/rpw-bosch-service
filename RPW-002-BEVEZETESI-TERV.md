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

## 2b. Az ügyfél-feltöltő: külön blokkoló, külön megoldás

A lezárás **elvágná az ügyfél WhatsApp-feltöltőjét**. Az a lap szándékosan
PIN nélküli, és ma két olyan úton dolgozik, amelyet a 008 megszüntet:

| | ma | 008 után |
|---|---|---|
| dosszié beolvasása | közvetlen `rpw_jobs` tábla-olvasás (a **teljes** sort) | visszavonva |
| feltöltés mentése | `rpw_patch_v2`, token nélkül | nem kap EXECUTE-ot |

Erre készült a **`009_client_upload_path.sql`**: két szűk függvény,
munkaazonosítóra épülve.

- `rpw_client_job_get` — **csak** amit a feltöltő lap kirajzol: dossziészám,
  rendszám, márka, iratok, feltöltések. Telefonszámot, ügyfélnevet, belső
  jegyzetet, fázisállapotot **nem ad ki**. Ez adatvédelmi szigorítás is:
  ma a lap a *teljes* munkasort megkapja.
- `rpw_client_upload` — **csak** három kulcsot ír: `clientUploads`,
  `dosarActe`, `clientGata`. Minden más mező `forbidden_field`.

**Amit ez nem old meg:** a hozzáférést továbbra is a munkaazonosító adja.
Aki kitalál egy létező azonosítót, egy dosszié *feltöltő-nézetét* látja.
A teljes megoldás a dossziénkénti feltöltő-token — külön feladat. A mai
állapothoz képest viszont ez nagy szigorítás: **ma az anon kulccsal
minden munka egyben letölthető és törölhető.**

## 3. Kötelező sorrend — enélkül a műhely megáll

A mai kliens `AUTH_REQUIRED=false` mellett **közvetlen tábla-olvasással** dolgozik
(`sb.from('rpw_jobs')`). Ha a lezárás előbb fut le, a panel azonnal üres lesz.

```
1. lépés   009_client_upload_path.sql  alkalmazása
           Semmit nem zár le, csak létrehozza a két szűk ügyfél-függvényt.
           A mai működés VÁLTOZATLAN marad.

2. lépés   rpw-config.js:  CLIENT_RPC = true
           → az ügyfél-feltöltő átáll a szűk útra.
           ELLENŐRZÉS: nyiss meg egy valódi WhatsApp-linket telefonon,
           tölts fel egy fotót, és nézd meg, hogy megérkezik-e.
           Visszaállás: egy sor (percek).

3. lépés   rpw-config.js:  AUTH_REQUIRED = true
           A PATCH_RPC-t NEM kell átállítani: bejelentkezve az adatréteg
           magától a rpw_patch_v3-ra megy. (Ha 'rpw_patch_v3'-ra állítanád,
           a hiányzó rpw_server_capabilities miatt a kliens MEGÁLLNA.)
           ELLENŐRZÉS: egy dolgozó lépjen be PIN-nel, lásson listát,
           nyisson meg egy munkát és mentsen egyet.
           Visszaállás: egy sor (percek).

4. lépés   MENTÉS  (lásd 4. pont)

5. lépés   008_rls_lockdown_live.sql  alkalmazása

6. lépés   ellenőrzés (lásd 5. pont)
```

Minden lépés után **meg kell állni és ellenőrizni**. Két lépést egyszerre
kitenni azért veszélyes, mert bukásnál nem tudni, melyik okozta.

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
| 5 | Az ügyfél WhatsApp-linkje: fotó feltöltése telefonról | **működik** |
| 5b | Az ügyfél-lapon NEM látszik telefonszám / belső jegyzet | igen |
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
