# EasyLink troubleshooting and integration notes

## Context

Project uses Fingerspot EasyLink SDK through FService.exe and a frontend project based on Next/React. Initial testing on Windows 11 used PowerShell and `Invoke-WebRequest` because Linux-style curl flags conflicted with PowerShell alias behavior.

## Main findings

1. On Windows PowerShell, `curl` may resolve to `Invoke-WebRequest`, so `curl.exe` is safer for raw curl syntax.
2. `/scanlog/new` worked once called in Windows-compatible form.
3. `/dev/info` is the best lightweight connectivity check.
4. `/dev/settime` can fail due to server-side FService/runtime/permission issues, not necessarily client-side script problems.
5. `/user/all/paging` is prone to timeout because returned payload can include large templates.
6. The best mitigation is smaller batch size, longer timeout, visible progress logging, partial persistence, and small pauses between batches.

## Recommended architecture

### Do not call FService directly from the browser

Instead:

- Next.js route handlers call FService.
- React components call Next.js internal APIs.
- Logging and timeout control stay on the server side.

### Suggested routes

- `app/api/device-info/route.ts`
- `app/api/scanlog/new/route.ts`
- `app/api/users/fetch/route.ts`

## Paging timeout strategy

For `/user/all/paging`:

- Start with batch size 10.
- Use timeout 120-180 seconds per batch.
- Print progress per batch.
- Save partial results after each successful batch.
- Add 300-500 ms delay between batches.

## Keep-alive interpretation

FService likely does not stream partial JSON per request. Because of that, “keep-alive” here should mean:

- terminal keeps showing progress after each batch,
- process remains visible and controlled,
- partial files exist even before the final fetch ends.

This is operational keep-alive, not HTTP chunked streaming.

## PowerShell baseline

The PowerShell script should support:

- device info,
- new scanlog fetch,
- safe user paging fetch,
- live logs with timestamps,
- partial JSON save,
- final JSON save.

## Migration path to Next.js

1. Stabilize PowerShell operator script first.
2. Extract shared request logic into server-side utility.
3. Build internal API routes in Next.js.
4. Add React UI for progress and results.
5. If real-time UI progress is needed, add SSE, WebSocket, or polling to a progress endpoint.

## Repo-level recommendation

Frontend repository should focus on:

- UI state,
- progress rendering,
- normalized API consumption,
- not direct device communication.

Direct machine communication should remain server-side.

Penilaian akhir
Secara praktis, project-mu sudah berada di jalur yang benar karena kamu mulai dari shell/PowerShell reference untuk memvalidasi perilaku endpoint lebih dulu. Yang perlu diubah sekarang bukan terutama UI React-nya, tetapi cara fetch besar dijalankan: jadikan batch kecil dengan progress log yang jelas dan pindahkan logic itu ke server-side Next agar lebih stabil dan mudah diobservasi.

Kalau kamu mau, langkah berikut yang paling efektif adalah saya bantu tuliskan versi Next.js route handler + React progress UI berdasarkan script PowerShell final ini.
