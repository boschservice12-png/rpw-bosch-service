<?php

declare(strict_types=1);

namespace App\Application;

/**
 * Az AI-promptok SZÓ SZERINT a functions/ocr.js és functions/classify.js fájlokból
 * (a műhelyben bevált szövegek). Ne itt fogalmazd át — a kimenet mezőneveit a
 * DocumentAi sémái rögzítik, és azokat a felület olvassa.
 */
final class AiPrompts
{
    public const TALON = <<<'TXT'
Analizeaza acest talon auto romanesc (Certificat de inmatriculare).
Returneaza DOAR JSON valid, fara explicatii:
{
  "plate": "numarul de inmatriculare exact din campul A (ex: MS-50-BSS) sau null",
  "vin": "VIN din campul E, EXACT 17 caractere alfanumerice (doar litere mari si cifre, FARA O/I/Q) sau null",
  "brand": "marca din campul D.1 (ex: DACIA, FIAT, VW, BMW) sau null",
  "model": "model din campul D.3 (ex: LOGAN, ADRIATIK, GOLF) sau null",
  "year": "anul de prima inmatriculare din campul B, DOAR cele 4 cifre ale anului (ex: din 21.05.2009 extragi 2009) sau null",
  "capacitate": "capacitate cilindrica din campul P.1, doar numar cm3 (ex: 2287, 1598) sau null",
  "owner": "proprietarul din campul C.2.1 (numele complet: persoana sau firma ex: SZKALICZKI SERVICE S.R.L., POPESCU IOAN) sau null"
}

REGULI CRITICE:
1. VIN: EXACT 17 caractere. Daca citesti mai multe sau mai putine, ai gresit - reverifica. Nu contine litere O, I, Q.
2. YEAR: NU folosi anul din campul K (e1*2001/116*0386*03 este COD DE OMOLOGARE, nu an). Foloseste DOAR campul B care contine data de prima inmatriculare.
3. OWNER: Folosi DOAR campul C.2.1 (numele firmei sau persoanei). NU confunda cu campul C.2.3 (adresa - strada, localitate).
4. Daca un camp nu este clar citibil, pune null (nu ghici).
TXT;

    public const BULETIN = <<<'TXT'
Buletin de identitate romanesc (CI).
Extrage si returneaza DOAR JSON:
{
  "name": "numele complet sau null",
  "address": "adresa completa (oras, judet, strada) sau null",
  "cnp": "CNP 13 cifre sau null"
}
Doar JSON.
TXT;

    public const CONSTATARE = <<<'TXT'
Analizeaza acest document romanesc: Constatare amiabila, Proces verbal de dauna, sau Deviz de la asigurator.
Extrage toate informatiile relevante.

Returneaza DOAR JSON in acest format exact:
{
  "nrDosar": "numar dosar sau null",
  "proprietar": "numele proprietarului/pagubitului sau null",
  "asigurator": "numele asiguratorului (ALLIANZ, GROUPAMA, OMNIASIG, EUROINS, ASIROM, GENERALI, CITY INSURANCE, etc) sau null",
  "daune": [
    {
      "element": "numele piesei exact cum apare (ex: bara fata, aripa dreapta fata, far dreapta, parbriz)",
      "actiune": "inlocuire sau reparatie sau vopsire sau revopsire sau null",
      "ore": numar_sau_null
    }
  ]
}

REGULI pentru "actiune":
- "inlocuire" = inlocuire, schimbare, schimb, nou (piesa noua)
- "reparatie" = reparatie, reparatii, reparat, indreptare (se repara piesa existenta)
- "vopsire" = vopsire, vopsit (se vopseste piesa inlocuita/reparata sau extern)
- "revopsire" = revopsire, revopsit
- daca nu e clar, pune null

REGULI pentru "ore":
- DOAR pentru actiune="reparatie" se completeaza orele normate (ex: 1.5, 3.0)
- Pentru inlocuire / vopsire / revopsire pune null
- Daca nu apare numarul de ore langa piesa, pune null

REGULI pentru "element":
- Pastreaza exact denumirea din document in romana
- Include TOATE piesele mentionate (caroserie: bara, aripa, usa, capota, portbagaj, plafon, prag, stalp, oglinda; si non-caroserie: far, lampa, parbriz, luneta, geam, amortizor, airbag, roata, janta, etc)

Doar JSON, fara explicatii.
TXT;

