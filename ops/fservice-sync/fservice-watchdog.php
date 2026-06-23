<?php
/**
 * FService Health Watchdog
 *
 * Probes FService.exe /dev/info endpoint. Restarts process after N consecutive
 * probe failures. Single-shot or daemon mode (30s loop).
 *
 * Usage:
 *   php fservice-watchdog.php                # single tick, exit
 *   php fservice-watchdog.php --daemon       # loop every 30s
 *
 * Env: FSERVICE_HOST, FSERVICE_PORT, FSERVICE_SN, FSERVICE_DIR,
 *      STATUS_FILE, EASYLINK_SYNC_LOG_DIR
 */

declare(strict_types=1);

require_once __DIR__ . '/lib-log.php';

define('FSERVICE_HOST', getenv('FSERVICE_HOST') ?: 'localhost');
define('FSERVICE_PORT', getenv('FSERVICE_PORT') ?: '8090');
define('FSERVICE_SN', getenv('FSERVICE_SN') ?: 'Fio66208021230737');
define('FSERVICE_EXE_PATH', getenv('FSERVICE_DIR') ?: 'C:\\EasyLinkOps\\fservice-bundle\\FService.exe');
define('STATUS_FILE', getenv('STATUS_FILE') ?: 'C:\\EasyLinkOps\\status\\fservice-health.json');
define('FAILURE_THRESHOLD', 3);
define('PROBE_TIMEOUT', 5);

// ---------------------------------------------------------------------------

function probe_fservice(): array {
    $url = 'http://' . FSERVICE_HOST . ':' . FSERVICE_PORT . '/dev/info';
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query(['sn' => FSERVICE_SN]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => PROBE_TIMEOUT,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($resp === false) {
        return ['ok' => false, 'error' => $curlErr ?: 'curl failed', 'http' => $httpCode, 'valid_json' => false];
    }
    $decoded = json_decode($resp, true);
    $validJson = is_array($decoded);
    if (!$validJson) {
        return ['ok' => false, 'error' => 'non-JSON response', 'http' => $httpCode, 'valid_json' => false];
    }
    if (empty($decoded['Result'])) {
        $msg = (string)($decoded['message'] ?? 'Result not truthy');
        return ['ok' => false, 'error' => $msg, 'http' => $httpCode, 'valid_json' => true];
    }
    return ['ok' => true, 'error' => null, 'http' => $httpCode, 'valid_json' => true];
}

function read_status(): array {
    if (!is_file(STATUS_FILE)) {
        return ['consecutive_failures' => 0, 'last_ok_at' => null];
    }
    $raw = @file_get_contents(STATUS_FILE);
    if ($raw === false) {
        return ['consecutive_failures' => 0, 'last_ok_at' => null];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : ['consecutive_failures' => 0, 'last_ok_at' => null];
}

function write_status(array $state): void {
    $dir = dirname(STATUS_FILE);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    file_put_contents(STATUS_FILE, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function restart_fservice(): bool {
    if (PHP_OS_FAMILY === 'Windows' || DIRECTORY_SEPARATOR === '\\') {
        $list = shell_exec('tasklist /FI "IMAGENAME eq FService.exe"');
        if (is_string($list) && stripos($list, 'FService.exe') !== false) {
            el_log('INFO', 'watchdog', 'killing FService.exe');
            shell_exec('taskkill /IM FService.exe /F');
        }
        sleep(2);
        el_log('INFO', 'watchdog', 'starting FService.exe', ['path' => FSERVICE_EXE_PATH]);
        shell_exec('start "" "' . FSERVICE_EXE_PATH . '"');
        sleep(5);

        $probe = probe_fservice();
        el_log('INFO', 'watchdog', 'post-restart probe', $probe);
        return $probe['ok'];
    }

    el_log('WARN', 'watchdog', 'restart not implemented for POSIX', ['os' => PHP_OS_FAMILY]);
    return false;
}

function watchdog_tick(): void {
    $result = probe_fservice();
    $state  = read_status();

    if ($result['ok']) {
        $state['consecutive_failures'] = 0;
        $state['last_ok_at']           = date('c');
        $state['status']               = 'ok';
    } else {
        $state['consecutive_failures']++;
        $state['status'] = $state['consecutive_failures'] >= FAILURE_THRESHOLD ? 'critical' : 'warning';
        el_log('WARN', 'watchdog', 'probe failed', $result);
    }

    $state['last_probe_at']     = date('c');
    $state['last_probe_result'] = $result;

    if ($state['consecutive_failures'] >= FAILURE_THRESHOLD) {
        el_log('CRITICAL', 'watchdog', 'FService unhealthy, restarting', [
            'failures' => $state['consecutive_failures'],
        ]);
        $restarted = restart_fservice();
        $state['last_restart_at']  = date('c');
        $state['last_restart_ok']  = $restarted;
        $state['consecutive_failures'] = 0;
        if (!$restarted) {
            el_log('FATAL', 'watchdog', 'restart failed');
        }
    }

    write_status($state);
    el_log('INFO', 'watchdog', 'tick', [
        'status' => $state['status'],
        'ok' => $result['ok'],
        'failures' => $state['consecutive_failures'],
    ]);
}

// --- Entry point -----------------------------------------------------------

if (($argv[1] ?? '') === '--daemon') {
    el_log('INFO', 'watchdog', 'daemon started');
    while (true) {
        watchdog_tick();
        sleep(30);
    }
} else {
    watchdog_tick();
    exit(0);
}
