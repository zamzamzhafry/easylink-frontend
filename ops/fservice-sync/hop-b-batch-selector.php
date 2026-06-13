<?php

declare(strict_types=1);

const HOP_B_SCHEMA_VERSION = '1.0.0';
const HOP_B_SOURCE_SDK = 'fservice-hop-b';
const HOP_B_DEFAULT_BATCH_SIZE = 100;
const HOP_B_DEFAULT_MAX_ATTEMPTS = 5;
const HOP_B_RETRY_BASE_SECONDS = 60;
const HOP_B_RETRY_MAX_SECONDS = 3600;
const HOP_B_FAILURE_TRANSPORT = 'transport';
const HOP_B_FAILURE_AUTH = 'auth';
const HOP_B_FAILURE_VALIDATION = 'validation';
const HOP_B_FAILURE_INGEST = 'ingest';
const HOP_B_OUTCOME_RETRY_SCHEDULED = 'retry_scheduled';
const HOP_B_OUTCOME_PERMANENT_FAILURE = 'permanent_failure';
const HOP_B_OUTCOME_REPLAY = 'replay';
const HOP_B_OUTCOME_NOOP = 'no_op';
const HOP_B_OUTCOME_SENT = 'sent';
const HOP_B_STATUS_FILE_DEFAULT = 'C:\\EasyLinkOps\\status\\hop-b-sync-status.json';
const HOP_B_LOG_EVENT_SEND_FAILURE = 'hop_b_send_failure';
const HOP_B_LOG_EVENT_SEND_RESULT = 'hop_b_send_result';
const HOP_B_LOG_EVENT_RETRY_SCHEDULED = 'hop_b_retry_scheduled';
const HOP_B_LOG_EVENT_BATCH_STATE = 'hop_b_batch_state';
const HOP_B_STATUS_OK = 'ok';
const HOP_B_STATUS_WARNING = 'warning';
const HOP_B_STATUS_CRITICAL = 'critical';
const HOP_B_AUTH_FAILURE_ALARM_THRESHOLD = 3;
const HOP_B_STALE_SYNC_ALARM_MINUTES = 120;
const HOP_B_DEFAULT_HTTP_TIMEOUT_SECONDS = 30;
const HOP_B_ACK_BODY_MAX_BYTES = 4000;
const HOP_B_FAILURE_TIMEOUT = 'timeout';

function hop_b_default_dsn(): string
{
    if ($dsn = getenv('HOP_B_DB_DSN')) {
        return $dsn;
    }

    $host = getenv('HOP_B_DB_HOST') ?: '127.0.0.1';
    $port = getenv('HOP_B_DB_PORT') ?: '3306';
    $name = getenv('HOP_B_DB_NAME') ?: 'easylink_bridge';

    return sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $name);
}

function hop_b_get_pdo(?string $dsn = null, ?string $user = null, ?string $pass = null): PDO
{
    $pdo = new PDO(
        $dsn ?: hop_b_default_dsn(),
        $user ?? (getenv('HOP_B_DB_USER') ?: 'root'),
        $pass ?? (getenv('HOP_B_DB_PASS') ?: ''),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );

    return $pdo;
}

function hop_b_uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function hop_b_parse_scan_parts(string $scanDateTime, ?string $scanTime = null): array
{
    $scanDateTime = trim($scanDateTime);
    $scanTime = trim((string) $scanTime);

    if ($scanDateTime === '') {
        throw new InvalidArgumentException('scan_date value required');
    }

    if (preg_match('/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/', $scanDateTime, $matches) === 1) {
        return [$matches[1], $matches[2]];
    }

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $scanDateTime) === 1 && $scanTime !== '') {
        return [$scanDateTime, $scanTime];
    }

    throw new InvalidArgumentException('scan_date must contain YYYY-MM-DD HH:MM:SS or companion scan_time');
}

function hop_b_build_record(array $row): array
{
    [$scanDate, $scanTime] = hop_b_parse_scan_parts((string) ($row['scan_date'] ?? ''), $row['scan_time'] ?? null);

    return [
        'device_sn' => (string) $row['sn'],
        'scan_date' => $scanDate,
        'scan_time' => $scanTime,
        'pin' => (string) $row['pin'],
        'verify_mode' => (int) $row['verifymode'],
        'io_mode' => (int) $row['iomode'],
        'workcode' => (int) $row['workcode'],
        'source_event_key' => (string) $row['source_event_key'],
    ];
}

function hop_b_format_sent_at(string $createdAtUtc): string
{
    $dt = new DateTimeImmutable($createdAtUtc, new DateTimeZone('UTC'));
    return $dt->format('Y-m-d\TH:i:s.000\Z');
}

