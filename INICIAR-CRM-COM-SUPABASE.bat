@echo off
setlocal
cd /d "%~dp0"
title RealTalent CRM - Supabase Local
where node >nul 2>nul || (
  echo Node.js 22 nao foi encontrado. Instale o Node.js antes de continuar.
  pause
  exit /b 1
)
where docker >nul 2>nul || (
  echo Docker Desktop nao foi encontrado. Instale e abra o Docker Desktop.
  pause
  exit /b 1
)
docker info >nul 2>nul || (
  echo O Docker Desktop esta instalado, mas nao esta ativo.
  echo Abra o Docker Desktop e execute este arquivo novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias...
  call npm ci || goto :erro
)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 12; Start-Process 'http://127.0.0.1:4173'"
call npm run start:stack
exit /b %errorlevel%
:erro
echo Nao foi possivel preparar o CRM.
pause
exit /b 1
