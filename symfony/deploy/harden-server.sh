#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  RPW — SZERVER-KEMÉNYÍTÉS (1. réteg), Ubuntu 24.04 LTS, root-ként, EGYSZER.
#  ⚠ Futtatás előtt: legyen működő SSH-KULCSOS belépésed egy nem-root
#  felhasználóval — a szkript KIKAPCSOLJA a jelszavas és a root SSH-belépést.
#  Idempotens: többször futtatható. Semmit nem töröl.
# ════════════════════════════════════════════════════════════════
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "root-ként futtasd"; exit 1; }
ADMIN_USER="${1:?használat: harden-server.sh <admin-felhasználó>}"
id "$ADMIN_USER" >/dev/null 2>&1 || { echo "nincs ilyen felhasználó: $ADMIN_USER"; exit 1; }
[ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ] || { echo "ÁLLJ: $ADMIN_USER-nek nincs SSH-kulcsa — kizárnád magad"; exit 1; }

apt-get update -q
DEBIAN_FRONTEND=noninteractive apt-get install -y -q ufw fail2ban unattended-upgrades

# ── tűzfal: csak SSH, HTTP (→HTTPS átirányítás), HTTPS ─────────────
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp            # SSH: percenkénti kapcsolódási fékkel
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── SSH: csak kulcs, root nem ─────────────────────────────────────
cat > /etc/ssh/sshd_config.d/99-rpw.conf <<CONF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
MaxAuthTries 3
AllowUsers $ADMIN_USER
CONF
sshd -t && systemctl reload ssh

# ── automatikus biztonsági frissítések ────────────────────────────
dpkg-reconfigure -f noninteractive unattended-upgrades

# ── alkalmazás-felhasználó: jelszó és shell nélkül ────────────────
id rpw >/dev/null 2>&1 || useradd --system --home /srv/rpw --shell /usr/sbin/nologin rpw
install -d -o rpw -g rpw -m 750 /srv/rpw /var/backups/rpw
install -d -o root -g rpw -m 750 /etc/rpw    # titkok: /etc/rpw/rpw.env (chmod 640)

# ── fail2ban: SSH + az RPW biztonsági napló ───────────────────────
HERE="$(cd "$(dirname "$0")" && pwd)"
install -m 644 "$HERE/fail2ban/filter.d/rpw.conf" /etc/fail2ban/filter.d/rpw.conf
install -m 644 "$HERE/fail2ban/jail.d/rpw.conf" /etc/fail2ban/jail.d/rpw.conf
systemctl enable --now fail2ban
systemctl reload fail2ban || true

echo "Kész. Ellenőrzés: ufw status · fail2ban-client status · sshd -T | grep -i passwordauth"
