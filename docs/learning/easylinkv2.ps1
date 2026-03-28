param(
    [string]$BaseUrl = "http://192.168.1.111:8090",
    [string]$SerialNumber = "Fio66208021230737",
    [string]$OutputDir = "$env:USERPROFILE\easylink-output"
)

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$Global:BaseUrl = $BaseUrl.TrimEnd('/')
$Global:SerialNumber = $SerialNumber
$Global:OutputDir = $OutputDir

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('INFO','WARN','ERROR','OK','STEP')]
        [string]$Level = 'INFO'
    )

    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $color = switch ($Level) {
        'INFO'  { 'Gray' }
        'WARN'  { 'Yellow' }
        'ERROR' { 'Red' }
        'OK'    { 'Green' }
        'STEP'  { 'Cyan' }
    }

    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

function Save-JsonFile {
    param(
        [object]$Data,
        [string]$Name
    )

    $path = Join-Path $Global:OutputDir $Name
    $Data | ConvertTo-Json -Depth 20 | Out-File -FilePath $path -Encoding utf8
    Write-Log "Saved file: $path" 'OK'
}

function Invoke-EasyLink {
    param(
        [string]$Endpoint,
        [string]$Body = '',
        [string]$QueryString = '',
        [int]$TimeoutSec = 60
    )

    $uri = "$($Global:BaseUrl)$Endpoint"
    if ($QueryString) {
        $uri = "$uri?$QueryString"
    }

    if (-not $Body) {
        $Body = "sn=$($Global:SerialNumber)"
    }

    Write-Log "POST $uri" 'STEP'
    Write-Log "Body: $Body" 'INFO'

    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        $resp = Invoke-WebRequest -Method POST `
            -Uri $uri `
            -Body $Body `
            -ContentType 'application/x-www-form-urlencoded' `
            -UseBasicParsing `
            -TimeoutSec $TimeoutSec

        $sw.Stop()
        Write-Log ("HTTP OK in {0}s" -f $sw.Elapsed.TotalSeconds.ToString('0.00')) 'OK'

        $json = $resp.Content | ConvertFrom-Json

        if ($json.Result -eq $true) {
            Write-Log "Result=true" 'OK'
        } else {
            $msg = if ($json.message) { $json.message } else { 'No message' }
            Write-Log "Result=false | $msg" 'WARN'
        }

        return $json
    }
    catch {
        $sw.Stop()
        Write-Log ("HTTP failed in {0}s" -f $sw.Elapsed.TotalSeconds.ToString('0.00')) 'ERROR'
        Write-Log $_.Exception.Message 'ERROR'
        return $null
    }
}

function Get-DeviceInfo {
    Write-Log "Getting device info" 'STEP'
    $json = Invoke-EasyLink -Endpoint '/dev/info' -TimeoutSec 30

    if ($json -and $json.Result) {
        $json.DEVINFO | Format-List
        Save-JsonFile -Data $json -Name 'devinfo.json'
    } else {
        Write-Log 'Failed to get device info' 'ERROR'
    }

    return $json
}

function Get-ScanlogNew {
    param(
        [string]$From,
        [string]$To,
        [int]$Limit = 100
    )

    if (-not $From) {
        $From = (Get-Date -Day 1 -Format 'yyyy-MM-dd') + ' 00:00:00'
    }

    if (-not $To) {
        $To = (Get-Date -Format 'yyyy-MM-dd') + ' 23:59:59'
    }

    $qs = 'sn=' + $Global:SerialNumber +
          '&limit=' + $Limit +
          '&from=' + [uri]::EscapeDataString($From) +
          '&to=' + [uri]::EscapeDataString($To)

    Write-Log "Fetching new scanlog from $From to $To | limit=$Limit" 'STEP'

    $json = Invoke-EasyLink `
        -Endpoint '/scanlog/new' `
        -QueryString $qs `
        -Body "sn=$($Global:SerialNumber)" `
        -TimeoutSec 120

    if ($json -and $json.Result -and $json.Data) {
        Write-Log "Returned $($json.Data.Count) scanlog rows" 'OK'
        $json.Data | Format-Table ScanDate, PIN, VerifyMode, IOMode, WorkCode -AutoSize
        Save-JsonFile -Data $json -Name 'scanlog-new.json'
    } else {
        $msg = if ($json -and $json.message) { $json.message } else { 'No data / failed' }
        Write-Log $msg 'WARN'
    }

    return $json
}

function Get-UserAllStream {
    param(
        [int]$Limit = 10,
        [int]$TimeoutSec = 180,
        [int]$DelayMs = 500
    )

    $allData = New-Object System.Collections.ArrayList
    $iteration = 1

    while ($true) {
        Write-Log "Fetching user batch #$iteration | limit=$Limit" 'STEP'

        $json = Invoke-EasyLink `
            -Endpoint '/user/all/paging' `
            -Body "sn=$($Global:SerialNumber)&limit=$Limit" `
            -TimeoutSec $TimeoutSec

        if (-not $json) {
            Write-Log 'Response is null, stopping fetch' 'ERROR'
            break
        }

        if (-not $json.Result) {
            Write-Log 'Server returned Result=false, stopping fetch' 'WARN'
            break
        }

        if (-not $json.Data -or $json.Data.Count -eq 0) {
            Write-Log 'No more user data returned' 'WARN'
            break
        }

        foreach ($item in $json.Data) {
            [void]$allData.Add($item)
        }

        Write-Log "Batch #$iteration returned $($json.Data.Count) users | total=$($allData.Count)" 'OK'
        Save-JsonFile -Data $allData -Name 'users.partial.json'

        if ($json.Data.Count -lt $Limit) {
            Write-Log 'Final batch detected because count < limit' 'INFO'
            break
        }

        $iteration++
        Start-Sleep -Milliseconds $DelayMs
    }

    if ($allData.Count -gt 0) {
        Save-JsonFile -Data $allData -Name 'users.json'
        $allData | Select-Object PIN, Name, RFID, Password, Privilege | Format-Table -AutoSize
    }

    return $allData
}

function Show-Menu {
    Write-Host ''
    Write-Host '==== EasyLink Client ====' -ForegroundColor Magenta
    Write-Host '[1] Device Info'
    Write-Host '[2] New Scanlog'
    Write-Host '[3] Stream Users (safe paging)'
    Write-Host '[0] Exit'
}

do {
    Show-Menu
    $choice = Read-Host 'Choose'

    switch ($choice) {
        '1' {
            Get-DeviceInfo | Out-Null
        }
        '2' {
            $from = Read-Host 'From yyyy-MM-dd HH:mm:ss (blank=awal bulan ini)'
            $to = Read-Host 'To yyyy-MM-dd HH:mm:ss (blank=hari ini)'
            $limit = Read-Host 'Limit (blank=100)'
            if (-not $limit) { $limit = 100 }

            Get-ScanlogNew -From $from -To $to -Limit ([int]$limit) | Out-Null
        }
        '3' {
            $limit = Read-Host 'Limit per batch (blank=10)'
            if (-not $limit) { $limit = 10 }

            Get-UserAllStream -Limit ([int]$limit) | Out-Null
        }
        '0' {
            Write-Log 'Bye' 'OK'
        }
        default {
            Write-Log 'Invalid choice' 'WARN'
        }
    }
} while ($choice -ne '0')