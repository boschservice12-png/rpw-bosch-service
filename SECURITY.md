# SECURITY.md

Az RPW biztonsági modellje — **ahogy ma van**, nem ahogy szeretnénk.

**Jelölések:**
`✅ integrációs` = valódi PostgreSQL-en mérve · `🧪 unit` = kliensoldali teszt
`📦 migráció kész, nem futott` · `⏳ staging` = kézi ellenőrzésre vár
`👤 emberi döntés`

---

## Optimista verziózár  ✅ integrációs

**A verziófeltétel MAGÁBAN az UPDATE-ben van:**
```sql
where id = p_id and shop_id = ... and deleted_at is null
  and version = p_expected_version
```
Nem „kiolvas → ellenőriz → ír" — az nem atomi.

Két külön adatbáziskapcsolatról, párhuzamosan, azonos `expected_version`
értékkel: **pontosan egy sikerül**, a másik `version_conflict`-ot kap a
szerver verziószámával. Mérve mentésre és fázislezárásra is.

A `p_expected_version` **kötelező** minden kritikus műveletnél —
hiánynál `expected_version_required`.

## Üzleti kapuk  ✅ integrációs

**Egy szabályforrás:** `rpw_phase_requirements` (14 alapszabály).
A szerver ebből ellenőriz lezárás előtt; a kliens ugyanezt kérheti le
(`rpw_requirements`) UX-előnézethez.

Kötelező dokumentum nélkül **közvetlen RPC-hívással sem** zárható fázis —
mérve. A válasz `requirements_missing` + `missing[]` román üzenetekkel.

## Hitelesítés  ✅ integrációs

**Modell:** saját dolgozói tábla + PIN + munkamenet-token.
A `rpw2_session` a **végleges** munkamenet-RPC. A régi `rpw_session` (Red ERP-alapú) kivezetés alatt.

| | |
|---|---|
| Belépés | név a legördülőből + PIN (`rpw2_login`) |
| Token | 64 hex karakter, **csak SHA-256 lenyomata** tárolódik |
| Élettartam | 12 óra |
| Zárolás | 10 rossz PIN → 15 perc |
| Kiléptetés | PIN törlődik, munkamenetek visszavonva |

**Token tárolása:** `localStorage`. Ez XSS esetén kiolvasható. Enyhítés: az `innerHTML`-utak escape-elve, a lightbox DOM-építésre váltva, a Content-Security-Policy **még nincs** — lásd a maradék kockázatokat.

## Bérlőizoláció  ✅ integrációs

**A `shop_id` a tokenből származik, soha nem a kliensből.**
A `rpw_patch_v3`-nak **nincs** `shop` és `actor` paramétere — mérve.

Két valódi szervizzel (SHOP_A / SHOP_B) igazolva: listázás, megnyitás,
módosítás, kosár, visszaállítás, végleges törlés — mind `not_found`.

Védett műveletek: `rpw_jobs_list`, `rpw_job_get`, `rpw_patch_v3`, `rpw_job_trash/restore/purge`, `rpw_job_number`, `rpw_transition`.

Idegen munka esetén egységesen **`not_found`** — a létezés sem derül ki.

## Szerepkörök

A **név** a szervizé, a **jog** nyolc kapcsolóból: `team`, `posts`, `open`, `reception`, `work`, `close`, `override`, `delete`.
Biztonsági zár: a szerviz nem maradhat csapatkezelő nélkül (`last_manager_lock`).

## RLS  📦 migráció kész, nem futott · ✅ integrációs

Az `005_rls_lockdown.sql` **valódi PostgreSQL-en lefutott**, ellenőrizve:
nincs policy az `rpw_jobs`-on, nincs tábla-szintű jog `anon`-nak, a belső
`rpw__ctx` nem hívható, és az anon `SELECT`/`INSERT`/`DELETE` mind elszáll.

⚠ **Az ÉLES adatbázison NEM futott le.** Amíg nem fut:

- az `rpw_jobs` táblán él az `"anon rw" qual:true` szabály
- aki ismeri az anon kulcsot, **közvetlenül** olvashat és írhat, az RPC-ket megkerülve
- a kliensoldali védelem ezt **nem** akadályozza meg

A migráció készen áll, ellenőrző lekérdezésekkel és rollbackkel.

## Tároló

Öt bucket privát, a `rpw-photos` 12 MB-os korláttal és MIME-szűréssel.
Publikus URL-re **nincs visszaesés** — ha a signed URL nem kérhető, üres string jön.

## Munkamenet és helyi adatok

A `rpw-cache.js` óta:
- minden bejegyzés **szerviz + dolgozó** hatókörű
- **24 órás** élettartam
- kijelentkezéskor **minden törlődik**
- `client`, `phone`, `vin`, `docs`, `photos`, `rework`, `deviz` **soha nem** kerül helyi tárolóba

Korábban a teljes munkaobjektum ment be, TTL nélkül, közös gépen a következő belépő is látta.

## Netlify-funkciók

Mindhárom (`ocr`, `classify`, `sendmail`) `rpw2_session`-t ellenőriz, a külső hívás **előtt**.
Nincs környezeti változós kiskapu. A `jobId`-hoz tulajdonjog-ellenőrzés tartozik.
Az `ocr.js` a formátumot **ellenőrzi** (`detectMedia`), ismeretlent 415-tel utasít el.

---

## ⚠ Ismert maradék kockázatok

