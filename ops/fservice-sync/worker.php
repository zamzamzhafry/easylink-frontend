<?php
/**
 * EasyLink Async Job Worker
 *
 * Spawned by web/index.php via `cmd /C start /B php worker.php <job_id>`.
 * Detached from web request — runs in own process, writes progress + final
 * result back to fservice_jobs table. Web JS polls ?action=job_status.
 *
 * Job types:
 *   - sync_scanlogs : pull /scanlog/new (or /scanlog/all/paging if full) into
 *                     demo_easylinksdk.tb_scanlog AND
 *                     easylink_bridge.raw_scanlog_staging (dual write so Hop B
 *                     worker sees fresh rows immediately).
 *   - sync_users    : pull /user/all/paging into demo_easylinksdk.tb_user.
 *   - hop_b_push    : drain easylink_bridge.raw_scanlog_staging by repeatedly
 *                     invoking hop-b-batch-selector.php --worker-run until
 *                     outcome == no_op.
 *
 * Exit: always 0 (status captured in DB).
 */

declare(strict_types=1);

require_once __DIR__ . '/lib-log.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');

$jobId = $argv[1] ?? '';
if ($jobId === '') {
    fwrite(STDERR, "usage: worker.php <job_id>\n");
    exit(1);
}

// --- Env / config (same shape as web/index.php) -----------------------------

$DB_HOST = getenv('DB_HOST') ?: '127.0.0.1';
$DB_PORT = getenv('DB_PORT') ?: '3306';
$DB_USER = getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('DB_PASS') ?: '';
$DB_NAME = getenv('DB_NAME') ?: 'demo_easylinksdk';
$BRIDGE_DB_NAME = getenv('HOP_B_DB_NAME') ?: 'easylink_bridge';
$TIMEOUT = 120;

