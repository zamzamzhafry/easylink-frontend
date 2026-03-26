# Draft: Machine SDK Session Handoff (2026-03-27)

## Confirmed Runtime Findings

### Device Info (works)

```bash
curl -sS -m 40 -X POST "http://192.168.1.111:8090/dev/info?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"
```

Response:

```json
{
  "Result": true,
  "DEVINFO": {
    "Jam": "27/03/2026 03:17:04",
    "Admin": "1",
    "User": "133",
    "FP": "132",
    "Face": "134",
    "Vein": "134",
    "CARD": "0",
    "PWD": "0",
    "All Operasional": "0",
    "All Presensi": "55598",
    "New Operasional": "0",
    "New Presensi": "0"
  }
}
```

### New Scanlog (valid empty)

```bash
curl -sS -m 90 -X POST "http://192.168.1.111:8090/scanlog/new?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"
```

Response:

```json
{ "Result": false, "message_code": 0, "message": "No data" }
```

### All Scanlog Paging (session flag present, empty data chunk)

```bash
curl -sS -m 120 -X POST "http://192.168.1.111:8090/scanlog/all/paging?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"
```

Response:

```json
{ "IsSession": true, "Result": true, "Data": [] }
```

## Interpretation Notes

- `/dev/info` path is stable and returns expected JSON body.
- `/scanlog/new` can return a no-data payload and should not be treated as a fatal error.
- `/scanlog/all/paging` can return `IsSession=true` with an empty `Data` chunk; pagination/session loop handling remains important.
- Vendor SDK behavior may vary by version/firmware; escalation to machine vendor for updates is reasonable (latest known package around 2020).

## Backlog / TODO for Future Worker

1. Make the queue monitor act as a true right-side nav panel shared across Machine Connect and Scanlog pages.
2. Move machine actions (device info/time/users/etc.) into worker jobs so all machine operations are queue-able.
3. Draft extensible architecture for non-machine attendance channels (phone/GPS/camera) as separate backend services.
4. Improve export customization (letterhead, signature blocks, WYSIWYG layout tooling).
5. Implement multi-machine management by moving env-only machine config into DB-backed records.
6. Reduce UI text overload for testers; use clearer iconography/color semantics and simplify heavy debug text by default.
7. Rework permissions/auth model for cleaner role boundaries.
8. Continue migration to clean database schema/performance baseline; phase out legacy PHP/MySQL sample structure.

## Scope Boundary for Next Session

- This session ends with analysis + documented observations.
- No further implementation changes are included in this handoff step.
