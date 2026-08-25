# TEST-REPORT.md

> **Ez a fájl generált.** Forrás: `_tests/last-run.json`.
> Újragenerálás: `npm test && node _tests/gen-report.js`

*Generálva: 2026-08-25T09:40:15.853Z*

---

## Környezet

| | |
|---|---|
| Node | v22.22.2 |
| npm | 10.9.7 |
| jsdom | 30.0.1 |
| embedded-postgres | 18.4.0-beta.17 |
| Build | `V4-QUEUE-SAVEFIX` |

## Parancsok

```bash
npm ci                              # reprodukálható telepítés
npm test                            # unit + integrációs
node _tests/run-all.js --unit       # csak unit
node _tests/run-all.js --integration # csak integrációs (valódi PostgreSQL)
```

---

## Eredmény kategóriánként

```
Unit:                  PASS
Database integration:  PASS
Frontend integration:  PASS
Static workflow audit: PASS
Staging:               NOT VERIFIED
```

| Kategória | Fájl | Állítás | Sikeres | Sikertelen | El sem indult |
|---|---:|---:|---:|---:|---:|
| **Unit** | 38 | 1598 | 1598 | 0 | 0 |
| **Database integration** | 3 | 262 | 262 | 0 | 0 |
| **Frontend integration** | 1 | 176 | 176 | 0 | 0 |
| **Static workflow audit** | 1 | 2 | 2 | 0 | 0 |
| **Staging** | — | — | — | — | — |

**Futási idő:** 26.6 s

> ⚠ **A staging NEM igazolt** — a MANUAL-STAGING-CHECKLIST.md nincs kitöltve
> Ezért a „minden teszt sikeres" állítás NEM tehető meg.
> A kézi ellenőrzés lépései: `MANUAL-STAGING-CHECKLIST.md`

---

## A frontend-integrációs tesztek VALÓDI oldalkódot futtatnak

Nem statikus szövegkeresés. A HTML-oldal saját moduljai betöltődnek jsdom-ban,
a valódi `commitCriticalTransition` fut, és rögzítjük, MELYIK Supabase RPC
hívódott meg. A teszt kivételt dob a helyi mutációban — ha az lefutna, a teszt
elbukna. Mind a hét fázisoldalra + a dosszié-újranyitásra.

## Az adatbázis-integrációs tesztek VALÓDI adatbázison futnak

Nem mock. Beágyazott PostgreSQL indul (`embedded-postgres`), a migrációk
lefutnak, és az igazi SQL-függvények ellen mérünk — igazi RLS-szabályokkal,
igazi tranzakciókkal, két külön kapcsolaton át párhuzamosan.

Ez fedi a brief 6. pontjának mind a 12 esetét és a 13. pont regresszióit.

---

## Fájlonként

| Kategória | Fájl | Sikeres | Sikertelen | Állapot |
|---|---|---:|---:|---|
| unit | `test-acceptance.js` | 87 | 0 | ✅ |
| unit | `test-azi.js` | 50 | 0 | ✅ |
| unit | `test-bar.js` | 23 | 0 | ✅ |
| unit | `test-case.js` | 27 | 0 | ✅ |
| unit | `test-classify.js` | 105 | 0 | ✅ |
| unit | `test-conflict.js` | 28 | 0 | ✅ |
| unit | `test-deploy.js` | 34 | 0 | ✅ |
| unit | `test-dialogs.js` | 39 | 0 | ✅ |
| unit | `test-dosare.js` | 22 | 0 | ✅ |
| unit | `test-dosarflux.js` | 22 | 0 | ✅ |
| unit | `test-edit.js` | 38 | 0 | ✅ |
| unit | `test-entry.js` | 56 | 0 | ✅ |
| unit | `test-gap.js` | 69 | 0 | ✅ |
| unit | `test-lifecycle.js` | 39 | 0 | ✅ |
| unit | `test-list-unwrap.js` | 64 | 0 | ✅ |
| unit | `test-load.js` | 15 | 0 | ✅ |
| unit | `test-metrics.js` | 70 | 0 | ✅ |
| unit | `test-modal.js` | 19 | 0 | ✅ |
| unit | `test-onelist.js` | 24 | 0 | ✅ |
| unit | `test-oneway.js` | 27 | 0 | ✅ |
| unit | `test-p0-1-guard.js` | 78 | 0 | ✅ |
| unit | `test-p0-3-tenant.js` | 34 | 0 | ✅ |
| unit | `test-p0-5-admin.js` | 29 | 0 | ✅ |
| unit | `test-p0-6-storage.js` | 24 | 0 | ✅ |
| unit | `test-p0-7-functions.js` | 40 | 0 | ✅ |
| unit | `test-pin-dialog.js` | 24 | 0 | ✅ |
| unit | `test-prog.js` | 30 | 0 | ✅ |
| unit | `test-queue.js` | 44 | 0 | ✅ |
| unit | `test-render.js` | 25 | 0 | ✅ |
| unit | `test-rot.js` | 47 | 0 | ✅ |
| unit | `test-rpc-consistency.js` | 54 | 0 | ✅ |
| unit | `test-security-a-o.js` | 95 | 0 | ✅ |
| unit | `test-staff.js` | 50 | 0 | ✅ |
| unit | `test-state.js` | 28 | 0 | ✅ |
| unit | `test-tenant.js` | 12 | 0 | ✅ |
| unit | `test-typo.js` | 19 | 0 | ✅ |
| unit | `test-wa.js` | 12 | 0 | ✅ |
| unit | `test-xss.js` | 95 | 0 | ✅ |
| integration | `test-int-migrations.js` | 46 | 0 | ✅ |
| integration | `test-int-tenant.js` | 114 | 0 | ✅ |
| integration | `test-int-workflow.js` | 102 | 0 | ✅ |
| frontend | `test-fe-transition.js` | 176 | 0 | ✅ |
| static | `test-static-workflow.js` | 2 | 0 | ✅ |

---

## ⚠ NEM VOLT IGAZOLHATÓ

Ezek valódi Supabase/Netlify környezetet igényelnek — a homokozóból nem mérhetők:

| Állítás | Miért |
|---|---|
| A migrációk az ÉLES adatbázison lefutnak | Az 1. alapelv tiltja az éles DB módosítását |
| A signed URL lejárati ideje | Valódi Supabase-tárolót igényel |
| SHOP_A nem kérhet signed URL-t SHOP_B fájljához *(6.7)* | Ugyanaz — a kliensoldali „nincs publikus visszaesés" unit teszttel igazolt |
| A Netlify-funkciók éles viselkedése | Valódi Netlify-környezet |
| 10–20 egyidejű dolgozó | Terheléses staging |
| A CSP éles hatása | Report-only mérés kell előbb |
