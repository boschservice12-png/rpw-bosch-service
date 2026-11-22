#!/usr/bin/env bash
# Új kiadás építése és élesítése egy git-commitból.   Használat: release.sh [git-ref]   (alap: origin/$BRANCH)
#  1. git archive → /opt/rpw/releases/<idő>-<sha>          (a futó kiadáshoz nem nyúl)
#  2. composer install --no-dev · titkok, fotótár, napló = közös (shared) mappa
#  3. mentés telepítés előtt → hiányzó táblák (rpw:db:init) → cache
#  4. atomikus átkapcsolás → egészség-ellenőrzés → HIBA ESETÉN AUTOMATIKUS VISSZAÁLLÁS az előző kiadásra
. "$(dirname "$0")/lib.sh"
need_root
load_conf

ref="${1:-origin/$BRANCH}"
T_START="$(date +%s)"
step "Kód: $ref"
git -C "$RPW_REPO_DIR" fetch --prune --quiet origin 2>/dev/null || info "fetch kihagyva (nincs hálózat / helyi próba)"
sha="$(git -C "$RPW_REPO_DIR" rev-parse --verify "$ref^{commit}")"
rel="$RPW_RELEASES/$(date +%Y%m%d-%H%M%S)-${sha:0:7}"
install -d -m 755 "$rel"
git -C "$RPW_REPO_DIR" archive "$sha" | tar -x -C "$rel"
# ami nem kell a futáshoz (tesztek, fejlesztői eszközök, régi Netlify/Supabase-részek): nem kerül a szerverre
rm -rf "$rel"/_tests "$rel"/symfony/tests "$rel"/node_modules "$rel"/docker "$rel"/Dockerfile "$rel"/docker-compose.yml \
       "$rel"/.dockerignore "$rel"/functions "$rel"/supabase "$rel"/package.json "$rel"/package-lock.json
echo "$sha" > "$rel/REVISION"
ok "commit ${sha:0:12} → $rel"

step "Függőségek (composer, --no-dev)"
cd "$rel/symfony"
ln -s "$RPW_SHARED/.env.local" .env.local
prev_rel="$(current_release || true)"
if [ -n "$prev_rel" ] && [ -d "$prev_rel/symfony/vendor" ] && cmp -s "$prev_rel/symfony/composer.lock" composer.lock \
   && cp -a "$prev_rel/symfony/vendor" vendor \
   && COMPOSER_ALLOW_SUPERUSER=1 APP_ENV=prod composer dump-autoload --no-dev --classmap-authoritative --no-interaction --quiet; then
  ok "vendor átvéve az előző kiadásból (composer.lock változatlan)"
else
  rm -rf vendor
  COMPOSER_ALLOW_SUPERUSER=1 APP_ENV=prod composer install --no-dev --classmap-authoritative --no-interaction --no-progress --quiet --no-scripts
  ok "vendor telepítve"
fi
rm -rf var && install -d -m 755 var
ln -s "$RPW_SHARED/log" var/log            # a napló kiadásokon át megmarad (a fail2ban ezt olvassa)
[ "$RPW_NO_SYSTEMD" = "1" ] || chown -R "$RPW_USER:$RPW_USER" var

step "Mentés telepítés előtt"
if [ -n "$prev_rel" ]; then
  # Elsőként az ÉLŐ kód ment (az ismeri biztosan a mai sémát). Ha éppen a mentésben van a hiba, a javítás
  # e nélkül soha nem kerülhetne fel → második próba az ÚJ kóddal. Mentés nélkül NEM telepítünk.
  if console_in "$prev_rel" rpw:backup --to="$RPW_BACKUPS/pre-deploy" --keep=5 > /dev/null 2>&1; then
    ok "kész (élő kóddal): $RPW_BACKUPS/pre-deploy"
  elif console_in "$rel" rpw:backup --to="$RPW_BACKUPS/pre-deploy" --keep=5 > /dev/null; then
    ok "kész (az új kóddal — az élő kód mentése elbukott): $RPW_BACKUPS/pre-deploy"
  else
    die "a mentés nem sikerült — a telepítés megállt, az élő kiadás változatlan"
  fi
else
  info "első kiadás — nincs mit menteni"
fi

step "Adatbázis + cache"
console_in "$rel" rpw:db:init > /dev/null
console_in "$rel" cache:warmup > /dev/null
ok "a hiányzó táblák létrehozva (meglévőhöz nem nyúl) · cache kész"

step "Átkapcsolás"
prev="$(current_release)"
activate_release "$rel"
ok "élő: $(basename "$rel")${prev:+  (előző: $(basename "$prev"))}"

step "Egészség-ellenőrzés"
bash "$DEPLOY_DIR/healthcheck.sh" || {
  if [ -n "$prev" ] && [ -d "$prev" ]; then
    echo "  ! az új kiadás nem egészséges → visszakapcsolok: $(basename "$prev")" >&2
    activate_release "$prev"
  fi
  die "az új kiadás nem egészséges (a kód visszaállt; a telepítés előtti mentés: $RPW_BACKUPS/pre-deploy)"
}
touch "$rel/.deployed"   # csak egészségesnek bizonyult kiadás lehet visszaállási cél

step "Régi kiadások takarítása (marad: $RPW_KEEP_RELEASES)"
cur="$(current_release)"
find "$RPW_RELEASES" -mindepth 1 -maxdepth 1 -type d | while read -r d; do
  [ -f "$d/.deployed" ] || [ "$d" = "$cur" ] || { rm -rf -- "$d"; info "félbemaradt, törölve: $(basename "$d")"; }
done
find "$RPW_RELEASES" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((RPW_KEEP_RELEASES + 1))" | while read -r old; do
  [ "$old" = "$cur" ] || { rm -rf -- "$old"; info "törölve: $(basename "$old")"; }
done
ok "KÉSZ — https://$DOMAIN · $(( $(date +%s) - T_START ))s"
