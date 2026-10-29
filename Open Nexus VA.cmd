@echo off
setlocal
cd /d "%~dp0"
call npm.cmd run start:local
if errorlevel 1 (
  echo.
  echo Nexus VA could not start. Check the message above.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5173/"
