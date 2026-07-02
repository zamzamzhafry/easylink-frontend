<?php
/**
 * Deep device-HTTP module for the FService bridge (FService.exe :8090).
 *
 * ONE place owns: per-endpoint request shape (query string vs POST body),
 * curl execution, JSON decode, raw-snippet logging. Previously duplicated
 * 3x (worker.php w_bridge_post, sync.php bridge_post, web/index.php bridge_post).
 *
 * Contract (verified 1:1 vs docs/learning/easylink.ps1):
 *   /scanlog/new         -> params as QUERY STRING (sn+limit+from+to), empty body
 *   /scanlog/all/paging  -> params as POST BODY
 *   /user/all/paging     -> params as POST BODY
 *   /dev/info, /dev/*    -> params as POST BODY
 * Globalizing either shape breaks the other endpoints.
 *
 * Return shape: ['ok'=>bool, 'data'=>array|null, 'error'=>string, 'http'=>int, 'raw'=>string]
 * Callers that want null-on-fail (legacy sync.php) wrap bridge_http_post().
 */

declare(strict_types=1);

/**
 * Per-endpoint shape table. Returns true if $path sends params as query string.
 * Add new query-only endpoints here when (if) firmware diverges.
 */
function bridge_http_uses_query_string(string $path): bool {
    return $path === '/scanlog/new';
}

/**
 * POST to the FService bridge. $machine must have bridge_host, bridge_port, sn.
 * $fields is merged with sn. $timeoutSec overrides global default when given.
 * $logTag controls the el_log component label (caller context).
 */
function bridge_http_post(array $machine, string $path, array $fields = [], ?int $timeoutSec = null, string $logTag = 'bridge'): array {
    $baseUrl = 'http://' . ($machine['bridge_host'] ?? '') . ':' . ($machine['bridge_port'] ?? 8090);
    $fields['sn'] = $machine['sn'] ?? '';

    if (bridge_http_uses_query_string($path)) {
        $url  = $baseUrl . $path . '?' . http_build_query($fields);
        $body = '';
    } else {
        $url  = $baseUrl . $path;
        $body = http_build_query($fields);
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeoutSec ?? 120,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    $rawSnippet = is_string($resp) ? substr($resp, 0, 500) : '(non-string)';
    el_log('DEBUG', $logTag, "POST $path", [
        'url'       => $url,
        'http'      => $code,
        'curl_err'  => $err !== '' ? $err : null,
        'body_len'  => is_string($resp) ? strlen($resp) : 0,
        'body_head' => $rawSnippet,
        'fields'    => array_diff_key($fields, ['sn' => 1]),
        'machine'   => $machine['label'] ?? null,
    ]);

    if ($resp === false) {
        el_log('ERROR', $logTag, "$path curl failed", ['curl_err' => $err, 'http' => $code]);
        return ['ok' => false, 'error' => $err ?: 'curl failed', 'data' => null, 'http' => $code, 'raw' => $rawSnippet];
    }
    $json = json_decode($resp, true);
    if (!is_array($json)) {
        el_log('ERROR', $logTag, "$path non-JSON", ['http' => $code, 'body_head' => $rawSnippet]);
        return ['ok' => false, 'error' => 'Non-JSON response', 'data' => null, 'http' => $code, 'raw' => $rawSnippet];
    }
    return ['ok' => true, 'data' => $json, 'error' => null, 'http' => $code, 'raw' => $rawSnippet];
}
