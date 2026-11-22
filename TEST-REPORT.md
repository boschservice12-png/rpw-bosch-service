# TEST-REPORT.md

> **Ez a fájl generált.** Forrás: `_tests/last-run.json`.
> Újragenerálás: `npm test && node _tests/gen-report.js`

*Generálva: 2026-11-22T22:21:39.532Z*

---

## Környezet

| | |
|---|---|
| Node | v22.23.5 |
| npm | 10.9.9 |
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
| **Unit** | 57 | 3457 | 3457 | 0 | 0 |
| **Database integration** | 5 | 355 | 355 | 0 | 0 |
| **Frontend integration** | 5 | 486 | 486 | 0 | 0 |
| **Static workflow audit** | 1 | 2 | 2 | 0 | 0 |
| **Staging** | — | — | — | — | — |

**Futási idő:** 48.4 s

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
| unit | `test-acceptance.js` | 95 | 0 | ✅ |
| unit | `test-azi.js` | 50 | 0 | ✅ |
| unit | `test-bar.js` | 23 | 0 | ✅ |
| unit | `test-case.js` | 28 | 0 | ✅ |
| unit | `test-classify.js` | 106 | 0 | ✅ |
| unit | `test-conflict.js` | 28 | 0 | ✅ |
| unit | `test-csp-data-url.js` | 15 | 0 | ✅ |
| unit | `test-delete.js` | 36 | 0 | ✅ |
| unit | `test-deploy.js` | 40 | 0 | ✅ |
| unit | `test-dialogs.js` | 39 | 0 | ✅ |
| unit | `test-dosare.js` | 28 | 0 | ✅ |
| unit | `test-dosarflux.js` | 22 | 0 | ✅ |
| unit | `test-dup-dosar.js` | 22 | 0 | ✅ |
| unit | `test-edit.js` | 38 | 0 | ✅ |
| unit | `test-entry.js` | 54 | 0 | ✅ |
| unit | `test-foto-lejarat.js` | 14 | 0 | ✅ |
| unit | `test-gap.js` | 69 | 0 | ✅ |
| unit | `test-harom-allapot.js` | 37 | 0 | ✅ |
| unit | `test-kodreview-0829.js` | 120 | 0 | ✅ |
| unit | `test-kr4-prepare-rollback.js` | 21 | 0 | ✅ |
| unit | `test-lifecycle.js` | 39 | 0 | ✅ |
| unit | `test-list-unwrap.js` | 67 | 0 | ✅ |
| unit | `test-load.js` | 24 | 0 | ✅ |
| unit | `test-mail-split.js` | 10 | 0 | ✅ |
| unit | `test-metrics.js` | 70 | 0 | ✅ |
| unit | `test-min-cache.js` | 46 | 0 | ✅ |
| unit | `test-modal.js` | 19 | 0 | ✅ |
| unit | `test-ocr-model.js` | 12 | 0 | ✅ |
| unit | `test-onelist.js` | 21 | 0 | ✅ |
| unit | `test-oneway.js` | 32 | 0 | ✅ |
| unit | `test-p0-1-guard.js` | 88 | 0 | ✅ |
| unit | `test-p0-3-tenant.js` | 34 | 0 | ✅ |
| unit | `test-p0-5-admin.js` | 29 | 0 | ✅ |
| unit | `test-p0-6-storage.js` | 24 | 0 | ✅ |
| unit | `test-p0-7-functions.js` | 48 | 0 | ✅ |
| unit | `test-photo-refs.js` | 17 | 0 | ✅ |
| unit | `test-photos-gateway.js` | 30 | 0 | ✅ |
| unit | `test-pin-dialog.js` | 24 | 0 | ✅ |
| unit | `test-prog.js` | 30 | 0 | ✅ |
| unit | `test-progres.js` | 67 | 0 | ✅ |
| unit | `test-queue.js` | 44 | 0 | ✅ |
| unit | `test-reconst-photos.js` | 17 | 0 | ✅ |
| unit | `test-registry.js` | 1095 | 0 | ✅ |
| unit | `test-render.js` | 26 | 0 | ✅ |
| unit | `test-rot.js` | 47 | 0 | ✅ |
| unit | `test-rpc-consistency.js` | 98 | 0 | ✅ |
| unit | `test-rpw001-auth-gate.js` | 79 | 0 | ✅ |
| unit | `test-security-a-o.js` | 107 | 0 | ✅ |
| unit | `test-staff.js` | 50 | 0 | ✅ |
| unit | `test-state.js` | 28 | 0 | ✅ |
| unit | `test-storage-gateway.js` | 48 | 0 | ✅ |
| unit | `test-tenant.js` | 12 | 0 | ✅ |
| unit | `test-thumbs.js` | 18 | 0 | ✅ |
| unit | `test-typo.js` | 19 | 0 | ✅ |
| unit | `test-ugy-folyamat.js` | 39 | 0 | ✅ |
| unit | `test-wa.js` | 19 | 0 | ✅ |
| unit | `test-xss.js` | 95 | 0 | ✅ |
| integration | `test-int-migrations.js` | 48 | 0 | ✅ |
| integration | `test-int-rls-live.js` | 68 | 0 | ✅ |
| integration | `test-int-session-lineage.js` | 23 | 0 | ✅ |
| integration | `test-int-tenant.js` | 114 | 0 | ✅ |
| integration | `test-int-workflow.js` | 102 | 0 | ✅ |
| frontend | `test-fe-dosar.js` | 30 | 0 | ✅ |
| frontend | `test-fe-panou.js` | 189 | 0 | ✅ |
| frontend | `test-fe-transition.js` | 182 | 0 | ✅ |
| frontend | `test-fe-upload.js` | 62 | 0 | ✅ |
| frontend | `test-fe-urlap.js` | 23 | 0 | ✅ |
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
