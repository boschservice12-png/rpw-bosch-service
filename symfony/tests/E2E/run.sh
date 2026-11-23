#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  VÉGPONTTÓL VÉGPONTIG PRÓBA — valódi böngésző, valódi oldalak, új backend
#
#  Előfeltétel: fut a helyi rendszer MINTACSAPATTAL (RPW_DEMO=1 symfony/bin/rpw-local --reset), Node + Playwright.
#  Egy teljes munka 1→7: recepció (valódi fotófeltöltés), értékelés,
#  lakatos, fényező, kontroll, lezárás — szerepkörönként más dolgozóval,
#  és egy elutasított lezárási kísérlettel (lakatos, nincs `close` joga).
#  Kimenet (képernyőképek): symfony/var/e2e/
# ════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
export E2E_OUT="${E2E_OUT:-$(cd ../.. && pwd)/var/e2e}"
mkdir -p "$E2E_OUT"
python3 mkpng.py "$E2E_OUT/car.png"
node e2e-reception.js
node e2e-phases.js | tee "$E2E_OUT/phases.log"
grep -q '"inchis":true' "$E2E_OUT/phases.log" && grep -q '"7":"done"' "$E2E_OUT/phases.log" \
  && grep -q 'FOTÓK: OK' "$E2E_OUT/phases.log" && grep -q 'ZÁRÓ FOTÓK: OK' "$E2E_OUT/phases.log" \
  && echo "E2E: SIKERES — a munka 1→7 lezárva" || { echo "E2E: SIKERTELEN"; exit 1; }
