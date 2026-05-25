# Full Setup Steps: FService Bridge + PHP Sync

## Overview

Recommended architecture keeps Windows machine as bridge/staging node and Linux VM as canonical app node.

```text
Operator browser
  -> PHP control panel on Windows (:9090)
  -> local staging DB on Windows

FService.exe on Windows (:8090)
  -> talks to device via vendor SDK path
  -> device 192.168.1.200:5005 (Revo WFV-208BNC)

sync.php worker on Windows
  -> fetches from FService
  -> stores raw logs/checkpoints in local staging DB
  -> pushes batches to Linux VM ingest API

Linux VM app/API
  -> writes final canonical attendance data into app DB
  -> app/reporting reads Linux VM DB only
```

### Canonical design rules

- Windows local DB is **temporary durable staging**, not full app mirror.
- Linux VM app DB is **single source of truth**.
- FService is **bridge/transport**, not trusted final history store.
- Best outbound path from Windows is **HTTP ingest API to VM**, not direct remote DB writes.
- App/reporting should **not** read Windows DB.

---

## Architecture decision - what to store where

### Windows machine should store

- device registry/config for bridge routing
- fetch checkpoints / last cursor / last successful fetch
- raw fetched scanlogs staged locally
- sync queue state: `pending`, `sending`, `sent`, `failed`, `dead_letter`
- operator health and sync batch logs

### Windows machine should NOT become

- full mirror of Linux VM app DB
- canonical attendance reporting DB
- final business state store for schedules, approvals, auth, or reports

### Linux VM should store

- canonical attendance ingest rows
- normalized attendance history
- app business tables, reports, approvals, auth state

### Connection model

Windows bridge machine normally has **two backend connections**:

1. **Local DB connection** -> local MariaDB/MySQL staging database on Windows
2. **Remote API connection** -> Linux VM ingest API

Recommended shape:

```text
Windows PHP / sync worker
  -> local DB (direct DB connection)
  -> Linux VM ingest API (HTTP)
```

Avoid this shape unless absolutely forced:

```text
Windows PHP
  -> local DB
  -> remote Linux VM DB directly
```

---

## Proposed minimal local staging schema

Use local database such as `easylink_bridge` on Windows.

Core tables:

- `device_registry`
  - one row per machine / serial number
- `fetch_checkpoint`
  - last successful fetch markers per device
- `raw_scanlog_staging`
  - raw fetched rows plus sync status and retry metadata
- `sync_batch`
  - batch-level sync history to VM
- `sync_batch_item` (optional)
  - per-row batch result audit

Suggested canonical VM-side ingest table:

- `attendance_scanlog_ingest`
  - final ingest boundary in Linux VM app DB before downstream normalization/reporting

---

## Recommended sync flow

1. `sync.php` fetches from FService endpoints such as `/scanlog/new` using `sn=...`.
2. Raw rows are written to local `raw_scanlog_staging` first.
3. Local checkpoint is updated only after fetch/save succeeds.
4. Pending rows are batched and sent to Linux VM ingest API.
5. VM API deduplicates and writes canonical ingest rows.
6. Windows rows are marked `sent` only after VM confirms success.
7. Failed rows remain local for retry or `dead_letter` review.

Key rule: **fetch success must not depend on Linux VM being online at that moment**.

---

## Recommended sync worker modes

Target shape for `sync.php`:

```text
php sync.php fetch
php sync.php sync-pending
php sync.php retry-failed
php sync.php full-cycle
php sync.php fetch --device=Fio66208021230737
```

`full-cycle` should:

1. fetch new logs from all enabled devices
2. store them locally
3. push pending rows to VM API
4. leave unsent rows queued for retry if VM unavailable

---

## Dedupe rules

Dedupe on both Windows staging side and Linux VM ingest side.

Preferred unique key if vendor log id is stable:

- `device_sn + vendor_log_id`

Fallback natural key:

- `device_sn + machine_user_id + scan_time + io_mode`

This protects against duplicate fetches and replay retries.

---

## Environment guidance

Use local DB env on Windows launcher/worker, plus VM API config.

