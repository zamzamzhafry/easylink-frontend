# ===================== CONFIG =====================
$base   = "http://192.168.1.111:8090"
$sn     = "Fio66208021230737"
$from   = "2026-03-26 00:00:00"
$to     = "2026-03-27 23:59:59"
$limit  = 100
$port   = 8080
$outDir = "$env:USERPROFILE\scanlog-viewer"
# ==================================================

# Buat folder output
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# --- Fetch Scanlog ---
$fromEnc = [uri]::EscapeDataString($from)
$toEnc   = [uri]::EscapeDataString($to)

Write-Host "Fetching scanlog..." -ForegroundColor Cyan
$res = Invoke-WebRequest -Method POST `
  -Uri "$base/scanlog/new?sn=$sn&limit=$limit&from=$fromEnc&to=$toEnc" `
  -Body "sn=$sn" `
  -ContentType "application/x-www-form-urlencoded" `
  -UseBasicParsing -TimeoutSec 20

# --- Fetch Device Info ---
Write-Host "Fetching device info..." -ForegroundColor Cyan
$devRes = Invoke-WebRequest -Method POST `
  -Uri "$base/dev/info" `
  -Body "sn=$sn" `
  -ContentType "application/x-www-form-urlencoded" `
  -UseBasicParsing -TimeoutSec 20

# --- Simpan Raw JSON ---
$res.Content    | Out-File "$outDir\scanlog.json" -Encoding utf8
$devRes.Content | Out-File "$outDir\devinfo.json" -Encoding utf8
Write-Host "JSON saved to $outDir" -ForegroundColor Green

# --- Parse untuk HTML ---
$scanJson = $res.Content | ConvertFrom-Json
$devJson  = $devRes.Content | ConvertFrom-Json

$tableRows = ""
if ($scanJson.Result -and $scanJson.Data) {
    foreach ($row in $scanJson.Data) {
        $tableRows += "<tr><td>$($row.ScanDate)</td><td>$($row.PIN)</td><td>$($row.VerifyMode)</td><td>$($row.IOMode)</td><td>$($row.WorkCode)</td></tr>`n"
    }
} else {
    $tableRows = "<tr><td colspan='5' style='text-align:center;color:#888'>No data available</td></tr>"
}

$devInfoHtml = ""
if ($devJson.Result) {
    $d = $devJson.DEVINFO
    $devInfoHtml = @"
    <div class="devinfo">
      <span>📟 Display: <b>$($d.Display)</b></span>
      <span>👤 User: <b>$($d.User)</b></span>
      <span>🖐 FP: <b>$($d.FP)</b></span>
      <span>😊 Face: <b>$($d.Face)</b></span>
      <span>🔑 PWD: <b>$($d.PWD)</b></span>
      <span>📊 Presensi: <b>$($d.Presensi)</b></span>
      <span>⚙️ Operasional: <b>$($d.Operasional)</b></span>
    </div>
"@
}

# --- Generate HTML ---
$html = @"
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Scanlog Viewer</title>
  <style>
    body { font-family: Segoe UI, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
    h1   { color: #1a1a2e; }
    .devinfo { display: flex; flex-wrap: wrap; gap: 12px; background: #fff;
               padding: 14px 20px; border-radius: 10px; margin-bottom: 20px;
               box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .devinfo span { background: #e8f0fe; padding: 6px 12px; border-radius: 20px; font-size: 14px; }
    table  { width: 100%; border-collapse: collapse; background: #fff;
             border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    th     { background: #1a73e8; color: white; padding: 12px 16px; text-align: left; }
    td     { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    tr:hover td { background: #f8f9ff; }
    .badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .meta  { color: #666; font-size: 13px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>📋 Scanlog Viewer</h1>
  <p class="meta">SN: <b>$sn</b> &nbsp;|&nbsp; Range: <b>$from</b> → <b>$to</b> &nbsp;|&nbsp; Generated: <b>$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</b></p>
  $devInfoHtml
  <table>
    <thead>
      <tr><th>Scan Date</th><th>PIN</th><th>Verify Mode</th><th>IO Mode</th><th>Work Code</th></tr>
    </thead>
    <tbody>
      $tableRows
    </tbody>
  </table>
  <p class="meta" style="margin-top:12px">Raw JSON: <a href="/scanlog.json">scanlog.json</a> | <a href="/devinfo.json">devinfo.json</a></p>
</body>
</html>
"@

$html | Out-File "$outDir\index.html" -Encoding utf8

# --- Simple HTTP Server ---
Write-Host "`nStarting viewer at http://localhost:$port" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor Yellow

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

while ($listener.IsListening) {
    $ctx      = $listener.GetContext()
    $reqPath  = $ctx.Request.Url.LocalPath

    $fileMap = @{
        "/"             = "$outDir\index.html"
        "/index.html"   = "$outDir\index.html"
        "/scanlog.json" = "$outDir\scanlog.json"
        "/devinfo.json" = "$outDir\devinfo.json"
    }

    if ($fileMap.ContainsKey($reqPath)) {
        $filePath    = $fileMap[$reqPath]
        $contentType = if ($reqPath -like "*.json") { "application/json" } else { "text/html" }
        $bytes       = [System.IO.File]::ReadAllBytes($filePath)
        $ctx.Response.ContentType     = $contentType
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}