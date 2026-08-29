# RPW funkció-nyilvántartás

> Ezt a fájlt **gép írja**: `node _registry/generate.js`.
> A forrás a `_registry/funkciok.json`. Az őre a `_tests/unit/test-registry.js`.

Minden funkciónak **állandó száma** van. A szám soha nem változik és nem használjuk újra.
Ha egy lépés eltűnik vagy átalakul, a teszt a **számával** jelzi. Ha új funkció kerül be
szám nélkül, azt is megmondja.

| összesen | él | csak frontend | csak backend | nincs bekötve | teszt nélkül |
|---|---|---|---|---|---|
| 104 | 27 | 68 | 3 | 6 | 7 |

## F-0xx · Belépés és jogosultság

| szám | mit csinál | frontend | backend | teszt | állapot |
|---|---|---|---|---|---|
| **F-001** | Belepes (login) | `rpw-auth.js` | `rpw_login` | `unit/test-rpc-consistency.js` | ✅ él |
| **F-002** | Munkamenet ellenorzese | `rpw-auth.js` | `rpw2_session` | `integration/test-int-tenant.js` | ✅ él |
| **F-003** | Kilepes (logout) | `rpw-auth.js` | `rpw_logout` | `unit/test-rpc-consistency.js` | ✅ él |
| **F-004** | Csapat lekerese (regi ut) | `rpw-auth.js` | `rpw_team` | `integration/test-int-tenant.js` | ✅ él |
| **F-005** | Csapat lekerese (uj ut) | `index.html` | `rpw2_team` | `integration/test-int-tenant.js` | ✅ él |
| **F-006** | Nevsor (roster) lekerese | `rpw-login.html` | `rpw2_roster` | `integration/test-int-tenant.js` | ✅ él |
| **F-007** | Dolgozo mentese | `index.html` | `rpw2_employee_save` | `integration/test-int-tenant.js` | ✅ él |
| **F-008** | Szerepkor mentese | `index.html` | `rpw2_role_save` | `integration/test-int-tenant.js` | ✅ él |
| **F-009** | Jogosultsag-kerdes (mit szabad?) | — | `rpw2_can` | `integration/test-int-tenant.js` | 🟧 csak backend |
| **F-010** | PIN beallitasa | `index.html` | `rpw2_pin_set` | `integration/test-int-tenant.js` | ✅ él |
| **F-011** | PIN allapot (hanyadik hibas probalkozas, zarolva?) | `index.html` | `rpw2_pin_status` | `integration/test-int-tenant.js` | ✅ él |
| **F-012** | PIN zarolas feloldasa adminkent | `index.html` | `rpw2_pin_unlock` | `integration/test-int-tenant.js` | ✅ él |
| **F-013** | Gyenge PIN elutasitasa (1234, 0000, 111111) | — | `rpw__pin_weak` | `integration/test-int-tenant.js` | 🟧 csak backend |
| **F-014** | Admin mod kapcsolo a fooldalon | `index.html` | — | `unit/test-p0-5-admin.js` | 🟦 csak frontend |
| **F-015** | Dolgozo/szerepkor/PIN admin ablak | `index.html` | — | `unit/test-pin-dialog.js` | 🟦 csak frontend |
| **F-016** | Belepes uj uton (rpw2_login, tokenes munkamenet) | `rpw-auth.js` | `rpw2_login` | `integration/test-int-tenant.js` | ✅ él |

## F-1xx · Munkalap élete

