# EasyLink SDK Scanlog/User Reference (Exa + Grep Summary)

## 1) Why this note exists

This document is a memory handoff for future workers to debug and test EasyLink Windows SDK scanlog/user endpoints using direct curl and Postman payloads.

It also records what was found via **Exa/web research** and **local grep/code tracing**.

---

## 2) Exa + Grep exploration summary

### Local codebase grep findings (authoritative for this repo)

- `app/api/scanlog/sync/route.js` is the ingestion entrypoint and now forwards:
  - `mode`, `from`, `to`, `limit`, `page`, `max_pages`/`maxPages` to SDK pull.
- `lib/easylink-sdk-client.js` Windows adapter now uses configurable endpoint lists and fallback:
  - Scanlogs: `/scanlog/new,/scanlog/all/paging,/getScanLogs`
  - Users: `/user/all/paging,/getUsers`
  - Device info/time: `/dev/info,...`
- Request strategy fallback in windows adapter is query -> form -> json when needed.

### External Exa/GitHub findings (supporting only)

- `dewadg/easylink-js` and related EasyLink/Fingerspot snippets show high-level operations (get users/scanlogs/device info), but path-level public docs for `/scanlog/all/paging` and `/user/all/paging` are sparse.
- Therefore, the **best source of truth** is:
  1. your observed live machine responses,
  2. adapter fallback + runtime behavior in this repo,
  3. direct curl/postman test outputs.

---

## 3) Raw curl commands (direct SDK machine)

Target:

- Host: `192.168.1.111`
- Port: `8090`
- SN: `Fio66208021230737`

### Get users (paging)

```bash
curl -sS -m 20 -X POST "http://192.168.1.111:8090/user/all/paging?sn=Fio66208021230737&limit=100&page=1" -H "Content-Type: application/x-www-form-urlencoded"
```

### Get all scanlog (paging + date range)

```bash
curl -sS -m 20 -X POST "http://192.168.1.111:8090/scanlog/all/paging?sn=Fio66208021230737&limit=100&page=1&from=2026-03-26%2000:00:00&to=2026-03-27%2023:59:59" -H "Content-Type: application/x-www-form-urlencoded"
```

### Get new scanlog (date range + limit)

```bash
curl -sS -m 20 -X POST "http://192.168.1.111:8090/scanlog/new?sn=Fio66208021230737&limit=100&from=2026-03-26%2000:00:00&to=2026-03-27%2023:59:59" -H "Content-Type: application/x-www-form-urlencoded"
```

### Device info (already validated)

```bash
curl -sS -m 10 -X POST "http://192.168.1.111:8090/dev/info?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"
```

---

## 4) Internal API sync test curl (app route)

Use this to test controlled ingestion with paging/date limits through app API:

```bash
curl -sS -m 30 -X POST "http://192.168.1.111:3001/api/scanlog/sync" \
  -H "Content-Type: application/json" \
  -b "easylink_session=<YOUR_SESSION_COOKIE>" \
  -d '{
    "source": "auto",
    "mode": "new",
    "from": "2026-03-26 00:00:00",
    "to": "2026-03-27 23:59:59",
    "limit": 100,
    "page": 1,
    "max_pages": 3,
    "async": true
  }'
```

The app now responds with `202 Accepted` and a `batch_id` whenever the job is queued or running asynchronously. Poll job status (and retrieve raw payload/debug info) with:

```bash
curl -sS -b "easylink_session=<YOUR_SESSION_COOKIE>" "http://192.168.1.111:3001/api/scanlog/sync?batch_id=123"
```

PowerShell equivalents (handy when curl is blocked):

```powershell
$body = @{
  source = 'auto'
  mode = 'new'
  from = '2026-03-26 00:00:00'
  to = '2026-03-27 23:59:59'
  limit = 100
  page = 1
  max_pages = 3
  async = $true
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri 'http://192.168.1.111:3001/api/scanlog/sync' -ContentType 'application/json' -WebSession $session -Body $body

# Poll later
Invoke-RestMethod -Method Get -Uri 'http://192.168.1.111:3001/api/scanlog/sync?batch_id=123' -WebSession $session
```

