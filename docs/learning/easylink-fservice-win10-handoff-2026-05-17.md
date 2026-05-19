# EasyLink FService Win10 Handoff

Date: 2026-05-17

## Goal

Bring back working EasyLink/FService bridge on Windows 10 so
machine `192.168.1.200:5005` can be reached again, then inspect
whether local PHP app is responsible for sync and scanlog pulling.

## Main conclusion

Current evidence says legacy EasyLink sample apps do **not** talk
to machine directly by serial number alone and do **not** depend on
raw ZKLib port `4370` for this device.

Actual architecture is:

1. client app sends HTTP requests to bridge server at `http://{serverIP}:{serverPort}`
2. request body includes `sn={deviceSerial}`
3. bridge resolves that serial number to real machine config
4. bridge or service then talks to device `192.168.1.200:5005`

So `sn` is a routing key inside EasyLink bridge layer, not direct network locator.

## Critical evidence

### Live device config

From `docs/learning/sdk-share-dumps/EasyLink SDK/Device.ini`:

```ini
[Revo WFV-208BNC]
sn=Fio66208021230737
aktivasi=707D0-6167-46CEC-1072-C4E46-1243-77086::3-30
password=0
number=1
ip_address=192.168.1.200
ethernet_port=5005
```

Implications:

- device model path is `Revo WFV-208BNC`
- device uses `192.168.1.200:5005`
- standard raw ZK port `4370` is not primary path here

### Local research summary

See `docs/learning/easylink-sdk-vb-research-2026-05-16.md`.

Confirmed from source samples:

- base URL is `http://{serverIP}:{serverPort}`
- transport is `POST`
- content type is `application/x-www-form-urlencoded`
- machine selector is `sn={deviceSerial}`
- responses are JSON envelopes with fields such as `Result`,
  `IsSession`, and `Data`

### Endpoint shapes found in sample code

Observed request family:

- `POST /user/all/paging` with `sn={sn}&limit={limit}`
- `POST /scanlog/all/paging` with `sn={sn}&limit={limit}`
- `POST /scanlog/new` with `sn={sn}`
- `POST /user/set` with `sn`, `pin`, `nama`, `pwd`, `rfid`, `priv`, `tmp`
- `POST /user/delall` with `sn={sn}`
- `POST /user/del` with `sn={sn}&pin={pin}`
- `POST /dev/info` with `sn={sn}`
- `POST /dev/settime` with `sn={sn}`
- `POST /dev/init` with `sn={sn}`

## Why old path likely broke

Earlier config referenced bridge host `192.168.1.111:8090`,
but that host no longer exists.

Most likely old flow was:

```text
frontend or desktop client
  -> HTTP bridge on Windows machine
  -> vendor SDK/service stack
  -> device 192.168.1.200:5005
```

When old Windows bridge machine died, app path died too.

## What exists on server share

Real SDK stash was found under mounted share on `192.168.1.129`:

- `/mnt/aplikasi/Installer/EasyLink SDK`
- `/mnt/aplikasi/Installer/Absensi SDK/EasyLink SDK`
- `/mnt/aplikasi/Installer/EasyLink SDK/EasyLink SDK Sample Code`
- `/mnt/aplikasi/Application/db_easylinksdk`

Important runtime files in SDK bundle:

- `FService.exe`
- `zkemkeeper.dll`
- `RealSvrOcxTcp.ocx`
- `Riss.Devices.dll`
- `Riss.Devices.tlb`
- `FKAttend.dll`
- `FK623Attend.dll`
- `FKViaDev.dll`
- `LFWViaDev.dll`
- `MSDATGRD.OCX`
- `AnimatedGif.ocx`
- `AxImage.ocx`
- `Device.ini`
- `SetCon.conf`

## Source artifacts already copied into repo

These are better than blind EXE reverse-engineering:

