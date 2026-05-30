<?php

declare(strict_types=1);

if ($argc < 4) {
    fwrite(STDERR, "usage: php hop-b-test-server.php <status-code> <response-json> <port-file>\n");
    exit(2);
}

$statusCode = (int) $argv[1];
$responseJson = (string) $argv[2];
if (str_starts_with($responseJson, 'base64:')) {
    $decoded = base64_decode(substr($responseJson, 7), true);
    if ($decoded !== false) {
        $responseJson = $decoded;
    }
}
$portFile = (string) $argv[3];
$statusTextMap = [
    200 => 'OK',
    400 => 'Bad Request',
    401 => 'Unauthorized',
    403 => 'Forbidden',
    409 => 'Conflict',
    500 => 'Internal Server Error',
];
$statusText = $statusTextMap[$statusCode] ?? 'Response';

$server = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
if ($server === false) {
    fwrite(STDERR, "server failed: {$errstr}\n");
    exit(1);
}

$name = stream_socket_get_name($server, false);
$port = (int) substr((string) $name, strrpos((string) $name, ':') + 1);
if (file_put_contents($portFile, (string) $port) === false) {
    fwrite(STDERR, "port file write failed\n");
    fclose($server);
    exit(1);
}

$conn = @stream_socket_accept($server, 10);
if ($conn === false) {
    fclose($server);
    @unlink($portFile);
    exit(1);
}

$request = '';
while (!str_contains($request, "\r\n\r\n")) {
    $chunk = fread($conn, 1024);
    if ($chunk === '' || $chunk === false) {
        break;
    }
    $request .= $chunk;
}

$parts = explode("\r\n\r\n", $request, 2);
$headers = $parts[0] ?? '';
$body = $parts[1] ?? '';
if (preg_match('/Content-Length:\s*(\d+)/i', $headers, $matches) === 1) {
    $remaining = (int) $matches[1] - strlen($body);
    while ($remaining > 0) {
        $chunk = fread($conn, $remaining);
        if ($chunk === '' || $chunk === false) {
            break;
        }
        $body .= $chunk;
        $remaining -= strlen($chunk);
    }
}

$response = "HTTP/1.1 {$statusCode} {$statusText}\r\n"
    . "Content-Type: application/json\r\n"
    . 'Content-Length: ' . strlen($responseJson) . "\r\n"
    . "Connection: close\r\n\r\n"
    . $responseJson;

fwrite($conn, $response);
fclose($conn);
fclose($server);
@unlink($portFile);
