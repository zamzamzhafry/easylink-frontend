<?php
/**
 * EasyLink FService Control Panel - Multi-Machine
 * Usage: php -S localhost:9090 index.php
 */

require_once __DIR__ . '/../lib-log.php';

// --- DB Config ---------------------------------------------------------------
$DB_HOST = getenv('DB_HOST') ?: '127.0.0.1';
$DB_PORT = getenv('DB_PORT') ?: '3306';
$DB_USER = getenv('DB_USER') ?: 'root';
$DB_PASS = getenv('DB_PASS') ?: '';
$DB_NAME = getenv('DB_NAME') ?: 'demo_easylinksdk';
$BRIDGE_DB_NAME = getenv('HOP_B_DB_NAME') ?: 'easylink_bridge';
$TIMEOUT = 120;

function _pdo_for(string $db): PDO {
    global $DB_HOST, $DB_PORT, $DB_USER, $DB_PASS;
    static $cache = [];
    if (isset($cache[$db])) return $cache[$db];
    $cache[$db] = new PDO(
        "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$db};charset=utf8mb4",
        $DB_USER, $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    return $cache[$db];
}

function get_pdo(): PDO { global $DB_NAME; return _pdo_for($DB_NAME); }
function get_bridge_pdo(): ?PDO {
    global $BRIDGE_DB_NAME;
    try { return _pdo_for($BRIDGE_DB_NAME); }
    catch (\Throwable $e) {
        el_log('WARN', 'bridge-db', 'bridge db unavailable', ['err' => $e->getMessage()]);
        return null;
    }
}

// --- Machine config from DB --------------------------------------------------
function get_machines(bool $activeOnly = true): array {
    $pdo = get_pdo();
    $sql = "SELECT * FROM tb_device_config" . ($activeOnly ? " WHERE is_active=1" : "") . " ORDER BY label";
    return $pdo->query($sql)->fetchAll();
}

function get_machine(int $id): ?array {
    $pdo = get_pdo();
    $stmt = $pdo->prepare("SELECT * FROM tb_device_config WHERE id=?");
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function get_machine_by_sn(string $sn): ?array {
    $pdo = get_pdo();
    $stmt = $pdo->prepare("SELECT * FROM tb_device_config WHERE sn=?");
    $stmt->execute([$sn]);
    return $stmt->fetch() ?: null;
}

// --- Bridge helper -----------------------------------------------------------
function bridge_post(array $machine, string $path, array $fields = []): array {
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
    el_log('DEBUG', 'bridge', "POST $path", [
        'url'       => $baseUrl . $path,
        'machine'   => $machine['label'] ?? '?',
        'sn'        => $machine['sn'] ?? '?',
        'http'      => $code,
        'curl_err'  => $err,
        'body_len'  => is_string($resp) ? strlen($resp) : 0,
        'body_head' => $rawSnippet,
        'fields'    => array_diff_key($fields, ['sn' => 1]),
    ]);

    if ($resp === false) {
        el_log('ERROR', 'bridge', "$path curl failed", ['curl_err' => $err, 'http' => $code]);
        return ['ok' => false, 'error' => $err, 'http' => $code];
    }
    $json = json_decode($resp, true);
    if (!is_array($json)) {
        el_log('ERROR', 'bridge', "$path non-JSON", [
            'http' => $code, 'body_head' => $rawSnippet,
        ]);
        return ['ok' => false, 'error' => 'Non-JSON response', 'raw' => $rawSnippet, 'http' => $code];
    }
    return ['ok' => true, 'data' => $json, 'http' => $code];
}

// --- Sync functions ----------------------------------------------------------
/**
 * Treat FService's `Result:false` + "No data" / "tidak ada" as success-with-empty,
 * not as an error. Real bridge failures (curl fail, non-JSON) still fail.
 */
function _bridge_no_data(array $r): bool {
    if (!$r['ok']) return false;
    $msg = (string)($r['data']['message'] ?? '');
    return stripos($msg, 'no data') !== false || stripos($msg, 'tidak') !== false;
}

/**
 * Mirror one tb_scanlog row into easylink_bridge.raw_scanlog_staging so the
 * Hop B worker (hop-b-batch-selector.php) can pick it up. Best-effort.
 */
function _stage_one(?PDOStatement $stage, string $sn, string $scanDateTs,
                    string $pin, int $verify, int $io, int $work): void {
    if (!$stage) return;
    $ts = $scanDateTs !== '' ? strtotime($scanDateTs) : false;
    if ($ts === false) {
        el_log('WARN', 'stage', 'skip unparseable scan_date', ['raw' => $scanDateTs, 'pin' => $pin]);
        return;
    }
    $date = date('Y-m-d', $ts);
    $time = date('H:i:s', $ts);
    $key  = "{$sn}|{$date}|{$time}|{$pin}|{$verify}|{$io}|{$work}";
    try {
        $stage->execute([
            ':sn'=>$sn, ':sd'=>$date, ':st'=>$time,
            ':pin'=>$pin, ':vm'=>$verify, ':io'=>$io, ':wc'=>$work,
            ':sek'=>$key, ':fetched'=>$scanDateTs ?: date('Y-m-d H:i:s'),
        ]);
    } catch (\Throwable $e) {
        el_log('WARN', 'stage', 'stage insert failed', ['err' => $e->getMessage(), 'key' => $key]);
    }
}

function sync_users_to_db(array $machine): array {
    $isSession = true; $total = 0; $errors = [];
    try {
        $pdo = get_pdo();
        $stmt = $pdo->prepare("INSERT INTO tb_user (pin,nama,pwd,rfid,privilege) VALUES (:pin,:nama,:pwd,:rfid,:priv) ON DUPLICATE KEY UPDATE nama=VALUES(nama),pwd=VALUES(pwd),rfid=VALUES(rfid),privilege=VALUES(privilege)");
        while ($isSession) {
            $r = bridge_post($machine, '/user/all/paging', ['limit' => 100]);
            if (!$r['ok']) { $errors[] = $r['error'] ?? 'bridge fail'; break; }
            if (empty($r['data']['Result'])) {
                if (_bridge_no_data($r)) { el_log('INFO','sync','users: no more data', ['sn'=>$machine['sn']??'?']); }
                else { $errors[] = (string)($r['data']['message'] ?? 'Result false'); }
                break;
            }
            foreach (($r['data']['Data'] ?? []) as $row) {
                $stmt->execute([':pin'=>$row['PIN']??'',':nama'=>$row['Name']??'',':pwd'=>$row['Password']??'',':rfid'=>$row['RFID']??'0',':priv'=>(int)($row['Privilege']??0)]);
                $total++;
            }
            $isSession = !empty($r['data']['IsSession']);
        }
        $pdo->prepare("UPDATE tb_device_config SET last_sync_users=?, last_sync_at=NOW() WHERE id=?")->execute([$total, $machine['id']]);
    } catch (\Exception $e) {
        $errors[] = $e->getMessage();
        el_log('ERROR', 'sync', 'sync_users exception', ['msg' => $e->getMessage(), 'sn' => $machine['sn'] ?? '?']);
    }
    $res = ['ok' => empty($errors) || $total > 0, 'synced' => $total, 'errors' => $errors];
    el_log($res['ok'] ? 'INFO' : 'ERROR', 'sync', 'sync_users done', $res + ['sn' => $machine['sn'] ?? '?']);
    return $res;
}

function sync_scanlogs_to_db(array $machine, bool $full = false): array {
    $endpoint = $full ? '/scanlog/all/paging' : '/scanlog/new';
    $isSession = true; $total = 0; $staged = 0; $errors = [];
    try {
        $pdo = get_pdo();
        $bridge = get_bridge_pdo();
        $stmt = $pdo->prepare("INSERT IGNORE INTO tb_scanlog (sn,scan_date,pin,verifymode,iomode,workcode) VALUES (:sn,:sd,:pin,:vm,:io,:wc)");
        $stage = $bridge
            ? $bridge->prepare("INSERT IGNORE INTO raw_scanlog_staging
                  (sn, scan_date, scan_time, pin, verifymode, iomode, workcode,
                   source_event_key, fetched_at)
                  VALUES (:sn,:sd,:st,:pin,:vm,:io,:wc,:sek,:fetched)")
            : null;
        while ($isSession) {
            $r = bridge_post($machine, $endpoint, ['limit' => 100]);
            if (!$r['ok']) { $errors[] = $r['error'] ?? 'bridge fail'; break; }
            if (empty($r['data']['Result'])) {
                if (_bridge_no_data($r)) { el_log('INFO','sync','scanlogs: no more data', ['sn'=>$machine['sn']??'?']); }
                else { $errors[] = (string)($r['data']['message'] ?? 'Result false'); }
                break;
            }
            foreach (($r['data']['Data'] ?? []) as $row) {
                $sn = (string)($row['SN'] ?? $machine['sn']);
                $sd = (string)($row['ScanDate'] ?? '');
                $pin = (string)($row['PIN'] ?? '');
                $vm = (int)($row['VerifyMode'] ?? 0);
                $io = (int)($row['IOMode'] ?? 0);
                $wc = (int)($row['WorkCode'] ?? 0);
                $stmt->execute([':sn'=>$sn,':sd'=>$sd,':pin'=>$pin,':vm'=>$vm,':io'=>$io,':wc'=>$wc]);
                _stage_one($stage, $sn, $sd, $pin, $vm, $io, $wc);
                if ($stage && $stage->rowCount() > 0) $staged++;
                $total++;
            }
            $isSession = !empty($r['data']['IsSession']);
        }
        $pdo->prepare("UPDATE tb_device_config SET last_sync_scanlogs=?, last_sync_at=NOW() WHERE id=?")->execute([$total, $machine['id']]);
    } catch (\Exception $e) {
        $errors[] = $e->getMessage();
        el_log('ERROR', 'sync', 'sync_scanlogs exception', ['msg' => $e->getMessage(), 'sn' => $machine['sn'] ?? '?']);
    }
    $res = ['ok' => empty($errors) || $total > 0, 'synced' => $total, 'staged' => $staged, 'errors' => $errors];
    el_log($res['ok'] ? 'INFO' : 'ERROR', 'sync', 'sync_scanlogs done', $res + ['sn' => $machine['sn'] ?? '?', 'full' => $full]);
    return $res;
}

// --- Async Jobs --------------------------------------------------------------
function _gen_job_id(): string {
    return 'job_' . bin2hex(random_bytes(8));
}

function job_create(string $type, array $payload): array {
    try {
        $jobId = _gen_job_id();
        $pdo = get_pdo();
        $pdo->prepare("INSERT INTO fservice_jobs (job_id, type, payload, status) VALUES (?,?,?,'pending')")
            ->execute([$jobId, $type, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
        // Spawn detached worker (Windows: cmd /C start /B  /  POSIX: nohup &)
        $phpExe = getenv('PHP_EXE') ?: (defined('PHP_BINARY') ? PHP_BINARY : 'php');
        $worker = __DIR__ . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'worker.php';
        $worker = realpath($worker) ?: $worker;
        if (stripos(PHP_OS, 'WIN') === 0) {
            $cmd = 'cmd /C start /B "" "' . $phpExe . '" "' . $worker . '" ' . escapeshellarg($jobId) . ' > NUL 2>&1';
        } else {
            $cmd = 'nohup ' . escapeshellarg($phpExe) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($jobId) . ' > /dev/null 2>&1 &';
        }
        el_log('INFO', 'job', 'spawn worker', ['job' => $jobId, 'type' => $type, 'cmd' => $cmd]);
        $h = popen($cmd, 'r');
        if ($h) pclose($h);
        return ['ok' => true, 'job_id' => $jobId, 'type' => $type];
    } catch (\Throwable $e) {
        el_log('ERROR', 'job', 'job_create failed', ['err' => $e->getMessage()]);
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function job_status(string $jobId): array {
    try {
        $stmt = get_pdo()->prepare("SELECT job_id, type, status, progress, result, last_error, created_at, started_at, finished_at FROM fservice_jobs WHERE job_id=?");
        $stmt->execute([$jobId]);
        $row = $stmt->fetch();
        if (!$row) return ['ok' => false, 'error' => 'job not found'];
        if (!empty($row['result'])) {
            $decoded = json_decode((string)$row['result'], true);
            $row['result'] = is_array($decoded) ? $decoded : null;
        }
        $row['ok'] = true;
        return $row;
    } catch (\Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function get_db_stats(): array {
    try {
        $pdo = get_pdo();
        $users = $pdo->query("SELECT COUNT(*) FROM tb_user")->fetchColumn();
        $scanlogs = $pdo->query("SELECT COUNT(*) FROM tb_scanlog")->fetchColumn();
        $latest = $pdo->query("SELECT MAX(scan_date) FROM tb_scanlog")->fetchColumn();
        return ['ok'=>true,'users'=>(int)$users,'scanlogs'=>(int)$scanlogs,'latest_scan'=>$latest];
    } catch (\Exception $e) { return ['ok'=>false,'error'=>$e->getMessage()]; }
}

// --- Machine Config CRUD -----------------------------------------------------
function save_machine(array $data): array {
    $pdo = get_pdo();
    $required = ['label','sn','bridge_host','bridge_port'];
    foreach ($required as $f) { if (empty($data[$f])) return ['ok'=>false,'error'=>"Missing field: $f"]; }
    try {
        if (!empty($data['id'])) {
            $stmt = $pdo->prepare("UPDATE tb_device_config SET label=?,sn=?,bridge_host=?,bridge_port=?,device_ip=?,device_port=?,model=?,is_active=?,updated_at=NOW() WHERE id=?");
            $stmt->execute([$data['label'],$data['sn'],$data['bridge_host'],(int)$data['bridge_port'],$data['device_ip']??null,$data['device_port']??null,$data['model']??null,(int)($data['is_active']??1),$data['id']]);
            return ['ok'=>true,'id'=>(int)$data['id'],'action'=>'updated'];
        } else {
            $stmt = $pdo->prepare("INSERT INTO tb_device_config (label,sn,bridge_host,bridge_port,device_ip,device_port,model,is_active) VALUES (?,?,?,?,?,?,?,?)");
            $stmt->execute([$data['label'],$data['sn'],$data['bridge_host'],(int)$data['bridge_port'],$data['device_ip']??null,$data['device_port']??null,$data['model']??null,(int)($data['is_active']??1)]);
            return ['ok'=>true,'id'=>(int)$pdo->lastInsertId(),'action'=>'created'];
        }
    } catch (\Exception $e) { return ['ok'=>false,'error'=>$e->getMessage()]; }
}

function delete_machine(int $id): array {
    try {
        $pdo = get_pdo();
        $pdo->prepare("DELETE FROM tb_device_config WHERE id=?")->execute([$id]);
        return ['ok'=>true];
    } catch (\Exception $e) { return ['ok'=>false,'error'=>$e->getMessage()]; }
}

// --- API Router --------------------------------------------------------------
if (isset($_GET['action'])) {
    header('Content-Type: application/json; charset=utf-8');
    $action = $_GET['action'];
    $machineId = intval($_GET['machine'] ?? 0);
    $machine = $machineId ? get_machine($machineId) : null;
    $result = [];

    el_log('INFO', 'panel', "action=$action", [
        'method'  => $_SERVER['REQUEST_METHOD'] ?? '?',
        'machine' => $machineId,
        'query'   => $_GET,
    ]);

    // logs endpoint - no machine needed
    if ($action === 'logs_tail') {
        $lines = intval($_GET['lines'] ?? 200);
        $lines = max(1, min(2000, $lines));
        $tail = el_log_tail($lines);
        echo json_encode([
            'ok'    => true,
            'path'  => el_log_path(),
            'lines' => count($tail),
            'tail'  => $tail,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // Async job endpoints — no machine on the URL; machine comes from payload
    if ($action === 'job_status') {
        $jobId = (string)($_GET['job_id'] ?? '');
        echo json_encode(job_status($jobId), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    if ($action === 'job_start') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') { echo json_encode(['ok'=>false,'error'=>'POST required']); exit; }
        $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $type = (string)($body['type'] ?? '');
        $payload = $body['payload'] ?? [];
        if (!is_array($payload)) $payload = [];
        if (!in_array($type, ['sync_users','sync_scanlogs','hop_b_push'], true)) {
            echo json_encode(['ok'=>false,'error'=>'unknown job type']);
            exit;
        }
        // For sync_* fall back to first active machine if not specified
        if (in_array($type, ['sync_users','sync_scanlogs'], true) && empty($payload['machine_id'])) {
            $first = get_machines(true)[0] ?? null;
            if ($first) $payload['machine_id'] = (int)$first['id'];
        }
        echo json_encode(job_create($type, $payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    if ($action === 'staging_stats') {
        $b = get_bridge_pdo();
        if (!$b) { echo json_encode(['ok'=>false,'error'=>'bridge db unavailable']); exit; }
        try {
            $total = (int)$b->query("SELECT COUNT(*) FROM raw_scanlog_staging")->fetchColumn();
            $pending = (int)$b->query(
                "SELECT COUNT(*) FROM raw_scanlog_staging r
                 LEFT JOIN sync_batch_item i ON i.staging_id = r.id
                 WHERE i.staging_id IS NULL"
            )->fetchColumn();
            $sent = (int)$b->query("SELECT COUNT(*) FROM sync_batch WHERE status='sent'")->fetchColumn();
            $failed = (int)$b->query("SELECT COUNT(*) FROM sync_batch WHERE status IN ('failed','dead_letter')")->fetchColumn();
            echo json_encode(['ok'=>true,'staged_total'=>$total,'staged_pending'=>$pending,'batches_sent'=>$sent,'batches_failed'=>$failed]);
        } catch (\Throwable $e) {
            echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);
        }
        exit;
    }

    if ($action === 'dead_letter_check') {
        $b = get_bridge_pdo();
        if (!$b) { echo json_encode(['ok'=>false,'error'=>'bridge db unavailable']); exit; }
        try {
            $count = (int)$b->query("SELECT COUNT(*) FROM sync_batch WHERE status='dead_letter'")->fetchColumn();
            $items = $b->query(
                "SELECT batch_id, device_sn, last_error, last_error_code, attempt_count, last_attempt_at
                 FROM sync_batch WHERE status='dead_letter'
                 ORDER BY last_attempt_at DESC LIMIT 20"
            )->fetchAll();
            echo json_encode(['ok'=>true,'count'=>$count,'items'=>$items]);
        } catch (\Throwable $e) {
            echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);
        }
        exit;
    }

    if ($action === 'dead_letter_retry') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['ok'=>false,'error'=>'POST required']); exit;
        }
        $b = get_bridge_pdo();
        if (!$b) { echo json_encode(['ok'=>false,'error'=>'bridge db unavailable']); exit; }
        $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $batchId = (string)($body['batch_id'] ?? '');
        $retryAll = !empty($body['retry_all']);

        try {
            if ($retryAll) {
                $b->prepare(
                    "UPDATE sync_batch SET status='pending', attempt_count=0, last_error=NULL, last_error_code=NULL, last_attempt_at=NULL
                     WHERE status='dead_letter'"
                )->execute();
            } else {
                if ($batchId === '') {
                    echo json_encode(['ok'=>false,'error'=>'batch_id required']); exit;
                }
                $b->prepare(
                    "UPDATE sync_batch SET status='pending', attempt_count=0, last_error=NULL, last_error_code=NULL, last_attempt_at=NULL
                     WHERE status='dead_letter' AND batch_id=?"
                )->execute([$batchId]);
            }
            echo json_encode(['ok'=>true]);
        } catch (\Throwable $e) {
            echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);
        }
        exit;
    }

    // Actions that need a machine
    $needsMachine = ['dev_info','dev_settime','dev_init','dev_deladmin','scanlog_new','scanlog_all','scanlog_del','user_all','user_set','user_del','user_delall','log_del','sync_users','sync_scanlogs'];

    if (in_array($action, $needsMachine) && !$machine) {
        // Fallback: use first active machine
        $machines = get_machines();
        $machine = $machines[0] ?? null;
        if (!$machine) { echo json_encode(['ok'=>false,'error'=>'No active machine configured']); exit; }
    }

    switch ($action) {
        case 'dev_info':
            $result = bridge_post($machine, '/dev/info');
            break;
        case 'dev_settime':
            $result = bridge_post($machine, '/dev/settime');
            break;
        case 'dev_init':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/dev/init');
            break;
        case 'dev_deladmin':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/dev/deladmin');
            break;
        case 'scanlog_new':
            $result = bridge_post($machine, '/scanlog/new');
            break;
        case 'scanlog_all':
            $limit = intval($_GET['limit'] ?? 100);
            $result = bridge_post($machine, '/scanlog/all/paging', ['limit' => $limit]);
            break;
        case 'scanlog_del':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/scanlog/del');
            break;
        case 'user_all':
            $limit = intval($_GET['limit'] ?? 100);
            $result = bridge_post($machine, '/user/all/paging', ['limit' => $limit]);
            break;
        case 'user_set':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = bridge_post($machine, '/user/set', ['pin'=>$body['pin']??'','nama'=>$body['nama']??'','pwd'=>$body['pwd']??'','rfid'=>$body['rfid']??'0','priv'=>$body['priv']??'0','tmp'=>$body['tmp']??'']);
            break;
        case 'user_del':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = bridge_post($machine, '/user/del', ['pin' => $body['pin'] ?? '']);
            break;
        case 'user_delall':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/user/delall');
            break;
        case 'log_del':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = bridge_post($machine, '/log/del');
            break;
        case 'sync_users':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $result = sync_users_to_db($machine);
            break;
        case 'sync_scanlogs':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $full = !empty($_GET['full']);
            $result = sync_scanlogs_to_db($machine, $full);
            break;
        case 'db_stats':
            $result = get_db_stats();
            break;
        case 'machines_list':
            $result = ['ok'=>true,'machines'=>get_machines(false)];
            break;
        case 'machine_save':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = save_machine($body);
            break;
        case 'machine_delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') { $result = ['ok'=>false,'error'=>'POST required']; break; }
            $body = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $result = delete_machine(intval($body['id'] ?? 0));
            break;
        case 'machine_test':
            if (!$machine) { $result = ['ok'=>false,'error'=>'Machine not found']; break; }
            $result = bridge_post($machine, '/dev/info');
            break;
        case 'fservice_health':
            $statusFile = getenv('FSERVICE_STATUS_FILE') ?: __DIR__ . '/../status/fservice-health.json';
            if (file_exists($statusFile)) {
                $data = json_decode(file_get_contents($statusFile), true);
                $result = ['ok' => true, 'data' => $data ?: []];
            } else {
                $result = ['ok' => true, 'data' => ['status' => 'unknown', 'message' => 'No watchdog data yet']];
            }
            break;
        case 'job_history':
            try {
                $pdo = get_pdo();
                $stmt = $pdo->prepare("SELECT * FROM fservice_jobs ORDER BY created_at DESC LIMIT 10");
                $stmt->execute();
                $jobs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $result = ['ok' => true, 'jobs' => $jobs];
            } catch (Exception $e) {
                $result = ['ok' => false, 'error' => $e->getMessage()];
            }
            break;
        case 'fservice_restart':
            if (PHP_OS_FAMILY !== 'Windows') {
                $result = ['ok' => false, 'error' => 'Windows only'];
                break;
            }
            $fserviceExe = getenv('FSERVICE_EXE') ?: 'C:\\EasyLinkOps\\FService.exe';
            exec('taskkill /F /IM FService.exe 2>nul');
            sleep(2);
            $cmd = 'start "" "' . escapeshellarg($fserviceExe) . '"';
            exec($cmd, $output, $ret);
            $result = ['ok' => ($ret === 0), 'message' => $ret === 0 ? 'Restarted' : 'Failed'];
            break;
        default:
            $result = ['ok' => false, 'error' => 'Unknown action'];
    }
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// --- HTML Landing Page -------------------------------------------------------
$machines = get_machines(false);
$defaultMachine = get_machines(true)[0] ?? null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EasyLink Control Panel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}

/* Navbar */
.navbar{background:#1e293b;border-bottom:1px solid #334155;padding:.75rem 1.5rem;position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap}
.navbar h1{font-size:1.1rem;color:#38bdf8;margin:0;white-space:nowrap}
.navbar .nav-links{display:flex;gap:.25rem;flex:1;flex-wrap:wrap}
.navbar .nav-btn{background:transparent;color:#94a3b8;border:none;padding:.5rem .85rem;border-radius:.375rem;font-size:.8rem;cursor:pointer;transition:all .15s;font-weight:500;white-space:nowrap}
.navbar .nav-btn:hover{background:#334155;color:#f1f5f9}
.navbar .nav-btn.active{background:#0ea5e9;color:#fff}
.navbar .machine-badge{font-size:.7rem;padding:.35rem .6rem;border-radius:.375rem;background:#166534;color:#bbf7d0;display:flex;align-items:center;gap:.4rem}
.navbar .machine-badge select{background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:.25rem;padding:.2rem .4rem;font-size:.7rem}

/* Container */
.container{padding:1.5rem;max-width:1400px;margin:0 auto}
.page{display:none}
.page.active{display:block}

/* Page headers */
.page-header{margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #334155}
.page-header h2{font-size:1.5rem;color:#f1f5f9;margin-bottom:.25rem}
.page-header p{color:#94a3b8;font-size:.9rem}

/* Sections */
.section{margin-bottom:2rem}
.section-title{font-size:.9rem;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem;font-weight:600}

/* Grid & Cards */
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:1.25rem}
.card{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.25rem}
.card h2{font-size:1rem;margin-bottom:.75rem;color:#f1f5f9;display:flex;align-items:center;gap:.5rem}
.card h2 .dot{width:8px;height:8px;border-radius:50%;background:#22c55e}
.card h2 .dot.danger{background:#ef4444}
.card h2 .dot.config{background:#f59e0b}
.card h2 .dot.warning{background:#f59e0b}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.5rem 1rem;border:none;border-radius:.5rem;font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s}
.btn-primary{background:#0ea5e9;color:#fff}.btn-primary:hover{background:#0284c7}
.btn-success{background:#22c55e;color:#fff}.btn-success:hover{background:#16a34a}
.btn-warning{background:#f59e0b;color:#000}.btn-warning:hover{background:#d97706}
.btn-danger{background:#ef4444;color:#fff}.btn-danger:hover{background:#dc2626}
.btn-ghost{background:transparent;color:#94a3b8;border:1px solid #475569}.btn-ghost:hover{background:#334155}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-sm{padding:.35rem .65rem;font-size:.72rem}
.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}

/* Results */
.result{margin-top:.75rem;background:#0f172a;border:1px solid #334155;border-radius:.5rem;padding:.75rem;font-family:'Fira Code',monospace;font-size:.72rem;max-height:280px;overflow:auto;white-space:pre-wrap;word-break:break-all;display:none}
.result.show{display:block}

/* Special zones */
.danger-zone{border-color:#7f1d1d;background:#1a0f1a}
.danger-zone h2{color:#fca5a5}
.dead-letter-card{border-color:#7f1d1d;background:#1a0f1a}
.dead-letter-card h2{color:#fca5a5}
.dead-letter-item{padding:.5rem;border:1px solid #334155;border-radius:.375rem;margin-bottom:.5rem;font-size:.72rem}
.dead-letter-item .meta{color:#94a3b8;margin-bottom:.25rem}
.dead-letter-item .error{color:#fca5a5;font-family:monospace}

/* Stats */
.stats{display:flex;gap:1.5rem;margin:.75rem 0;flex-wrap:wrap}
.stat{text-align:center}.stat .val{font-size:1.4rem;font-weight:700;color:#38bdf8}.stat .lbl{font-size:.68rem;color:#64748b;text-transform:uppercase}

/* Forms */
.form-row{display:flex;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap}
.form-row label{font-size:.75rem;color:#94a3b8;min-width:80px;padding-top:.4rem}
.form-row input,.form-row select{flex:1;min-width:120px;padding:.4rem .6rem;border-radius:.375rem;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:.8rem}
.form-row input[type=checkbox]{flex:none;width:auto}

/* Machine list */
.machine-list{margin-top:.75rem}
.machine-item{display:flex;align-items:center;justify-content:space-between;padding:.5rem .75rem;border:1px solid #334155;border-radius:.5rem;margin-bottom:.4rem;font-size:.8rem}
.machine-item .info{display:flex;flex-direction:column;gap:.15rem}
.machine-item .name{font-weight:600;color:#f1f5f9}
.machine-item .meta{font-size:.7rem;color:#64748b}
.machine-item .btns{display:flex;gap:.35rem}

/* Modals */
.confirm-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;align-items:center;justify-content:center}
.confirm-overlay.show{display:flex}
.confirm-box{background:#1e293b;border:1px solid #7f1d1d;border-radius:.75rem;padding:1.5rem;max-width:420px;width:90%}
.confirm-box h3{color:#fca5a5;margin-bottom:.75rem}
.confirm-box p{color:#94a3b8;font-size:.85rem;margin-bottom:1rem}
.confirm-box input{width:100%;padding:.5rem;border-radius:.375rem;border:1px solid #475569;background:#0f172a;color:#e2e8f0;margin-bottom:1rem;font-size:.85rem}
.confirm-box .btns{display:flex;gap:.5rem;justify-content:flex-end}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:90;align-items:center;justify-content:center}
.modal-overlay.show{display:flex}
.modal-box{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.5rem;max-width:500px;width:90%}
.modal-box h3{color:#38bdf8;margin-bottom:1rem}

/* Toasts */
.toast{position:fixed;top:1rem;right:1rem;padding:.75rem 1.25rem;border-radius:.5rem;font-size:.85rem;font-weight:600;z-index:200;animation:fadeIn .2s}
.toast-ok{background:#166534;color:#bbf7d0;border:1px solid #22c55e}
.toast-err{background:#7f1d1d;color:#fecaca;border:1px solid #ef4444}
@keyframes fadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}

/* Alert banner */
.alert-banner{background:#7f1d1d;color:#fecaca;padding:.75rem 1rem;border-radius:.5rem;margin-bottom:1rem;display:none;align-items:center;justify-content:space-between;animation:pulse 2s infinite}
.alert-banner.show{display:flex}
.alert-banner button{background:#fecaca;color:#7f1d1d;border:none;padding:.5rem .75rem;border-radius:.375rem;font-size:.75rem;font-weight:600;cursor:pointer}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}

/* Health grid */
.health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}
.health-card{background:#0f172a;border:1px solid #334155;border-radius:.5rem;padding:1rem}
.health-card h3{font-size:.9rem;color:#f1f5f9;margin-bottom:.75rem}
.health-stat{display:flex;justify-content:space-between;margin-bottom:.5rem;font-size:.8rem}
.health-stat .label{color:#94a3b8}
.health-stat .value{font-weight:600}
.health-stat .value.ok{color:#22c55e}
.health-stat .value.warn{color:#f59e0b}
.health-stat .value.crit{color:#ef4444}

/* Badge */
.badge{display:inline-block;padding:.25rem .5rem;border-radius:.25rem;font-size:.7rem;background:#166534;color:#bbf7d0}
.badge.off{background:#7f1d1d;color:#fecaca}
</style>
</head>
<body>

<!-- Navbar -->
<div class="navbar">
  <h1>EasyLink Control Panel</h1>
  <div class="nav-links">
    <button class="nav-btn active" onclick="showPage('dashboard')">Dashboard</button>
    <button class="nav-btn" onclick="showPage('sync')">Sync</button>
    <button class="nav-btn" onclick="showPage('devices')">Devices</button>
    <button class="nav-btn" onclick="showPage('health')">Health</button>
    <button class="nav-btn" onclick="showPage('logs')">Logs</button>
  </div>
  <div class="machine-badge">
    <select id="machineSelect" onchange="switchMachine()">
      <?php foreach ($machines as $m): ?>
      <option value="<?= $m['id'] ?>" <?= ($defaultMachine && $m['id']==$defaultMachine['id'])?'selected':'' ?>>
        <?= htmlspecialchars($m['label']) ?> (<?= htmlspecialchars($m['sn']) ?>)
      </option>
      <?php endforeach; ?>
    </select>
  </div>
</div>

<div class="container">

<!-- Alert Banner -->
<div class="alert-banner" id="alertBanner">
  <span id="alertMessage">⚠️ Dead letter batches detected</span>
  <button onclick="document.querySelectorAll('.nav-btn')[3].click()">Review</button>
</div>

<!-- Page: Dashboard -->
<div id="page-dashboard" class="page active">
  <div class="page-header">
    <h2>Dashboard</h2>
    <p>System overview and quick actions</p>
  </div>

  <div class="grid">
    <!-- Quick Stats -->
    <div class="card">
      <h2><span class="dot"></span> Database Stats</h2>
      <div class="stats">
        <div class="stat"><div class="val" id="dash-db-users">-</div><div class="lbl">DB Users</div></div>
        <div class="stat"><div class="val" id="dash-db-scanlogs">-</div><div class="lbl">Scanlogs</div></div>
      </div>
      <p style="font-size:.75rem;color:#64748b" id="dash-db-latest">Latest: -</p>
    </div>

    <!-- Staging Stats -->
    <div class="card">
      <h2><span class="dot"></span> Staging Queue</h2>
      <div class="stats">
        <div class="stat"><div class="val" id="dash-stg-pending">-</div><div class="lbl">Pending</div></div>
        <div class="stat"><div class="val" id="dash-stg-sent">-</div><div class="lbl">Sent</div></div>
      </div>
      <p style="font-size:.75rem;color:#64748b">Failed: <span id="dash-stg-failed" style="color:#ef4444">-</span></p>
    </div>

    <!-- Quick Actions -->
    <div class="card">
      <h2><span class="dot config"></span> Quick Actions</h2>
      <div class="actions">
        <button class="btn btn-primary" onclick="startJob('sync_scanlogs',{full:false})">Sync Scanlogs</button>
        <button class="btn btn-primary" onclick="startJob('sync_users',{})">Sync Users</button>
        <button class="btn btn-success" onclick="startJob('hop_b_push',{})">Push to VM</button>
      </div>
    </div>

    <!-- Recent Jobs -->
    <div class="card">
      <h2><span class="dot config"></span> Recent Jobs</h2>
      <div id="dash-recent-jobs" style="font-size:.72rem;color:#94a3b8;max-height:200px;overflow-y:auto">Loading...</div>
    </div>
  </div>
</div>

<!-- Page: Sync -->
<div id="page-sync" class="page">
  <div class="page-header">
    <h2>Sync</h2>
    <p>Database synchronization and Hop B push</p>
  </div>

  <div class="section">
    <div class="section-title">Synchronization</div>
    <div class="grid">
      <!-- Database Sync -->
      <div class="card">
        <h2><span class="dot"></span> Database Sync</h2>
        <p style="font-size:.75rem;color:#94a3b8;margin-bottom:.5rem">Pull from FService to local DB</p>
        <div class="actions">
          <button class="btn btn-primary" id="btn_sync_users" onclick="startJob('sync_users',{})">Sync Users</button>
          <button class="btn btn-primary" id="btn_sync_scanlogs" onclick="startJob('sync_scanlogs',{full:false})">Sync New Scanlogs</button>
          <button class="btn btn-warning" id="btn_sync_scanlogs_full" onclick="startJob('sync_scanlogs',{full:true})">Sync ALL Scanlogs</button>
        </div>
        <p style="font-size:.72rem;color:#64748b;margin-top:.4rem" id="syncJobInfo"></p>
        <div class="result" id="res_sync"></div>
      </div>

      <!-- Hop B Push -->
      <div class="card">
        <h2><span class="dot"></span> Push to VM (Hop B)</h2>
        <p style="font-size:.75rem;color:#94a3b8;margin-bottom:.5rem">Drains raw_scanlog_staging → VM /api/scanlog/ingest</p>
        <p style="font-size:.72rem;color:#64748b;margin-bottom:.5rem">Requires HOP_B_AUTH_TOKEN + HOP_B_INGEST_URL env.</p>
        <div class="stats">
          <div class="stat"><div class="val" id="stgPending">-</div><div class="lbl">Pending</div></div>
          <div class="stat"><div class="val" id="stgSent">-</div><div class="lbl">Sent</div></div>
          <div class="stat"><div class="val" id="stgFailed">-</div><div class="lbl">Failed</div></div>
        </div>
        <div class="actions">
          <button class="btn btn-success" id="btn_hop_b" onclick="startJob('hop_b_push',{})">Push to VM</button>
          <button class="btn btn-ghost btn-sm" onclick="refreshStaging()">Refresh Stats</button>
        </div>
        <p style="font-size:.72rem;color:#64748b;margin-top:.4rem" id="hopBJobInfo"></p>
        <div class="result" id="res_hop_b"></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Browse Data</div>
    <div class="grid">
      <!-- Machine Users -->
      <div class="card">
        <h2><span class="dot"></span> Machine Users</h2>
        <div class="actions">
          <button class="btn btn-primary" onclick="doAction('user_all','limit=100')">Get All Users</button>
        </div>
        <div class="result" id="res_user_all"></div>
      </div>

      <!-- Scan Logs -->
      <div class="card">
        <h2><span class="dot"></span> Scan Logs</h2>
        <div class="actions">
          <button class="btn btn-primary" onclick="doAction('scanlog_new')">Get New Scanlogs</button>
          <button class="btn btn-warning" onclick="doAction('scanlog_all','limit=50')">Get All (50)</button>
        </div>
        <div class="result" id="res_scanlog"></div>
      </div>
    </div>
  </div>
</div>

<!-- Page: Devices -->
<div id="page-devices" class="page">
  <div class="page-header">
    <h2>Devices</h2>
    <p>Machine configuration and device management</p>
  </div>

  <div class="section">
    <div class="section-title">Device Information</div>
    <div class="card">
      <h2><span class="dot"></span> Device Info</h2>
      <div class="stats">
        <div class="stat"><div class="val" id="statUsers">-</div><div class="lbl">Users</div></div>
        <div class="stat"><div class="val" id="statFP">-</div><div class="lbl">Fingerprints</div></div>
        <div class="stat"><div class="val" id="statScans">-</div><div class="lbl">All Scans</div></div>
        <div class="stat"><div class="val" id="statNew">-</div><div class="lbl">New Scans</div></div>
      </div>
      <p style="font-size:.75rem;color:#64748b" id="devTime">Device Time: -</p>
      <div class="actions">
        <button class="btn btn-primary" onclick="doAction('dev_info')">Refresh Info</button>
        <button class="btn btn-success" onclick="doAction('dev_settime')">Sync Time</button>
      </div>
      <div class="result" id="res_dev_info"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Machine Configuration</div>
    <div class="card">
      <h2><span class="dot config"></span> Machine Config</h2>
      <p style="font-size:.75rem;color:#94a3b8;margin-bottom:.5rem">Manage registered machines</p>
      <div class="machine-list" id="machineList">Loading...</div>
      <div class="actions">
        <button class="btn btn-success" onclick="openMachineForm()">+ Add Machine</button>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Danger Zone</div>
    <div class="card danger-zone">
      <h2><span class="dot danger"></span> Danger Zone</h2>
      <p style="font-size:.75rem;color:#fca5a5;margin-bottom:.75rem">Destructive actions. Cannot be undone.</p>
      <div class="actions">
        <button class="btn btn-danger" onclick="confirmDanger('dev_init','INITIALIZE MACHINE','Factory-reset the device. All data on machine will be lost.')">Init Machine</button>
        <button class="btn btn-danger" onclick="confirmDanger('dev_deladmin','DELETE ADMIN','Remove admin privileges from device.')">Delete Admin</button>
        <button class="btn btn-danger" onclick="confirmDanger('user_delall','DELETE ALL USERS','Remove ALL users from the machine.')">Delete All Users</button>
        <button class="btn btn-danger" onclick="confirmDanger('scanlog_del','DELETE ALL SCANLOGS','Remove ALL scan logs from the machine.')">Delete Scanlogs</button>
        <button class="btn btn-danger" onclick="confirmDanger('log_del','DELETE DEVICE LOG','Remove device operation log.')">Delete Device Log</button>
      </div>
      <div class="result" id="res_danger"></div>
    </div>
  </div>
</div>

<!-- Page: Health -->
<div id="page-health" class="page">
  <div class="page-header">
    <h2>Health</h2>
    <p>System status, pipeline, and dead letters</p>
  </div>

  <div class="section">
    <div class="section-title">Service Status</div>
    <div class="health-grid">
      <!-- FService Status -->
      <div class="health-card">
        <h3>FService</h3>
        <div class="health-stat">
          <span class="label">Status</span>
          <span class="value" id="hFserviceStatus">-</span>
        </div>
        <div class="health-stat">
          <span class="label">Last Check</span>
          <span class="value" id="hFserviceLastCheck">-</span>
        </div>
        <div class="health-stat">
          <span class="label">Uptime</span>
          <span class="value" id="hFserviceUptime">-</span>
        </div>
        <p style="font-size:.72rem;color:#64748b;margin-top:.5rem">
          Watchdog: <span id="hWatchdogStatus">-</span>
        </p>
      </div>

      <!-- Pipeline Status -->
      <div class="health-card">
        <h3>Pipeline</h3>
        <div class="health-stat">
          <span class="label">Pending</span>
          <span class="value" id="hPending">-</span>
        </div>
        <div class="health-stat">
          <span class="label">Sending</span>
          <span class="value" id="hSending">-</span>
        </div>
        <div class="health-stat">
          <span class="label">Sent</span>
          <span class="value" id="hSent">-</span>
        </div>
        <div class="health-stat">
          <span class="label">Failed</span>
          <span class="value" id="hFailed">-</span>
        </div>
        <p style="font-size:.72rem;color:#64748b;margin-top:.5rem">
          Dead letters: <span id="hDeadLetters" style="color:#ef4444">-</span>
        </p>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dead Letter Batches</div>
    <div class="card dead-letter-card">
      <h2><span class="dot danger"></span> Dead Letter Batches</h2>
      <div id="deadLetterList">Loading...</div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" onclick="checkDeadLetters()">Refresh</button>
        <button class="btn btn-warning btn-sm" onclick="retryAllDeadLetters()">Retry All</button>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Quick Actions</div>
    <div class="card">
      <div class="actions">
        <button class="btn btn-primary" onclick="triggerManualSync()">Trigger Manual Sync</button>
        <button class="btn btn-warning" onclick="restartFService()">Restart FService</button>
        <button class="btn btn-danger" onclick="clearDeadLetters()">Clear Dead Letters</button>
      </div>
    </div>
  </div>
</div>

<!-- Page: Logs -->
<div id="page-logs" class="page">
  <div class="page-header">
    <h2>Logs</h2>
    <p>Sync logs and job history</p>
  </div>

  <div class="section">
    <div class="section-title">Sync Logs</div>
    <div class="card">
      <h2><span class="dot config"></span> Sync Logs</h2>
      <p style="font-size:.75rem;color:#94a3b8;margin-bottom:.5rem" id="logsPath">Path: -</p>
      <div class="actions">
        <button class="btn btn-primary btn-sm" onclick="loadLogs(100)">Tail 100</button>
        <button class="btn btn-primary btn-sm" onclick="loadLogs(500)">Tail 500</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('res_logs').classList.remove('show')">Hide</button>
      </div>
      <div class="result" id="res_logs"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Job History</div>
    <div class="card">
      <h2><span class="dot config"></span> Recent Jobs</h2>
      <div id="logs-recent-jobs" style="font-size:.72rem;color:#94a3b8;max-height:400px;overflow-y:auto">Loading...</div>
    </div>
  </div>
</div>

</div>

<!-- Confirm Modal -->
<div class="confirm-overlay" id="confirmOverlay">
  <div class="confirm-box">
    <h3 id="confirmTitle">Confirm</h3>
    <p id="confirmMsg">Are you sure?</p>
    <p style="font-size:.75rem;color:#fca5a5">Type <strong id="confirmPhrase">CONFIRM</strong> to proceed:</p>
    <input type="text" id="confirmInput" autocomplete="off">
    <div class="btns">
      <button class="btn btn-primary" onclick="closeConfirm()">Cancel</button>
      <button class="btn btn-danger" id="confirmBtn" onclick="execDanger()" disabled>Execute</button>
    </div>
  </div>
</div>

<!-- Machine Form Modal -->
<div class="modal-overlay" id="machineModal">
  <div class="modal-box">
    <h3 id="machineFormTitle">Add Machine</h3>
    <input type="hidden" id="mf_id">
    <div class="form-row"><label>Label</label><input id="mf_label" placeholder="e.g. Lobby Machine"></div>
    <div class="form-row"><label>Serial (SN)</label><input id="mf_sn" placeholder="e.g. Fio66208021230737"></div>
    <div class="form-row"><label>Bridge Host</label><input id="mf_bridge_host" value="localhost"></div>
    <div class="form-row"><label>Bridge Port</label><input id="mf_bridge_port" type="number" value="8090"></div>
    <div class="form-row"><label>Device IP</label><input id="mf_device_ip" placeholder="e.g. 192.168.1.200"></div>
    <div class="form-row"><label>Device Port</label><input id="mf_device_port" type="number" placeholder="e.g. 5005"></div>
    <div class="form-row"><label>Model</label><input id="mf_model" placeholder="e.g. Revo WFV-208BNC"></div>
    <div class="form-row"><label>Active</label><input id="mf_active" type="checkbox" checked></div>
    <div class="actions" style="justify-content:flex-end;margin-top:1rem">
      <button class="btn btn-ghost" onclick="closeMachineForm()">Cancel</button>
      <button class="btn btn-success" onclick="saveMachine()">Save</button>
    </div>
  </div>
</div>

<script>
let currentMachine = <?= json_encode($defaultMachine['id'] ?? 0) ?>;
let pendingDanger = null;
let currentPage = 'dashboard';

function mid() { return currentMachine; }
function mq() { return 'machine=' + mid(); }

// --- Page navigation ---
function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + pageName).classList.add('active');
  document.querySelector(`.nav-btn[onclick*="${pageName}"]`).classList.add('active');
  currentPage = pageName;

  // Load data for specific pages
  if (pageName === 'dashboard') {
    doAction('db_stats');
    refreshStaging();
    loadJobHistory('dash-recent-jobs', 5);
  } else if (pageName === 'sync') {
    refreshStaging();
  } else if (pageName === 'devices') {
    doAction('dev_info');
    loadMachines();
  } else if (pageName === 'health') {
    loadHealthData();
  } else if (pageName === 'logs') {
    loadJobHistory('logs-recent-jobs', 50);
  }
}

function switchMachine() {
  currentMachine = document.getElementById('machineSelect').value;
  // Refresh current page data
  if (currentPage === 'dashboard') {
    doAction('db_stats');
  } else if (currentPage === 'devices') {
    doAction('dev_info');
  }
}

// --- Toast ---
const _toastState = { active: new Map(), maxStack: 3, ttlMs: 3500 };
function toast(msg, ok) {
  const key = (ok ? 'OK::' : 'ERR::') + msg;
  const existing = _toastState.active.get(key);
  if (existing) {
    existing.count += 1;
    existing.el.textContent = msg + ' (' + existing.count + ')';
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => {
      existing.el.remove();
      _toastState.active.delete(key);
    }, _toastState.ttlMs);
    return;
  }
  if (_toastState.active.size >= _toastState.maxStack) {
    const oldestKey = _toastState.active.keys().next().value;
    const oldest = _toastState.active.get(oldestKey);
    if (oldest) {
      clearTimeout(oldest.timer);
      oldest.el.remove();
      _toastState.active.delete(oldestKey);
    }
  }
  const el = document.createElement('div');
  el.className = 'toast ' + (ok ? 'toast-ok' : 'toast-err');
  el.style.top = (1 + _toastState.active.size * 3.25) + 'rem';
  el.textContent = msg;
  document.body.appendChild(el);
  const entry = { el, count: 1, timer: null };
  entry.timer = setTimeout(() => {
    el.remove();
    _toastState.active.delete(key);
  }, _toastState.ttlMs);
  _toastState.active.set(key, entry);
}

// --- API calls ---
async function doAction(action, extra) {
  const url = '?action=' + action + '&' + mq() + (extra ? '&' + extra : '');
  try {
    const r = await fetch(url);
    const j = await r.json();
    handleResult(action, j);
  } catch(e) { toast('Request failed: ' + e.message, false); }
}

async function doPost(action, extra) {
  const url = '?action=' + action + '&' + mq() + (extra ? '&' + extra : '');
  try {
    const r = await fetch(url, {method:'POST'});
    const j = await r.json();
    handleResult(action, j);
  } catch(e) { toast('Request failed: ' + e.message, false); }
}

async function doPostJson(action, body) {
  const url = '?action=' + action + '&' + mq();
  try {
    const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return await r.json();
  } catch(e) { toast('Request failed: ' + e.message, false); return {ok:false}; }
}

function handleResult(action, j) {
  if (action === 'dev_info' && j.ok && j.data && j.data.DEVINFO) {
    const d = j.data.DEVINFO;
    document.getElementById('statUsers').textContent = d.User || '-';
    document.getElementById('statFP').textContent = d.FP || '-';
    document.getElementById('statScans').textContent = d['All Presensi'] || '-';
    document.getElementById('statNew').textContent = d['New Presensi'] || '-';
    document.getElementById('devTime').textContent = 'Device Time: ' + (d.Jam || '-');
    showResult('res_dev_info', j);
    toast('Device info loaded', true);
  } else if (action === 'dev_settime') {
    showResult('res_dev_info', j);
    toast(j.ok && j.data && j.data.Result ? 'Time synced' : 'Time sync failed', j.ok && j.data && j.data.Result);
  } else if (action === 'db_stats' && j.ok) {
    const users = j.users ?? '-';
    const scanlogs = j.scanlogs ?? '-';
    const latest = j.latest_scan || '-';
    // Dashboard
    document.getElementById('dash-db-users').textContent = users;
    document.getElementById('dash-db-scanlogs').textContent = scanlogs;
    document.getElementById('dash-db-latest').textContent = 'Latest: ' + latest;
    toast('DB stats loaded', true);
  } else if (action.startsWith('sync_')) {
    showResult('res_sync', j);
    toast(j.ok ? 'Synced ' + (j.synced||0) + ' rows' : 'Sync error: ' + (j.errors||[]).join(', '), j.ok);
    doAction('db_stats');
  } else if (action.startsWith('user_') && action !== 'user_delall') {
    showResult('res_user_all', j);
    const count = j.ok && j.data && j.data.Data ? j.data.Data.length : 0;
    toast('Users: ' + count + ' rows', j.ok);
  } else if (action.startsWith('scanlog_') && action !== 'scanlog_del') {
    showResult('res_scanlog', j);
    const count = j.ok && j.data && j.data.Data ? j.data.Data.length : 0;
    toast('Scanlogs: ' + count + ' rows', j.ok);
  } else if (['dev_init','dev_deladmin','user_delall','scanlog_del','log_del'].includes(action)) {
    showResult('res_danger', j);
    toast(j.ok && j.data && j.data.Result ? 'Done' : 'Failed or no response', j.ok && j.data && j.data.Result);
  } else {
    toast(j.ok ? 'OK' : (j.error || 'Error'), j.ok);
  }
}

function showResult(id, data) {
  const el = document.getElementById(id);
  el.textContent = JSON.stringify(data, null, 2);
  el.classList.add('show');
}

// --- Danger confirm ---
function confirmDanger(action, title, msg) {
  pendingDanger = action;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const phrase = action.toUpperCase().replace(/_/g,' ');
  document.getElementById('confirmPhrase').textContent = phrase;
  document.getElementById('confirmInput').value = '';
  document.getElementById('confirmBtn').disabled = true;
  document.getElementById('confirmOverlay').classList.add('show');
  document.getElementById('confirmInput').focus();
  document.getElementById('confirmInput').oninput = function() {
    document.getElementById('confirmBtn').disabled = this.value !== phrase;
  };
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('show'); pendingDanger = null; }
async function execDanger() { if (!pendingDanger) return; const a = pendingDanger; closeConfirm(); await doPost(a); }

// --- Machine Config ---
async function loadMachines() {
  const r = await fetch('?action=machines_list');
  const j = await r.json();
  if (!j.ok) return;
  const list = document.getElementById('machineList');
  if (!j.machines.length) { list.innerHTML = '<p style="font-size:.8rem;color:#64748b">No machines configured.</p>'; return; }
  list.innerHTML = j.machines.map(m => `
    <div class="machine-item">
      <div class="info">
        <span class="name">${esc(m.label)} <span class="badge ${m.is_active?'':'off'}">${m.is_active?'Active':'Inactive'}</span></span>
        <span class="meta">SN: ${esc(m.sn)} | Bridge: ${esc(m.bridge_host)}:${m.bridge_port} | Last sync: ${m.last_sync_at||'never'}</span>
      </div>
      <div class="btns">
        <button class="btn btn-primary btn-sm" onclick="testMachine(${m.id})">Test</button>
        <button class="btn btn-ghost btn-sm" onclick="editMachine(${m.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMachine(${m.id},'${esc(m.label)}')">Del</button>
      </div>
    </div>
  `).join('');
}

function esc(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

function openMachineForm(data) {
  document.getElementById('machineFormTitle').textContent = data ? 'Edit Machine' : 'Add Machine';
  document.getElementById('mf_id').value = data?.id || '';
  document.getElementById('mf_label').value = data?.label || '';
  document.getElementById('mf_sn').value = data?.sn || '';
  document.getElementById('mf_bridge_host').value = data?.bridge_host || 'localhost';
  document.getElementById('mf_bridge_port').value = data?.bridge_port || 8090;
  document.getElementById('mf_device_ip').value = data?.device_ip || '';
  document.getElementById('mf_device_port').value = data?.device_port || '';
  document.getElementById('mf_model').value = data?.model || '';
  document.getElementById('mf_active').checked = data ? !!data.is_active : true;
  document.getElementById('machineModal').classList.add('show');
}
function closeMachineForm() { document.getElementById('machineModal').classList.remove('show'); }

async function saveMachine() {
  const body = {
    id: document.getElementById('mf_id').value || undefined,
    label: document.getElementById('mf_label').value,
    sn: document.getElementById('mf_sn').value,
    bridge_host: document.getElementById('mf_bridge_host').value,
    bridge_port: document.getElementById('mf_bridge_port').value,
    device_ip: document.getElementById('mf_device_ip').value || null,
    device_port: document.getElementById('mf_device_port').value || null,
    model: document.getElementById('mf_model').value || null,
    is_active: document.getElementById('mf_active').checked ? 1 : 0,
  };
  const j = await doPostJson('machine_save', body);
  if (j.ok) { toast('Machine saved', true); closeMachineForm(); loadMachines(); }
  else { toast('Error: ' + (j.error||'unknown'), false); }
}

async function editMachine(id) {
  const r = await fetch('?action=machines_list');
  const j = await r.json();
  const m = (j.machines||[]).find(x=>x.id==id);
  if (m) openMachineForm(m);
}

async function testMachine(id) {
  const r = await fetch('?action=machine_test&machine='+id);
  const j = await r.json();
  if (j.ok && j.data && j.data.Result) toast('Machine OK - ' + (j.data.DEVINFO?.Jam||''), true);
  else toast('Machine test failed', false);
}

async function deleteMachine(id, label) {
  if (!confirm('Delete machine "'+label+'"? This only removes config, not device data.')) return;
  const j = await doPostJson('machine_delete', {id});
  if (j.ok) { toast('Deleted', true); loadMachines(); }
  else { toast('Error: '+(j.error||''), false); }
}

// --- Logs ---
async function loadLogs(lines) {
  try {
    const r = await fetch('?action=logs_tail&lines=' + (lines||200));
    const j = await r.json();
    if (!j.ok) { toast('Logs load failed', false); return; }
    document.getElementById('logsPath').textContent = 'Path: ' + (j.path || '-');
    const el = document.getElementById('res_logs');
    el.textContent = (j.tail || []).join('\n');
    el.classList.add('show');
    el.scrollTop = el.scrollHeight;
    toast('Logs: ' + j.lines + ' lines', true);
  } catch(e) { toast('Logs error: ' + e.message, false); }
}

// --- Async Jobs ---
const JOB_UI = {
  sync_users:    { btn: 'btn_sync_users',         info: 'syncJobInfo', result: 'res_sync',  label: 'Sync Users' },
  sync_scanlogs: { btn: 'btn_sync_scanlogs',      info: 'syncJobInfo', result: 'res_sync',  label: 'Sync Scanlogs' },
  hop_b_push:    { btn: 'btn_hop_b',              info: 'hopBJobInfo', result: 'res_hop_b', label: 'Push to VM' },
};

function jobButtonsByType(type) {
  if (type === 'sync_scanlogs') return ['btn_sync_scanlogs','btn_sync_scanlogs_full'];
  const u = JOB_UI[type];
  return u ? [u.btn] : [];
}

async function startJob(type, payload) {
  const ui = JOB_UI[type];
  if (!ui) { toast('Unknown job: ' + type, false); return; }
  const body = { type, payload: Object.assign({ machine_id: parseInt(currentMachine||'0',10) }, payload || {}) };
  jobButtonsByType(type).forEach(id => { const b=document.getElementById(id); if (b) b.disabled = true; });
  document.getElementById(ui.info).textContent = 'Starting…';
  try {
    const r = await fetch('?action=job_start', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    const j = await r.json();
    if (!j.ok) { toast(ui.label + ' failed to start: ' + (j.error||'?'), false); jobButtonsByType(type).forEach(id => { const b=document.getElementById(id); if (b) b.disabled = false; }); return; }
    document.getElementById(ui.info).textContent = 'Job ' + j.job_id + ' running…';
    pollJob(j.job_id, type);
  } catch(e) {
    toast(ui.label + ' start failed: ' + e.message, false);
    jobButtonsByType(type).forEach(id => { const b=document.getElementById(id); if (b) b.disabled = false; });
  }
}

async function pollJob(jobId, type) {
  const ui = JOB_UI[type];
  let lastProgress = -1;
  const interval = setInterval(async () => {
    try {
      const r = await fetch('?action=job_status&job_id=' + encodeURIComponent(jobId));
      const j = await r.json();
      if (!j.ok) { clearInterval(interval); toast(ui.label + ' status error', false); reEnable(type); return; }
      if (j.progress !== undefined && j.progress !== lastProgress) {
        document.getElementById(ui.info).textContent = 'Job ' + j.job_id + ' ' + j.status + ' progress=' + j.progress;
        lastProgress = j.progress;
      }
      if (j.status === 'done' || j.status === 'error') {
        clearInterval(interval);
        const res = j.result || {};
        showResult(ui.result, j);
        if (j.status === 'done') {
          const label = type === 'hop_b_push'
            ? (ui.label + ': ' + (res.batches_sent||0) + ' batches, ' + (res.inserted_total||0) + ' inserted')
            : (ui.label + ': ' + (res.synced||0) + ' rows');
          toast(label, true);
        } else {
          toast(ui.label + ' error: ' + (res.error || j.last_error || 'unknown'), false);
        }
        reEnable(type);
        if (type === 'hop_b_push') refreshStaging();
        else { doAction('db_stats'); refreshStaging(); }
      }
    } catch(e) {
      clearInterval(interval);
      toast(ui.label + ' poll error: ' + e.message, false);
      reEnable(type);
    }
  }, 1500);
}

function reEnable(type) {
  jobButtonsByType(type).forEach(id => { const b=document.getElementById(id); if (b) b.disabled = false; });
}

async function refreshStaging() {
  try {
    const r = await fetch('?action=staging_stats');
    const j = await r.json();
    if (!j.ok) { return; }
    const pending = j.staged_pending ?? '-';
    const sent = j.batches_sent ?? '-';
    const failed = j.batches_failed ?? '-';
    // Sync page
    const sp = document.getElementById('stgPending');
    if (sp) sp.textContent = pending;
    const ss = document.getElementById('stgSent');
    if (ss) ss.textContent = sent;
    const sf = document.getElementById('stgFailed');
    if (sf) sf.textContent = failed;
    // Dashboard
    document.getElementById('dash-stg-pending').textContent = pending;
    document.getElementById('dash-stg-sent').textContent = sent;
    document.getElementById('dash-stg-failed').textContent = failed;
  } catch(e) {}
}

// --- Job History ---
async function loadJobHistory(containerId, limit) {
  try {
    const r = await fetch('?action=job_history');
    const j = await r.json();
    if (!j.ok || !j.jobs) { document.getElementById(containerId).innerHTML = '<p style="color:#94a3b8">No recent jobs.</p>'; return; }
    const jobs = j.jobs.slice(0, limit);
    if (!jobs.length) { document.getElementById(containerId).innerHTML = '<p style="color:#94a3b8">No recent jobs.</p>'; return; }
    document.getElementById(containerId).innerHTML = jobs.map(jo => {
      const cls = jo.status === 'done' ? 'ok' : jo.status === 'error' ? 'crit' : 'warn';
      const time = jo.created_at ? new Date(jo.created_at).toLocaleTimeString() : '-';
      return '<div style="margin-bottom:.4rem;padding:.3rem .5rem;border:1px solid #334155;border-radius:.25rem">' +
        '<span class="value ' + cls + '">' + esc(jo.status) + '</span> ' +
        esc(jo.type) + ' <span style="color:#64748b">' + time + '</span>' +
        (jo.progress ? ' (progress: ' + jo.progress + ')' : '') +
        '</div>';
    }).join('');
  } catch(e) { document.getElementById(containerId).innerHTML = '<p style="color:#ef4444">Error loading jobs.</p>'; }
}

// --- Dead Letter Alerting ---
let deadLetterPollInterval = null;

async function checkDeadLetters() {
  try {
    const r = await fetch('?action=dead_letter_check');
    const j = await r.json();
    if (!j.ok) { document.getElementById('deadLetterList').textContent = 'Error: ' + (j.error || 'unknown'); return; }
    const count = j.count || 0;
    const banner = document.getElementById('alertBanner');
    const msg = document.getElementById('alertMessage');
    if (count > 0) {
      banner.classList.add('show');
      msg.textContent = '⚠️ ' + count + ' dead letter batch' + (count > 1 ? 'es' : '') + ' detected';
      renderDeadLetters(j.items || []);
    } else {
      banner.classList.remove('show');
      document.getElementById('deadLetterList').innerHTML = '<p style="color:#94a3b8;font-size:.8rem">No dead letter batches.</p>';
    }
    const hdl = document.getElementById('hDeadLetters');
    if (hdl) hdl.textContent = count;
  } catch(e) {
    document.getElementById('deadLetterList').textContent = 'Error: ' + e.message;
  }
}

function renderDeadLetters(items) {
  const el = document.getElementById('deadLetterList');
  if (!items.length) { el.innerHTML = '<p style="color:#94a3b8;font-size:.8rem">No dead letter batches.</p>'; return; }
  el.innerHTML = items.map(it => `
    <div class="dead-letter-item">
      <div class="meta">
        <strong>${esc(it.batch_id || '')}</strong> | Device: ${esc(it.device_sn || '?')} | Attempts: ${it.attempt_count || 0} | Last: ${it.last_attempt_at || '-'}
      </div>
      <div class="error">${esc(it.last_error || 'no error message')}</div>
      <div style="margin-top:.25rem">
        <button class="btn btn-warning btn-sm" onclick="retryDeadLetter('${esc(it.batch_id)}')">Retry</button>
      </div>
    </div>
  `).join('');
}

async function retryDeadLetter(batchId) {
  if (!confirm('Retry dead letter batch ' + batchId + '?')) return;
  try {
    const r = await fetch('?action=dead_letter_retry', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({batch_id: batchId})});
    const j = await r.json();
    if (j.ok) { toast('Batch reset to pending', true); checkDeadLetters(); }
    else { toast('Retry failed: ' + (j.error || '?'), false); }
  } catch(e) { toast('Error: ' + e.message, false); }
}

async function retryAllDeadLetters() {
  if (!confirm('Retry ALL dead letter batches?')) return;
  try {
    const r = await fetch('?action=dead_letter_retry', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({retry_all: true})});
    const j = await r.json();
    if (j.ok) { toast('All dead letters reset', true); checkDeadLetters(); }
    else { toast('Retry failed: ' + (j.error || '?'), false); }
  } catch(e) { toast('Error: ' + e.message, false); }
}

// --- Health Dashboard ---
async function loadHealthData() {
  try {
    const r = await fetch('?action=staging_stats');
    const j = await r.json();
    if (j.ok) {
      document.getElementById('hPending').textContent = j.staged_pending ?? '-';
      document.getElementById('hSent').textContent = j.batches_sent ?? '-';
      document.getElementById('hFailed').textContent = j.batches_failed ?? '-';
      document.getElementById('hSending').textContent = '-';
    }
  } catch(e) {}
  try {
    const r = await fetch('?action=fservice_health');
    const j = await r.json();
    if (j.ok && j.data) {
      const s = j.data.status || 'unknown';
      const cls = s === 'ok' ? 'ok' : s === 'warning' ? 'warn' : 'crit';
      document.getElementById('hFserviceStatus').textContent = s;
      document.getElementById('hFserviceStatus').className = 'value ' + cls;
      document.getElementById('hFserviceLastCheck').textContent = j.data.last_probe_at ? new Date(j.data.last_probe_at).toLocaleTimeString() : '-';
      document.getElementById('hFserviceUptime').textContent = j.data.last_ok_at ? new Date(j.data.last_ok_at).toLocaleTimeString() : '-';
      document.getElementById('hWatchdogStatus').textContent = j.data.consecutive_failures > 0 ? j.data.consecutive_failures + ' consecutive failures' : 'healthy';
    } else {
      document.getElementById('hFserviceStatus').textContent = 'unknown';
      document.getElementById('hWatchdogStatus').textContent = 'no watchdog data';
    }
  } catch(e) {
    document.getElementById('hFserviceStatus').textContent = 'error';
  }
  checkDeadLetters();
}

async function triggerManualSync() {
  if (!confirm('Trigger manual sync_scanlogs + hop_b_push chain?')) return;
  startJob('sync_scanlogs', {full: false});
}

async function restartFService() {
  if (!confirm('Restart FService.exe via watchdog?')) return;
  try {
    const r = await fetch('?action=fservice_restart', {method:'POST'});
    const j = await r.json();
    toast(j.ok ? 'FService restarted' : ('Restart failed: ' + (j.error||'?')), j.ok);
    setTimeout(loadHealthData, 3000);
  } catch(e) { toast('Error: ' + e.message, false); }
}

async function clearDeadLetters() {
  if (!confirm('Clear all dead letter records? This does NOT retry them.')) return;
  toast('Not implemented yet', false);
}

function startDeadLetterPoll() {
  if (deadLetterPollInterval) clearInterval(deadLetterPollInterval);
  deadLetterPollInterval = setInterval(checkDeadLetters, 30000);
}

// --- Init ---
window.addEventListener('DOMContentLoaded', () => {
  doAction('db_stats');
  refreshStaging();
  loadJobHistory('dash-recent-jobs', 5);
  startDeadLetterPoll();
});
</script>
</body>
</html>
