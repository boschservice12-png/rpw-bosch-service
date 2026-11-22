#!/usr/bin/env bash
# ═══ RPW — ELSŐ TELEPÍTÉS friss Ubuntu 24.04 szerverre (saját Contabo VPS, NEM a TyreFleet gépe) ═══
# Futtatás rootként, terminállal (a PIN-t rejtve kéri):
#   ssh -t root@<IP> "bash /opt/rpw/repo/symfony/deploy/install.sh [domain]"
# Domain nélkül: <ip-kötőjelekkel>.sslip.io — azonnal valódi HTTPS, DNS-beállítás nélkül.
# Idempotens: újrafuttatva nem ír felül titkot, adatbázist vagy dolgozót — csak a hiányzót pótolja.
#
# Mit csinál: csomagok (PHP 8.3, PostgreSQL 16, Caddy) · tűzfal (22/80/443) · fail2ban · automatikus
# biztonsági frissítés · 'rpw' rendszerfelhasználó · titkok + mentési kulcs a szerveren generálva ·
# helyi adatbázis · első kiadás · szerviz + első admin (a PIN-t TE gépeled be) · éjszakai mentés.
. "$(dirname "$0")/lib.sh"
need_root
if [ "$RPW_NO_SYSTEMD" != "1" ]; then
  . /etc/os-release
  [ "${VERSION_ID:-}" = "24.04" ] || die "Ubuntu 24.04 kell (ez: ${PRETTY_NAME:-ismeretlen})"
  # Védőkorlát: erre a gépre NEM telepítünk, ha itt fut a TyreFleet (Ferenc döntése, 2026-11-22: külön gép).
  [ ! -d /opt/gumi ] || die "ezen a gépen a TyreFleet fut (/opt/gumi) — az RPW külön gépre megy"
fi
[ -d "$RPW_REPO_DIR/.git" ] || die "a repó nincs itt: $RPW_REPO_DIR (lásd TELEPITES.md 2. lépés)"

