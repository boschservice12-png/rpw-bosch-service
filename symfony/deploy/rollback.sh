#!/usr/bin/env bash
# KÓD-visszaállás az előző (vagy megadott) egészséges kiadásra — az adatbázishoz NEM nyúl.
#   rollback.sh             → az élő előtti kiadás
#   rollback.sh <könyvtár>  → egy konkrét kiadás (ls /opt/rpw/releases)
. "$(dirname "$0")/lib.sh"
need_root
load_conf
cur="$(current_release)"
if [ -n "${1:-}" ]; then
  target="$RPW_RELEASES/$(basename "$1")"
else
  target="$(find "$RPW_RELEASES" -mindepth 2 -maxdepth 2 -name .deployed -printf '%h\n' | sort -r | awk -v c="$cur" 'f{print; exit} $0==c{f=1}')"
fi
[ -n "$target" ] && [ -f "$target/.deployed" ] || die "nincs hova visszaállni (kiadások: $(ls -1 "$RPW_RELEASES" | tr '\n' ' '))"
[ "$target" != "$cur" ] || die "ez már az élő kiadás"
step "Visszaállás: $(basename "$cur") → $(basename "$target")"
activate_release "$target"
bash "$DEPLOY_DIR/healthcheck.sh" || die "a visszaállított kiadás sem egészséges — napló: $RPW_SHARED/log, /var/log/php8.3-fpm.log"
ok "élő: $(basename "$target") (commit $(cut -c1-12 "$target/REVISION"))"
