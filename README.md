# RPW — RedAssistance Paint Workflow

Karosszéria-műhely munkakövetés: **egy autó → esetenként egy dosszié → vezérelt életciklus**,
biztosítói határidőkkel és mért munkaidővel.

Keretrendszer nélkül: nincs build, a böngésző közvetlenül futtatja.
Backend: Supabase (Postgres + RPC) · Netlify functions (OCR, osztályozás, levél).

## Ellenőrzés

```bash
npm ci                                # reprodukálható telepítés
npm test                              # unit + integrációs
node _tests/run-all.js --unit         # csak unit
node _tests/run-all.js --integration  # VALÓDI PostgreSQL indul
node _tests/run-all.js --frontend     # VALÓDI oldalkód jsdom-ban
node _tests/run-all.js --static       # statikus workflow-audit
node _tests/gen-report.js             # TEST-REPORT.md a mérésből
```

A futtató **öt kategóriát** jelent külön: `unit`, `database integration`,
`frontend integration`, `static workflow audit`, `staging`. A staging kategóriát **ember** futtatja
(`MANUAL-STAGING-CHECKLIST.md`) — amíg nincs kitöltve, `NOT VERIFIED`.

A pontos számokat a `TEST-REPORT.md` tartalmazza, a `last-run.json`-ból
generálva. Kézzel írt tesztszám nincs a dokumentációban.

## Mappák

```
*.html, *.js               az alkalmazás
functions/                 Netlify functions
_migrations/               számozott SQL-migrációk + rollback
_tests/unit/               kliensoldali tesztek
_tests/integration/        VALÓDI PostgreSQL ellen
_tests/frontend/           VALÓDI oldalkód jsdom-ban
_tests/static/             statikus workflow-audit
_tests/run-all.js          háromkategóriás futtató
_db/                       séma, adatmodell-terv
```

| Dokumentum | Mit tartalmaz |
|---|---|
| `SECURITY.md` | biztonsági modell + **mi mivel van igazolva** |
| `DEPLOYMENT.md` | migrációs sorrend, staging, rollback |
| `TEST-REPORT.md` | **generált** — a mérésből |
| `REMAINING-RISKS.md` | ismert maradék kockázatok |
| `MANUAL-STAGING-CHECKLIST.md` | amit gép nem tud ellenőrizni |
| `FILE-CHANGES.md` | mi változott a v2-höz képest |
| `CHANGELOG.md` | változásnapló |

## Belépés

`rpw-login.html` → név a legördülőből → PIN.
A szerviz **saját** dolgozóit és szerepköreit viszi (`Echipă` lap) — nincs külső függés.
