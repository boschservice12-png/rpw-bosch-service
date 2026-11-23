# AUDIT — a Symfony-mag localhoston, 250 szervizes célra (2026-11-23)

*Alap: munkaág `claude/charming-gauss-zkctym` (`b690c0c`). Irány (Ferenc, 2026-11-23): a mag **csak localhoston** épül és tesztelődik; a szerveres kitelepítés (`deploy/`, Caddy, fail2ban, mentés-ütemezők, `TELEPITES-SZERVER.md`) **nem élesedik, csak kompatibilis marad**.*
*Módszer: a mérések ténylegesen lefutottak (1. pont); a 3–5. pont kódolvasás fájl:sor hivatkozással — a kulcsállításokat külön visszaellenőriztem, és ahol az élő Supabase is érintett, élő lekérdezéssel mértem.*
*Kiegészíti: `AUDIT-2026-11-22.md`, `AUDIT-2026-11-23.md`.*

---

## 0. Összefoglaló

| # | Megállapítás | Súly | Élesben is? |
|---|---|---|---|
| 1 | **PIN-orákulum:** a saját PIN cseréjekor a „pin_taken" válasz elárulja, ha egy kolléga PIN-jét találtad el — a névsor nyilvános, így az is kiderül, kiét (pl. a vezetőét). Korlát nincs. | 🔴 | **IGEN** — az élő `rpw2_pin_set` ugyanígy ellenőriz (mérve) |
| 2 | **Az ügyfél-link felülírhatja az iratlistát** (`dosarActe`): a meglévő irat törölhető, hamis bejegyzés elfogadtatható; **lezárt ügyre is** működik; korlát nincs. | 🔴 | **IGEN** — az élő `rpw_client_upload`: `data || p_patch`, `inchis`-ellenőrzés nélkül (mérve) |
| 3 | **Ismert PIN-ű mintadolgozók + admin 4826 minden induláskor** (Docker / `rpw-local`), a 8000-es port a wifin nyitva; a kép `APP_ENV=prod`-dal fut, így szerveren újrahasznosítva is beültetné őket. | 🔴 | nem (csak a helyi rendszer) |
| 4 | **Belépési kizárás és PIN-találgatás hálózati méretben:** dolgozónkénti zár (10 próba / 15 perc) + IP-nkénti limit — egy IP ~30 dolgozót tarthat zárva; 4 jegyű PIN-nél sok fiók naponta feltörhető. | 🟠 | részben (élesben is dolgozónkénti zár) |
| 5 | **A szervizek közötti adatszivárgás nincs:** minden bérlői lekérdezés a munkamenet `shop_id`-jára szűr; a token 256 bites, csak a lenyomata tárolt; másik szerviz munkájára nincs út. | ✅ | — |
| 6 | **A teljes tesztsor localhoston zöld; PostgreSQL-en 1 valódi hordozhatósági hiba** (teszt-oldali) + 4 környezeti (pg_dump-verzió). | 🟡 | — |

**Javasolt sorrend:** 1 és 2 → élesben **és** a Symfonyban (a javítás kicsi, a kockázat valós) · 3 → most, localhoston · 4 → a 250 szervizes indulás előtt.

---

## 1. Localhost: futtatás és tesztek — mérve

