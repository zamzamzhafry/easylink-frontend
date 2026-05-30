<?php

declare(strict_types=1);

require_once __DIR__ . '/../hop-b-batch-selector.php';

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function sqlite_pdo(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function create_schema(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE raw_scanlog_staging (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sn TEXT NOT NULL,
        scan_date TEXT NOT NULL,
        scan_time TEXT NOT NULL DEFAULT "",
        pin TEXT NOT NULL,
        verifymode INTEGER NOT NULL DEFAULT 0,
        iomode INTEGER NOT NULL DEFAULT 0,
        workcode INTEGER NOT NULL DEFAULT 0,
        source_event_key TEXT NOT NULL UNIQUE,
        fetched_at TEXT NOT NULL,
        batch_id TEXT NULL
    )');

    $pdo->exec('CREATE TABLE sync_batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL UNIQUE,
        device_sn TEXT NOT NULL,
        status TEXT NOT NULL,
        record_count INTEGER NOT NULL DEFAULT 0,
        payload_hash TEXT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        last_attempt_at TEXT NULL,
        next_retry_at TEXT NULL,
        last_error TEXT NULL,
        last_error_class TEXT NULL,
        last_error_code TEXT NULL,
        last_error_retryable INTEGER NULL,
        last_error_at TEXT NULL,
        http_status_code INTEGER NULL,
        last_response_body TEXT NULL,
        ack_status TEXT NULL,
        ack_inserted_count INTEGER NULL,
        ack_duplicate_count INTEGER NULL,
        ack_committed_at TEXT NULL,
        ack_request_id TEXT NULL,
        ack_response_body TEXT NULL,
        created_at TEXT NOT NULL,
        sent_at TEXT NULL
    )');

    $pdo->exec('CREATE TABLE sync_batch_item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        staging_id INTEGER NOT NULL,
        source_event_key TEXT NOT NULL
    )');
}

function insert_staging(PDO $pdo): void
{
    $stmt = $pdo->prepare('INSERT INTO raw_scanlog_staging (
        sn, scan_date, scan_time, pin, verifymode, iomode, workcode, source_event_key, fetched_at, batch_id
    ) VALUES (
        :sn, :scan_date, :scan_time, :pin, :verifymode, :iomode, :workcode, :source_event_key, :fetched_at, NULL
    )');

    $stmt->execute([
        ':sn' => 'SN-WORKER-1',
        ':scan_date' => '2026-05-29 09:00:00',
        ':scan_time' => '09:00:00',
        ':pin' => '9001',
        ':verifymode' => 1,
        ':iomode' => 0,
        ':workcode' => 0,
        ':source_event_key' => 'SN-WORKER-1|9001|2026-05-29 09:00:00|1|0|0',
        ':fetched_at' => '2026-05-29 09:01:00',
    ]);
}

function run_test_server(string $responseJson): array
{
    $portFile = tempnam(sys_get_temp_dir(), 'hopb-port-');
    if ($portFile === false) {
        throw new RuntimeException('tempnam failed');
    }

    $encoded = 'base64:' . base64_encode($responseJson);
    $cmd = sprintf(
        'php %s 200 %s %s',
        escapeshellarg(__DIR__ . '/hop-b-test-server.php'),
        escapeshellarg($encoded),
        escapeshellarg($portFile)
    );

    $desc = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $proc = proc_open($cmd, $desc, $pipes, __DIR__);
    if (!is_resource($proc)) {
        @unlink($portFile);
        throw new RuntimeException('proc_open failed');
    }

    $started = false;
    for ($i = 0; $i < 50; $i++) {
        clearstatcache(true, $portFile);
        if (is_file($portFile) && filesize($portFile) > 0) {
            $started = true;
            break;
        }
        usleep(20000);
    }

    if (!$started) {
        proc_terminate($proc);
        proc_close($proc);
        @unlink($portFile);
        throw new RuntimeException('server did not publish port');
    }

    $port = (int) trim((string) file_get_contents($portFile));
    @unlink($portFile);

    return [$proc, $pipes, $port];
}

function stop_test_server($proc, array $pipes): void
{
    foreach ($pipes as $pipe) {
        if (is_resource($pipe)) {
            fclose($pipe);
        }
    }
    proc_terminate($proc);
    proc_close($proc);
}

function test_worker_no_work(): void
{
    $pdo = sqlite_pdo();
    create_schema($pdo);

    $statusFile = tempnam(sys_get_temp_dir(), 'hopb-status-no-work-');
    putenv('EASYLINK_HOP_B_STATUS_PATH=' . $statusFile);

    $result = hop_b_run_worker_cycle($pdo, 100, new DateTimeImmutable('2026-05-29T09:10:00Z'));

    assert_true($result['status'] === 'ok', 'no-work status should be ok');
    assert_true($result['outcome'] === HOP_B_OUTCOME_NOOP, 'no-work outcome should be noop');
    assert_true($result['send_result'] === null, 'no-work send_result should be null');
    assert_true(is_file($statusFile), 'no-work should write status file');

    $snapshot = json_decode((string) file_get_contents($statusFile), true);
    assert_true(($snapshot['pending_count'] ?? -1) === 0, 'no-work pending_count should be 0');

    @unlink($statusFile);
}

function test_worker_queued_work(): void
{
    $pdo = sqlite_pdo();
    create_schema($pdo);
    insert_staging($pdo);

    $statusFile = tempnam(sys_get_temp_dir(), 'hopb-status-work-');
    putenv('EASYLINK_HOP_B_STATUS_PATH=' . $statusFile);
    putenv('HOP_B_AUTH_TOKEN=test-token');

    $sentAt = '2026-05-29T09:15:00Z';
    $ack = [
        'status' => 'accepted',
        'batch_id' => '',
        'inserted_count' => 1,
        'duplicate_count' => 0,
        'committed_at' => '2026-05-29T09:15:05Z',
        'request_id' => 'req-worker-test',
    ];

    $prepared = hop_b_prepare_outbound_batch($pdo, 100, new DateTimeImmutable($sentAt));
    if ($prepared === null) {
        throw new RuntimeException('expected prepared batch');
    }
    $ack['batch_id'] = (string) $prepared['batch']['batch_id'];

    [$proc, $pipes, $port] = run_test_server(json_encode($ack, JSON_UNESCAPED_SLASHES));
    putenv('HOP_B_INGEST_URL=http://127.0.0.1:' . $port . '/api/scanlog/ingest');

    try {
        $result = hop_b_run_worker_cycle($pdo, 100, new DateTimeImmutable($sentAt));
    } finally {
        stop_test_server($proc, $pipes);
    }


    assert_true($result['status'] === 'ok', 'queued-work status should be ok');
    assert_true(in_array(($result['outcome'] ?? ''), [HOP_B_OUTCOME_SENT, HOP_B_OUTCOME_REPLAY], true), 'queued-work outcome should be sent/replay');
    assert_true(in_array(($result['send_result']['status'] ?? ''), ['sent', 'sent_replay'], true), 'queued-work send_result status should be sent/sent_replay');

    $row = $pdo->query('SELECT status, attempt_count, ack_status, ack_inserted_count FROM sync_batch LIMIT 1')->fetch();
    assert_true(($row['status'] ?? '') === 'sent', 'batch row should be sent');
    assert_true((int) ($row['attempt_count'] ?? -1) === 1, 'batch attempt_count should be 1');
    assert_true(($row['ack_status'] ?? '') === 'accepted', 'batch ack_status should be accepted');
    assert_true((int) ($row['ack_inserted_count'] ?? -1) === 1, 'batch ack_inserted_count should be 1');

    @unlink($statusFile);
}

try {
    test_worker_no_work();
    test_worker_queued_work();
    echo "OK hop-b-worker-cycle-test\n";
} catch (Throwable $throwable) {
    fwrite(STDERR, "FAIL hop-b-worker-cycle-test: " . $throwable->getMessage() . "\n");
    exit(1);
}
