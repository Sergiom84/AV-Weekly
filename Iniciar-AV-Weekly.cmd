@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Iniciar-AV-Weekly.ps1"
endlocal
