# CONTROL-CENTER-WORKFLOW — „Centru de Control Operațional" (L1) teljes vezérlő- és navigációs térkép

> **Vizsgált forrás:** `feat/funkciok-v2-konszolidacio` ág (2026-08-25), `index.html` 3100+ sor.
> **Eltérés az élestől:** az élesen (main) az „Avizare daună" még a régi kétgombos+űrlapos úton
> megy (PR #5 nyitva); minden más vezérlő azonos. Minden sor-hivatkozás az `index.html`-re mutat.
> **Módszer:** kizárólag a tényleges kód alapján; egyetlen funkció sem lett „működőnek" minősítve
> csak azért, mert gomb látszik hozzá.

## 0. A főablak helye a két rendszerben

A főablak ma **egyetlen `job` objektumon** dolgozik, amely EGYSZERRE ügy (dosar) és munkalap
(lucrare) — a szétválasztást a `flux` mező közelíti (`doar_dosar` = csak ügy, `reparatie` = munka).
A spec A/B határa (ügy ≠ munkalap, 1 ügy : N munkalap) a mai adatmodellben **nem létezik** —
ez a legnagyobb szerkezeti ütközés (lásd E-1).

```mermaid
flowchart LR
  subgraph L1["L1 · Centru de Control (index.html · renderPanou 1153)"]
    AZ["Ce facem azi?"] ; PN["Programare nouă"] ; AV["Avizare daună"] ; LN["Lucrare nouă"]
    TABS["4 fül: Viitoare · Ratate · Arhivate · Separat"]
  end
  AZ -->|azGo| ROW
  PN -->|openNewJob('prog')| FORM["Új-munka űrlap (newJobModalHtml 1567)"]
  AV -->|openDosarModal→dosarTarziu| L2["rpw-dosar.html (ügyadatlap)"]
  LN -->|openNewJob('lucrare')| FORM
  FORM -->|submitNewJob 1953| L2R["rpw-recepcio-red.html (lucrare)"]
  FORM -->|prog| TABS
  TABS --> ROW["sor-műveletek"]
  ROW -->|deschideDosar| L2
  ROW -->|deschideLucrare| TABS
  ROW -->|oP| L2
```

---

## 1. FELSŐ GOMBOK

### 1.1 „Ce facem azi?" — `azOpen()` (2447)

| kérdés | válasz (bizonyítékkal) |
|---|---|
| Mit lát a felhasználó? | Fekete gomb a fejlécen (1187); overlay-modal 6 szekcióval |
| Üzleti cél | A nap operatív feladatlistája: ki jön, ki késik, mit kell ellenőrizni |
| Szerepkör | **Nincs korlátozva** — bárki megnyithatja |
| Indítás | Kattintás VAGY naponta egyszer automatikusan (`azMaybeAuto` 2526, `rpw_az_seen` localStorage) |
| Olvasott adat | A teljes `JOBS` tömb, memóriából (2391–2400): **SOS** ma+holnap érkezők; **RST** késettek (`programare.date < ma`) + ratat-ok; **CHK** 24 órás ellenőrzőpont (`azCheckList`); **ATL** műhelyben lévők (`categorizeJob==='lucrari'`); **DOS** dossziék; **VER** hiányos adatú munkák |
| Módosított adat | Közvetlenül semmi; az akciógombok más funkciókra delegálnak (`azGo` 2523: `deschideLucrare`, `openCondModal`, `openRepro`, `azOpenCheck`, `oP`, `deschideDosar`, `openEditJob`) |
| Alrendszer | **VEGYES** — ügykezelési (SOS/RST/DOS/VER) és munkavégzési (ATL/CHK) elemek egy nézetben. Ez a spec szerinti közös irányítóközpont-szerep **helyes** megközelítése |
| Jogosultság / validáció | Nincs — megjelenítés |
| Siker / hiba | A delegált művelet dönt; az `azGo` `try{}catch(e){}`-be nyeli a hibát → **egy elgépelt függvénynév némán semmit sem csinálna** |
| Következő ablak / vissza | A delegált művelet szerint; `azClose` visszatér a panou-ra |
| Audit | Nincs (megjelenítés) |
| **Bekötöttség** | **MŰKÖDIK** — de a CHK (24 órás ellenőrzőpont, `azOpenCheck` 2534) válaszai `saveJob`-bal, legacy úton mennek |

### 1.2 „Programare nouă" — `openNewJob('prog')` (1187 → 1779)

| kérdés | válasz |
|---|---|
| Üzleti cél | Előjegyzés: az autó KÉSŐBB jön; ügyféladat + típus + dátum rögzítése |
| Szerepkör | Nincs kliens-korlát. Secure módban a szerver `open` jogot kér (`rpw_job_create`, 008) — **legacy (mai éles) módban BÁRKI, jog-ellenőrzés nélkül** |
| Kötelező adat | `njMissing()` (1835): rendszám (`njOkPlate`), telefon, típus (`m_m_tip`); asig-típusnál: dosszié-állapot, ügyfélnév, „már nyitott"-nál kárszám; dátum |
| Duplikátum-védelem | `njDup()` (1877): azonos rendszám+biztosító+kárszám → **blokkol**; más eset ugyanarra az autóra → tájékoztat (1890–1905) |
| Végrehajtás | `submitNewJob` (1953): job-objektum építése (`flux:'reparatie'`, `sosire:'programat'`, `phase:1`, phases pending) → secure: `njServerCreate`→`rpw_job_create` (szám+állapot a szerveren, audit); legacy: `njNextNumber`+`saveJob` |
| Siker | Toast + Viitoare fülre vált; **nem navigál el** |
| Hiba | Hiánylista-toast; secure elutasításnál fail-closed (nincs helyi mentés) |
| Audit | Secure: `rpw_audit` 'create' sor. **Legacy: nincs auditsor** |
| **Bekötöttség** | **MŰKÖDIK** (a prog+asig adatvesztés 2026-08-25-én javítva — előtte HIBÁS volt) |

### 1.3 „Avizare daună" — `openDosarModal()` (1187 → 2012)

| kérdés | válasz |
|---|---|
| Mit lát? | Kék modal, 2 út: **Deschide dosar daună** (`dosarTarziu` 2020) · **Preluare dosar daună** (`dosarFisier` 2063, fájl→OCR) |
| Üzleti cél | Kárbejelentés-ügy indítása munkavégzés nélkül (`flux:'doar_dosar'`) — ez a spec A-rendszerének belépési pontja |
| Deschide-út | Üres ügy létrehozása (plate='', client=''), `dosarStatus:'deschid'`, majd **azonnal** `rpw-dosar.html` (az adatokat OTT töltik ki); duplikátum-figyelmeztetés a dosszié-lapon (`dosarDupCheck`) |
| Preluare-út | Fájl → `/.netlify/functions/ocr` → kinyert rendszám/kárszám/biztosító → job → dosszié-lap. **ÉLESBEN NEM MŰKÖDHET: nincs `ANTHROPIC_API_KEY` a Netlify-on** (G-05) — a gomb él, a mögöttes szolgáltatás nem |
| Jogosultság | Kliens-oldalt nincs; secure módban `open` jog a szerveren |
| Audit | Secure: create-audit; legacy: nincs |
| **Bekötöttség** | Deschide-út: **MŰKÖDIK** (ezen az ágon; élesen még a régi űrlapos út fut — PR #5 döntésre vár). Preluare-út: **RÉSZBEN — a kliens kész, a szerverless függvény kulcs nélkül halott** |

### 1.4 „Lucrare nouă" — `openNewJob('lucrare')` (1187)

| kérdés | válasz |
|---|---|
| Üzleti cél | Az autó **MOST ITT VAN**: azonnali munkafelvétel |
| Kötelező adat | Mint 1.2 + dátum = ma; `sosire:'sosit'`, `phases[1]=active` |
| Siker | **`rpw-recepcio-red.html`-re navigál** (1979) — a munkavégzési rendszer L4 belépője |
| **Bekötöttség** | **MŰKÖDIK** |
| Megjegyzés | Ez az egyetlen főablak-gomb, amely közvetlenül a B-rendszerbe (munkavégzés) lép át — a spec szerint ide később a VEHICLE_ARRIVED átadási esemény kell |

---

## 2. BAL OLDALI MENÜ — `sbNav()` (1019)

| elem | cél | bekötöttség | megjegyzés |
|---|---|---|---|
| Programări (`setScreen('panou')`) | a Centru de Control | MŰKÖDIK | |
| Lucrări (`setScreen('lucrari')`) | műhely-lista: CSAK `categorizeJob==='lucrari'` (1038) + fázis-számlálók + **saját „új munka" gomb és Import ZIP** (1044) | MŰKÖDIK | **DUPLIKÁCIÓ**: második munkalétrehozási belépőpont (D-1) |
| Echipă (`renderEchipa`) | dolgozók/szerepek/PIN admin (rpw2_* RPC-k) | MŰKÖDIK a migrált sémán; **élesben a rpw2_pin_* RPC-k nincsenek fent** (007 nem futott) | |
| Statistici (`renderStatistici`) | kimutatások, chart | MŰKÖDIK (kliens-oldali számítás) | |
| Parametri (`renderParametri`) | paraméterek (`upParam`) | MŰKÖDIK | |
| Curatare → `rpw-cleanup.html` | törlés-admin | csak `isAdmin()` látja (1026) | a gombelrejtés NEM védelem — a szerver-oldali jog a valódi (P0.5 komment 2010) |
| Coș → `rpw-cos.html` | kuka | csak `isAdmin()` | |
| Admin-kapcsoló (`toggleAdmin` 2016) | szerver-szerepből (`rpwCan('team')`); localStorage csak UX-emlék | MŰKÖDIK | |
| RO/HU/EN (`sL`) | nyelvváltás, localStorage | MŰKÖDIK | |

---

## 3. FÜLEK — `setPanouTab` (1193–1196)

| fül | tartalom (bizonyíték) | státusz |
|---|---|---|
| **Lucrări viitoare** | `deAzi = viitoare + dosare` összevonva (1172: „a külön fül megszűnt"), dátum szerint rendezve; késett-figyelmeztető sáv | MŰKÖDIK |
| **Lucrări ratate** | `sosire==='ratat'` | MŰKÖDIK |
| **Arhivate** | `inchis===true` | MŰKÖDIK |
| **Separat** | `job.separat` flag (1100) | MŰKÖDIK, de a flaget kizárólag kézzel lehet állítani a szerkesztő-ablakban — üzleti jelentése tisztázatlan (K-6) |

**E-2 ELLENTMONDÁS — a műhelyben lévő autók (`lucrari` kategória) EGYIK FÜLÖN SEM láthatók.**
A `categorizeJob` (1096) 6 kategóriát ad, a főablak 4 fület mutat; a `lucrari` (megérkezett,
dolgozunk rajta) munkák CSAK a bal-menü „Lucrări" képernyőn és a „Ce facem azi?" ATL-szekciójában
látszanak. A „Centru de Control" így a futó munkákról közvetlenül NEM ad képet — a spec 2. pontja
(elakadt munkák jelzése) csak az azi-modalon keresztül teljesül.

---

## 4. TÁBLÁZAT (1230–1276)

| oszlop | forrás | megjegyzés |
|---|---|---|
| Client | `j.client`/`j.proprietar` + munkaszám | |
| Nr. înmatriculare | `j.plate` (a 📁/📅 jelvény 2026-08-25-én kikerült — Ferenc kérése) | az Avizare-úton létrejött ügy `—` rendszámmal jelenik meg, amíg ki nem töltik |
| Data | `progCell(j)` | dossziénál határidő-számítás (`ddTermene`) |
| Status | nem-dosszié: fázis-pill + 5 feltétel-ikon (programare/loc/om/piese/whatsapp); dosszié: iratszámláló (`acteCount`) vagy „predat/închis" | |
| Contact | 💬 `clickWhatsApp` (2153) | lásd E-4 |
| Acțiuni | soronként, lásd 5. | |

Dupla-katt a soron: `openCondModal` (1241).

---

## 5. SORONKÉNTI MŰVELETEK

| művelet | hívás | mikor látszik | mit módosít | jogosultság | audit | bekötöttség |
|---|---|---|---|---|---|---|
| **Contactează clientul** | `openCondModal(id)` (2207) | ha `!conditions.whatsapp` | a feltétel-modal nyílik; mentése `saveJob` | nincs | legacy: nincs | MŰKÖDIK |
| **💬 (WhatsApp)** | `clickWhatsApp` (2153) | ha van telefonszám | **`conditions.whatsapp=true` + wa.me megnyitás** | nincs | nincs | MŰKÖDIK, de lásd E-4 |
| **Deschide dosarul / 📁** | `deschideDosar(id)` (2012) | dosszié-soron főgomb; munka-soron ikon | semmit — navigál `rpw-dosar.html`-re | nincs | — | MŰKÖDIK |
| **Deschide lucrarea** | `deschideLucrare(id)` (2249) | ha `conditions.whatsapp` | `sosire='sosit'` + mentés + recepcióra visz | nincs | legacy: nincs | MŰKÖDIK, de lásd E-5 |
| **✏ (ceruza)** | `openEditJob(id)` (1799) | viitoare-soron | ügyféladat-javítás; a DÁTUMOT szándékosan nem engedi (1801 komment) | nincs | legacy: nincs | MŰKÖDIK |
| **Reprogramare** | `openRepro`→`saveRepro` (1673/1702) | viitoare | `programare.date/time`, `reprogramari++`, `istoric[]` push | nincs | legacy: nincs | MŰKÖDIK |
| **Ratat** | `markRatat(id)` (2265) | csak NEM-dosszié viitoare-soron | `sosire='ratat'` | **nincs — se jog, se megerősítés, se indok** | nincs | MŰKÖDIK, de lásd E-3 |
| **Reactivează** | `reactiveaza` (2275) | ratate-fülön | nyitott munkán `sosire='programat'`; **zárt munkán `rpw_transition reopen` — override jog + kötelező indok a SZERVEREN** | zártnál: szerver | zártnál: igen | MŰKÖDIK |
| **Edit (arhivate/ratate)** | `oP(id)` (2245) | | navigál a dosszié-lapra | nincs | — | MŰKÖDIK |
| **Törlés** | `dJ(id)` (2303) | arhivate/ratate | `RPWDb.softDelete` (kuka) | **`isAdmin()` kliens-oldalt (2304); szerveren `delete` jog secure módban** | secure: igen | MŰKÖDIK |

---

## 6. MINŐSÍTÉSI ÖSSZESÍTŐ (a 14. kérdés — bekötöttség)

| vezérlő | minősítés |
|---|---|
| Ce facem azi?, Programare nouă, Lucrare nouă, fülek, táblázat, sor-műveletek, bal menü, nyelvváltás | **működik** |
| Avizare daună / Preluare (OCR) | **részben működik** (kliens kész, szerverless kulcs hiányzik) |
| Echipă képernyő PIN-műveletei | **csak frontend az élesen** (007 migráció nincs fent); a migrált sémán működik |
| Minden `rpw_job_create`/`rpw_transition`/v3-út a főablakról | **nincs bekötve élesben** (kapcsolók + migrációk a cutoverig) |
| markRatat / clickWhatsApp / deschideLucrare kapuzása | **hibás vagy ellentmondásos** (E-3, E-4, E-5) |
| „Separat" fül üzleti szerepe | **nem ellenőrizhető** (kód működik, üzleti jelentés tisztázatlan) |

---

## 7. FELTÁRT ELLENTMONDÁSOK (kockázattal)

| # | ellentmondás | hol | üzleti kockázat |
|---|---|---|---|
| **E-1** | Nincs külön Case és WorkOrder objektum: egy `job` = ügy+munkalap; 1 ügy : N munkalap (pótmunka külön lapon) nem lehetséges — a pótmunka ma `rework[]` bejegyzés | teljes adatmodell (`rpw_jobs.data`) | a spec A/B szétválasztása e döntés nélkül nem építhető meg; minden későbbi ablak-terv erre épül |
| **E-2** | A műhelyben lévő (`lucrari`) autók a Centru de Control egyik fülén sem látszanak | renderPanou 1157–1180 | a főablak nem mutatja az elakadt FUTÓ munkát — csak az azi-modal |
| **E-3** | `markRatat`: jog, megerősítés, indok és audit nélkül; a párja (`reactiveaza` zárt munkán) szerver-oldali override-ot és indokot kér | 2265 vs 2275 | egy kattintás ügyfelet minősít le nyom nélkül; aszimmetrikus szabályozás |
| **E-4** | `clickWhatsApp`: a wa.me-link MEGNYITÁSA állítja `whatsapp=true`-ra — az „értesítve" állapot bizonyíték nélkül áll elő, és ez a `deschideLucrare` EGYETLEN kapuja | 2153, 2249 | hamis „kapcsolatfelvétel" → az autó „megérkezhet" valós egyeztetés nélkül |
| **E-5** | `deschideLucrare` kapuja CSAK `whatsapp`; a `loc`/`om`/`piese` feltételek MEGJELENNEK az ikonsorban, de semmit nem kényszerítenek | 2249 | a feltétel-ikonsor a felhasználónak szabályt sugall, amit a rendszer nem tart be |
| **E-6** | A főablak minden írása (`saveJob` 502) legacy módban teljes-JOB patch, jog- és auditsor nélkül; ugyanezek secure módban jogosultak+auditáltak — de a secure mód élesben alszik | 502, rpw-db.js | a mai éles ügymódosítások visszakövethetetlenek |
| **E-7** | `azGo` a hibát némán nyeli (`try{window[fn](id)}catch(e){}`) | 2523 | elgépelt akció = néma zsákutca |
| **E-8** | Két párhuzamos munkalétrehozási belépőpont: panou 3 gombja ÉS a Lucrări-képernyő saját gombja + Import ZIP | 1044 vs 1187 | kétféle úton kétféle validáció-verzió futhat (D-1 duplikáció) |

