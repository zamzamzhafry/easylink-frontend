# HOP B Ingest API — Auth & Config Contract

> **Status:** Draft v1 — private-network bearer token  
> **Scope:** Windows sync worker → Linux Next.js ingest endpoint  
> **Audience:** Implementers of Task 7 (PHP sender), Task 8 (Next.js route handler), ops

---

## 1. Auth Mechanism

Bearer token shared secret transmitted over private LAN / approved VPN ranges.

- **No browser session cookies.** This is a machine-to-machine API.
- Token is a static shared secret configured identically on both sides.
- Transport is plain HTTP over trusted private network (no TLS in v1; documented below as future upgrade).

---

## 2. Environment Variables

### Windows sender (PHP sync worker config)

| Variable | Required | Description | Example |
|---|---|---|---|
| `HOP_B_INGEST_URL` | Yes | Full URL to ingest endpoint | `http://192.168.1.100:3000/api/scanlog/ingest` |
| `HOP_B_AUTH_TOKEN` | Yes | Shared secret bearer token | `sk-hop-b-2026-CHANGE-ME` |

Naming follows existing `FSERVICE_HOST` / `FSERVICE_PORT` SCREAMING_SNAKE style from `sync.php`.

### Linux receiver (Next.js `.env.local`)

| Variable | Required | Description | Example |
|---|---|---|---|
| `HOP_B_AUTH_TOKEN` | Yes | Same shared secret; validated on ingest endpoint | `sk-hop-b-2026-CHANGE-ME` |

> **Rotation:** In v1, rotate by updating both sides and restarting services. No hot-reload.

---

## 3. Request Format

### Headers

```
POST /api/scanlog/ingest HTTP/1.1
Host: <linux-vm>
Content-Type: application/json
Authorization: Bearer <HOP_B_AUTH_TOKEN>
X-Request-Id: <UUID v4 for tracing>
X-Sent-At: <ISO 8601 UTC, e.g. 2026-05-29T12:00:00Z>
```

### Required Headers

| Header | Required | Purpose |
|---|---|---|
| `Authorization` | Yes | `Bearer <token>` — validated first |
| `Content-Type` | Yes | Must be `application/json` |
| `X-Request-Id` | Recommended | UUID v4 for log correlation and replay detection |
| `X-Sent-At` | Recommended | Sender wall-clock; aids stale-request detection in future versions |

---

## 4. Auth Validation Rules

Processing order on the ingest endpoint:

1. **Missing/empty `Authorization` header** → immediate 401
2. **Malformed format** (not `Bearer <token>`) → immediate 401 (`AUTH_MISSING`)
3. **Token mismatch** → immediate 401 (`AUTH_INVALID`)
4. **Valid token** → proceed to payload validation
5. **No expiry / rotation / timestamp validation in v1** (private network assumption)

### Future upgrade path (v2)

- HMAC-SHA256 request signing with `X-Sent-At` timestamp window (±5 min)
- Prevents replay even if token leaks
- Backward-compatible: accept both Bearer and HMAC during migration window

---

## 5. Error Response Shapes

All error responses use a consistent JSON envelope:

```json
{
  "status": "error",
  "code": "<MACHINE_READABLE_CODE>",
  "message": "<human-readable description>",
  "request_id": "<echoed X-Request-Id or null>"
}
```

### Error Response Catalog

| HTTP | Code | Meaning | When |
|---|---|---|---|
| `400` | `PAYLOAD_INVALID` | Malformed JSON or missing required fields | Body parse fails, missing `batch_id`, `records`, etc. |
| `400` | `BATCH_EMPTY` | Records array is empty | `records: []` |
| `400` | `SCHEMA_VERSION_UNSUPPORTED` | Unknown `schema_version` value | `schema_version` not in supported set |
| `401` | `AUTH_MISSING` | No Authorization header or malformed Bearer prefix | Header absent or not `Bearer <token>` |
| `401` | `AUTH_INVALID` | Wrong token | Token doesn't match `HOP_B_AUTH_TOKEN` |
| `409` | `BATCH_CONFLICT` | Same `batch_id` with different `payload_hash` | Idempotency violation — same ID, different content |
| `500` | `INTERNAL_ERROR` | Server error during processing | DB failure, unhandled exception |

### Success Response

```json
{
  "status": "ok",
  "batch_id": "<echoed batch_id>",
  "accepted": 42,
  "duplicates": 3,
  "request_id": "<echoed X-Request-Id>"
}
```

---

## 6. Concrete Examples

### 6.1 Successful auth + batch post

```bash
curl -s -X POST http://192.168.1.100:3000/api/scanlog/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-hop-b-2026-CHANGE-ME" \
  -H "X-Request-Id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "X-Sent-At: 2026-05-29T12:00:00Z" \
  -d '{
    "schema_version": "1.0",
    "batch_id": "win-batch-20260529-001",
    "payload_hash": "sha256:abcdef1234567890",
    "records": [
      {
        "source_event_key": "FIO-66208021230737-20260529-120000-1",
        "sn": "Fio66208021230737",
        "pin": "12345",
        "scan_at": "2026-05-29T12:00:00+08:00",
        "verify_mode": 1,
        "in_out": "in"
      },
      {
        "source_event_key": "FIO-66208021230737-20260529-120100-2",
        "sn": "Fio66208021230737",
        "pin": "12346",
        "scan_at": "2026-05-29T12:01:00+08:00",
        "verify_mode": 1,
        "in_out": "out"
      }
    ]
  }'
```

