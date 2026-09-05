@echo off
setlocal
chcp 65001 >nul

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Stop-Flux.ps1"
set "FLUX_EXIT_CODE=%ERRORLEVEL%"

if not "%FLUX_EXIT_CODE%"=="0" (
  echo.
  echo Flux Evidence Lab could not be stopped safely. See the message above.
  pause
)

exit /b %FLUX_EXIT_CODE%