function hop_b_iso8601_utc(DateTimeImmutable $dt): string
{
    return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function hop_b_clip_error_detail(string $detail, int $maxLength = 1000): string
{
    $detail = trim($detail);
    if ($detail === '') {
        return 'detail unavailable';
    }

    if (strlen($detail) <= $maxLength) {
        return $detail;
    }

    return substr($detail, 0, $maxLength - 3) . '...';
}

function hop_b_build_failure_record(
    string $class,
    string $code,
    string $message,
    bool $retryable,
    array $context = []
): array {
    return [
        'class' => $class,
        'code' => $code,
        'message' => $message,
        'retryable' => $retryable,
        'context' => $context,
    ];
}

function hop_b_build_last_error(array $failure): string
{
    $payload = [
        'class' => (string) $failure['class'],
        'code' => (string) $failure['code'],
        'message' => (string) $failure['message'],
        'retryable' => (bool) $failure['retryable'],
    ];

    if (!empty($failure['context']) && is_array($failure['context'])) {
        $payload['context'] = $failure['context'];
    }

    return json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function hop_b_response_excerpt(?string $body, int $maxLength = HOP_B_ACK_BODY_MAX_BYTES): ?string
{
    $body = trim((string) $body);
    if ($body === '') {
        return null;
    }

    return hop_b_clip_error_detail($body, $maxLength);
}

function hop_b_iso8601_to_utc_sql(?string $value): ?string
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    try {
        $dt = new DateTimeImmutable($value);
    } catch (Throwable $throwable) {
        return null;
    }

    return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

function hop_b_json_encode(array $payload): string
{
    return json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function hop_b_retry_delay_seconds(int $attemptCount): int
{
    $attemptCount = max(1, $attemptCount);
    $delay = HOP_B_RETRY_BASE_SECONDS * (2 ** ($attemptCount - 1));
    return min(HOP_B_RETRY_MAX_SECONDS, $delay);
}

function hop_b_is_auth_http_status(?int $httpStatusCode): bool
{
    return in_array($httpStatusCode, [401, 403], true);
}

function hop_b_is_validation_http_status(?int $httpStatusCode): bool
{
    return in_array($httpStatusCode, [400, 409, 422], true);
}

function hop_b_classify_ingest_failure(?int $httpStatusCode, ?string $responseBody = null, ?string $curlError = null, ?int $curlErrno = null): array
{
    $responseBody = trim((string) $responseBody);
    $curlError = trim((string) $curlError);
    $responseExcerpt = $responseBody === '' ? null : hop_b_clip_error_detail($responseBody, 300);

    if (($curlErrno !== null && $curlErrno === CURLE_OPERATION_TIMEDOUT) || stripos($curlError, 'timed out') !== false) {
        return hop_b_build_failure_record(
            HOP_B_FAILURE_TIMEOUT,
            'REQUEST_TIMEOUT',
            $curlError !== '' ? $curlError : 'ingest request timed out',
            true,
            [
                'http_status_code' => $httpStatusCode,
                'curl_errno' => $curlErrno,
                'response_excerpt' => $responseExcerpt,
            ]
        );
    }

    if ($curlError !== '' || $httpStatusCode === null || $httpStatusCode === 0) {
        return hop_b_build_failure_record(
            HOP_B_FAILURE_TRANSPORT,
            'TRANSPORT_ERROR',
            $curlError !== '' ? $curlError : 'transport request failed',
            true,
            [
                'http_status_code' => $httpStatusCode,
                'curl_errno' => $curlErrno,
                'response_excerpt' => $responseExcerpt,
            ]
        );
    }

    $decoded = null;
    if ($responseBody !== '') {
        $decoded = json_decode($responseBody, true);
    }

    $errorCode = is_array($decoded) ? (string) ($decoded['code'] ?? '') : '';
    $errorMessage = is_array($decoded)
        ? trim((string) ($decoded['message'] ?? ''))
        : '';

    if (hop_b_is_auth_http_status($httpStatusCode) || str_starts_with($errorCode, 'AUTH_')) {
        return hop_b_build_failure_record(
            HOP_B_FAILURE_AUTH,
            $errorCode !== '' ? $errorCode : 'AUTH_HTTP_' . $httpStatusCode,
            $errorMessage !== '' ? $errorMessage : 'authentication failed',
            false,
            [
                'http_status_code' => $httpStatusCode,
                'response_excerpt' => $responseExcerpt,
            ]
        );
    }

    if (hop_b_is_validation_http_status($httpStatusCode) || in_array($errorCode, ['PAYLOAD_INVALID', 'BATCH_EMPTY', 'SCHEMA_VERSION_UNSUPPORTED', 'BATCH_CONFLICT', 'MALFORMED_PAYLOAD', 'INVALID_SCHEMA_VERSION'], true)) {
        return hop_b_build_failure_record(
            HOP_B_FAILURE_VALIDATION,
            $errorCode !== '' ? $errorCode : 'VALIDATION_HTTP_' . $httpStatusCode,
            $errorMessage !== '' ? $errorMessage : 'payload validation failed',
            false,
            [
                'http_status_code' => $httpStatusCode,
                'response_excerpt' => $responseExcerpt,
            ]
        );
    }

    $code = $errorCode !== '' ? $errorCode : 'INGEST_HTTP_' . $httpStatusCode;
    $message = $errorMessage !== '' ? $errorMessage : 'ingest endpoint returned failure';
    $context = [
        'http_status_code' => $httpStatusCode,
        'response_excerpt' => $responseExcerpt,
    ];

    if ($responseBody !== '' && !is_array($decoded) && $httpStatusCode >= 500) {
        $code = 'INGEST_BAD_RESPONSE';
        $message = 'ingest endpoint returned non-JSON or truncated response';
    }

    return hop_b_build_failure_record(HOP_B_FAILURE_INGEST, $code, $message, true, $context);
}

function hop_b_load_batch_rows(PDO $pdo, string $batchId): array
{
    $stmt = $pdo->prepare(
        "SELECT r.id, r.sn, r.scan_date, r.scan_time, r.pin, r.verifymode, r.iomode, r.workcode, r.source_event_key, r.fetched_at
         FROM sync_batch_item i
         INNER JOIN raw_scanlog_staging r ON r.id = i.staging_id
         WHERE i.batch_id = :batch_id
         ORDER BY r.fetched_at ASC, r.id ASC"
    );
    $stmt->execute([':batch_id' => $batchId]);

    return $stmt->fetchAll();
}

function hop_b_load_existing_batch(PDO $pdo, string $status, string $nowUtc): ?array
{
    $sql = "SELECT id, batch_id, device_sn, status, record_count, payload_hash, attempt_count, max_attempts, created_at, next_retry_at
            FROM sync_batch
            WHERE status = :status";

    $params = [':status' => $status];

    if ($status === 'failed') {
        $sql .= " AND attempt_count < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= :now_utc)";
        $params[':now_utc'] = $nowUtc;
    }

    $sql .= " ORDER BY created_at ASC, id ASC LIMIT 1";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $batch = $stmt->fetch();

    if (!$batch) {
        return null;
    }

    $rows = hop_b_load_batch_rows($pdo, (string) $batch['batch_id']);
    if ($rows === []) {
        return null;
    }

    return [
        'mode' => $status === 'pending' ? 'pending' : 'retry',
        'batch' => $batch,
        'rows' => $rows,
    ];
}

function hop_b_find_candidate_device(PDO $pdo): ?string
{
    $stmt = $pdo->query(
        "SELECT r.sn
         FROM raw_scanlog_staging r
         LEFT JOIN sync_batch_item i ON i.staging_id = r.id
         WHERE i.staging_id IS NULL
         ORDER BY r.fetched_at ASC, r.id ASC
         LIMIT 1"
    );

    $deviceSn = $stmt->fetchColumn();
    return $deviceSn === false ? null : (string) $deviceSn;
}

function hop_b_select_new_rows(PDO $pdo, string $deviceSn, int $batchSize): array
{
    $stmt = $pdo->prepare(
        "SELECT r.id, r.sn, r.scan_date, r.scan_time, r.pin, r.verifymode, r.iomode, r.workcode, r.source_event_key, r.fetched_at
         FROM raw_scanlog_staging r
         LEFT JOIN sync_batch_item i ON i.staging_id = r.id
         WHERE i.staging_id IS NULL
           AND r.sn = :device_sn
         ORDER BY r.fetched_at ASC, r.id ASC
         LIMIT :batch_size"
    );
    $stmt->bindValue(':device_sn', $deviceSn, PDO::PARAM_STR);
    $stmt->bindValue(':batch_size', $batchSize, PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll();
}

function hop_b_create_pending_batch(PDO $pdo, array $rows, string $nowUtc): array
{
    $batchId = hop_b_uuid_v4();
    $deviceSn = (string) $rows[0]['sn'];

    $insertBatch = $pdo->prepare(
        "INSERT INTO sync_batch (
            batch_id,
            device_sn,
            status,
            record_count,
            created_at,
            max_attempts
        ) VALUES (
            :batch_id,
            :device_sn,
            'pending',
            :record_count,
            :created_at,
            :max_attempts
        )"
    );
    $insertBatch->execute([
        ':batch_id' => $batchId,
        ':device_sn' => $deviceSn,
        ':record_count' => count($rows),
        ':created_at' => $nowUtc,
        ':max_attempts' => HOP_B_DEFAULT_MAX_ATTEMPTS,
    ]);

    $insertItem = $pdo->prepare(
        "INSERT INTO sync_batch_item (batch_id, staging_id, source_event_key)
         VALUES (:batch_id, :staging_id, :source_event_key)"
    );

    foreach ($rows as $row) {
        $insertItem->execute([
            ':batch_id' => $batchId,
            ':staging_id' => (int) $row['id'],
            ':source_event_key' => (string) $row['source_event_key'],
        ]);
    }

    return [
        'id' => (int) $pdo->lastInsertId(),
        'batch_id' => $batchId,
        'device_sn' => $deviceSn,
        'status' => 'pending',
        'record_count' => count($rows),
        'payload_hash' => null,
        'attempt_count' => 0,
        'max_attempts' => HOP_B_DEFAULT_MAX_ATTEMPTS,
        'created_at' => $nowUtc,
        'next_retry_at' => null,
    ];
}

function hop_b_build_payload(array $batch, array $rows): array
{
    $records = [];
    $stagingIds = [];
    $sourceEventKeys = [];

    foreach ($rows as $row) {
        $records[] = hop_b_build_record($row);
        $stagingIds[] = (int) $row['id'];
        $sourceEventKeys[] = (string) $row['source_event_key'];
    }

    return [
        'schema_version' => HOP_B_SCHEMA_VERSION,
        'batch_id' => (string) $batch['batch_id'],
        'sent_at' => hop_b_format_sent_at((string) $batch['created_at']),
        'source_sdk' => HOP_B_SOURCE_SDK,
        'device_sn' => (string) $batch['device_sn'],
        'record_count' => count($records),
        'records' => $records,
        '_trace' => [
            'staging_ids' => $stagingIds,
            'source_event_keys' => $sourceEventKeys,
        ],
    ];
}

function hop_b_encode_payload(array $payload): string
{
    $wirePayload = $payload;
    unset($wirePayload['_trace']);

    return json_encode($wirePayload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function hop_b_update_payload_hash(PDO $pdo, string $batchId, string $payloadJson): void
{
    $stmt = $pdo->prepare('UPDATE sync_batch SET payload_hash = :payload_hash WHERE batch_id = :batch_id');
    $stmt->execute([
        ':payload_hash' => hash('sha256', $payloadJson),
        ':batch_id' => $batchId,
    ]);
}

function hop_b_build_retry_schedule(DateTimeImmutable $attemptedAt, int $attemptCount): array
{
    $delaySeconds = hop_b_retry_delay_seconds($attemptCount);
    $nextRetryAt = $attemptedAt->modify('+' . $delaySeconds . ' seconds');

    return [
        'delay_seconds' => $delaySeconds,
        'next_retry_at' => $nextRetryAt,
        'next_retry_at_utc' => $nextRetryAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),
        'next_retry_at_iso8601' => hop_b_iso8601_utc($nextRetryAt),
    ];
}

function hop_b_schedule_retry_failure(PDO $pdo, string $batchId, array $failure, ?DateTimeImmutable $attemptedAt = null): array
{
    $attemptedAt = $attemptedAt ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $attemptedAtUtc = $attemptedAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

    $select = $pdo->prepare('SELECT batch_id, status, attempt_count, max_attempts FROM sync_batch WHERE batch_id = :batch_id LIMIT 1');
    $select->execute([':batch_id' => $batchId]);
    $batch = $select->fetch();

    if (!$batch) {
        throw new RuntimeException("sync_batch not found for batch_id {$batchId}");
    }

    $nextAttemptCount = ((int) $batch['attempt_count']) + 1;
    $maxAttempts = (int) $batch['max_attempts'];
    $retryable = (bool) ($failure['retryable'] ?? false);
    $lastError = hop_b_build_last_error($failure);
    $httpStatusCode = isset($failure['context']['http_status_code']) && $failure['context']['http_status_code'] !== null
        ? (int) $failure['context']['http_status_code']
        : null;

    $outcome = HOP_B_OUTCOME_PERMANENT_FAILURE;
    $status = 'dead_letter';
    $retrySchedule = null;

    if ($retryable && $nextAttemptCount < $maxAttempts) {
        $outcome = HOP_B_OUTCOME_RETRY_SCHEDULED;
        $status = 'failed';
        $retrySchedule = hop_b_build_retry_schedule($attemptedAt, $nextAttemptCount);
    }

    $update = $pdo->prepare(
        'UPDATE sync_batch
         SET status = :status,
             attempt_count = :attempt_count,
             last_attempt_at = :last_attempt_at,
             next_retry_at = :next_retry_at,
             last_error = :last_error,
             http_status_code = :http_status_code
         WHERE batch_id = :batch_id'
    );
    $update->bindValue(':status', $status, PDO::PARAM_STR);
    $update->bindValue(':attempt_count', $nextAttemptCount, PDO::PARAM_INT);
    $update->bindValue(':last_attempt_at', $attemptedAtUtc, PDO::PARAM_STR);
    $update->bindValue(':next_retry_at', $retrySchedule['next_retry_at_utc'] ?? null, $retrySchedule === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $update->bindValue(':last_error', $lastError, PDO::PARAM_STR);
    $update->bindValue(':http_status_code', $httpStatusCode, $httpStatusCode === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $update->bindValue(':batch_id', $batchId, PDO::PARAM_STR);
    $update->execute();

    return [
        'batch_id' => $batchId,
        'status' => $status,
        'outcome' => $outcome,
        'attempt_count' => $nextAttemptCount,
        'max_attempts' => $maxAttempts,
        'retryable' => $retryable,
        'failure' => $failure,
        'last_error' => $lastError,
        'http_status_code' => $httpStatusCode,
        'last_attempt_at' => hop_b_iso8601_utc($attemptedAt),
        'next_retry_at' => $retrySchedule['next_retry_at_iso8601'] ?? null,
        'delay_seconds' => $retrySchedule['delay_seconds'] ?? null,
        'log_event' => $outcome === HOP_B_OUTCOME_RETRY_SCHEDULED ? HOP_B_LOG_EVENT_RETRY_SCHEDULED : HOP_B_LOG_EVENT_SEND_FAILURE,
    ];
}

function hop_b_mark_batch_sent(PDO $pdo, string $batchId, array $ack, ?DateTimeImmutable $sentAt = null): array
{
    $sentAt = $sentAt ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $sentAtUtc = $sentAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    $ackCommittedAt = trim((string) ($ack['committed_at'] ?? ''));
    $ackInsertedCount = (int) ($ack['inserted_count'] ?? 0);
    $ackDuplicateCount = (int) ($ack['duplicate_count'] ?? 0);
    $ackOutcome = (string) ($ack['outcome'] ?? '');

    $update = $pdo->prepare(
        'UPDATE sync_batch
         SET status = :status,
             attempt_count = attempt_count + 1,
             last_attempt_at = :last_attempt_at,
             next_retry_at = NULL,
             last_error = NULL,
             http_status_code = :http_status_code,
             ack_inserted_count = :ack_inserted_count,
             ack_duplicate_count = :ack_duplicate_count,
             ack_committed_at = :ack_committed_at,
             sent_at = :sent_at
         WHERE batch_id = :batch_id'
    );
    $update->bindValue(':status', 'sent', PDO::PARAM_STR);
    $update->bindValue(':last_attempt_at', $sentAtUtc, PDO::PARAM_STR);
    $update->bindValue(':http_status_code', 200, PDO::PARAM_INT);
    $update->bindValue(':ack_inserted_count', $ackInsertedCount, PDO::PARAM_INT);
    $update->bindValue(':ack_duplicate_count', $ackDuplicateCount, PDO::PARAM_INT);
    $update->bindValue(':ack_committed_at', $ackCommittedAt !== '' ? $ackCommittedAt : null, $ackCommittedAt !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
    $update->bindValue(':sent_at', $sentAtUtc, PDO::PARAM_STR);
    $update->bindValue(':batch_id', $batchId, PDO::PARAM_STR);
    $update->execute();

    $outcome = HOP_B_OUTCOME_SENT;
    if ($ackOutcome === HOP_B_OUTCOME_REPLAY) {
        $outcome = HOP_B_OUTCOME_REPLAY;
    } elseif ($ackInsertedCount === 0 && $ackDuplicateCount === 0) {
        $outcome = HOP_B_OUTCOME_NOOP;
    }

    return [
        'batch_id' => $batchId,
        'status' => 'sent',
        'outcome' => $outcome,
        'attempt_count_incremented' => true,
        'last_attempt_at' => hop_b_iso8601_utc($sentAt),
        'next_retry_at' => null,
        'ack_inserted_count' => $ackInsertedCount,
        'ack_duplicate_count' => $ackDuplicateCount,
        'ack_committed_at' => $ackCommittedAt !== '' ? $ackCommittedAt : null,
        'http_status_code' => 200,
        'log_event' => HOP_B_LOG_EVENT_SEND_RESULT,
    ];
}

function hop_b_count_batches_by_status(PDO $pdo, string $status): int
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM sync_batch WHERE status = :status');
    $stmt->execute([':status' => $status]);
    return (int) $stmt->fetchColumn();
}

function hop_b_compute_oldest_pending_age_minutes(PDO $pdo, DateTimeImmutable $now): int
{
    $stmt = $pdo->query("SELECT MIN(created_at) AS oldest_created_at FROM sync_batch WHERE status IN ('pending', 'failed')");
    $oldestCreatedAt = $stmt->fetchColumn();

    if ($oldestCreatedAt === false || $oldestCreatedAt === null || trim((string) $oldestCreatedAt) === '') {
        return 0;
    }

    $oldest = new DateTimeImmutable((string) $oldestCreatedAt, new DateTimeZone('UTC'));
    $ageSeconds = max(0, $now->getTimestamp() - $oldest->getTimestamp());
    return (int) floor($ageSeconds / 60);
}

function hop_b_find_last_successful_sync_at(PDO $pdo): ?string
{
    $stmt = $pdo->query('SELECT MAX(sent_at) FROM sync_batch WHERE status = \'sent\'');
    $sentAt = $stmt->fetchColumn();

    if ($sentAt === false || $sentAt === null || trim((string) $sentAt) === '') {
        return null;
    }

    return hop_b_iso8601_utc(new DateTimeImmutable((string) $sentAt, new DateTimeZone('UTC')));
}

function hop_b_count_recent_auth_failures(PDO $pdo): int
{
    $stmt = $pdo->query("SELECT last_error FROM sync_batch WHERE status IN ('failed', 'dead_letter') ORDER BY last_attempt_at DESC, id DESC LIMIT 20");
    $count = 0;

    while (($lastError = $stmt->fetchColumn()) !== false) {
        if (!is_string($lastError) || trim($lastError) === '') {
            break;
        }

        $decoded = json_decode($lastError, true);
        if (!is_array($decoded) || ($decoded['class'] ?? null) !== HOP_B_FAILURE_AUTH) {
            break;
        }

        $count++;
    }

    return $count;
}

function hop_b_build_status_snapshot(PDO $pdo, ?DateTimeImmutable $now = null, ?string $lastError = null): array
{
    $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $pendingCount = hop_b_count_batches_by_status($pdo, 'pending');
    $failedCount = hop_b_count_batches_by_status($pdo, 'failed');
    $deadLetterCount = hop_b_count_batches_by_status($pdo, 'dead_letter');
    $oldestPendingAgeMinutes = hop_b_compute_oldest_pending_age_minutes($pdo, $now);
    $lastSuccessfulSyncAt = hop_b_find_last_successful_sync_at($pdo);
    $recentAuthFailures = hop_b_count_recent_auth_failures($pdo);
    $status = HOP_B_STATUS_OK;

    if ($deadLetterCount > 0 || $recentAuthFailures >= HOP_B_AUTH_FAILURE_ALARM_THRESHOLD) {
        $status = HOP_B_STATUS_CRITICAL;
    } elseif ($pendingCount > 500 || $oldestPendingAgeMinutes > 60) {
        $status = HOP_B_STATUS_WARNING;
    }

    if ($status === HOP_B_STATUS_OK && $lastSuccessfulSyncAt !== null) {
        $lastSuccess = new DateTimeImmutable($lastSuccessfulSyncAt, new DateTimeZone('UTC'));
        $minutesSinceSuccess = max(0, (int) floor(($now->getTimestamp() - $lastSuccess->getTimestamp()) / 60));
        if ($minutesSinceSuccess > HOP_B_STALE_SYNC_ALARM_MINUTES) {
            $status = HOP_B_STATUS_WARNING;
        }
    }

    return [
        'last_run_at' => hop_b_iso8601_utc($now),
        'status' => $status,
        'pending_count' => $pendingCount,
        'failed_count' => $failedCount,
        'dead_letter_count' => $deadLetterCount,
        'oldest_pending_age_minutes' => $oldestPendingAgeMinutes,
        'last_successful_sync_at' => $lastSuccessfulSyncAt,
        'last_error' => $lastError,
        'recent_auth_failures' => $recentAuthFailures,
    ];
}

function hop_b_write_status_file(array $statusSnapshot, ?string $statusPath = null): void
{
    $statusPath = $statusPath ?: (getenv('EASYLINK_HOP_B_STATUS_PATH') ?: HOP_B_STATUS_FILE_DEFAULT);
    $directory = dirname($statusPath);

    if (!is_dir($directory) && !mkdir($directory, 0777, true) && !is_dir($directory)) {
        throw new RuntimeException("Unable to create status directory: {$directory}");
    }

    $tmpPath = $statusPath . '.tmp';
    $payload = json_encode($statusSnapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;

    if (file_put_contents($tmpPath, $payload, LOCK_EX) === false) {
        throw new RuntimeException("Unable to write temp status file: {$tmpPath}");
    }

    if (!rename($tmpPath, $statusPath)) {
        @unlink($tmpPath);
        throw new RuntimeException("Unable to replace status file: {$statusPath}");
    }
}

function hop_b_build_log_context(array $result): array
{
    $context = [
        'event' => (string) ($result['log_event'] ?? HOP_B_LOG_EVENT_BATCH_STATE),
        'batch_id' => (string) ($result['batch_id'] ?? ''),
        'status' => (string) ($result['status'] ?? ''),
        'outcome' => (string) ($result['outcome'] ?? ''),
        'attempt_count' => isset($result['attempt_count']) ? (int) $result['attempt_count'] : null,
        'max_attempts' => isset($result['max_attempts']) ? (int) $result['max_attempts'] : null,
        'http_status_code' => $result['http_status_code'] ?? null,
        'next_retry_at' => $result['next_retry_at'] ?? null,
        'delay_seconds' => $result['delay_seconds'] ?? null,
        'last_attempt_at' => $result['last_attempt_at'] ?? null,
        'ack_inserted_count' => $result['ack_inserted_count'] ?? null,
        'ack_duplicate_count' => $result['ack_duplicate_count'] ?? null,
        'ack_committed_at' => $result['ack_committed_at'] ?? null,
    ];

    if (!empty($result['failure']) && is_array($result['failure'])) {
        $context['failure_class'] = (string) ($result['failure']['class'] ?? '');
        $context['failure_code'] = (string) ($result['failure']['code'] ?? '');
        $context['failure_message'] = (string) ($result['failure']['message'] ?? '');
        $context['retryable'] = (bool) ($result['failure']['retryable'] ?? false);
    }

    return array_filter($context, static fn ($value) => $value !== null && $value !== '');
}

function hop_b_prepare_outbound_batch(PDO $pdo, int $batchSize = HOP_B_DEFAULT_BATCH_SIZE, ?DateTimeImmutable $now = null): ?array
{
    if ($batchSize < 1) {
        throw new InvalidArgumentException('batchSize must be >= 1');
    }

    $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $nowUtc = $now->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

    $pdo->beginTransaction();

    try {
        $selection = hop_b_load_existing_batch($pdo, 'pending', $nowUtc);

        if ($selection === null) {
            $selection = hop_b_load_existing_batch($pdo, 'failed', $nowUtc);
        }

        if ($selection === null) {
            $deviceSn = hop_b_find_candidate_device($pdo);
            if ($deviceSn === null) {
                $pdo->commit();
                return null;
            }

            $rows = hop_b_select_new_rows($pdo, $deviceSn, $batchSize);
            if ($rows === []) {
                $pdo->commit();
                return null;
            }

            $batch = hop_b_create_pending_batch($pdo, $rows, $nowUtc);
            $selection = [
                'mode' => 'new',
                'batch' => $batch,
                'rows' => $rows,
            ];
        }

        $payload = hop_b_build_payload($selection['batch'], $selection['rows']);
        $payloadJson = hop_b_encode_payload($payload);
        $payloadHash = hash('sha256', $payloadJson);
        hop_b_update_payload_hash($pdo, (string) $selection['batch']['batch_id'], $payloadJson);

        $pdo->commit();

        $selection['batch']['payload_hash'] = $payloadHash;

        return [
            'mode' => $selection['mode'],
            'batch' => $selection['batch'],
            'payload' => $payload,
            'payload_json' => $payloadJson,
            'payload_hash' => $payloadHash,
        ];
    } catch (Throwable $throwable) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $throwable;
    }
}

function hop_b_mark_batch_sending(PDO $pdo, string $batchId, ?DateTimeImmutable $attemptedAt = null): array
{
    $attemptedAt = $attemptedAt ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $attemptedAtUtc = $attemptedAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

    $select = $pdo->prepare('SELECT batch_id, status, attempt_count, max_attempts FROM sync_batch WHERE batch_id = :batch_id LIMIT 1');
    $select->execute([':batch_id' => $batchId]);
    $batch = $select->fetch();

    if (!$batch) {
        throw new RuntimeException("sync_batch not found for batch_id {$batchId}");
    }

    if (!in_array((string) $batch['status'], ['pending', 'failed'], true)) {
        throw new RuntimeException("sync_batch {$batchId} not eligible for send from status {$batch['status']}");
    }

    $update = $pdo->prepare(
        'UPDATE sync_batch
         SET status = :status,
             last_attempt_at = :last_attempt_at,
             next_retry_at = NULL
         WHERE batch_id = :batch_id'
    );
    $update->execute([
        ':status' => 'sending',
        ':last_attempt_at' => $attemptedAtUtc,
        ':batch_id' => $batchId,
    ]);

    return [
        'batch_id' => $batchId,
        'status' => 'sending',
        'attempt_count' => (int) $batch['attempt_count'],
        'max_attempts' => (int) $batch['max_attempts'],
        'last_attempt_at' => hop_b_iso8601_utc($attemptedAt),
        'log_event' => HOP_B_LOG_EVENT_BATCH_STATE,
    ];
}

function hop_b_parse_success_ack(array $decodedBody, array $payload): array
{
    $status = trim((string) ($decodedBody['status'] ?? ''));
    // Server (lib/hop-b-ingest-handler.js) nests batch fields under "ack":
    //   { status, code, message, request_id, ack: { batch_id, inserted_count, ... } }
    // Older contract doc shows a flat shape. Support both, prefer ack.* first.
    $ack = isset($decodedBody['ack']) && is_array($decodedBody['ack']) ? $decodedBody['ack'] : [];
    $ackBatchId = trim((string) ($ack['batch_id'] ?? $decodedBody['batch_id'] ?? ''));
    $expectedBatchId = (string) $payload['batch_id'];

    if (!in_array($status, ['accepted', 'ok'], true)) {
        throw new RuntimeException('ack status invalid');
    }

    if ($ackBatchId === '' || $ackBatchId !== $expectedBatchId) {
        throw new RuntimeException('ack batch_id mismatch');
    }

    $inserted    = $ack['inserted_count']  ?? $decodedBody['inserted_count']  ?? $decodedBody['accepted']  ?? null;
    $duplicates  = $ack['duplicate_count'] ?? $decodedBody['duplicate_count'] ?? $decodedBody['duplicates'] ?? null;
    $committedAt = $ack['committed_at']    ?? $decodedBody['committed_at']    ?? null;

    if (!is_int($inserted) && !ctype_digit((string) $inserted)) {
        throw new RuntimeException('ack inserted count missing');
    }

    if (!is_int($duplicates) && !ctype_digit((string) $duplicates)) {
        throw new RuntimeException('ack duplicate count missing');
    }

    $inserted = (int) $inserted;
    $duplicates = (int) $duplicates;

    if ($inserted < 0 || $duplicates < 0) {
        throw new RuntimeException('ack counts invalid');
    }

    if (($inserted + $duplicates) !== (int) $payload['record_count']) {
        throw new RuntimeException('ack counts mismatch record_count');
    }

    $committedAtUtc = hop_b_iso8601_to_utc_sql(is_string($committedAt) ? $committedAt : null);
    if ($committedAtUtc === null) {
        throw new RuntimeException('ack committed_at missing or invalid');
    }

    return [
        'status' => $status,
        'batch_id' => $ackBatchId,
        'inserted_count' => $inserted,
        'duplicate_count' => $duplicates,
        'committed_at' => $committedAtUtc,
        'request_id' => trim((string) ($decodedBody['request_id'] ?? '')) ?: null,
    ];
}

function hop_b_send_http_batch(array $payload, string $payloadJson, ?string $ingestUrl = null, ?string $authToken = null, ?int $timeoutSeconds = null): array
{
    $ingestUrl = trim((string) ($ingestUrl ?? getenv('HOP_B_INGEST_URL') ?: ''));
    if ($ingestUrl === '') {
        throw new InvalidArgumentException('HOP_B_INGEST_URL required');
    }

    $authToken = (string) ($authToken ?? getenv('HOP_B_AUTH_TOKEN') ?: '');
    if ($authToken === '') {
        throw new InvalidArgumentException('HOP_B_AUTH_TOKEN required');
    }

    $timeoutSeconds = max(1, $timeoutSeconds ?? (int) (getenv('HOP_B_HTTP_TIMEOUT_SECONDS') ?: HOP_B_DEFAULT_HTTP_TIMEOUT_SECONDS));
    $requestId = hop_b_uuid_v4();
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $ingestUrl,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payloadJson,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min($timeoutSeconds, 10),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $authToken,
            'X-Request-Id: ' . $requestId,
            'X-Sent-At: ' . (string) $payload['sent_at'],
        ],
    ]);

    $responseBody = curl_exec($ch);
    $httpStatusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErrno = curl_errno($ch);
    $curlError = curl_error($ch);
    curl_close($ch);

    return [
        'request_id' => $requestId,
        'http_status_code' => $httpStatusCode > 0 ? (int) $httpStatusCode : null,
        'response_body' => is_string($responseBody) ? $responseBody : null,
        'curl_errno' => $curlErrno > 0 ? $curlErrno : null,
        'curl_error' => $curlError !== '' ? $curlError : null,
    ];
}

function hop_b_finalize_send_success(PDO $pdo, string $batchId, array $ack, int $httpStatusCode, ?string $responseBody, ?DateTimeImmutable $sentAt = null): array
{
    $sentAt = $sentAt ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $sentAtUtc = $sentAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    $responseExcerpt = hop_b_response_excerpt($responseBody);

    $update = $pdo->prepare(
        'UPDATE sync_batch
         SET status = :status,
             attempt_count = attempt_count + 1,
             last_attempt_at = :last_attempt_at,
             next_retry_at = NULL,
             last_error = NULL,
             last_error_class = NULL,
             last_error_code = NULL,
             last_error_retryable = NULL,
             last_error_at = NULL,
             http_status_code = :http_status_code,
             last_response_body = :last_response_body,
             ack_status = :ack_status,
             ack_inserted_count = :ack_inserted_count,
             ack_duplicate_count = :ack_duplicate_count,
             ack_committed_at = :ack_committed_at,
             ack_request_id = :ack_request_id,
             ack_response_body = :ack_response_body,
             sent_at = :sent_at
         WHERE batch_id = :batch_id'
    );
    $update->bindValue(':status', 'sent', PDO::PARAM_STR);
    $update->bindValue(':last_attempt_at', $sentAtUtc, PDO::PARAM_STR);
    $update->bindValue(':http_status_code', $httpStatusCode, PDO::PARAM_INT);
    $update->bindValue(':last_response_body', $responseExcerpt, $responseExcerpt === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $update->bindValue(':ack_status', (string) $ack['status'], PDO::PARAM_STR);
    $update->bindValue(':ack_inserted_count', (int) $ack['inserted_count'], PDO::PARAM_INT);
    $update->bindValue(':ack_duplicate_count', (int) $ack['duplicate_count'], PDO::PARAM_INT);
    $update->bindValue(':ack_committed_at', (string) $ack['committed_at'], PDO::PARAM_STR);
    $update->bindValue(':ack_request_id', $ack['request_id'], $ack['request_id'] === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $update->bindValue(':ack_response_body', $responseExcerpt, $responseExcerpt === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $update->bindValue(':sent_at', $sentAtUtc, PDO::PARAM_STR);
    $update->bindValue(':batch_id', $batchId, PDO::PARAM_STR);
    $update->execute();

    return [
        'batch_id' => $batchId,
        'status' => 'sent',
        'outcome' => HOP_B_OUTCOME_SENT,
        'attempt_count_incremented' => true,
        'last_attempt_at' => hop_b_iso8601_utc($sentAt),
        'next_retry_at' => null,
        'ack_inserted_count' => (int) $ack['inserted_count'],
        'ack_duplicate_count' => (int) $ack['duplicate_count'],
        'ack_committed_at' => hop_b_iso8601_utc(new DateTimeImmutable((string) $ack['committed_at'], new DateTimeZone('UTC'))),
        'ack_request_id' => $ack['request_id'],
        'http_status_code' => $httpStatusCode,
        'log_event' => HOP_B_LOG_EVENT_SEND_RESULT,
    ];
}

function hop_b_finalize_send_failure(PDO $pdo, string $batchId, array $failure, ?int $httpStatusCode, ?string $responseBody, ?DateTimeImmutable $attemptedAt = null): array
{
    $attemptedAt = $attemptedAt ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $attemptedAtUtc = $attemptedAt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    $responseExcerpt = hop_b_response_excerpt($responseBody);

    $select = $pdo->prepare('SELECT batch_id, status, attempt_count, max_attempts FROM sync_batch WHERE batch_id = :batch_id LIMIT 1');
    $select->execute([':batch_id' => $batchId]);
    $batch = $select->fetch();

    if (!$batch) {
        throw new RuntimeException("sync_batch not found for batch_id {$batchId}");
    }

    $nextAttemptCount = ((int) $batch['attempt_count']) + 1;
    $maxAttempts = (int) $batch['max_attempts'];
    $retryable = (bool) ($failure['retryable'] ?? false);
    $lastError = hop_b_build_last_error($failure);

    $outcome = HOP_B_OUTCOME_PERMANENT_FAILURE;
    $status = 'dead_letter';
    $retrySchedule = null;

    if ($retryable && $nextAttemptCount < $maxAttempts) {
        $outcome = HOP_B_OUTCOME_RETRY_SCHEDULED;
        $status = 'failed';
        $retrySchedule = hop_b_build_retry_schedule($attemptedAt, $nextAttemptCount);
    }

    $update = $pdo->prepare(
        'UPDATE sync_batch
         SET status = :status,
             attempt_count = :attempt_count,
             last_attempt_at = :last_attempt_at,
             next_retry_at = :next_retry_at,
             last_error = :last_error,
             last_error_class = :last_error_class,
             last_error_code = :last_error_code,
             last_error_retryable = :last_error_retryable,
             last_error_at = :last_error_at,
             http_status_code = :http_status_code,
             last_response_body = :last_response_body,
             ack_status = NULL,
             ack_inserted_count = NULL,
             ack_duplicate_count = NULL,
             ack_committed_at = NULL,
             ack_request_id = NULL,
             ack_response_body = NULL
         WHERE batch_id = :batch_id'
    );
    $update->bindValue(':status', $status, PDO::PARAM_STR);
    $update->bindValue(':attempt_count', $nextAttemptCount, PDO::PARAM_INT);
    $update->bindValue(':last_attempt_at', $attemptedAtUtc, PDO::PARAM_STR);
    $update->bindValue(':next_retry_at', $retrySchedule['next_retry_at_utc'] ?? null, $retrySchedule === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $update->bindValue(':last_error', $lastError, PDO::PARAM_STR);
    $update->bindValue(':last_error_class', (string) $failure['class'], PDO::PARAM_STR);
    $update->bindValue(':last_error_code', (string) $failure['code'], PDO::PARAM_STR);
    $update->bindValue(':last_error_retryable', $retryable ? 1 : 0, PDO::PARAM_INT);
    $update->bindValue(':last_error_at', $attemptedAtUtc, PDO::PARAM_STR);
    $update->bindValue(':http_status_code', $httpStatusCode, $httpStatusCode === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $update->bindValue(':last_response_body', $responseExcerpt, $responseExcerpt === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $update->bindValue(':batch_id', $batchId, PDO::PARAM_STR);
    $update->execute();

    return [
        'batch_id' => $batchId,
        'status' => $status,
        'outcome' => $outcome,
        'attempt_count' => $nextAttemptCount,
        'max_attempts' => $maxAttempts,
        'retryable' => $retryable,
        'failure' => $failure,
        'last_error' => $lastError,
        'http_status_code' => $httpStatusCode,
        'last_attempt_at' => hop_b_iso8601_utc($attemptedAt),
        'next_retry_at' => $retrySchedule['next_retry_at_iso8601'] ?? null,
        'delay_seconds' => $retrySchedule['delay_seconds'] ?? null,
        'log_event' => $outcome === HOP_B_OUTCOME_RETRY_SCHEDULED ? HOP_B_LOG_EVENT_RETRY_SCHEDULED : HOP_B_LOG_EVENT_SEND_FAILURE,
    ];
}

function hop_b_send_prepared_batch(PDO $pdo, array $preparedBatch, ?DateTimeImmutable $now = null, ?string $ingestUrl = null, ?string $authToken = null, ?int $timeoutSeconds = null): array
{
    $batchId = (string) $preparedBatch['payload']['batch_id'];
    $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));

    $pdo->beginTransaction();
    try {
        $sendState = hop_b_mark_batch_sending($pdo, $batchId, $now);
        $pdo->commit();
    } catch (Throwable $throwable) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $throwable;
    }

    $sendResult = hop_b_send_http_batch($preparedBatch['payload'], $preparedBatch['payload_json'], $ingestUrl, $authToken, $timeoutSeconds);
    $finalizedAt = $now->modify('+1 second');
    $httpStatusCode = $sendResult['http_status_code'];
    $responseBody = $sendResult['response_body'];

    $pdo->beginTransaction();
    try {
        if ($httpStatusCode !== null && $httpStatusCode >= 200 && $httpStatusCode < 300) {
            $decoded = is_string($responseBody) ? json_decode($responseBody, true) : null;
            if (!is_array($decoded)) {
                $failure = hop_b_build_failure_record(
                    HOP_B_FAILURE_INGEST,
                    'ACK_INVALID_JSON',
                    'ack response missing valid JSON body',
                    true,
                    [
                        'http_status_code' => $httpStatusCode,
                        'response_excerpt' => hop_b_response_excerpt($responseBody, 300),
                    ]
                );
                $result = hop_b_finalize_send_failure($pdo, $batchId, $failure, $httpStatusCode, $responseBody, $finalizedAt);
            } else {
                try {
                    $ack = hop_b_parse_success_ack($decoded, $preparedBatch['payload']);
                    $result = hop_b_finalize_send_success($pdo, $batchId, $ack, $httpStatusCode, $responseBody, $finalizedAt);
                } catch (Throwable $throwable) {
                    $failure = hop_b_build_failure_record(
                        HOP_B_FAILURE_INGEST,
                        'ACK_INVALID',
                        $throwable->getMessage(),
                        true,
                        [
                            'http_status_code' => $httpStatusCode,
                            'response_excerpt' => hop_b_response_excerpt($responseBody, 300),
                        ]
                    );
                    $result = hop_b_finalize_send_failure($pdo, $batchId, $failure, $httpStatusCode, $responseBody, $finalizedAt);
                }
            }
        } else {
            $failure = hop_b_classify_ingest_failure($httpStatusCode, $responseBody, $sendResult['curl_error'], $sendResult['curl_errno']);
            $result = hop_b_finalize_send_failure($pdo, $batchId, $failure, $httpStatusCode, $responseBody, $finalizedAt);
        }

        $pdo->commit();
    } catch (Throwable $throwable) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $throwable;
    }

    $result['request_id'] = $sendResult['request_id'];
    $result['sent_headers'] = [
        'Authorization' => 'Bearer <redacted>',
        'X-Request-Id' => $sendResult['request_id'],
        'X-Sent-At' => (string) $preparedBatch['payload']['sent_at'],
    ];
    $result['send_state'] = $sendState;

    return $result;
}

function hop_b_parse_cli_options(array $args): array
{
    $options = [
        'batch-size' => HOP_B_DEFAULT_BATCH_SIZE,
        'dsn' => null,
        'db-user' => null,
        'db-pass' => null,
        'now' => null,
        'trace' => false,
    ];

    foreach ($args as $arg) {
        if (preg_match('/^--batch-size=(\d+)$/', $arg, $matches) === 1) {
            $options['batch-size'] = (int) $matches[1];
            continue;
        }

        if (str_starts_with($arg, '--dsn=')) {
            $options['dsn'] = substr($arg, 6);
            continue;
        }

        if (str_starts_with($arg, '--db-user=')) {
            $options['db-user'] = substr($arg, 10);
            continue;
        }

        if (str_starts_with($arg, '--db-pass=')) {
            $options['db-pass'] = substr($arg, 10);
            continue;
        }

        if (str_starts_with($arg, '--now=')) {
            $options['now'] = substr($arg, 6);
            continue;
        }

        if ($arg === '--trace') {
            $options['trace'] = true;
        }
    }

    return $options;
}

function hop_b_run_worker_cycle(PDO $pdo, int $batchSize = HOP_B_DEFAULT_BATCH_SIZE, ?DateTimeImmutable $now = null): array
{
    $now = $now ?: new DateTimeImmutable('now', new DateTimeZone('UTC'));

    $result = [
        'status' => 'ok',
        'outcome' => HOP_B_OUTCOME_NOOP,
        'batch_id' => null,
        'mode' => null,
        'send_result' => null,
        'status_snapshot' => null,
    ];

    try {
        $prepared = hop_b_prepare_outbound_batch($pdo, $batchSize, $now);

        if ($prepared === null) {
            $snapshot = hop_b_build_status_snapshot($pdo, $now, null);
            hop_b_write_status_file($snapshot);
            $result['status_snapshot'] = $snapshot;
            return $result;
        }

        $sendResult = hop_b_send_prepared_batch($pdo, $prepared, $now);
        $snapshotError = null;
        if (!empty($sendResult['failure']) && is_array($sendResult['failure'])) {
            $snapshotError = hop_b_build_last_error($sendResult['failure']);
        }

        $snapshot = hop_b_build_status_snapshot($pdo, $now, $snapshotError);
        hop_b_write_status_file($snapshot);

        $result['batch_id'] = $prepared['batch']['batch_id'] ?? null;
        $result['mode'] = $prepared['mode'] ?? null;
        $result['outcome'] = $sendResult['outcome'] ?? HOP_B_OUTCOME_NOOP;
        $result['send_result'] = $sendResult;
        $result['status_snapshot'] = $snapshot;

        if (($sendResult['outcome'] ?? '') === HOP_B_OUTCOME_PERMANENT_FAILURE) {
            $result['status'] = 'warning';
        }

        return $result;
    } catch (Throwable $throwable) {
        $snapshot = hop_b_build_status_snapshot($pdo, $now, $throwable->getMessage());
        hop_b_write_status_file($snapshot);

        return [
            'status' => 'error',
            'outcome' => HOP_B_OUTCOME_NOOP,
            'batch_id' => null,
            'mode' => null,
            'send_result' => null,
            'status_snapshot' => $snapshot,
            'error' => $throwable->getMessage(),
        ];
    }
}

function hop_b_main(): void
{
    $args = array_slice($GLOBALS['argv'] ?? [], 1);
    $options = hop_b_parse_cli_options($args);
    $now = $options['now']
        ? new DateTimeImmutable($options['now'], new DateTimeZone('UTC'))
        : new DateTimeImmutable('now', new DateTimeZone('UTC'));

    $pdo = hop_b_get_pdo($options['dsn'], $options['db-user'], $options['db-pass']);

    if (in_array('--worker-run', $args, true)) {
        $output = hop_b_run_worker_cycle($pdo, (int) $options['batch-size'], $now);
        echo json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        return;
    }

    $result = hop_b_prepare_outbound_batch($pdo, (int) $options['batch-size'], $now);

    if ($result === null) {
        echo json_encode(['status' => 'empty'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        return;
    }

    $output = [
        'mode' => $result['mode'],
        'payload_hash' => $result['payload_hash'],
        'payload' => $result['payload'],
    ];

    if (!$options['trace']) {
        unset($output['payload']['_trace']);
    }

    echo json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
}


if (PHP_SAPI === 'cli' && realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    hop_b_main();
}