| szám | mit csinál | frontend | backend | teszt | állapot |
|---|---|---|---|---|---|
| **F-101** | Uj munkalap: Lucrare noua (urlap nelkul, egyenesen a recepciora) | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-102** | Rendszam bevitel es normalizalas | `index.html` | — | `unit/test-case.js` | 🟦 csak frontend |
| **F-121** | Elojegyzes urlap (Programare noua): ket tipus (Dauna asigurare / Dauna auto), a biztositosnal ket dosszie-ag (Avizare dauna / Dosar dauna deschis); a nev es az auto LATSZIK, de nem kotelezo | `index.html` | — | `frontend/test-fe-urlap.js` | 🟦 csak frontend |
| **F-122** | Kapcsolat oszlop a foablakon: a VALODI WhatsApp jel (zold=egyeztetve, sotet=meg nem, tompa=nincs telefon) | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-123** | Sor-ikonok a foablakon (naptar/ora/mappa/ceruza/kuka) — vonalas SVG, mindegyiken title ES aria-label | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-124** | A soron a mappa CSAK ott, ahol van dosszie-munka (Avizare dauna); magankaron es mar nyitott dossziénal a RECEPCIO az ut — a mappa mellett a dossziegyujto soron is ott a recepcio | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-125** | Folyamatjelzo: negy lanc egy savban (dosszie / varakozas / ratat / javitas); a statusz es a folyamat EGY oszlopban, minden fulon egyforma logikaval | `rpw-progres.js` `index.html` | — | `unit/test-progres.js` | 🟦 csak frontend |
| **F-103** | Kovetkezo munkalapszam kerese a szervertol | `index.html` | `rpw_next_job_number` `rpw_job_number` | `integration/test-int-workflow.js` | ✅ él |
| **F-104** | Munkalapok listaja | `rpw-db.js` | `rpw_jobs_list` | `integration/test-int-workflow.js` | ✅ él |
| **F-105** | Egy munkalap betoltese | `rpw-db.js` | `rpw_job_get` | `integration/test-int-workflow.js` | ✅ él |
| **F-106** | Mentes regi uton (v2, vedelem nelkul) | `rpw-db.js` | `rpw_patch` | `unit/test-rpc-consistency.js` | ✅ él |
| **F-107** | Mentes vedett uton (v3, munkafolyamat-mezok tiltva) | `rpw-db.js` `rpw-config.js` | `rpw_patch_v3` | `integration/test-int-workflow.js` | ⚠️ nincs bekötve |
| **F-108** | Verzioutkozes kezelese (ketten irtak egyszerre) | `rpw-conflict.js` | — | `unit/test-conflict.js` | 🟦 csak frontend |
| **F-109** | Vedett mezok kiszurese mentes elott | `rpw-save.js` | — | `integration/test-int-workflow.js` | 🟦 csak frontend |
| **F-110** | Szerveroldali elutasitas felismerese (nem nemul el a hiba) | `rpw-save.js` | — | **—** | 🟦 csak frontend |
| **F-111** | Fazisvaltas (recepcio -> evaluare -> ...) | `rpw-workflow.js` | `rpw_transition` | `integration/test-int-workflow.js` | ⚠️ nincs bekötve |
| **F-112** | Fazis-kovetelmenyek (mi hianyzik meg a tovabblepeshez) | `rpw-workflow.js` | `rpw_requirements` | `integration/test-int-workflow.js` | ⚠️ nincs bekötve |
| **F-113** | Lezarhato-e a munkalap | — | `rpw_can_complete` | `integration/test-int-workflow.js` | 🟧 csak backend |
| **F-114** | Munkalap kukaba dobasa | `rpw-db.js` | `rpw_job_trash` | `unit/test-delete.js` | ✅ él |
| **F-115** | Visszaallitas a kukabol | `rpw-db.js` | `rpw_job_restore` | `unit/test-delete.js` | ✅ él |
| **F-116** | Vegleges torles | `rpw-db.js` | `rpw_job_purge` | `unit/test-delete.js` | ✅ él |
| **F-117** | Meglevo munkalap szerkesztese | `index.html` | — | `unit/test-edit.js` | 🟦 csak frontend |
| **F-118** | Idopont (programare) ablak | `index.html` | — | `unit/test-prog.js` | 🟦 csak frontend |
| **F-119** | Idopont-athelyezes (reprogramare) | `index.html` | — | `unit/test-acceptance.js` | 🟦 csak frontend |
| **F-126** | Ugyfel-mezok a dosszie-lapon (nev / telefon / megjegyzes) — kesleltetett szeletes mentes; a gepelt ertek TULELI a keson erkezo szerver-valaszt; a WhatsApp gomb telefon nelkul tiltott | `rpw-dosar.html` `index.html` | — | `frontend/test-fe-dosar.js` | 🟦 csak frontend |
| **F-127** | Ikon-sav: az oldalsav 74px-es ikon-savkent indul es kinyithato 240px-re; a kinyito gomb a sav TETEJEN all; kis kepernyon is elerheto, ott a kinyitott sav RATAKAR a tartalomra es valasztaskor becsukodik; az allapot a bongeszoben marad, a valtas NEM rajzol ujra (Ferenc G-3) | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-128** | A panel a RedAssistance iranyitopult formajaban: piros elonev + nagy vekony cim, a belepo gombok a cim ALATT, lekerekitett pill-fulek kerek darabszam-jelvennyel, PIROS oszlopfejlecek — a Lucrari lapon is ugyanigy (Ferenc G-1); a felso piros 'Paint Workflow' sav kivezetve mind az ot kepernyorol; a negy belepo gomb feher alapon, sajat szinevel keretezve — lenyomasra szinesedik | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-129** | A recepcio nem bujik el: MINDEN varakozo soron ott a piros 'Receptie auto' gomb rajzzal. Ket allapota van (telt piros = egyeztetve, keretes piros = meg nem), de egyik sem nema: megnyomva megmondja, mi hianyzik (Ferenc: 'eldugott funkcio, nem logikus') | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-130** | Az ugyfel kuldemenye LATSZIK a soron: zold jelveny a Kapcsolat oszlopban, a beerkezett fajlok szamaval. Csak a src='whatsapp' belyegu fajlokat szamolja (a szervizet nem), a szabad fotokat es a nevesitett irat-helyeket egyutt | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-131** | Ha a kotelezo iratok osszegyultek, a folyamat-sav felirata KIMONDJA (zolden, 'Acte complete'); a lepes maga meg nem kesz, mert a dossziet meg nem adtuk at. Katalogus nelkul (0/0) NEM allit keszet | `rpw-progres.js` `index.html` | — | `unit/test-progres.js` | 🟦 csak frontend |
| **F-132** | A nevtelen sor is kap arcot: ha nincs se nev, se rendszam, a MUNKASZAM a focim (mono), ala pedig odakerul, hogy a nev az, ami hianyzik | `index.html` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-133** | Betoltes: eloszor HELYRE TESSZUK a munkat (migrateState), csak utana szurunk. Korabban forditva volt, ezert minden `phase` nelkul erkezett munka nemán kiesett a listabol — Ferenc adataiban 19 darab, koztuk minden telefonrol feltoltott kardosszie | `index.html` | — | `unit/test-load.js` | 🟦 csak frontend |
| **F-134** | A tarolt kep-link egy ora utan lejar, ezert megjeleniteskor MINDIG friss alairas keszul a path-bol — kepre az src, linkre a href. Az 'Documente client' blokk eddig kimaradt ebbol (halott linkek), es a ZIP-export is a tarolt linkrol toltott | `rpw-photos.js` `rpw-dosar.html` | — | `unit/test-foto-lejarat.js` | 🟦 csak frontend |
| **F-135** | Az ugyfel feltolto lapjanak elolapja marka es rendszam nelkul is megmondja, MELYIK dossziehoz tolt fel: eddig a szo szerinti 'Autovehicul' tartalek-szoveg allt ott, most a dossziészam a focim | `rpw-upload.html` | — | `frontend/test-fe-upload.js` | 🟦 csak frontend |
| **F-136** | 'Trimite' gomb az ugyfel feltolto lapjan: a fajlok eddig is azonnal mentodtek, de az ugyfelnek nem volt egy pillanata, amikor kimondhatta, hogy kesz — es visszaigazolast sem kapott. A gomb clientGata{at,files}-t ir client_whatsapp neveben, hianyos dossziénél is kuldheto, sikertelen mentesnel visszagorgul | `rpw-upload.html` | — | `frontend/test-fe-upload.js` | 🟦 csak frontend |
| **F-137** | Az 'Adauga alte poze / documente' mezo sor-kozi (<label> display nelkul) doboz volt: a fuggoleges kerete es belso margoja nem tolta arrebb a szomszedait, hanem 14px-t ratakart a kartya cimere es 7px-t a kepekre. Emellett a mellekelt fajlok kockai 3 oszlopban alltak a kotelezo iratok 4 oszlopa helyett — ugyanaz a kep ket meretben | `rpw-upload.html` | — | `frontend/test-fe-upload.js` | 🟦 csak frontend |
| **F-138** | A kuldes SOSEM automatikus: a lap harom helyen mondta a 'Trimis' szot, pedig csak mentes tortent (18/18 uzenet + minden egyes fajl utan), ezert az ugyfel azt hitte, mar elkuldte. Most a mentes 'incarcat'-ot mond, es csak a gomb 'Trimis'. Ha kuldes UTAN uj fajl kerul fel, a Trimite gomb visszajon, es megmondja, hany uj van | `rpw-upload.html` | — | `frontend/test-fe-upload.js` | 🟦 csak frontend |
| **F-139** | RPW-001: a bukott munkamenet-or MEGALLITJA a lapot, nem csak atiranyit. Eddig a guard() elinditotta az atiranyitast es false-t adott vissza, amit egyetlen hivo sem nezett meg — a lap kozben tovabb futott es kirajzolta az ugyfeleket. Most a lap mar az elso kepkocka elott elrejtodik, a torzs urul, es `replace`-szel megyunk a loginra, hogy a Vissza gomb ne vigyen a vedett lapra | `rpw-auth.js` | — | `unit/test-rpw001-auth-gate.js` | 🟦 csak frontend |
| **F-140** | RPW-001: az adatreteg fail-closed. A rpw-db.js az egyetlen belepesi pont az adatbazishoz; munkamenet nelkul most egyetlen olvasas es egyetlen iras sem indul el (auth_required). Eddig a keres az atiranyitas alatt is kiment a halozatra. FIGYELEM: ez KLIENSOLDALI zar, nem helyettesiti az RLS-t | `rpw-db.js` | — | `unit/test-rpw001-auth-gate.js` | 🟦 csak frontend |
| **F-141** | RPW-001: a lejart vagy VISSZAVONT token azonnali kilepteteshez vezet (enforceSession). A verify() letezett, de sehol nem hivtuk meg, igy egy szerveren mar visszavont token a helyi 12 oras lejaratig ervenyes maradt. Halozati hibanal szandekosan NEM leptetunk ki — az offline munka megmarad | `rpw-auth.js` | — | `unit/test-rpw001-auth-gate.js` | 🟦 csak frontend |
| **F-142** | RPW-001: a szerver-kepesseg kovetelmeny a TENYLEGES uzemmodhoz igazodik. A lista fixen kovetelte a rpw_transition / rpw_requirements fuggvenyeket, amelyek az elo szerveren nem leteznek — igy az AUTH_REQUIRED=true bekapcsolasa halt()-tal megallitotta volna a teljes muhelyt. A diagnosztikai rpw_server_capabilities hianya csak akkor tolerálhato, ha a szigorusag EGYEDUL az auth-kenyszerbol jon; PRODUCTION, szerveroldali atmenet vagy v3-patch mellett a megallas valtozatlan. A halt() ezentul DOM nelkul is lezar | `rpw-guard.js` | — | `unit/test-p0-1-guard.js` | 🟦 csak frontend |