### 1.1 Indítás
| Mód | Parancs | Adatbázis | Megjegyzés |
|---|---|---|---|
| Közvetlen (PHP 8.2+) | `symfony/bin/rpw-local` (`--reset`: tiszta lap) | SQLite `symfony/var/rpw-local.db` | `composer install` rootként: `COMPOSER_ALLOW_SUPERUSER=1` kell, különben a `symfony/runtime` plugin nem fut, és a `bin/console` elszáll („Symfony Runtime is missing") |
| Docker (Ferenc gépe) | `RPW-inditas.bat` / `docker compose up -d --build` | SQLite `/data/rpw.db` (kötet) | port 8000, a wifin is elérhető |
| Cél-szerver (most nem) | `deploy/install.sh` | PostgreSQL 16 | — |

### 1.2 Tesztek — ténylegesen lefuttatva 2026-11-23
| Tesztsor | Parancs | Eredmény |
|---|---|---|
| Symfony Unit + Functional (SQLite) | `cd symfony && vendor/bin/phpunit` | **100 teszt / 603 állítás — OK** |
| Symfony Unit + Functional (**PostgreSQL**, beágyazott) | `DATABASE_URL=postgresql://… vendor/bin/phpunit` | 100 teszt: **95 OK**, 4 hiba (`pg_dump` verzió ≠ szerver verzió — környezeti), **1 bukás** (`PhotoExtractTest:63` a JSON-szöveget betűre veti össze; PG `jsonb` szóközt tesz: `"elements": {}`) |
| E2E — egy munka 1→7, valódi böngészővel | `symfony/bin/rpw-local --reset` + `RPW_BASE=… symfony/tests/E2E/run.sh` | **SIKERES — a munka 1→7 lezárva** (valódi fotófeltöltés a kapun, szerepkörönként más dolgozó, elutasított lezárási kísérlet) |
| Felület (unit · PostgreSQL · jsdom · statikus) | `npm test` | zöld |

### 1.3 Hiányok a helyi futtatásban
| Hiány | Javaslat |
|---|---|
| Egy tesztsor van (`phpunit.dist.xml`), Unit/Functional nincs szétválasztva | két `<testsuite>`: `unit` (gyors, adatbázis nélkül) és `functional` |
| A PostgreSQL-futás nincs a mindennapi útban; a tesztkörnyezet (Docker) SQLite, a cél PostgreSQL | `docker-compose.yml`: `postgres:16` szolgáltatás + egy `composer test:pg` parancs; a `PhotoExtractTest:63` JSON-szerkezetet hasonlítson, ne szöveget |
| A mentés-tesztek a gép `pg_dump`-jától függenek | a mentés a szerverrel egyező verziójú `pg_dump`-ot használja (Docker-képben rögzítve); a teszt jelezze érthetően a verzióeltérést |
| Az E2E a `rpw-local` mintacsapatára épül (ismert PIN-ek) | a 3. pont javításával az E2E kapjon saját, csak tesztben élő seedet (`RPW_DEMO=1`) |

---

## 2. A 7 fázis és a domain — megszilárdítás

- **Egy forrás:** `src/Domain/Workflow/PhaseRules.php` + `TransitionEngine.php` (részletes összevetés: `AUDIT-2026-11-23.md` 3. pont). A `003`/`006` SQL nem élesedik.
- **Javítva (2026-11-23, `b690c0c`):** „egyéb" kategóriájú javítás (`TransitionEngine::REWORK_OTHER_TARGETS`) · a felülbírálás saját művelet (`rpw-dosar.html`, `rpw-data.js`).
- **`Compat/RpcController.php` maradjon vékony híd — ma üzleti szabály van benne, áthelyezendő az `Application`-rétegbe:**
  | Hely | Szabály | Új hely |
  |---|---|---|
  | `RpcController.php:202-206` | `rework_open` alapkategória a fázisból | `JobService::transition` (a natív `/api` ugyanígy viselkedjen) |
  | `RpcController.php:218-229` | `canComplete` blokkoló/felülbírálható logika | `JobService::canComplete` |
  | `RpcController.php:137` | `rpw_requirements` üres lista (csonk) | `JobService::requirements` (ma csak `/api/jobs/{id}/requirements`) |
  | `RpcController.php:211-213` | hibakód-átfordítás (`rework_invalid` → első `wf_*`) | maradhat (felület-specifikus formázás) |
- **Döntésre vár (Ferenc):** blokkolja-e a nyitott javítás az 1–3. fázist (a kliens nem, a Symfony igen).

---

## 3. Belépés, szerepkör, szervizhatár — 250 szervizre

### 3.1 Igazoltan rendben (kódolvasás)
- A bérlő minden kérésnél a munkamenetből jön: `AuthService.php:118-122` (a munkamenet és a dolgozó szervize egyezik); hitelesített végpont **nem** vesz `shop_id`-t a klienstől.
- Minden bérlői SQL szűr (`AuthService`, `TeamService`, `JobService`, `AuditLog::forJob` — listaszerűen ellenőrizve); a hibaválasz nem árulja el, hogy a munka másik szervizben létezik-e.
- Token: 256 bit (`AuthService.php:89`), csak sha256 tárolt (:91), 12 órás csúszó / 24 órás abszolút lejárat (:134-143), visszavonás PIN-cserénél, kilépésnél, kijelentkezésnél.
- Szerepkör-, post- és munkaszám-egyediség **szervizenként** (`(shop_id, code)`, `(shop_id, prefix)`).
- Tesztek: `ApiTest::testTenantIsolation`, `SecurityLayersTest::testPinChangeRevokesOtherSessionsButKeepsCurrent`.

### 3.2 Javítandó

| Súly | Megállapítás | Hely | Javítás | Teszt |
|---|---|---|---|---|
| 🔴 | **PIN-orákulum** (élesben is) | `AuthService.php:175-180`; élő `rpw2_pin_set` | a „pin_taken" ellenőrzés **törlése** — a belépés dolgozó + PIN, egyediség nem kell; a PIN-csere korlátozása | `Functional/PinOracleTest` |
| 🟠 | Bárki kizárhat dolgozókat (dolgozónkénti zár, IP-limit 300/15 perc) | `AuthService.php:68-85`; `config/packages/framework.yaml:13-16` | zár (dolgozó, IP) párra, fokozódó késleltetés; szervizenkénti hibakeret | `Functional/LoginAbuseTest` |
| 🟠 | 4 jegyű PIN-találgatás hálózati méretben | `Domain/Auth/PinPolicy.php:14-17` | szervizenkénti és globális hibakeret; 6 jegyű PIN a `team`/`delete` jogú szerepekhez; riasztás | `LoginAbuseTest` |
| 🟠 | A „utolsó vezető" zár szerepkör-szerkesztéssel megkerülhető | `TeamService.php:108-115` | a `saveRole` is számolja a megmaradó `team`-jogosultakat (mint a `saveEmployee` :68-79), `FOR UPDATE` | `Functional/TeamLockTest` |
| 🟠 | A `team` jog minden jogot adhat; a szerepkód nincs ellenőrizve | `TeamService.php:57, :94, :107` | szerepkód csak a saját szervizből; nem adható olyan jog, ami a hívónak nincs; indok az auditba | `TeamLockTest` |
| 🟠 | A sebességkorlát a `TRUSTED_PROXIES`-tól függ | `framework.yaml:6` | élesben kötelező; a `ProductionGuardSubscriber` ellenőrizze | `Unit/ProductionGuardTest` |
| 🟠 | Elszigetelés csak alkalmazáskódban (nincs FK, nincs PostgreSQL RLS) | `Infrastructure/Db/RpwSchema.php:29-56` | szerver-szakasz: RLS `SET LOCAL app.shop_id`-val, FK a `shops`-ra | `Functional/RlsTest` (PG) |
| 🟠 | Szerviz nem függeszthető fel; nincs naplózott platform-admin | `Domain/Auth/Actor.php:14`; `shops` tábla | `shops.active` az `actorFromToken`-ben; „Intră în service" minta (indok, max. 6 óra, napló) | `Functional/ShopSuspendTest` |
| 🟡 | A munka-azonosítót a kliens adja, globális | `JobService.php:28, :81` | létrehozáskor csak `RPW-<uuid>` | `ApiTest` |
| 🟡 | Hitelesítés nélkül auditsor írható bármely szervizhez | `AuthService.php:62` | ismeretlen szerviz/dolgozó: csak fájlnapló | `LoginAbuseTest` |
| 🟡 | Séma: `tenant_id` nullázható, hiányzó indexek, munkamenetek nem takarítódnak | `RpwSchema.php:36, 39, 47` | NOT NULL, `(shop_id, deleted_at, updated_at)` index, éjszakai takarítás | `Unit/SchemaTest` |
| ℹ | A névsor (`rpw2_roster`) hitelesítés nélkül adja a neveket és szerepeket — a szerviz UUID-jával | `AuthService.php:38-50` | szervizlista sosem lehet nyilvános; később eszköz-regisztráció | — |

---

## 4. Tárolás, ügyfél-feltöltés, dokumentum / AI / levél

| Súly | Megállapítás | Hely | Javítás |
|---|---|---|---|
| 🔴 | **Ügyfél-link felülírja a `dosarActe`-t**, lezárt ügyre is, korlát nélkül (élesben is) | `Application/ClientUploadService.php:73` (`array_merge`); élő `rpw_client_upload` (`data \|\| p_patch`) | lezárt ügy elutasítva; `dosarActe` csak résenként **hozzáfűzés**; csak `{path,name,ts}` az ügyfél-előtaggal, `source:'client'`; darab- és sebességkorlát |
| 🟠 | CNP, név, cím a személyiből a munkába és a mentésekbe kerül | `AiPrompts.php:34-41`; `rpw-recepcio-red.html:665` | **Ferenc döntése** (a TyreFleetben tilos) — javaslat: a `cnp` kihagyása |
| 🟠 (250) | AI: csak IP-limit, nincs jogosultság- és szervizkeret | `FunctionsController.php:47, 50`; `framework.yaml:19-23` | szerver-szakasz: korlát szervizre, napi keret, `reception`/`work` jog |
| 🟠 (250) | Levél: tetszőleges megjelenő név („Allianz") és Reply-To, közös feladó minden szerviznek | `Infrastructure/Mail/ResendMailer.php:54-62` | szerver-szakasz: név a `shops.name`-ből, jog, szervizkvóta, címzett-domain naplózva |
| 🟡 | Ha `RPW_AI_MODEL` nem az alapértelmezett, a gondolkodás bekapcsol kis kimeneti kerettel → csonkolt válasz | `Infrastructure/Ai/AnthropicVisionModel.php:229, 265` | modellenkénti beállítás; az alapértelmezett (`claude-sonnet-5`) rendben |
| — | Tárolóréteg biztonsága | — | lásd `AUDIT-2026-11-23.md` 1.2 (nincs kritikus/magas rés) |

**AI és levél, ami rendben van:** hiányzó kulcsnál tiszta 503; a kulcs a szerveren marad, nem naplózódik; strukturált kimenet + emberi megerősítés (a dokumentumba rejtett szöveg csak rossz mezőértéket okozhat, műveletet nem); a feladó *címe* rögzített; fejléc-injekció ellen CR/LF szűrve.

---

## 5. Mentés, visszaállítás, átlépés előtti tisztaság

| Súly | Megállapítás | Hely | Javítás | Mikor |
|---|---|---|---|---|
| 🟠 | A visszaállítás megbízik a nem hitelesített `MANIFEST.json`-ban (`encrypted:false` → nyers SQL elfogadva; fájlnév útvonalként) | `Infrastructure/Backup/RestoreService.php:43, 51-53, 183` | névfehérlista; kulcs mellett nyers mentés csak `--insecure`-rel | **most** |
| 🟠 | `docker compose down -v` a mentéseket **és a mentési kulcsot** is törli (ugyanabban a kötetben vannak) | `docker-compose.yml:2`; `docker/entrypoint.sh:6, 19-20` | a tipp átfogalmazása; a `RPW-mentes.bat` írja ki a kulcs ujjlenyomatát és emlékeztessen | **most** |
| 🟡 | Megszakított mentés nyers `.tmp`-t hagy, a `RPW-mentes.bat` kimásolja | `BackupService.php:55, 145-146` | indításkor és `prune`-kor a `.tmp` törlése | **most** |
| 🟠 | SQLite `--live` visszaállítás futó szerver alatt: az írások elveszhetnek | `RestoreService.php:122, 169` | `--live` csak leállított szerverrel | ha localhoston használjuk |
| 🟡 | A próba-visszaállítás csak 4 táblát számol; eltérő alapértelmezett könyvtárak | `RestoreService.php:25`; `BackupCommand.php:24`; `RestoreCommand.php:93` | `rpw_roles`, `rpw_sessions` + egységes alap | most |
| ℹ (250) | Nincs szervizenkénti visszaállítás (PG: `DROP SCHEMA public CASCADE` mind a 250-re) | `RestoreService.php:20-21, 178` | szerver-szakasz: szervizenkénti export/import | később |
| ℹ | `DbCheck`/`SecurityCheck` nem nézi: indexek, FK, PG-verzió, mintadolgozók, kulcs a mentések mellett | `DbCheckCommand.php:29, 59`; `SecurityCheckCommand.php:114-145` | szerver-szakasz | később |

**Ami rendben van:** XChaCha20-Poly1305 titkosítás, sha256-visszaellenőrzés, 14 megőrzött mentés; az alapértelmezett visszaállítás **próba** (külön adatbázisba, az élőhöz nem nyúl); `--live` csak a „VISSZAALLITAS" beírásával és előzetes biztonsági mentéssel; a `RPW-mentes.bat` nem írja ki a kulcsot.

**Localhoston egyszerűen tartjuk:** AI, levél, mentés-próba, `.bat` eszközök, `pin-reset.php` (csak a `-e NEWPIN` sor változzon), `DbInit`.
**Érintetlenül hagyjuk a szerver-szakaszra:** szervizenkénti AI/levél-kvóta és feladó, szervizenkénti visszaállítás, PG-index- és méretellenőrzés, S3-fotómentés, RLS, platform-admin.

---

## 6. Ellenőrzési lista — nem tört el semmi

```bash
# felület
npm ci && npm test
# Symfony (rootként: COMPOSER_ALLOW_SUPERUSER=1)
cd symfony && composer install && vendor/bin/phpunit
# Symfony PostgreSQL-en (cél-motor) — futó PG 16 mellett
DATABASE_URL="postgresql://<user>:<jelszó>@127.0.0.1:5432/rpw_test?serverVersion=16" vendor/bin/phpunit
# E2E: egy munka 1→7 valódi böngészővel
symfony/bin/rpw-local --reset            # külön ablakban
RPW_BASE=http://localhost:8000 symfony/tests/E2E/run.sh
```
**Élő (Netlify/Supabase):** a 018 lépései (`AUDIT-2026-11-23.md` 1.3) · `MANUAL-STAGING-CHECKLIST.md`.
