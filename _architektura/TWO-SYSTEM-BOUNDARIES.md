# TWO-SYSTEM-BOUNDARIES — a két rendszer határa (K-1/B döntés szerint)

A tulajdonos döntése (K-1: **B**): NINCS külön Case-tábla. Egy `rpw_jobs.data`
objektum él, de a mezői KÉT VÉDETT CSOPORTRA válnak, külön jogosultsággal és
külön mentési úttal. A határ tehát nem tábla-határ, hanem **mezőcsoport- és
jogosultság-határ** — ezt a 006-os migráció mezőszintű jogosultság-táblája
(`rpw_patch_permissions`) már ma is tudja hordozni.

## A. ÜGYKEZELÉSI mezőcsoport (Reception/Office jog: `open`/`reception`)

```
client, phone, proprietar, note              — ügyfél
plate, vin, brand, year, capacitate, auto    — jármű
damageType, asigurator, nrDosar, dosarStatus — biztosító/kár
dosarActe{}, dosarPredat, dosarInchisLa      — iratok + ügy-életciklus
programare{date,time,istoric,reprogramari}   — időpont
conditions{}                                 — fogadási feltételek (K-4: az
                                               5. = "utolsó egyeztetés")
flux ('doar_dosar'|'reparatie')              — az ÁTADÁS kapcsolója
separat                                      — archivált (K-25: a storage-mentés
                                               SIKERE állítja, nem kéz)
```

## B. MUNKAVÉGZÉSI mezőcsoport (Production/Quality jog: `work`/`close`)

```
phase, phases{}, inchis, rework[]            — workflow (KIZÁRÓLAG rpw_transition)
evalData{}, comanda, termenPredare, audatex  — kalkuláció (evaluare)
bodyRows, paintRows, production{}            — termelési sorok + Elvégezte (K-20:
                                               bejelentkezett név)
bodyApproval{}                               — pótmunka-jóváhagyás (K-21: ki+mikor)
controlChecks{}, control{}                   — végellenőrzés
closing{}, closingPhotos                     — lezárás-csomag
reconst{}, reconstPhotos                     — rejtett kár / pótszemle
photos, photoKeys, photoUrls, docs, elements — átvételi állapotfelmérés
```

## Tiltott irányok (a spec kötelező szabálya, a kódra vetítve)

| szabály | mai állapot | cél |
|---|---|---|
| Az ügykezelés nem módosít munkafázist | a főablak nem ír phase-t (helyes); secure módban a szerver is tiltja | marad + a v3/006 kényszer élesítése |
| A munkavégzés nem módosít ügy-állapotot ellenőrizetlenül | a fázisoldalak teljes-JOB mentése MA átírhat ügy-mezőt is | a mezőcsoport-jogosultság (rpw_patch_permissions) élesítése: `work` jog nem írhat A-csoportot |
| Kommunikáció csak definiált átadási eseményeken | részben (lásd CASE-TO-WORK-HANDOFFS.md) | az 5 hiányzó esemény pótlása |
