<?php
/**
 * Deep scanlog sync flow — the "fetch pages from FService → stage into
 * raw_scanlog_staging" algorithm, owned in ONE place.
 *
 * Previously triplicated (worker.php run_sync_scanlogs, sync.php sync_scanlogs,
 * web/index.php sync_scanlogs_to_db) with drift between them (page param,
 * no-data detection, fetched fallback). This is the canonical flow; the three
 * callers now delegate here.
 *
 * Ownership model (C4): Windows ONLY stages into raw_scanlog_staging + pushes
 * via hop-b. It no longer dual-writes local demo_easylinksdk.tb_scanlog — the
 * VM scanlog-legacy-mirror is the sole tb_scanlog writer (from safe_events).
 * Verified: nothing on the Windows side reads tb_scanlog between sync+push.
 *
 * Push + pull BOTH remain intentional (C3 decision): Windows push (hop-b) is
 * primary; VM direct-pull (/api/scanlog/sync, /api/scanlog/hop-b-sync) is a
 * documented fallback for when Windows is offline. Not competing paths.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib-bridge-http.php';
require_once __DIR__ . '/lib-hop-b-contract.php';

/**
 * Stage one scan row into raw_scanlog_staging. Best-effort: logs on failure,
 * never throws (staging must not fail the sync). Returns true if a new row
 * was staged (rowCount > 0), false otherwise.
 *
 * $stage may be null (bridge DB unavailable) → no-op, returns false.
 */
function stage_scan_row(
    ?PDOStatement $stage,
    string $sn,
    string $scanDateTs,
    string $pin,
    int $verify,
    int $io,
    int $work
): bool {
    if (!$stage) return false;
    $ts = $scanDateTs !== '' ? strtotime($scanDateTs) : false;
    if ($ts === false) {
        el_log('WARN', 'stage', 'skip unparseable scan_date', ['raw' => $scanDateTs, 'pin' => $pin]);
        return false;
    }
    $date = date('Y-m-d', $ts);
    $time = date('H:i:s', $ts);
    $key  = hop_b_build_source_event_key($sn, $date, $time, $pin, $verify, $io, $work);
    try {
        $stage->execute([
            ':sn'      => $sn,
            ':sd'      => $date,
            ':st'      => $time,
            ':pin'     => $pin,
            ':vm'      => $verify,
            ':io'      => $io,
            ':wc'      => $work,
            ':sek'     => $key,
            ':fetched' => $scanDateTs !== '' ? $scanDateTs : date('Y-m-d H:i:s'),
        ]);
        return $stage->rowCount() > 0;
    } catch (\Throwable $e) {
        el_log('WARN', 'stage', 'stage insert failed', ['err' => $e->getMessage(), 'key' => $key]);
        return false;
    }
}

/**
 * Fetch scanlog pages from the FService bridge and stage each row.
 *
 * @param array    $machine    bridge_host, bridge_port, sn, (label)
 * @param ?PDO     $bridgePdo  easylink_bridge connection (staging). null = skip staging.
 * @param bool     $full       true = /scanlog/all/paging (paged); false = /scanlog/new
 * @param ?callable $onProgress function(int $total): void — called per page (worker uses for job_set_progress)
 * @return array{total:int, staged:int, errors:string[]}
 */
function sync_scanlogs_flow(array $machine, ?PDO $bridgePdo, bool $full = false, ?callable $onProgress = null): array {
    $endpoint = $full ? '/scanlog/all/paging' : '/scanlog/new';
    $total = 0; $staged = 0; $errors = []; $page = 1; $isSession = true;

    $stage = $bridgePdo
        ? $bridgePdo->prepare(
            "INSERT IGNORE INTO raw_scanlog_staging
               (sn, scan_date, scan_time, pin, verifymode, iomode, workcode, source_event_key, fetched_at)
             VALUES (:sn,:sd,:st,:pin,:vm,:io,:wc,:sek,:fetched)")
        : null;

    while ($isSession) {
        // /scanlog/new uses from/to/limit (no page); /scanlog/all/paging uses page+limit.
        // Per-endpoint request shape lives in lib-bridge-http (query vs body).
        $reqFields = ['limit' => 100];
        if ($full) { $reqFields['page'] = $page; }
        $r = bridge_http_post($machine, $endpoint, $reqFields, 120, 'sync');
        if (!$r['ok']) { $errors[] = $r['error'] ?? 'bridge fail'; break; }
        $data = $r['data'] ?? [];
        if (empty($data['Result'])) {
            $msg = (string) ($data['message'] ?? '');
            // "No data" / "tidak ada" is success-with-empty, not error.
            if (preg_match('/no data|none of data array|tidak/i', $msg)) {
                el_log('INFO', 'sync', 'scanlogs: no more data', ['sn' => $machine['sn'] ?? '?']);
            } else {
                $errors[] = "device: $msg";
            }
            break;
        }
        foreach (($data['Data'] ?? []) as $row) {
            $sn  = (string) ($row['SN'] ?? $machine['sn']);
            $sd  = (string) ($row['ScanDate'] ?? '');
            $pin = (string) ($row['PIN'] ?? '');
            $vm  = (int) ($row['VerifyMode'] ?? 0);
            $io  = (int) ($row['IOMode'] ?? 0);
            $wc  = (int) ($row['WorkCode'] ?? 0);
            if (stage_scan_row($stage, $sn, $sd, $pin, $vm, $io, $wc)) { $staged++; }
            $total++;
        }
        if ($onProgress) { $onProgress($total); }
        if ($full) { $page++; }
        $isSession = !empty($data['IsSession']);
    }

    return ['total' => $total, 'staged' => $staged, 'errors' => $errors];
}
