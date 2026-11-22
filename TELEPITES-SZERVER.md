# RPW — saját szerver telepítése (Contabo VPS)

*2026-11-22 · Ferenc döntése: az RPW **külön gépen** fut, nem a TyreFleet szerverén (`84.247.166.156`).*
*A módszer a TyreFleet bevált csomagja: ugyanaz a szerkezet, ugyanazok a parancsnevek.*

---

## Összefoglaló

| | |
|---|---|
| Gép | Contabo **Cloud VPS 10** (8 GB RAM, 75 GB NVMe), Ubuntu 24.04, EU-adatközpont |
| Költség | kb. 4,50–5,50 €/hó + opcionális Auto Backup |
| Szoftver | PHP 8.3, PostgreSQL 16, Caddy (automatikus HTTPS) — mind a gépen |
| Kód helye | `/opt/rpw` (kiadások), `/opt/rpw/shared` (titkok, fotók, napló) |
| Mentés | minden éjjel 02:30, **titkosítva**, visszaellenőrizve, 14 napig; **telepítés előtt is** |
| Frissítés | egy parancs; hibás kiadásnál **automatikus visszaállás** az előzőre |

**Amit a telepítő NEM csinál:** nem nyúl a TyreFleethez (ha a gépen `/opt/gumi` van, megáll), nem nyúl
az éles Supabase-hez, és nem hoz át adatot. Az adatátvitel külön lépés, a staging-próba után.

---

## 1. lépés — Gép rendelése (Ferenc, kb. 10 perc)

contabo.com → **Cloud VPS** → **Cloud VPS 10**

| Beállítás | Érték |
|---|---|
| Region | **European Union (Germany)** — az ügyféladat az EU-ban marad |
| Storage | **75 GB NVMe** |
| Image | **Ubuntu 24.04** |
| Password | erős jelszó, **jelszókezelőbe** — senkinek ne küldd el, a chatbe se |
| Auto Backup | ajánlott (a TyreFleetnél is ezt használod) |

A rendelés után a Contabo e-mailben küldi a gép **IP-címét**. Ezt nyugodtan megírhatod nekem — az IP nem titok.

## 2. lépés — A kód letöltése a gépre (Ferenc, PowerShell)

```bash
ssh root@<IP>
```

Az első kérdésre `yes`, utána a Contabo-jelszó. A gépen:

```bash
apt-get update -qq && apt-get install -y -qq git
```

```bash
git clone --branch claude/relaxed-shannon-poab6p https://github.com/boschservice12-png/rpw-bosch-service.git /opt/rpw/repo
```

> A repó nyilvános, ezért ehhez nem kell kulcs. (Ha később priváttá teszed: csak olvasási jogú
> deploy-kulcs, mint a TyreFleetnél — `docs/TELEPITES_SZERVER_HU.md` a TyreFleet-repóban.)

## 3. lépés — Telepítés (egy parancs, kb. 5–10 perc)

Domain nélkül (azonnal működik, ideiglenes cím `<ip-kötőjelekkel>.sslip.io`, valódi HTTPS):

```bash
bash /opt/rpw/repo/symfony/deploy/install.sh
```

A végén két kérdés: **az első admin neve** és **PIN-je** (rejtve gépeled, nem látszik).
Ha `ssh root@<IP> "…"` formában indítod, **kell a `-t`**, különben a telepítő megáll, mielőtt a PIN-t kérné.

Saját domainnel (előtte a DNS-ben egy `A` rekord: `rpw.<domain>` → `<IP>`):

```bash
bash /opt/rpw/repo/symfony/deploy/install.sh rpw.redassistance.net
```

## 4. lépés — Ellenőrzés

```bash
bash /opt/rpw/repo/symfony/deploy/status.sh
```

Elvárt: `egészséges`, és minden szolgáltatás `active`. Böngészőben: `https://<cím>/rpw-login.html` → belépés az admin PIN-nel.

Biztonsági kapu (rétegenként, kilépési kóddal):

```bash
cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:security:check
```

## 5. lépés — OCR és levélküldés kulcsai (opcionális)

Kulcs nélkül az OCR és a levél rendezetten „nincs beállítva" választ ad, a felület kézi bevitellel megy tovább.
A kulcsokat **a szerveren** írod be, nem a chatbe:

