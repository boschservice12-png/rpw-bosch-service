# DECISIONS-OWNER — a tulajdonos döntései (Ferenc, 2026-08-25)

> Szó szerinti válaszok + az értelmezésük. Ha egy értelmezés téves, ELÉG EGY SZÓ,
> és javítom — minden későbbi terv ezekre épül.

| # | döntés | értelmezés (erre építek) |
|---|---|---|
| **K-1: B** | logikai szétválasztás a mai modellen | NINCS külön Case-tábla. A `job` mezői két védett csoportra válnak (ügy-mezők ↔ munka-mezők), külön jogosultsággal és külön mentési úttal. 1 ügy : N munkalap NEM követelmény — a pótmunka marad rework-bejegyzés. |
| **K-2: nem** — „a Ce facem azi értesít" | NINCS ötödik fül | A műhelyben lévő autókról a főablak a „Ce facem azi?" modalon keresztül ad képet; a Lucrări képernyő marad a műhely-nézet. |
| **K-3** — „ha nem jön az ügyfél, késik a programálás" | a Ratat jelentése és feltétele | Ratat = a programált időpont elmúlt és az ügyfél nem jött. A gomb CSAK akkor legyen értelmezett, ha az időpont már elmúlt; auditsorral (K-5). Külön indok-szöveg nem kötelező. |
| **K-4** — „utolsó egyeztetés az ügyféllel" | mit jelent az „értesítve" | A WhatsApp-link megnyitása önmagában NEM „értesítve". Az ötödik feltétel jelentése: az UTOLSÓ egyeztetés megtörtént az ügyféllel (kézi megerősítés). Ez marad a „Deschide lucrarea" kapuja. |
| **K-5** — „audit legyen" | audit kötelező | Az L1 minden módosító művelete auditsort kell hagyjon. Hamisítható kliens-naplót NEM építünk — a szerveroldali audit a cutoverrel jön; addig ez a cutover melletti legerősebb érv. |
| **K-6** — „a javítás lezárása egy fájlban, menthető a saját storage-ban" | a Separat fül jelentése | A lezárt javítás TELJES dokumentációját EGY fájlba (ZIP) kell összefogni, és a SAJÁT tárhelyre (Supabase Storage) menteni — nem csak letölteni. A Separat fül az így archivált ügyeké. Ez új célkövetelmény az L8/lezárás felé (a mai export csak böngésző-letöltés). |
| **K-7** — „egy belépő" | egy létrehozási belépőpont | Munkalap/ügy létrehozás CSAK a főablak három gombjáról. A Lucrări képernyő létrehozó gombja és az Import ZIP kivezetendő (nézet marad). |
| **K-8: igen** | a napindító döntést kér | A „Ce facem azi?" a késett tételeknél nem zárható be némán: döntést kér (átütemezem / ratat / ma hívom). |

## L2 utáni döntések (2026-08-25)

| # | döntés | értelmezés (erre építek) |
|---|---|---|
| **K-9: igen** | a kárügynek (doar_dosar) SAJÁT lezárási feltétele lesz | minden kötelező irat megvan (vagy indokolt hiány) + dosarPredat kitöltve — NEM a javítási phase-7 szabályai. Szerveroldali szabályként (külön ág a lezárásban). |
| **K-10: csak figyelmeztető** | a „Predat la asigurător" nem zárolódik | átírásnál/törlésnél FIGYELMEZTETÉS (mit indít újra: 3 nap / 30 nap), de nem blokkol; auditsor a K-5 szerint. |
| **K-11: védett, egyszer használatos token** | ügyfél-feltöltő link teljes védelme | egyszer használatos token + lejárat + visszavonhatóság + fájltípus/méret-limit + feltöltés-audit (a spec 20. pontja teljes egészében). |
| **K-12: Arhivează** | az archívum KÜLÖN gombbal készül | a lezárt ügyön külön „Arhivează" gomb készíti a ZIP-et a saját storage-ba; a SIKERES mentés teszi az ügyet „Separat"-tá. Nem automatikus a lezáráskor. |

## L3 utáni döntések (2026-08-25)

