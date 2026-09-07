# A MAI NAP VÁLTOZÁSAI — 2026-08-29

Alap (a nap eleji állapot): `f368fd6`
Csomag állapota: `76b16d8` (ág: claude/dolgozzunk-tovabb-6zve5p)
Élesben fut: `22aa49f` (main)

## Ami ÉLESBEN van

| mi | hol | igazolás |
|---|---|---|
| Szűk ügyfél-út (009) | adatbázis + `rpw-db.js` | alkalmazva, olvasva ellenőrizve |
| `CLIENT_RPC=true` | `rpw-config.js` | telefonos feltöltés megérkezett |
| Munkamenet két vonala (010) | adatbázis: `rpw_session` | a 2 élő munkamenetet megtalálja (a régi 0-t talált) |
| Beléptetés (`AUTH_REQUIRED=true`) | `rpw-config.js` | szerver-napló: 0 közvetlen tábla-olvasás, PIN-es belépés |
| Takarítás (011) | adatbázis: `rpw_archiv` séma | 87 sor átmozgatva, `public` tiszta |

## Ami MEG NINCS élesben

- `_migrations/008_rls_lockdown_live.sql` — a lezárás. Amíg nem megy ki, a 35 munka a böngészőben lévő kulccsal elérhető.

## Mai commitok

