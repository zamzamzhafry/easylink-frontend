# SDK Server Bridge Blueprint

Last updated: 2026-04-23

## Purpose

This note turns the current PHP SDK demo repo into a practical server-machine design:

- machine SDK communication stays on the server machine
- the bridge is allowed to be loose and internal-only
- the React dashboard reads DB-backed data, not raw SDK responses
- Task Scheduler is used to pull and recover jobs safely

This is intentionally a **server-side worker blueprint**, not a public API design.

## What the sibling SDK repo already does

Observed from `E:\Project\sdk`:

- `content/info.php`
  - reads the first row from `tb_device`
  - calls `POST http://{server_IP}/dev/info`
  - sends body `sn={device_sn}`
- `content/user.php`
  - calls `POST http://{server_IP}/user/all/paging`
  - sends body `sn={device_sn}&limit={pagingLimit}`
  - loops until `IsSession` becomes `false`
  - writes results into `tb_user` and `tb_template`
- `content/scanlog.php`
  - calls `POST http://{server_IP}/scanlog/all/paging`
  - sends body `sn={device_sn}&limit={pagingLimit}`
  - loops until `IsSession` becomes `false`
  - also supports `POST http://{server_IP}/scanlog/new`
  - writes results into `tb_scanlog`
- `download_user_with_timer.php`
  - shows the same user-paging pattern in a direct callable script form
- `koneksidb.php`
  - uses plain local MySQL access against `demo_easylinksdk`
- `node_modules/easylink-js/src/EasyLink.ts`
  - confirms the same endpoint family from Node:
    - `/dev/info`
    - `/user/all`
    - `/user/set`
    - `/scanlog/all`
    - `/scanlog/new`

## Recommendation

Use **PHP first** on the server machine.

Why:

- the existing working sample is already PHP
- the current PHP flow already matches the device behavior
- `CURLOPT_TIMEOUT => 0` and `set_time_limit(0)` are already in place
- direct DB write logic is already familiar in that repo
- Task Scheduler + `php.exe script.php` is simpler than adding a permanent Node service unless you actually need one

Use Express only if you specifically want:

- one long-running JSON service process
- richer operational routing and structured logs
- easier future SDK abstraction in JavaScript

For pure reliability on the server machine, PHP scripts triggered by Task Scheduler are the lowest-friction starting point.

## Architecture target

Recommended split:

1. EasyLink device
2. local bridge on the server machine
3. MariaDB/MySQL tables
4. React dashboard reads from app DB only

Suggested flow:

```text
Task Scheduler
  -> local PHP script or local bridge endpoint
  -> SDK device endpoints
  -> writes tb_user / tb_template / tb_scanlog
  -> writes local status JSON
  -> React app reads DB and optional status JSON
```

## Internal bridge rules

Because you said the bridge can be unguarded and loose, keep these rules:

- no public internet exposure
- bind to `127.0.0.1` or private LAN only
- allow long-running requests
- allow paging loops until the device says session finished
- use Windows Firewall allowlists if binding beyond localhost
- never let the frontend dashboard directly forward arbitrary device commands

Loose is acceptable here only because the server machine is the trust boundary.

## Preferred bridge shapes

### Option A: pure PHP job scripts

Best when:

- you mainly need scheduled pulls
- you do not need a permanent JSON service
- you want the simplest production setup

Suggested files:

- `C:\EasyLinkBridge\jobs\pull-device-info.php`
- `C:\EasyLinkBridge\jobs\pull-users-full.php`
- `C:\EasyLinkBridge\jobs\pull-scanlog-new.php`
- `C:\EasyLinkBridge\jobs\pull-scanlog-full.php`
- `C:\EasyLinkBridge\jobs\write-health.php`

Task Scheduler directly runs them with `php.exe`.

### Option B: local PHP mini-service

Best when:

- you want JSON endpoints for local manual triggers
- you still want to keep PHP as the device integration language

Suggested local-only endpoints:

- `GET /health`
- `POST /internal/device/info`
- `POST /internal/pull/users/full`
- `POST /internal/pull/scanlog/new`
- `POST /internal/pull/scanlog/full`

Task Scheduler can hit these endpoints with `Invoke-WebRequest` or call the underlying scripts directly.

### Option C: local Express service

Best when:

- you want one long-running JS service
- you later want to reuse the same contract from other internal tooling

Suggested local-only endpoints:

- `GET /health`
- `POST /internal/device/info`
- `POST /internal/pull/users/full`
- `POST /internal/pull/scanlog/new`
- `POST /internal/pull/scanlog/full`

If you choose Express, still keep Task Scheduler as the trigger layer.

## Recommended contract

No matter which implementation you choose, keep the contract small and fixed.

### `GET /health`

Example response:

```json
{
  "ok": true,
  "bridge": "healthy",
  "device_host": "192.168.1.200:7005",
  "last_scanlog_pull": "2026-04-23T10:31:00+07:00",
  "last_users_pull": "2026-04-23T02:00:00+07:00"
}
```

### `POST /internal/device/info`

Behavior:

- reads active device row from `tb_device`
- calls `/dev/info`
- optionally stores a snapshot or just returns JSON

