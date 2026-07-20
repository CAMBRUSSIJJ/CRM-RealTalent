@echo off
setlocal
cd /d "%~dp0"
title Validar RealTalent CRM
where node >nul 2>nul || (
  echo Node.js 22 nao foi encontrado.
  pause
  exit /b 1
)
if not exist node_modules call npm ci || goto :erro
call npm run check || goto :erro
echo.
echo CRM aprovado nas validacoes disponiveis neste computador.
pause
exit /b 0
:erro
echo.
echo A validacao encontrou um problema. Leia a mensagem acima.
pause
exit /b 1
