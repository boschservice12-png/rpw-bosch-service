# RPW-004 — Átállás Symfony-ra

*Állapot: 2026-11-21 · 1. lépés kész (backend-mag) · a műhely a régi rendszeren dolgozik tovább*

---

## 1. Összefoglaló

Az RPW **fokozatosan** áll át egy Symfony 7.4 LTS backendre. A folyamatok logikája
**nem változik**: ugyanaz a 7 fázis, ugyanazok a hibakódok, ugyanaz az adatszerkezet.
Három dolog változik:

1. **Egy szabályforrás, a szerveren.** Eddig a gazdag fázisszabályok a böngészőben
   (`rpw-workflow.js`) éltek, a szerveren egy szegényebb tábla
   (REMAINING-RISKS 5. pont). Most a gazdag halmaz fut a szerveren, és a kliens
   ugyanezt kapja vissza.
2. **A bérlő-zár a szerveren.** Eddig kliensoldali szűrés volt (ARCHITEKTURA,
   „Több-bérlős állapot” ⚠). Most minden lekérdezés a tokenből jövő `shop_id`-ra szűr.
3. **Tesztelhető, hordozható mag.** A domain tiszta PHP, keretrendszer nélkül;
   PostgreSQL-en és SQLite-on is fut, Supabase-függés nélkül.

**Üzleti következmény:** a második szerviz bevonása többé nem biztonsági kockázat,
a fázisszabály nem kerülhető meg a böngészőből, és a rendszer bármely
PostgreSQL-szolgáltatóra áttehető.

---

## 2. Mi készült el (1. lépés)

| Elem | Állapot | Bizonyíték |
|---|---|---|
| Domain: fázisszabályok (1–7), állapotgép, rework, override | ✅ kész | 31 egységteszt |
| Mentésőr: védett mezők, mezőszintű jogosultság | ✅ kész | egység- és API-teszt |
| Munkaidő-mérés (GAP) + biztosítói határidők | ✅ kész | egységteszt |
| PIN-belépés, munkamenet, 10/15 zár, PIN-minőség | ✅ kész | API-teszt |
| REST API (20 végpont), egységes hibaválasz | ✅ kész | 9 API-teszt |
| Audit: minden mentés + minden elutasítás | ✅ kész | API-teszt |
| Séma-kapu (`rpw:db:check`) | ✅ kész | kézzel kipróbálva, a negatív eset is |

**Mérés, 2026-11-21:** 40 teszt / 182 ellenőrzés, zöld **SQLite-on**, **friss
PostgreSQL 18-on** és a **régi rendszer migrált sémáján** (001–018) is.
Ez utóbbi igazolja, hogy a két rendszer **ugyanazon az adatbázison** futhat.

### Tudatos eltérések a régi viselkedéstől (szigorítások)

| Régen | Most | Miért |
|---|---|---|
| Ismeretlen JSON-mezőt bárki írhatott | `work` jog kell | ne legyen jogosultság nélküli írási út |
| `skip` csak `override` joggal | `work` joggal is, **ha a szerver igazolja**, hogy a fázis üres (4/5) vagy saját zsebes (3) | a lakatos/festő ne akadjon el üres fázison, de ne is hagyhasson ki munkát |
| `reopen` után a későbbi aktív fázis aktív maradt | visszaáll `pending`-re | ne legyen két aktív fázis |
| Elutasítás-napló tranzakción belül | a visszagörgetés **után** íródik | különben elveszne (a tesztek fogták meg) |

---

## 3. Kockázatok és döntési pontok

