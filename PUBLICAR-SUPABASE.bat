@echo off
setlocal
cd /d "%~dp0"
title Publicar backend RealTalent CRM
if "%SUPABASE_ACCESS_TOKEN%"=="" goto :access
if "%SUPABASE_DB_PASSWORD%"=="" goto :password
if "%AUTOMATION_CRON_SECRET%"=="" goto :cron
if "%AUTOMATION_WEBHOOK_CRON_SECRET%"=="" goto :webhook
if "%GOOGLE_MAPS_API_KEY%"=="" goto :maps
set /p PROJECT_REF="Project ref do Supabase: "
if "%PROJECT_REF%"=="" exit /b 1
call npm run homologation:static || goto :erro
call npm run supabase:deploy -- --project-ref "%PROJECT_REF%"
pause
exit /b %errorlevel%
:access
echo Defina SUPABASE_ACCESS_TOKEN neste terminal antes de publicar.
goto :fim
:password
echo Defina SUPABASE_DB_PASSWORD neste terminal antes de publicar.
goto :fim
:cron
echo Defina AUTOMATION_CRON_SECRET com pelo menos 32 caracteres.
goto :fim
:webhook
echo Defina AUTOMATION_WEBHOOK_CRON_SECRET com pelo menos 32 caracteres.
goto :fim
:maps
echo Defina GOOGLE_MAPS_API_KEY antes de publicar.
goto :fim
:erro
echo A publicacao foi interrompida por uma validacao.
:fim
pause
exit /b 1
