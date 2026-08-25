# IMPLEMENTATION-BACKLOG — a döntésekből épített, priorizált megvalósítási lista

> Minden tétel: melyik döntés/ellentmondás → mit építünk → hol → mekkora.
> S = kicsi (óra), M = közepes (nap), L = nagy (több nap).
> Az ELŐFELTÉTEL-oszlop jelzi, mi függ a cutovertől (élesíthető-e előtte).

## B0 · Már megépítve, élesítésre vár (a v2-konszolidációs ág)

| tétel | állapot |
|---|---|
| {ok:false}≠siker minden úton · prog+asig adatvesztés-javítás · dupla-katt zár · guard fail-closed | KÉSZ, tesztelt — PR-ra vár (legacy-biztonságos) |
| rpw_job_create (008) · v3-szűrés · kivezetések · bootstrap · registry v2 | KÉSZ — a CUTOVER része (DEPLOYMENT.md) |
| PR #5 (Avizare 1 gomb→dosszié-lap) | NYITVA — a K-19 fül-terv RÉSZBEN felülírja: döntsd el, bezárjuk-e a PR-t a fül javára |

## B1 · P0 — a döntések magja (cutover előtt is építhető, kapcsoló mögött)

| # | mit | döntés/lelet | hol | méret | előfeltétel |
|---|---|---|---|---|---|
| B1-1 | „Avizare daună" fül a főablakon + kétállapotú jelvény + a kék modal kivezetése | K-19 | index.html | M | — |
| B1-2 | „Utolsó egyeztetés" feltétel: kézi megerősítés; a wa.me-katt nem állít; ez a Deschide lucrarea kapuja | K-4, E-4/E-5 | index.html | S | — |
| B1-3 | Ratat: csak elmúlt időpontnál + megerősítés; audit a szerveri úton | K-3, E-3 | index.html (+006 audit a cutoverrel) | S | audit: cutover |
| B1-4 | doar_dosar SAJÁT lezárási szabálya a szerveren (irat-teljesség + Predat) | K-9, E-12 | 009 migráció + rpw-dosar | M | staging |
| B1-5 | Elvégezte/ellenőr/átadó = bejelentkezett név (RPWAuth.name), gépelés kivételként | K-20, E-23/E-26 | 3 termelő oldal + control + inchidere | M | — |
| B1-6 | Pótmunka-jóváhagyás: ki+mikor rögzítése | K-21, E-24 | tinichigerie/vopsitorie | S | — |
| B1-7 | Lezárás utáni automatikus teljes-ZIP a Storage-ba → siker → separat (CASE_ARCHIVED) | K-25, E-9/E-27 | inchidere + rpw-dosar + storage | M | — |
| B1-8 | Ügyfél-link: egyszer használatos token + lejárat + visszavonás + limitek + audit | K-11, E-10 | 009 migráció + rpw-upload + functions | L | staging |
| B1-9 | Parametri a szerverre (tenant-készlet, vezetői jog) + K-15 napi kapacitás-figyelmeztetés | K-26, K-15, E-29/E-30/E-16 | 009 migráció + index.html | M | staging |

## B2 · P1 — a lánc simításai

| # | mit | döntés/lelet | méret |
|---|---|---|---|
| B2-1 | azi-modal: késett tételnél döntés-kényszer (átütemez/ratat/hív); 3+ átütemezés sáv + kötelező indok + KI | K-8, K-16, E-17 | M |
| B2-2 | Egy belépőpont: Lucrări-képernyő létrehozás + Import ZIP kivezetése | K-7, E-8/D-1 | S |
| B2-3 | Külföldi rendszám/telefon lazább minta + jelölő; utólagos rögzítés jelölése | K-13, K-14, E-14/E-15 | S |
| B2-4 | Audatex ésszerűség-ellenőrzés + felülírás-megerősítés + teszt | K-22, E-22, G-10 | S |
| B2-5 | Predat-dátum: figyelmeztetés módosításnál/törlésnél | K-10, E-11 | S |
| B2-6 | Recepció-lap doar_dosar-őr (K-17 döntés után) | K-17, E-18 | S |
| B2-7 | `mark()` hátsó kapu kivezetése; flux-váltás atomivá (E-13) | E-19, E-13 | S |
| B2-8 | Fázis-terv + munkaállomás-beosztás (posturi↔fázis), csak jogosultnak | K-23, E-25 | L |

## B3 · A cutover maga (változatlan: DEPLOYMENT.md)

séma-egyeztetés → staging 001–009 → checklist+evidence → PIN-ek → API-kulcs →
éles migráció → config-kapcsolók → megfigyelés. **Az audit (K-5) itt teljesül.**

## Nem épül (döntés szerint)

Külön Case-tábla (K-1/B) · În lucru fül (K-2) · rework-határidő (K-24) ·
szerveroldali statisztika (K-27 nyitott).