## F-2xx · Avizare daună, dosszié, iratok

| szám | mit csinál | frontend | backend | teszt | állapot |
|---|---|---|---|---|---|
| **F-201** | Avizare dauna: a fejlec gombja EGYENESEN dossziet nyit; a dossziek a KOZOS listaban; a dosszie allapota a folyamat-sav feliratanak elotagja | `index.html` `rpw-progres.js` | — | `frontend/test-fe-panou.js` | 🟦 csak frontend |
| **F-202** | Deschide dosar dauna - a dossziet MI nyitjuk (urlap nelkul, egybol a dosszie lapra) | `index.html` | — | `unit/test-entry.js` | 🟦 csak frontend |
| **F-203** | Preluare dosar dauna - meglevo dosszie atvetele fajlbol | `index.html` | — | `unit/test-dosare.js` | 🟦 csak frontend |
| **F-215** | Duplikatum-figyelmeztetes a dosszie lapon (ugyanaz a rendszam + biztosito + karszam) | `rpw-dosar.html` | `rpw_jobs_list` | `unit/test-dup-dosar.js` | ✅ él |
| **F-204** | Dosszie oldal iratrekeszekkel | `rpw-dosar.html` | — | `unit/test-dosarflux.js` | 🟦 csak frontend |
| **F-205** | Irat feltoltese egy rekeszbe | `rpw-dosar.html` | — | `unit/test-classify.js` | 🟦 csak frontend |
| **F-206** | Irat torlese a rekeszbol | `rpw-dosar.html` | — | `unit/test-dialogs.js` | 🟦 csak frontend |
| **F-207** | Iratszamlalo (hany irat van meg) | `index.html` `rpw-dosar.html` | — | `unit/test-dosare.js` | 🟦 csak frontend |
| **F-208** | Tomeges feltoltes - sok kep egyszerre | `rpw-dosar.html` | — | `unit/test-classify.js` | 🟦 csak frontend |
| **F-209** | AI iratbesorolas - javaslat a rekeszre | `rpw-classify.js` | — | `unit/test-classify.js` | 🟦 csak frontend |
| **F-210** | AI iratbesorolas - szerver oldal (Claude) | `rpw-classify.js` `functions/classify.js` | — | `unit/test-p0-7-functions.js` | ⚠️ nincs bekötve |
| **F-211** | OCR - szoveg kiolvasasa kepbol | `functions/ocr.js` | — | `unit/test-p0-7-functions.js` | ⚠️ nincs bekötve |
| **F-212** | Feltoltesi link kuldese az ugyfelnek | `rpw-dosar.html` | — | **—** | 🟦 csak frontend |
| **F-213** | Fotok kezelese (tomorites, tarolas) | `rpw-photos.js` | — | `unit/test-p0-6-storage.js` | 🟦 csak frontend |
| **F-214** | Regi base64 kepek atkoltoztetese | `rpw-base64-migrate.js` | — | `unit/test-p0-6-storage.js` | 🟦 csak frontend |

