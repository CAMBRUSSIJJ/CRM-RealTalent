@echo off
setlocal
cd /d "%~dp0"
title Preparar RealTalent CRM para GitHub
where git >nul 2>nul || (
  echo Git nao foi encontrado. Instale o Git for Windows antes de continuar.
  pause
  exit /b 1
)
if not exist .git git init || goto :erro
git branch -M main || goto :erro
git add . || goto :erro
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "RealTalent CRM V100.29 - pronto para operar" || goto :erro
)
echo.
echo Repositorio local preparado na branch main, sem licenca e sem arquivos de ambiente.
where gh >nul 2>nul || (
  echo Para criar o repositorio privado automaticamente, instale o GitHub CLI e execute:
  echo gh auth login
  echo gh repo create realtalent-crm --private --source=. --remote=origin --push
  pause
  exit /b 0
)
set /p CRIAR="Criar agora o repositorio privado realtalent-crm no GitHub? [S/N]: "
if /I "%CRIAR%"=="S" gh repo create realtalent-crm --private --source=. --remote=origin --push
pause
exit /b 0
:erro
echo Nao foi possivel preparar o repositorio Git.
pause
exit /b 1
