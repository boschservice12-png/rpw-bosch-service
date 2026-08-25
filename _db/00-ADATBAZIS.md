# RPW — adatbázis és ellenőrzés

*Supabase `pxypbbvqinbwesfikkdb` · pillanatkép: 2026-08-23*

---

## Táblák

### RPW-saját

| Tábla | Mit tárol |
|---|---|
| `rpw_jobs` | a munkák (JSONB `data`), **`shop_id` kötelező** |
| `rpw_audit` | minden mentés naplója (`actor` = a bejelentkezett ember neve) |
| `rpw_job_counters` | atomi munkaszám-számláló |
| **`rpw_employees`** | **saját dolgozók** cégenként — név, szerepkör, PIN, aktív, kilépés |
| **`rpw_roles`** | **saját szerepkörök** cégenként — kód, felirat, **8 jogosultság-kapcsoló** |
| `rpw_posts` | posztok cégenként (CONSULTANT / RECEPTIE / …), bővíthető |
| `rpw_pin_log` | ki mikor kapott PIN-t, ő maga állította-e |
| `rpw_jobs_backup_*` | migráció előtti mentések |

### Megosztott (a Red ERP-é — az RPW **nem** ír bele)

`employees` · `shops` · `settings` · `tools` · `jobs` (505 sor, a másik rendszeré)
`app_session` · `pin_attempt` — közösen használt munkamenet és zárolás

---

## Szerepkör-modell

**A név a szervizé, a jogosultság kapcsolókból áll.** Egy berlini műhely `Werkstattleiter`-nek hívja a vezetőt — a rendszer akkor is tudja, mit tehet.

| Kapcsoló | Mit enged |
|---|---|
| `team` | dolgozók, szerepkörök, PIN-ek |
| `posts` | posztok kiosztása |
| `open` | munkanyitás, előjegyzés |
| `reception` | autó átvétele |
| `work` | fázisok léptetése |
| `close` | lezárás, átadás |
| `override` | fázis-felülbírálás |
| `delete` | kosár: visszaállítás, végleges törlés |

**Biztonsági zár:** a szerviz nem maradhat csapatkezelő nélkül (`last_manager_lock`).

---

## Függvények

### Önálló személyzet *(élő út)*
```
rpw2_roster(shop)                          névsor a belépőhöz, PIN nélkül   [STABLE]
rpw2_login(shop, employee, pin)            név + PIN belépés
rpw2_session(token)                        munkamenet + jogosultság-kapcsolók
rpw2_can(token, perm)                      egy kapcsoló ellenőrzése
rpw2_team(token, include_left)             csapat + szerepkörök + PIN-állapot
rpw2_employee_save(token, …)               felvétel / módosítás / kiléptetés
rpw2_pin_set(token, employee, pin)         PIN kiosztás
rpw2_role_save(token, code, label, can, …) szerepkör a 8 kapcsolóval
```

### Munkák — bérlővédett *(kész, még nem aktivált)*
```
rpw_jobs_list(token, trashed)              csak a saját szerviz munkái
rpw_job_get(token, id)                     idegen munka → 'not_found'
rpw_patch_v3(token, id, patch, ver, phase) a shop_id a TOKENBŐL
rpw_job_trash / restore / purge            az utóbbi kettő vezetői jog
rpw_job_number(token, prefix)              atomi munkaszám
```

### Egyéb
```
rpw_posts_get / rpw_post_assign / rpw_post_upsert
rpw_consistency_check()                    13 egészségügyi szabály   [STABLE]
rpw_patch_v2                               a RÉGI mentési út — visszaállásra
rpw_login / rpw_login_named / rpw_session  a RÉGI, ERP-alapú belépés
```

---

## ⚠ Két tanulság, ami vérrel íródott

**① A PostgREST a `STABLE` függvényeket csak olvasható tranzakcióban futtatja.**
A `rpw_posts_get` `STABLE` volt, de belül a `rpw_session` **ír** (hosszabbítja a munkamenetet) → a hívás **élesben elszállt**, miközben az SQL-szerkesztőben működött. **Ha egy függvény közvetve is ír, `VOLATILE`-nak kell lennie.**