## F-3xx · Mentés, offline, gyorsítótár

| szám | mit csinál | frontend | backend | teszt | állapot |
|---|---|---|---|---|---|
| **F-301** | Offline sor - a mentes akkor is megmarad, ha nincs net | `rpw-queue.js` | — | `unit/test-queue.js` | 🟦 csak frontend |
| **F-302** | Kozos sor-peldany (mindenki ugyanabba a sorba ir) | `rpw-queue.js` | — | `unit/test-queue.js` | 🟦 csak frontend |
| **F-303** | Sor ujraindul oldal-ujratoltes utan | `rpw-data.js` | — | `unit/test-queue.js` | 🟦 csak frontend |
| **F-304** | Szinkron-allapot kijelzese (mentve / var / hiba) | `rpw-save.js` | — | **—** | 🟦 csak frontend |
| **F-305** | Helyi gyorsitotar (offline is latszik a munkalap) | `rpw-cache.js` | — | `unit/test-delete.js` | 🟦 csak frontend |
| **F-306** | Regi kulcsok takaritasa induláskor | `rpw-cache.js` | — | `unit/test-delete.js` | 🟦 csak frontend |
| **F-307** | Belepesi kulcsok VEDELME a takaritastol | `rpw-cache.js` | — | `unit/test-delete.js` | 🟦 csak frontend |
| **F-308** | Rendszam maszkolasa a gyorsitotarban | `rpw-cache.js` | — | **—** | 🟦 csak frontend |
| **F-309** | Figyelmeztetes kilepeskor, ha van mentetlen adat | `rpw-save.js` | — | **—** | 🟦 csak frontend |

