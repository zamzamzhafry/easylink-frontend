# EasyLink SDK VB Research

Date: 2026-05-16
Source shares:

- `\\192.168.1.129\aplikasi\Installer\Absensi SDK`
- `\\192.168.1.129\aplikasi\Installer\EasyLink SDK`

Local copies:

- `E:\Project\easylink-frontend\docs\learning\sdk-share-dumps\Absensi SDK`
- `E:\Project\easylink-frontend\docs\learning\sdk-share-dumps\EasyLink SDK`

## Main finding

EasyLink sample apps do **not** connect to machine by serial number alone.

Actual model:

1. app connects to HTTP server at `http://{serverIP}:{serverPort}`
2. app sends machine selector as form field `sn={deviceSerial}`
3. server-side bridge uses that serial number to choose target device

So serial number is **routing identifier inside EasyLink bridge**, not network locator like raw ZKLib direct TCP/UDP.

## What was copied

From `Absensi SDK` sample bundle:

- VB.Net sample source
- VB6 sample source
- C#, Delphi, PHP samples
- installer/runtime DLL and OCX files
- `Device.ini`
- local MDB demo databases

Notable extracted paths:

- `E:\Project\easylink-frontend\docs\learning\sdk-share-dumps\Absensi SDK\Sample Code\Sample Code VB.Net\extracted\EasyLink_SourceCode_SampleCode_VBNet`
- `E:\Project\easylink-frontend\docs\learning\sdk-share-dumps\Absensi SDK\Sample Code\Sample Code VB6\extracted\EasyLink_SacmpleCode_VB6`

## VB.Net reverse-engineering notes

File:

- `...VBNet\FormClientEasylinkSDK.vb`

Transport pattern:

- uses `HttpWebRequest` or `WebClient.UploadValues`
- always `POST`
- content type `application/x-www-form-urlencoded`
- base URL is composed from UI fields `TB_serverIP` and `TB_serverPort`

Core request shapes observed:

- `POST /user/all/paging`
  - body: `sn={sn}&limit={limit}`
- `POST /scanlog/all/paging`
  - body: `sn={sn}&limit={limit}`
- `POST /scanlog/new`
  - body: `sn={sn}`
- `POST /user/set`
  - body includes `sn`, `pin`, `nama`, `pwd`, `rfid`, `priv`, `tmp`
- `POST /user/delall`
  - body: `sn={sn}`
- `POST /user/del`
  - body: `sn={sn}&pin={pin}`
- `POST /dev/info`
  - body: `sn={sn}`
- `POST /dev/settime`
  - body: `sn={sn}`
- `POST /dev/init`
  - body: `sn={sn}`

Response contract observed:

- JSON envelope with at least:
  - `Result`
  - `IsSession`
  - `Data`

Paging behavior:

- app loops while `IsSession = true`
- app appends returned `Data` rows into local Access DB
- user pull and scanlog pull both rely on repeated calls to same endpoint until session ends

Auto multi-device behavior:

- app reads `Device.ini`
- `GetPrivateProfileString("Mesin", "sn", ...)`
- serial list is semicolon-separated
- app iterates each serial and repeats same HTTP requests per SN

Schedule behavior:

- `Device.ini` also stores `Jadwal/jam`
- app checks current clock against configured times
- when time matches, auto-download starts

## VB6 reverse-engineering notes

File:

- `...VB6\FEasyLinkSDK.frm`

Transport pattern:

- uses `MSXML2.ServerXMLHTTP`
- `POST`
- content type `application/x-www-form-urlencoded`
- body encoded from form string

Representative endpoint map:

- `/dev/deladmin`
- `/scanlog/del`
- `/user/delall`
- `/log/del`
- `/user/del`
- `/dev/info`
- `/scanlog/all/paging`
- `/user/all/paging`
- `/scanlog/new`
- `/dev/init`
- `/user/set-all`
- `/user/set`
- `/dev/settime`

VB6 confirms same architecture:

- UI collects `TServerIP`, `TServerPort`, `TDeviceSN`
- requests go to bridge host and port
- serial number goes inside request body as `sn=...`
- local `Device.ini` can contain many serials
- code loops over all SN values for bulk download

## `Device.ini` role

Observed pattern:

```ini
[Mesin]
sn=61627016490072;6668601649075
[Jadwal]
jam=...
```

Meaning:

- `sn` is one or more machine serial numbers known by bridge
- bridge app likely keeps registered device list and uses serial to route commands
- client app does not need direct machine IP per SN

## Important implication for this repo

For EasyLink integration, correct mental model is:

- **bridge-first**
- not **serial-direct**
- not necessarily **raw ZKLib direct**

Practical connection tuple:

- bridge host/IP
- bridge port
- machine serial number

Not enough by itself:

- machine serial number only

## Why this matters for current ZKLib discussion

ZKLib direct mode usually expects:

- machine IP
- raw protocol port, commonly `4370`

EasyLink sample code expects:

- bridge IP/port
- `sn`

Those are different architectures.

## Most useful next engineering step

If app should follow vendor sample behavior, build normalized gateway around:

- `baseUrl`
- `sn`
- vendor endpoints above
- `IsSession` paging loop

If app should bypass bridge and use ZKLib, that must be validated separately against real machine raw protocol port, because sample code does not prove that path.
