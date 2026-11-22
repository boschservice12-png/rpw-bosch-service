#!/usr/bin/env bash
# Egy pillantás a szerverre: élő kiadás, egészség, szolgáltatások, utolsó mentés, lemez. Csak olvas.
. "$(dirname "$0")/lib.sh"
load_conf
trap - ERR; set +e
step "RPW — $DOMAIN"
echo "  élő kiadás:  $(basename "$(current_release)") (commit $(cut -c1-12 "$RPW_CURRENT/REVISION" 2>/dev/null))"
bash "$DEPLOY_DIR/healthcheck.sh" 2>&1 | tail -1
for u in caddy "$RPW_FPM_SERVICE" postgresql fail2ban rpw-backup.timer; do
  printf '  %-18s %s\n' "$u" "$(systemctl is-active "$u" 2>/dev/null)"
done
last="$(find "$RPW_BACKUPS" -mindepth 1 -maxdepth 1 -type d -not -name pre-deploy -printf '%f\n' 2>/dev/null | sort | tail -1)"
echo "  utolsó mentés: ${last:-NINCS}"
echo "  lemez:       $(df -h / | awk 'NR==2{print $4" szabad ("$5" foglalt)"}')"
echo "  kitiltott IP: $(fail2ban-client status rpw 2>/dev/null | sed -n 's/.*Currently banned:[[:space:]]*//p')"
