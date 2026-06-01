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
        scan_time TEXT NOT NULL DEFAULT \'\',
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

function insert_staging(PDO $pdo, array $row): void
{
    $stmt = $pdo->prepare('INSERT INTO raw_scanlog_staging (
        sn, scan_date, scan_time, pin, verifymode, iomode, workcode, source_event_key, fetched_at, batch_id
    ) VALUES (
        :sn, :scan_date, :scan_time, :pin, :verifymode, :iomode, :workcode, :source_event_key, :fetched_at, NULL
    )');

    $stmt->execute($row);
}

function assert_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

function start_test_server(int $statusCode, array $response): array
{
    $responseJson = json_encode($response, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $portFile = tempnam(sys_get_temp_dir(), 'hopb-port-');
    if ($portFile === false) {
        throw new RuntimeException('tempnam failed for port file');
    }

    $cmd = [
        PHP_BINARY,
        __DIR__ . '/hop-b-test-server.php',
        (string) $statusCode,
        $responseJson,
        $portFile,
    ];

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($cmd, $descriptors, $pipes, __DIR__);
    if (!is_resource($process)) {
        @unlink($portFile);
        throw new RuntimeException('proc_open failed for test server');
    }

    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $deadline = microtime(true) + 5;
    $port = null;
    while (microtime(true) < $deadline) {
        clearstatcache(true, $portFile);
        if (is_file($portFile)) {
            $value = trim((string) file_get_contents($portFile));
            if ($value !== '') {
                $port = (int) $value;
                break;
            }
        }
        usleep(50000);
    }

    if ($port === null || $port < 1) {
        $stderr = stream_get_contents($pipes[2]);
        foreach ([$pipes[1], $pipes[2]] as $pipe) {
            fclose($pipe);
        }
        proc_terminate($process);
        proc_close($process);
        @unlink($portFile);
        throw new RuntimeException('server port unavailable: ' . trim((string) $stderr));
    }

    return [
        'process' => $process,
        'pipes' => $pipes,
        'port' => $port,
        'port_file' => $portFile,
    ];
}

function stop_test_server(array $server): void
{
    foreach ($server['pipes'] as $pipe) {
        if (is_resource($pipe)) {
            fclose($pipe);
        }
    }

    $exitCode = proc_close($server['process']);
    @unlink((string) $server['port_file']);

    if ($exitCode !== 0) {
        throw new RuntimeException('test server exit code ' . $exitCode);
    }
}

function test_deterministic_selection_and_retry_reuse(): void
{
    $pdo = sqlite_pdo();
    create_schema($pdo);

    insert_staging($pdo, [
        ':sn' => 'SN-A',
        ':scan_date' => '2026-05-29 08:15:42',
        ':scan_time' => '',
        ':pin' => '10023',
        ':verifymode' => 1,
        ':iomode' => 0,
        ':workcode' => 0,
        ':source_event_key' => 'SN-A|2026-05-29|08:15:42|10023|1|0|0',
        ':fetched_at' => '2026-05-29 08:16:00',
    ]);

    insert_staging($pdo, [
        ':sn' => 'SN-A',
        ':scan_date' => '2026-05-29 08:20:10',
        ':scan_time' => '',
        ':pin' => '10024',
        ':verifymode' => 1,
        ':iomode' => 0,
        ':workcode' => 0,
        ':source_event_key' => 'SN-A|2026-05-29|08:20:10|10024|1|0|0',
        ':fetched_at' => '2026-05-29 08:21:00',
    ]);

    insert_staging($pdo, [
        ':sn' => 'SN-B',
        ':scan_date' => '2026-05-29 09:00:00',
        ':scan_time' => '',
        ':pin' => '20001',
        ':verifymode' => 2,
        ':iomode' => 1,
        ':workcode' => 9,
        ':source_event_key' => 'SN-B|2026-05-29|09:00:00|20001|2|1|9',
        ':fetched_at' => '2026-05-29 09:01:00',
    ]);

    $now = new DateTimeImmutable('2026-05-29T10:00:00Z');
    $first = hop_b_prepare_outbound_batch($pdo, 2, $now);

    assert_true($first !== null, 'first batch missing');
    assert_true($first['mode'] === 'new', 'first batch must be new');
    assert_true($first['payload']['device_sn'] === 'SN-A', 'first batch device order wrong');
    assert_true($first['payload']['record_count'] === 2, 'first batch size wrong');
    assert_true($first['payload']['records'][0]['source_event_key'] === 'SN-A|2026-05-29|08:15:42|10023|1|0|0', 'first row order wrong');
    assert_true($first['payload']['records'][1]['source_event_key'] === 'SN-A|2026-05-29|08:20:10|10024|1|0|0', 'second row order wrong');
    assert_true($first['payload']['records'][0]['scan_date'] === '2026-05-29', 'scan_date split wrong');
    assert_true($first['payload']['records'][0]['scan_time'] === '08:15:42', 'scan_time split wrong');
    assert_true($first['payload']['_trace']['staging_ids'] === [1, 2], 'trace staging ids wrong');

    $second = hop_b_prepare_outbound_batch($pdo, 2, $now->modify('+10 minutes'));
    assert_true($second !== null, 'retry batch missing');
    assert_true($second['mode'] === 'pending', 'unacked batch must be reused before new rows');
    assert_true($second['payload']['batch_id'] === $first['payload']['batch_id'], 'batch id must be stable on retry');
    assert_true($second['payload_json'] === $first['payload_json'], 'payload bytes must be stable on retry');
}

function test_excludes_sent_and_non_retryable_failed(): void
{
    $pdo = sqlite_pdo();
    create_schema($pdo);

    insert_staging($pdo, [
        ':sn' => 'SN-C',
        ':scan_date' => '2026-05-29 07:00:00',
        ':scan_time' => '',
        ':pin' => '30001',
        ':verifymode' => 1,
        ':iomode' => 1,
        ':workcode' => 0,
        ':source_event_key' => 'SN-C|2026-05-29|07:00:00|30001|1|1|0',
        ':fetched_at' => '2026-05-29 07:01:00',
    ]);

    insert_staging($pdo, [
        ':sn' => 'SN-C',
        ':scan_date' => '2026-05-29 07:05:00',
        ':scan_time' => '',
        ':pin' => '30002',
        ':verifymode' => 1,
        ':iomode' => 1,
        ':workcode' => 0,
        ':source_event_key' => 'SN-C|2026-05-29|07:05:00|30002|1|1|0',
        ':fetched_at' => '2026-05-29 07:06:00',
    ]);

    $pdo->exec("INSERT INTO sync_batch (batch_id, device_sn, status, record_count, payload_hash, attempt_count, max_attempts, created_at, sent_at)
                VALUES ('batch-sent', 'SN-C', 'sent', 1, 'hash', 1, 5, '2026-05-29 07:02:00', '2026-05-29 07:03:00')");
    $pdo->exec("INSERT INTO sync_batch_item (batch_id, staging_id, source_event_key)
                VALUES ('batch-sent', 1, 'SN-C|2026-05-29|07:00:00|30001|1|1|0')");

    $pdo->exec("INSERT INTO sync_batch (batch_id, device_sn, status, record_count, payload_hash, attempt_count, max_attempts, created_at, next_retry_at)
                VALUES ('batch-dead', 'SN-C', 'dead_letter', 1, 'hash2', 5, 5, '2026-05-29 07:04:00', '2026-05-29 07:10:00')");

    $result = hop_b_prepare_outbound_batch($pdo, 10, new DateTimeImmutable('2026-05-29T08:00:00Z'));

    assert_true($result !== null, 'new eligible row should produce batch');
    assert_true($result['mode'] === 'new', 'eligible row should create new batch');
    assert_true($result['payload']['record_count'] === 1, 'sent row must be excluded');
    assert_true($result['payload']['records'][0]['source_event_key'] === 'SN-C|2026-05-29|07:05:00|30002|1|1|0', 'wrong eligible row selected');
    assert_true($result['payload']['_trace']['staging_ids'] === [2], 'trace should point to remaining row');
}

function test_send_success_persists_ack_metadata(): void
{
    $pdo = sqlite_pdo();
    create_schema($pdo);

    insert_staging($pdo, [
        ':sn' => 'SN-S',
        ':scan_date' => '2026-05-29 10:15:42',
        ':scan_time' => '',
        ':pin' => '55501',
        ':verifymode' => 1,
        ':iomode' => 0,
        ':workcode' => 0,
        ':source_event_key' => 'SN-S|2026-05-29|10:15:42|55501|1|0|0',
        ':fetched_at' => '2026-05-29 10:16:00',
    ]);
    insert_staging($pdo, [
        ':sn' => 'SN-S',
        ':scan_date' => '2026-05-29 10:16:42',
        ':scan_time' => '',
        ':pin' => '55502',
        ':verifymode' => 1,
        ':iomode' => 0,
        ':workcode' => 0,
        ':source_event_key' => 'SN-S|2026-05-29|10:16:42|55502|1|0|0',
        ':fetched_at' => '2026-05-29 10:17:00',
    ]);

    $prepared = hop_b_prepare_outbound_batch($pdo, 10, new DateTimeImmutable('2026-05-29T10:30:00Z'));
    assert_true($prepared !== null, 'prepared batch required');

    $server = start_test_server(200, [
        'status' => 'accepted',
        'batch_id' => $prepared['payload']['batch_id'],
        'inserted_count' => 2,
        'duplicate_count' => 0,
        'committed_at' => '2026-05-29T10:30:05Z',
        'request_id' => 'req-success-1',
    ]);

    $result = hop_b_send_prepared_batch(
        $pdo,
        $prepared,
        new DateTimeImmutable('2026-05-29T10:30:00Z'),
        'http://127.0.0.1:' . $server['port'] . '/api/scanlog/ingest',
        'token-1',
        5
    );

    stop_test_server($server);

    assert_same('sent', $result['status'], 'success status wrong');
    assert_same(HOP_B_OUTCOME_SENT, $result['outcome'], 'success outcome wrong');
    assert_same('Bearer <redacted>', $result['sent_headers']['Authorization'], 'auth header tracking wrong');

    $row = $pdo->query("SELECT status, attempt_count, http_status_code, ack_status, ack_inserted_count, ack_duplicate_count, ack_committed_at, ack_request_id, ack_response_body, last_error, last_error_class FROM sync_batch LIMIT 1")->fetch();
    assert_same('sent', $row['status'], 'db status wrong after ack');
    assert_same(1, (int) $row['attempt_count'], 'attempt count should increment on ack');
    assert_same(200, (int) $row['http_status_code'], 'http status wrong after ack');
    assert_same('accepted', $row['ack_status'], 'ack status not stored');
    assert_same(2, (int) $row['ack_inserted_count'], 'ack inserted count wrong');
    assert_same(0, (int) $row['ack_duplicate_count'], 'ack duplicate count wrong');
    assert_same('2026-05-29 10:30:05', $row['ack_committed_at'], 'ack committed_at wrong');
    assert_same('req-success-1', $row['ack_request_id'], 'ack request id wrong');
    assert_true(str_contains((string) $row['ack_response_body'], 'accepted'), 'ack response body missing');
    assert_same(null, $row['last_error'], 'last_error must clear on success');
    assert_same(null, $row['last_error_class'], 'last_error_class must clear on success');
}

function test_send_retryable_500_persists_failure_metadata(): void
{
    $pdo = sqlite_pdo();
    create_schema($pdo);

    insert_staging($pdo, [
        ':sn' => 'SN-F',
        ':scan_date' => '2026-05-29 11:15:42',
        ':scan_time' => '',
        ':pin' => '66601',
        ':verifymode' => 1,
        ':iomode' => 0,
        ':workcode' => 0,
        ':source_event_key' => 'SN-F|2026-05-29|11:15:42|66601|1|0|0',
        ':fetched_at' => '2026-05-29 11:16:00',
    ]);

    $prepared = hop_b_prepare_outbound_batch($pdo, 10, new DateTimeImmutable('2026-05-29T11:30:00Z'));
    assert_true($prepared !== null, 'prepared retry batch required');

    $server = start_test_server(500, [
        'status' => 'error',
        'code' => 'INTERNAL_ERROR',
        'message' => 'db down',
        'request_id' => 'req-fail-1',
    ]);

    $result = hop_b_send_prepared_batch(
        $pdo,
        $prepared,
        new DateTimeImmutable('2026-05-29T11:30:00Z'),
        'http://127.0.0.1:' . $server['port'] . '/api/scanlog/ingest',
        'token-1',
        5
    );

    stop_test_server($server);

    assert_same('failed', $result['status'], 'retryable failure should stay failed');
    assert_same(HOP_B_OUTCOME_RETRY_SCHEDULED, $result['outcome'], 'retryable failure outcome wrong');
    assert_same(HOP_B_FAILURE_INGEST, $result['failure']['class'], 'failure class wrong');
    assert_same('INTERNAL_ERROR', $result['failure']['code'], 'failure code wrong');
    assert_true($result['next_retry_at'] !== null, 'retry schedule missing');

    $row = $pdo->query("SELECT status, attempt_count, http_status_code, next_retry_at, last_error, last_error_class, last_error_code, last_error_retryable, last_error_at, last_response_body, ack_status FROM sync_batch LIMIT 1")->fetch();
    assert_same('failed', $row['status'], 'db status wrong after 500');
    assert_same(1, (int) $row['attempt_count'], 'attempt count should increment on failure');
    assert_same(500, (int) $row['http_status_code'], 'http status wrong after 500');
    assert_true($row['next_retry_at'] !== null, 'next_retry_at missing after 500');
    assert_same(HOP_B_FAILURE_INGEST, $row['last_error_class'], 'last_error_class wrong');
    assert_same('INTERNAL_ERROR', $row['last_error_code'], 'last_error_code wrong');
    assert_same(1, (int) $row['last_error_retryable'], 'last_error_retryable wrong');
    assert_true(str_contains((string) $row['last_error'], 'db down'), 'last_error payload missing message');
    assert_true(str_contains((string) $row['last_response_body'], 'INTERNAL_ERROR'), 'response body missing');
    assert_same(null, $row['ack_status'], 'ack fields must clear on failure');
}

$tests = [
    'test_deterministic_selection_and_retry_reuse',
    'test_excludes_sent_and_non_retryable_failed',
    'test_send_success_persists_ack_metadata',
    'test_send_retryable_500_persists_failure_metadata',
];


foreach ($tests as $test) {
    $test();
    echo "[PASS] {$test}" . PHP_EOL;
}

echo "All selector tests passed" . PHP_EOL;
