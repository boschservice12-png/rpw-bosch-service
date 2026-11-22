@echo off
chcp 65001 >nul
rem RPW a saját gépen — indítás (dupla kattintás). Az első indítás pár perc.
cd /d "%~dp0"
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo  A Docker Desktop nem fut. Indítsd el, várd meg, amíg zöld lesz, utána kattints újra erre a fájlra.
  echo.
  pause
  exit /b 1
)
echo  RPW indul... ^(az első alkalommal pár perc^)
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo  HIBA az indításnál — küldd el ezt az ablakot ^(képernyőkép^).
  pause
  exit /b 1
)
echo  Várakozás, amíg elindul...
timeout /t 8 >nul
start "" http://localhost:8000/rpw-login.html
echo.
echo  ================================================================
echo   RPW fut:   http://localhost:8000/rpw-login.html
echo   Belépés:   Ferenc Admin  -  PIN 4826
echo.
echo   Telefonról ^(ugyanazon a wifin^):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=* delims= " %%b in ("%%a") do echo     http://%%b:8000/rpw-login.html
echo.
echo   Leállítás: RPW-leallitas.bat   ·   Mentés a gépre: RPW-mentes.bat
echo  ================================================================
pause
