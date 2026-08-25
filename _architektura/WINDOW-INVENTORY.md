# WINDOW-INVENTORY — a 12 ablak leltára

| L | ablak | fájl | dokumentum | fő minősítés |
|---|---|---|---|---|
| L0 | Bejelentkezés | rpw-login.html + rpw-auth.js | (deprecation-tesztek fedik) | működik; rpw2-út a cél |
| L1 | Centru de Control | index.html | CONTROL-CENTER-WORKFLOW.md | működik; K-19 fül épül |
| L2 | Ügyadatlap | rpw-dosar.html | CASE-WINDOW-L2.md | működik; K-9/K-25 épül |
| L3 | Időpont/átütemezés | index.html (modálok) | SCHEDULING-WINDOW-L3.md | működik; K-13..16 épül |
| L4 | Járműátvétel | rpw-recepcio-red.html | RECEPTION-WINDOW-L4.md | a legerősebb ablak |
| L5 | Munkalap (Evaluare) | rpw-evaluare-red.html | WORK-WINDOWS-L5-L6.md | működik; K-22 épül |
| L6 | Munkafázisok | reconstatare/tinichigerie/vopsitorie | WORK-WINDOWS-L5-L6.md | működik; K-20/21 épül |
| L7 | Minőség-ellenőrzés | rpw-control-red.html | QUALITY-DELIVERY-L7-L8.md | működik |
| L8 | Lezárás/átadás | rpw-inchidere-red.html | QUALITY-DELIVERY-L7-L8.md | működik; K-25 épül |
| L9 | Csapat | index.html (renderEchipa) | ADMIN-WINDOWS-L9-L12.md | élesben alvó (007) |
| L10 | Statisztika | index.html | ADMIN-WINDOWS-L9-L12.md | működik (kliens-oldali) |
| L11 | Paraméterek | index.html | ADMIN-WINDOWS-L9-L12.md | K-26: szerverre költözik |
| L12 | Admin (Curatare/Coș) | rpw-cleanup/rpw-cos | ADMIN-WINDOWS-L9-L12.md | működik a migrált sémán |

Kapcsolódó, nem-ablak dokumentumok: DECISIONS-OWNER (27 döntés) ·
TWO-SYSTEM-BOUNDARIES · CASE-TO-WORK-HANDOFFS · STATE-TRANSITION-MATRIX ·
DATA-MODEL · DEAD-ENDS-AND-GAPS · ARCHITECTURE-CURRENT/TARGET-STATE ·
IMPLEMENTATION-BACKLOG. Szerep–jog mátrix: a rpw_roles.can kapcsolói ×
műveletek — a 006 `rpw_patch_permissions` és a fázis-capability táblája a
gépi forrás (ROLE-PERMISSION-MATRIX külön fájl helyett a DATA-MODEL és a
STATE-TRANSITION-MATRIX hordozza). Függvény-gráf: _registry/funkciok.json
(84 funkció, nextFunctions-lánccal) + FUNKCIOK.pdf.
