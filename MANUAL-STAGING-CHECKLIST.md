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

## 1b. PIN-zárolás kezelése *(007)*

Ehhez a `007_pin_lockout_admin.sql` migrációnak le kell futnia. Enélkül a
zárolás-jelző és a feloldó gomb NEM jelenik meg — a kliens nem létező
RPC-t hív, és a hiba csendben elnyelődik.

- [ ] `Echipă → Personal`: a zárolt kolléga mellett **piros** jelző, benne a hátralévő percek
- [ ] 1-9 rossz PIN után **sárga** jelző a próbálkozások számával
- [ ] A **Deblochează** gomb csak zárolásnál / rossz próbálkozásnál látszik
- [ ] Feloldás után a kolléga **azonnal** be tud lépni a jó PIN-jével
- [ ] Technikus (csapat-jog nélkül) belépve **nem** látja a jelzőket, és a
      közvetlen `rpw2_pin_unlock` hívást a szerver elutasítja
- [ ] Évszám (`1969`, `2026`), `1234`, `1111` PIN-t a szerver **elutasít**, román üzenettel
- [ ] Kolléga PIN-jének átvétele → „PIN-ul e deja folosit de un coleg"
- [ ] A **meglévő** PIN-ek változatlanul működnek *(a szigorítás csak új beállításra vonatkozik)*

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
- [ ] `rpw_server_capabilities` a helyes séma-verziót adja (**`007`**)

## 12b. Kötegelt iratfeltöltés *(classify)*

Ehhez `ANTHROPIC_API_KEY` kell a Netlify-környezetben, és **belépett**
felhasználó — a `classify` kötelezően tokent vár.

- [ ] Egy irat feltöltése a résenkénti gombbal **működik** *(ez volt a `toast`-hiba)*
- [ ] A feltöltött irat **×** gombja a HELYES fájlt törli — nem az elsőt
- [ ] „Încarcă toate actele deodată" → több fájl kijelölése után megnyílik a jóváhagyó lista
- [ ] Amíg a lista nyitva van, a dossziéba **semmi nem kerül be** *(ellenőrizd másik böngészőből)*
- [ ] A felismert iratok a helyes résbe vannak előválasztva
- [ ] A felismerhetetlen fájl sora **üresen** marad, indoklással
- [ ] A legördülőben átállított rés **felülírja** a javaslatot
- [ ] „Încarcă N fișiere" után minden fájl a választott résbe kerül
- [ ] Foglalt rés választásakor a sor **előre jelzi** a felülírást
- [ ] Két azonos irat (pl. két személyi) **nem** ugyanabba a résbe kerül
- [ ] `ANTHROPIC_API_KEY` nélkül: a lista megnyílik, minden sor „nem ismerem fel" —
      a kézi választás **továbbra is** működik

## 13. Alkalmi dosszié — a 2026-08-25-i útvonal

- [ ] A panel kék gombja a **dosszié-ablakot** nyitja (nem közvetlenül az új-munka modált)
- [ ] „Auto vine mai târziu" → a harmadik út elérhető gombbal
- [ ] Dosszié mentése után a **dosszié lapjára** visz, a helyes `?job=` azonosítóval
- [ ] Dosszié módban a telefon **opcionális** — üresen is menthető,
      de hibás formátummal nem

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
