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

3. lépés   rpw-config.js:  AUTH_REQUIRED = true      ⏸ ÚJRA MEGKÍSÉRELHETŐ
           2026-08-29 délelőtt: a szerep-leképezés 11 emberből 6-ot
           kizárt volna (4 Szerelő, 1 Sofőr, 1 Egyéb). MEGOLDVA: a
           Szerelő 'auditor' lett (lát mindent, nem módosít, F-148);
           a Sofőr és az Egyéb Ferenc döntése szerint kívül marad.
           2026-08-29 délután: KI IS MENT, és a panel ÜRES lett. Ok: a
           munkamenet két vonala (010). VISSZAÁLLÍTVA ugyanaznap.
           A 010 azóta ÉLESBEN VAN és ellenőrizve — a 3. lépés innentől
           újra megkísérelhető, de Ferenc jóváhagyása kell hozzá.
           Az 1. és 2. lépés ettől függetlenül ÉLESBEN VAN és működik.
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
  időbélyegének feljegyzése. → **FERENC FELADATA, nyitott.** A Supabase
  API-n nincs mentés-művelet, ez a felület egy kattintása.
- A jogosultsági állapot kiírása a lezárás ELŐTT, hogy legyen mihez
  hasonlítani. → **KÉSZ (2026-08-29):** `_migrations/008_ELOTTI_ALLAPOT.md`.
- Adat-pillanatkép az adatbázison belül. → **KÉSZ (2026-08-29):** a
  `rpw_backup_20260829` séma. 35 munka, 442 audit-sor, 19 dolgozó,
  tartalom szerint (md5) azonos az eredetivel. A séma zárva: az anon és
  az authenticated szerep **semmit** nem érhet el belőle — méréssel
  igazolva, működő kontroll-sorral.

  Ez adatbázison BELÜLI mentés: megvéd a hibás írástól, **nem** véd az
  egész projekt elvesztése ellen. Azt a platform-szintű mentés adja.

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

## 8. Hol tart a bevezetés (2026-08-29)

| lépés | állapot |
|---|---|
| 1. `009` szűk ügyfél-út | **élesben, ellenőrizve** |
| 2. `CLIENT_RPC=true` | **élesben; Ferenc telefonon kipróbálta, 19 irat megérkezett** |
| 2b. `010` munkamenet-vonalak | **élesben, ellenőrizve** (2026-08-29) |
| 3. `AUTH_REQUIRED=true` | ⏸ **egyszer kiment, visszaállítva** — az akadály elhárítva, jóváhagyásra vár |
| 4. mentés | **részben kész** — adat-pillanatkép és jogosultsági állapot megvan; a platform-mentés Ferencre vár |
| 5. `008` lezárás | vár a 3-ra |

Ellenőrizve a 3. lépéshez, és rendben van: a `rpw2_roster` 11 dolgozót ad
a lap által várt alakban; a `rpw2_login` tokent, `can`-t és szerepet ad; a
`rpw_jobs_list` / `rpw_job_get` / `rpw_patch_v3` válasz-alakja egyezik a
klienssel; a config `SHOP_ID`, a dolgozók és a munkák szervize **mind
ugyanaz** (`bc39e3c1…`), tehát belépés után mind a 33 munka látszana.
A szerep-kérdés megoldva (F-148), a munkamenet-vonalak szétcsúszása
megoldva (010, élesben).

**A 010 élő ellenőrzése (2026-08-29, csak olvasás):**

| mérés | eredmény |
|---|---|
| rövid token | `no_token` — elutasítva |
| ismeretlen token | `invalid` — elutasítva |
| élő RPW2-munkamenet | 2 db |
| ebből amit a JAVÍTÁS megtalál | **2** |
| ebből amit a RÉGI változat megtalált | **0** ← ettől volt üres a panel |
| a hozzájuk tartozó munkakör | `Műszakvezető` → a kliens `manager`-t képez belőle |

A lánc zárt: `rpw_jobs_list` / `rpw_job_get` / `rpw_patch_v3` /
`rpw_job_trash` / `rpw_job_restore` / `rpw_job_purge` mind a `rpw__ctx`-en
át megy, a `rpw__ctx` pedig a `rpw_session`-t hívja.

## 9. Megmaradt kockázat

- **A lezárás élesben még nem futott le.** Amíg nem fut, a 33 munka bárki számára
  elérhető marad az anon kulccsal.
- Az élő függvények törzsét nem másoltuk a tesztbe: a fixture a **jogosultsági
  viselkedést** bizonyítja, az üzleti logikát a `test-int-tenant.js` fedi.
- A staging továbbra sem igazolt (RPW-018).

---

## 10. Felülvizsgálat — 2026-11-08 (élesítés előtti ellenőrzés)

Az élő adatbázison **kizárólag olvasó lekérdezésekkel** mérve.

### 10.1 Mért állapot
| mérés | eredmény |
|---|---|
| `rpw_jobs anon rw` szabály | **még él** — a rés nyitva |
| anon tábla-jog az `rpw_jobs`-on | SELECT, INSERT, UPDATE, DELETE — **mind igaz** |
| élő munkák | 7 (a 014 óta új adat) |
| aktív dolgozó PIN nélkül | 0 |
| `rpw_patch`, `rpw_patch_v2` anon-hívhatóság | nincs (012 óta) |
| 1–3. lépés (009, `CLIENT_RPC`, `AUTH_REQUIRED`) | élesben (2026-08-29 óta) |

