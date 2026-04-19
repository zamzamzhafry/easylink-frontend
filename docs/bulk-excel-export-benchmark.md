# Bulk Excel Export Benchmark (Attendance/Schedule)

Date: 2026-04-19

## Command used

```bash
node scripts/benchmark-bulk-excel-export.mjs --groups 12 --rows-per-sheet 1000 --days 31
```

## Benchmark profile

- Worksheets: 12
- Rows per worksheet: 1,000
- Total data rows: 12,000
- Date/day columns per row: 31 (`DD-day` compact labels)

## Results (single run)

| Module | Available | Sheets | Rows | Time (s) | Throughput (rows/s) | File Size (MB) |
|---|---|---:|---:|---:|---:|---:|
| `xlsx` | Yes | 12 | 12,000 | 0.83 | 14,452 | 3.835 |
| `exceljs` | No | - | - | - | - | - |

Output artifact:

- `tmp/benchmarks/bulk-benchmark-xlsx.xlsx`

## Recommendation for this repo

1. Use `xlsx` as the default bulk Excel export module now.
2. Keep exports in a single worksheet for bulk-all groups mode, with a `Group` column for grouping/filtering in Excel.
3. Use compact headers (`DD-day`) for wide month tables to reduce width and improve readability.
4. Only adopt `exceljs` if we need advanced formatting/features that `xlsx` cannot provide (for example richer styling or streaming-specific behavior), then re-run this benchmark after installing it.

## Practical usage notes

- Benchmark script path: `scripts/benchmark-bulk-excel-export.mjs`
- Quick rerun command:

```bash
node scripts/benchmark-bulk-excel-export.mjs
```

- Custom larger profile example:

```bash
node scripts/benchmark-bulk-excel-export.mjs --groups 20 --rows-per-sheet 2000 --days 31
```