| # | döntés | értelmezés (erre építek) |
|---|---|---|
| **K-13: igen** | külföldi ügyfél felvehető | lazább rendszám/telefon-minta + „külföldi" jelölő; a szigorú román minta ajánlásként megmarad (figyelmeztet, nem blokkol). |
| **K-14: utólagos rögzítés** | múltbeli dátum marad | a múltbeli dátum ENGEDETT (utólagos rögzítésre használjátok); a felületen jelölés különbözteti meg a valóban késett prognózistól (utólag rögzített ≠ késett riasztás). |
| **K-15: igen** | napi kapacitás-figyelmeztetés | előjegyzéskor a rendszer a Parametri-oldal kapacitás-értékéből számol, és figyelmeztet („erre a napra már N autó"); nem blokkol. |
| **K-16: 3** | átütemezési küszöb | a 3. átütemezéstől: kötelező indok + a „Ce facem azi?" napindító külön jelzi (K-8 kapcsolódás); az előzmény mostantól a KI-t is rögzíti. |

## L4 közbeni iránydöntés (2026-08-25)

| # | döntés | értelmezés (erre építek) |
|---|---|---|
| **K-19** — „a Programare lapon egy Avizare daună fül; itt nyissuk a biztosító-dossziékat; a programált biztosítós autónál 2 állapot: Dosar deschis vagy Avizare daună" | a főablak cél-szerkezete | (1) A főablak fülei közé bekerül egy **„Avizare daună"** fül: a biztosítós kárügyek (doar_dosar) OTT listázódnak és OTT nyílnak — nem a mai felugró kék ablakból, és nem a Viitoare-ba összemosva (a 2026-08-25-i „egy lista" összevonás ezzel visszafordul). (2) A Viitoare-fülön a biztosítós javításra programált autó soron KÉT állapot egyike látszik: **„Dosar deschis"** (dosarStatus='deschis') vagy **„Avizare daună"** (dosarStatus='deschid'). Megvalósítás: az IMPLEMENTATION-BACKLOG-ba, az elemzési fázis után. |

## L5–L6 utáni döntések (2026-08-25)

| # | döntés | értelmezés (erre építek) |
|---|---|---|
| **K-20: igen** | „Elvégezte" = bejelentkezett dolgozó | a sorok lezárásánál a bejelentkezett munkamenet neve kerül be egy kattintással; gépelt név csak kivételes útként, jelölve. |
| **K-21: legyen — kontrollálni, ki csinálta** | pótmunka-jóváhagyás nyommal | a reconstatare/aftersales termelésbe engedése rögzíti: KI (bejelentkezett név) + MIKOR + mit; visszakereshető. |
| **K-22: igen** | Audatex ésszerűség-ellenőrzés | importált óra/összeg határok között; felülírás előtt megerősítés; a törlés nyomot hagy. |
| **K-23: „a jogosultak operálhatnak csak"** | fázis-terv jogosultsághoz kötve | a fázis-terv / munkaállomás-beosztás megépül, de KIZÁRÓLAG az arra jogosult szerepkör (műszakvezető/irodavezető) kezelheti — a dolgozó látja, nem módosítja. *(Ha úgy értetted, hogy NE épüljön meg, csak a jogosultság-szigorítás kell — egy szó, és javítom.)* |

## L7–L8 utáni döntés (2026-08-25)

| # | döntés | értelmezés (erre építek) |
|---|---|---|
| **K-25: nem — fix; lezárás után mentődik** | az archívum-ZIP | FIX, mindig TELJES csomag (nincs szelektor), és a sikeres lezárás UTÁN automatikusan mentődik a saját storage-ba; a sikeres mentés teszi az ügyet „Separat"-tá. **Ez pontosítja a K-12-t: nem külön kézi gomb — a lezárás után fut.** |
| **K-24** | — | MÉG NYITOTT (rework-határidő + azi-jelzés). |

## L9–L12 utáni döntések (2026-08-25)

| # | döntés | értelmezés |
|---|---|---|
| **K-26: igen, szerver oldal** | a Parametri a szerverre költözik | tenantonként EGY paraméter-készlet a DB-ben; szerkesztés vezetői (`team`) joghoz kötve; a kliens csak olvassa. |
| **K-24: nem** | nincs rework-határidő | a rework marad határidő nélkül; a lezárás-blokkolás (nyitott rework) változatlanul él. |
| **K-27** | — | NYITOTT — addig a statisztika a mai (kliens-oldali) marad. |

