# CHANGELOG — rpw-funkciok-konszolidalt-v2 (2026-08-25)

## Javítások (élesben is ható)
- **{ok:false} ≠ siker minden mentési úton** (F-110): db-réteg `legacyGuard`
  + v3 `unwrap`; a 7 oldal hívóhelye nem nyeli el a hibát.
- **Programare nouă + biztosítós kár adatvesztése javítva** (Ferenc találta):
  damageType/asigurator/dosarStatus mostantól átmegy a mentett munkára.
- **Dupla kattintás a fázisgombokon**: in-flight zár — egy hívás.
- **Guard fail-closed**: a `halt()` config-nullázása nem függ a `document`-től.

## Új képességek (kapcsoló mögött, cutoverig alszanak)
- **F-120 `rpw_job_create` (008)**: szám, kezdő állapot, tenant, actor, audit
  a szerveren; idempotens; a kliens hamisított mezőit elutasítja.
- **Secure mentés-szűrés**: v3 módban a normál mentés soha nem visz
  workflow-mezőt (ez volt az F-107 blokkolója).
- **F-111/112/113 kliens-lánc**: PRODUCTION-ban nincs lokális fallback;
  lezárhatóság-előnézet a szerver szabályforrásából.
- **Deprecations (008)**: rpw_patch/rpw_login/rpw_team/rpw_next_job_number/
  rpw_patch_v2 EXECUTE jogának elvétele; kliens-oldali kapuzás strict módban.
- **F-907 rpw-bootstrap.js**: közös fail-closed indulási sorrend.

## Nyilvántartás
- Registry v2: 84 funkció, 8 kategória, P0..P3 súlyozás, értéklánc-nézet;
  a státuszt gép számolja (derive.js); emberi evidence nélkül nincs
  STAGING/PRODUCTION_VERIFIED; MD+PDF gépi generálás.

## Tesztek
- +6 új tesztfájl (save-consolidation 64, int-jobcreate 30 valódi PG-n,
  transition-chain 38, fe-click 119 VALÓDI kattintással, sync-state 19,
  bootstrap 10, deprecation 14); teljes szvit 53 fájl / 3528 állítás zöld.
