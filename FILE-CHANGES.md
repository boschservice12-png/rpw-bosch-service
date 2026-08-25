# FILE-CHANGES.md

A `v3` → `v4` közötti eltérések. Gépi összehasonlítás (SHA-256).

*Generálva: 2026-08-24*

---

## Új fájlok (6)

| Fájl | Mi ez |
|---|---|
| `_migrations/006_rollback.sql` | A 006 visszavonása — a V3 állapot visszaáll |
| `_migrations/006_workflow_enforcement.sql` | Védett workflow-mezők, patch-jogosultság, trash-jog, rework-szignatúra |
| `_tests/frontend/test-fe-transition.js` | VALÓDI oldalkód jsdom-ban — mind a 7 fázisoldal |
| `_tests/integration/test-int-workflow.js` | VALÓDI DB: 9 megkerülési kísérlet, szerepkörök, rollback |
| `_tests/static/audit-result.json` | A statikus audit gépi eredménye |
| `_tests/static/test-static-workflow.js` | Statikus workflow-audit engedélylistával |

## Módosított fájlok (29)

| Fájl | Mi változott |
|---|---|
| `CHANGELOG.md` | teszt-elvárás a V4 alapállapothoz igazítva |
| `DEPLOYMENT.md` | teszt-elvárás a V4 alapállapothoz igazítva |
| `MANUAL-STAGING-CHECKLIST.md` | teszt-elvárás a V4 alapállapothoz igazítva |
| `README.md` | teszt-elvárás a V4 alapállapothoz igazítva |
| `REMAINING-RISKS.md` | teszt-elvárás a V4 alapállapothoz igazítva |
| `SECURITY.md` | teszt-elvárás a V4 alapállapothoz igazítva |
| `TEST-REPORT.md` | teszt-elvárás a V4 alapállapothoz igazítva |
| `_migrations/005_rls_lockdown.sql` | Tűri a 006 szignatúra-bővítését (újrafuttatható) |
| `_tests/gen-report.js` | Öt kategória a jelentésben |
| `_tests/integration/_db.js` | teszt-elvárás a V4 alapállapothoz igazítva |
| `_tests/integration/test-int-migrations.js` | teszt-elvárás a V4 alapállapothoz igazítva |
| `_tests/integration/test-int-tenant.js` | teszt-elvárás a V4 alapállapothoz igazítva |
| `_tests/last-run.json` | teszt-elvárás a V4 alapállapothoz igazítva |
| `_tests/run-all.js` | ÖT kategória |
| `_tests/unit/test-lifecycle.js` | teszt-elvárás a V4 alapállapothoz igazítva |
| `index.html` | reactiveaza → újranyitás indoklással; nincs közvetlen phase/inchis |
| `rpw-control-red.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-cos.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-data.js` | A {ok:false} nem siker; p_rework_id/p_note; RPWData.init közös példány |
| `rpw-dosar.html` | dosarInchide → 7. fázis lezárása; dosarInapoi → újranyitás |
| `rpw-evaluare-red.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-guard.js` | verifyServer FAIL-CLOSED production-ban + időtúllépés |
| `rpw-inchidere-red.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-recepcio-red.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-reconstatare-red.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-tinichigerie-red.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-upload.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-vopsitorie-red.html` | a rpw-data.js betöltve + RPWData.init + verifyServer bekötve |
| `rpw-workflow.js` | commitCriticalTransition → a SZERVER dönt; prepare-ág; offline-védelem |

---

## Összegzés

| | |
|---|---|
| Új | 6 |
| Módosított | 29 |
