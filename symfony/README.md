# RPW — Symfony backend (v5 mag)

Az RPW szerveroldala Symfony 7.4 LTS-en (PHP 8.3). **A munkafolyamat logikája
változatlan**: ugyanaz a 7 fázis, ugyanazok a `wf_*` hibakódok, ugyanaz a
JSON-adatszerkezet (`rpw_jobs.data`). Ami változik: **a szabály egy helyen él,
és a szerveren dönt** — nem a böngészőben.

Az átállás terve: [`../RPW-004-SYMFONY-ATALLAS.md`](../RPW-004-SYMFONY-ATALLAS.md).

## Gyorsindítás (fejlesztés, SQLite)

```bash
composer install
php bin/console rpw:db:init
php bin/console rpw:shop:seed "Bosch Service" "Név Vezetéknév" 4826
php -S 127.0.0.1:8000 -t public
```

Éles példa (PostgreSQL) a `.env.local`-ban:
`DATABASE_URL="postgresql://rpw:JELSZO@127.0.0.1:5432/rpw?serverVersion=16&charset=utf8"`

## Tesztek

```bash
php vendor/bin/phpunit                                   # SQLite, friss séma
DATABASE_URL="postgresql://…/ures_db" php vendor/bin/phpunit   # PostgreSQL, friss séma
RPW_TEST_EXISTING_SCHEMA=1 DATABASE_URL="postgresql://…" php vendor/bin/phpunit
                       # a RÉGI rendszer migrált sémáján (_migrations/001–018)
```

Mért eredmény (2026-11-21): **40 teszt, 182 ellenőrzés — mindhárom módban zöld**
(SQLite 3.45 · PostgreSQL 18 friss séma · PostgreSQL 18 a régi migrációkkal).

## Felépítés

```
src/Domain/            TISZTA PHP, keretrendszer nélkül — itt él az üzleti logika
  Workflow/PhaseRules      a 7 fázis belépési és lezárási szabályai (rpw-workflow.js port)
  Workflow/TransitionEngine állapotgép: start · complete · skip · reopen ·
                           rework_open · rework_close · override
  Workflow/DaunaDocs       a kárdosszié kötelező iratlistája
  Patch/PatchGuard         védett workflow-mezők + mezőszintű jogosultság
  Metrics/WorkMetrics      munkaidő-mérés (T0/T1/GAP) + biztosítói határidők
  Auth/PinPolicy, Actor    PIN-szabály, jogosultsági kapcsolók
src/Application/       tranzakció, verziózár, audit, bérlő-szűrés
src/Infrastructure/Db/ DBAL-kapcsolat, séma, séma-ellenőrzés
src/Security/          Bearer-token hitelesítés, egységes JSON-hibaválasz
src/Controller/        REST API
src/Command/           rpw:db:init · rpw:db:check · rpw:shop:seed
```

## Garanciák (mind teszttel igazolva)

| Garancia | Hogyan |
|---|---|
| Bérlőelkülönítés a **szerveren** | minden lekérdezés `shop_id`-ra szűr; idegen munka = `not_found` |
| Nincs elveszett mentés | `UPDATE … WHERE version = :expected` + `FOR UPDATE`; ütközés → `409 version_conflict` |
| Workflow nem kerülhető meg | `phase`, `phases.*`, `inchis`, `rework` … csak átmeneten át írható |
| Mezőszintű jog | pl. recepció nem írhat `closing`-ot; ismeretlen mező `work` jogot kér |
| Minden elutasítás naplózva | `denied:<kód>` az `rpw_audit`-ban, a tranzakció visszagörgetése után is |
| PIN-zár | 10 rossz PIN / 15 perc → zár; + IP-alapú fék; gyenge és ütköző PIN tiltva |
| Párhuzamos üzem | a PIN-hash `$2a$` (pgcrypto-kompatibilis); a tábla- és oszlopnevek a régiek |

## API

Minden válasz `{"ok": true, …}` vagy `{"ok": false, "error": "<kód>", "message": "<RO>"}`.
Hitelesítés: `Authorization: Bearer <token>` (a `/api/login` adja).

| Módszer | Út | Mit csinál | Jog |
|---|---|---|---|
| GET | `/api/health` | élő-e | — |
| GET | `/api/roster/{shopId}` | névsor a belépéshez (PIN nélkül) | — |
| POST | `/api/login` | `{shop_id, employee_id, pin}` → token | — |
| POST | `/api/logout` | munkamenet visszavonása | belépve |
| GET | `/api/session` | ki vagyok, mit tehetek | belépve |
| GET | `/api/jobs[?trashed=1]` | munkák listája | belépve |
| POST | `/api/jobs/number` | atomi munkaszám `{prefix}` | `open` |
| GET | `/api/jobs/{id}` | egy munka | belépve |
| PATCH | `/api/jobs/{id}` | mentés `{patch, expected_version}`; új munkánál verzió nélkül | mezőnként |
| POST | `/api/jobs/{id}/transition` | `{phase, action, expected_version, reason?, …}` | lásd lent |
| GET | `/api/jobs/{id}/requirements` | fázisonként: belépés, hiányok, % | belépve |
| GET | `/api/jobs/{id}/metrics` | GAP + biztosítói határidők | belépve |
| POST | `/api/jobs/{id}/gap-reason` | GAP ok naplózása `{reason, note, expected_version}` | `work` |
| GET | `/api/jobs/{id}/audit` | a munka naplója | belépve |
| POST | `/api/jobs/{id}/trash` · `/restore` | kosár | `delete` |
| DELETE | `/api/jobs/{id}` | végleges törlés (csak kosárból) | `delete` |
| POST | `/api/team/pin` | PIN beállítása (saját; másé `team`) | belépve |
| GET | `/api/team/pin-status` · POST `/api/team/pin-unlock` | zárolások | `team` |

### Átmenetek és jogok

| action | jog | szabály |
|---|---|---|
| `start` | `work` | az előző fázis lezárt (vagy override-grant) |
| `complete` | `work` (7. fázis: `close`) | nincs nyitott rework; a `PhaseRules` hiánylistája üres (override joggal a felülbírálható tételek kimaradnak) |
| `skip` | `work`, ha **objektíven igazolt** (4/5 üres, 3 saját zsebnél); egyébként `override` + min. 5 karakter ok | |
| `reopen` | `override` + min. 5 karakter ok | a munka lezártsága megszűnik |
| `rework_open` | `work` | `category` (tinichigerie/vopsitorie/manager), `description` ≥ 10, `assigned_to` |
| `rework_close` | `work` | `rework_id`, `resolved_by` valós név, `note`; az utolsó után új kontrollkör |
| `override` | `override` + min. 10 karakter ok | megnyitja a célfázist, **nem** hamisít befejezettséget |
