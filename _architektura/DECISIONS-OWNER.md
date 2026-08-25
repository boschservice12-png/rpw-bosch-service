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
