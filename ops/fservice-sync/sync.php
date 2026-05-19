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

// --- Configuration -----------------------------------------------------------

define('FSERVICE_HOST', getenv('FSERVICE_HOST') ?: 'localhost');
define('FSERVICE_PORT', getenv('FSERVICE_PORT') ?: '8090');
define('FSERVICE_SN',   getenv('FSERVICE_SN')   ?: 'Fio66208021230737');

define('DB_HOST', getenv('DB_HOST') ?: '192.168.1.129');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_USER', getenv('DB_USER') ?: 'easylink_sync');
define('DB_PASS', getenv('DB_PASS') ?: 'EasyLink2026!');
define('DB_NAME', getenv('DB_NAME') ?: 'demo_easylinksdk');

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

    if ($response === false || $httpCode !== 200) {
        echo "[ERROR] $path failed: HTTP $httpCode - $error\n";
        return null;
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        echo "[ERROR] $path returned non-JSON\n";
        return null;
    }

    return $decoded;
}

function get_pdo(): PDO {
    $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
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
    $endpoint = $fullMode ? '/scanlog/all/paging' : '/scanlog/new';
    echo "[INFO] Pulling scanlogs from bridge ($endpoint)...\n";

    $isSession = true;
    $total = 0;

    $stmt = $pdo->prepare("
        INSERT IGNORE INTO tb_scanlog (sn, scan_date, pin, verifymode, iomode, workcode)
        VALUES (:sn, :scan_date, :pin, :verifymode, :iomode, :workcode)
    ");

    while ($isSession) {
        $fields = ['limit' => PAGING_LIMIT];
        $result = bridge_post($endpoint, $fields);

        if (!$result || empty($result['Result'])) {
            echo "[WARN] Scanlog pull returned Result=false or empty\n";
            break;
        }

        $rows = $result['Data'] ?? [];
        foreach ($rows as $row) {
            $stmt->execute([
                ':sn'         => $row['SN'] ?? FSERVICE_SN,
                ':scan_date'  => $row['ScanDate'] ?? '',
                ':pin'        => $row['PIN'] ?? '',
                ':verifymode' => (int)($row['VerifyMode'] ?? 0),
                ':iomode'     => (int)($row['IOMode'] ?? 0),
                ':workcode'   => $row['WorkCode'] ?? '0',
            ]);
            $total++;
        }

        $isSession = !empty($result['IsSession']);
    }

    echo "[INFO] Scanlogs synced: $total\n";
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
