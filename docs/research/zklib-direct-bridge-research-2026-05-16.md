# ZKLib Direct Bridge Research

Date: 2026-05-16
Repo: `E:\Project\easylink-frontend`

## Goal

Evaluate whether this app should replace current machine bridge methods with a direct ZKLib-based integration against the biometric device IP on LAN, instead of routing through EasyLink HTTP or Windows SDK bridge layers.

## Current App Baseline

- Current repo bridge is centered on `lib/easylink-sdk-client.js`.
- Active adapters in code:
  - `windows-sdk` via HTTP bridge endpoints such as `/dev/info`, `/scanlog/new`, `/user/all/paging`
  - `fingerspot-easylink-ts`
  - `easylink-js` is present in dependencies but disabled in adapter selection
- Machine env in local `.env` currently points to:
  - device IP `192.168.1.200`
  - device port `5005`
  - Windows SDK bridge `http://192.168.1.111:8090`

## Protocol Research Summary

Community ZKLib libraries target ZKTeco binary protocol directly over device network port, commonly `4370`, using TCP and/or UDP.

Key sources reviewed:

- `zklib` / `js_zklib`
  - README states UDP/TCP support with default port `4370`
  - API includes connect, get time, get users, get attendance, clear attendance
- `node-zklib`
  - Fork-style Node implementation around direct socket connection to ZKTeco devices
  - Supports `getInfo()`, `getUsers()`, `getAttendances()`, realtime logs
- `zkteco-js`
  - More recently maintained Node package
  - Explicit warning in repo: not recommended for production
- `pyzk`
  - Mature Python option
  - Also expects direct device connection on port `4370`
- `zk-protocol`
  - Reverse-engineered protocol reference used by several libraries

## Live Network Tests

### Port reachability

- `192.168.1.200:5005` -> reachable over TCP
- `192.168.1.200:4370` -> TCP connection refused
- `192.168.1.111:8090` -> not reachable from current test path

Interpretation:

- Device exposes something on `5005`
- Device does **not** expose standard ZKLib TCP port `4370`
- Current Windows bridge host was unreachable from this agent path during test

## Live Library Tests

All tests run from temporary Node sandbox, not committed into repo.

### `zkteco-js`

Targets tested:

- `192.168.1.200:5005`
- `192.168.1.200:4370`

Result:

- both failed during connection handshake
- representative error: `TIMEOUT_ON_WRITING_MESSAGE`

Interpretation:

- open `5005` port is not responding like expected ZK binary protocol for this library
- closed `4370` port confirms no standard direct ZK TCP listener on current device path

### `zklib`

Targets tested:

- UDP `4370`
- TCP `4370`
- TCP `5005`

Result:

- UDP `4370` -> timeout
- TCP `4370` -> `ECONNREFUSED`
- TCP `5005` -> timeout

Interpretation:

- no usable direct ZKLib path detected from current environment

### `node-zklib`

Targets tested:

- `192.168.1.200:4370`
- `192.168.1.200:5005`

Result:

- both failed during socket setup / handshake

## Baseline Repo Adapter Smoke Test

Tested `getDeviceInfoFromSdk()` against current repo adapter paths:

- `source=windows-sdk` -> failed with `fetch failed`
- `source=auto` -> failed with same bridge fetch failure
- `source=fingerspot-easylink-ts` -> failed with `FingerspotEasyLink is not a constructor`

Interpretation:

- current bridge is not healthy from this environment
- direct Fingerspot adapter code likely has import/interop bug in current build
- this failure is separate from ZKLib viability

## Main Finding

Direct ZKLib is **not yet a safe replacement path** for this machine setup.

Reason:

1. Standard ZKLib port `4370` is not open on current device IP.
2. Only open direct port found was `5005`, but tested ZKLib clients could not complete protocol handshake there.
3. Evidence suggests this device path is not exposing standard ZKTeco binary protocol in way these libraries expect.

## What This Likely Means

Most likely one of these is true:

1. Fingerspot rebadge is exposing proprietary EasyLink-style service on `5005`, not raw ZKLib.
2. Raw ZK protocol may exist on another port or another network interface, but current known target does not expose it.
3. Existing deployment may depend on intermediate bridge behavior even when speaking to device-adjacent service.

## Recommendation

Short verdict:

- Do **not** switch machine methods to ZKLib-first yet.
- First repair and verify current bridge options.

Recommended next order:

1. Fix repo-side `fingerspot-easylink-ts` adapter interop bug.
2. Re-verify whether direct EasyLink HTTP against `192.168.1.200:5005` is supported and what exact route contract it expects.
3. If user can inspect device admin/network menu, confirm whether raw ZK protocol service is enabled and on what port.
4. Only revisit ZKLib if real device config proves raw ZK service exists.

## If We Still Want Direct Machine Method

Most practical direct path from current evidence:

- prefer a direct EasyLink/Fingerspot adapter path if `5005` is confirmed official for this device
- do not assume ZKLib compatibility without proof of raw protocol port and handshake

## Follow-up Checks Worth Doing

- capture exact response bytes or HTTP headers from `192.168.1.200:5005`
- verify device model and firmware from physical admin panel
- confirm whether device has ZK push/standalone/SSR mode toggles
- confirm whether `4370` or UDP mode can be enabled on device LAN settings