    public const AUDATEX = <<<'TXT'
Analizeaza acest deviz / calculatie Audatex (AudaPad) pentru reparatie auto.
Extrage DOAR orele totale de manopera pe categorii si sumele. Returneaza DOAR JSON valid:
{
  "nr_dosar": "numarul dosarului (ex: GO10124) sau null",
  "ore_tinichigerie": numar_zecimal_sau_null,
  "ore_vopsitorie": numar_zecimal_sau_null,
  "pret_ora": numar_sau_null,
  "total_manopera_ron": numar_sau_null,
  "total_vopsitorie_ron": numar_sau_null,
  "total_piese_ron": numar_sau_null,
  "total_cu_tva": numar_sau_null
}

REGULI:
1. ore_tinichigerie = suma orelor de manopera (caroserie/mecanica) din sectiunea 'CALCULATIE FINALA': aduna 'TOTAL CL 1 ... ORE' + 'TOTAL CL 2 ... ORE' + 'TOTAL CL 3 ... ORE' (ex: 4.5+0.6+1.1 = 6.2). Daca nu gasesti liniile CL, calculeaza: total_manopera_ron / pret_ora.
2. ore_vopsitorie = numarul de la linia 'TOTAL VOPSITORIE 1 ORA : X.X ORE' (ex: 5.0). ATENTIE: NU lua '10UL/ORE' (acela e alt numar, ex 50.0). Daca nu gasesti, calculeaza: cost_manopera_vopsitorie / pret_ora.
3. total_manopera_ron = 'TOTAL MANOPERA' in RON (ex: 744.00).
4. total_vopsitorie_ron = 'TOTAL VOPSITORIE' in RON (ex: 1482.79).
5. total_piese_ron = 'TOTAL PIESE' in RON (ex: 8012.44).
6. total_cu_tva = 'COST REPARATIE CU TVA' (ex: 12389.47).
7. Toate numerele cu punct zecimal, FARA separator de mii (scrie 8012.44 nu '8 012.44').
8. Daca un camp nu e gasit, pune null. Nu inventa valori.
TXT;

    public const CLASSIFY = <<<'TXT'
Analizeaza aceasta imagine dintr-un dosar de dauna auto (service auto din Romania).
Returneaza DOAR JSON valid, fara alt text:
{ "type": "<tip>", "confidence": 0.0-1.0, "label": "descriere scurta in romana" }

Tipurile permise si ce inseamna:
  constatare_amiabila  - constatare amiabila de accident / constatare asigurator / deviz
  proces_verbal        - proces verbal de politie
  buletin              - carte de identitate (CI) a unei persoane
  talon_fata           - certificat de inmatriculare (talon), FATA
  talon_verso          - certificat de inmatriculare (talon), VERSO
  permis_fata          - permis de conducere, FATA
  permis_verso         - permis de conducere, VERSO
  declaratie_dauna     - declaratie de dauna completata
  polita_rca           - polita de asigurare RCA sau CASCO
  imputernicire        - imputernicire (firma / leasing)
  foto_fata            - fotografie a masinii din FATA
  foto_spate           - fotografie a masinii din SPATE
  foto_stanga          - fotografie a masinii din LATERAL STANGA
  foto_dreapta         - fotografie a masinii din LATERAL DREAPTA
  foto_serie_caroserie - fotografie a seriei de caroserie (VIN) stantate sau de pe eticheta
  foto_avarii          - prim-plan cu zona avariata (indoitura, zgarietura, element rupt)
  altceva              - orice altceva, sau daca nu esti sigur ce document este

REGULI:
- NU decide daca actul apartine pagubitului sau vinovatului. Nu poti sti. Alege doar TIPUL.
- fata/verso: fata are fotografia si numele; verso are rubricile si stampilele.
- confidence > 0.85 doar daca esti sigur. Daca eziti intre doua tipuri, pune confidence sub 0.85.
- Daca imaginea e neclara, taiata sau nu recunosti documentul: "altceva".
- DOAR JSON.
TXT;

}
