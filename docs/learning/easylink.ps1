# ============================================================
#  EasyLink SDK - PowerShell Client v2.0
#  Target: http://192.168.1.111:8090
#  SN    : Fio66208021230737
# ============================================================

$BASE    = "http://192.168.1.111:8090"
$SN      = "Fio66208021230737"
$OUTDIR  = "$env:USERPROFILE\scanlog-viewer"
New-Item -ItemType Directory -Force -Path $OUTDIR | Out-Null

# ─────────────────────────────────────────────────────────────
#  CORE HTTP HELPER
# ─────────────────────────────────────────────────────────────
function Invoke-EasyLink {
    param(
        [string]   $Endpoint,
        [string]   $Body      = "",
        [string]   $QueryStr  = "",
        [int]      $Timeout   = 30
    )

    $uri = "$BASE$Endpoint"
    if ($QueryStr) { $uri += "?$QueryStr" }
    if (!$Body)    { $Body = "sn=$SN" }

    try {
        $res = Invoke-WebRequest -Method POST `
            -Uri $uri `
            -Body $Body `
            -ContentType "application/x-www-form-urlencoded" `
            -UseBasicParsing `
            -TimeoutSec $Timeout
        return $res.Content | ConvertFrom-Json
    } catch {
        Write-Host "  [ERROR] $Endpoint => $_" -ForegroundColor Red
        return $null
    }
}

function Save-Json {
    param([object]$Data, [string]$FileName)
    $path = "$OUTDIR\$FileName"
    $Data | ConvertTo-Json -Depth 10 | Out-File $path -Encoding utf8
    Write-Host "  💾 Disimpan: $path" -ForegroundColor DarkGreen
}

function Print-Header {
    param([string]$Title)
    $line = "═" * ($Title.Length + 4)
    Write-Host "`n╔$line╗" -ForegroundColor Cyan
    Write-Host "║  $Title  ║" -ForegroundColor Cyan
    Write-Host "╚$line╝" -ForegroundColor Cyan
}

# ─────────────────────────────────────────────────────────────
#  1. DEVICE INFO
# ─────────────────────────────────────────────────────────────
function Get-DeviceInfo {
    Print-Header "DEVICE INFO"
    $json = Invoke-EasyLink "/dev/info" -Timeout 30

    if ($json -and $json.Result) {
        $d = $json.DEVINFO
        Write-Host ""
        Write-Host "  Display      : $($d.Display)"      -ForegroundColor White
        Write-Host "  Algoritma    : $($d.Algoritma)"    -ForegroundColor White
        Write-Host "  Admin        : $($d.Admin)"        -ForegroundColor White
        Write-Host "  User         : $($d.User)"         -ForegroundColor Green
        Write-Host "  Fingerprint  : $($d.FP)"           -ForegroundColor Green
        Write-Host "  Face         : $($d.Face)"         -ForegroundColor Green
        Write-Host "  Password     : $($d.PWD)"          -ForegroundColor White
        Write-Host "  Operasional  : $($d.Operasional)"  -ForegroundColor White
        Write-Host "  Presensi     : $($d.Presensi)"     -ForegroundColor Green
        Save-Json $json "devinfo.json"
    } else {
        Write-Host "  Gagal mendapatkan info mesin." -ForegroundColor Red
    }
    return $json
}

# ─────────────────────────────────────────────────────────────
#  2. SCANLOG TERBARU
# ─────────────────────────────────────────────────────────────
function Get-ScanlogNew {
    Print-Header "SCANLOG TERBARU"

    $from  = Read-Host "  From (yyyy-MM-dd HH:mm:ss, Enter=awal bulan ini)"
    $to    = Read-Host "  To   (yyyy-MM-dd HH:mm:ss, Enter=hari ini)"
    $limit = Read-Host "  Limit (Enter=100)"

    if (!$from)  { $from  = (Get-Date -Day 1  -Format "yyyy-MM-dd") + " 00:00:00" }
    if (!$to)    { $to    = (Get-Date          -Format "yyyy-MM-dd") + " 23:59:59" }
    if (!$limit) { $limit = 100 }

    Write-Host "  Range : $from  →  $to" -ForegroundColor DarkCyan

    $fromEnc = [uri]::EscapeDataString($from)
    $toEnc   = [uri]::EscapeDataString($to)
    $qs      = "sn=$SN&limit=$limit&from=$fromEnc&to=$toEnc"

    $json = Invoke-EasyLink "/scanlog/new" -QueryStr $qs -Timeout 60

    if ($json -and $json.Result) {
        Write-Host "  ✅ Total record : $($json.Data.Count)" -ForegroundColor Green
        $json.Data | Format-Table ScanDate, PIN, VerifyMode, IOMode, WorkCode -AutoSize
        Save-Json $json "scanlog_new.json"
    } else {
        Write-Host "  Tidak ada data baru. ($($json.message))" -ForegroundColor Yellow
    }
    return $json
}

# ─────────────────────────────────────────────────────────────
#  3. SCANLOG SEMUA (PAGING LOOP)
# ─────────────────────────────────────────────────────────────
function Get-ScanlogAll {
    Print-Header "SCANLOG SEMUA (PAGING)"

    $limitInput = Read-Host "  Limit per page (Enter=50)"
    $limit      = if ($limitInput) { [int]$limitInput } else { 50 }

    $allData = @()
    $page    = 1

    do {
        Write-Host "  Fetching page $page..." -ForegroundColor DarkCyan
        $json = Invoke-EasyLink "/scanlog/all/paging" `
            -Body "sn=$SN&limit=$limit" `
            -Timeout 120

        if (-not $json -or -not $json.Result -or $json.Data.Count -eq 0) {
            Write-Host "  Tidak ada data lagi." -ForegroundColor Yellow
            break
        }

        $allData += $json.Data
        Write-Host "  Page $page : +$($json.Data.Count) record (total: $($allData.Count))" -ForegroundColor Green

        if ($json.Data.Count -lt $limit) { break }
        $page++
        Start-Sleep -Milliseconds 500
    } while ($true)

    if ($allData.Count -gt 0) {
        Write-Host "`n  ✅ Total scanlog: $($allData.Count)" -ForegroundColor Green
        $allData | Format-Table ScanDate, PIN, VerifyMode, IOMode, WorkCode -AutoSize
        Save-Json $allData "scanlog_all.json"
    }
    return $allData
}

# ─────────────────────────────────────────────────────────────
#  4. SCANLOG GPS
# ─────────────────────────────────────────────────────────────
function Get-ScanlogGPS {
    Print-Header "SCANLOG GPS (Fingerspot.iO)"

    $dateInput = Read-Host "  Tanggal (yyyy-MM-dd, Enter=hari ini)"
    $byDate    = if ($dateInput) { $dateInput } else { Get-Date -Format "yyyy-MM-dd" }

    Write-Host "  Tanggal: $byDate" -ForegroundColor DarkCyan

    # SN wajib 0 untuk GPS
    $json = Invoke-EasyLink "/scanlog/GPS" `
        -Body "sn=0&by_date=$byDate" `
        -Timeout 60

    if ($json -and $json.Result) {
        Write-Host "  ✅ Total GPS scan: $($json.Data.Count)" -ForegroundColor Green
        $json.Data | Format-Table ScanDate, PIN, VerifyMode, IOMode -AutoSize
        Save-Json $json "scanlog_gps_$($byDate -replace '-','').json"
    } else {
        Write-Host "  Tidak ada data GPS untuk tanggal $byDate." -ForegroundColor Yellow
    }
    return $json
}

# ─────────────────────────────────────────────────────────────
#  5. DOWNLOAD USER (PAGING LOOP)
# ─────────────────────────────────────────────────────────────
function Get-UserAll {
    Print-Header "DOWNLOAD USER (PAGING)"

    $limitInput = Read-Host "  Limit per page (Enter=10, kecil agar tidak timeout)"
    $limit      = if ($limitInput) { [int]$limitInput } else { 10 }

    $allData = @()
    $page    = 1

    do {
        Write-Host "  Fetching page $page (limit=$limit)..." -ForegroundColor DarkCyan

        $json = Invoke-EasyLink "/user/all/paging" `
            -Body "sn=$SN&limit=$limit" `
            -Timeout 120   # besar karena ada template FP base64

        if (-not $json -or -not $json.Result -or $json.Data.Count -eq 0) {
            Write-Host "  Tidak ada data lagi." -ForegroundColor Yellow
            break
        }

        $allData += $json.Data
        Write-Host "  Page $page : +$($json.Data.Count) user (total: $($allData.Count))" -ForegroundColor Green

        if ($json.Data.Count -lt $limit) { break }
        $page++
        Start-Sleep -Milliseconds 500
    } while ($true)

    if ($allData.Count -gt 0) {
        Write-Host "`n  ✅ Total user: $($allData.Count)" -ForegroundColor Green
        $allData | Select-Object PIN, Name, RFID, Password, Privilege | Format-Table -AutoSize
        Save-Json $allData "users.json"
    }
    return $allData
}

# ─────────────────────────────────────────────────────────────
#  6. UPLOAD USER
# ─────────────────────────────────────────────────────────────
function Set-User {
    Print-Header "UPLOAD USER"

    $pin  = Read-Host "  PIN  (wajib)"
    if (!$pin) { Write-Host "  PIN tidak boleh kosong." -ForegroundColor Red; return }

    $nama = Read-Host "  Nama"
    $pwd  = Read-Host "  Password (kosongkan=skip)"
    $rfid = Read-Host "  RFID     (kosongkan=skip)"
    $priv = Read-Host "  Privilege: 0=User / 14=Admin (Enter=0)"
    if (!$priv) { $priv = 0 }

    $body = "sn=$SN&pin=$([uri]::EscapeDataString($pin))" +
            "&nama=$([uri]::EscapeDataString($nama))" +
            "&pwd=$([uri]::EscapeDataString($pwd))" +
            "&rfid=$([uri]::EscapeDataString($rfid))" +
            "&priv=$priv&tmp="

    $json = Invoke-EasyLink "/user/set" -Body $body -Timeout 60

    if ($json -and $json.Result) {
        Write-Host "  ✅ User PIN=$pin berhasil diupload." -ForegroundColor Green
    } else {
        Write-Host "  Gagal upload user PIN=$pin." -ForegroundColor Red
    }
    return $json
}

# ─────────────────────────────────────────────────────────────
#  7. SYNC DATETIME
# ─────────────────────────────────────────────────────────────
function Sync-DateTime {
    Print-Header "SYNC DATE TIME"

    # Retry 3x karena kadang FService perlu warm-up
    for ($i = 1; $i -le 3; $i++) {
        Write-Host "  Attempt $i/3..." -ForegroundColor DarkCyan
        $json = Invoke-EasyLink "/dev/settime" -Timeout 30

        if ($json -and $json.Result) {
            Write-Host "  ✅ Waktu mesin berhasil disinkronkan ke: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
            return $json
        }
        Write-Host "  Gagal, tunggu 3 detik..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
    Write-Host "  ❌ Semua retry gagal. Pastikan mesin online & FService jalan sebagai Admin." -ForegroundColor Red
}

# ─────────────────────────────────────────────────────────────
#  DANGER ZONE
# ─────────────────────────────────────────────────────────────
function Confirm-Danger {
    param([string]$Action)
    Write-Host "`n  ⚠️  PERINGATAN: $Action" -ForegroundColor Red
    $c = Read-Host "  Ketik YES untuk konfirmasi"
    return ($c -eq "YES")
}

function Remove-UserByPin {
    Print-Header "HAPUS USER BY PIN"
    $pin = Read-Host "  PIN yang akan dihapus"
    if (!(Confirm-Danger "Hapus user PIN=$pin dari mesin?")) { Write-Host "  Dibatalkan." -ForegroundColor Yellow; return }
    $json = Invoke-EasyLink "/user/del" -Body "sn=$SN&pin=$pin" -Timeout 30
    if ($json -and $json.Result) { Write-Host "  ✅ User PIN=$pin dihapus." -ForegroundColor Green }
    else { Write-Host "  Gagal hapus user." -ForegroundColor Red }
}

function Remove-UserAll {
    Print-Header "HAPUS SEMUA USER"
    if (!(Confirm-Danger "Hapus SEMUA user di mesin?")) { Write-Host "  Dibatalkan." -ForegroundColor Yellow; return }
    $json = Invoke-EasyLink "/user/delall" -Timeout 60
    if ($json -and $json.Result) { Write-Host "  ✅ Semua user dihapus." -ForegroundColor Green }
    else { Write-Host "  Gagal hapus semua user." -ForegroundColor Red }
}

function Remove-ScanlogAll {
    Print-Header "HAPUS SCANLOG"
    if (!(Confirm-Danger "Hapus SEMUA scanlog di mesin?")) { Write-Host "  Dibatalkan." -ForegroundColor Yellow; return }
    $json = Invoke-EasyLink "/scanlog/del" -Timeout 60
    if ($json -and $json.Result) { Write-Host "  ✅ Scanlog dihapus." -ForegroundColor Green }
    else { Write-Host "  Gagal hapus scanlog." -ForegroundColor Red }
}

function Remove-DeviceLog {
    Print-Header "HAPUS DEVICE LOG"
    if (!(Confirm-Danger "Hapus semua log operasional mesin?")) { Write-Host "  Dibatalkan." -ForegroundColor Yellow; return }
    $json = Invoke-EasyLink "/log/del" -Timeout 30
    if ($json -and $json.Result) { Write-Host "  ✅ Device log dihapus." -ForegroundColor Green }
    else { Write-Host "  Gagal hapus device log." -ForegroundColor Red }
}

function Remove-Admin {
    Print-Header "DELETE ADMIN"
    if (!(Confirm-Danger "Hapus hak akses admin di mesin?")) { Write-Host "  Dibatalkan." -ForegroundColor Yellow; return }
    $json = Invoke-EasyLink "/dev/deladmin" -Timeout 30
    if ($json -and $json.Result) { Write-Host "  ✅ Admin dihapus." -ForegroundColor Green }
    else { Write-Host "  Gagal hapus admin." -ForegroundColor Red }
}

function Initialize-Device {
    Print-Header "INITIALIZATION"
    Write-Host "  🚨 Ini akan menghapus SEMUA data user, scanlog & operasional!" -ForegroundColor Red
    if (!(Confirm-Danger "INISIALISASI TOTAL mesin?")) { Write-Host "  Dibatalkan." -ForegroundColor Yellow; return }
    $json = Invoke-EasyLink "/dev/init" -Timeout 60
    if ($json -and $json.Result) { Write-Host "  ✅ Mesin berhasil diinisialisasi." -ForegroundColor Green }
    else { Write-Host "  Gagal inisialisasi." -ForegroundColor Red }
}

# ─────────────────────────────────────────────────────────────
#  MAIN MENU
# ─────────────────────────────────────────────────────────────
function Show-Menu {
    Write-Host "`n╔══════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║    EasyLink SDK - PowerShell Client v2   ║" -ForegroundColor Magenta
    Write-Host "║  Server : $BASE   ║" -ForegroundColor DarkGray
    Write-Host "║  SN     : $SN  ║" -ForegroundColor DarkGray
    Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Magenta
    Write-Host "║  [1]  Device Info                        ║"
    Write-Host "║  [2]  Scanlog Terbaru                    ║"
    Write-Host "║  [3]  Scanlog Semua (paging)             ║"
    Write-Host "║  [4]  Scanlog GPS (Fingerspot.iO)        ║"
    Write-Host "║  [5]  Download User (paging)             ║"
    Write-Host "║  [6]  Upload User                        ║"
    Write-Host "║  [7]  Sync Date Time                     ║"
    Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor DarkRed
    Write-Host "║  [8]  Hapus User by PIN            ⚠️    ║" -ForegroundColor DarkRed
    Write-Host "║  [9]  Hapus Semua User             ⚠️    ║" -ForegroundColor DarkRed
    Write-Host "║  [10] Hapus Scanlog                ⚠️    ║" -ForegroundColor DarkRed
    Write-Host "║  [11] Hapus Device Log             ⚠️    ║" -ForegroundColor DarkRed
    Write-Host "║  [12] Delete Admin                 ⚠️    ║" -ForegroundColor DarkRed
    Write-Host "║  [13] Initialization (HAPUS SEMUA) 🚨    ║" -ForegroundColor Red
    Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Magenta
    Write-Host "║  [0]  Keluar                             ║"
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Magenta
}

do {
    Show-Menu
    $choice = Read-Host "`nPilih menu"
    switch ($choice) {
        "1"  { Get-DeviceInfo     }
        "2"  { Get-ScanlogNew     }
        "3"  { Get-ScanlogAll     }
        "4"  { Get-ScanlogGPS     }
        "5"  { Get-UserAll        }
        "6"  { Set-User           }
        "7"  { Sync-DateTime      }
        "8"  { Remove-UserByPin   }
        "9"  { Remove-UserAll     }
        "10" { Remove-ScanlogAll  }
        "11" { Remove-DeviceLog   }
        "12" { Remove-Admin       }
        "13" { Initialize-Device  }
        "0"  { Write-Host "`n  Sampai jumpa! Output tersimpan di: $OUTDIR" -ForegroundColor Green }
        default { Write-Host "  Pilihan tidak valid." -ForegroundColor Yellow }
    }
} while ($choice -ne "0")