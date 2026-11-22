# RPW — RedAssistance Paint Workflow

Karosszéria-műhely munkakövetés: **egy autó → esetenként egy dosszié → vezérelt életciklus**,
biztosítói határidőkkel és mért munkaidővel.

Keretrendszer nélkül: nincs build, a böngésző közvetlenül futtatja.
Backend: Supabase (Postgres + RPC) · Netlify functions (OCR, osztályozás, levél).

## A saját gépeden (Windows) — amíg a szerver elkészül

Kell hozzá: **Docker Desktop** (docker.com → Download for Windows). Más nem — git sem.

1. **Letöltés:** ezt a címet nyisd meg a böngészőben, és csomagold ki a ZIP-et (pl. `C:\RPW`):
   `https://github.com/boschservice12-png/rpw-bosch-service/archive/refs/heads/claude/relaxed-shannon-poab6p.zip`
2. **Docker Desktop** elindítása — várd meg, amíg zöld lesz.
3. A kicsomagolt mappában dupla kattintás: **`RPW-inditas.bat`** (az első indítás pár perc).
   Megnyílik a böngésző: *Ferenc Admin* · PIN **4826**. Az ablak kiírja a **telefonos címet** is (ugyanazon a wifin).

| Fájl | Mit csinál |
|---|---|
| `RPW-inditas.bat` | elindítja (vagy frissítés után újraépíti) és megnyitja |
| `RPW-leallitas.bat` | leállítja — **az adat megmarad** |
| `RPW-mentes.bat` | mentés most + visszatöltési próba + a mentések kimásolása a `mentesek\` mappába (innen OneDrive / pendrive) |

- Saját, helyi adatbázis — **az éles rendszerhez nem nyúl**. Mentés éjjel magától is (14 marad).
- A mentés titkosított: a **mentési kulcsot** egyszer írd fel a jelszókezelődbe:
  `docker compose exec rpw grep RPW_BACKUP_KEY /data/.rpw-secrets`
- Frissítés új verzióra: új ZIP ugyanabba a mappába, utána `RPW-inditas.bat` — az adat megmarad.
- Tiszta újrakezdés (MINDEN adat törlődik): `docker compose down -v`.
- OCR / levél: `ANTHROPIC_API_KEY` és `RESEND_API_KEY` — a gép környezeti változójaként (nélküle kézi bevitel).
- Telefonon a fotó a fájl-gombbal készül (ez HTTP-n is működik). Ha egy telefon mégsem engedné a kamerát,
  az a valódi szerver HTTPS-ét igényli.
- **Ez próbaüzem, nem éles rendszer:** a gép kikapcsolásakor az RPW sem érhető el, és a mentés csak akkor
  véd, ha a `mentesek\` mappát rendszeresen a gépen kívülre is másolod.

Linux / Mac: `docker compose up -d --build`, utána http://localhost:8000/rpw-login.html

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
rpw-classify.js            iratbesorolás (AI-javaslat, emberi döntés)
functions/                 Netlify functions
_migrations/               számozott SQL-migrációk + rollback
_tests/unit/               kliensoldali tesztek
_tests/integration/        VALÓDI PostgreSQL ellen
_tests/frontend/           VALÓDI oldalkód jsdom-ban
_tests/static/             statikus workflow-audit
_tests/run-all.js          háromkategóriás futtató
_db/                       séma, adatmodell-terv
symfony/                   ÚJ Symfony 7.4 backend (átállás alatt, lásd RPW-004)
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
| `RPW-004-SYMFONY-ATALLAS.md` | átállás Symfony-ra: állapot, kockázatok, ütemterv |
| `symfony/README.md` | az új backend: indítás, tesztek, API |

## Belépés

`rpw-login.html` → név a legördülőből → PIN.
A szerviz **saját** dolgozóit és szerepköreit viszi (`Echipă` lap) — nincs külső függés.
