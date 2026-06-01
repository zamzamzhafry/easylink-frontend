# EasyLink FService - Windows 10 Installation Guide

Date: 2026-05-19

## Overview

This guide walks through setting up the EasyLink FService bridge
on a Windows 10 machine. Once running, FService acts as HTTP
bridge between your apps and the biometric device at
`192.168.1.200:5005`.

## Prerequisites

- Windows 10 (64-bit)
- Administrator access
- Network access to device at `192.168.1.200` on port `5005`
- `.NET Framework 3.5` enabled

## Step 1 - Enable .NET Framework 3.5

The SDK components require .NET Framework 2.0/3.5 runtime.

1. Open **Control Panel** > **Programs and Features**.
2. Click **Turn Windows features on or off**.
3. Check `.NET Framework 3.5 (includes .NET 2.0 and 3.0)`.
4. Click OK and wait for installation to complete.
5. Restart if prompted.

## Step 2 - Copy SDK files

Copy the entire EasyLink SDK folder from the server share to
a local path on the Win10 machine.

Source location on server:

```text
\\192.168.1.129\aplikasi\Installer\EasyLink SDK
```

Recommended local path:

```text
C:\EasyLinkSDK
```

After copying, verify these files exist:

- `C:\EasyLinkSDK\FService.exe`
- `C:\EasyLinkSDK\Device.ini`
- `C:\EasyLinkSDK\zkemkeeper.dll`
- `C:\EasyLinkSDK\RealSvrOcxTcp.ocx`
- `C:\EasyLinkSDK\Riss.Devices.dll`
- `C:\EasyLinkSDK\Riss.Devices.tlb`
- `C:\EasyLinkSDK\FKAttend.dll`
- `C:\EasyLinkSDK\FK623Attend.dll`
- `C:\EasyLinkSDK\FKViaDev.dll`
- `C:\EasyLinkSDK\LFWViaDev.dll`
- `C:\EasyLinkSDK\reg_zk.bat`
- `C:\EasyLinkSDK\reg_revo.bat`
- `C:\EasyLinkSDK\reg_neo.bat`
- `C:\EasyLinkSDK\SetCon.conf`

## Step 3 - Configure Device.ini

Edit `C:\EasyLinkSDK\Device.ini` to match your device:

```ini
[Revo WFV-208BNC]
sn=Fio66208021230737
aktivasi=707D0-6167-46CEC-1072-C4E46-1243-77086::3-30
password=0
number=1
ip_address=192.168.1.200
ethernet_port=5005
```

Key fields:

| Field            | Value               | Notes                     |
| ---------------- | ------------------- | ------------------------- |
| `sn`             | `Fio66208021230737` | Device serial number      |
| `aktivasi`       | license key         | Keep existing value       |
| `password`       | `0`                 | Device password           |
| `number`         | `1`                 | Device index              |
| `ip_address`     | `192.168.1.200`     | Device LAN IP             |
| `ethernet_port`  | `5005`              | Device communication port |

If you have multiple devices, add additional sections with
unique section names and serial numbers.

## Step 4 - Register COM components

Open **Command Prompt as Administrator** and run each
registration script from the SDK folder.

### 4a - Register ZK components

```bat
cd C:\EasyLinkSDK
reg_zk.bat
```

What it does:

- Copies DLLs to `C:\Windows\SysWOW64`
- Runs `regsvr32 zkemkeeper.dll`

### 4b - Register Revo components

```bat
reg_revo.bat
```

What it does:

- Copies DLLs and OCX to `C:\Windows\SysWOW64`
- Runs `regsvr32 RealSvrOcxTcp.ocx`
- Registers `AxInterop.RealSvrOcxTcpLib.dll`
- Registers `Interop.RealSvrOcxTcpLib.dll`

### 4c - Register Neo/Riss components

```bat
reg_neo.bat
```

What it does:

- Installs `Riss.Devices.dll` into GAC via `gacutil`
- Runs `regasm Riss.Devices.dll /tlb:Riss.Devices.tlb`

### Troubleshooting registration

