@echo off
setlocal
chcp 65001 >nul

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Verify-Files.ps1"
set "FLUX_EXIT_CODE=%ERRORLEVEL%"

echo.
pause
exit /b %FLUX_EXIT_CODE%
