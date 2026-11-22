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
| Domain / beállítás módosítása | `nano /etc/rpw/rpw.conf`, utána `bash /opt/rpw/repo/symfony/deploy/configure.sh` |

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

- **Visszatöltés a mentésből (`rpw:restore`)** — ma a mentés készül, titkosított és visszaellenőrzött, de
  visszatölteni csak kézzel lehetne. Kell hozzá parancs + rendszeres visszatöltési próba (a TyreFleet `restore-drill` mintájára).
- **Másolat a gépen kívülre** (3-2-1 szabály).

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
