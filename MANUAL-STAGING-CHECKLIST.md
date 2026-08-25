# MANUAL-STAGING-CHECKLIST.md

Amit **gép nem tud** ellenőrizni. Ezeket valódi környezetben, kézzel kell végigmenni.

Amíg ez nincs kitöltve, a tesztfuttató `Staging: NOT VERIFIED` állapotot jelent — és ez így helyes.

---

## Mielőtt elkezded

- [ ] A migrációk **staging** adatbázison futottak le (nem az élesen)
- [ ] Adatbázis-mentés készült
- [ ] `cp rpw-config.js rpw-config.js.bak`
- [ ] `npm ci && npm test` → unit és integrációs zöld

---

## 1. Belépés

- [ ] A `rpw-login.html` betölti a névsort (PIN nélkül)
- [ ] Helyes PIN-nel be lehet lépni
- [ ] Rossz PIN 10× → **15 perc zárolás**, román üzenettel
- [ ] Belépés után a saját név jelenik meg, nem „service"
- [ ] Belépés nélkül egyetlen belső oldal sem érhető el *(próbáld közvetlen URL-lel)*

## 2. Munka a dossziékkal

- [ ] Munka megnyitása, mentés, fázisváltás
- [ ] A munkaszám **atomi számlálóból** jön (két gépről egyszerre nyitva ne adjon azonosat)
- [ ] Kosárba tétel → visszaállítás → végleges törlés
- [ ] Technikus jogosultsággal **nem** lehet fázist lezárni

## 3. Ütközés — KÉT BÖNGÉSZŐBŐL

Ez a legfontosabb kézi teszt.

- [ ] Nyisd meg **ugyanazt** a munkát két böngészőben
- [ ] Mentsd az elsőben → sikerül
- [ ] Mentsd a másodikban **ugyanazzal a verzióval** → `version_conflict`
- [ ] Megjelenik a konfliktus-párbeszéd, **románul**
- [ ] Három lehetőség: újratöltés / újraalkalmazás / maradok
- [ ] **A helyi módosítás NEM veszett el**
- [ ] Fázislezárásnál külön figyelmeztetés: nincs automatikus összefésülés

## 4. Üzleti kapuk

- [ ] Talon nélkül az 1. fázis **nem zárható**, és megnevezi a hiányt románul
- [ ] Talon feltöltése után lezárható
- [ ] Nyitott rework mellett a munka **nem zárható le**
- [ ] Skip **indoklás nélkül** elutasítva
- [ ] Lezárt dossziét technikus **nem** nyithat újra, manager igen

**Közvetlen RPC-hívással is:** a Supabase felületén próbáld meg a `rpw_transition`-t hiányos dossziéra — **el kell utasítania**.

## 5. Bérlőizoláció — ha van második szerviz

- [ ] Szerviz A **nem látja** Szerviz B munkáit
- [ ] Idegen azonosítóra `not_found` — a létezés sem derül ki
- [ ] Szerviz A **nem tud** signed URL-t kérni Szerviz B fájljához

⚠ *Ez a pont az integrációs tesztekben már bizonyított — itt csak a valódi Supabase-en erősítjük meg.*

## 6. Fotók és dokumentumok

- [ ] Fotó feltöltése, megjelenítése (signed URL)
- [ ] A signed URL **rövid lejáratú** — várj ki, próbáld újra: le kell járnia
- [ ] A `job` JSON csak **path**-ot tárol, nem publikus URL-t
- [ ] Publikus URL-lel a fájl **nem érhető el** *(másold ki, próbáld inkognitóban)*

## 7. OCR és e-mail

- [ ] OCR egy valódi talonra → értelmes eredmény
- [ ] Az AI eredménye **megerősítést kér** (VIN, CNP, összegek jelölve)
- [ ] Az AI eredménye **nem vált fázist** magától
- [ ] Hibás fájl (pl. .txt átnevezve) → **415**, román üzenet
- [ ] Token nélkül az OCR **nem hívja** az AI-t *(fejlesztői eszközökből próbáld)*
- [ ] E-mail küldés működik, a címzett validálva

## 8. Kijelentkezés és gyorsítótár

- [ ] Kijelentkezés után a `localStorage` **üres** *(nézd meg fejlesztői eszközzel)*
- [ ] Nincs benne ügyfélnév, telefon, alvázszám, fotó
- [ ] A rendszám csak **maszkolva** (`MS-…-ABC`)
- [ ] Közös gépen a következő belépő **nem látja** az előző adatait
- [ ] Lejárt munkamenet ugyanígy törli

## 9. Offline / online

- [ ] Kapcsold ki a hálózatot menet közben → „Offline" jelzés
- [ ] Vissza online → a mentés **magától lefut**
- [ ] Az offline sorban **nincs** érzékeny adat

## 10. CSP

- [ ] Kapcsold be a **report-only** fejlécet stagingen
- [ ] 1-2 hét után nézd meg, mely inline scriptek sértenék
- [ ] Csak ezután szigoríts az éles fejlécen

⚠ **Ellenőrzés nélkül ne kapcsold be a szigorú CSP-t** — megbénítaná az alkalmazást.

## 10b. V4 — a workflow-védelem élesben

- [ ] Fázis lezárása a gombbal → **működik**
- [ ] A Supabase felületén próbálj közvetlen patch-et:
      `select rpw_patch_v3('<token>','<job>','{"inchis":true}'::jsonb, <ver>, null)`
      → elvárt: `protected_workflow_field`, román üzenettel
- [ ] Technikussal próbálj ügyféladatot menteni → `not_allowed`, `need:reception`
- [ ] Technikussal próbálj kosárba tenni → `not_allowed`, `need:delete`
- [ ] Skip indoklás nélkül → elutasítva; 5+ karakterrel → működik
- [ ] Rework megnyitása és lezárása azonosítóval
- [ ] A dosszié lezárása a `Dosar` lapon → a 7. fázis zárul le
- [ ] Lezárt dosszié újranyitása → indoklást kér, override jogot ellenőriz
- [ ] Kapcsold ki a hálózatot lezárás közben → **nem** mutatja lezártnak

## 10c. V4 — fail-closed capability

- [ ] `PRODUCTION:true` mellett állítsd le a Supabase-t → az alkalmazás **megáll**,
      román üzenettel („Nu se poate verifica versiunea serverului")
- [ ] Az adatbetöltés **nem** indul el a capability-ellenőrzés előtt

## 11. Terhelés

- [ ] 10-20 dolgozó egyidejűleg *(vagy szimulált)*
- [ ] A munkaszám nem duplikálódik
- [ ] Nincs csendes felülírás

## 12. Verzióütközés kliens ↔ szerver

- [ ] Régi kliens + új szerver → az alkalmazás **megáll**, román üzenettel
- [ ] `rpw_server_capabilities` a helyes séma-verziót adja

---

## Ha minden pipa

Hozd létre a `STAGING-VERIFIED.json` fájlt:

```json
{
  "verified": true,
  "by": "Szkaliczki Ferenc",
  "date": "2026-__-__",
  "note": "MANUAL-STAGING-CHECKLIST végigjárva stagingen"
}
```

Ettől a tesztfuttató `Staging: VERIFIED` állapotot jelent.

⚠ **Ne hozd létre, ha nem járta végig valaki.** Ez a fájl az egyetlen dolog, ami a rendszer szerint bizonyítja a kézi ellenőrzést — hamis tartalommal az egész jelentés hazuggá válik.