- `docs/learning/sdk-share-dumps/Absensi SDK/Sample Code/Sample Code VB6/extracted/EasyLink_SacmpleCode_VB6/FEasyLinkSDK.frm`
- `docs/learning/sdk-share-dumps/Absensi SDK/Sample Code/Sample Code VB6/extracted/EasyLink_SacmpleCode_VB6/ClientEasyLinkSDK.vbp`
- `docs/learning/sdk-share-dumps/Absensi SDK/Sample Code/Sample Code VB.Net/extracted/EasyLink_SourceCode_SampleCode_VBNet/FormClientEasylinkSDK.vb`
- `docs/learning/sdk-share-dumps/Absensi SDK/Sample Code/Sample Code
  VB.Net/extracted/EasyLink_SourceCode_SampleCode_VBNet/bin/Debug/
  ClientSDK_VB_NET.exe`
- `docs/learning/sdk-share-dumps/EasyLink SDK/EasyLink SDK Sample
  Code/Client SDK D7 - With download all/MainForm.pas`

## Windows 10 setup hypothesis

Best guess for recovery path on Windows 10:

1. copy or install `EasyLink SDK`
2. keep `Device.ini` with live values for device serial, IP, and port
3. register required OCX and DLL components
4. run `FService.exe` or related EasyLink bridge component
5. confirm HTTP bridge port and test sample endpoints
6. later point frontend or PHP sync app to that bridge base URL

### Registration scripts found in SDK bundle

`reg_zk.bat`

- copies DLLs into `System32` or `SysWOW64`
- registers `zkemkeeper.dll`

`reg_revo.bat`

- copies DLLs and OCX into `System32` or `SysWOW64`
- registers `RealSvrOcxTcp.ocx`
- registers `AxInterop.RealSvrOcxTcpLib.dll`
- registers `Interop.RealSvrOcxTcpLib.dll`

`reg_neo.bat`

- installs `Riss.Devices.dll` into GAC via `gacutil`
- runs `.NET Framework v2.0.50727\regasm Riss.Devices.dll /tlb:Riss.Devices.tlb`

### Compatibility notes

This stack is legacy and may need:

- Windows 10 x64 running 32-bit compatibility components
- `.NET Framework 3.5`
- administrator shell for registration
- Access Database Engine or legacy ADO/Jet support for `.mdb`
- OCX/DLL COM registration to succeed before sample app or service can run

## Recommended Win10 bring-up order

1. Copy whole SDK folder to Win10 machine.
2. Preserve `Device.ini` values for:
   - `sn=Fio66208021230737`
   - `ip_address=192.168.1.200`
   - `ethernet_port=5005`
3. Enable `.NET Framework 3.5` on Windows.
4. Run installer if present, or place SDK under stable path such
   as `C:\Program Files (x86)\EasyLink SDK`.
5. Run registration scripts as Administrator.
6. Try starting `FService.exe`.
7. If service or UI starts, identify listening HTTP port.
8. Test endpoints such as:
   - `POST /dev/info`
   - `POST /user/all/paging`
   - `POST /scanlog/new`
9. Confirm responses contain JSON envelope with `Result`, `IsSession`, `Data`.
10. Only after bridge works, inspect PHP app that syncs or pulls logs.

## Local PHP app hypothesis

There may be local PHP app or XAMPP-hosted app involved later in sync pipeline.

Clues from mounted data paths on server:

- `/mnt/data/xampp/htdocs/sdk`
- `/mnt/data/xampp/mysql/data`
- `/mnt/data/xampp1/...`

This suggests later work should inspect whether PHP layer:

- calls EasyLink HTTP bridge endpoints
- stores pulled users and scanlogs
- schedules sync jobs or cron-like polling
- exposes admin UI around machine sync

## Best next checks after Win10 setup

1. Determine which process exposes HTTP bridge:
   - `FService.exe`
   - desktop sample app
   - another bundled executable
2. Identify actual listening port on Win10.
3. Capture one successful request/response for:
   - `/dev/info`
   - `/scanlog/new`
4. Compare response shape with current Next.js adapter in `lib/easylink-sdk-client.js`.
5. Inspect local PHP app under XAMPP paths for reuse of same endpoint contract.

## Important warning

Do not assume raw ZKLib tools against `192.168.1.200:4370`
will solve this device path. Current evidence points to
EasyLink/Revo bridge flow on `5005`, not standard direct ZKTeco
network mode.
