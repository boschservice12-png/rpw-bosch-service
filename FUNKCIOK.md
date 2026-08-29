# RPW funkció-nyilvántartás

> Ezt a fájlt **gép írja**: `node _registry/generate.js`.
> A forrás a `_registry/funkciok.json`. Az őre a `_tests/unit/test-registry.js`.

Minden funkciónak **állandó száma** van. A szám soha nem változik és nem használjuk újra.
Ha egy lépés eltűnik vagy átalakul, a teszt a **számával** jelzi. Ha új funkció kerül be
szám nélkül, azt is megmondja.

| összesen | él | csak frontend | csak backend | nincs bekötve | teszt nélkül |
|---|---|---|---|---|---|
| 122 | 30 | 79 | 5 | 8 | 7 |

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
| **F-143** | RPW-002: RLS-lezaras az ELO adatbazis alakjara (008). A teljes kitettseg egyetlen objektumon allt: a 'rpw_jobs anon rw' policy (USING true) plusz az anon SELECT/INSERT/UPDATE/DELETE jog — barki, aki ismerte a nyilvanos anon kulcsot, olvashatta, irhatta es torolhette mind a 33 elo munkat. A migracio megszunteti a policy-t, visszavonja a tabla-jogokat, kikenyszeriti az RLS-t, es NEVRE SZOLOAN csak a tenant-biztos, tokenre epulo RPC-knek ad EXECUTE-ot | `_migrations/008_rls_lockdown_live.sql` | — | `integration/test-int-rls-live.js` | ⚠️ nincs bekötve |
| **F-144** | RPW-002: a 008 elofeltetel-ellenorzese es visszaallitasa. Ha barmelyik szukseges fuggveny hianyzik, a migracio megszakad, es felbehagyott allapot nem marad (a tranzakcio visszagordul). A 008_rollback.sql masodpercek alatt visszaadja a regi mukodest — ez az azonnali kiut, ha a lezaras utan megall a munka | `_migrations/008_rls_lockdown_live.sql` `_migrations/008_rollback.sql` | — | `integration/test-int-rls-live.js` | ⚠️ nincs bekötve |
| **F-145** | Az ugyfel WhatsApp-feltolto lapja KIFEJEZETTEN nyilatkozik magarol (RPW_PUBLIC_PAGE), es csak ezzel mentesul az RPW-001 adatreteg-zara alol. Enelkul az AUTH_REQUIRED=true bekapcsolasa NEMAN megbenitotta volna a teljes ugyfel-feltoltest: az a lap szandekosan PIN nelkuli, a zar viszont minden olvasast es irast tiltott. A mentesseg nem talalgatas — dolgozoi lap nem nyilatkozhat igy | `rpw-upload.html` `rpw-db.js` | — | `unit/test-rpw001-auth-gate.js` | 🟦 csak frontend |
| **F-146** | Szuk ugyfel-ut (009): az ugyfel a WhatsApp-linkrol PIN nelkul tolt fel, ezert a 008 lezaras elvagta volna. Ket szuk fuggveny lep a helyere. rpw_client_job_get CSAK azt adja vissza, amit a feltolto lap kirajzol (dossziészam, rendszam, marka, iratok, feltoltesek) — telefonszamot, ugyfelnevet, belso jegyzetet, fazisallapotot NEM; ez adatvedelmi szigoritas is, mert ma a lap a TELJES sort megkapja. rpw_client_upload CSAK harom kulcsot ir (clientUploads, dosarActe, clientGata), minden mas mezot forbidden_field-del elutasit. Kliensoldalon a CLIENT_RPC kapcsolo vedi, hogy a mai uzem ne torjon el a migracio alkalmazasa elott | `rpw-db.js` `rpw-config.js` | `rpw_client_job_get` `rpw_client_upload` | `integration/test-int-rls-live.js` | ✅ él |
| **F-147** | Egy igazsag az ELO cimrol: amit a rendszer eleskent hirdet (a file://-or linkje a rpw-config.js-ben), az all a Netlify-funkciok CORS-listajanak elen is. 2026-08-29-en pont ez csuszott szet — a config a REGI cimre kuldott, mikozben a kod az UJRA epult, es a muhelyben a kilenc napos valtozat futott. Az elo cim: rpw-bosch-service.netlify.app | `rpw-config.js` `functions/_shared.js` | — | `unit/test-p0-7-functions.js` | ✅ él |
| **F-148** | A szerelok belephetnek a panelbe, de nem modosithatnak. A szerep-lekepezes nem ismerte a 'Szerelo' munkakort, ezert a belepetes 11 emberbol 6-ot kizart volna. Ferenc dontese: lassanak mindent, de fazist ne leptessenek — ez az 'auditor' szerep. A tiltas az ADATRETEGBEN all (a panel a fazis-muveleteket nem koti szerephez, es az elo rpw_patch_v3 egyaltalan nem nez szerepet): olvasas atmegy, minden iras read_only-val elutasitva. FIGYELEM: kliensoldali korlat, a szerver ma nem ellenoriz szerepet | `rpw-roles.js` `rpw-db.js` | — | `unit/test-rpw001-auth-gate.js` | 🟦 csak frontend |
| **F-149** | A munkamenet KET vonala. Az app_session tablan ket szemelyzeti vonal fut egymas mellett: a regi ERP (employee_id -> employees) es az RPW2 sajat (rpw_employee_id -> rpw_employees). A belepo lap a rpw2_login-t hivja, ami az UJ vonalra ir, employee_id NULL-lal. A rpw_session — amin a rpw__ctx, es rajta keresztul a rpw_jobs_list / rpw_job_get / rpw_patch_v3 all — CSAK a regi vonalat ismerte, ezert az ervenyes munkamenetet sem talalta meg: 2026-08-29-en a bekapcsolt belepetes utan URES lett a panel. A 010 a regi utat valtozatlanul hagyja, es csak akkor lep a masodik agra, ha az elso nem talalt. A szerep a rpw_roles LABEL-je (pl. 'Muszakvezeto'), mert a kliens RPWRoles.mapEmployeeRole ezt a magyar munkakort varja. A hiba KIZAROLAG bekapcsolt belepetesnel jelentkezik — ezert maradt rejtve | — | `rpw_session` | `integration/test-int-session-lineage.js` | 🟧 csak backend |
| **F-150** | A bero-ellenorzes nelkuli irasi utak lezarva (012). A rpw_patch es a rpw_patch_v2 SECURITY DEFINER, de NEM ker tokent es NEM nez szervizt — miközben minden mas irasi ut igen. Amig az anon futtathatta oket, a lapban levo kulcs + egy munkaazonosito BELEPES NELKUL is irasi jog volt, tehat a 2026-08-29-en bekapcsolt beleptetes megkerulheto maradt. A 012 elveszi a jogot — a PUBLIC-tol IS, mert Postgresben a fuggvenyek alapbol PUBLIC-futtathatok, es az elso nekifutasom ezt kihagyta (az ellenorzo lekerdezes fogta meg). Merve: 24 ora alatt egyszer sem hivta oket senki. FIGYELEM: a visszaallas mostantol ket lepes — AUTH_REQUIRED=false vagy CLIENT_RPC=false eseten a 012_rollback.sql-t is futtatni kell, kulonben a mentes neman elhal | `rpw-config.js` | `rpw_patch_v2` | `unit/test-rpc-consistency.js` | 🟧 csak backend |
| **F-151** | A kicsupaszitott gyorsitotar nem mehet vissza a szerverre. A RPWCache.setJob SZANDEKOSAN hianyos objektumot tarol (nincs benne client, phone, vin, photos, elements, closing), KILENC lap viszont ezt toltotte a JOB-ba es mentette vissza. Ket hiba egyszerre: a JSON.stringify(null) a 'null' STRING, ami igaz — az or sosem vedett; es ha volt bejegyzes, egy ingadozó halozat az adatvedelmi funkciobol ADATVESZTEST csinalt. A minimal() mostantol megjeloli magat (__min), es a getFullJobJson a MIN-bejegyzest soha nem adja ki teljes munkakent. A letezes-vizsgalat a lapokon azert kell, mert a sw.js kiszolgalhat REGI rpw-cache.js-t az UJ laphoz. A halott frissesseg-osszehasonlitas (_lts) is kikerult | `rpw-cache.js` `rpw-inchidere-red.html` `rpw-dosar.html` | — | `unit/test-min-cache.js` | 🟦 csak frontend |
| **F-152** | A munkaazonosito nem lephet ki az inline kezelobol. Nyolc lapon a job.id NYERSEN kerult egy onclick attributumon beluli JS-stringbe, mikozben a rendszam mellette escape-elve volt. Az azonosito az adatbazisbol ES az URL-bol jon (a gJI a nyers query parametert adja), tehat egy aposztrof kilepett volna belole. Mostantol escH(encodeURIComponent(...)). A zarojelet az encodeURIComponent nem kodolja, es nem is kell: a string belsejeben artalmatlan, kilepni idezojellel lehetne — az viszont %27/%22 lesz | `rpw-dosar.html` `rpw-inchidere-red.html` | — | `unit/test-kodreview-0829.js` | 🟦 csak frontend |
| **F-153** | A lezaro fotok jelvenye ne hazudjon. A torles (delClosePhoto) NULL-t hagy a tombben, a jelveny viszont photos.length-t szamolt: 2 valodi foto + 3 torolt hely is 5/5-ot mutatott, ZOLDEN. FONTOS: a LEZARAS maga jol szamolt (RPWWorkflow.realPhotoCount szuri a lyukakat), tehat hianyos munkat NEM lehetett lezarni — a jelveny hazudott, es a dolgozo ertetlenul allt a hibauzenet elott. Mostantol ugyanaz a fuggveny szamol, mint ami enged vagy tilt | `rpw-inchidere-red.html` `rpw-workflow.js` | — | `unit/test-kodreview-0829.js` | ✅ él |
| **F-154** | A fuggo mentes ne vesszen el. A fazislapok 500-600 ms-ra kesleltetik a mentest; aki ezen belul zarja be a fulet vagy valt at masik alkalmazasra, az csendben elvesziti a szerkesztest — mikozben a kepernyo mar az uj erteket mutatta. Kozos kijarat a rpw-save.js-ben (onExit), egyszer bekotve a pagehide-ra ES a visibilitychange-re; a hat fazislap bejelenti a sajat uritojet. A visibilitychange azert kell, mert telefonon az alkalmazas-valtas a gyakori, es ott a pagehide nem mindig fut le | `rpw-save.js` `rpw-inchidere-red.html` | — | `unit/test-kodreview-0829.js` | 🟦 csak frontend |
| **F-155** | Az anon hatokoru gyorsitotar tenyleg dobodjon el, es a rovid lejarat maradjon rovid. Ket kulon hiba: (1) a rpw-cache.js fejlece azt igerte, hogy a belepes elott keletkezett bejegyzesek a kovetkezo belepeskor eldobodnak — de NEM volt ra kod, igy kozos muhelygepen a kovetkezo ember a sajat belepese elott meg olvashatta az elozo munkamenet gyorsitotarazott munkalistajat; mostantol a dropScope('anon') fut a belepeskor. (2) A set() kvota-ujraprobalasa beegetett 24 oras TTL-t hasznalt a hivo ertekе helyett: aki 5 perces lejarattal tarolt, takaritas utan 24 orat kapott — epp a rovid lejaratu, erzekenyebb bejegyzesek eltek tovabb a kelletenel | `rpw-cache.js` `rpw-auth.js` | — | `unit/test-kodreview-0829.js` | 🟦 csak frontend |
| **F-156** | Amit a `prepare` irt, az is gorgodjon vissza. A kodreview azt allitotta, hogy a prepare es a mutate-callback duplan alkalmazza a lezarasi idot — UTANANEZTEM, ez nem igy van: a ketto ket KULON ut (SERVER_TRANSITIONS=false -> mutate; true -> prepare, es ott a mutate le sem fut). VALODI hiba viszont, hogy a szerver-ag elutasitaskor NEM gorgette vissza, amit a prepare beirt (pl. closing.closedAt), pedig a helyszini megjegyzes azt igeri, hogy a helyi allapot valtozatlan marad — a lap igy lezarasi datumot mutatott volna egy le NEM zart munkan. Uj snapshotJob/restoreJob: az objektum AZONOSSAGA megmarad, csak a tartalma all vissza. MARAD: a prepare utani save mar kiirta a felkeszitett mezoket a szerverre; a memoria es a localStorage visszaall, a szerveren levo masolat a kovetkezo mentesig a felkeszitett erteket tartja — tudatos, mert egy ujabb halozati hivas az elutasitas pillanataban maga is elbukhat. Ma alszik (SERVER_TRANSITIONS=false), de az RPW-003 ezt az utat kapcsolja be | `rpw-workflow.js` | — | `unit/test-kr4-prepare-rollback.js` | 🟦 csak frontend |
| **F-157** | A betoltesi hiba ne 'nincs munka' legyen. Halozati hiba, lejart munkamenet es jogosultsag-megtagadas eddig UGYANAZT a 'Nu exista lucrare' uzenetet adta, mint egy tenyleg nem letezo munka. Az operator termeszetes reakcioja erre: felveszi ujra a dossziet — duplikatum, epp az ellenkezoje annak, amit a rendszer poka-yoke szabalyai mashol vednek. Kozos hibakepernyo a rpw-util.js-ben: kimondja, hogy a munka NEM tunt el, hogy ne vegyenek fel ujat, es felkinal ujraprobalast. Lejart munkamenetnel MAS uzenet (ott belepni kell). A gombok addEventListener-rel mennek, nem inline handlerrel — igy szigoru CSP mellett is mukodnek. Bekotve mind a nyolc fazislapra | `rpw-util.js` `rpw-inchidere-red.html` `rpw-dosar.html` | — | `unit/test-kodreview-0829.js` | 🟦 csak frontend |
| **F-158** | A rendszam-maszk tenyleg maszkoljon. Harom ponton engedett: 'MS-01-AAA' -> 'MS-…-AAA' (het karakterbol ot kiszivargott, a kozepso ket szamjegy szaz lehetoseg — a jarmu a muhely udvaran azonosithato); 'MS-1234' -> 'MS…234'; es ot karakter alatt VALTOZATLANUL ment vissza, vagyis egyaltalan nem maszkolt. Mostantol csak a megyekod marad, es SOHA nem adja vissza a bemenetet valtozatlanul. A biztonsagi teszt is szigorodott: nem a szoveget rogziti, hanem azt, hogy az utolso szegmens es a szamjegyek NEM szivarognak ki | `rpw-cache.js` | — | `unit/test-security-a-o.js` | 🟦 csak frontend |
| **F-159** | A ZIP-export ne legyen csendben hianyos. A fetchBlob barmilyen hibanal null-t adott, es a hivas helye egyszeruen tovabblepett: a fajl kimaradt az archivumbol, szo nelkul. Egy biztositoi dossziebol csendben hianyzo constatare.jpg nem kenyelmi kerdes, hanem megfelelosegi. Mostantol kozos hozzaado szamolja a kimaradasokat, a zaro uzenet jelzi, es maga a ZIP is tartalmaz egy HIANYZO_FAJLOK.txt-t — igy a dosszie kesobbi olvasoja is latja, nem csak az, aki exportalt | `rpw-inchidere-red.html` | — | `unit/test-kodreview-0829.js` | 🟦 csak frontend |
| **F-160** | Ket apro, ami neman nyelt. (#14) A loadJob ketszer gyorsitotarazott ugyanabban a lefutasban — az egyik kikerult hat lapon. (#15) A resize() se a FileReader, se az Image hibajat nem kezelte: egy serult vagy nem tamogatott kepfajl eseten SEMMI nem tortent — a dolgozo megnyomta a gombot, es a foto nem jelent meg, hibauzenet nelkul. Mostantol szol, es megmondja, melyik lepesnel (olvasas / formatum / konverzio) | `rpw-inchidere-red.html` `rpw-reconstatare-red.html` | — | `unit/test-kodreview-0829.js` | 🟦 csak frontend |

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
