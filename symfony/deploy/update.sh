#!/usr/bin/env bash
# Frissítés a beállított ág legfrissebb állapotára (rpw.conf: BRANCH). Ha nincs új commit, nem csinál semmit.
. "$(dirname "$0")/lib.sh"
need_root
load_conf
git -C "$RPW_REPO_DIR" fetch --prune --quiet origin
new="$(git -C "$RPW_REPO_DIR" rev-parse "origin/$BRANCH")"
live="$(cat "$RPW_CURRENT/REVISION" 2>/dev/null || true)"
if [ "$new" = "$live" ]; then ok "naprakész (${live:0:12})"; exit 0; fi
# a telepítő szkriptek is frissüljenek: a repó munkapéldánya az új állapotra áll, majd az ÚJ release.sh fut
git -C "$RPW_REPO_DIR" checkout --quiet --force "$BRANCH" && git -C "$RPW_REPO_DIR" reset --quiet --hard "origin/$BRANCH"
exec bash "$RPW_REPO_DIR/symfony/deploy/release.sh" "$new"
