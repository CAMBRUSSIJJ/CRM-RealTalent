@echo off
cd /d "%~dp0"
node --version
if errorlevel 1 goto missing
if not exist node_modules call npm ci
if errorlevel 1 goto failed
node bridge.mjs
pause
exit /b
:missing
echo Instale Node.js 22.18 ou superior e abra este arquivo novamente.
pause
exit /b 1
:failed
echo Nao foi possivel instalar as dependencias. Verifique sua conexao.
pause
exit /b 1
