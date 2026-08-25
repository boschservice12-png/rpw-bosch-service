# QUESTIONS-FOR-OWNER — a tulajdonos döntését igénylő kérdések (L1 után)

> Ezek NEM technikai kérdések. Mindegyik mögött kész alternatívák állnak;
> a kód egyiket sem dönti el helyetted. A K-1 a legfontosabb — arra épül minden.

## K-1 · Ügy és munkalap szétválasztása (E-1) — A LEGFONTOSABB

Ma egy `job` objektum az ügy ÉS a munkalap egyben. A spec szerint: külön Case,
külön WorkOrder, 1 ügy : N munkalap (alapmunka / pótmunka / visszajavítás).

- **A opció — valódi szétválasztás:** új `rpw_cases` tábla + a munkalapok
  `case_id`-vel. Nagy átalakítás (adatmodell + migráció + minden ablak), de a
  spec teljes A/B architektúrája megépíthető. A pótmunka külön munkalap lesz,
  saját fázisokkal.
- **B opció — logikai szétválasztás a mai modellen:** a `job` marad, de a
  mezői két védett csoportba válnak (ügy-mezők ↔ munka-mezők), és a két
  csoportot külön jogosultság + külön mentési út kezeli. Kisebb munka, a
  jelenlegi adatok érintetlenek — de 1 ügy : N munkalap TOVÁBBRA SEM lesz.
- **Kérdés:** előfordul-e a valóságban, hogy EGY kárügyhöz KÉT külön munkalap
  kell (pl. pótszemle után második kör, vagy visszajavítás új lapon)? Ha igen,
  csak az A opció jó. Ha a rework[]-bejegyzés elég, a B olcsóbb.

## K-2 · Mi legyen a Centru de Control fülein? (E-2)

A műhelyben lévő autók ma nem látszanak a főablak fülein — csak a bal-menü
„Lucrări" képernyőn és a „Ce facem azi?" modalban.

- **A:** ötödik fül „În lucru" a főablakon (a spec „elakadt munkák jelzése"
  követelménye ide mutat).
- **B:** marad így — a főablak az ügykezelésé, a műhely a Lucrări képernyőé.
- **Kérdés:** a recepciós lássa-e egy helyen a futó munkákat is?

## K-3 · Ratat szabályozása (E-3)

Ma egy kattintás, jog/indok/megerősítés/audit nélkül.

- **A:** megerősítés + kötelező rövid indok + audit (szerveren) — ajánlott.
- **B:** marad egykattintásos (gyors pult-munka), de auditsorral.
- **Kérdés:** ki minősíthet ügyfelet „ratat"-ra, és kell-e indok?

## K-4 · Mit jelentsen az „értesítve" (WhatsApp)? (E-4)

Ma a wa.me-link megnyitása = értesítve; és ez az EGYETLEN feltétele a
„Deschide lucrarea"-nak.

- **A:** a link-megnyitás csak „kísérlet"; az „értesítve" kézi megerősítés
  („beszéltem vele") — a kommunikációs modul (25. pont) előfutára.
- **B:** marad, de a feltétel-ikonsor többi eleme (loc/om) is kapuvá válik (E-5).
- **Kérdés:** mi a minimum a jármű fogadásához: csak értesítés, vagy hely+ember is?

## K-5 · A főablak-műveletek auditja (E-6)

Legacy módban (a mai éles) a reprogramare, ratat, feltétel-módosítás nyom
nélkül fut. A secure mód ezt megoldja, de a cutoverig alszik.

- **Kérdés:** elfogadod-e, hogy a teljes audit a cutoverrel jön (nem külön
  köztes megoldással)? A köztes megoldás (kliens-oldali naplózás) hamisítható,
  ezért NEM ajánlott — de mondd ki te.

## K-6 · Mi a „Separat" fül üzleti jelentése?

A kód szerint egy kézi flag (job.separat), amit a szerkesztő-ablakban lehet
állítani. Sehol máshol nincs rá szabály.

- **Kérdés:** mire használjátok ma? (Pl. flottás? magánmegállapodás? teszt?)
  E nélkül nem lehet állapotgépbe illeszteni.

## K-7 · A duplikált belépőpont sorsa (E-8)

A „Lucrări" képernyőn saját „új munka" gomb + Import ZIP él a panou 3 gombja
mellett.

- **A:** a Lucrări képernyő csak NÉZET legyen, létrehozás csak a főablakról.
- **B:** marad mindkettő.
- **Kérdés:** használja-e valaki ma az Import ZIP-et és a Lucrări-oldali
  létrehozást?

## K-8 · „Ce facem azi?" mint kötelező napindító?

Ma naponta egyszer magától felugrik, bezárható következmény nélkül.

- **Kérdés:** legyen-e olyan elem (pl. késett ügyek), amelynél a bezárás
  döntést kér („átütemezem / ratat / ma hívom")? Ez a spec „elakadt ügyek"
  követelményének erősebb olvasata.

---

*A válaszok után folytatom az L2 (Kárügy létrehozása és ügyadatlap —
`rpw-dosar.html`) feldolgozásával, ugyanebben a mélységben.*