## F-4xx · Fázis-oldalak

| szám | mit csinál | frontend | backend | teszt | állapot |
|---|---|---|---|---|---|
| **F-401** | Recepcio fazis oldal | `rpw-recepcio-red.html` | — | `frontend/test-fe-transition.js` | 🟦 csak frontend |
| **F-402** | Evaluare fazis oldal | `rpw-evaluare-red.html` | — | `frontend/test-fe-transition.js` | 🟦 csak frontend |
| **F-403** | Tinichigerie fazis oldal | `rpw-tinichigerie-red.html` | — | `frontend/test-fe-transition.js` | 🟦 csak frontend |
| **F-404** | Vopsitorie fazis oldal | `rpw-vopsitorie-red.html` | — | `frontend/test-fe-transition.js` | 🟦 csak frontend |
| **F-405** | Reconstatare fazis oldal | `rpw-reconstatare-red.html` | — | `frontend/test-fe-transition.js` | 🟦 csak frontend |
| **F-406** | Control fazis oldal | `rpw-control-red.html` | — | `frontend/test-fe-transition.js` | 🟦 csak frontend |
| **F-407** | Inchidere (lezaras) fazis oldal | `rpw-inchidere-red.html` | — | `frontend/test-fe-transition.js` | 🟦 csak frontend |
| **F-408** | Audatex arajanlat importalasa | `rpw-evaluare-red.html` | — | **—** | 🟦 csak frontend |
| **F-409** | Dosszie exportalasa lezaraskor | `rpw-inchidere-red.html` | — | `unit/test-oneway.js` | 🟦 csak frontend |
| **F-410** | WhatsApp ertesites kuldese | `rpw-evaluare-red.html` | — | `unit/test-wa.js` | 🟦 csak frontend |
| **F-411** | E-mail kuldes (biztosito, ugyfel) | `rpw-evaluare-red.html` `functions/sendmail.js` | — | `unit/test-p0-7-functions.js` | ⚠️ nincs bekötve |