function w_pdo(string $dbName): PDO {
    global $DB_HOST, $DB_PORT, $DB_USER, $DB_PASS;
    static $cache = [];
    if (isset($cache[$dbName])) return $cache[$dbName];
    $cache[$dbName] = new PDO(
        "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$dbName};charset=utf8mb4",
        $DB_USER, $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    return $cache[$dbName];
}

function w_main_pdo(): PDO { global $DB_NAME; return w_pdo($DB_NAME); }
function w_bridge_pdo(): PDO { global $BRIDGE_DB_NAME; return w_pdo($BRIDGE_DB_NAME); }

// --- Job lifecycle helpers --------------------------------------------------

function job_load(string $jobId): ?array {
    $stmt = w_main_pdo()->prepare("SELECT * FROM fservice_jobs WHERE job_id = ?");
    $stmt->execute([$jobId]);
    return $stmt->fetch() ?: null;
}

function job_set_running(string $jobId): void {
    w_main_pdo()->prepare("UPDATE fservice_jobs SET status='running', started_at=NOW() WHERE job_id=?")
        ->execute([$jobId]);
}

function job_set_progress(string $jobId, int $progress): void {
    w_main_pdo()->prepare("UPDATE fservice_jobs SET progress=? WHERE job_id=?")
        ->execute([$progress, $jobId]);
}

function job_set_done(string $jobId, array $result): void {
    w_main_pdo()->prepare(
        "UPDATE fservice_jobs SET status='done', result=?, finished_at=NOW() WHERE job_id=?"
    )->execute([json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $jobId]);
}

function job_set_error(string $jobId, string $msg, array $result = []): void {
    $result['ok'] = false;
    $result['error'] = $msg;
    w_main_pdo()->prepare(
        "UPDATE fservice_jobs SET status='error', last_error=?, result=?, finished_at=NOW() WHERE job_id=?"
    )->execute([
        substr($msg, 0, 4000),
        json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $jobId,
    ]);
}

// --- Bridge HTTP helper -----------------------------------------------------

function w_bridge_post(array $machine, string $path, array $fields = []): array {
    global $TIMEOUT;
    $baseUrl = "http://{$machine['bridge_host']}:{$machine['bridge_port']}";
    $fields['sn'] = $machine['sn'];
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $baseUrl . $path,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($fields),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $TIMEOUT,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    $rawSnippet = is_string($resp) ? substr($resp, 0, 500) : '(non-string)';
    el_log('DEBUG', 'worker-bridge', "POST $path", [
        'url' => $baseUrl . $path, 'http' => $code, 'body_head' => $rawSnippet,
        'fields' => array_diff_key($fields, ['sn' => 1]),
    ]);

    if ($resp === false) {
        return ['ok' => false, 'error' => $err ?: 'curl failed', 'http' => $code];
    }
    $json = json_decode($resp, true);
    if (!is_array($json)) {
        return ['ok' => false, 'error' => 'Non-JSON response', 'raw' => $rawSnippet, 'http' => $code];
    }
    return ['ok' => true, 'data' => $json, 'http' => $code];
}

// --- Dual-write helper: stage row into easylink_bridge ----------------------

function w_stage_one(PDOStatement $stage, string $sn, string $scanDateTs,
                     string $pin, int $verify, int $io, int $work): void {
    // scanDateTs is whatever FService gave us (e.g. "2026-06-13 17:43:51").
    // Split into date + time for the staging schema; key formula must match
    // hop-b-batch-selector source_event_key contract.
    $date = '';
    $time = '';
    if ($scanDateTs !== '') {
        $ts = strtotime($scanDateTs);
        if ($ts !== false) {
            $date = date('Y-m-d', $ts);
            $time = date('H:i:s', $ts);
        }
    }
    if ($date === '' || $time === '') {
        // unparseable timestamp — skip staging but don't fail the job
        el_log('WARN', 'worker-stage', 'skip unparseable scan_date', ['raw' => $scanDateTs, 'pin' => $pin]);
        return;
    }
    $key = "{$sn}|{$date}|{$time}|{$pin}|{$verify}|{$io}|{$work}";
    $stage->execute([
        ':sn'        => $sn,
        ':sd'        => $date,
        ':st'        => $time,
        ':pin'       => $pin,
        ':vm'        => $verify,
        ':io'        => $io,
        ':wc'        => $work,
        ':sek'       => $key,
        ':fetched'   => $scanDateTs ?: date('Y-m-d H:i:s'),
    ]);
}

// --- Job runners ------------------------------------------------------------

function run_sync_scanlogs(string $jobId, array $payload): void {
    $machineId = (int)($payload['machine_id'] ?? 0);
    $full      = !empty($payload['full']);
    if ($machineId <= 0) { job_set_error($jobId, 'machine_id required'); return; }

    $main   = w_main_pdo();
    $bridge = w_bridge_pdo();
    $mStmt = $main->prepare("SELECT * FROM tb_device_config WHERE id=?");
    $mStmt->execute([$machineId]);
    $machine = $mStmt->fetch();
    if (!$machine) { job_set_error($jobId, "machine $machineId not found"); return; }

    $insert = $main->prepare(
        "INSERT IGNORE INTO tb_scanlog (sn,scan_date,pin,verifymode,iomode,workcode)
         VALUES (:sn,:sd,:pin,:vm,:io,:wc)"
    );
    $stage = $bridge->prepare(
        "INSERT IGNORE INTO raw_scanlog_staging
           (sn, scan_date, scan_time, pin, verifymode, iomode, workcode,
            source_event_key, fetched_at)
         VALUES (:sn,:sd,:st,:pin,:vm,:io,:wc,:sek,:fetched)"
    );

    $endpoint = $full ? '/scanlog/all/paging' : '/scanlog/new';
    $total = 0;
    $errors = [];
    $isSession = true;
    $page = 0;

    while ($isSession) {
        $r = w_bridge_post($machine, $endpoint, ['limit' => 100]);
        if (!$r['ok']) { $errors[] = $r['error'] ?? 'bridge fail'; break; }
        $data = $r['data'];
        if (empty($data['Result'])) {
            // "No data" is success, not error
            $msg = (string)($data['message'] ?? '');
            if (stripos($msg, 'no data') !== false || stripos($msg, 'tidak') !== false) {
                el_log('INFO', 'worker', "sync_scanlogs: no more data", ['msg' => $msg]);
            } else {
                $errors[] = "device: $msg";
            }
            break;
        }
        $rows = $data['Data'] ?? [];
        foreach ($rows as $row) {
            $sn     = (string)($row['SN'] ?? $machine['sn']);
            $sd     = (string)($row['ScanDate'] ?? '');
            $pin    = (string)($row['PIN'] ?? '');
            $verify = (int)($row['VerifyMode'] ?? 0);
            $io     = (int)($row['IOMode'] ?? 0);
            $work   = (int)($row['WorkCode'] ?? 0);

            $insert->execute([
                ':sn'  => $sn, ':sd'  => $sd, ':pin' => $pin,
                ':vm'  => $verify, ':io'  => $io, ':wc'  => $work,
            ]);
            try {
                w_stage_one($stage, $sn, $sd, $pin, $verify, $io, $work);
            } catch (\Throwable $e) {
                // staging is best-effort; log but don't fail the sync
                el_log('WARN', 'worker-stage', 'stage failed', ['err' => $e->getMessage()]);
            }
            $total++;
        }
        $page++;
        job_set_progress($jobId, $total);
        $isSession = !empty($data['IsSession']);
    }

    try {
        $main->prepare("UPDATE tb_device_config SET last_sync_scanlogs=?, last_sync_at=NOW() WHERE id=?")
             ->execute([$total, $machineId]);
    } catch (\Throwable $e) {
        el_log('WARN', 'worker', 'update last_sync failed', ['err' => $e->getMessage()]);
    }

    $result = ['ok' => empty($errors), 'synced' => $total, 'errors' => $errors, 'staged' => true];
    el_log('INFO', 'worker', "sync_scanlogs done", $result + ['job' => $jobId]);
    if (empty($errors)) {
        job_set_done($jobId, $result);
    } else {
        // partial success still counts: data was synced; record errors but mark done
        // if at least one row landed. Otherwise error.
        if ($total > 0) job_set_done($jobId, $result);
        else            job_set_error($jobId, implode('; ', $errors), $result);
    }
}

function run_sync_users(string $jobId, array $payload): void {
    $machineId = (int)($payload['machine_id'] ?? 0);
    if ($machineId <= 0) { job_set_error($jobId, 'machine_id required'); return; }

    $main = w_main_pdo();
    $mStmt = $main->prepare("SELECT * FROM tb_device_config WHERE id=?");
    $mStmt->execute([$machineId]);
    $machine = $mStmt->fetch();
    if (!$machine) { job_set_error($jobId, "machine $machineId not found"); return; }

    $upsert = $main->prepare(
        "INSERT INTO tb_user (pin,nama,pwd,rfid,privilege)
         VALUES (:pin,:nama,:pwd,:rfid,:priv)
         ON DUPLICATE KEY UPDATE
           nama=VALUES(nama), pwd=VALUES(pwd),
           rfid=VALUES(rfid), privilege=VALUES(privilege)"
    );

    $total = 0;
    $errors = [];
    $isSession = true;
    while ($isSession) {
        $r = w_bridge_post($machine, '/user/all/paging', ['limit' => 100]);
        if (!$r['ok']) { $errors[] = $r['error'] ?? 'bridge fail'; break; }
        $data = $r['data'];
        if (empty($data['Result'])) {
            $msg = (string)($data['message'] ?? '');
            if (stripos($msg, 'no data') !== false) {
                el_log('INFO', 'worker', "sync_users: no more data");
            } else {
                $errors[] = "device: $msg";
            }
            break;
        }
        foreach (($data['Data'] ?? []) as $row) {
            $upsert->execute([
                ':pin'  => $row['PIN']       ?? '',
                ':nama' => $row['Name']      ?? '',
                ':pwd'  => $row['Password']  ?? '',
                ':rfid' => $row['RFID']      ?? '0',
                ':priv' => (int)($row['Privilege'] ?? 0),
            ]);
            $total++;
        }
        job_set_progress($jobId, $total);
        $isSession = !empty($data['IsSession']);
    }

    try {
        $main->prepare("UPDATE tb_device_config SET last_sync_users=?, last_sync_at=NOW() WHERE id=?")
             ->execute([$total, $machineId]);
    } catch (\Throwable $e) {}

    $result = ['ok' => empty($errors), 'synced' => $total, 'errors' => $errors];
    el_log('INFO', 'worker', "sync_users done", $result + ['job' => $jobId]);
    if (empty($errors) || $total > 0) job_set_done($jobId, $result);
    else                              job_set_error($jobId, implode('; ', $errors), $result);
}

function run_hop_b_push(string $jobId, array $payload): void {
    // Drain raw_scanlog_staging by repeatedly invoking hop-b-batch-selector.php
    // --worker-run until outcome == no_op (no unbatched rows left).
    $token   = getenv('HOP_B_AUTH_TOKEN') ?: '';
    $url     = getenv('HOP_B_INGEST_URL') ?: '';
    if ($token === '' || $url === '') {
        job_set_error($jobId, 'HOP_B_AUTH_TOKEN / HOP_B_INGEST_URL must be set in worker env');
        return;
    }

    $maxCycles  = (int)($payload['max_cycles'] ?? 1000);
    $batchesSent = 0;
    $totalInserted = 0;
    $totalDuplicates = 0;
    $errors = [];

    $phpExe = getenv('PHP_EXE') ?: (PHP_BINARY ?: 'php');
    $script = __DIR__ . DIRECTORY_SEPARATOR . 'hop-b-batch-selector.php';

    for ($i = 0; $i < $maxCycles; $i++) {
        $cmd = escapeshellarg($phpExe) . ' ' . escapeshellarg($script) . ' --worker-run';
        $out = shell_exec($cmd . ' 2>&1');
        if ($out === null || $out === '') {
            $errors[] = "cycle $i: empty worker output";
            break;
        }
        $decoded = json_decode(trim($out), true);
        if (!is_array($decoded)) {
            $errors[] = "cycle $i: non-JSON worker output";
            el_log('ERROR', 'hop-b-push', 'non-JSON cycle output', ['head' => substr($out, 0, 500)]);
            break;
        }
        $outcome = (string)($decoded['outcome'] ?? '');
        $status  = (string)($decoded['status']  ?? '');
        el_log('INFO', 'hop-b-push', "cycle $i", [
            'outcome' => $outcome, 'status' => $status,
            'inserted' => $decoded['inserted_count'] ?? null,
            'duplicates' => $decoded['duplicate_count'] ?? null,
        ]);

        if ($outcome === 'no_op') break;
        if ($outcome === 'sent' || $outcome === 'replay') {
            $batchesSent++;
            $totalInserted   += (int)($decoded['inserted_count']  ?? 0);
            $totalDuplicates += (int)($decoded['duplicate_count'] ?? 0);
            job_set_progress($jobId, $batchesSent);
            continue;
        }
        if ($status === 'error' || $outcome === 'permanent_failure') {
            $errors[] = "cycle $i: " . ($decoded['error'] ?? $decoded['message'] ?? $outcome);
            break;
        }
        // unknown outcome — log + stop to avoid infinite loop
        $errors[] = "cycle $i: unknown outcome '$outcome'";
        break;
    }

    $result = [
        'ok' => empty($errors),
        'batches_sent'    => $batchesSent,
        'inserted_total'  => $totalInserted,
        'duplicate_total' => $totalDuplicates,
        'errors' => $errors,
    ];
    el_log('INFO', 'worker', 'hop_b_push done', $result + ['job' => $jobId]);
    if (empty($errors) || $batchesSent > 0) job_set_done($jobId, $result);
    else                                    job_set_error($jobId, implode('; ', $errors), $result);
}

// --- Main -------------------------------------------------------------------

try {
    $job = job_load($jobId);
    if (!$job) {
        fwrite(STDERR, "job not found: $jobId\n");
        el_log('ERROR', 'worker', 'job not found', ['job' => $jobId]);
        exit(0);
    }
    if ($job['status'] !== 'pending') {
        el_log('WARN', 'worker', 'job not pending, skipping', ['job' => $jobId, 'status' => $job['status']]);
        exit(0);
    }
    job_set_running($jobId);
    el_log('INFO', 'worker', 'job started', ['job' => $jobId, 'type' => $job['type']]);

    $payload = json_decode((string)$job['payload'], true) ?: [];

    switch ($job['type']) {
        case 'sync_scanlogs': run_sync_scanlogs($jobId, $payload); break;
        case 'sync_users':    run_sync_users($jobId, $payload);    break;
        case 'hop_b_push':    run_hop_b_push($jobId, $payload);    break;
        default:
            job_set_error($jobId, "unknown job type: {$job['type']}");
    }
} catch (\Throwable $e) {
    el_log('ERROR', 'worker', 'uncaught exception', [
        'job' => $jobId, 'msg' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine(),
    ]);
    try { job_set_error($jobId, $e->getMessage()); } catch (\Throwable $_) {}
}

exit(0);
