@echo off
chcp 65001 >nul
rem RPW leállítása. Az adat MEGMARAD (a következő indításkor ott folytatod).
cd /d "%~dp0"
docker compose stop
echo.
echo  RPW leállítva. Az adat megmaradt.
pause
