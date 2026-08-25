# CASE-TO-WORK-HANDOFFS — átadási események: mi van meg, mi hiányzik

| esemény (spec) | mai megfelelő a kódban | állapot | cél (a döntésekből) |
|---|---|---|---|
| CASE_READY_FOR_SCHEDULING | implicit: az ügyön van dátum | HIÁNYZIK mint esemény | a K-19 Avizare-fülről „Programează" művelet |
| APPOINTMENT_CONFIRMED | `programare.confirmed` mező | RÉSZBEN (mező van, esemény/audit nincs) | a K-4 „utolsó egyeztetés" megerősítése legyen ez az esemény |
| VEHICLE_ARRIVED | `deschideLucrare`: sosire='sosit' (kapu: CSAK whatsapp — E-4/E-5) | RÉSZBEN | kapu = K-4 szerinti utolsó egyeztetés; audit |
| WORK_ORDER_ACTIVATED | `rpw_transition start phase 1` ill. `dosarToReparatie` | MEGVAN secure módban | az E-13 két-írásos átmenet atomivá tétele |
| HIDDEN_DAMAGE_FOUND | reconstatare sorok + fotó-bizonyíték | MEGVAN (kliens) | változatlan |
| SUPPLEMENT_APPROVAL_REQUIRED | reconst.status='pending' + kézi küldés a biztosítónak | RÉSZBEN | kommunikációs esemény (G-07) később |
| SUPPLEMENT_APPROVED | `rcResponse('accepted')` → suplim; elutasítás kötelező indokkal | MEGVAN | + K-21: ki hagyta jóvá (bejelentkezett név) |
| WORK_BLOCKED / WORK_RESUMED | nincs kifejezett esemény; a feltétel-ikonok és a blokk-modálok közelítik | HIÁNYZIK | backlog (alacsonyabb prioritás) |
| QUALITY_CONTROL_PASSED | `advPh` a Controlon (checklist + nincs nyitott rework) | MEGVAN | + K-20: ellenőr = bejelentkezett név |
| VEHICLE_READY_FOR_DELIVERY | implicit (ph6 done) | HIÁNYZIK mint állapot | a lezárás-lap „kész az átadásra" jelzése az azi-modalban |
| VEHICLE_DELIVERED | `closing.handoverBy/handoverAt` | RÉSZBEN | K-20: felelős = bejelentkezett név |
| CASE_READY_FOR_CLOSURE | `checkPhase7` teljesül | MEGVAN (szerver) | K-9: doar_dosar-nak SAJÁT szabály |
| CASE_CLOSED | `rpw_transition complete phase 7` → inchis | MEGVAN (szerver) | + K-25: lezárás után AUTOMATIKUS teljes-ZIP a storage-ba → siker → separat |
| (új, K-25) CASE_ARCHIVED | — | HIÁNYZIK | a storage-mentés sikere; ettől „Separat" |

Minden meglévő szerveri esemény auditál (rpw_audit); a hiányzók az
IMPLEMENTATION-BACKLOG-ban vannak beütemezve. Idempotencia: a szerveri átmenetek
verziózárral védettek; a kliens dupla-katt zárral (in-flight) — mindkettő tesztelt.
