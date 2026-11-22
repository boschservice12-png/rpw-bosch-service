#!/usr/bin/env bash
# RPW szerver — közös függvények és útvonalak (a többi deploy-szkript `source`-olja).
# A TyreFleet (/opt/gumi) bevált mintája, saját gépen. Titok SOHA nincs a repóban:
# a titkok a szerveren születnek, a /opt/rpw/shared/.env.local-ban.
set -Eeuo pipefail

RPW_HOME="${RPW_HOME:-/opt/rpw}"
RPW_CONF="${RPW_CONF:-/etc/rpw/rpw.conf}"
RPW_USER="${RPW_USER:-rpw}"
RPW_REPO_DIR="${RPW_REPO_DIR:-$RPW_HOME/repo}"
RPW_SHARED="$RPW_HOME/shared"
RPW_RELEASES="$RPW_HOME/releases"
RPW_CURRENT="$RPW_HOME/current"
RPW_BACKUPS="${RPW_BACKUPS:-/var/backups/rpw}"
RPW_DB="${RPW_DB:-rpw}"
RPW_FPM_SERVICE="${RPW_FPM_SERVICE:-php8.3-fpm}"
RPW_KEEP_RELEASES="${RPW_KEEP_RELEASES:-5}"
# Belső egészség-cím: a Caddy CSAK a gépen belül figyel rá (DNS és tanúsítvány nélkül is mérhető).
RPW_HEALTH_URL="${RPW_HEALTH_URL:-http://127.0.0.1:8081/api/health}"
# Teszt: RPW_NO_SYSTEMD=1 → a szolgáltatás-műveletek kimaradnak (konténerben / helyi próbán nincs systemd).
RPW_NO_SYSTEMD="${RPW_NO_SYSTEMD:-0}"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# systemd-időzítő alatt nincs HOME — a composer enélkül nem indul (a TyreFleet-ben 2026-10-23-án így bukott).
export HOME="${HOME:-/root}"
export COMPOSER_HOME="${COMPOSER_HOME:-$HOME/.config/composer}"

c_ok=$'\e[32m'; c_err=$'\e[31m'; c_dim=$'\e[2m'; c_b=$'\e[1m'; c_0=$'\e[0m'
step() { printf '\n%s== %s ==%s\n' "$c_b" "$*" "$c_0"; }
ok()   { printf '%s  ✔ %s%s\n' "$c_ok" "$*" "$c_0"; }
info() { printf '%s  · %s%s\n' "$c_dim" "$*" "$c_0"; }
die()  { printf '\n%s  ✘ HIBA: %s%s\n' "$c_err" "$*" "$c_0" >&2; exit 1; }
trap 'die "a(z) $LINENO. sornál megállt: $BASH_COMMAND"' ERR

need_root() { [ "$(id -u)" -eq 0 ] || [ "$RPW_NO_SYSTEMD" = "1" ] || die "rootként futtasd"; }
# Titkot csak valódi terminálon gépelünk: "ssh host cmd" -t nélkül a gépelés LÁTSZANA.
need_tty() { [ -t 0 ] || die "nincs terminál — indítsd -t kapcsolóval: ssh -t root@<szerver> \"bash $0\""; }
read_secret() { # read_secret VÁLTOZÓ 'Kérdés: '
  need_tty
  local _v; printf '%s' "$2"; IFS= read -r -s _v; printf '\n'; printf -v "$1" '%s' "$_v"
}

load_conf() {
  [ -r "$RPW_CONF" ] || die "hiányzik a $RPW_CONF — előbb az install.sh-t futtasd"
  # shellcheck disable=SC1090
  . "$RPW_CONF"
  : "${DOMAIN:?DOMAIN hiányzik a $RPW_CONF-ból}" "${BRANCH:?BRANCH hiányzik}"
}

as_rpw() { if [ "$(id -un)" = "$RPW_USER" ]; then "$@"; else runuser -u "$RPW_USER" -- "$@"; fi; }
console_in() { local rel="$1"; shift; (cd "$rel/symfony" && as_rpw php bin/console --no-interaction "$@"); }
console() { console_in "$RPW_CURRENT" "$@"; }

svc() { # svc reload|restart <unit>
  if [ "$RPW_NO_SYSTEMD" = "1" ]; then info "(systemd nélkül) $1 $2 kihagyva"; return 0; fi
  systemctl "$1" "$2"
}

current_release() { if [ -L "$RPW_CURRENT" ]; then readlink -f "$RPW_CURRENT"; fi; }

# Atomikus átkapcsolás: új symlink, majd rename — a futó kérések a régi kódot fejezik be.
activate_release() {
  ln -sfn "$1" "$RPW_HOME/.current.new"
  mv -Tf "$RPW_HOME/.current.new" "$RPW_CURRENT"
  svc reload "$RPW_FPM_SERVICE"   # opcache.validate_timestamps=0 → a reload dobja el a régi kódot
}
