@echo off
title EasyLink Control Panel
echo ============================================
echo   EasyLink FService + Control Panel
echo ============================================
echo.

:: Config
set FSERVICE_DIR=%~dp0..\fservice-bundle
set PHP_PORT=9090
set FSERVICE_HOST=localhost
set FSERVICE_PORT=8090
set FSERVICE_SN=Fio66208021230737
set DB_HOST=192.168.1.129
set DB_PORT=3306
set DB_USER=easylink_sync
set DB_PASS=EasyLink2026!
set DB_NAME=demo_easylinksdk

:: Find PHP
where php >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\xampp\php\php.exe" (
        set PHP=C:\xampp\php\php.exe
    ) else if exist "C:\php\php.exe" (
        set PHP=C:\php\php.exe
    ) else (
        echo [ERROR] PHP not found. Install PHP or add to PATH.
        pause
        exit /b 1
    )
) else (
    set PHP=php
)

echo [1/4] Checking FService...
tasklist /FI "IMAGENAME eq FService.exe" 2>NUL | find /I "FService.exe" >NUL
if %errorlevel% neq 0 (
    echo       Starting FService from %FSERVICE_DIR%...
    start "" "%FSERVICE_DIR%\FService.exe"
    timeout /t 3 /nobreak >nul
    echo       FService started.
) else (
    echo       FService already running.
)

echo.
echo [2/4] Testing bridge connection...
%PHP% -r "echo @file_get_contents('http://localhost:8090/dev/info', false, stream_context_create(['http'=>['method'=>'POST','header'=>'Content-Type: application/x-www-form-urlencoded','content'=>'sn=Fio66208021230737','timeout'=>10]])) ?: 'BRIDGE NOT RESPONDING';"
echo.
echo.

echo [3/4] Starting Control Panel web server...
start "EasyLink PHP Server" %PHP% -S localhost:%PHP_PORT% -t "%~dp0web"
timeout /t 2 /nobreak >nul

echo [4/4] Opening browser...
start "" "http://localhost:%PHP_PORT%"

echo.
echo ============================================
echo   Control Panel: http://localhost:%PHP_PORT%
echo   FService:      http://localhost:%FSERVICE_PORT%
echo   Press any key to stop PHP server...
echo ============================================
echo.
pause

:: Kill PHP server on exit
taskkill /FI "WINDOWTITLE eq EasyLink PHP Server" /F >nul 2>&1
echo Stopped.
