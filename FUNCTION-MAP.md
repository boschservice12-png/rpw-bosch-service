# FUNCTION-MAP — az RPW elsődleges üzleti lánca és a funkciók helye

> Gépi státuszokkal együtt a teljes térkép a `FUNKCIOK.md` / `FUNKCIOK.pdf`
> (mindkettőt gép írja: `npm run funkciok`). Ez a fájl a LÁNCOT magyarázza.

## Az elsődleges üzleti lánc

```
Belépés            F-016 (rpw2_login) → F-002 (rpw2_session)
  │
Jogosultság        F-009 (rpw2_can) · a jogok minden RPC-ben a tokenből
  │
Munkalap létrehozása   F-101 (ablak) → F-120 (rpw_job_create: szám,
  │                    kezdő állapot, tenant, actor, audit a SZERVEREN)
  │
Normál adatmentés  F-107 (rpw_patch_v3, slice, verziózár)
  │                F-109 (védett mezők szűrése) · F-110 ({ok:false}≠siker)
  │                F-108 (konfliktus) · F-301..304 (offline sor, szinkron)
  │
Dokumentumkövetelmények  F-204/205 (dosszié, feltöltés) → F-112
  │                      (rpw_requirements/rpw__missing — EGY szabályforrás)
  │
7 javítási fázis   F-401 Recepció → F-402 Evaluare → F-403 Reconstatare
  │                → F-404 Tinichigerie → F-405 Vopsitorie → F-406 Control
  │                minden kritikus művelet: F-111 (rpw_transition)
  │
Rework             F-111 rework_open / rework_close ágai — nyitott rework
  │                mellett a szerver nem enged lezárást
  │
Végellenőrzés      F-406 (Control) — checklist nélkül a gomb sem él
  │
Lezárás            F-407 (Închidere) + F-113 (rpw_can_complete — ugyanaz a
  │                rpw__missing, amit a transition kényszerít)
  │
Export és audit    F-409 (dosszié-export ZIP) · rpw_audit minden
                   szerveroldali műveletnél
```

## Egy szabályforrás elve

A lezárhatóságot NEM két helyen definiáljuk:
- `rpw__missing()` (003) — a szabály;
- `rpw_transition` (006) — kényszeríti;
- `rpw_can_complete` (003) — CSAK előnézetet ad ugyanabból;
- a kliens `loadServerMissing` (F-112) — CSAK megjelenít.

## Mellékláncok

- **Kommunikáció (8):** F-212 feltöltési link · F-410 WhatsApp · F-411 e-mail —
  közös eseménymodelljük MÉG NINCS (lásd FUNCTION-GAPS).
- **Admin (9):** F-501..503 takarítás (dry run → audit → purge) · F-114..116 kuka.
- **Infrastruktúra (10):** F-901..903 capability fail-closed · F-904 config ·
  F-905 deploy-zár · F-907 közös bootstrap.
