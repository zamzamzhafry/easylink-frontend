# FService Bridge Setup Guide

## What this is

This folder contains the EasyLink SDK runtime bundle needed to bring
up the FService HTTP bridge on a Windows 10 machine. Once running,
the bridge exposes HTTP endpoints that let any client pull attendance
data from the biometric device.

## Prerequisites

- Windows 10 (x64)
- .NET Framework 3.5 enabled (Control Panel > Programs > Turn Windows features on)
- Administrator shell for registration steps
- Network access to device 192.168.1.200:5005

## Step 1 - Copy bundle

Copy this entire ops/fservice-bundle/ folder to a stable path on
the target Windows machine, for example:

    C:\EasyLink\

## Step 2 - Edit Device.ini

Confirm Device.ini has correct values:

    [Revo WFV-208BNC]
    sn=Fio66208021230737
    aktivasi=707D0-6167-46CEC-1072-C4E46-1243-77086::3-30
    password=0
    number=1
    ip_address=192.168.1.200
    ethernet_port=5005

## Step 3 - Edit SetDef.fin

Confirm bridge port setting:

    [setting]
    port=8090
    use_timeout=-1
    timeout=5000
    use_auto_restart=0
    val_auto_restart=23:00

This means FService will listen on port 8090 after startup.

## Step 4 - Register COM components

Open Administrator Command Prompt, cd into the bundle folder, then:

    reg_zk.bat
    reg_revo.bat
    reg_neo.bat

If reg_neo.bat fails because gacutil path differs, run manually:

    gacutil.exe /i Riss.Devices.dll
    %SystemRoot%\Microsoft.NET\Framework\v2.0.50727\regasm Riss.Devices.dll /tlb:Riss.Devices.tlb

## Step 5 - Start FService

    FService.exe

The service should start and begin listening on the port defined in
SetDef.fin (default 8090).

## Step 6 - Smoke test

From any machine on the same network, run:

    # Device info
    Invoke-RestMethod -Method Post -Uri "http://<THIS_MACHINE_IP>:8090/dev/info" -ContentType "application/x-www-form-urlencoded" -Body "sn=Fio66208021230737"

    # New scanlogs
    Invoke-RestMethod -Method Post -Uri "http://<THIS_MACHINE_IP>:8090/scanlog/new" -ContentType "application/x-www-form-urlencoded" -Body "sn=Fio66208021230737"

    # All users (paged)
    Invoke-RestMethod -Method Post -Uri "http://<THIS_MACHINE_IP>:8090/user/all/paging" -ContentType "application/x-www-form-urlencoded" -Body "sn=Fio66208021230737&limit=100"

Expected response shape:

    {"Result":true,"IsSession":false,"Data":[...]}

If Result is true, bridge is alive and talking to device.

## Step 7 - Update app .env

Once bridge is confirmed working, update the frontend .env:

    EASYLINK_WSDK_BASE_URL=http://<THIS_MACHINE_IP>:8090
    EASYLINK_WSDK_IP=<THIS_MACHINE_IP>
    EASYLINK_WSDK_PORT=8090
    EASYLINK_DEVICE_SN=Fio66208021230737

## Troubleshooting

- FService won't start: Check .NET 3.5 enabled, run reg scripts as Admin
- Result false: Verify Device.ini ip_address and ethernet_port match device
- Port not listening: Check Windows Firewall, allow inbound TCP 8090
- Command not found: Device serial mismatch in Device.ini

## Architecture

    PHP/Next.js app  -->  FService :8090  -->  Device 192.168.1.200:5005
       HTTP POST            bridge              Revo WFV-208BNC
       sn=... body          proprietary         (EasyLink protocol)
       JSON response        protocol

## Next after bridge is up

Once smoke test passes, deploy the PHP sync script from
ops/fservice-sync/sync.php to pull scanlogs and users into
the demo_easylinksdk database on schedule.
