@echo off
chcp 65001 >nul
rem RPW mentés MOST, és a mentések kimásolása ide: mentesek\  (innen tedd OneDrive-ra / pendrive-ra)
cd /d "%~dp0"
echo  Mentés készül...
docker compose exec -T -w /app/symfony rpw php bin/console --no-interaction rpw:backup --to=/data/backups --keep=14
if errorlevel 1 (
  echo  HIBA: a mentés nem sikerült. Fut az RPW? ^(RPW-inditas.bat^)
  pause
  exit /b 1
)
echo  Visszatöltési próba ^(az élő adathoz nem nyúl^)...
docker compose exec -T -w /app/symfony rpw php bin/console --no-interaction rpw:restore latest --from=/data/backups
if not exist mentesek mkdir mentesek
docker compose cp rpw:/data/backups/. mentesek
echo.
echo  ================================================================
echo   A mentések itt vannak: %~dp0mentesek
echo   Titkosítva — a visszaállításhoz a MENTÉSI KULCS kell.
echo   A kulcs ^(egyszer írd fel a jelszókezelődbe, NE ide a mappába^):
echo     docker compose exec rpw grep RPW_BACKUP_KEY /data/.rpw-secrets
echo  ================================================================
pause