### `POST /internal/pull/users/full`

Behavior:

- reads active device row from `tb_device`
- calls `/user/all/paging`
- loops while `IsSession === true`
- clears and rewrites `tb_user` and `tb_template`
- writes a status file/log entry

### `POST /internal/pull/scanlog/new`

Behavior:

- reads active device row from `tb_device`
- calls `/scanlog/new`
- inserts returned rows into `tb_scanlog`
- should prefer append/upsert behavior in your real bridge instead of full delete

### `POST /internal/pull/scanlog/full`

Behavior:

- reads active device row from `tb_device`
- calls `/scanlog/all/paging`
- loops while `IsSession === true`
- best used for manual recovery or reconciliation

## Loose connection settings to keep

These settings match the current demo PHP code and are reasonable for an internal bridge:

```php
set_time_limit(0);
CURLOPT_TIMEOUT => 0;
CURLOPT_RETURNTRANSFER => true;
CURLOPT_CUSTOMREQUEST => "POST";
CURLOPT_HTTPHEADER => [
  "cache-control: no-cache",
  "content-type: application/x-www-form-urlencoded",
];
```

Recommended additions for production:

- explicit retry count around transport failures
- file logging for request start/end and row counts
- JSON health/status artifact written after each run
- defensive handling when device returns malformed JSON

## PHP-first implementation sketch

Minimal helper shape:

```php
<?php
function sdk_post($host, $port, $path, $payload) {
    $curl = curl_init();
    set_time_limit(0);
    curl_setopt_array($curl, [
        CURLOPT_PORT => $port,
        CURLOPT_URL => "http://{$host}{$path}",
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 0,
        CURLOPT_CUSTOMREQUEST => "POST",
        CURLOPT_POSTFIELDS => http_build_query($payload),
        CURLOPT_HTTPHEADER => [
            "cache-control: no-cache",
            "content-type: application/x-www-form-urlencoded",
        ],
    ]);

    $raw = curl_exec($curl);
    $err = curl_error($curl);
    curl_close($curl);

    if ($err) {
        throw new RuntimeException($err);
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException("Invalid JSON from device");
    }

    return $data;
}
```

User full-pull loop shape:

```php
$session = true;
while ($session) {
    $data = sdk_post($deviceHost, $devicePort, "/user/all/paging", [
        "sn" => $serialNumber,
        "limit" => 100,
    ]);

    foreach (($data["Data"] ?? []) as $entry) {
        // write tb_user and tb_template here
    }

    $session = (bool) ($data["IsSession"] ?? false);
}
```

This stays very close to the existing PHP demo repo, which is a good thing for the first server rollout.

## Express implementation sketch

If you prefer JS later, keep it local-only:

```js
import express from 'express';
import EasyLink from 'easylink-js';

const app = express();
const easyLink = new EasyLink({
  host: process.env.EASYLINK_DEVICE_HOST,
  serialNumber: process.env.EASYLINK_DEVICE_SN,
});

app.get('/health', async (_req, res) => {
  res.json({ ok: true, bridge: 'healthy' });
});

app.post('/internal/pull/scanlog/new', async (_req, res) => {
  const rows = await easyLink.getNewScanLogs();
  // normalize + insert into DB here
  res.json({ ok: true, rows: rows.length });
});

app.listen(8091, '127.0.0.1');
```

The Express path is fine, but it adds one more long-running process to keep alive. That is why PHP job scripts are the safer starting point on Windows Server.

## Task Scheduler mapping

Recommended mapping:

- `\EasyLink\EasyLink-Recovery`
  - restarts bridge/frontend when unhealthy
- `\EasyLink\EasyLink-PullScanlogNew`
  - every 1 minute
  - runs `php.exe C:\EasyLinkBridge\jobs\pull-scanlog-new.php`
- `\EasyLink\EasyLink-PullUsersFull`
  - nightly or hourly
  - runs `php.exe C:\EasyLinkBridge\jobs\pull-users-full.php`
- `\EasyLink\EasyLink-PullScanlogFull`
  - manual only or infrequent
  - runs `php.exe C:\EasyLinkBridge\jobs\pull-scanlog-full.php`

If you later expose local-only HTTP routes, the scheduler can trigger those instead, but direct script execution is still preferred.

## Data ownership

Keep machine-origin tables mostly untouched:

- `tb_device`
- `tb_user`
- `tb_template`
- `tb_scanlog`

Then let the frontend app join from those into your business tables:

- `tb_karyawan`
- `tb_group`
- `tb_employee_group`
- `tb_schedule`
- `tb_shift_type`

That keeps the machine pull layer simple and keeps the React app out of SDK-specific logic.

## Practical recommendation

If the goal is "make it reliable first":

1. use PHP scripts on the server machine
2. run them from Task Scheduler
3. write DB rows and one status JSON file
4. let the React app only read DB and trigger the fixed recovery task

If the goal later becomes "make it reusable as a JSON service":

1. keep the same DB-writing core
2. wrap it with a local PHP or Express service
3. keep that service internal-only

This gives you the easiest first cut without blocking a later JS rewrite.
