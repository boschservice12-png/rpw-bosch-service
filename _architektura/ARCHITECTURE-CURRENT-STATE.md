# ARCHITECTURE-CURRENT-STATE — a jelen állapot összegzése (bizonyítékok: L1–L12)

Egyoldalas szintézis; a részletek az ablak-dokumentumokban (CONTROL-CENTER-WORKFLOW,
CASE-WINDOW-L2, SCHEDULING-WINDOW-L3, RECEPTION-WINDOW-L4, WORK-WINDOWS-L5-L6,
QUALITY-DELIVERY-L7-L8, ADMIN-WINDOWS-L9-L12) — soronkénti kódhivatkozásokkal.

## Ami tényszerűen erős
- EGY állapot-döntési lánc (categorizeJob), nincs párhuzamos állapotgép.
- A kritikus műveletek (fázis-zárás, rework, újranyitás, ügy-lezárás) MIND a
  workflow-rétegen mennek; secure módban a szerver dönt, audittal.
- Recepció: privát storage + aláírt URL; OCR nem írja felül az embert;
  a lezárási kapuk valódiak (valódi-kattintás tesztekkel igazolva).
- Soft-delete → kuka → purge lánc, kötelező indokkal.

## A szerkezeti valóság
- Ügy és munkalap EGY objektum (K-1/B döntés: így is marad, mezőcsoport-határral).
- A teljes védett lánc (v3, transitions, job_create, PIN-ek) élesben ALVÓ —
  a mai éles legacy módban fut, audit nélkül (K-5 → cutover).
- 31 ellentmondás feltárva (E-1..E-31) — mindegyik döntéssel lezárva vagy
  a backlogba ütemezve; teljes lista: DEAD-ENDS-AND-GAPS.md.

## Számok (gépi forrás: registry v2, 2026-08-25)
84 regisztrált funkció · súlyozott készültség 35% · P0 39% · production-igazolt 0%
(nincs emberi staging-bizonyíték) · gépi tesztek: 53 fájl / 3528 állítás zöld.
