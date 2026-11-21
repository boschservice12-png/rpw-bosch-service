# ════════════════════════════════════════════════════════════════
#  RPW — helyi kipróbálás egy paranccsal:   docker compose up --build
#  Utána: http://localhost:8000/rpw-login.html  ·  Ferenc Admin · PIN 4826
#
#  Éles módban fut (APP_ENV=prod), ahogy a szerveren is fog — saját,
#  helyi SQLite-adatbázissal. Az éles Supabase-adatokhoz NEM nyúl.
# ════════════════════════════════════════════════════════════════

# ── 1) PHP-függőségek ───────────────────────────────────────────
FROM composer:2 AS vendor
WORKDIR /app
# Opcionális: TLS-t bontó céges proxy mögött tedd a proxy tanúsítványát (PEM, *.crt)
# a docker/extra-ca/ mappába — itt bekerül a megbízható tanúsítványok közé.
COPY docker/extra-ca/ /tmp/extra-ca/
RUN for c in /tmp/extra-ca/*.crt; do [ -f "$c" ] && cat "$c" >> /etc/ssl/certs/ca-certificates.crt; done; true
COPY symfony/composer.json symfony/composer.lock symfony/symfony.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --no-progress --prefer-dist --optimize-autoloader \
      --ignore-platform-req=ext-intl

# ── 2) Futtató kép ──────────────────────────────────────────────
FROM php:8.3-cli-alpine
RUN addgroup -S rpw && adduser -S -G rpw -h /app rpw \
    && { echo 'expose_php=Off'; echo 'display_errors=Off'; echo 'log_errors=On'; \
         echo 'memory_limit=256M'; echo 'post_max_size=16M'; echo 'max_execution_time=90'; \
         echo 'opcache.enable_cli=1'; } > /usr/local/etc/php/conf.d/99-rpw.ini
WORKDIR /app
# a meglévő felület (a repó gyökere) + a Symfony backend
COPY --chown=rpw:rpw . /app
COPY --from=vendor --chown=rpw:rpw /app/vendor /app/symfony/vendor
RUN chmod +x /app/docker/entrypoint.sh && install -d -o rpw -g rpw -m 750 /data /app/symfony/var

ENV APP_ENV=prod APP_DEBUG=0 \
    DATABASE_URL="sqlite:////data/rpw.db" \
    RPW_STORAGE_DIR=/data/storage \
    RPW_AI_MODEL=claude-sonnet-5
USER rpw
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8000/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/docker/entrypoint.sh"]
