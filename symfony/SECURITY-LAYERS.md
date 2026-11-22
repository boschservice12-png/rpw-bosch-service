# RPW — többrétegű védelem (defense in depth)

*2026-11-21 · az új Symfony backendre · a régi rendszer biztonsági modellje: `../SECURITY.md`*

Az elv: **egyetlen réteg hibája se legyen elég a kárhoz.** Ha a tűzfal át is enged, a
token kell; ha a token el is lop, a jogok és a bérlő-zár korlátoz; ha az adat el is
vész, a titkosított mentés visszahozza; és minden kísérlet nyomot hagy.

Jelmagyarázat: ✅ kódban, teszttel igazolva · 📦 telepítési sablon (valódi szerveren még nem futott) · ⚠ ismert maradék kockázat

## A rétegek

| # | Réteg | Fenyegetés | Védelem | Hol | Igazolás |
|---|---|---|---|---|---|
| 1 | Hálózat / szerver | port-szkennelés, SSH-jelszópróbálgatás | tűzfal: csak 22 (fékkel), 80, 443 · auto-frissítés · fail2ban az SSH-ra · *SSH csak kulccsal: később, külön lépés (TELEPITES-SZERVER.md)* | `deploy/install.sh` | 📦 (`bash -n` ✅) |
| 1 | | ismételt PIN-próbálgatás egy IP-ről | fail2ban a biztonsági naplóból: 30 hiba / 10 perc → 1 óra kizárás | `deploy/templates/fail2ban/` | ✅ szűrő a valódi naplón: 50 találat, 0 téves |
| 1 | | PHP-hibarészlet, verzió kiszivárgása | `expose_php`/`display_errors` ki, veszélyes függvények tiltva, `open_basedir` — **csak az RPW saját php-fpm készletére** | `deploy/templates/php-fpm-rpw.conf` | 📦 |
| 2 | Web-határ | lehallgatás, protokoll-leminősítés | HTTPS (Caddy, Let's Encrypt), HSTS 1 év | `deploy/templates/Caddyfile.tpl` + Symfony | ✅ HSTS csak HTTPS-en (teszt) |
| 2 | | XSS kártékony külső kódja, adatkiszivárgás | **CSP: a böngésző CSAK a saját szerverrel beszél** (`connect-src 'self'`), nincs CDN, nincs Supabase | `SecurityHeadersSubscriber` | ✅ teszt + E2E: 0 CSP-sértés |
| 2 | | kattintás-eltérítés, MIME-csere | `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, COOP/CORP | ugyanott | ✅ |
| 2 | | idegen oldalról indított írás | eredet-őr: író kérés csak a saját oldalról (vagy `RPW_ALLOWED_ORIGINS`) | `OriginGuardSubscriber` | ✅ teszt (403) |
| 2 | | érzékeny válasz gyorsítótárban | `Cache-Control: no-store` az adat-útvonalakon | `SecurityHeadersSubscriber` | ✅ |
| 3 | Alkalmazás | lopott / régi munkamenet | token csak sha256-ként tárolva · 12 ó csúszó + **24 ó abszolút** lejárat · PIN-csere → a többi munkamenet megszűnik · kilépéskor megszűnik | `AuthService` | ✅ teszt |
| 3 | | PIN-próbálgatás | 10 rossz / 15 perc → dolgozó zárva · IP-fék 300/15 perc · gyenge és ütköző PIN tiltva | `AuthService`, `PinPolicy` | ✅ |
| 3 | | idegen szerviz adata | **bérlő-zár a szerveren**: minden lekérdezés a token szervizére szűr | `JobService` | ✅ teszt |
| 3 | | jogosulatlan művelet | mezőszintű jog · fázisjog · a felülbírálás csak indokolt, naplózott művelet · védett workflow-mezők | `PatchGuard`, `TransitionEngine` | ✅ |
| 3 | | csendes felülírás két ember között | verziózár (`FOR UPDATE` + `version`) | `JobService` | ✅ |
| 3 | | hamis fájl (pl. kép helyett szkript) | tárolókapu: egy fájlra szóló, aláírt, lejáró URL · tartalom a bájtokból azonosítva · szigorú CSP a letöltésen | `StorageController`, `FileStore` | ✅ |
| 3 | | fizetős AI / levél visszaélés | belépés kötelező · IP-fék · fejléc-injektálás kizárva · melléklet-típus és -méret | `FunctionsController` | ✅ |
| 4 | Adat | kitalálható titok → hamisítható fotó-link | **élesben gyenge `APP_SECRET`-tel a szerver nem indul (503)** · bekapcsolt debug módban sem | `ProductionGuardSubscriber` | ✅ |
| 4 | | adatvesztés (lemezhiba, hiba, zsarolóvírus) | napi **titkosított** mentés (XChaCha20-Poly1305), sha256, **visszaellenőrzéssel**, 14 nap megőrzés; a kulcs nem a mentés mellett | `rpw:backup`, `deploy/templates/rpw-backup.*`, telepítés előtt is (`release.sh`) | ✅ hamisítás / csonkítás / rossz kulcs észlelve |
| 4 | | fájlok közvetlen letöltése | a fotótár a webgyökéren kívül | `var/storage` | ✅ `rpw:security:check` |
| 5 | Megfigyelés | észrevétlen támadás | biztonsági eseménynapló: belépés, rossz PIN, zárolás, eredet-tiltás, PIN-csere, zárfeloldás — **IP-vel, PIN és token nélkül** · auditban és `var/log/security-prod-*.log`-ban | `SecurityLog` | ✅ teszt |
| 5 | | rosszul beállított éles szerver | `rpw:security:check` élesítési kapu rétegenként, kilépési kóddal | parancs | ✅ fejlesztői gépen 4 HIBÁ-t jelez (helyesen) |

## ⚠ Ismert maradék kockázatok

| Kockázat | Miért marad | Enyhítés |
|---|---|---|
| `'unsafe-inline'` a CSP-ben | a felület több száz inline kezelőt használ | minden más CSP-irányelv szűk; nincs külső szkriptforrás; a token nem sütiben van |
| A munkamenet-token a böngésző `localStorage`-ában | a régi felület így működik | rövid, abszolút lejárat; PIN-cserével visszavonható; XSS ellen a CSP |
| A titkosítatlan munkaadat az adatbázisban | szabványos; a lemez titkosítása a hosting feladata | a mentés titkosított; a hostingnál titkosított lemezt kell választani |
| A szerversablonok valódi szerveren nem futottak | a gép (külön Contabo VPS, döntés 2026-11-22) még nincs megrendelve | a telepítéskor egyenként ellenőrizni (lent) |

## Élesítési ellenőrzőlista

```bash
symfony/bin/console rpw:security:check
```

Annak ellenőrzése, amit a parancs nem lát:

- [ ] `deploy/install.sh` lefutott (`../TELEPITES-SZERVER.md`); `ufw status` → csak 22/80/443
- [ ] *(a kulcsos SSH bevezetése után)* jelszavas SSH elutasítva
- [ ] `curl -sI https://<domain>/api/health` → `strict-transport-security` és `content-security-policy` megvan
- [ ] `curl -sI http://<domain>/` → átirányít HTTPS-re
- [ ] `curl -s https://<domain>/.env` és `/symfony/.env` → 404
- [ ] `fail2ban-client status rpw` → aktív; 11 rossz PIN után az IP megjelenik a naplóban
- [ ] `rpw:backup` lefutott, `rpw:backup --verify <mappa>` OK, és a mentés másolata a szerveren KÍVÜL is megvan
- [ ] az `RPW_BACKUP_KEY` a szerveren kívül, biztonságos helyen is meg van őrizve (nélküle nincs visszaállítás)
- [ ] egy próba-visszaállítás egy üres adatbázisba sikerült
