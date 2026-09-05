@echo off
setlocal

if not exist "%~dp0promo" (
  echo Media directory is missing.
  pause
  exit /b 1
)

start "" explorer.exe "%~dp0promo"
exit /b 0
