# RPW-003 — A fotótároló lezárása: terv

> Állapot (2026-11-08 este): **kapu élesben, kliens kész, 018 vár az élő igazolásra.** Lásd a 7. pontot.
> Előzmény: RPW-002 (a `rpw_jobs` tábla lezárva, 2026-11-08).

## 1. A mai állapot — mért tények (2026-11-08, csak olvasás)

| | |
|---|---|
| tároló | `rpw-photos` (privát), **3 fájl** (2026-09-06) |
| anon szabályok a `storage.objects`-en | olvasás · feltöltés · módosítás · **törlés** — mind csak `bucket_id='rpw-photos'` feltétellel |
| ami NINCS a feltételben | szerviz, munka, munkamenet |
| anon kulcs | a kiszolgált `rpw-config.js`-ben — bárki megkapja |

**Következmény:** a nyilvános kulccsal bárki listázhatja, letöltheti, felülírhatja és
**törölheti** a kárfotókat és iratokat, az alkalmazás megkerülésével. A tábla (RPW-002) le
van zárva, a képek nem.

**Miért nem elég egy szigorúbb tárolószabály:** a Storage-szabály a Supabase-JWT-t látja.
Az RPW saját munkamenet-tokent használ (`app_session`), a kliens pedig az anon JWT-vel hív —
a szabály így nem tudja, ki a dolgozó és melyik szervizhez tartozik.

## 2. Hol nyúl ma a kliens a tárolóhoz

| fájl | művelet | ki használja |
|---|---|---|
| `rpw-upload.html` | upload | **ügyfél** (WhatsApp-link, PIN nélkül) |
| `rpw-recepcio-red.html` | upload, remove | dolgozó |
| `rpw-evaluare-red.html` | upload, remove | dolgozó |
| `rpw-inchidere-red.html` | upload | dolgozó |
| `rpw-dosar.html` | upload | dolgozó |
| `rpw-data.js`, `rpw-base64-migrate.js` | upload | dolgozó / egyszeri migráció |
| `rpw-photos.js` | createSignedUrl (olvasás), upload | mindenki |

12 hívási pont, 8 fájlban.

## 3. A megoldás — a szerver adja a kulcsot, a kliens soha nem fér a tárolóhoz közvetlenül

```
 kliens ──(munkamenet-token + munka-azonosító)──▶ Netlify function `storage`
                                                   │ 1. requireAuth  (rpw2_session)
                                                   │ 2. ownsJob      (rpw_job_get — a szerviz a tokenből jön)
                                                   │ 3. az útvonal a munka mappáján belül van?
                                                   │ 4. service-kulccsal: aláírt URL
 kliens ◀──────────(időkorlátos aláírt URL)────────┘
 kliens ──(fájl)──▶ Supabase Storage (uploadToSignedUrl — nem kell hozzá anon szabály)
```

| művelet | ki kérheti | ellenőrzés | eredmény |
|---|---|---|---|
| `sign-upload` | dolgozó | token + saját szerviz munkája | egyszer használható feltöltési URL, útvonal: `<jobId>/<kulcs>` |
| `sign-read` | dolgozó | token + minden útvonal a saját munkáján belül | aláírt olvasási URL-ek (1 óra) |
| `remove` | dolgozó, törlési joggal (`rpw2_can`) | token + jog + saját munka | törlés + auditsor |
| `client-sign-upload` | ügyfél | a 009 mintájára: létező, nyitott munka azonosítója | feltöltési URL, **csak** a munka mappájába |
| `client-sign-read` | ügyfél | ugyanaz | **csak** az ügyfél saját feltöltései |

**Ügyfél-oldal — vállalt korlát (azonos a 009-cel):** a hozzáférést a munkaazonosító adja.
Aki kitalál egy létező azonosítót, az adott dosszié feltöltő-nézetét éri el — de már nem
tud törölni, és más munkát nem lát. A teljes megoldás a dossziénkénti feltöltő-token
(külön feladat, RPW-004).

## 4. Sorrend — enélkül a fotózás megáll

