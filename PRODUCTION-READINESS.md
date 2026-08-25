# PRODUCTION-READINESS — mi kell az élesítéshez, és hol tartunk

A gépi számok forrása: `_registry/derive.js` (lásd FUNKCIOK.md vezetői
összefoglalóját — minden `npm run funkciok` frissíti).

## A 43. pont feltételei — tételesen

| feltétel | állapot |
|---|---|
| minden P0 funkció végponttól végpontig működik | **NEM** — G-01/G-03 (élesben a védett lánc alvó; nincs E2E) |
| nincs védtelen régi mentési út | **RÉSZBEN** — strict módban nincs; élesben MA a v2 fut (cutoverig) |
| nincs hamis sikeres mentés | **IGEN (gépileg igazolt)** — {ok:false}/conflict egyik úton sem siker |
| a hét fázis valódi gombkattintással tesztelt | **IGEN** — test-fe-click.js, 7 oldal × 7 szcenárió |
| nincs átugorható követelmény | **IGEN a szerveren (006, DB-teszttel)** — élesben a 006 nincs fent (G-01) |
| nincs cross-tenant hozzáférés | **IGEN a migrált sémán (DB-teszt)** — élesben NEM VOLT IGAZOLHATÓ |
| nincs el sem indult teszt | **IGEN** — 53 fájl, 0 NEM INDULT |
| a teljes üzleti E2E lánc sikeres | **NEM VOLT IGAZOLHATÓ** — nincs E2E teszt (G-03) |
| staging ellenőrzés megtörtént | **NEM** (G-02) |
| migráció és rollback stagingen kipróbált | **RÉSZBEN** — beágyazott PostgreSQL-en igazolt (oda-vissza), VALÓDI stagingen nem |
| minden aktív dolgozónak van PIN-je | **NEM** — 11-ből 1 (G-04) |

## Következtetés

**ÉLESÍTHETŐ: NEM.** A kód- és tesztoldal kész; a blokkolók emberi/üzemeltetési
lépések: séma-egyeztetés, staging-főpróba, PIN-ek, API-kulcs, E2E.

## A zöld út (sorrendben)

1. G-01: éles séma vs. migrációk egyeztetése (ember + read-only összevetés)
2. Staging DB a 001–008-cal → MANUAL-STAGING-CHECKLIST.md kitöltése →
   evidence.json bejegyzések
3. G-04: PIN-ek kiosztása
4. G-03: E2E lánc-teszt megírása és zöldre futtatása
5. Config-cutover (DEPLOYMENT.md) → megfigyelés → evidence: production
