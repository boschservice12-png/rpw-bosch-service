# ROLLBACK — visszavonási terv

## Kliens (azonnali, DB-érintés nélkül)

A teljes védett lánc config-kapcsolók mögött van. Visszaállás:
`rpw-config.js`: PRODUCTION=false → SERVER_TRANSITIONS=false →
PATCH_RPC='rpw_patch_v2' → AUTH_REQUIRED=false. Ez a MAI éles viselkedés —
egy fájl, egy deploy.

## Adatbázis (sorrendben visszafelé)

```
008_rollback.sql   ← rpw_job_create törlése; a revoke-olt jogokat NEM adja vissza
007_rollback.sql   ← PIN-zárolás
006_rollback.sql   ← workflow-kényszerítés
005..001_rollback  ← csak teljes visszabontásnál
```

Mindegyik rollback a beágyazott PostgreSQL-en oda-vissza tesztelt
(test-int-migrations.js, test-int-tenant.js). VALÓDI stagingen: NEM VOLT
IGAZOLHATÓ (G-02) — az éles rollback előtt stagingen kötelező kipróbálni.

## Miért nem adja vissza a 008 a régi jogokat

`rpw_patch`/`rpw_login` bérlővédelem és verziózár nélküli utak. Egy hibás
cutover után az alkalmazás a legacy configgal működik — a védtelen szerver-utak
visszanyitása nélkül. Visszanyitásuk csak külön, dokumentált emberi döntéssel.
