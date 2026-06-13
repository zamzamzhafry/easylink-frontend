@echo off
setlocal EnableExtensions EnableDelayedExpansion
title EasyLink Control Panel
echo ============================================
echo   EasyLink FService + Control Panel
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

:: Repo root (this file lives at <repo>\ops\fservice-sync\run.bat)
set "REPO_ROOT=%~dp0..\.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"

:: Next.js app
set "APP_PORT=3000"
set "APP_HOST=0.0.0.0"

:: Hop B handshake target (remote VM)
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

echo [0/7] Using PHP: %PHP%
echo       Repo root: %REPO_ROOT%
echo.

:: ============================================================================
:: [1/7] Kill stale processes (clean slate)
:: ============================================================================
echo [1/7] Killing stale processes...

:: FService.exe
tasklist /FI "IMAGENAME eq FService.exe" 2>NUL | find /I "FService.exe" >NUL
if !errorlevel! equ 0 (
    echo       Stopping FService.exe...
    taskkill /IM FService.exe /F >nul 2>&1
) else (
    echo       FService.exe not running.
)

:: Stale PHP server window
taskkill /FI "WINDOWTITLE eq EasyLink PHP Server" /F >nul 2>&1

:: Stale Next.js window (by title we set below)
taskkill /FI "WINDOWTITLE eq EasyLink Next App" /F >nul 2>&1

:: Anything bound to PHP_PORT / APP_PORT (best-effort)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PHP_PORT% " ^| findstr LISTENING') do (
    echo       Killing PID %%P on :%PHP_PORT%
    taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%APP_PORT% " ^| findstr LISTENING') do (
    echo       Killing PID %%P on :%APP_PORT%
    taskkill /PID %%P /F >nul 2>&1
)

timeout /t 2 /nobreak >nul
echo       Clean slate ready.
echo.

:: ============================================================================
:: [2/7] Start Next.js app on LAN :3000
:: ============================================================================
echo [2/7] Starting Next.js app on %APP_HOST%:%APP_PORT% ...
where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] npm not found on PATH. Install Node.js 18+.
    pause
    exit /b 1
)

if not exist "%REPO_ROOT%\node_modules" (
    echo       node_modules missing. Running npm install...
    pushd "%REPO_ROOT%"
    call npm install
    popd
)

start "EasyLink Next App" cmd /k "cd /d %REPO_ROOT% && npm run dev -- -H %APP_HOST% -p %APP_PORT%"

echo       Waiting for app on http://localhost:%APP_PORT% ...
set /a APP_TRIES=0
:WAIT_APP
set /a APP_TRIES+=1
timeout /t 2 /nobreak >nul
%PHP% -r "$c=@stream_context_create(['http'=>['timeout'=>2]]); echo @file_get_contents('http://localhost:%APP_PORT%/',false,$c)===false?'NO':'OK';" > "%TEMP%\el_appcheck.txt" 2>nul
set /p APP_CHECK=<"%TEMP%\el_appcheck.txt"
del "%TEMP%\el_appcheck.txt" >nul 2>&1
if "!APP_CHECK!"=="OK" (
    echo       App is up.
) else (
    if !APP_TRIES! lss 30 (
        echo       still booting... (try !APP_TRIES!/30^)
        goto WAIT_APP
    ) else (
        echo [WARN] App did not respond after 60s. Continuing anyway.
    )
)
echo.

:: ============================================================================
:: [3/7] Start FService
:: ============================================================================
echo [3/7] Starting FService...
if not exist "%FSERVICE_DIR%\FService.exe" (
    echo [WARN] FService.exe not found at %FSERVICE_DIR%
    echo        Skipping FService start. Bridge test will likely fail.
) else (
    start "" "%FSERVICE_DIR%\FService.exe"
    timeout /t 3 /nobreak >nul
    echo       FService started.
)
echo.

:: ============================================================================
:: [4/7] Test bridge connection
:: ============================================================================
echo [4/7] Testing bridge connection (FService :%FSERVICE_PORT%)...
%PHP% -r "echo @file_get_contents('http://localhost:%FSERVICE_PORT%/dev/info', false, stream_context_create(['http'=>['method'=>'POST','header'=>'Content-Type: application/x-www-form-urlencoded','content'=>'sn=%FSERVICE_SN%','timeout'=>10]])) ?: 'BRIDGE NOT RESPONDING';"
echo.
echo.

:: ============================================================================
:: [5/7] Hop B handshake (Windows -> VM %VM_HOST%:%VM_PORT%)
:: ============================================================================
echo [5/7] Hop B handshake to VM %VM_HOST%:%VM_PORT% ...
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
    )
)
echo.

:: ============================================================================
:: [6/7] Start Control Panel web server
:: ============================================================================
echo [6/7] Starting Control Panel web server on :%PHP_PORT% ...
start "EasyLink PHP Server" %PHP% -S localhost:%PHP_PORT% -t "%~dp0web"
timeout /t 2 /nobreak >nul
echo.

:: ============================================================================
:: [7/7] Open browser
:: ============================================================================
echo [7/7] Opening browser...
start "" "http://localhost:%PHP_PORT%"

echo.
echo ============================================
echo   Next.js App:    http://localhost:%APP_PORT%   (LAN: bound to %APP_HOST%)
echo   Control Panel:  http://localhost:%PHP_PORT%
echo   FService:       http://localhost:%FSERVICE_PORT%
echo   VM Hop B:       http://%VM_HOST%:%VM_PORT%
echo.
echo   Press any key to stop PHP server + Next app...
echo ============================================
echo.
pause

:: ============================================================================
:: Cleanup on exit
:: ============================================================================
echo Stopping services...
taskkill /FI "WINDOWTITLE eq EasyLink PHP Server" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq EasyLink Next App" /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%APP_PORT% " ^| findstr LISTENING') do (
    taskkill /PID %%P /F >nul 2>&1
)
echo Stopped.
endlocal