step "1/8 Konfiguráció ($RPW_CONF)"
if [ ! -f "$RPW_CONF" ]; then
  ip="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  domain="${1:-${ip//./-}.sslip.io}"
  branch="$(git -C "$RPW_REPO_DIR" rev-parse --abbrev-ref HEAD)"
  install -d -m 755 "$(dirname "$RPW_CONF")"
  cat > "$RPW_CONF" <<EOF
# RPW szerver-beállítások (NEM titok). Módosítás után: bash $DEPLOY_DIR/configure.sh
DOMAIN=$domain
BRANCH=$branch
SHOP_NAME="Szkaliczki Service SRL"
# Let's Encrypt értesítési cím (tanúsítvány-lejárat) — opcionális
ACME_EMAIL=
# A műhely fix IP-je (a fail2ban soha nem zárja ki) — opcionális
WORKSHOP_IP=
EOF
  ok "létrehozva: DOMAIN=$domain, BRANCH=$branch"
else
  info "már létezik — nem írom felül"
fi
load_conf

if [ "$RPW_NO_SYSTEMD" != "1" ]; then
step "2/8 Csomagok (PHP 8.3, PostgreSQL 16, Caddy) — pár perc"
export DEBIAN_FRONTEND=noninteractive
timedatectl set-timezone Europe/Bucharest 2>/dev/null || true
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git unzip openssl ufw fail2ban unattended-upgrades \
  postgresql-16 postgresql-client-16 php8.3-fpm php8.3-cli php8.3-pgsql php8.3-sqlite3 php8.3-intl \
  php8.3-mbstring php8.3-xml php8.3-zip php8.3-curl php8.3-opcache composer > /dev/null
if ! command -v caddy > /dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy > /dev/null
fi
ok "php $(php -r 'echo PHP_VERSION;'), $(psql --version | awk '{print $1" "$3}'), caddy $(caddy version | awk '{print $1}')"

step "3/8 Biztonság: tűzfal, fail2ban, automatikus frissítés"
ufw default deny incoming > /dev/null; ufw default allow outgoing > /dev/null
ufw limit OpenSSH > /dev/null; ufw allow 80/tcp > /dev/null; ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
ok "nyitva csak: 22 (SSH, fékkel), 80, 443 · biztonsági frissítések naponta"
fi

step "4/8 Felhasználó és könyvtárak"
if [ "$RPW_NO_SYSTEMD" != "1" ]; then
  id "$RPW_USER" > /dev/null 2>&1 || useradd --system --home-dir "$RPW_HOME" --shell /usr/sbin/nologin "$RPW_USER"
  install -d -m 755 -o "$RPW_USER" -g "$RPW_USER" "$RPW_HOME"
  install -d -m 750 -o root -g "$RPW_USER" "$RPW_SHARED"
  install -d -m 750 -o "$RPW_USER" -g "$RPW_USER" "$RPW_SHARED/storage" "$RPW_SHARED/log"
  install -d -m 750 -o "$RPW_USER" -g "$RPW_USER" "$RPW_BACKUPS"
else
  install -d "$RPW_HOME" "$RPW_SHARED/storage" "$RPW_SHARED/log" "$RPW_BACKUPS"
fi
install -d -m 755 "$RPW_RELEASES"
ok "$RPW_HOME (kód) · $RPW_SHARED (titkok, fotók, napló) · $RPW_BACKUPS (mentések)"

step "5/8 Titkok (a szerveren születnek, sehova nem kerülnek ki)"
ENV_LOCAL="$RPW_SHARED/.env.local"
if [ ! -f "$ENV_LOCAL" ]; then
  db_pw="$(openssl rand -hex 24)"
  shop_id="$(cat /proc/sys/kernel/random/uuid)"
  backup_key="$(php -r 'echo base64_encode(random_bytes(32));')"
  umask 027
  cat > "$ENV_LOCAL" <<EOF
# RPW éles titkok — GENERÁLVA $(date -Iseconds). NE másold ki, NE küldd el senkinek.
APP_ENV=prod
APP_DEBUG=0
APP_SECRET=$(openssl rand -hex 32)
DATABASE_URL="${RPW_DATABASE_URL:-postgresql://$RPW_USER:$db_pw@127.0.0.1:5432/$RPW_DB?serverVersion=16&charset=utf8}"
RPW_SHOP_ID=$shop_id
RPW_STORAGE_DIR=$RPW_SHARED/storage
# A mentési kulcs: nélküle a mentés NEM állítható vissza → őrizd meg a gépen KÍVÜL is (TELEPITES.md 6. lépés).
RPW_BACKUP_KEY=$backup_key
# Fotótár: local = a szerver lemeze (próba, staging) · s3 = objektumtár (ÉLES ADAT ELŐTT KÖTELEZŐ — TELEPITES-SZERVER.md 5b)
RPW_STORAGE_BACKEND=local
RPW_S3_ENDPOINT=
RPW_S3_REGION=
RPW_S3_BUCKET=
RPW_S3_ACCESS_KEY=
RPW_S3_SECRET_KEY=
# A fotók másolata egy MÁSIK szolgáltatónál — a kulcs CSAK írni/olvasni tudjon, törölni NE (TELEPITES-SZERVER.md 5c)
RPW_REPLICA_ENDPOINT=
RPW_REPLICA_REGION=
RPW_REPLICA_BUCKET=
RPW_REPLICA_ACCESS_KEY=
RPW_REPLICA_SECRET_KEY=
# OCR / iratbesorolás / levél — üresen a felület kézi bevitellel megy tovább (bash $DEPLOY_DIR/set-key.sh)
ANTHROPIC_API_KEY=
RESEND_API_KEY=
EOF
  umask 022
  [ "$RPW_NO_SYSTEMD" = "1" ] || { chown root:"$RPW_USER" "$ENV_LOCAL"; chmod 640 "$ENV_LOCAL"; }
  ok "új titkok: $ENV_LOCAL (640 root:$RPW_USER)"
else
  info "már léteznek — nem írom felül"
fi

if [ "$RPW_NO_SYSTEMD" != "1" ]; then
step "6/8 Adatbázis (PostgreSQL 16, csak a gépen belül elérhető)"
db_pw="$(sed -n 's#^DATABASE_URL="postgresql://[^:]*:\([^@]*\)@127\.0\.0\.1.*#\1#p' "$ENV_LOCAL")"
if [ -n "$db_pw" ]; then
  if [ "$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$RPW_USER'")" != "1" ]; then
    runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -c "CREATE ROLE $RPW_USER LOGIN PASSWORD '$db_pw'"
  fi
  for db in "$RPW_DB" "${RPW_DB}_drill"; do   # _drill: a havi visszatöltési próba ide tölt, az élőhöz nem nyúl
    if [ "$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")" != "1" ]; then
      runuser -u postgres -- createdb -O "$RPW_USER" -E UTF8 "$db"
    fi
  done
  ok "adatbázis: $RPW_DB (+ ${RPW_DB}_drill a próbához), tulajdonos: $RPW_USER"
else
  info "a DATABASE_URL nem helyi — a helyi adatbázist nem hozom létre"
fi
fi

step "7/8 Szerver-konfiguráció + első kiadás"
bash "$DEPLOY_DIR/configure.sh"
bash "$DEPLOY_DIR/release.sh"

step "8/8 Szerviz és első admin"
shop_id="$(sed -n 's/^RPW_SHOP_ID=//p' "$ENV_LOCAL")"
if [ -f "$RPW_SHARED/.seeded" ]; then
  info "a szerviz már létezik ($shop_id)"
elif [ -n "${RPW_ADMIN_PIN:-}" ] || [ -t 0 ]; then
  admin_name="${RPW_ADMIN_NAME:-}"; pin="${RPW_ADMIN_PIN:-}"
  [ -n "$admin_name" ] || read -r -p "  Az első admin neve (pl. Szkaliczki Ferenc): " admin_name
  [ -n "$pin" ] || read_secret pin "  Az admin PIN-je (4–6 számjegy, rejtve): "
  console rpw:shop:seed "$SHOP_NAME" "$admin_name" "$pin" --id="$shop_id"
  touch "$RPW_SHARED/.seeded"
  unset pin
else
  info "nincs terminál — a szerviz később: ssh -t root@<IP> \"bash $DEPLOY_DIR/install.sh\""
fi

printf '\n%s════ KÉSZ ════%s\n' "$c_ok" "$c_0"
echo "  Cím:        https://$DOMAIN/rpw-login.html"
echo "  Frissítés:  bash $DEPLOY_DIR/update.sh"
echo "  Visszaállás: bash $DEPLOY_DIR/rollback.sh"
echo "  Mentések:   $RPW_BACKUPS (éjjel 02:30, titkosítva)"
echo "  Ellenőrzés: bash $DEPLOY_DIR/status.sh"
