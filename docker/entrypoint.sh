#!/bin/sh
# RPW konténer-indító. Az első induláskor titkokat generál (a /data kötetben
# maradnak), létrehozza a táblákat és a mintaszervizt — mindez idempotens.
set -eu
cd /app/symfony
SECRETS=/data/.rpw-secrets
if [ ! -f "$SECRETS" ]; then
  umask 077
  {
    echo "APP_SECRET=$(php -r 'echo bin2hex(random_bytes(32));')"
    echo "RPW_SHOP_ID=$(php -r 'require "vendor/autoload.php"; echo Symfony\Component\Uid\Uuid::v4();')"
    echo "RPW_BACKUP_KEY=$(php -r 'echo base64_encode(sodium_crypto_secretstream_xchacha20poly1305_keygen());')"
  } > "$SECRETS"
  echo "[rpw] új titkok létrehozva: $SECRETS (a kötetben maradnak)"
fi
set -a; . "$SECRETS"; set +a
mkdir -p "$RPW_STORAGE_DIR"

php bin/console cache:clear --no-warmup -q
php bin/console cache:warmup -q
php bin/console rpw:db:init
php bin/console rpw:shop:seed "Bosch Service (próba)" "Ferenc Admin" 4826 --id="$RPW_SHOP_ID" --demo

echo
echo "════════════════════════════════════════════════════════"
echo "  RPW fut:  http://localhost:${RPW_PORT:-8000}/rpw-login.html"
echo "  Belépés:  Ferenc Admin · PIN 4826   (a mintacsapat fent)"
echo "════════════════════════════════════════════════════════"
# Egyszálú PHP-szerver: helyi kipróbáláshoz elég. Élesben Caddy + PHP-FPM (symfony/deploy/).
exec php -S 0.0.0.0:8000 -t public public/router.php
