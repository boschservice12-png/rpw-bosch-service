# DEPRECATION-PLAN — a régi és párhuzamos utak kivezetése

## Mi van kivezetés alatt

| régi út | utód | státusz ma |
|---|---|---|
| `rpw_login` (név nélküli PIN-belépés) | `rpw2_login` (név+PIN) | a frontend strict módban már NEM hívja (`legacy_login_disabled`); a 004 csonkra cserélte, a 008 az EXECUTE jogot is elveszi |
| `rpw_team` | `rpw2_team` | strict módban a kliens már a rpw2-t hívja; 008 revoke |
| `rpw_next_job_number` (token nélkül) | `rpw_job_number` (tokenes) ill. `rpw_job_create` | secure módban a kliens már a tokenes utat hívja; 008 revoke |
| `rpw_patch` (teljes-job, védelem nélkül) | `rpw_patch_v3` (slice, verziózár, védett mezők) | a kliens KIZÁRÓLAG az `RPWDb.patch` kapun át éri el; 004 csonk + 008 revoke |
| `rpw_patch_v2` | `rpw_patch_v3` | MA ÉLESBEN EZ FUT (PATCH_RPC='rpw_patch_v2'); 008 revoke a cutoverkor |

## Miért nem "azonnal"

Az ÉLES adatbázison a 001–008 migrációk NINCSENEK lefuttatva, és az éles séma
eltér a migrációkétól (a jogok `can_*` oszlopokban, a munkamenetek az
`app_session` táblában). A régi utak feltétel nélküli törlése MA az éles
belépést és mentést törné el. Ezért a kivezetés KAPUZOTT:

- strict/secure módban (PRODUCTION / AUTH_REQUIRED / PATCH_RPC=v3) a régi
  utak a KLIENSEN már most tiltottak — `test-deprecation.js` őrzi;
- legacy módban (a mai éles) a tartalék él a cutoverig.

## A cutover sorrendje (DEPLOYMENT.md részletezi)

1. Éles séma-egyeztetés (a migrációk vs. élő séma — EMBERI feladat).
2. 001–008 lefuttatása stagingen → staging-ellenőrzés (checklist).
3. Minden aktív dolgozónak PIN (ma: 11-ből 1).
4. `rpw-config.js`: AUTH_REQUIRED=true, PATCH_RPC='rpw_patch_v3',
   SERVER_TRANSITIONS=true (a staging-igazolás UTÁN).
5. 008 élesben → a régi utak EXECUTE joga megszűnik.
6. Megfigyelés; a rollback (008_rollback.sql) a függvényt vonja vissza,
   de a veszélyes jogokat NEM adja vissza automatikusan — az emberi,
   dokumentált döntés.

## Rollback-elv

A `008_rollback.sql` szándékosan NEM állítja vissza a revoke-olt jogokat:
egy hibás cutover után az alkalmazás a legacy configgal (PATCH_RPC=v2)
működőképes, a védtelen utak visszanyitása nélkül.
