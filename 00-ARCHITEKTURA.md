# RPW — architektúra és haladás

*Állapot: 2026-08-23 este · a repóból, ahogy él*

> **Frissítés:** az RPW azóta **önálló rendszer** — saját dolgozó- és
> szerepkör-táblával (`rpw_employees`, `rpw_roles`). A jogosultság
> **kapcsolókból** jön, nem a szerepkör nevéből. Részletek: `_db/00-ADATBAZIS.md`.

---

## A rendszer egy mondatban

Karosszéria-műhely munkakövetése: **egy autó → esetenként egy dosszié → vezérelt életciklus**, biztosítói határidőkkel és mért munkaidővel.

---

## Rétegek

```
┌─ FELÜLET ────────────────────────────────────────────┐
│  index.html          Programări · Lucrări · Echipă   │
│                      Statistici · Parametri · Coș    │
│  rpw-login.html      név + PIN                        │
│  rpw-dosar.html      kárdosszié + iratok + ZIP        │
│  rpw-*-red.html      a 7 fázis oldalai                │
├─ LOGIKA ─────────────────────────────────────────────┤
│  rpw-workflow.js     EGYETLEN igazságforrás:          │
│                      fázisszabályok · munkaidő-mérés  │
│                      · kabalás párbeszédek            │
│  rpw-config.js       feliratok, doksilisták, SHOP_ID  │
│  rpw-auth.js         munkamenet, actor                │
│  rpw-db.js           bérlő-szűrés, mentés             │
│  rpw-queue.js        offline sor                      │
├─ SZERVER ────────────────────────────────────────────┤
│  Supabase RPC        login · session · posts · patch  │
│  Netlify functions   ocr · classify · sendmail        │
└──────────────────────────────────────────────────────┘
```

**Keretrendszer nélkül.** Nincs build, nincs npm — a böngésző közvetlenül futtatja.

---

## Az adatmodell magva

Egy munka **egyetlen JSONB objektum**. A kulcsmezők:

| Mező | Értékek | Mit dönt el |
|---|---|---|
| `sosire` | `programat` · `sosit` · `ratat` | itt van-e az autó |
| `flux` | `reparatie` · `doar_dosar` | javítunk vagy csak ügyintézünk |
| `inchis` | bool | lezárva |
| `phase` | **1–7, soha nem 0** | hol tart a javítás |
| `damageType` | `asig` · `null` | biztosítós vagy saját zseb |
| `dosarStatus` | `deschid` · `deschis` | mi nyitjuk vagy már nyitva |

**Ez a három mező — `sosire` + `flux` + `inchis` — az egyetlen igazság.** A régi `programare.status` már csak tükör, egy kiadásnyi biztonsági hálóként.

### Miért fontos

Korábban **két állapotgép** futott ugyanazon az objektumon, és háromszor termelte újra ugyanazt a hibát. Az egyesítés után a `categorizeJob()` egyetlen determinisztikus lánc.

---

## Az eset, nem az autó

> Egy autónak lehet **egyszerre** Groupama-kára, Allianz-kára és saját zsebes javítása. Három párhuzamos eset, három dosszié — szabályos.

Az eset azonossága: **biztosító + kárszám**. Saját zsebnél: egyszerre egy.
Duplikátum csak akkor van, ha **ugyanaz az eset** szerepel kétszer — az blokkol.

---

## A munkaidő-mérés

```
T0 = a Tinichigerie fázis indulása
T1 = a Control fázis lezárása
munkanap = H–P  (szombaton nincs munka)

várható nap = (lakatos óra + fényezés óra) / 4      [4 műhelyóra / nap]
GAP = tényleges − várható
```

**A naptár nem mérőszám** — alkatrészre várunk, esik, foglalt a kabin. Ezért a GAP-nál a rendszer **nem vádol, hanem kérdez**, hat okkal:
`piese` · `asigurator` · `capacitate` · `vreme` · `garantie` · **`fara_motiv`**

Az utolsó az egyetlen, ami **a saját folyamatunkra** mutat. Az okok naplózódnak (`gapLog`), több is lehet egy munkán.

**Deviz nélkül nincs ítélet** — a `gap` `null` marad. Inkább semmit, mint hamis számot.

---

## Biztosítói határidők

Az átadástól (`dosarPredat`) futnak:
- **constatare: 3 munkanap**
- **ofertă: 30 naptári nap**

A 10 napos fizetési határidőt **szándékosan nem** számoljuk — az az ajánlat elfogadásától fut, azt a rendszer nem ismeri.

---

## Vezérlés — `Ce facem azi`

Naponta egyszer magától megnyílik. **Nem lista: rangsor.**

| Kód | Sáv |
|---|---|
| `SOS` | ma érkezők |
| `RST` | lejárt / elakadt |
| `CHK` | 24 órás ellenőrzőpont |
| `ATL` | a műhelyben, fázissávval és GAP-pel |
| `DOS` | dossziék határidővel |
| `VER` | hiányzó adatok |

