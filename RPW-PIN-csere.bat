@echo off
chcp 65001 >nul
rem RPW a sajat gepen - PIN csere / elfelejtett PIN visszaallitasa (dupla kattintas).
rem A PIN nem latszik gepeleskor, es nem kerul fajlba. Alapbol: Ferenc Admin.
cd /d "%~dp0"
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo  A Docker Desktop nem fut. Inditsd el, vard meg a zoldet, utana kattints ujra erre a fajlra.
  echo.
  pause
  exit /b 1
)
echo.
echo  RPW PIN-csere - Ferenc Admin
echo  Szabaly: 4-8 szamjegy; NEM jo: 1234, 1111, evszam.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Read-Host 'Uj PIN (gepeleskor nem latszik)' -AsSecureString; $env:NEWPIN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)); Get-Content -Raw 'docker\pin-reset.php' | docker compose exec -T -e NEWPIN=$env:NEWPIN rpw php; Remove-Item Env:NEWPIN"
echo.
pause