| # | Kockázat | Súly | Kezelés |
|---|---|---|---|
| 1 | **Az éles séma eltérhet a migrációs fájloktól.** A `_db/05-schema.sql` és a 014-es migráció szerint élesben `rpw_job_counters.last_no` és `rpw_audit.at` van, a fájlokban `n` és `created_at`. | 🔴 | Az éles adatbázishoz **csak** a `rpw:db:check` után csatlakozunk. Eltérésnél egy kiegyenlítő migráció készül (nézet vagy oszlopnév-leképezés), **előbb stagingen**. |
| 2 | Élesben a munkamenet az `app_session` táblában van (010), nem az `rpw_sessions`-ben | 🟠 | Az új backend saját munkamenet-táblát használ. A két rendszer tokenje független, ezért párhuzamos üzemben kétszer kell belépni. Ez elfogadható. |
| 3 | A munkaszám-előtag élesben `MS-26-`, a számláló 86-on áll | 🟠 | Átálláskor a számlálót **át kell vinni, nem nullázni** (014 megjegyzés). |
| 4 | OCR, besorolás, levél, fotótároló még a régi helyen fut | 🟡 | A 3. lépésben kerül át, addig a régi Netlify/Supabase szolgáltatások maradnak. |
| 5 | A felület még nem hívja az új API-t | 🟡 | A 2. lépés adaptere oldalanként kapcsol át, visszakapcsolható módon. |
| 6 | **Hosting nincs eldöntve** | döntés | Javaslat lent (5. pont). |

---

## 4. Ütemterv — fokozatos átállás

```
 1. MAG          ✅  domain + API + tesztek                    (kész)
 2. ADAPTER      ⏳  rpw-db.js / rpw-data.js: BACKEND='symfony' kapcsoló,
                     oldalanként; a régi út visszakapcsolható
 3. SZOLGÁLTATÁS ⏳  ocr · classify · sendmail · fotótároló → Symfony
                     (Messenger háttérfeladat, aláírt fotó-URL)
 4. TELJES KÖR   ⏳  csapat/szerepkör/poszt-admin · „Ce facem azi” rangsor
                     szerveroldalon · GAP-statisztika
 5. ÁTÁLLÁS      ⏳  adatátvitel, számláló átvitele, a régi RPC-k lezárása
```

Minden lépés kapuja: **zöld tesztek + staging-ellenőrzés + visszaút leírva.**

### A 2. lépés belépési feltétele (checklist)

- [ ] `rpw:db:check` **stagingen** (az éles adatbázis másolatán) → `OK`, vagy kiegyenlítő migráció kész
- [ ] staging-szerver fut, HTTPS, `APP_ENV=prod`, saját `APP_SECRET`
- [ ] 1 szerviz, 2 dolgozó belép az új API-n, egy teljes munka végigmegy 1→7
- [ ] két böngésző egyszerre ment → a második `409`-et kap, nem írja felül az elsőt
- [ ] a visszaút (adapter-kapcsoló `supabase`-re) kipróbálva

---

## 5. Hosting — javaslat

| Lehetőség | Havi költség | Mellette | Ellene |
|---|---|---|---|
| **A) VPS + saját PostgreSQL** (pl. Hetzner, EU) | ~10–20 EUR | teljes kontroll, egy szolgáltató, nincs anon kulcs | mentés/frissítés a mi felelősségünk |
| B) VPS + Supabase marad adatbázisnak | VPS + a mai Supabase | a legkisebb átállás, az adat helyben marad | két szolgáltató; a Supabase-poolert *session* módban kell használni (a `FOR UPDATE` és a prepared statement miatt) |

**Javaslat: a B-vel kezdeni, és az 5. lépésben áttérni az A-ra.**
A párhuzamos üzem alatt így nincs adatmásolás, és a kód mindkettőn fut.
A végleges döntés a 2. lépés előtt kell.

---

## 6. KPI-k és kontrollpontok

| KPI | Cél | Mérés |
|---|---|---|
| Tesztek | 100% zöld mindhárom adatbázis-módban | `php vendor/bin/phpunit` |
| Szabály-egyezés | a régi kliens és az új szerver hiánylistája **azonos** valós munkákon | árnyékfuttatás a 2. lépésben |
| Elveszett mentés | 0 | `version_conflict` az auditban ≠ felülírás |
| Naplózatlan elutasítás | 0 | minden `ok:false` → `denied:*` sor |
| Válaszidő | p95 < 300 ms | staging-mérés |
| Visszaút | < 5 perc | adapter-kapcsoló próba |

---

## 7. Következő lépés

1. **Döntés:** hosting (A vagy B, lásd 5. pont).
2. **Staging:** az éles adatbázis másolatán `rpw:db:check` → a séma-eltérés feltérképezése.
3. **2. lépés:** az adapter megírása az első oldalra (javasolt: `rpw-dosar.html` —
   olvasás + mentés, fázisátmenet nélkül; a legkisebb kockázat).
