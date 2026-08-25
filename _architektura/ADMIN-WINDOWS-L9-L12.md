# L9–L12 — Csapat · Statisztika · Paraméterek · Adminisztráció — vezérlő-térkép

> **Vizsgált forrás:** `index.html` (renderEchipa/renderStatistici/renderParametri),
> `rpw-cleanup.html`, `rpw-cos.html`. Rövidebb ablakok — tömörebb feldolgozás,
> azonos szigorral.

## L9 · ECHIPĂ (csapat és jogosultság)

| vezérlő | kód | viselkedés | minősítés |
|---|---|---|---|
| Belépés-őr | token nélkül a képernyő figyelmeztetést mutat, nem adatot | jó fail-closed minta | működik |
| Dolgozó-szerkesztő | `ecEmp` (2872) → `rpw2_employee_save` (token, szerveroldali jog) | név, munkakör, aktív | működik a migrált sémán |
| Szerepkör-szerkesztő | `ecRole` (2935) → `rpw2_role_save`: a jogok KAPCSOLÓK (open/reception/work/close/override/delete/team/posts) — nem név-alapú | ez a K-23 döntésed alapja is | működik a migrált sémán |
| PIN-kezelés | `ecPin` → `rpw2_pin_set` (gyenge PIN-t a szerver utasít el); zárolás-feloldás → `rpw2_pin_unlock` (csapat-jog a szerveren) | | **működik a migrált sémán — ÉLESBEN ALVÓ** (007 nincs fent; 11-ből 1 dolgozónak van PIN-je — G-04) |

## L10 · STATISTICI

- `renderStatistici` (1300+): időszak-váltó (`statPeriod`), elakadás-küszöb (`statThreshold`),
  Chart.js grafikonok — **minden számítás kliens-oldali, a betöltött JOBS-ból**.
- Minősítés: **működik**; korlát: amit a lista nem tölt be (pl. régi arhivált), az a
  statisztikából is hiányzik — a számok a képernyő adatai, nem a teljes adatbázisé.

## L11 · PARAMETRI

| tulajdonság | bizonyíték | következmény |
|---|---|---|
| Tárolás: **localStorage** (`saveConfig` 459: `rpw_config`) | a kapacitás-értékek (posturi, óra/nap, nap/hét), tarifák GÉPENKÉNT élnek | **E-29**: két gép két különböző paraméter-készletet láthat; a K-15 döntésed (kapacitás-figyelmeztetés előjegyzéskor) így gépfüggő számot adna |
| Kapacitás-számítás | `cap=(tin+vop)*óra*nap` a fejlécben | csak megjelenik — sehol nem kényszerít (E-16-tal összhangban) |
| Jogosultság | NINCS — bárki átírhatja a tarifát és a kapacitást | **E-30**: a K-23 döntésed („csak jogosultak operálhatnak") a paraméterekre is vonatkozik — ma nincs kapu |

## L12 · ADMINISZTRÁCIÓ

| vezérlő | kód | viselkedés | minősítés |
|---|---|---|---|
| Admin-kapcsoló | `toggleAdmin` (2016): jog a SZERVER-munkamenet szerepéből (`rpwCan('team')`); localStorage csak UX-emlék | helyes minta | működik |
| Curatare (`rpw-cleanup.html`) | lista: `rpw_cleanup_list` (token); törlés: **megerősítés + kötelező indok (audit) + védett referencia-munkák kihagyása** → `rpw_cleanup_hard_delete`; backup-gomb; **foto-migrálás dry-run: CSAK SZIMULÁCIÓ, nem ír** | | működik a migrált sémán; a dry-run DB-tesztje hiányzik (G-08) |
| Coș (`rpw-cos.html`) | visszaállítás `rpw_job_restore`; végleges törlés `rpw_job_purge`; ürítés `purgeAllTrashed` | soft-delete → kuka → purge lánc a spec 27. pontja szerint | működik; a purge megőrzési-szabály dokumentáció (27. pont) nincs |

## ELLENTMONDÁSOK (L9–L12)

| # | ellentmondás | hol | kockázat |
|---|---|---|---|
| **E-29** | A Parametri értékei localStorage-ban élnek — gépenként eltérhetnek; a kapacitás- és tarifa-adat nem központi | index 459 | két recepciós két különböző „igazságot" lát; a K-15 figyelmeztetés gépfüggő lenne |
| **E-30** | A Parametri-képernyőnek nincs jogosultság-kapuja — bárki átírja a tarifát | renderParametri | árazási hiba/visszaélés; ütközik a K-23 elveddel |
| **E-31** | A Statistici a betöltött listából számol, nem a teljes adatbázisból — a számok a nézet, nem a valóság | renderStatistici | vezetői döntés részleges adatra épülhet |

## TULAJDONOSI KÉRDÉSEK (L9–L12 után)

**K-26 · Paraméterek központosítása (E-29/E-30):** a Parametri értékei költözzenek-e
a szerverre (tenantonként egy készlet), és a szerkesztésük legyen-e `team`/vezetői
joghoz kötve? — *A K-15 és K-23 döntéseid ezt feltételezik; ajánlott: igen.*

**K-27 · Statisztika hatóköre (E-31):** elég-e a mai (betöltött listából számolt)
statisztika, vagy kell szerveroldali összesítés (pontos, teljes adatbázisból)?

**K-24 (még nyitott) · Rework-határidő:** kapjon-e a rework kötelező határidőt,
és a lejárt jelenjen-e meg a „Ce facem azi?"-ban?
