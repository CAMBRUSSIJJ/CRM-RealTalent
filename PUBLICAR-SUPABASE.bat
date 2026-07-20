@echo off
setlocal
cd /d "%~dp0"
title Publicar backend RealTalent CRM
if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo Defina SUPABASE_ACCESS_TOKEN neste terminal antes de publicar.
  pause
  exit /b 1
)
if "%SUPABASE_DB_PASSWORD%"=="" (
  echo Defina SUPABASE_DB_PASSWORD neste terminal antes de publicar.
  pause
  exit /b 1
)
if "%AUTOMATION_CRON_SECRET%"=="" (
  echo Defina AUTOMATION_CRON_SECRET com pelo menos 32 caracteres e reutilize o mesmo valor nos redeploys.
  pause
  exit /b 1
)
set /p PROJECT_REF="Project ref do Supabase: "
if "%PROJECT_REF%"=="" exit /b 1
call npm run supabase:deploy -- --project-ref "%PROJECT_REF%"
pause
