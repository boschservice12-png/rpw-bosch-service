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
# 2026-11-22: a titkok a Symfony .env.local-jából is látszanak — így a kézi parancsok
# (docker compose exec rpw php bin/console rpw:backup …) is megkapják a mentési kulcsot.
ln -sf "$SECRETS" /app/symfony/.env.local
mkdir -p "$RPW_STORAGE_DIR" /data/backups

php bin/console cache:clear --no-warmup -q
php bin/console cache:warmup -q
php bin/console rpw:db:init
php bin/console rpw:shop:seed "Bosch Service (próba)" "Ferenc Admin" 4826 --id="$RPW_SHOP_ID" --demo

# 2026-11-22: ÉJSZAKAI MENTÉS a konténerben is (eddig nem volt: a gép hibájával minden elveszett volna).
# Naponta 02:30-kor titkosított, visszaellenőrzött mentés a /data/backups-ba (14 marad), utána visszatöltési
# próba. A mentés a géped lemezére a RPW-mentes.bat-tal másolható ki (pl. OneDrive / pendrive).
(
  while true; do
    now=$(date +%s); next=$(date -d "$(date +%Y-%m-%d) 02:30" +%s 2>/dev/null || echo $((now + 86400)))
    [ "$next" -gt "$now" ] || next=$((next + 86400))
    sleep $((next - now))
    php bin/console --no-interaction rpw:backup --to=/data/backups --keep=14 2>&1 | tail -1 | sed 's/^/[rpw-mentés] /'
    php bin/console --no-interaction rpw:restore latest --from=/data/backups --report=/data/backups/utolso-proba.json 2>&1 | head -1 | sed 's/^/[rpw-próba] /'
  done
) &

echo
echo "════════════════════════════════════════════════════════"
echo "  RPW fut:  http://localhost:${RPW_PORT:-8000}/rpw-login.html"
echo "  Belépés:  Ferenc Admin · PIN 4826   (a mintacsapat fent)"
echo "  Mentés:   naponta 02:30 (a konténerben) · kézzel: RPW-mentes.bat"
echo "════════════════════════════════════════════════════════"
# A PHP beépített szervere, 4 párhuzamos folyamattal (több telefon egyszerre se várjon egymásra).
# Élesben Caddy + PHP-FPM (symfony/deploy/).
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-4}"
exec php -S 0.0.0.0:8000 -t public public/router.php
