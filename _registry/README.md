# _registry — a funkciónyilvántartás gépezete

| fájl | mi ez | ki írja |
|---|---|---|
| `funkciok.json` | 84 funkció, állandó F-### számmal — **a forrás** | ember (új funkció felvétele) + `derive.js` (státusz) |
| `schema.json` | a bejegyzés-séma (v2 mezők) | ember |
| `derive.js` | a **státuszt számolja** a gépi teszteredményből (`_tests/last-run.json`), a kódhorgonyokból és az `evidence.json`-ból | — |
| `evidence.json` | **emberi** staging/production/e2e bizonyítékok — enélkül a státusz a gépi szinten plafonozódik | CSAK ember |
| `generate.js` | ebből készül a `FUNKCIOK.md` | — |
| `pdf.js` | ebből készül a `FUNKCIOK.pdf` (Chromium) | — |

## A staféta

```
npm test            → _tests/last-run.json (gépi eredmény)
node _registry/derive.js   → státuszok + készültségi mutatók a funkciok.json-ba
npm run funkciok    → FUNKCIOK.md + FUNKCIOK.pdf + a regiszter őre (test-registry.js)
```

## Szabályok

1. A **szám** (F-###) soha nem változik és nem használható újra.
2. A **productionStatus**-t kézzel átírni tilos — a `derive.js` számolja.
3. `PRODUCTION_VERIFIED` csak akkor lehetséges, ha a gépi szintek zöldek **és**
   az `evidence.json`-ban emberi staging+production bizonyíték van.
4. Új RPC vagy új üzleti művelet szám nélkül nem kerülhet be — a
   `test-registry.js` elhasal.
5. A kivezetés (`lifecycle: DEPRECATED`) kézi döntés, dokumentált tervvel
   (DEPRECATION-PLAN.md); a REMOVED csak a kód tényleges törlése után.
