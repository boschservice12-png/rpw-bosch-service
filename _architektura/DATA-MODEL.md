# DATA-MODEL — a spec objektumai ↔ a mai kód (K-1/B leképezés)

| spec-objektum | mai megfelelő | tulajdonos-rendszer | védett mezők | megjegyzés |
|---|---|---|---|---|
| Shop | `shops` tábla + RPW_CFG.SHOP_ID | Platform | id | többbérlős kulcs; minden RPC tokenből vezeti le |
| User/Employee | `rpw_employees` | Office | pin_hash, active | |
| Role/Permission | `rpw_roles.can{}` KAPCSOLÓK | Office | can | nem név-alapú — K-23 erre épül |
| Client | `job.client/phone/proprietar` | A | — | önálló Client-törzs NINCS (visszatérő ügyfél nem köthető össze) — backlog-jelölt, nem döntött |
| Vehicle | `job.plate/vin/brand/year` | A | — | K-13: lazább minta + külföldi jelölő |
| Case | a `job` A-mezőcsoportja | A | flux, separat | K-1/B: logikai objektum |
| DamageCase/Claim | `damageType/asigurator/nrDosar/dosarStatus/dosarActe` | A | dosarPredat (K-10: figyelmeztetéses) | |
| InsuranceCompany | szabad szövegmező + fix lista az űrlapon | A | — | önálló törzs nincs (e-mail címek sem — G-07-hez kell majd) |
| Appointment | `job.programare{}` | A | istoric (K-16: 3.-tól indok+ki) | |
| WorkOrder | a `job` B-mezőcsoportja | B | phase/phases/inchis/rework | K-1/B |
| WorkPhase/PhaseExecution | `phases{1..7}` + szerveri started/finished | B | MIND (rpw_transition) | |
| Document/Photo | `dosarActe/docs/photos` + privát Storage | A/B | — | aláírt URL-ek (P0.6) |
| Checklist | recepció 23 elem; Control CHECKLIST | B | — | |
| Approval | `bodyApproval{}` (K-21: + ki/mikor) | B | — | |
| Supplement | `reconst{}` → suplim sorok | B | responseNote/Date kötelező elutasításnál | |
| Rework | `rework[]` (id, cél-fázis, leírás, felelős, nyitó/záró+idő) | B | szerveren kezelt | K-24: határidő NEM |
| QualityControl | `controlChecks/control{}` | B | lastResult | K-20: ellenőr = bejelentkezett |
| Workstation | `rpw-cos.html` posturi + `rpw_post_*` RPC | B | — | K-23: beosztás csak jogosultnak; fázis-összekötés backlog |
| Material/Part | `piese[]` az evaluarén | B | — | raktár-integráció nincs (ASM-terület) |
| Communication/Notification | NINCS (wa.me linknyitás) | A | — | G-07; K-4 az első lépés |
| AuditEvent | `rpw_audit` (szerveri műveleteknél) | Platform | append-only | K-5: minden módosító művelet — a cutoverrel |

Törlés: sehol nincs fizikai törlés a felületről — soft-delete → Coș → purge
(jog+audit), cleanup kötelező indokkal. Ez megfelel a spec 27. pontjának,
a megőrzési-szabály dokumentálása hiányzik.