## F-5xx · Admin és takarítás

| szám | mit csinál | frontend | backend | teszt | állapot |
|---|---|---|---|---|---|
| **F-501** | Takaritas: mi torolheto | `rpw-cleanup.html` | `rpw_cleanup_list` | `unit/test-delete.js` | ✅ él |
| **F-502** | Takaritas: vegleges torles | `rpw-cleanup.html` | `rpw_cleanup_hard_delete` | `unit/test-delete.js` | ✅ él |
| **F-503** | Takaritas szaraz futasa (csak megmutatja, nem torol) | `rpw-cleanup.html` | — | **—** | 🟦 csak frontend |
| **F-504** | Munkaallomasok (posturi) lekerese | `index.html` | `rpw_posts_get` | `integration/test-int-workflow.js` | ✅ él |
| **F-505** | Munkaallomas mentese | `index.html` | `rpw_post_upsert` | `integration/test-int-workflow.js` | ✅ él |
| **F-506** | Munkalap hozzarendelese munkaallomashoz | `index.html` | `rpw_post_assign` | `integration/test-int-workflow.js` | ✅ él |

## F-9xx · Infrastruktúra

| szám | mit csinál | frontend | backend | teszt | állapot |
|---|---|---|---|---|---|
| **F-901** | Szerver-kepesseg ellenorzes (egyezik-e a kliens es a szerver) | `rpw-guard.js` | `rpw_server_capabilities` | `unit/test-p0-1-guard.js` | ✅ él |
| **F-902** | Vesz-leallitas, ha a szerver nem felel meg | `rpw-guard.js` | — | `unit/test-p0-1-guard.js` | 🟦 csak frontend |
| **F-903** | Szigoru mod feltetele (mikor allitunk le tenyleg) | `rpw-guard.js` | — | `unit/test-p0-1-guard.js` | 🟦 csak frontend |
| **F-904** | Kliens konfiguracio | `rpw-config.js` | — | `unit/test-p0-1-guard.js` | 🟦 csak frontend |
| **F-905** | Belso fajlok kizarasa a nyilvanos deploybol | `netlify.toml` | — | `unit/test-deploy.js` | 🟦 csak frontend |
| **F-906** | JSON melysegi osszefesules a mentesnel | `rpw-queue.js` | `jsonb_deep_merge` | `unit/test-queue.js` | ✅ él |

## Mit jelentenek az állapotok

- **✅ él** — a frontend hívja, a backend válaszol, teszt őrzi.
- **🟦 csak frontend** — a böngészőben fut, szervert nem igényel.
- **🟧 csak backend** — az adatbázisban készen áll, de a felület még nem használja.
- **⚠️ nincs bekötve** — meg van írva, de éles üzemben ki van kapcsolva (kapcsoló, kulcs vagy migráció hiányzik).
