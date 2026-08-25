# FUNCTION-GAPS — ami HIÁNYZIK vagy NEM VOLT IGAZOLHATÓ

> Ez a fájl szándékosan a rossz híreké. Amit itt nem sorolunk fel, arra a
> gépi tesztek zöldek. Frissítése kézzel, minden érdemi munka után.

## P0 — a lánc kritikus hiányai

| # | hiány | miért gond | mi kell hozzá |
|---|---|---|---|
| G-01 | **Az éles DB-n a 001–008 migráció nincs lefuttatva**, és az éles séma ELTÉR a migrációkétól (`can_*` oszlopok, `app_session`, nincs `rpw_transition`) | a teljes védett lánc (F-107/111/112/113/120) élesben ALVÓ | emberi séma-egyeztetés + staging-főpróba |
| G-02 | **Staging emberi ellenőrzés nincs** (MANUAL-STAGING-CHECKLIST.md üres) | semmi nem léphet STAGING/PRODUCTION_VERIFIED szintre | ember végigmegy a checklisten, evidence.json-ba írja |
| G-03 | **E2E lánc-teszt nincs** (login→create→7 fázis→rework→close→export egyben) | a lánc elemei igazoltak, az EGÉSZ nem | e2e teszt a valódi-katt harness kiterjesztésével |
| G-04 | **11 aktív dolgozóból 1-nek van PIN-je** | AUTH_REQUIRED=true kizárná a csapatot | PIN-ek kiosztása (emberi) |

## P1 — bekötetlen vagy őrizetlen

| # | hiány | állapot |
|---|---|---|
| G-05 | F-210/211 AI-besorolás + OCR: `ANTHROPIC_API_KEY` nincs a Netlify-on | a szerverless függvények élesben nem tudnak elindulni |
| G-06 | F-212 feltöltési link: nincs tokenes korlátozás (lejárat, egyszer-használat, fájltípus/méret-limit, visszavonás, audit) és nincs tesztje | a 20. pont követelményei NINCSENEK teljesítve |
| G-07 | Kommunikációs eseménymodell (25. pont): message_id/status/consent — nincs; a WhatsApp-linkmegnyitás ma "elküldöttnek" számít | F-410/411 státuszkövetés nélkül fut |
| G-08 | F-503 cleanup dry-run: nincs DB-integrációs teszt (26. pont bizonyítékai) | a dry-run kód él, de nem őrzött |
| G-09 | F-308 cache-maszkolás és F-309 kilépés-figyelmeztetés: nincs saját teszt; a 24. pont tiltólistája (CNP, VIN, OCR-nyers, fotó a cache-ben) nincs auditálva | |
| G-10 | F-408 Audatex import validáció: nincs teszt | |
| G-11 | rpw-bootstrap.js: a modul kész és tesztelt, de az OLDALAK még a saját kézi init-jükön futnak | oldalankénti átállás |
| G-12 | Queue hatókör (21. pont): a bejegyzésen nincs tenant_id/employee_id/expires_at mező; kritikus műveletek queue-tiltása (22. pont) csak részben (a workflow offline-tiltása megvan, a trash/restore/purge queue-viselkedése nem őrzött) | |
| G-13 | Rework-rekord (17. pont): a szerveroldali rework van (006), de a felelős/határidő/ellenőrzési-eredmény mezők nincsenek kikényszerítve | |

## Dokumentált, elfogadott kompromisszumok

- Legacy (v2) mentési út: él a cutoverig — az explicit `{ok:false}` már ott
  sem siker, de a teljes `ok===true`-kényszer csak a v3 úton áll.
- A teljes-JOB payload a fázisoldalakon: a db-réteg secure módban kiszűri a
  védett mezőket, de a payload MÉRETE nem csökkent — a valódi slice-mentésre
  átállás oldalanként külön munka.
- A 7 fázisoldal valódi-katt tesztje SERVER_TRANSITIONS=true módban fut —
  a mai éles (lokális) mód viselkedését a régi test-fe-transition.js fedi.
