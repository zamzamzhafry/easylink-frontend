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
require_once __DIR__ . '/lib-bridge-http.php';
require_once __DIR__ . '/lib-hop-b-contract.php';
require_once __DIR__ . '/lib-sync-scanlogs.php';

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
    // CLI wrapper over shared lib-bridge-http. Returns the decoded data array
    // (not the ok-envelope) on success, null on any failure. Preserves the
    // [ERROR] stdout lines operators read during manual `php sync.php` runs.
    $machine = [
        'bridge_host' => FSERVICE_HOST,
        'bridge_port' => FSERVICE_PORT,
        'sn'          => FSERVICE_SN,
        'label'       => 'fservice',
    ];
    $r = bridge_http_post($machine, $path, $fields, REQUEST_TIMEOUT, 'bridge');
    if (!$r['ok'] || ($r['http'] ?? 0) !== 200) {
        echo "[ERROR] $path failed: HTTP " . ($r['http'] ?? 0) . " - " . ($r['error'] ?? '') . "\n";
        return null;
    }
    return $r['data'];
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

// Staging helper moved to lib-sync-scanlogs stage_scan_row().

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
    // Delegates to lib-sync-scanlogs. C4: no local tb_scanlog dual-write —
    // stages only; VM mirror owns tb_scanlog. CLI two-phase preserved:
    // /scanlog/new (incremental) first, fall back to /scanlog/all/paging if
    // --full or incremental returned nothing.
    $bridge = get_bridge_pdo();
    $machine = [
        'bridge_host' => FSERVICE_HOST,
        'bridge_port' => FSERVICE_PORT,
        'sn'          => FSERVICE_SN,
        'label'       => 'fservice',
    ];

    echo "[INFO] Pulling scanlogs from bridge (/scanlog/new)...\n";
    $flow = sync_scanlogs_flow($machine, $bridge, false);
    $total = $flow['total']; $staged = $flow['staged'];
    echo "[INFO] Incremental sync got $total records (staged=$staged)\n";

    if ($fullMode || $total === 0) {
        if ($total === 0) {
            echo "[INFO] No new scanlogs from /scanlog/new — falling back to /scanlog/all/paging\n";
        }
        echo "[INFO] Pulling ALL scanlogs from bridge (/scanlog/all/paging)...\n";
        $flow2 = sync_scanlogs_flow($machine, $bridge, true);
        $pageTotal = $flow2['total'];
        $total += $pageTotal;
        $staged += $flow2['staged'];
        echo "[INFO] All scanlogs synced this phase: $pageTotal records\n";
        if (!empty($flow2['errors'])) {
            echo "[WARN] " . implode('; ', $flow2['errors']) . "\n";
        }
    }

    if (!empty($flow['errors'])) {
        echo "[WARN] " . implode('; ', $flow['errors']) . "\n";
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
