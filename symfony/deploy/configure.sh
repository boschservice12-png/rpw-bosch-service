#!/usr/bin/env bash
# Szerver-konfiguráció (Caddy, saját php-fpm készlet, fail2ban, systemd) a /etc/rpw/rpw.conf alapján.
# Idempotens; az install.sh hívja, és minden rpw.conf-módosítás után kézzel is futtatható. Titkot nem ír.
. "$(dirname "$0")/lib.sh"
need_root
load_conf
T="$DEPLOY_DIR/templates"
CADDYFILE="${RPW_CADDYFILE:-/etc/caddy/Caddyfile}"
FPM_POOL_DIR="${RPW_FPM_POOL_DIR:-/etc/php/8.3/fpm/pool.d}"
SYSTEMD_DIR="${RPW_SYSTEMD_DIR:-/etc/systemd/system}"
F2B_DIR="${RPW_F2B_DIR:-/etc/fail2ban}"
render() { sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__RPW_HOME__#$RPW_HOME#g" -e "s#__RPW_BACKUPS__#$RPW_BACKUPS#g" \
  -e "s#__GLOBAL_EMAIL__#${ACME_EMAIL:+email $ACME_EMAIL}#" -e "s#__WORKSHOP_IP__#${WORKSHOP_IP:-}#" "$1"; }

step "Caddy ($DOMAIN)"
install -d "$(dirname "$CADDYFILE")"
render "$T/Caddyfile.tpl" > "$CADDYFILE.new"
if command -v caddy > /dev/null; then
  caddy validate --adapter caddyfile --config "$CADDYFILE.new" > /dev/null 2>&1 \
    || { caddy validate --adapter caddyfile --config "$CADDYFILE.new"; die "érvénytelen Caddyfile"; }
fi
mv "$CADDYFILE.new" "$CADDYFILE"
# a `caddy validate` rootként létrehozhatja a naplót → a caddy szolgáltatás nem tudná írni
if id caddy > /dev/null 2>&1; then install -d -o caddy -g caddy /var/log/caddy; chown -R caddy:caddy /var/log/caddy; fi
ok "$CADDYFILE"

step "php-fpm: saját 'rpw' készlet (a keményítés CSAK erre vonatkozik)"
install -d "$FPM_POOL_DIR"
render "$T/php-fpm-rpw.conf" > "$FPM_POOL_DIR/rpw.conf"
# az alap 'www' készletre nincs szükség: kevesebb futó folyamat, kevesebb támadási felület
[ ! -f "$FPM_POOL_DIR/www.conf" ] || mv "$FPM_POOL_DIR/www.conf" "$FPM_POOL_DIR/www.conf.disabled"
ok "$FPM_POOL_DIR/rpw.conf"

step "fail2ban (rossz PIN / zárolás / idegen eredet → IP-kizárás)"
install -d "$F2B_DIR/filter.d" "$F2B_DIR/jail.d"
render "$T/fail2ban/filter.d/rpw.conf" > "$F2B_DIR/filter.d/rpw.conf"
render "$T/fail2ban/jail.d/rpw.conf" > "$F2B_DIR/jail.d/rpw.conf"
touch "$RPW_SHARED/log/security-prod.log" 2>/dev/null || true
ok "$F2B_DIR/jail.d/rpw.conf"

step "systemd: éjszakai mentés"
install -d "$SYSTEMD_DIR"
for u in rpw-backup.service rpw-backup.timer rpw-restore-drill.service rpw-restore-drill.timer rpw-replicate.service rpw-replicate.timer; do render "$T/$u" > "$SYSTEMD_DIR/$u"; done
ok "rpw-backup.timer (02:30) · rpw-restore-drill.timer (havonta) · rpw-replicate.timer (óránként: fotó-másolat)"

if [ "$RPW_NO_SYSTEMD" != "1" ]; then
  chown -R "$RPW_USER:$RPW_USER" "$RPW_SHARED/log" "$RPW_SHARED/storage"
  systemctl daemon-reload
  systemctl enable --quiet --now rpw-backup.timer rpw-restore-drill.timer rpw-replicate.timer
  systemctl restart "$RPW_FPM_SERVICE"
  systemctl enable --quiet --now fail2ban; systemctl reload fail2ban || systemctl restart fail2ban
  systemctl reload caddy || systemctl restart caddy
  ok "szolgáltatások frissítve"
fi