| Kockázat | Súly | Állapot |
|---|---|---|
| **`rpw_jobs` anon CRUD nyitva ÉLESBEN** | 🔴 magas | migráció kész, tesztadatbázison lefutott, **élesen nem** |
| **10 dolgozónak nincs PIN-je** | 🔴 blokkoló | emberi döntés — enélkül nincs élesítés |
| Nincs Content-Security-Policy | 🟠 közepes | XSS esetén a token kiolvasható |
| A `rpw-workflow.js` saját szabályai | 🟠 közepes | a szerver dönt; a kliens átállítása a szervertől kapott listára hátravan |
| `rpw_patch`, `rpw_patch_v2` nem ellenőriz bérlőt | 🟠 közepes | a 001 visszavonja a jogukat |
| A token `localStorage`-ban | 🟡 alacsony | `httpOnly` süti csak saját backenddel lenne |
| Nincs jelszó-forgatási kényszer | 🟡 alacsony | a PIN a dolgozó saját döntése |


---

## Szerver-képességek

A kliens induláskor lekérdezi a `rpw_server_capabilities()` függvényt:
séma-verzió, támogatott RPC-k, RLS-állapot, szabálymotor-verzió, tároló-mód.

**Kliens–szerver verzióütközésnél az alkalmazás megáll**, román üzenettel.
Nem elég a kliensoldali flag — a szerver is megmondja, mit tud.

## Production-őr — kilenc feltétel

```
AUTH_REQUIRED · PATCH_RPC=rpw_patch_v3 · SERVER_TRANSITIONS · STORAGE_PRIVATE
RLS_LOCKDOWN_VERIFIED · RPC_CONSISTENCY_VERIFIED · BUSINESS_GATES_SERVER_SIDE
INTEGRATION_TESTS_PASSED · ALL_ACTIVE_EMPLOYEES_HAVE_PIN
```

Bármelyik hiányzik → az alkalmazás **nem indul**. Az utolsó öt neve
szándékosan „VERIFIED"/„PASSED", nem „ENABLED": ezeket **csak ellenőrzés
után** szabad `true`-ra állítani.

---

# V4 — a workflow kikényszerítése

## Védett workflow-mezők  ✅ DB-integrációs

**A `rpw_patch_v3` nem módosíthat workflow-állapotot.** 25 védett minta,
**rekurzív** útellenőrzéssel — a `{"phases":{"7":{"status":"done"}}}` patch
is elakad, `phases.7.status` megnevezésével.

```
phase · phases · phases.* · phases.*.status · phases.*.finished
phases.*.started · phases.*.reopened · phases.*.completedBy
inchis · rework · rework.* · rework.*.status
closing.status · closing.closed · closing.completed
completedBy · finished · started · reopened · skipReason
override · transition · workflowState · history
```

Elutasításkor:
```json
{ "ok": false, "error": "protected_workflow_field",
  "message": "Câmpul de workflow poate fi modificat numai prin tranziția de fază.",
  "fields": ["phases.7.status", "inchis"] }
```

**Mérve** (valódi PostgreSQL, 9 megkerülési kísérlet): közvetlen mező, nested mező,
teljes job-objektum, `null`-lal törlés, tömbre/szövegre váltás — **mind elutasítva**,
és az adat változatlan marad.

## Patch-jogosultsági modell  ✅ DB-integrációs

**Adatvezérelt:** `rpw_patch_permissions` — mezőút → szükséges jog.

| Adattípus | Jog |
|---|---|
| új dosszié | `open` |
| ügyfél- és recepciós adat | `reception` |
| szakmai munkafázis-adat | `work` |
| végellenőrzés, lezárás | `close` |
| felülbírálás | `override` |
| kosár, visszaállítás, törlés | `delete` |
| dolgozók, szerepkörök | `team` |
| posztok | `posts` |

Elutasításkor `not_allowed` + `need` + `fields`, románul. Három tesztszereppel
(MANAGER / RECEPTION / TECHNICIAN) mérve.

## Fázisátmenet  ✅ DB + frontend-integrációs

**Egyetlen RPC:**
```
rpw_transition(p_token, p_id, p_phase, p_action,
               p_expected_version, p_reason, p_rework_id, p_note)
```
`p_action`: `start` · `complete` · `skip` · `reopen` · `rework_open` · `rework_close`

- a `p_expected_version` **kötelező**
- az indoklás **min. 5 érdemi karakter** skip / reopen / rework_open esetén
- a rework lezárása **azonosítót** kér, nem indoklást
- a **7. fázis `complete`-je zárja le a dossziét** — a kliens nem küld `{inchis:true}`-t

## A kliens a szerveren keresztül megy  ✅ frontend-integrációs

A `commitCriticalTransition` az **egyetlen pont**, ahol a kilenc oldal fázist vált.
`SERVER_TRANSITIONS=true` esetén a helyi mutáció **nem fut le**.

| Helyzet | Viselkedés |
|---|---|
| siker | a **szerver** állapotát és verzióját veszi át |
| elutasítás | `phase`/`phases`/`inchis`/`rework` **változatlan**; román üzenet, `missing[]` lista |
| verzióütközés | konfliktus-párbeszéd, **nincs** automatikus felülírás |
| offline | a művelet **nem** hajtódik végre, a fázis nem lesz „done", RPC sem megy |
| hiányzó verzió | `no_version` — null verzióval nem indul átmenet |

## Production-őr — fail-closed  🧪 unit

`PRODUCTION=true` esetén az alkalmazás **megáll**, ha a szerver-képesség
nem ellenőrizhető: hálózati hiba, időtúllépés (8 s), hibás válasz, hiányzó
RPC, régi séma, nyitott RLS, kliensoldali üzleti kapuk, nem privát tároló.

A `verifyServer` az **adatbetöltés előtt** fut mind a 11 oldalon — nincs versenyhelyzet.
