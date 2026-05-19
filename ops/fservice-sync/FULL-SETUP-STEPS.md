# Full Setup Steps: FService Bridge + PHP Sync

## Overview

    You (this machine)
        |
        v
    FService.exe (runs here, listens :8090)
        |
        v  HTTP POST with sn=Fio66208021230737
    Device 192.168.1.200:5005 (Revo WFV-208BNC)
        |
        v  JSON response
    PHP sync.php pulls data
        |
        v  INSERT into MySQL
    demo_easylinksdk database

---

## PART A: FService Bridge Setup (this machine)

### A1. Enable .NET Framework 3.5

    Control Panel > Programs > Turn Windows features on or off
    Check: .NET Framework 3.5 (includes .NET 2.0 and 3.0)
    Click OK, wait for install

### A2. Copy bundle

The bundle is already at:

    E:\Project\easylink-frontend\ops\fservice-bundle\

Or copy to a shorter path:

    xcopy /E /I "E:\Project\easylink-frontend\ops\fservice-bundle" "C:\EasyLink"

### A3. Register COM components (Admin CMD)

Open Command Prompt as Administrator:

    cd C:\EasyLink
    reg_zk.bat
    reg_revo.bat
    reg_neo.bat

### A4. Verify Device.ini

Open Device.ini and confirm:

    [Revo WFV-208BNC]
    sn=Fio66208021230737
    aktivasi=707D0-6167-46CEC-1072-C4E46-1243-77086::3-30
    password=0
    number=1
    ip_address=192.168.1.200
    ethernet_port=5005

### A5. Verify SetDef.fin

    [setting]
    port=8090
    use_timeout=-1
    timeout=5000
    use_auto_restart=0
    val_auto_restart=23:00

### A6. Allow firewall

    netsh advfirewall firewall add rule name="FService Bridge" dir=in action=allow protocol=TCP localport=8090

### A7. Start FService

    cd C:\EasyLink
    FService.exe

Leave it running. It should show a window or tray icon.

### A8. Smoke test (new PowerShell window)

    Invoke-RestMethod -Method Post -Uri "http://localhost:8090/dev/info" -ContentType "application/x-www-form-urlencoded" -Body "sn=Fio66208021230737"

Expected:

    Result    : True
    DEVINFO   : @{Jam=...; Admin=...; User=...; FP=...; ...}

If you see Result=True, bridge is working.

---

## PART B: PHP Sync Script

### B1. Install PHP (if not present)

Option 1 - Standalone PHP:
    Download from https://windows.php.net/download/
    Extract to C:\php
    Add C:\php to PATH
    Enable extensions in php.ini:
        extension=curl
        extension=pdo_mysql

Option 2 - XAMPP:
    Use existing XAMPP PHP binary at C:\xampp\php\php.exe

### B2. Verify MySQL running

    mysql -u root -e "SHOW DATABASES LIKE 'demo_easylinksdk'"

If database missing, create it:

    mysql -u root -e "CREATE DATABASE demo_easylinksdk CHARACTER SET utf8mb4"

### B3. Ensure tables exist

    mysql -u root demo_easylinksdk -e "
    CREATE TABLE IF NOT EXISTS tb_user (
        pin VARCHAR(20) NOT NULL PRIMARY KEY,
        nama VARCHAR(100) DEFAULT '',
        pwd VARCHAR(100) DEFAULT '',
        rfid VARCHAR(50) DEFAULT '0',
        privilege INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS tb_scanlog (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        sn VARCHAR(50) DEFAULT '',
        scan_date VARCHAR(30) NOT NULL,
        pin VARCHAR(20) NOT NULL,
        verifymode INT DEFAULT 0,
        iomode INT DEFAULT 0,
        workcode VARCHAR(10) DEFAULT '0',
        UNIQUE KEY uq_scan (sn, scan_date, pin)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    "

### B4. Test sync script

    cd E:\Project\easylink-frontend\ops\fservice-sync
    php sync.php

Expected output:

    === EasyLink FService Sync ===
    Bridge: http://localhost:8090/
    Device SN: Fio66208021230737
    Database: demo_easylinksdk@localhost:3306
    Mode: incremental

    [OK] Bridge alive. Device info received.

    [INFO] Pulling users from bridge...
    [INFO] Users synced: 133

    [INFO] Pulling scanlogs from bridge (/scanlog/new)...
    [INFO] Scanlogs synced: 55598

    === Done ===

### B5. Run modes

    php sync.php                  # incremental (new scanlogs + users)
    php sync.php --users-only     # users only
    php sync.php --scanlogs-only  # scanlogs only
    php sync.php --full           # ALL scanlogs via /scanlog/all/paging

### B6. Schedule automatic sync (optional)

Windows Task Scheduler:

    Program: C:\php\php.exe
    Arguments: E:\Project\easylink-frontend\ops\fservice-sync\sync.php
    Trigger: Every 15 minutes (or match Device.ini Jadwal times)

---

## PART C: Connect to EasyLink App

### C1. Update .env

Once bridge confirmed working, edit E:\Project\easylink-frontend\.env:

    EASYLINK_WSDK_BASE_URL=http://localhost:8090
    EASYLINK_WSDK_IP=127.0.0.1
    EASYLINK_WSDK_PORT=8090
    EASYLINK_DEVICE_SN=Fio66208021230737

### C2. Restart Next.js dev server

    npm run dev

### C3. Test from app

Go to Machine page in browser. Device Info should now return live data.

---

## Quick Reference - Endpoint Map

    POST /dev/info           body: sn=...
    POST /dev/settime        body: sn=...
    POST /dev/init           body: sn=...
    POST /scanlog/new        body: sn=...
    POST /scanlog/all/paging body: sn=...&limit=100
    POST /scanlog/del        body: sn=...
    POST /user/all/paging    body: sn=...&limit=100
    POST /user/set           body: sn=...&pin=...&nama=...&pwd=...&rfid=...&priv=...&tmp=...
    POST /user/del           body: sn=...&pin=...
    POST /user/delall        body: sn=...
    POST /dev/deladmin       body: sn=...
    POST /log/del            body: sn=...

All responses: {"Result":true/false,"IsSession":true/false,"Data":[...]}

---

## Checklist

    [ ] .NET 3.5 enabled
    [ ] COM components registered (3 bat files)
    [ ] Device.ini correct (SN, IP, port)
    [ ] SetDef.fin port=8090
    [ ] Firewall rule added
    [ ] FService.exe running
    [ ] Smoke test passes (Result=True)
    [ ] PHP installed with curl + pdo_mysql
    [ ] MySQL running, database + tables exist
    [ ] php sync.php runs successfully
    [ ] .env updated for Next.js app
    [ ] App Machine page shows live device info