A **`CHK`** csak azt kérdezi, amit nem lát: ha az értékelés elfogadott, a reconstatare elküldve és az alkatrész rendelve, **egyetlen kérdés marad — az órák.**

---

## Poka-yoke — ami nem engedi a hibát

| | |
|---|---|
| hiányzó adat | nem menthető |
| ugyanaz az eset kétszer | blokkol |
| WhatsApp nélkül recepció | nem indul |
| fázis lezárása követelmény nélkül | nem megy |
| programált munka törlése | tiltva |
| munkaszám | szerveroldali atomi számláló |
| **`Ratat` gomb a dosszién** | **nincs ott** |

Az utolsó a legerősebb minta: **nem figyelmeztetünk, hanem elvesszük a rossz lehetőséget.** A figyelmeztetést át lehet kattintani.

---

## Több-bérlős állapot

- `rpw_jobs.shop_id` **kötelező**, index, alapérték
- minden olvasás/törlés a saját `shop_id`-ra szűr (`rpw-db.js scoped()`)
- a belépés a `shop_id`-t a tokenből hozza

**⚠ Ez ma kliensoldali szűrés.** Az `rpw_patch_v2` `SECURITY DEFINER` és nem ellenőrzi a bérlőt — aki ismeri az anon kulcsot és egy munkaazonosítót, más cég munkáját is módosíthatja. **Egy bérlőnél elméleti, a másodiknál azonnal valódi.**

---

## Bejelentkezés

**Név + PIN**, a meglévő Red ERP bcrypt hash-ekkel. Nincs külön user-rendszer.
12 órás munkamenet, használatra hosszabbodik. A nyers tokent nem tároljuk.
10 rossz PIN → 15 perc zár.

**`actor` = a bejelentkezett ember neve** — egyetlen ponton, a DB-rétegben terelve. Bejelentkezés nélkül marad a régi `service`.

**`AUTH_REQUIRED` még `false`** — a belépés működik, de nem kötelező.

---

## Tesztlefedettség

**24 tesztsorozat, ~657 állítás.** Nem a leszállított másolatokon futnak, hanem azon, amit a szerver kiszolgál.

A legfontosabb: **`_tests/test-acceptance.js`** — valódi DOM-ban végrehajtja az összes funkciót, nem regexet keres.

```
npm i jsdom && node _tests/test-acceptance.js
```

---

## Ami nyitva van

| # | Mit | Miért számít |
|---|---|---|
| 1 | **RPC-szintű bérlő-zár + RLS** | a második cégnél azonnal kell |
| 2 | `AUTH_REQUIRED` bekapcsolása | előbb mindenkinek PIN kell |
| 3 | **`audatex` OCR bekötése** | ma kézzel viszed be az órákat |
| 4 | ~~`classify` bekötése~~ | ✅ **kész (2026-08-25)** — kötegelt feltöltés a dosszién, AI-javaslattal |
| 5 | `constatare` prompt bővítése | a vétkes adatai a lapról, nem külön fotókból |
| 6 | GAP-statisztika | a `gapLog` gyűlik, senki nem összegzi |
| 7 | Pótmunka saját zsebes javításnál | a `Reconstatare` ki van kapcsolva `auto` típusnál |
| 8 | Szerepkörök románul | a Red ERP magyarul adja |

**A 4-es megvan.** A `classify.js` be van kötve: a dosszié 19 rése egyetlen
feltöltéssel tölthető. A besorolás **javaslat** — a rések kitöltése emberi
jóváhagyás után történik (`rpw-classify.js`, `bulkActe`/`bulkConfirm`).

Most a **3-as** (Audatex-OCR) a legnagyobb hátralévő nyereség: ma kézzel
viszed be az órákat.


---

## V4 — a kritikus állapotváltozás útja

Egyetlen tölcsér: **minden fázisváltás** a `commitCriticalTransition`-on megy át.

```
HTML-oldal gombja
  → RPWWorkflow.commitCriticalTransition(JOB, mutate, {action, phase, reason})
      ├── SERVER_TRANSITIONS = false  →  a helyi mutate() fut (fejlesztői mód)
      └── SERVER_TRANSITIONS = true   →  a SZERVER dönt:
            → RPWData.serverTransition()
              → rpw_transition(token, id, phase, action, expected_version, ...)
                  ├── munkamenet + tulajdonjog
                  ├── jogosultság (work / close / override)
                  ├── fázissorrend, nyitott rework
                  ├── üzleti követelmények (rpw_phase_requirements)
                  ├── ATOMI verziózár
                  └── audit
            → siker:      a szerver állapota + verziója átvéve
            → elutasítás: a helyi állapot VÁLTOZATLAN
```

A normál adatmentés külön úton megy (`rpw_patch_v3`), és a **006 óta nem
érintheti** a workflow-mezőket — ha mégis próbálná, `protected_workflow_field`.