Client UI mirrors this behavior via a right-side queue panel with expandable rows showing raw JSON (request + result/error). Use "New" mode + date range whenever possible; the "All" mode is exposed but warns users because it is heavy on the SDK.

---

## 5) Embedded Postman collection JSON (direct SDK)

This mirrors file: `Postman/EasyLink User + Scanlog (Query String).postman_collection.json`

```json
{
  "info": {
    "name": "EasyLink User + Scanlog (Query String)",
    "_postman_id": "2f9e9f7c-f6d6-4e1f-a2c7-8cf3b5361001",
    "description": "Direct SDK user + scanlog requests using query parameters with paging and date range support",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    { "key": "host", "value": "192.168.1.111" },
    { "key": "port", "value": "8090" },
    { "key": "sn", "value": "Fio66208021230737" },
    { "key": "limit", "value": "100" },
    { "key": "page", "value": "1" },
    { "key": "from", "value": "2026-03-26 00:00:00" },
    { "key": "to", "value": "2026-03-27 23:59:59" }
  ],
  "item": [
    {
      "name": "Get Users (Paging)",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/x-www-form-urlencoded", "type": "text" }
        ],
        "url": {
          "raw": "http://{{host}}:{{port}}/user/all/paging?sn={{sn}}&limit={{limit}}&page={{page}}",
          "protocol": "http",
          "host": ["{{host}}"],
          "port": "{{port}}",
          "path": ["user", "all", "paging"],
          "query": [
            { "key": "sn", "value": "{{sn}}" },
            { "key": "limit", "value": "{{limit}}" },
            { "key": "page", "value": "{{page}}" }
          ]
        }
      },
      "response": []
    },
    {
      "name": "Get All Scanlog (Paging + Date Range)",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/x-www-form-urlencoded", "type": "text" }
        ],
        "url": {
          "raw": "http://{{host}}:{{port}}/scanlog/all/paging?sn={{sn}}&limit={{limit}}&page={{page}}&from={{from}}&to={{to}}",
          "protocol": "http",
          "host": ["{{host}}"],
          "port": "{{port}}",
          "path": ["scanlog", "all", "paging"],
          "query": [
            { "key": "sn", "value": "{{sn}}" },
            { "key": "limit", "value": "{{limit}}" },
            { "key": "page", "value": "{{page}}" },
            { "key": "from", "value": "{{from}}" },
            { "key": "to", "value": "{{to}}" }
          ]
        }
      },
      "response": []
    },
    {
      "name": "Get New Scanlog (Date Range + Limit)",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/x-www-form-urlencoded", "type": "text" }
        ],
        "url": {
          "raw": "http://{{host}}:{{port}}/scanlog/new?sn={{sn}}&limit={{limit}}&from={{from}}&to={{to}}",
          "protocol": "http",
          "host": ["{{host}}"],
          "port": "{{port}}",
          "path": ["scanlog", "new"],
          "query": [
            { "key": "sn", "value": "{{sn}}" },
            { "key": "limit", "value": "{{limit}}" },
            { "key": "from", "value": "{{from}}" },
            { "key": "to", "value": "{{to}}" }
          ]
        }
      },
      "response": []
    }
  ]
}
```

---

## 6) Practical notes for future workers

1. If `/getScanLogs` returns `Command not found`, prioritize `/scanlog/new` and `/scanlog/all/paging`.
2. Use bounded `limit/page/max_pages` in `/api/scanlog/sync` to avoid request surge.
3. Keep raw curl evidence in issue notes when SDK behavior differs by firmware version.
4. Prefer endpoint fallback via env vars instead of hardcoding one path.
5. Queue implementation guidance:
   - Current app uses an in-process bounded worker. For multi-machine scale, consider `p-queue` or `bottleneck` (minimal dependencies) before moving to `bullmq` + Redis for fully durable distributed queues.