```bash
nano /opt/rpw/shared/.env.local
```

`ANTHROPIC_API_KEY=` és `RESEND_API_KEY=` sorok kitöltése, mentés: `Ctrl+O`, `Enter`, `Ctrl+X`. Utána:

```bash
systemctl reload php8.3-fpm
```

## 5b. lépés — Fotótár: objektumtár (az ÉLES adat előtt kötelező)

*Ferenc döntése (2026-11-22): 30–50 autó × 150 cég → ~1,1–1,8 TB/év. A fotók nem férnek el egy gép lemezén.*

A telefon a képet **közvetlenül a tárba** tölti (nem a szerveren át), a szerver csak engedélyt ad: egy fájlra,
10 percre (feltöltés) vagy 1 órára (olvasás). A tárban a kulcs: `<cég>/<munka>/<fájl>`.

1. contabo.com → **Object Storage** → EU régió → a Contabo-felületen: **Bucket létrehozása** (név: `rpw`, *privát*), és
   **S3-kulcspár** (Access Key + Secret Key). A kulcsot **ne** küldd el senkinek, a chatbe se.
2. A szerveren:

```bash
nano /opt/rpw/shared/.env.local
```

```
RPW_STORAGE_BACKEND=s3
RPW_S3_ENDPOINT=https://eu2.contabostorage.com
RPW_S3_REGION=default
RPW_S3_BUCKET=rpw
RPW_S3_ACCESS_KEY=<a Contabo-felületről>
RPW_S3_SECRET_KEY=<a Contabo-felületről>
```

> Az `RPW_S3_ENDPOINT` pontos címét a Contabo-felület mutatja a bucket mellett (régiótól függ) — azt másold.

3. Próba + a tár beállítása (a böngésző CSAK az RPW címéről tölthet fel):

```bash
cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:storage:check --cors=https://<az RPW címe>
```

Elvárt: hat ✔ (feltöltés, létezik, letöltés bájtra egyezik, törlés, eltűnt, aláírás nélkül elutasít) és `OK`.

```bash
systemctl reload php8.3-fpm
```

**Hiányos beállítással a szerver nem indul el csendben helyi tárral** — inkább hibát ad, mint hogy a fotó rossz helyre kerüljön.
**Visszaút:** `RPW_STORAGE_BACKEND=local` + reload (a tárban lévő fotók ott maradnak).

## 5c. lépés — A fotók másolata egy MÁSIK szolgáltatónál (az ÉLES adat előtt kötelező)

Ha a Contabóval baj van (fiók, adatközpont, feltört szerver), a fotók akkor is megvannak. Óránként csak az **új**
fotók mennek át; a másolatban a rendszer **soha nem töröl**. Minden átvitt fájlnál ellenőrzi, hogy valódi JPG/PDF-e.

**Javaslat: Backblaze B2, EU Central (Amszterdam)** — S3-kompatibilis, EU-ban tárol, és olyan kulcs adható ki,
amely **csak írni és olvasni tud, törölni nem**. Lépések a B2-felületen:

1. **Bucket**: `rpw-masolat`, *Private*, régió **EU Central**. (Opcionális, ajánlott: *Object Lock*.)
2. **Application Key**: csak erre a bucketre, jogok: `listFiles`, `readFiles`, `writeFiles` — **`deleteFiles` NE**.
3. A szerveren (`nano /opt/rpw/shared/.env.local`):

```
RPW_REPLICA_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
RPW_REPLICA_REGION=eu-central-003
RPW_REPLICA_BUCKET=rpw-masolat
RPW_REPLICA_ACCESS_KEY=<keyID>
RPW_REPLICA_SECRET_KEY=<applicationKey>
```

> Az endpoint pontos címét a B2 a bucket adatlapján mutatja („Endpoint”) — azt másold.

4. Ellenőrzés — írás ✔, olvasás ✔, **törlés TILTVA** ✔:

```bash
cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:storage:check --replica
```

5. Első másolat most (utána óránként magától):

```bash
systemctl start rpw-replicate && bash /opt/rpw/repo/symfony/deploy/status.sh
```

