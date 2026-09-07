# A 008 lezárás ELŐTTI állapot — mérés, 2026-08-29

Ez a fájl a `RPW-002-BEVEZETESI-TERV.md` **4. lépésének** második fele:
a jogosultsági állapot kiírása a lezárás előtt, hogy a lezárás után
legyen **mihez hasonlítani**. Minden sor mérés, nem állítás.

Projekt: `pxypbbvqinbwesfikkdb` (a BOSCH Supabase-projekt).
A `_migrations/` nincs kiszolgálva (`netlify.toml` → 404, `force`).

---

## 1. Adat-pillanatkép

Séma: **`rpw_backup_20260829`** — külön sémában, mert a `public`-ot a
PostgREST kiszolgálja: egy ottani másolat kikapcsolt RLS-sel maga is
lyuk lenne.

| tábla | sor (eredeti) | sor (mentés) | tartalom azonos |
|---|---|---|---|
| `rpw_jobs` | 35 | 35 | ✔ (md5, rendezett) |
| `rpw_audit` | 442 | 442 | ✔ (md5, rendezett) |
| `rpw_employees` | 19 | 19 | ✔ (md5, rendezett) |
| `rpw_roles` | 9 | 9 | sorszám |
| `rpw_job_counters` | 1 | 1 | sorszám |
| `rpw_posts` | 4 | 4 | sorszám |

**Szándékosan NEM mentve:** `app_session` (élő munkamenet-token-hashek —
egy régi állapot visszatöltése munkameneteket keltene életre),
`rpw_pin_attempt`, `rpw_pin_log` (átmeneti zárolás-számlálók).

A `rpw_employees` másolata tartalmazza a **PIN-hasheket**. Ezért a séma
zárva van, és ezt méréssel igazoltam (lásd lent).

## 2. A mentés elérhetetlensége — mérés

A Postgres saját jogosultság-döntése (`has_table_privilege`), ami
figyelembe veszi a közvetlen grantet, a `PUBLIC`-ot és a szerep-öröklést.
**A kontroll-sor bizonyítja, hogy a mérőeszköz működik:** ha az is
`false` lenne, a többi `false` semmit nem érne.

| mit | anon | authenticated |
|---|---|---|
| **KONTROLL:** `public.rpw_jobs` olvasás | **true** ← a ma ismert lyuk | true |
| séma-használat: `rpw_backup_20260829` | false | false |
| mentés: `rpw_jobs` olvasás | false | false |
| mentés: `rpw_audit` olvasás | false | false |
| mentés: `rpw_employees` olvasás (PIN-hash) | false | false |
| mentés: `rpw_jobs` írás | false | false |

## 3. Táblák — a lezárás ELŐTT

| tábla | RLS | kényszerítve | szabály | anon: olvas / beszúr / módosít / töröl |
|---|---|---|---|---|
| `rpw_jobs` | be | **nem** | 1 | **igen / igen / igen / igen** ← a lyuk |
| `rpw_audit` | be | nem | 0 | nem / nem / nem / nem |
| `rpw_pin_attempt` | be | **igen** | 0 | nem / nem / nem / nem |
| `rpw_employees` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_roles` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_posts` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_job_counters` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_pin_log` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_jobs_backup_20260822` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_jobs_backup_pre_shopid` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_jobs_backup_pre_l1h` | **ki** | nem | 0 | nem / nem / nem / nem |
| `rpw_jobs_backup_pre_p03` | **ki** | nem | 0 | nem / nem / nem / nem |

**Amit ez mutat:** egyetlen tábla van nyitva az anon kulcsnak, a
`rpw_jobs` — teljes CRUD-dal, mind a 35 munkára. A kikapcsolt RLS a
többi táblán ma **nem** jelent elérhetőséget, mert nincs hozzájuk
grant; de ez egyetlen elgépelt `grant`-tól függ. A 008 mindkettőt
rendezi: elveszi a grantet **és** bekapcsolja/kényszeríti az RLS-t.

**Négy régi mentés-tábla ült a `public` sémában** (`rpw_jobs_backup_*`),
kikapcsolt RLS-sel, összesen 87 munkasorral. Ma nem voltak elérhetők,
de egyetlen elgépelt `grant` elég lett volna hozzá.

→ **ELINTÉZVE (011, 2026-08-29):** átkerültek a zárt `rpw_archiv` sémába.
Nem törölve — visszahozhatók. A `public` sémában ezzel nem maradt RLS
nélküli munkamásolat.

## 4. Függvények — a lezárás ELŐTT

**36 `rpw*` függvényt futtathat ma az anon kulcs**, mind
`SECURITY DEFINER`. A 008 ebből csak a bérlő-biztosakat hagyja meg.

Megnéztem, melyik ír hitelesítés nélkül:

| függvény | munkamenetet ellenőriz | megjegyzés |
|---|---|---|
| `rpw2_pin_set`, `rpw_pin_set_for`, `rpw_set_pin` | **igen** (`p_token`) | PIN-írás tokenhez kötve — rendben |
| `rpw2_employee_save`, `rpw2_role_save`, `rpw2_pin_unlock` | **igen** (`p_token`) | személyzeti írás tokenhez kötve — rendben |
| `rpw2_can`, `rpw2_team` | **igen** (`p_token`) | — |
| `rpw2_roster(p_shop_id)` | **nem** | a belépő lapnak kell, belépés ELŐTT: a szerviz azonosítójával **19 dolgozó neve és munkaköre lekérdezhető**. Tudatos kompromisszum, de személyes adat |
| `rpw_roles_seed(p_shop_id)` | **nem** | hitelesítés nélküli írás, DE `on conflict do nothing`: meglévő szerepet **nem tud felülírni**, csak új szervizhez beszúrni. Alacsony súly; a 008 elveszi |

## 5. Amit a mentés NEM helyettesít

Ez **adatbázison belüli** pillanatkép. Megvéd attól, ha egy migráció
vagy egy hibás írás elrontja az adatot: egy `insert ... select`
visszaállítja. **Nem** véd az egész projekt elvesztése ellen.

A platform-szintű mentés (Supabase → Database → Backups) **nem érhető el
az API-ról** — ott nincs mentés-művelet. Az egy kattintás a felületen,
és Ferenc feladata marad. A dátum feljegyzése után ez a pont teljes.