- `a77abdd` 14:58 — A panel a RedAssistance iranyitopult formajaban — es ami Ferenc jelzeseibol kijott (#6)
- `76881d0` 12:05 — Teszt-jegyzokonyv a beolvasztas elotti utolso futasrol
- `983ce93` 13:08 — RPW-001: a hitelesites nelkuli hozzaferes lezarasa — kliens-oldal (F-139..F-142)
- `5cf75b7` 13:10 — A beolvasztas elotti teszt-jegyzokonyv megorzese
- `29dcfa7` 13:27 — RPW-002: RLS-lezaras az elo adatbazis alakjara — megirva es bizonyitva (F-143, F-144)
- `7b2f663` 13:57 — Az ugyfel feltolto lapja kimarad az auth-zar alol (F-145)
- `e0b6b97` 14:12 — Szuk ugyfel-ut a lezaras elott (F-146) — 009 + kliens bekotes
- `00f3cf8` 14:17 — A 009 alkalmazva elesben, es az audit a haz mintajara igazitva
- `6b47a1f` 14:49 — 2. lepes: CLIENT_RPC=true — az ugyfel-feltolto a szuk utra all
- `fb78c9c` 14:49 — RPW-001 + RPW-002: hitelesitesi zar, szuk ugyfel-ut, RLS-lezaras elokeszitve
- `16b47a4` 15:13 — Ket elo Netlify-oldal van, es a masik KILENC NAPJA nem epult ujra (F-147)
- `5c561dd` 15:31 — Az elo cim mostantol a rpw-bosch-service, egyetlen igazsagkent (F-147)
- `5292888` 15:32 — Az elo cim a rpw-bosch-service; CORS mindket cimre; teszt-port utkozes megszuntetve
- `8078d1a` 15:54 — A 3. lepes (belepetes) BLOKKOLVA: 11 emberbol 6-ot kizarna
- `18c4031` 16:05 — A szerelok belephetnek, de nem modosithatnak (F-148)
- `dffa82d` 16:33 — 3. LEPES ELESBEN: AUTH_REQUIRED=true — a belepetes bekapcsolva
- `fd665de` 16:34 — 3. lepes elesben: dolgozoi belepetes (AUTH_REQUIRED=true)
- `77b9436` 16:41 — VISSZAALLITAS: AUTH_REQUIRED=false — a belepetes utan URES volt a panel
- `aaef0e3` 16:41 — VISSZAALLITAS: a belepetes kikapcsolva — ures volt a panel
- `9283ee4` 17:00 — 010: a munkamenet ket vonala — ettol lett URES a panel belepes utan
- `9312201` 17:03 — 010: az `active` nyersen megy tovabb — a NULL is ZARVA (fail-closed)
- `51f2944` 17:06 — 010 ELESBEN: a munkamenet ket vonala osszekotve, olvasva igazolva
- `2280e0e` 17:34 — A regi Netlify-oldal levalasztva; egy Supabase-projekt: a BOSCH
- `1d475ef` 18:09 — A regi Netlify-oldal atnevezve: a regi konyvjelzo cime megszunt
- `6be1591` 18:18 — RPW-002 4. lepes: adat-pillanatkep + a lezaras ELOTTI allapot kimerve
- `22aa49f` 19:04 — 2. LEPES ELESBEN: a dolgozoi belepetes BEKAPCSOLVA (AUTH_REQUIRED=true)
- `76b16d8` 19:36 — 011 TAKARITAS: a regi munkamasolatok kikerultek a kiszolgalt semabol

## Változott fájlok (a nap eleje óta)

```
 FUNKCIOK.md                                    |   27 +-
 REMAINING-RISKS.md                             |  112 +
 RPW-002-BEVEZETESI-TERV.md                     |  225 ++
 _migrations/008_ELOTTI_ALLAPOT.md              |  104 +
 _migrations/008_rls_lockdown_live.sql          |  180 ++
 _migrations/008_rollback.sql                   |   46 +
 _migrations/009_client_upload_path.sql         |  152 ++
 _migrations/009_rollback.sql                   |    9 +
 _migrations/010_rollback.sql                   |   50 +
 _migrations/010_session_lineage_fix.sql        |  129 +
 _migrations/011_rollback.sql                   |   12 +
 _migrations/011_takaritas_archiv.sql           |   73 +
 _registry/funkciok.json                        | 3213 ++++++++++++++----------
 _tests/frontend/test-fe-panou.js               |  345 ++-
 _tests/frontend/test-fe-upload.js              |  327 +++
 _tests/integration/_db.js                      |   35 +-
 _tests/integration/test-int-migrations.js      |    5 +-
 _tests/integration/test-int-rls-live.js        |  303 +++
 _tests/integration/test-int-session-lineage.js |  151 ++
 _tests/unit/test-classify.js                   |    8 +
 _tests/unit/test-delete.js                     |   98 +-
 _tests/unit/test-deploy.js                     |   36 +
 _tests/unit/test-foto-lejarat.js               |   93 +
 _tests/unit/test-list-unwrap.js                |   22 +-
 _tests/unit/test-load.js                       |   47 +-
 _tests/unit/test-p0-1-guard.js                 |    4 +-
 _tests/unit/test-p0-7-functions.js             |   38 +
 _tests/unit/test-progres.js                    |   30 +
 _tests/unit/test-rpw001-auth-gate.js           |  339 +++
 _tests/unit/test-security-a-o.js               |   35 +-
 functions/_shared.js                           |   26 +-
 index.html                                     |  221 +-
 netlify.toml                                   |    6 +
 rpw-auth.js                                    |   71 +-
 rpw-config.js                                  |   37 +-
 rpw-config.staging.js                          |    2 +-
 rpw-db.js                                      |   96 +-
 rpw-dosar.html                                 |   10 +-
 rpw-guard.js                                   |   57 +-
 rpw-photos.js                                  |   20 +-
 rpw-progres.js                                 |   17 +-
 rpw-roles.js                                   |   10 +-
 rpw-upload.html                                |   93 +-
 43 files changed, 5445 insertions(+), 1469 deletions(-)
```

## Új fájlok

- `RPW-002-BEVEZETESI-TERV.md`
- `_migrations/008_ELOTTI_ALLAPOT.md`
- `_migrations/008_rls_lockdown_live.sql`
- `_migrations/008_rollback.sql`
- `_migrations/009_client_upload_path.sql`
- `_migrations/009_rollback.sql`
- `_migrations/010_rollback.sql`
- `_migrations/010_session_lineage_fix.sql`
- `_migrations/011_rollback.sql`
- `_migrations/011_takaritas_archiv.sql`
- `_tests/frontend/test-fe-upload.js`
- `_tests/integration/test-int-rls-live.js`
- `_tests/integration/test-int-session-lineage.js`
- `_tests/unit/test-foto-lejarat.js`
- `_tests/unit/test-rpw001-auth-gate.js`

## Teszt-állapot

```
unit                 2864 állítás   0 hibás
adatbázis-integráció  350 állítás   0 hibás
frontend-integráció   480 állítás   0 hibás
statikus                2 állítás   0 hibás

staging: NEM IGAZOLT — nincs külön staging-adatbázis
```