## 6. lépés — A mentési kulcs megőrzése (KÖTELEZŐ, egyszer)

A mentések titkosítottak. **Kulcs nélkül egyetlen mentés sem állítható vissza** — ha a gép elvész, a kulccsal együtt elvész minden.

```bash
grep RPW_BACKUP_KEY /opt/rpw/shared/.env.local
```

A kiírt sort tedd a **jelszókezelődbe**, a gép jelszava mellé. Ne e-mailben, ne chatben.

## Napi üzemeltetés

| Mit | Parancs |
|---|---|
| Állapot | `bash /opt/rpw/repo/symfony/deploy/status.sh` |
| Frissítés a legújabb kódra | `bash /opt/rpw/repo/symfony/deploy/update.sh` |
| Visszaállás az előző kiadásra | `bash /opt/rpw/repo/symfony/deploy/rollback.sh` |
| Mentés most | `systemctl start rpw-backup` |
| Visszatöltési PRÓBA (az élőhöz nem nyúl) | `cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:restore latest` |
| **Éles visszatöltés** (előtte biztonsági mentés) | `… rpw:restore <mentés mappája> --live` → írd be: `VISSZAALLITAS` |
| Fotó-másolat most | `systemctl start rpw-replicate` |
| Fotók vissza a másolatból (katasztrófa után) | `… rpw:storage:replicate --reverse` |
| Domain / beállítás módosítása | `nano /etc/rpw/rpw.conf`, utána `bash /opt/rpw/repo/symfony/deploy/configure.sh` |

## Méret- és időkorlátok (2026-11-22 — a lánc-teszt őrzi: `symfony/tests/Unit/LimitsChainTest.php`)

| Mi | Korlát | Hol dől el |
|---|---|---|
| Fotó / irat feltöltése | **max. 25 MB** (a telefon 0,3–0,5 MB-ra tömörít) | objektumtár: az aláírásban · helyi: Caddy 26 MB → PHP 26 MB → alkalmazás 25 MB |
| Csak JPG / PDF | a bájtokból is ellenőrizve | kapu + helyi tár |
| OCR-kép | **max. 5 MB** (az AI-szolgáltató határa) | alkalmazás |
| OCR / levél kérése | max. 12 MB | Caddy 13 MB → alkalmazás 12 MB |
| Egy levél mellékletei | max. 10 db / 10 MB — több fotónál automatikusan több levél | böngésző (9,5 MB-os csomagok) → levélküldő |
| Egy munka mentése | **max. 2 MB** — a fotók a tárban, nem a munkában | alkalmazás (érthető román hibaüzenet) · az átállás előtt a `rpw:db:check` jelzi a túl nagy régi munkát |
| AI-hívás ideje | 40 mp × 2 próba < 90 mp | a PHP 90 mp után leállít — előtte rendezett hibaüzenet |
| Memória | 256 MB / folyamat, max. 10 folyamat | 8 GB-os gépen bőven elfér |

## Mi hol van

```
/etc/rpw/rpw.conf          beállítások (domain, ág, szerviz neve) — nem titok
/opt/rpw/repo              a repó másolata (innen épülnek a kiadások)
/opt/rpw/releases/…        az utolsó 5 kiadás (visszaálláshoz)
/opt/rpw/current           → az élő kiadás
/opt/rpw/shared/.env.local TITKOK (640, root:rpw) — soha ne másold ki
/opt/rpw/shared/storage    fotók, iratok
/opt/rpw/shared/log        napló (a fail2ban a biztonsági naplót olvassa)
/var/backups/rpw           titkosított mentések (+ pre-deploy)
```

## Biztonság — rétegek a gépen