- If `regsvr32` fails, ensure you are running as Administrator.
- If `gacutil` is not found, verify .NET Framework 3.5 is
  installed (it includes the v2.0 SDK tools).
- If you see "module not found" errors, check that all DLL
  files are present in the SDK folder.

## Step 5 - Start FService

Double-click `FService.exe` or run from command prompt:

```bat
cd C:\EasyLinkSDK
FService.exe
```

Watch for:

- A window or tray icon indicating the service is running.
- Any error dialogs about missing components.
- The HTTP port it listens on (check `SetCon.conf` or the UI
  for port configuration).

If FService does not show a port, check `SetCon.conf` for
a port setting. Common default ports are `8090` or `80`.

## Step 6 - Verify connectivity to device

Before testing HTTP endpoints, confirm network path:

```bat
ping 192.168.1.200
```

Expected: replies from device.

Then test TCP port:

```bat
powershell Test-NetConnection 192.168.1.200 -Port 5005
```

Expected: `TcpTestSucceeded : True`

## Step 7 - Test HTTP bridge endpoints

Once FService is running and you know the listening port,
test from browser or curl.

Replace `{port}` with the actual FService HTTP port.

### Test device info

```bat
curl -X POST http://localhost:{port}/dev/info ^
  -d "sn=Fio66208021230737"
```

Expected response (JSON):

```json
{
  "Result": true,
  "IsSession": false,
  "Data": { ... device info fields ... }
}
```

### Test user list

```bat
curl -X POST http://localhost:{port}/user/all/paging ^
  -d "sn=Fio66208021230737&limit=10"
```

### Test scan log

```bat
curl -X POST http://localhost:{port}/scanlog/new ^
  -d "sn=Fio66208021230737"
```

## Step 8 - Note the bridge URL

Once endpoints respond successfully, record the bridge URL:

```text
http://{win10-machine-ip}:{port}
```

This URL is what the frontend app and PHP sync layer will
use to communicate with the device.

## Quick reference - All endpoints

| Endpoint                   | Body parameters                       |
| -------------------------- | ------------------------------------- |
| `POST /dev/info`           | `sn={sn}`                             |
| `POST /dev/settime`        | `sn={sn}`                             |
| `POST /dev/init`           | `sn={sn}`                             |
| `POST /user/all/paging`    | `sn={sn}&limit={limit}`               |
| `POST /user/set`           | `sn, pin, nama, pwd, rfid, priv, tmp` |
| `POST /user/del`           | `sn={sn}&pin={pin}`                   |
| `POST /user/delall`        | `sn={sn}`                             |
| `POST /scanlog/all/paging` | `sn={sn}&limit={limit}`               |
| `POST /scanlog/new`        | `sn={sn}`                             |

Response envelope is always:

```json
{ "Result": true/false, "IsSession": true/false, "Data": ... }
```

For paged endpoints, keep calling until `IsSession` is `false`
or `Data` is empty.

## Common issues

| Problem                          | Solution                        |
| -------------------------------- | ------------------------------- |
| FService won't start             | Run as Administrator            |
| "Class not registered" error     | Re-run registration scripts     |
| Device unreachable               | Check IP/port, firewall rules   |
| Endpoints return empty           | Verify `sn` matches Device.ini  |
| .NET errors on startup           | Enable .NET Framework 3.5       |
| Port conflict                    | Change port in SetCon.conf      |

## Next steps after FService works

1. Point the EasyLink frontend env var to bridge URL:
   `EASYLINK_WSDK_BASE_URL=http://{win10-ip}:{port}`
2. Investigate PHP/XAMPP sync app for automated log pulling.
3. Set up scheduled sync if needed (cron or Windows Task
   Scheduler calling bridge endpoints).

## Important notes

- Do **not** use raw ZKLib tools against port `4370`. This
  device uses EasyLink/Revo bridge protocol on port `5005`.
- The `sn` value is a routing key for the bridge, not a
  direct network address.
- Keep `Device.ini` backed up. It contains the activation
  key for the SDK license.
