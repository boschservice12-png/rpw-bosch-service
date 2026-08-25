# STATE-TRANSITION-MATRIX — állapotgépek és megengedett átmenetek

## 1. ÜGY-dimenziók (a `job` mezőin, categorizeJob 1096 az egyetlen döntési lánc)

### sosire (érkezés)
| honnan → hova | művelet | kapu | audit ma |
|---|---|---|---|
| programat → sosit | deschideLucrare / Lucrare nouă | conditions.whatsapp (CÉL K-4: „utolsó egyeztetés") | legacy: nincs |
| programat → ratat | markRatat | MA SEMMI (CÉL K-3: csak elmúlt időpontnál + audit) | nincs |
| ratat → programat | reactiveaza / saveRepro | — | legacy: nincs |
| sosit → (vissza) | NINCS ÚT — helyes: az érkezés nem vonható vissza a panelről | | |

### flux
| honnan → hova | művelet | kapu |
|---|---|---|
| doar_dosar → reparatie | dosarToReparatie („Adaugă reparație") | megerősítés; szerver `start` (E-13: nem atomi) |
| reparatie → doar_dosar | NINCS ÚT — helyes | |

### dosszié-életciklus (doar_dosar, _st 340)
| állapot | belépés | kilépés | kapu |
|---|---|---|---|
| 1 Colectare acte | Avizare daună | dosarPredat() | megerősítés (K-10: + figyelmeztetés a határidőkről) |
| 2 Predat | ← | dosarInchide() | **CÉL K-9: saját szabály — minden kötelező irat + Predat** (ma: phase-7 szabály — E-12!) |
| 3 Închis | ← | dosarInapoi() | reopen: override + indok (szerver) |
| (új) Separat | K-25: lezárás után automatikus teljes-ZIP a storage-ba; a SIKER állítja | — | storage-írás megerősítve |

### biztosítós javítás státusz-kijelzése (K-19)
| dosarStatus | kijelzés a Viitoare soron |
|---|---|
| deschid | „Avizare daună" |
| deschis | „Dosar deschis" |

## 2. MUNKA-dimenzió: phases 1..7 (SZERVER: 006 rpw_transition)

| művelet | kapu a szerveren | tiltás |
|---|---|---|
| start | capability (fázisonként: open/reception/work/close), sorrend | átugrás tilos |
| complete | rpw__missing követelmények + nincs nyitott rework + verziózár | hiánynál deny+lista |
| skip | kötelező indok (min. 5) | |
| reopen | override jog + indok | |
| rework_open / rework_close | leírás/azonosító; K-24: határidő NEM kell | nyitott rework mellett nincs complete ph6/ph7 |

Fázis-státuszok: pending → active → done / skipped; rework a cél-fázist újranyitja.
A kliens-oldali tükör (rpw-workflow.js) azonos szabályokat számol ELŐNÉZETNEK —
a döntés secure módban mindig a szerveré (PRODUCTION-ban lokális fallback TILOS).

## 3. Zsákutca-ellenőrzés

- Minden állapotból van kivezető út VAGY szándékolt végállapot (Separat).
- Ratat ↔ programat oda-vissza él; arhivate-ból reopen övverride-dal.
- Ismert rés: E-13 (flux-váltás két írás), E-12 (doar_dosar lezárási szabálya) —
  mindkettő a backlog P0-részében.
