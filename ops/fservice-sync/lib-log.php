<?php
/**
 * EasyLink shared logging helper.
 *
 * Writes structured log lines to a daily-rotated file. No external deps,
 * no rotation infra — file name embeds date for trivial daily rollover.
 *
 * Log path resolution (in order):
 *   1. EASYLINK_SYNC_LOG_DIR env var (e.g. C:\EasyLinkOps\logs)
 *   2. <repo>/ops/fservice-sync/logs/  (auto-created)
 *
 * File name: sync-YYYY-MM-DD.log
 *
 * Line format:
 *   [UTC YYYY-MM-DD HH:MM:SS] [LEVEL] [channel] message {"k":"v",...}
 *
 * Levels: DEBUG, INFO, WARN, ERROR, FATAL
 */

if (!function_exists('el_log_dir')) {
    function el_log_dir(): string {
        $dir = getenv('EASYLINK_SYNC_LOG_DIR');
        if (!$dir) {
            $dir = __DIR__ . DIRECTORY_SEPARATOR . 'logs';
        }
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return rtrim($dir, "\\/");
    }
}

if (!function_exists('el_log_path')) {
    function el_log_path(): string {
        return el_log_dir() . DIRECTORY_SEPARATOR . 'sync-' . gmdate('Y-m-d') . '.log';
    }
}

if (!function_exists('el_log')) {
    /**
     * Write a single log line.
     *
     * @param string $level    DEBUG|INFO|WARN|ERROR|FATAL
     * @param string $channel  short tag, e.g. "bridge", "hop-b", "sync"
     * @param string $message  human-readable message
     * @param array  $context  k/v pairs appended as JSON
     */
    function el_log(string $level, string $channel, string $message, array $context = []): void {
        $ts   = gmdate('Y-m-d H:i:s');
        $lvl  = strtoupper($level);
        $ch   = $channel ?: '-';
        $json = empty($context) ? '' : ' ' . json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $line = "[UTC {$ts}] [{$lvl}] [{$ch}] {$message}{$json}" . PHP_EOL;

        // Best-effort: never throw from a logger.
        @file_put_contents(el_log_path(), $line, FILE_APPEND | LOCK_EX);

        // Also echo to STDOUT in CLI mode so existing CLI flow still works.
        if (PHP_SAPI === 'cli') {
            echo "[{$lvl}] {$ch}: {$message}" . PHP_EOL;
        }
    }
}

if (!function_exists('el_log_tail')) {
    /**
     * Tail the last N lines from today's log file.
     * Returns lines newest-last.
     */
    function el_log_tail(int $lines = 200): array {
        $path = el_log_path();
        if (!is_file($path)) return [];
        $size = filesize($path);
        if ($size === 0) return [];

        $chunk = 8192;
        $fp = fopen($path, 'rb');
        if (!$fp) return [];

        $buf = '';
        $pos = $size;
        $found = 0;
        while ($pos > 0 && $found <= $lines) {
            $read = min($chunk, $pos);
            $pos -= $read;
            fseek($fp, $pos);
            $buf = fread($fp, $read) . $buf;
            $found = substr_count($buf, "\n");
        }
        fclose($fp);

        $all = preg_split('/\r?\n/', rtrim($buf, "\r\n"));
        if (count($all) > $lines) {
            $all = array_slice($all, -$lines);
        }
        return $all;
    }
}
