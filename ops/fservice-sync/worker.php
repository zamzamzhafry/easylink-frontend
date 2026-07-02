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
 *                     easylink_bridge.raw_scanlog_staging only (staging-only
 *                     since C4; VM mirror owns tb_scanlog). Hop B worker then
 *                     drains staging into the VM.
 *   - sync_users    : pull /user/all/paging into demo_easylinksdk.tb_user.
 *   - hop_b_push    : drain easylink_bridge.raw_scanlog_staging by repeatedly
 *                     invoking hop-b-batch-selector.php --worker-run until
 *                     outcome == no_op.
 *
 * Exit: always 0 (status captured in DB).
 */

declare(strict_types=1);

require_once __DIR__ . '/lib-log.php';
require_once __DIR__ . '/lib-bridge-http.php';
require_once __DIR__ . '/lib-hop-b-contract.php';
require_once __DIR__ . '/lib-sync-scanlogs.php';

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

function config_get(string $key, string $default = ''): string {
    static $warnedMissing = false;
    try {
        $stmt = w_main_pdo()->prepare("SELECT config_value FROM app_config WHERE config_key = ?");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? (string)$val : $default;
    } catch (\Throwable $e) {
        // Most common cause: migrations/004 not applied (app_config table
        // missing). Log once so this isn't a silent misconfiguration.
        if (!$warnedMissing) {
            $warnedMissing = true;
            el_log('ERROR', 'config', 'app_config read failed (run migrations/004_reliability_improvements.sql)', ['key' => $key, 'err' => $e->getMessage()]);
        }
        return $default;
    }
}

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

// Note: chain_followup_job queries fservice_jobs WHERE status IN ('pending','running')
// AND type=? AND payload=? — requires idx_job_status (migration 004 covers this).

function chain_followup_job(string $parentId, string $type, array $payload): void {
    $pdo = w_main_pdo();
    $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $chk = $pdo->prepare(
        "SELECT job_id FROM fservice_jobs
         WHERE status IN ('pending','running') AND type = ? AND payload = ?
         LIMIT 1"
    );
    $chk->execute([$type, $payloadJson]);
    if ($chk->fetch()) {
        el_log('INFO', 'chain', 'followup already exists, skip', ['parent' => $parentId, 'type' => $type]);
        return;
    }

    $childId = 'job_' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO fservice_jobs (job_id, type, payload, status) VALUES (?, ?, ?, 'pending')"
    )->execute([$childId, $type, $payloadJson]);

    $phpExe = getenv('PHP_EXE') ?: (PHP_BINARY ?: 'php');
    $worker = __FILE__;
    if (stripos(PHP_OS, 'WIN') === 0) {
        $cmd = 'cmd /C start /B "" "' . $phpExe . '" "' . $worker . '" ' . escapeshellarg($childId) . ' > NUL 2>&1';
    } else {
        $cmd = 'nohup ' . escapeshellarg($phpExe) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($childId) . ' > /dev/null 2>&1 &';
    }
    el_log('INFO', 'chain', 'followup job', ['parent' => $parentId, 'type' => $type, 'child' => $childId]);
    $h = popen($cmd, 'r');
    if ($h) pclose($h);
}

// --- Bridge HTTP helper -----------------------------------------------------

function w_bridge_post(array $machine, string $path, array $fields = []): array {
    // Thin wrapper over shared lib-bridge-http. Preserves the worker-bridge
    // log tag + global $TIMEOUT so existing log filters keep matching.
    global $TIMEOUT;
    return bridge_http_post($machine, $path, $fields, $TIMEOUT ?? 120, 'worker-bridge');
}

// Staging helper moved to lib-sync-scanlogs stage_scan_row().

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

    // Delegates to lib-sync-scanlogs. C4: Windows no longer dual-writes
    // tb_scanlog — only stages + pushes. VM mirror owns tb_scanlog.
    $flow = sync_scanlogs_flow($machine, $bridge, $full, function (int $total) use ($jobId) {
        job_set_progress($jobId, $total);
    });
    $total = $flow['total'];
    $errors = $flow['errors'];

    try {
        $main->prepare("UPDATE tb_device_config SET last_sync_scanlogs=?, last_sync_at=NOW() WHERE id=?")
             ->execute([$total, $machineId]);
    } catch (\Throwable $e) {
        el_log('WARN', 'worker', 'update last_sync failed', ['err' => $e->getMessage()]);
    }

    $result = ['ok' => empty($errors), 'synced' => $total, 'errors' => $errors, 'staged' => $flow['staged'] > 0];
    el_log('INFO', 'worker', "sync_scanlogs done", $result + ['job' => $jobId]);
    if (empty($errors)) {
        job_set_done($jobId, $result);
    } else {
        // partial success still counts: data was synced; record errors but mark done
        // if at least one row landed. Otherwise error.
        if ($total > 0) job_set_done($jobId, $result);
        else            job_set_error($jobId, implode('; ', $errors), $result);
    }

    // Auto-trigger Hop B push when enabled and rows were staged.
    if ($total > 0 && config_get('auto_hop_b_push', '0') === '1') {
        try {
            chain_followup_job($jobId, 'hop_b_push', ['auto_chained' => true]);
        } catch (\Throwable $e) {
            el_log('WARN', 'chain', 'followup chain failed', ['parent' => $jobId, 'err' => $e->getMessage()]);
        }
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

        // Check error BEFORE no_op: hop_b_run_worker_cycle's catch returns
        // {status:'error', outcome:'no_op'} on any exception (DB fail, etc).
        // If no_op is checked first, the error is swallowed and the job
        // falsely reports done. Error must win.
        if ($status === 'error' || $outcome === 'permanent_failure') {
            $errors[] = "cycle $i: " . ($decoded['error'] ?? $decoded['message'] ?? $outcome);
            break;
        }
        if ($outcome === 'no_op') break;
        if ($outcome === 'sent' || $outcome === 'replay') {
            $batchesSent++;
            $totalInserted   += (int)($decoded['inserted_count']  ?? 0);
            $totalDuplicates += (int)($decoded['duplicate_count'] ?? 0);
            job_set_progress($jobId, $batchesSent);
            continue;
        }
        if ($outcome === 'retry_scheduled') {
            // transient send failure (5xx/network) — batch already requeued
            // for retry. Stop draining; not a hard job error.
            el_log('WARN', 'hop-b-push', "cycle $i: retry_scheduled, stopping drain", [
                'http_status' => $decoded['http_status_code'] ?? null,
                'error' => $decoded['error'] ?? null,
            ]);
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