| Réteg | Mi védi |
|---|---|
| Hálózat | tűzfal: csak 22 (SSH, kapcsolódási fékkel), 80, 443 · fail2ban: SSH és ismételt rossz PIN → IP-kizárás |
| Web | HTTPS (Let's Encrypt), HSTS · a Symfony szigorú CSP-je · rejtett fájlok (`.env`, `.git`) → 404 |
| PHP | **saját készlet** saját felhasználóval; tiltott parancsfuttatás; a kód csak a `/opt/rpw` alatt olvashat |
| Adat | adatbázis csak a gépen belül · titkos fotó-linkek · titkosított, visszaellenőrzött mentés |

**Később (ajánlott):** SSH csak kulccsal. Ehhez előbb kulcs kell a gépeden — külön, lépésenként segítek;
addig a jelszavas belépést a fail2ban és a tűzfal fékje védi.

## Helyben igazolva (2026-11-22, próbatelepítés systemd és Caddy nélkül)

| Próba | Eredmény |
|---|---|
| Első telepítés üres gépre (titkok, adatbázis, kiadás, szerviz + admin) | ✅ 65 mp |
| Belépés-lista, felület, `rpw-config.js` a saját szerviz-azonosítóval | ✅ |
| `.env.local` a weben | ✅ 404 |
| Frissítés: mentés előtte, vendor újrahasznosítva | ✅ 9 mp |
| Frissítés egy olyan élő kiadásról, amelynek a mentése hibás | ✅ az új kód menti (lásd lent) |
| Kiadás, amely el sem indul | ✅ megáll az átkapcsolás előtt, az élő változatlan |
| Kiadás, amely elindul, de hibás → **automatikus visszaállás** | ✅ |
| `rollback.sh` kézzel | ✅ |
| Mentés visszaellenőrzése (visszafejtés + hash) | ✅ |
| `install.sh` újrafuttatása | ✅ titok, szerviz változatlan |

**A próba közben talált és javított hibák:** (1) üres fotótárral (friss szerver) a mentés összeomlott → minden
telepítés megállt volna; (2) a mentés hibája a saját javítását is kizárta volna; (3) sikertelen mentés félkész
mappát hagyott; (4) az egészség-ellenőrzés egy gyorsítótárazott régi kiadást is elfogadott — most a futó
kiadás azonosítóját is összeveti.

**NEM IGAZOLT (csak a valódi gépen mérhető):** Caddy + HTTPS, a php-fpm készlet, fail2ban, tűzfal, éjszakai időzítő.

## ⚠ Nyitott — az éles adat átköltöztetése ELŐTT kötelező


- **A fotó-másolat méretezése:** egy futás a két tár listáját veti össze — ~1 millió fotóig jó (150 cégnél kb. 1–2 év).
  Előtte: feltöltési sor (a kapu jegyzi az új fotót, a másoló csak azt viszi) + heti teljes összevetés.

## A munkákba ágyazott régi fotók kiköltöztetése (átálláskor, az adatok átvitele után)

A régi rendszerben a fotók egy része **base64-ként a munka adatában** ült (főleg a reconstatare). Az új szerver
2 MB-nál nagyobb munkát nem tud menteni — ezért ezeket a fotókat a tárba kell költöztetni. A `rpw:db:check` megmutatja,
melyik munka érintett. Próba (semmit nem ír, megmutatja a méretet előtte → utána):

```bash
cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:jobs:extract-photos --dry-run
```

Éles futtatás (előtte magától teljes mentést készít; újrafuttatható):

```bash
cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:jobs:extract-photos
```

Elvárt: egyetlen „✘ MÉG MINDIG TÚL NAGY” sor sincs, és a `rpw:db:check` újra `OK`.

## A meglévő fotók átvitele a tárba (átálláskor, egyszer)

**Sorrend:** előbb az ADATOK (munkák) kerülnek át — a parancs a munkából tudja, melyik cégé a fotó.
Újrafuttatható: csak a hiányzót viszi, a forráshoz csak olvasva nyúl.

Helyi lemezről (staging / próba):

```bash
cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:storage:migrate --from-local=/opt/rpw/shared/storage --dry-run
```

A régi rendszer Supabase-tárából — Supabase-felület → *Storage* → *Settings* → **S3 Connection**: bekapcsolás,
**Access key** létrehozása. Ez a kulcs a teljes tárhoz hozzáfér: **csak az átvitel idejére**, utána töröld a Supabase-felületen.
A `.env.local`-ba:

```
RPW_LEGACY_S3_ENDPOINT=https://<projekt>.supabase.co/storage/v1/s3
RPW_LEGACY_S3_REGION=<a Supabase-felület mutatja>
RPW_LEGACY_S3_BUCKET=rpw-photos
RPW_LEGACY_S3_ACCESS_KEY=<…>
RPW_LEGACY_S3_SECRET_KEY=<…>
```

```bash
cd /opt/rpw/current/symfony && runuser -u rpw -- php bin/console rpw:storage:migrate --from-legacy --dry-run
```

Ha a próbafuttatás rendben (cégenkénti darabszám, 0 „ismeretlen munka”), ugyanez `--dry-run` nélkül.
A végén: a `RPW_LEGACY_S3_*` sorok törlése, a Supabase-kulcs visszavonása.

## ✅ Megoldva (2026-11-22)

| Téma | Hogyan | Igazolás |
|---|---|---|
| Visszatöltés a mentésből | `rpw:restore` — próba külön adatbázisba; éles: előtte biztonsági mentés, EGY tranzakció | valódi PostgreSQL 16: próba ✔, éles ✔, hibás mentés → élő változatlan ✔ |
| Havi visszatöltési próba | `rpw-restore-drill.timer` (1-jén 04:10), eredmény a `status.sh`-ban | `RestoreTest` |
| Fotók másik szolgáltatónál | `rpw:storage:replicate` óránként; a célban soha nem töröl; `--reverse` vissza | `ReplicaTest` (3 teszt, törlés-figyelővel) |
| Csak valódi JPG/PDF | kapu: csak `.jpg/.jpeg/.pdf`; a helyi tár a bájtokat is nézi; a böngésző nem tölt fel hamis JPG-t; a másoló jelzi a régi hamis JPG-ket | `StorageFormatTest` |
| Méretkorlát a közvetlen feltöltésre | a pontos méret az aláírás része (max. 25 MB) — a tár minden más méretet elutasít | `S3ObjectStoreTest`, `StorageS3GatewayTest` |
| Meglévő fotók átvitele | `rpw:storage:migrate` helyi lemezről vagy a régi Supabase-tárból, cégenkénti kulcsra | `MigrateTest` (a régi tárba semmit nem ír) |
| Szakvélemény-fotók a munkában (2 MB-os mentési határ) | a reconstatare fotói a tárba mennek; internet nélkül helyben maradnak | `test-reconst-photos.js` (valódi oldalkóddal) |
| Méret- és időkorlátok összehangolása | Caddy útvonalanként, PHP 26 MB, AI 40 mp × 2, OCR-kép 5 MB, érthető 413 | `LimitsChainTest` (szándékos hibával is kipróbálva), `SizeLimitsTest` |
| Régi, munkába ágyazott fotók (2 MB fölötti munkák) | `rpw:jobs:extract-photos`: előbb tárba + visszaellenőrzés, utána a munka; verziózár, napló, újrafuttatható; ismeretlen helyhez nem nyúl | `PhotoExtractTest` (23 ellenőrzés) |
| Szakvélemény-fotók a dosszié-ZIP-ben | a tárolt fotók és a sorokhoz készült fotók is bekerülnek (eddig kimaradtak) | böngészős E2E |
| Sok fotó e-mailben | levelenként max. 10 melléklet / 10 MB → automatikusan több levél „(1/3)” | `test-mail-split.js` |

## Ami a telepítés után jön (a terv: `RPW-004-SYMFONY-ATALLAS.md`)

1. **Staging:** az éles Supabase másolata erre a gépre → `rpw:db:check` → séma-eltérések kiegyenlítése.
2. **Próba a műhellyel:** 2 dolgozó, egy munka 1→7, két böngésző egyszerre, visszaút kipróbálva.
3. **Átállás:** adat + fotók + munkaszám-számláló (`MS-26-`, 86-ról folytatva) átvitele, egy este alatt.

## Kockázatok

| Kockázat | Kezelés |
|---|---|
| A mentés ugyanazon a gépen van | Contabo Auto Backup + később másolat a gépen kívülre (3-2-1) |
| A mentési kulcs elvész | 6. lépés: jelszókezelő |
| Hibás kiadás | automatikus visszaállás; kézzel: `rollback.sh` |
| A webszerver-beállítás hibás | a `configure.sh` csere előtt `caddy validate`-tel ellenőriz; hibánál a régi marad |