```
1. Netlify: SUPABASE_SERVICE_ROLE_KEY környezeti változó   ← FERENC (a kulcs nem kerülhet chatbe, repóba, kliensbe)
2. functions/storage.js + tesztek
3. rpw-photos.js: minden tároló-művelet a függvényen át; a 12 hívási pont erre áll át
4. kitelepítés → ELLENŐRZÉS élesben: recepció-fotó, dosszié-irat, ügyfél-feltöltés telefonról,
   fotó megjelenik, törlés
5. 018 migráció: az 5 anon/authenticated tárolószabály törlése
6. ELLENŐRZÉS: anon kulccsal listázás / letöltés / törlés → elutasítva; a 2–4. pont újra
   Visszaállás: 018_rollback.sql (a szabályok vissza)
```

## 5. Elfogadási feltételek

- anon kulccsal a `rpw-photos` tárolóban **semmi** nem listázható, olvasható, írható, törölhető
- másik szerviz munkájának útvonalára a függvény `403`-at ad, és nem árulja el, létezik-e
- a service-kulcs **csak** a Netlify szerverkörnyezetben van — statikus teszt őrzi, hogy kiszolgált fájlban nem szerepel
- minden sikertelen feltöltés látható és újrapróbálható (nincs üres `catch`)
- a törlés auditsort ír; sikertelen törlés nem ír auditsort
- a teljes gépi tesztkészlet zöld, plusz a 6. pont élő mérése

## 6. Kockázat

| kockázat | kezelés |
|---|---|
| a service-kulcs mindenhez hozzáfér | csak szerveren; a függvény kizárólag aláírt URL-t ad ki, a kulcsot soha |
| a régi, átnevezett Netlify-oldal (`rpw-regi-lezarva-2026-08`) a 018 után nem tud fotózni | szándékos — azon az oldalon nem dolgozunk (Ferenc döntése, 2026-08-29) |
| a Netlify function kiesése → nincs fotózás | a hiba látható, a feltöltés újrapróbálható; a 018 visszavonható |

## 7. Megvalósítás — 2026-11-08

**Eltérés a tervtől:** a kapu **Supabase Edge Function** (`rpw-storage`), nem Netlify-függvény.
Ok: az Edge Function a service-kulcsot a Supabase futtatókörnyezetétől kapja
(`SUPABASE_SERVICE_ROLE_KEY`) — senkinek nem kell kulcsot másolnia, és a kulcs soha nem
hagyja el a Supabase-t. Az 1. lépés (Netlify környezeti változó) ezzel megszűnt.

| elem | hely | állapot |
|---|---|---|
| kapu logikája | `supabase/functions/rpw-storage/core.js` | kész, 48 teszt + 2 mutáció |
| kapu belépési pont | `supabase/functions/rpw-storage/index.ts` | **élesben** (v1, verify_jwt) |
| kliens-adapter | `rpw-photos.js` → `RPWPhotos.bucket()` | kész, 23 teszt |
| hívási pontok | 7 fájl, 10 hely + `rpw-photos.js` belső | átállítva; statikus őr tiltja a közvetlen hívást |
| kapcsoló | `rpw-config.js` `STORAGE_GATEWAY: true` | kész |
| lezárás | `_migrations/018_…` + rollback | **megírva, NEM futott** |

**Élő mérés a kapun (2026-11-08, a munkamenet hálózatáról):**
token nélkül → 401 · hamis tokennel → 401 · nem létező dosszié (ügyfél) → 403 ·
ügyfél a dolgozói fotóra → 403 · listázás → 400 · idegen Origin → 403 · kulcs nélkül → 401 ·
létező dosszié, ügyfél-név → **200, feltöltési token** (feltöltés nem történt).
A régi közvetlen út ugyanekkor: anon kulccsal a tároló **listázható** — ezt zárja a 018.

**Törlési jog:** a mai viselkedés marad (bejelentkezett dolgozó, saját szerviz munkája),
de mostantól **minden törlés auditsort ír** (`photo_remove`). Szigorítás `can.delete`-re:
külön döntés.