Example values:

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_NAME=easylink_bridge
VM_API_BASE=http://<linux-vm>:3000
VM_API_TOKEN=<shared-secret>
```

Do not place Linux VM DB credentials in normal operator launcher unless you intentionally choose direct remote DB writes.

---

## Operator UI role

`web/index.php` should act as control panel for:

- FService bridge health
- local DB health
- VM API health
- pending / failed / sent counters
- last fetch time
- last sync time
- manual actions such as fetch now / sync pending / retry failed

It should not become final attendance reporting UI.

---

## Scheduler recommendation

Use Windows Task Scheduler to run worker repeatedly, for example every 1-5 minutes:

```text
php E:\Project\easylink-frontend\ops\fservice-sync\sync.php full-cycle
```

This is safer than depending on browser/manual operator actions.

---

## Current repo reality note

Some older files and defaults still reference direct insert into `demo_easylinksdk` and localhost/root-style instructions. Treat those as legacy setup hints, not final architecture. Preferred direction now is:

- local Windows staging DB
- outbound sync to Linux VM ingest API
- Linux VM app DB as canonical source of truth

---

## PART A: FService Bridge Setup (this machine)


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

Option 1 - Laragon PHP (recommended for this repo):
    Use C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe
    Confirm extensions in php.ini:
        extension=curl
        extension=pdo_mysql

Option 2 - Standalone PHP:
    Download from https://windows.php.net/download/
    Extract to C:\php
    Add C:\php to PATH
    Enable extensions in php.ini:
        extension=curl
        extension=pdo_mysql

### B2. Verify local staging DB running

Preferred local database on Windows:

```text
easylink_bridge
```

Example check:

    mysql -u root -e "SHOW DATABASES LIKE 'easylink_bridge'"

If missing, create it:

    mysql -u root -e "CREATE DATABASE easylink_bridge CHARACTER SET utf8mb4"

### B3. Create staging tables

Minimum local tables should cover:

- `device_registry`
- `fetch_checkpoint`
- `raw_scanlog_staging`
- `sync_batch`
- `sync_batch_item` (optional)

Recommended starter schema:

    mysql -u root easylink_bridge -e "
    CREATE TABLE IF NOT EXISTS device_registry (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        device_sn VARCHAR(64) NOT NULL UNIQUE,
        device_name VARCHAR(128) NULL,
        bridge_host VARCHAR(128) NOT NULL DEFAULT '127.0.0.1',
        bridge_port INT NOT NULL DEFAULT 8090,
        device_ip VARCHAR(64) NULL,
        device_port INT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        last_seen_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS fetch_checkpoint (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        device_sn VARCHAR(64) NOT NULL,
        last_fetch_started_at DATETIME NULL,
        last_fetch_finished_at DATETIME NULL,
        last_successful_fetch_at DATETIME NULL,
        last_log_stamp DATETIME NULL,
        last_vendor_log_id VARCHAR(128) NULL,
        last_cursor_json JSON NULL,
        last_status ENUM('idle','running','success','partial','failed') NOT NULL DEFAULT 'idle',
        last_error TEXT NULL,
        retry_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fetch_checkpoint_device (device_sn)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS raw_scanlog_staging (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        device_sn VARCHAR(64) NOT NULL,
        vendor_log_id VARCHAR(128) NULL,
        machine_user_id VARCHAR(128) NOT NULL,
        scan_time DATETIME NOT NULL,
        verify_mode VARCHAR(32) NULL,
        io_mode VARCHAR(32) NULL,
        work_code VARCHAR(64) NULL,
        raw_payload_json JSON NOT NULL,
        fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sync_status ENUM('pending','sending','sent','failed','dead_letter') NOT NULL DEFAULT 'pending',
        sync_attempts INT NOT NULL DEFAULT 0,
        last_sync_attempt_at DATETIME NULL,
        sent_at DATETIME NULL,
        last_error TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_staging_status_time (sync_status, scan_time),
        KEY idx_staging_device_time (device_sn, scan_time),
        UNIQUE KEY uq_staging_natural (device_sn, machine_user_id, scan_time, io_mode)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS sync_batch (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        batch_uuid CHAR(36) NOT NULL UNIQUE,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME NULL,
        status ENUM('running','success','partial','failed') NOT NULL DEFAULT 'running',
        rows_selected INT NOT NULL DEFAULT 0,
        rows_sent INT NOT NULL DEFAULT 0,
        rows_failed INT NOT NULL DEFAULT 0,
        error_summary TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    "

### B4. Configure worker environment

Recommended worker/launcher variables:

    set DB_HOST=127.0.0.1
    set DB_PORT=3306
    set DB_USER=root
    set DB_PASS=
    set DB_NAME=easylink_bridge
    set VM_API_BASE=http://<linux-vm>:3000
    set VM_API_TOKEN=<shared-secret>

Use local DB for staging. Use VM API for final delivery.

### B5. Recommended sync worker modes

Target worker shape:

    php sync.php fetch
    php sync.php sync-pending
    php sync.php retry-failed
    php sync.php full-cycle
    php sync.php fetch --device=Fio66208021230737

Expected behavior:

- `fetch` pulls from FService and stores locally first
- `sync-pending` pushes local pending rows to Linux VM ingest API
- `retry-failed` requeues/retries failed rows
- `full-cycle` does fetch + local stage + outbound sync

### B6. Schedule automatic sync (recommended)

Windows Task Scheduler:

    Program: C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe
    Arguments: E:\Project\easylink-frontend\ops\fservice-sync\sync.php full-cycle
    Trigger: Every 1-5 minutes (pick interval based on device/load)

This is safer than depending on browser/manual operator actions.

---

## PART C: Connect to EasyLink App

### C1. VM-side ingest expectation

Preferred final-delivery path is:

```text
Windows sync worker -> Linux VM ingest API -> Linux VM app DB
```

Recommended VM endpoint shape:

```text
POST /api/machine/scanlogs/ingest
Authorization: Bearer <shared-secret-or-token>
Content-Type: application/json
```

Payload should include:

- bridge/batch metadata
- device serial number
- log rows with raw payload preserved

VM side should:

- authenticate bridge token
- validate payload
- deduplicate rows
- store canonical ingest rows in Linux VM DB
- return accepted / duplicate / failed counts

### C2. App bridge env for live machine actions

If app still needs direct bridge actions for device info/commands, keep bridge env pointed at FService:

    EASYLINK_WSDK_BASE_URL=http://localhost:8090
    EASYLINK_WSDK_IP=127.0.0.1
    EASYLINK_WSDK_PORT=8090
    EASYLINK_DEVICE_SN=Fio66208021230737

That bridge path is separate from recommended attendance sync path.

### C3. Test from app

Go to Machine page in browser. Device Info should return live bridge data.

For attendance sync architecture, also verify:

1. local fetch stores rows in `raw_scanlog_staging`
2. VM ingest accepts pushed rows
3. local rows flip to `sent` only after VM confirms success
4. duplicates do not create duplicate final rows on VM

---

## Quick decision summary

If you are unsure which architecture to follow, use this:

- **FService** = Windows bridge to device
- **Windows local DB** = durable temporary staging and retry queue
- **Linux VM app DB** = only canonical source of truth
- **Windows -> VM** = send through HTTP ingest API when possible
- **Do not** build full 1:1 mirror of app DB on Windows unless you have strong special-case requirements

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