### 10.2 Talált hibák — a 008 kitétele ELŐTT javítva
| # | hiba | következmény a lezárás után | javítás |
|---|---|---|---|
| 1 | A 008 a `rpw2_pin_status(uuid)` aláírást kereste; élesben `(p_token text)` | a `to_regprocedure` NULL → a függvény **csendben** jog nélkül marad → a PIN-zárolás állapota (F-011) jogosultsági hibával hal el | aláírás `(text)`; a kihagyás mostantól `WARNING`, nem néma |
| 2 | A kliens (`njNextNumber`) a token nélküli `rpw_next_job_number`-t hívta, amelyet a 008 szándékosan lezár | minden új munka a helyi „maximum + 1” tartalékból kap számot → két egyidejű felvétel **ugyanazt a számot** kaphatja | bejelentkezve a tokenes `rpw_job_number`; azonos számláló és formátum, a számozás folytonos; a hiba naplózva |

**Miért nem fogta meg a meglévő teszt:** a `test-rpc-consistency` csak neveket vet össze
(aláírást nem), és a `rpw_next_job_number` a „kivezetett” listán szerepelt, miközben a
kliens aktívan hívta.

**Bizonyíték:** `test-int-rls-live.js` — 68 állítás; a régi `(uuid)` aláírással
**elbukik** (`rpw2_pin_status hívható got="TILTVA"`), a javítottal zöld.
`test-load.js` — a tokenes számkiosztás, a szövegként érkező jsonb és a nem néma tartalék.
Teljes készlet: 4098 állítás, 0 hibás.

### 10.3 Új eszköz: `_migrations/ELLENORZES_008_elotti.sql`
Csak olvas. A 008 előtt közvetlenül futtatandó; **GO csak akkor, ha minden sor `OK`.**
2026-11-08-án élesen futtatva: **27/27 OK.**

### 10.4 Frissített élesítési sorrend
```
1. KLIENS KITELEPÍTÉSE (Netlify) — a javított index.html (rpw_job_number)
   ELLENŐRZÉS: új munka felvétele → kap számot, és a böngésző konzolján
   NINCS „[RPW] munkaszam” figyelmeztetés.
2. MENTÉS — Supabase → Database → Backups → kézi mentés      ← FERENC
   (az időbélyeget ide kell felírni)
3. ELLENORZES_008_elotti.sql — minden sor OK?   ha nem: STOP
4. 008_rls_lockdown_live.sql — egy tranzakció; hiba esetén semmi nem változik
5. Az 5. pont go / no-go táblája (belépés, lista, mentés, recepció,
   ügyfél-feltöltés telefonról, anon rpw_jobs → elutasítva)
   + ÚJ: 7. sor — PIN-állapot a Echipă lapon betölt
   + ÚJ: 8. sor — új munka szerverről kap számot
   bármelyik 1–5, 7–8 bukik → azonnal 008_rollback.sql
```

### 10.5 Nyitott
- **Staging nincs.** A Supabase-fiókban nincs külön RPW staging-projekt. A 008 viselkedését
  valódi PostgreSQL bizonyítja (fixture), az élő eltérést a 10.3 ellenőrzés méri.
- **`rpw_backup_20260829` séma:** a 014 (2026-09-03) a munkákat végleg törölte, de ez a
  zárt mentés-séma a 08-29-i 35 munkát (ügyféladatokkal) és a PIN-hasheket még őrzi.
  A törlési döntéssel és a GDPR adattakarékossági elvével ütközhet — **Ferenc döntése**.

## 11. ÉLESÍTVE — 2026-11-08 vasárnap este (a műhely zárva)

| lépés | eredmény |
|---|---|
| kliens (`f0313be`) Netlifyon | éles, deploy `6af0e23c…`, 20:59 |
| mentés | Pro csomag: napi automatikus mentés (7 nap); a 008 adatot nem érint |
| `ELLENORZES_008_elotti.sql` közvetlenül előtte | **27/27 OK** |
| `008` alkalmazva (`rpw_008_rls_lockdown_live`) | sikeres |

**Eltérés a fájltól:** élesben a feltételes lista hiánya `raise exception`-nel állt volna
meg (`WARNING` helyett) — szigorúbb, fail-closed. Hatásában azonos: mind a 12 függvény létezett.
A repó fájlja `WARNING`-on marad, mert a fixture-teszt nem hozza létre a teljes feltételes készletet.

**Mérés a lezárás után (csak olvasás):**
| # | mérés | elvárt | kapott |
|---|---|---|---|
| 1 | policy az `rpw_jobs`-on | 0 | **0** |
| 2 | anon/authenticated tábla-jog `rpw_*` táblán | 0 | **0** |
| 3 | `rpw_*` tábla RLS nélkül vagy force nélkül | 0 | **0** |
| 4 | anon által hívható `rpw`-függvény | a 008 listája | **23**, pontosan a lista |
| 5 | tiltott régi utak közül hívható | egy sem | **egy sem** |
| 6 | munkák száma | 7 | **7** |
| 7 | anon `select … from rpw_jobs` | elutasítva | **`42501 permission denied`** |
| 8 | `rpw_jobs_list` / `rpw_job_number` / `rpw2_pin_status` érvénytelen tokennel | `unauthorized`, nem jogosultsági hiba | **`unauthorized`** |
| 9 | `rpw2_roster` (belépő képernyő) | a csapat | **11 fő** |

**Hátravan:** a felhasználói go/no-go (5. pont 1–5, 7–8 sor) — Ferenc, PIN-nel, élő felületen.
Bukás esetén: `008_rollback.sql`.