**Response (200):**

```json
{
  "status": "ok",
  "batch_id": "win-batch-20260529-001",
  "accepted": 2,
  "duplicates": 0,
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 6.2 Auth failure — missing header

```bash
curl -s -X POST http://192.168.1.100:3000/api/scanlog/ingest \
  -H "Content-Type: application/json" \
  -d '{"schema_version":"1.0","batch_id":"test","records":[]}'
```

**Response (401):**

```json
{
  "status": "error",
  "code": "AUTH_MISSING",
  "message": "Authorization header required",
  "request_id": null
}
```

### 6.3 Auth failure — wrong token

```bash
curl -s -X POST http://192.168.1.100:3000/api/scanlog/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-token-value" \
  -H "X-Request-Id: 660e8400-e29b-41d4-a716-446655440001" \
  -d '{"schema_version":"1.0","batch_id":"test","records":[]}'
```

**Response (401):**

```json
{
  "status": "error",
  "code": "AUTH_INVALID",
  "message": "Invalid bearer token",
  "request_id": "660e8400-e29b-41d4-a716-446655440001"
}
```

### 6.4 Malformed batch — missing required fields

```bash
curl -s -X POST http://192.168.1.100:3000/api/scanlog/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-hop-b-2026-CHANGE-ME" \
  -H "X-Request-Id: 770e8400-e29b-41d4-a716-446655440002" \
  -d '{"not_a_valid_payload": true}'
```

**Response (400):**

```json
{
  "status": "error",
  "code": "PAYLOAD_INVALID",
  "message": "Missing required fields: schema_version, batch_id, records",
  "request_id": "770e8400-e29b-41d4-a716-446655440002"
}
```

### 6.5 Replay / conflict — same batch_id, different payload_hash

```bash
curl -s -X POST http://192.168.1.100:3000/api/scanlog/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-hop-b-2026-CHANGE-ME" \
  -H "X-Request-Id: 880e8400-e29b-41d4-a716-446655440003" \
  -d '{
    "schema_version": "1.0",
    "batch_id": "win-batch-20260529-001",
    "payload_hash": "sha256:DIFFERENT_HASH_VALUE",
    "records": [{"source_event_key":"different","sn":"x","pin":"1","scan_at":"2026-05-29T12:00:00Z","verify_mode":1,"in_out":"in"}]
  }'
```

**Response (409):**

```json
{
  "status": "error",
  "code": "BATCH_CONFLICT",
  "message": "Batch win-batch-20260529-001 already received with different payload hash",
  "request_id": "880e8400-e29b-41d4-a716-446655440003"
}
```

### 6.6 Idempotent retry — same batch_id, same payload_hash

Same request as 6.1 sent again:

**Response (200):**

```json
{
  "status": "ok",
  "batch_id": "win-batch-20260529-001",
  "accepted": 0,
  "duplicates": 2,
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 7. Implementation Notes

### For Task 7 (PHP sender)

```php
define('HOP_B_INGEST_URL', getenv('HOP_B_INGEST_URL') ?: '');
define('HOP_B_AUTH_TOKEN', getenv('HOP_B_AUTH_TOKEN') ?: '');

// Send with curl
curl_setopt_array($ch, [
    CURLOPT_URL            => HOP_B_INGEST_URL,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($batch),
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . HOP_B_AUTH_TOKEN,
        'X-Request-Id: ' . gen_uuid_v4(),
        'X-Sent-At: ' . gmdate('Y-m-d\TH:i:s\Z'),
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
]);
```

### For Task 8 (Next.js route handler)

```js
// app/api/scanlog/ingest/route.js
export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const requestId = request.headers.get('x-request-id') || null;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { status: 'error', code: 'AUTH_MISSING', message: 'Authorization header required', request_id: requestId },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  if (token !== process.env.HOP_B_AUTH_TOKEN) {
    return NextResponse.json(
      { status: 'error', code: 'AUTH_INVALID', message: 'Invalid bearer token', request_id: requestId },
      { status: 401 }
    );
  }

  // ... payload validation and processing
}
```

---

## 8. Security Considerations

| Concern | v1 Mitigation | Future (v2) |
|---|---|---|
| Token in transit | Private LAN / VPN only | Add TLS |
| Token leak / replay | Network boundary trust | HMAC-SHA256 + timestamp window |
| Brute force | Private network, no public exposure | Rate limiting + IP allowlist |
| Token rotation | Manual: update both sides, restart | Dual-token grace period |
| Logging | Never log token value; log `AUTH_MISSING`/`AUTH_INVALID` events | Structured audit log |
