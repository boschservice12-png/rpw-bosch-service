# ARCHITECTURE-TARGET-STATE — célarchitektúra (a 27 tulajdonosi döntésből)

> A jelen állapotot az L1–L12 dokumentumok írják le bizonyítékokkal
> (ARCHITECTURE-CURRENT-STATE.md összegzi). Ez a dokumentum a CÉL — minden
> pontja egy K-döntésre hivatkozik, kitalált elem nincs benne.

## 1. A főablak (Centru de Control) célképe

```
FELSŐ GOMBOK:  Ce facem azi?  ·  Programare nouă  ·  Lucrare nouă
FÜLEK:         Viitoare · AVIZARE DAUNĂ (új, K-19) · Ratate · Arhivate · Separat
```

- **Avizare daună fül (K-19):** a biztosítós kárügyek listája ÉS létrehozási
  helye — a mai felugró kék modal ide költözik; a Viitoare-ból a dossziék
  kiválnak (a 2026-08-25-i összevonás visszafordul).
- **Viitoare-soron (K-19):** biztosítós javításnál kétállapotú jelvény:
  „Avizare daună" (deschid) / „Dosar deschis" (deschis).
- **Ce facem azi? (K-2, K-8):** marad az egyetlen műhely-áttekintő a főablakon;
  a késett tételeknél a bezárás DÖNTÉST kér (átütemezem / ratat / ma hívom);
  a 3+ átütemezésű ügyek (K-16) külön sávot kapnak.
- **Ratat (K-3):** csak elmúlt időpontú előjegyzésen értelmezett; auditált.
- **Egy belépőpont (K-7):** létrehozás csak a főablakról; a Lucrări-képernyő
  létrehozó gombja + Import ZIP kivezetve (nézet marad).

## 2. Ügy-oldal (A-rendszer)

- **K-1/B:** a `job` A-mezőcsoportja = az ügy; mezőszintű jogosultság
  (`rpw_patch_permissions`) kényszeríti, hogy `work` jog ne írjon ügy-mezőt.
- **K-4:** az 5. fogadási feltétel = „utolsó egyeztetés az ügyféllel" — kézi
  megerősítés; a wa.me-linknyitás önmagában nem állítja.
- **K-9:** a doar_dosar ügy lezárási szabálya SAJÁT: minden kötelező irat
  (vagy indokolt hiány) + dosarPredat — NEM a javítási phase-7 lista.
- **K-10:** a Predat-dátum módosítása/törlése figyelmeztet (mit indít újra),
  nem blokkol; auditált.
- **K-11:** ügyfél-feltöltő link: egyszer használatos token + lejárat +
  visszavonás + fájltípus/méret-limit + audit.
- **K-25 (a K-12 pontosítása):** a lezárás UTÁN automatikusan elkészül a FIX,
  TELJES dokumentum-ZIP a saját Storage-ba; a SIKERES mentés állítja a
  `separat` állapotot (CASE_ARCHIVED esemény).
- **K-13/K-14:** külföldi rendszám/telefon lazább mintával + jelölővel;
  múltbeli dátum engedett (utólagos rögzítés), de megkülönböztetve a valós
  késéstől.
- **K-15:** előjegyzéskor napi kapacitás-figyelmeztetés a SZERVERI
  paraméterekből (K-26) — nem blokkol.
- **K-16:** a 3. átütemezéstől kötelező indok + ki ütemezett át; azi-jelzés.

## 3. Munka-oldal (B-rendszer)

- **K-20:** minden „ki csinálta" (sor-Elvégezte, ellenőr, átadási felelős) a
  BEJELENTKEZETT dolgozó — egy kattintás; gépelt név csak jelölt kivétel.
- **K-21:** pótmunka/aftersales termelésbe engedése rögzíti: ki + mikor.
- **K-22:** Audatex-import ésszerűség-ellenőrzéssel + felülírás-megerősítéssel.
- **K-23:** fázis-terv és munkaállomás-beosztás megépül, kezelése KIZÁRÓLAG
  jogosult szerepkörnek; a dolgozó látja, nem módosítja.
- **K-24:** rework határidő NÉLKÜL marad (a lezárás-blokkolás védi a minőséget).
- **K-17 (L4, nyitott A/B):** a recepció-lap doar_dosar ügyre — javasolt: elutasít.

## 4. Platform

- **K-5:** minden módosító művelet auditál — a szerveroldali (v3/006/007/008)
  úton; hamisítható kliens-napló NEM épül. Ez a cutover fő indoka.
- **K-26:** a Parametri a szerverre költözik (tenantonként egy készlet,
  vezetői joggal); a kapacitás-szám (K-15) ebből jön.
- Fail-closed lánc (guard→bootstrap) és a 008-as kivezetések a már megépített
  v2-konszolidációs csomagból élesednek (külön terv: DEPLOYMENT.md).

## 5. Ami TUDATOSAN nincs a célban (döntés szerint)

- Külön Case-tábla / 1 ügy : N munkalap (K-1/B) — a pótmunka rework marad.
- „În lucru" ötödik fül (K-2) — az azi-modal a műhely-ablak.
- Rework-határidő (K-24).
- K-27 (szerveroldali statisztika) — NYITOTT, addig marad a kliens-oldali.
