@echo off
setlocal

set "PROJECT_ROOT=C:\Users\Jond Doe\Desktop\Project\ProjectAMO"
set "SERVER_BAT=%PROJECT_ROOT%\Launch-ProjectAMO-Dev.bat"
set "APP_URL=http://localhost:5173/"

start "ProjectAMO Dev" "%SERVER_BAT%"

:wait_for_vite
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_for_vite
)

start "" "%APP_URL%"
