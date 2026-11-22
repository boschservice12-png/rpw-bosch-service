#!/usr/bin/env bash
# Egészség-ellenőrzés: az élő kiadás válaszol-e, és a válasz az élő commité-e.
# Kilépési kód: 0 = egészséges. A release.sh és a rollback.sh hívja; kézzel is futtatható.
. "$(dirname "$0")/lib.sh"
want="$(cut -c1-12 "$RPW_CURRENT/REVISION" 2>/dev/null || true)"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if body="$(curl -fsS --max-time 5 "$RPW_HEALTH_URL" 2>/dev/null)"; then
    case "$body" in
      *'"ok":true'*) ok "egészséges (${want:-?}) — $RPW_HEALTH_URL"; exit 0 ;;
    esac
  fi
  sleep "$i"
done
echo "  ! nem egészséges: $RPW_HEALTH_URL → ${body:-nincs válasz}" >&2
exit 1
