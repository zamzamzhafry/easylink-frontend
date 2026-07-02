<?php
/**
 * HOP B wire contract — mirrors lib/hop-b-ingest-contract.js exactly.
 *
 * ONE source of truth (per context) for: schema version, source SDK id,
 * source_event_key formula, and the field-name map. The VM (Next.js) validates
 * incoming batches against the same formula; this module lets the Windows
 * sender validate BEFORE send (fail-fast) so contract drift is caught on the
 * sender, not as a non-retryable 409 dead-letter storm on the receiver.
 *
 * source_event_key = [device_sn, scan_date, scan_time, pin, verify_mode,
 *                     io_mode, workcode] joined by '|'.
 * MUST match lib/hop-b-ingest-contract.js buildHopBSourceEventKey().
 *
 * Field map (Windows staging column -> HOP B field -> VM canonical):
 *   sn          -> device_sn   -> sn
 *   scan_date   -> scan_date   -> scan_date        (YYYY-MM-DD)
 *   scan_time   -> scan_time   -> scan_time        (HH:MM:SS)
 *   pin         -> pin         -> pin
 *   verifymode  -> verify_mode -> verifymode
 *   iomode      -> io_mode     -> iomode
 *   workcode    -> workcode    -> workcode
 */

declare(strict_types=1);

const HOP_B_SCHEMA_VERSION = '1.0.0';
const HOP_B_SOURCE_SDK = 'fservice-hop-b';

/**
 * Build the canonical source_event_key. Arguments mirror the HOP B record
 * field names (device_sn, scan_date, scan_time, pin, verify_mode, io_mode,
 * workcode). verify/io/work accept int or numeric string — coerced to int
 * so "1" and 1 produce the same key (matches JS join behavior).
 */
function hop_b_build_source_event_key(
    string $deviceSn,
    string $scanDate,
    string $scanTime,
    string $pin,
    $verifyMode,
    $ioMode,
    $workcode
): string {
    return implode('|', [
        $deviceSn,
        $scanDate,
        $scanTime,
        $pin,
        (int) $verifyMode,
        (int) $ioMode,
        (int) $workcode,
    ]);
}

/**
 * Pre-send contract assertion for one record. Returns null if valid,
 * or a human-readable violation string. Mirrors the VM validator's
 * per-record checks (validateRecord in lib/hop-b-ingest-contract.js).
 *
 * $record must have keys: device_sn, scan_date, scan_time, pin,
 * verify_mode, io_mode, workcode, source_event_key.
 */
function hop_b_assert_record_contract(array $record): ?string {
    $deviceSn = trim((string) ($record['device_sn'] ?? ''));
    $scanDate = trim((string) ($record['scan_date'] ?? ''));
    $scanTime = trim((string) ($record['scan_time'] ?? ''));
    $pin      = trim((string) ($record['pin'] ?? ''));
    $key      = trim((string) ($record['source_event_key'] ?? ''));

    if ($deviceSn === '') return 'device_sn required';
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $scanDate) !== 1) return 'scan_date must be YYYY-MM-DD';
    if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $scanTime) !== 1) return 'scan_time must be HH:MM:SS';
    if ($pin === '') return 'pin required';
    if (!is_int($record['verify_mode'] ?? null) && !ctype_digit((string) ($record['verify_mode'] ?? '')))
        return 'verify_mode must be integer';
    if (!is_int($record['io_mode'] ?? null) && !ctype_digit((string) ($record['io_mode'] ?? '')))
        return 'io_mode must be integer';
    if (!is_int($record['workcode'] ?? null) && !ctype_digit((string) ($record['workcode'] ?? '')))
        return 'workcode must be integer';
    if ($key === '') return 'source_event_key required';

    $expected = hop_b_build_source_event_key(
        $deviceSn, $scanDate, $scanTime, $pin,
        $record['verify_mode'], $record['io_mode'], $record['workcode']
    );
    if ($key !== $expected) return 'source_event_key mismatch (expected ' . $expected . ')';

    return null;
}
