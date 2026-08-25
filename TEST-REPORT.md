# TEST-REPORT — gépi teszteredmény

Futás: `2026-08-25T18:02:07.032Z` · Node v22.22.2 · beágyazott PostgreSQL 18.4.0-beta.17
Build: `V4-QUEUE-SAVEFIX`

| kategória | fájl | állítás | hibás | nem indult | ítélet |
|---|---:|---:|---:|---:|---|
| Unit | 46 | 2935 | 0 | 0 | PASS |
| Database integration (VALÓDI PostgreSQL) | 4 | 296 | 0 | 0 | PASS |
| Frontend (valódi oldalkód + VALÓDI kattintás) | 2 | 295 | 0 | 0 | PASS |
| Statikus workflow-audit | 1 | 2 | 0 | 0 | PASS |
| **Összesen** | **53** | **3528** | **0** | — | — |

## Kategóriák (a feladat 30. pontja szerint)

| kategória | van? | hol |
|---|---|---|
| Unit | IGEN | `_tests/unit/` (46 fájl) |
| Database integration | IGEN | `_tests/integration/` — beágyazott, VALÓDI PostgreSQL, teljes migrációs lánc 001–008 + rollbackek |
| Workflow module integration | IGEN | test-fe-transition.js (valódi modulkód jsdom-ban) |
| Real DOM/UI click | IGEN | test-fe-click.js — a 7 fázisoldal VALÓDI gombjai, VALÓDI click, 7 szcenárió/oldal |
| End-to-end | **NINCS** (G-03) | — |
| Static security audit | IGEN | test-static-workflow.js + test-deploy.js + test-save-consolidation 6. szakasz |
| Migration | IGEN | test-int-migrations.js (oda-vissza, verziópecsét) |
| Staging | **NEM IGAZOLT** (G-02) | MANUAL-STAGING-CHECKLIST.md üres |
| Load/concurrency | **NINCS** | — |

## Mutációs próbák (szándékos rontással igazolt őrök)

- védett-mező szűrés kivétele → 11 állítás bukik
- legacyGuard kivétele → 2 állítás bukik
- dosarDupCheck hívás kivétele → 1 állítás bukik
- régi űrlapos gomb visszatétele → 3 állítás bukik
- kézzel hamisított PRODUCTION_VERIFIED státusz → regiszter-őr bukik
- beszámozatlan RPC betétele → regiszter-őr bukik

## Ami a gépi zöldből NEM következik

A staging és a production oszlop mindenütt üres (evidence.json), ezért
**"minden teszt sikeres" NEM állítható** — a gépi tesztek zöldek.
