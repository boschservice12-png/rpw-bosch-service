# Adatmodell — migrációs terv

**Ez terv, nem végrehajtott munka.** A JSONB-modell ma működik; a cél nem az átírás, hanem hogy tudjuk, **mit érdemes** kiemelni, és **milyen sorrendben**.

---

## Miért egyáltalán

A `data` JSONB minden mezőt tartalmaz. Ez rugalmas, de:

- **nem indexelhető jól** — a lista minden szűrése teljes JSONB-olvasás
- **nincs típusellenőrzés** — a `phase` lehet `3`, `"3"` vagy hiányzó
- **nincs idegen kulcs** — a felelős dolgozó törölhető úgy, hogy hivatkozás marad rá
- **a riportok lassúak** — a GAP-statisztika ma minden sort végigolvas

## Mi kerüljön külön oszlopba

| Mező | Típus | Miért | Prioritás |
|---|---|---|---|
| `shop_id` | `uuid not null` | **már oszlop** — bérlővédelem alapja | ✅ kész |
| `version` | `int not null` | **már oszlop** — optimista zár | ✅ kész |
| `deleted_at` | `timestamptz` | **már oszlop** — kosár | ✅ kész |
| `phase` | `smallint` + `check between 1 and 7` | minden lista szűri; a típusellenőrzés hibát fog | 🔴 első |
| `inchis` | `boolean not null default false` | a fő állapotszűrő | 🔴 első |
| `sosire` | `text` + `check in (...)` | a `sosire+flux+inchis` hármas alapja | 🔴 első |
| `flux` | `text` + `check in (...)` | ugyanaz | 🔴 első |
| `deadline` | `date` | határidő-figyelés, indexelhető | 🟠 második |
| `asigurator` | `text` | esetazonosság + riport | 🟠 második |
| `nr_dosar` | `text` | esetazonosság; **`unique(shop_id, asigurator, nr_dosar)`** — ez fogná meg a kétszeri megnyitást adatbázis-szinten | 🟠 második |
| `responsible_employee` | `uuid → rpw_employees(id)` | idegen kulcs, valódi hivatkozás | 🟡 harmadik |
| `started_at` | `timestamptz` | átfutási idő | 🟡 harmadik |
| `completed_at` | `timestamptz` | átfutási idő | 🟡 harmadik |

## Mi maradjon JSONB-ben

A **részletes űrlapadat**: `elements`, `docs`, `photos`, `deviz`, `evalData`, `reconst`, `closing`, `conditions`, `rework`, `gapLog`, `phases`.

Ezek szervizenként eltérnek, gyakran bővülnek, és sosem szűrünk rájuk közvetlenül.

---

## Migrációs minta — mezőnként

Minden mező **ugyanezt a négy lépést** járja végig. A kettő közötti időben a régi és az új is működik.

```sql
-- 1. Oszlop hozzáadása, NULL-lal
alter table rpw_jobs add column phase smallint;

-- 2. Feltöltés a JSONB-ből
update rpw_jobs set phase = nullif(data->>'phase','')::smallint
where phase is null;

-- 3. Kettős írás: a kliens MINDKETTŐBE ír egy ideig
--    (trigger, hogy a régi kód se törjön)
create or replace function rpw_sync_phase() returns trigger as $$
begin
  new.phase := coalesce(nullif(new.data->>'phase','')::smallint, new.phase);
  return new;
end $$ language plpgsql;

create trigger rpw_jobs_sync_phase before insert or update on rpw_jobs
for each row execute function rpw_sync_phase();

-- 4. Csak ha minden olvasó átállt: megszorítás + index
alter table rpw_jobs alter column phase set not null;
alter table rpw_jobs add constraint rpw_phase_range check (phase between 1 and 7);
create index rpw_jobs_phase_idx on rpw_jobs(shop_id, phase) where deleted_at is null;
```

**A 3. lépés a lényeg.** Trigger nélkül a régi kliens JSONB-be ír, az új oszlopba, és a kettő szétcsúszik.

---

## Sorrend

| Kör | Mezők | Mit nyer |
|---|---|---|
| **1.** | `phase`, `inchis`, `sosire`, `flux` | a listák és a „Ce facem azi" gyorsulnak; a `phase` típusellenőrzést kap |
| **2.** | `deadline`, `asigurator`, `nr_dosar` | határidő-index; **az esetazonosság adatbázis-szintű megszorítássá válik** |
| **3.** | `responsible_employee`, `started_at`, `completed_at` | idegen kulcs, átfutási statisztika |

## Amit ez a terv **nem** csinál

- nem írja át az `elements` / `docs` / `photos` szerkezetét
- nem vezet be külön `rpw_job_phases` táblát *(a hét fázis fix; külön tábla most csak bonyolítana)*
- nem nyúl a `rpw_audit` szerkezetéhez

## Kockázat

| | |
|---|---|
| Adatvesztés | **nincs** — csak új oszlopok jönnek, a JSONB marad |
| Visszaállás | `alter table rpw_jobs drop column <mező>` |
| Töréspont | a 4. lépés (`not null`) — **csak akkor**, ha minden olvasó átállt |
