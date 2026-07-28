@echo off
setlocal
cd /d "%~dp0"
title RealTalent CRM - Modo Local
where node >nul 2>nul || (
  echo Node.js 22 nao foi encontrado. Instale o Node.js antes de continuar.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias...
  call npm ci || goto :erro
)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:4173'"
echo Abrindo o RealTalent CRM em modo local.
echo Os dados ficarao somente neste navegador.
call npm run start:demo
exit /b %errorlevel%
:erro
echo Nao foi possivel preparar o CRM.
pause
exit /b 1
