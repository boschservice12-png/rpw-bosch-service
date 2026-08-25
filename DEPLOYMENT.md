# DEPLOYMENT — a v2 konszolidáció élesítési terve

## Amit ez a csomag MEGVÁLTOZTAT a mai élesen (migráció nélkül is)

Legacy módban (mai config) a viselkedés szándékosan majdnem változatlan:
- a szerver explicit `{ok:false}`/`{conflict}` válasza mostantól HIBAKÉNT
  látszik (eddig néma "siker" volt) — ez javítás, nem kockázat;
- a Programare nouă + biztosítós kár adatai nem vesznek el;
- dupla kattintás a fázisgombokon egy hívást indít;
- minden más (v3, transitions, job_create, deprecations) KAPCSOLÓ mögött alszik.

## A cutover lépései (sorrendben, mindegyik után ellenőrzés)

1. **Séma-egyeztetés (ember):** az éles DB és a `_migrations/` összevetése
   read-only lekérdezésekkel. Az eltérések (app_session, can_* oszlopok)
   feloldása KÜLÖN migrációban, ha kell.
2. **Staging DB:** 001→008 lefuttatása sorban; `select version from
   rpw_schema_version` = '008'.
3. **Staging alkalmazás:** `cp rpw-config.staging.js rpw-config.js` a staging
   deployon; MANUAL-STAGING-CHECKLIST.md kitöltése EMBERREL;
   `_registry/evidence.json` bejegyzések.
4. **PIN-ek:** minden aktív dolgozónak (ma 11-ből 1-nek van).
5. **Netlify env:** `ANTHROPIC_API_KEY` beállítása (F-210/211-hez).
6. **Éles migráció:** karbantartási ablakban 001→008; azonnali
   capability-ellenőrzés (`rpw_server_capabilities` = ok, '008').
7. **Config-váltás élesben:** AUTH_REQUIRED=true → PATCH_RPC='rpw_patch_v3'
   → SERVER_TRANSITIONS=true → (megfigyelés után) PRODUCTION=true.
   A guard minden rossz kombinációt HARD FAIL-lel utasít el.
8. **Megfigyelés:** rpw_audit `denied:*` sorok figyelése az első napokban.

## Tilos

- A config-kapcsolókat a staging-igazolás ELŐTT átállítani.
- A 008-at az 001–007 nélkül futtatni (előfeltétel-őr le is állítja).
- Éles DB-n bármit e terven kívül futtatni.
