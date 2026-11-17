@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
if errorlevel 1 (
  echo.
  echo A preparacao do OmniYomi falhou. Leia o erro acima.
  pause
  exit /b 1
)
echo.
echo Preparacao concluida.
pause
