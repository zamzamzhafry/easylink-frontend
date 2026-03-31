# ============================================================
#  EasyLink SDK - PowerShell Client ULTIMATE v4.0
#  All-in-One: Production Ready + Safe Paging + All Endpoints
# ============================================================

param(
    [string]$BaseUrl = "http://192.168.1.111:8090",
    [string]$SerialNumber = "Fio66208021230737",
    [string]$OutputDir = "$PWD\output"
)

# Ensure output directory exists
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$Global:BaseUrl = $BaseUrl.TrimEnd('/')
$Global:SerialNumber = $SerialNumber
$Global:OutputDir = $OutputDir

# ─────────────────────────────────────────────────────────────
#  CORE FUNCTIONS
# ─────────────────────────────────────────────────────────────
function Write-Log {
    param(
        [string]$Message, 
        [ValidateSet('INFO','WARN','ERROR','OK','STEP')]
        [string]$Level = 'INFO'
    )
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
    $color = switch ($Level) {
        'INFO'  { 'Gray' }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red' }
        'OK'    { 'Green' }
        'STEP'  { 'Cyan' }
    }
    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

function Save-Json {
    param(
        [object]$Data, 
        [string]$FileName, 
        [string]$Comment = ''
    )
    $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
    $path = Join-Path $Global:OutputDir "$FileName`_$ts.json"
    $Data | ConvertTo-Json -Depth 20 | Out-File -FilePath $path -Encoding utf8
    Write-Log "💾 Tersimpan: $path $(if ($Comment) { "[$Comment]" })" 'OK'
}

function Print-Header {
    param([string]$Title)
    $line = "═" * ($Title.Length + 4)
    Write-Host "`n╔$line╗" -ForegroundColor Cyan
    Write-Host "║  $Title  ║" -ForegroundColor Cyan
    Write-Host "╚$line╝" -ForegroundColor Cyan
}

function Invoke-EasyLink {
    param(
        [string]$Endpoint, 
        [string]$Body = "", 
        [string]$QueryStr = "", 
        [int]$Timeout = 60
    )
    
    $uri = "$Global:BaseUrl$Endpoint"
    if ($QueryStr) { $uri += "?$QueryStr" }
    
    # Default body injects Serial Number if not provided
    if (-not $Body) { $Body = "sn=$Global:SerialNumber" }

    Write-Log "POST $uri" 'STEP'
    if ($Body.Length -gt 100) { Write-Log "Body: $($Body.Substring(0,100))..." 'INFO' } 
    else { Write-Log "Body: $Body" 'INFO' }

    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $res = Invoke-WebRequest -Method POST -Uri $uri -Body $Body -ContentType "application/x-www-form-urlencoded" -UseBasicParsing -TimeoutSec $Timeout
        $sw.Stop()
        
        Write-Log "HTTP OK $([math]::Round($sw.Elapsed.TotalSeconds,2))s | $($res.StatusCode)" 'OK'
        $json = $res.Content | ConvertFrom-Json
        
        if ($json.Result) { 
            Write-Log "Result=True | Data Count: $($json.Data.Count)" 'OK' 
        } else {
            $msg = if ($json.message) { $json.message } else { 'No message' }
            Write-Log "Result=False | $msg" 'WARN'
        }
        return $json
    } catch {
        Write-Log "HTTP FAILED $([math]::Round($sw.Elapsed.TotalSeconds,2))s" 'ERROR'
        Write-Log $_.Exception.Message 'ERROR'
        return $null
    }
}

# ─────────────────────────────────────────────────────────────
#  SECTION 1 : DEVICE INFO & TIME
# ─────────────────────────────────────────────────────────────
function Get-DeviceInfo { 
    Print-Header "DEVICE INFO"
    $json = Invoke-EasyLink -Endpoint "/dev/info" -Timeout 30
    if ($json -and $json.Result -and $json.DEVINFO) {
        $json.DEVINFO | Format-List
        Save-Json -Data $json -FileName "device-info" -Comment "Full device info"
    }
}

function Test-DeviceTime {
    Print-Header 'DEVICE TIME SYNC'
    $localTime = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $json = Invoke-EasyLink -Endpoint '/dev/time' -Timeout 30

    if ($json -and $json.Result -and $json.DEV_TIME) {
        $deviceTime = $json.DEV_TIME.DevTime
        Write-Host "Local time:  $localTime" -ForegroundColor White
        Write-Host "Device time: $deviceTime" -ForegroundColor Yellow

        $diff = (Get-Date $deviceTime) - (Get-Date $localTime)
        $diffSec = [math]::Round($diff.TotalSeconds, 0)
        Write-Host "Difference: ${diffSec}s" -ForegroundColor $(if ([math]::Abs($diffSec) -gt 60) { 'Red' } else { 'Green' })
    }
}

