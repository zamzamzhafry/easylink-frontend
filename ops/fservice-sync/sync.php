<?php
/**
 * EasyLink FService -> MySQL Sync Script
 *
 * Pulls users and scanlogs from FService HTTP bridge and upserts
 * into demo_easylinksdk database tables.
 *
 * Usage:
 *   php sync.php                  # pull new scanlogs + users
 *   php sync.php --users-only     # pull users only
 *   php sync.php --scanlogs-only  # pull scanlogs only
 *   php sync.php --full           # pull ALL scanlogs (not just new)
 *
 * Environment (or edit constants below):
 *   FSERVICE_HOST    - bridge IP (default: localhost)
 *   FSERVICE_PORT    - bridge port (default: 8090)
 *   FSERVICE_SN      - device serial (default: Fio66208021230737)
 *   DB_HOST          - MySQL host (default: localhost)
 *   DB_PORT          - MySQL port (default: 3306)
 *   DB_USER          - MySQL user (default: root)
 *   DB_PASS          - MySQL password (default: empty)
 *   DB_NAME          - MySQL database (default: demo_easylinksdk)
 */

require_once __DIR__ . '/lib-log.php';

// --- Configuration -----------------------------------------------------------

define('FSERVICE_HOST', getenv('FSERVICE_HOST') ?: 'localhost');
define('FSERVICE_PORT', getenv('FSERVICE_PORT') ?: '8090');
define('FSERVICE_SN',   getenv('FSERVICE_SN')   ?: 'Fio66208021230737');

define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: 'demo_easylinksdk');
define('HOP_B_DB_NAME', getenv('HOP_B_DB_NAME') ?: 'easylink_bridge');

define('PAGING_LIMIT', 100);
define('REQUEST_TIMEOUT', 120); // seconds

// --- Helpers -----------------------------------------------------------------

function bridge_url(string $path): string {
    return 'http://' . FSERVICE_HOST . ':' . FSERVICE_PORT . $path;
}

function bridge_post(string $path, array $fields = []): ?array {
    $fields['sn'] = FSERVICE_SN;
    $body = http_build_query($fields);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => bridge_url($path),
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => REQUEST_TIMEOUT,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    $rawSnippet = is_string($response) ? substr($response, 0, 500) : '(non-string)';
    $url        = bridge_url($path);

    el_log('DEBUG', 'bridge', "POST $path", [
        'url'       => $url,
        'http'      => $httpCode,
        'curl_err'  => $error,
        'body_len'  => is_string($response) ? strlen($response) : 0,
        'body_head' => $rawSnippet,
        'fields'    => array_diff_key($fields, ['sn' => 1]),
    ]);

    if ($response === false || $httpCode !== 200) {
        el_log('ERROR', 'bridge', "$path failed", [
            'http' => $httpCode, 'curl_err' => $error, 'url' => $url,
        ]);
        echo "[ERROR] $path failed: HTTP $httpCode - $error\n";
        return null;
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        el_log('ERROR', 'bridge', "$path non-JSON", [
            'http' => $httpCode, 'body_head' => $rawSnippet, 'url' => $url,
        ]);
        echo "[ERROR] $path returned non-JSON\n";
        return null;
    }

    return $decoded;
}