**② A modált a gomb lenyomásakor előbb töröljük, csak utána hívjuk a megerősítést.**
Emiatt a beviteli mezőből olvasott érték mindig üres volt — így **egyetlen PIN sem került be a felületről**. Tanulság: a beírt értéket **gépeléskor** kell rögzíteni, nem a DOM-ból kiolvasni a végén.

---

## Biztonsági kapcsolók

| Kapcsoló | Érték | Mikor kapcsolható |
|---|---|---|
| `AUTH_REQUIRED` | `false` | ha **mindenkinek** van PIN-je |
| `PATCH_RPC` | `'rpw_patch_v2'` | **együtt** az `AUTH_REQUIRED`-del *(a v3 tokent vár)* |
| `SERVER_TRANSITIONS` | `false` | a P0.4 után |
| `STORAGE_PRIVATE` | **`true`** | ✓ aktív |
| `PRODUCTION` | `false` | ha mind a négy a helyén |

---

## ⚠ Nyitott kockázat

**Az `rpw_jobs` RLS-szabálya `qual: true`** — az `"anon rw"` mindent enged. Amíg a `v2` út él, ez nem vehető el. A `v3` aktiválásakor **együtt kell szigorítani**, különben a védelem kliensoldali marad.

**A `rpw_patch` és `rpw_patch_v2` nem ellenőrzi a bérlőt.** Egy éles bérlőnél elméleti, a másodiknál azonnal valódi.

---

## Ellenőrzés

```bash
npm install
npm test
```

**Mért eredmény (2026-08-23):**
```
tesztfájl        29
állítás          1028
sikeres          1028
sikertelen       0
le sem futott    0
futásidő         22.4 s
```

Egyetlen bukott vagy le nem futott teszt esetén a futtató **hibával áll le**.

Az adatbázis egészsége külön:
```sql
select * from rpw_consistency_check();
```

---

# V4 (006) — a workflow kikényszerítése

## Új táblák

| Tábla | Mit tárol | Sorok |
|---|---|---|
| `rpw_protected_fields` | mezőminták, amiket a **normál patch nem érinthet** | 25 |
| `rpw_patch_permissions` | mezőút → szükséges jogosultság | 30 |

Mindkettő adatvezérelt: **szervizenként bővíthető** (`shop_id` nélkül = alapszabály),
és a `rpw_server_capabilities` visszaadja a darabszámukat, hogy a kliens ellenőrizhesse.

## Új belső segédek

```
rpw__path_matches(path text[], pattern text)   egy út illeszkedik-e a mintára
rpw__patch_paths(patch jsonb, prefix text)     a patch ÖSSZES levélútja, rekurzívan
rpw__protected_hits(patch jsonb)               mely utak sértenek védett mezőt
rpw__patch_needs(patch jsonb, can jsonb)       mely jogok hiányoznak
```

⚠ Ezek `rpw__` előtagúak → **nem kapnak `EXECUTE` jogot**. Az RPC-konzisztencia
teszt külön ellenőrzi, hogy nem szivárogtak ki.

## A mezőutak pont-jelöléssel

A `{"phases":{"7":{"status":"done"}}}` patch levélútja: **`phases.7.status`**.
A minta lehet `*`-os (`phases.*.status`), és **prefix-illeszkedésű**: ha a
minta rövidebb, a mélyebb út is védett. Ezért a `phases` minta a
`phases.3.finished` utat is elkapja.

## Megváltozott szignatúra

```
rpw_transition(p_token, p_id, p_phase, p_action,
               p_expected_version, p_reason, p_rework_id, p_note)
```

A V3-as, 6 paraméteres alakot a `006` **eldobja** — egy szignatúra marad.

⚠ Emiatt a `005_rls_lockdown.sql` **névre** grantol a `rpw_transition`-re
(nem szignatúrára), különben a `006` után nem lenne újrafuttatható.
Ezt a migrációs ciklus-teszt kapta el.

## Vérrel írt tanulság — harmadik

**A PL/pgSQL-ben a beágyazott tömbök (`text[][]`) nem fűzhetők össze
megbízhatóan.** Az első változat `text[][]`-t adott vissza a rekurzív
útgyűjtésből, és `cannot concatenate incompatible arrays` hibával elszállt —
de csak akkor, amikor VALÓDI adatbázison futott. Megoldás: lapos `text[]`,
pont-jelöléssel.