function Sync-DateTime {
    Print-Header "SYNC DATE TIME"
    $json = Invoke-EasyLink -Endpoint "/dev/settime" -Timeout 30
    if ($json -and $json.Result) {
        Write-Host "  Waktu berhasil disinkronkan ke mesin." -ForegroundColor Green
    }
}

# ─────────────────────────────────────────────────────────────
#  SECTION 2 : SCANLOG
# ─────────────────────────────────────────────────────────────
function Get-ScanlogNew {
    param(
        [string]$From = "",
        [string]$To = "",
        [int]$Limit = 100
    )
    Print-Header "SCANLOG TERBARU (FIXED)"
    
    if (-not $From) { $From = (Get-Date -Day 1 -Format "yyyy-MM-dd") + " 00:00:00" }
    if (-not $To)   { $To = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") }

    $fromEnc = [uri]::EscapeDataString($From)
    $toEnc   = [uri]::EscapeDataString($To)
    $qs      = "sn=$Global:SerialNumber&limit=$Limit&from=$fromEnc&to=$toEnc"

    $json = Invoke-EasyLink -Endpoint "/scanlog/new" -QueryStr $qs -Timeout 120
    if ($json -and $json.Result -and $json.Data) {
        $json.Data | Select-Object ScanDate, PIN, VerifyMode, IOMode, WorkCode | Format-Table -AutoSize
        Save-Json -Data $json -FileName "scanlog-new" -Comment "Range $From to $To"
    }
}

function Get-ScanlogAll {
    param(
        [int]$Limit = 50,
        [int]$MaxPages = 100
    )
    Print-Header "SCANLOG SEMUA (SAFE PAGING)"
    $allData = New-Object System.Collections.ArrayList
    
    for ($page = 1; $page -le $MaxPages; $page++) {
        Write-Log "Fetching Scanlog Page $page (limit=$Limit)..." 'STEP'
        $json = Invoke-EasyLink -Endpoint "/scanlog/all/paging" -Body "sn=$Global:SerialNumber&limit=$Limit" -Timeout 180
        
        if (-not $json -or -not $json.Result -or -not $json.Data -or $json.Data.Count -eq 0) {
            Write-Log "Tidak ada data scanlog lagi atau terjadi error." 'WARN'
            break
        }

        foreach ($row in $json.Data) { [void]$allData.Add($row) }
        Save-Json -Data $allData -FileName "scanlog-partial" -Comment "Page $page"
        
        if ($json.Data.Count -lt $Limit) {
            Write-Log "Halaman terakhir tercapai." 'INFO'
            break
        }
        Start-Sleep -Milliseconds 800
    }

    if ($allData.Count -gt 0) {
        Save-Json -Data $allData -FileName "scanlog-all-final" -Comment "Total $($allData.Count) records"
        $allData | Select-Object ScanDate, PIN, VerifyMode, IOMode | Format-Table -AutoSize
    }
}

function Get-ScanlogGPS {
    param([string]$ByDate = (Get-Date -Format "yyyy-MM-dd"))
    Print-Header "SCANLOG GPS (FiO)"
    
    # Note: GPS requires sn=0 in the body based on old SDK
    $json = Invoke-EasyLink -Endpoint "/scanlog/GPS" -Body "sn=0&by_date=$ByDate" -Timeout 60
    
    if ($json -and $json.Result -and $json.Data) {
        $json.Data | Format-Table ScanDate, PIN, VerifyMode, IOMode -AutoSize
        Save-Json -Data $json -FileName "scanlog-gps" -Comment "Date: $ByDate"
    }
}

# ─────────────────────────────────────────────────────────────
#  SECTION 3 : USER MANAGEMENT
# ─────────────────────────────────────────────────────────────
function Get-UserAll-Safe {
    param(
        [int]$Limit = 10,
        [int]$MaxPages = 200
    )
    Print-Header "USERS ALL (SAFE PAGING)"
    $allData = New-Object System.Collections.ArrayList
    
    for ($page = 1; $page -le $MaxPages; $page++) {
        Write-Log "Fetching Users Page $page (limit=$Limit)..." 'STEP'
        $json = Invoke-EasyLink -Endpoint "/user/all/paging" -Body "sn=$Global:SerialNumber&limit=$Limit" -Timeout 200
        
        if (-not $json -or -not $json.Result -or -not $json.Data -or $json.Data.Count -eq 0) {
            Write-Log "Tidak ada data user lagi atau terjadi error." 'WARN'
            break
        }

        foreach ($user in $json.Data) { [void]$allData.Add($user) }
        Save-Json -Data $allData -FileName "users-partial" -Comment "Page $page"
        
        if ($json.Data.Count -lt $Limit) {
            Write-Log "Halaman terakhir user tercapai." 'INFO'
            break
        }
        Start-Sleep -Milliseconds 600
    }

    if ($allData.Count -gt 0) {
        Save-Json -Data $allData -FileName "users-all-final" -Comment "Total $($allData.Count) users"
        $allData | Select-Object PIN, Name, RFID, Password, Privilege | Format-Table -AutoSize
    }
}

function Set-User {
    param(
        [string]$Pin,
        [string]$Nama = "",
        [string]$Pwd = "",
        [string]$Rfid = "",
        [int]$Priv = 0
    )
    Print-Header "UPLOAD USER"
    
    $namaEnc = [uri]::EscapeDataString($Nama)
    $pwdEnc  = [uri]::EscapeDataString($Pwd)
    $body = "sn=$Global:SerialNumber&pin=$Pin&nama=$namaEnc&pwd=$pwdEnc&rfid=$Rfid&priv=$Priv&tmp="
    
    $json = Invoke-EasyLink -Endpoint "/user/set" -Body $body -Timeout 60
    if ($json -and $json.Result) {
        Write-Host "  User PIN=$Pin berhasil diupload." -ForegroundColor Green
    }
}

# ─────────────────────────────────────────────────────────────
#  SECTION 4 : DANGER ZONE
# ─────────────────────────────────────────────────────────────
function Remove-UserByPin {
    param([string]$Pin)
    Write-Host "`n⚠️  Menghapus user PIN=$Pin..." -ForegroundColor Yellow
    $json = Invoke-EasyLink -Endpoint "/user/del" -Body "sn=$Global:SerialNumber&pin=$Pin" -Timeout 60
    if ($json -and $json.Result) { Write-Host "  User PIN=$Pin berhasil dihapus." -ForegroundColor Green }
}

function Remove-UserAll {
    Write-Host "`n⚠️  Menghapus SEMUA user di mesin..." -ForegroundColor Yellow
    $json = Invoke-EasyLink -Endpoint "/user/delall" -Timeout 120
    if ($json -and $json.Result) { Write-Host "  Semua user berhasil dihapus." -ForegroundColor Green }
}

function Remove-ScanlogAll {
    Write-Host "`n⚠️  Menghapus SEMUA scanlog di mesin..." -ForegroundColor Yellow
    $json = Invoke-EasyLink -Endpoint "/scanlog/del" -Timeout 120
    if ($json -and $json.Result) { Write-Host "  Scanlog berhasil dihapus." -ForegroundColor Green }
}

function Remove-DeviceLog {
    Write-Host "`n⚠️  Menghapus semua device log operasional..." -ForegroundColor Yellow
    $json = Invoke-EasyLink -Endpoint "/log/del" -Timeout 60
    if ($json -and $json.Result) { Write-Host "  Device log berhasil dihapus." -ForegroundColor Green }
}

function Remove-Admin {
    Write-Host "`n⚠️  Menghapus hak akses admin di mesin..." -ForegroundColor Yellow
    $json = Invoke-EasyLink -Endpoint "/dev/deladmin" -Timeout 60
    if ($json -and $json.Result) { Write-Host "  Admin berhasil dihapus." -ForegroundColor Green }
}

function Initialize-Device {
    Write-Host "`n🚨 PERINGATAN: Ini akan menghapus SEMUA data di mesin (Factory Reset)!" -ForegroundColor Red
    $confirm = Read-Host "   Ketik YES untuk konfirmasi"
    if ($confirm -cne "YES") {
        Write-Host "  Dibatalkan." -ForegroundColor Yellow
        return
    }
    $json = Invoke-EasyLink -Endpoint "/dev/init" -Timeout 120
    if ($json -and $json.Result) { Write-Host "  Inisialisasi mesin berhasil." -ForegroundColor Green }
}

# ─────────────────────────────────────────────────────────────
#  INTERACTIVE MENU
# ─────────────────────────────────────────────────────────────
function Show-Menu {
    Clear-Host
    Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║  EasyLink ULTIMATE v4.0 - Production + Agentic Ready ║" -ForegroundColor Magenta
    Write-Host "║  $Global:BaseUrl | SN: $Global:SerialNumber" -ForegroundColor Gray
    Write-Host "║  Output: $Global:OutputDir" -ForegroundColor Gray
    Write-Host "╠══════════════════════════════════════════════════════╣" -ForegroundColor Magenta
    Write-Host "║  [1] Device Info        [8] Upload User              ║"
    Write-Host "║  [2] Device Time Check  [9] Sync Date Time           ║"
    Write-Host "║  [3] Scanlog New Fixed                               ║"
    Write-Host "║  [4] Scanlog All (Paging)                            ║"
    Write-Host "║  [5] Scanlog GPS        [DANGER ZONE 👇]             ║"
    Write-Host "║  [6] Users All (Paging) [10] Hapus User by PIN       ║"
    Write-Host "║                         [11] Hapus Semua User        ║"
    Write-Host "║                         [12] Hapus Scanlog           ║"
    Write-Host "║                         [13] Hapus Device Log        ║"
    Write-Host "║                         [14] Delete Admin            ║"
    Write-Host "║                         [15] Initialization (RESET)  ║"
    Write-Host "║ ──────────────────────────────────────────────────── ║"
    Write-Host "║  [0] Exit                                            ║"
    Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Magenta
}

# ─────────────────────────────────────────────────────────────
#  MAIN LOOP
# ─────────────────────────────────────────────────────────────
do {
    Show-Menu
    $choice = Read-Host "`nPilih menu"

    switch ($choice) {
        "1"  { Get-DeviceInfo; Read-Host 'Press Enter to continue' }
        "2"  { Test-DeviceTime; Read-Host 'Press Enter to continue' }
        "3"  {
                $from  = Read-Host "  From (yyyy-MM-dd HH:mm:ss, Enter=awal bulan)"
                $to    = Read-Host "  To   (yyyy-MM-dd HH:mm:ss, Enter=sekarang)"
                $limit = Read-Host "  Limit (default 100)"
                if (-not $limit) { $limit = 100 }
                Get-ScanlogNew -From $from -To $to -Limit ([int]$limit)
                Read-Host 'Press Enter to continue'
             }
        "4"  {
                $limit = Read-Host "  Limit per page (default 50)"
                if (-not $limit) { $limit = 50 }
                Get-ScanlogAll -Limit ([int]$limit)
                Read-Host 'Press Enter to continue'
             }
        "5"  {
                $date = Read-Host "  Tanggal GPS (yyyy-MM-dd, default hari ini)"
                if (-not $date) { $date = (Get-Date -Format "yyyy-MM-dd") }
                Get-ScanlogGPS -ByDate $date
                Read-Host 'Press Enter to continue'
             }
        "6"  {
                $limit = Read-Host "  Limit per page (default 10)"
                if (-not $limit) { $limit = 10 }
                Get-UserAll-Safe -Limit ([int]$limit)
                Read-Host 'Press Enter to continue'
             }
        "8"  {
                $pin  = Read-Host "  PIN"
                $nama = Read-Host "  Nama"
                $pwd  = Read-Host "  Password (kosongkan=skip)"
                $rfid = Read-Host "  RFID     (kosongkan=skip)"
                $priv = Read-Host "  Privilege 0=user/14=admin (default 0)"
                if (-not $priv) { $priv = 0 }
                Set-User -Pin $pin -Nama $nama -Pwd $pwd -Rfid $rfid -Priv ([int]$priv)
                Read-Host 'Press Enter to continue'
             }
        "9"  { Sync-DateTime; Read-Host 'Press Enter to continue' }
        "10" {
                $pin = Read-Host "  PIN yang akan dihapus"
                Remove-UserByPin -Pin $pin
                Read-Host 'Press Enter to continue'
             }
        "11" { Remove-UserAll; Read-Host 'Press Enter to continue' }
        "12" { Remove-ScanlogAll; Read-Host 'Press Enter to continue' }
        "13" { Remove-DeviceLog; Read-Host 'Press Enter to continue' }
        "14" { Remove-Admin; Read-Host 'Press Enter to continue' }
        "15" { Initialize-Device; Read-Host 'Press Enter to continue' }
        "0"  { Write-Host "`nSampai jumpa!" -ForegroundColor Green }
        default { Write-Host "  Pilihan tidak valid." -ForegroundColor Yellow; Start-Sleep 1 }
    }

} while ($choice -ne "0")