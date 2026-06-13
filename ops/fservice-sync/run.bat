@echo off
setlocal EnableExtensions EnableDelayedExpansion
title EasyLink Control Panel
echo ============================================
echo   EasyLink FService + Control Panel
echo   (Windows = machine fetcher. App lives on VM.)
echo ============================================
echo.

:: ============================================================================
:: Config
:: ============================================================================
set "FSERVICE_DIR=%~dp0..\fservice-bundle"
set "PHP_PORT=9090"
set "FSERVICE_HOST=localhost"
set "FSERVICE_PORT=8090"
set "FSERVICE_SN=Fio66208021230737"
set "DB_HOST=127.0.0.1"
set "DB_PORT=3306"
set "DB_USER=root"
set "DB_PASS="
set "DB_NAME=demo_easylinksdk"
set "PHP_EXE=C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe"

:: Hop B target = Next.js app on VM
set "VM_HOST=192.168.1.129"
set "VM_PORT=3000"
set "HANDSHAKE_PS1=%~dp0handshake-test.ps1"

:: ============================================================================
:: Find PHP
:: ============================================================================
if exist "%PHP_EXE%" (
    set "PHP=%PHP_EXE%"
) else (
    where php >nul 2>&1
    if !errorlevel! neq 0 (
        if exist "C:\php\php.exe" (
            set "PHP=C:\php\php.exe"
        ) else (
            echo [ERROR] PHP not found. Expected Laragon PHP at:
            echo         %PHP_EXE%
            echo         Or a php.exe available on PATH.
            pause
            exit /b 1
        )
    ) else (
        set "PHP=php"
    )
)

echo [0/6] Using PHP: %PHP%
echo.

:: ============================================================================
:: [1/6] Kill stale processes (clean slate)
:: ============================================================================
echo [1/6] Killing stale processes...

tasklist /FI "IMAGENAME eq FService.exe" 2>NUL | find /I "FService.exe" >NUL
if !errorlevel! equ 0 (
    echo       Stopping FService.exe...
    taskkill /IM FService.exe /F >nul 2>&1
) else (
    echo       FService.exe not running.
)

:: Stale PHP server window from previous run
taskkill /FI "WINDOWTITLE eq EasyLink PHP Server" /F >nul 2>&1

:: Anything bound to PHP_PORT (best-effort)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PHP_PORT% " ^| findstr LISTENING') do (
    echo       Killing PID %%P on :%PHP_PORT%
    taskkill /PID %%P /F >nul 2>&1
)

timeout /t 2 /nobreak >nul
echo       Clean slate ready.
echo.

:: ============================================================================
:: [2/6] Start FService
:: ============================================================================
echo [2/6] Starting FService...
if not exist "%FSERVICE_DIR%\FService.exe" (
    echo [ERROR] FService.exe not found at %FSERVICE_DIR%
    pause
    exit /b 1
)
start "" "%FSERVICE_DIR%\FService.exe"
timeout /t 3 /nobreak >nul
echo       FService started.
echo.

:: ============================================================================
:: [3/6] Test bridge connection (local FService)
:: ============================================================================
echo [3/6] Testing bridge connection (FService :%FSERVICE_PORT%)...
%PHP% -r "echo @file_get_contents('http://localhost:%FSERVICE_PORT%/dev/info', false, stream_context_create(['http'=>['method'=>'POST','header'=>'Content-Type: application/x-www-form-urlencoded','content'=>'sn=%FSERVICE_SN%','timeout'=>10]])) ?: 'BRIDGE NOT RESPONDING';"
echo.
echo.

:: ============================================================================
:: [4/6] Hop B handshake (Windows -> VM app)
:: ============================================================================
echo [4/6] Hop B handshake to VM %VM_HOST%:%VM_PORT% ...
if not exist "%HANDSHAKE_PS1%" (
    echo [WARN] handshake-test.ps1 not found at %HANDSHAKE_PS1%
    echo        Skipping handshake.
) else (
    if "%HOP_B_AUTH_TOKEN%"=="" (
        echo [WARN] HOP_B_AUTH_TOKEN env var not set.
        echo        Step 3 of handshake will fail with exit code 4.
        echo        Set in this shell BEFORE running:
        echo           set HOP_B_AUTH_TOKEN=^<paste token from VM .env^>
    )
    powershell -NoProfile -ExecutionPolicy Bypass -File "%HANDSHAKE_PS1%" -VmHost %VM_HOST% -VmPort %VM_PORT%
    set "HANDSHAKE_EXIT=!errorlevel!"
    if !HANDSHAKE_EXIT! equ 0 (
        echo       Handshake PASSED.
    ) else (
        echo [WARN] Handshake exit code !HANDSHAKE_EXIT! (0=ok,1=tcp,2=status,3=auth,4=no-token^)
        echo        VM app may be down or token mismatch. Control panel will still load.
    )
)
echo.

:: ============================================================================
:: [5/6] Start Control Panel web server
:: ============================================================================
echo [5/6] Starting Control Panel web server on :%PHP_PORT% ...
start "EasyLink PHP Server" %PHP% -S localhost:%PHP_PORT% -t "%~dp0web"
timeout /t 2 /nobreak >nul
echo.

:: ============================================================================
:: [6/6] Open browser
:: ============================================================================
echo [6/6] Opening browser...
start "" "http://localhost:%PHP_PORT%"

echo.
echo ============================================
echo   Control Panel:  http://localhost:%PHP_PORT%
echo   FService:       http://localhost:%FSERVICE_PORT%
echo   VM App (Hop B): http://%VM_HOST%:%VM_PORT%
echo.
echo   Press any key to stop PHP server...
echo ============================================
echo.
pause

:: ============================================================================
:: Cleanup on exit
:: ============================================================================
echo Stopping services...
taskkill /FI "WINDOWTITLE eq EasyLink PHP Server" /F >nul 2>&1
echo Stopped.
endlocal