function _pdo_db(string $db): PDO {
    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . $db . ';charset=utf8mb4';
    return new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function get_pdo(): PDO { return _pdo_db(DB_NAME); }

function get_bridge_pdo(): ?PDO {
    try { return _pdo_db(HOP_B_DB_NAME); }
    catch (\Throwable $e) {
        el_log('WARN', 'bridge-db', 'bridge db unavailable', ['err' => $e->getMessage()]);
        echo "[WARN] " . HOP_B_DB_NAME . " unavailable: " . $e->getMessage() . " (staging skipped)\n";
        return null;
    }
}

/**
 * Insert one scan row into easylink_bridge.raw_scanlog_staging so the Hop B
 * worker (hop-b-batch-selector.php) can pick it up. Best-effort.
 */
function _stage_scan(?PDOStatement $stage, string $sn, string $scanDateTs,
                     string $pin, int $verify, int $io, int $work): bool {
    if (!$stage) return false;
    $ts = $scanDateTs !== '' ? strtotime($scanDateTs) : false;
    if ($ts === false) {
        el_log('WARN', 'stage', 'skip unparseable scan_date', ['raw' => $scanDateTs, 'pin' => $pin]);
        return false;
    }
    $date = date('Y-m-d', $ts);
    $time = date('H:i:s', $ts);
    $key  = "{$sn}|{$date}|{$time}|{$pin}|{$verify}|{$io}|{$work}";
    try {
        $stage->execute([
            ':sn'=>$sn, ':sd'=>$date, ':st'=>$time, ':pin'=>$pin,
            ':vm'=>$verify, ':io'=>$io, ':wc'=>$work,
            ':sek'=>$key, ':fetched'=>$scanDateTs,
        ]);
        return $stage->rowCount() > 0;
    } catch (\Throwable $e) {
        el_log('WARN', 'stage', 'stage insert failed', ['err' => $e->getMessage(), 'key' => $key]);
        return false;
    }
}

// --- User Sync ---------------------------------------------------------------

function sync_users(PDO $pdo): int {
    echo "[INFO] Pulling users from bridge...\n";

    $isSession = true;
    $total = 0;

    $stmt = $pdo->prepare("
        INSERT INTO tb_user (pin, nama, pwd, rfid, privilege)
        VALUES (:pin, :nama, :pwd, :rfid, :privilege)
        ON DUPLICATE KEY UPDATE
            nama = VALUES(nama),
            pwd = VALUES(pwd),
            rfid = VALUES(rfid),
            privilege = VALUES(privilege)
    ");

    while ($isSession) {
        $result = bridge_post('/user/all/paging', ['limit' => PAGING_LIMIT]);

        if (!$result || empty($result['Result'])) {
            echo "[WARN] User pull returned Result=false or empty\n";
            break;
        }

        $rows = $result['Data'] ?? [];
        foreach ($rows as $row) {
            $stmt->execute([
                ':pin'       => $row['PIN'] ?? '',
                ':nama'      => $row['Name'] ?? '',
                ':pwd'       => $row['Password'] ?? '',
                ':rfid'      => $row['RFID'] ?? '0',
                ':privilege' => (int)($row['Privilege'] ?? 0),
            ]);
            $total++;
        }

        $isSession = !empty($result['IsSession']);
    }

    echo "[INFO] Users synced: $total\n";
    return $total;
}

// --- Scanlog Sync ------------------------------------------------------------

function sync_scanlogs(PDO $pdo, bool $fullMode = false): int {
    // --- Phase 1: try /scanlog/new first ---
    $endpoint = '/scanlog/new';
    echo "[INFO] Pulling scanlogs from bridge ($endpoint)...\n";

    $stmt = $pdo->prepare("
        INSERT IGNORE INTO tb_scanlog (sn, scan_date, pin, verifymode, iomode, workcode)
        VALUES (:sn, :scan_date, :pin, :verifymode, :iomode, :workcode)
    ");
    $bridge = get_bridge_pdo();
    $stage = $bridge ? $bridge->prepare(
        "INSERT IGNORE INTO raw_scanlog_staging
           (sn, scan_date, scan_time, pin, verifymode, iomode, workcode, source_event_key, fetched_at)
         VALUES (:sn,:sd,:st,:pin,:vm,:io,:wc,:sek,:fetched)"
    ) : null;

    $total = 0;
    $staged = 0;

    $consume = function(array $rows) use ($stmt, $stage, &$total, &$staged) {
        foreach ($rows as $row) {
            $sn = (string)($row['SN'] ?? FSERVICE_SN);
            $sd = (string)($row['ScanDate'] ?? '');
            $pin = (string)($row['PIN'] ?? '');
            $vm = (int)($row['VerifyMode'] ?? 0);
            $io = (int)($row['IOMode'] ?? 0);
            $wc = (int)($row['WorkCode'] ?? 0);
            $stmt->execute([
                ':sn'=>$sn, ':scan_date'=>$sd, ':pin'=>$pin,
                ':verifymode'=>$vm, ':iomode'=>$io, ':workcode'=>$wc,
            ]);
            if (_stage_scan($stage, $sn, $sd, $pin, $vm, $io, $wc)) $staged++;
            $total++;
        }
    };

    // Try /scanlog/new first (incremental)
    $result = bridge_post($endpoint, ['limit' => PAGING_LIMIT]);

    if ($result && !empty($result['Result'])) {
        $consume($result['Data'] ?? []);
        echo "[INFO] Incremental sync got $total records (staged=$staged)\n";
    }

    // --- Phase 2: fallback to /scanlog/all/paging if needed ---
    if ($fullMode || $total === 0) {
        if ($total === 0) {
            echo "[INFO] No new scanlogs from /scanlog/new — falling back to /scanlog/all/paging\n";
        }

        $endpoint = '/scanlog/all/paging';
        echo "[INFO] Pulling ALL scanlogs from bridge ($endpoint)...\n";

        $isSession = true;
        $pageTotal = 0;
        $before = $total;

        while ($isSession) {
            $result = bridge_post($endpoint, ['limit' => PAGING_LIMIT]);

            if (!$result || empty($result['Result'])) {
                $msg = is_array($result) ? (string)($result['message'] ?? '') : '';
                if (stripos($msg, 'no data') !== false || stripos($msg, 'tidak') !== false) {
                    echo "[INFO] Scanlog all/paging: no more data\n";
                } else {
                    echo "[WARN] Scanlog all/paging returned Result=false: $msg\n";
                }
                break;
            }

            $consume($result['Data'] ?? []);
            $pageTotal = $total - $before;

            $isSession = !empty($result['IsSession']);
        }

        echo "[INFO] All scanlogs synced this phase: $pageTotal records\n";
    }

    echo "[INFO] Total scanlogs synced: $total (staged for Hop B: $staged)\n";
    return $total;
}

// --- Main --------------------------------------------------------------------

function main(): void {
    $args = array_slice($GLOBALS['argv'] ?? [], 1);
    $usersOnly    = in_array('--users-only', $args);
    $scanlogsOnly = in_array('--scanlogs-only', $args);
    $fullMode     = in_array('--full', $args);

    echo "=== EasyLink FService Sync ===\n";
    echo "Bridge: " . bridge_url('/') . "\n";
    echo "Device SN: " . FSERVICE_SN . "\n";
    echo "Database: " . DB_NAME . "@" . DB_HOST . ":" . DB_PORT . "\n";
    echo "Mode: " . ($fullMode ? 'full' : 'incremental') . "\n\n";

    // Test bridge connectivity
    $info = bridge_post('/dev/info');
    if (!$info || empty($info['Result'])) {
        echo "[FATAL] Cannot reach FService bridge or device not responding.\n";
        echo "        Make sure FService.exe is running and Device.ini is correct.\n";
        exit(1);
    }
    echo "[OK] Bridge alive. Device info received.\n\n";

    $pdo = get_pdo();

    if (!$scanlogsOnly) {
        sync_users($pdo);
        echo "\n";
    }

    if (!$usersOnly) {
        sync_scanlogs($pdo, $fullMode);
    }

    echo "\n=== Done ===\n";
}

main();
