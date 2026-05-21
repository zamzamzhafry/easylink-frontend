# Graph Report - .  (2026-05-21)

## Corpus Check
- 196 files · ~179.859 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1835 nodes · 4003 edges · 42 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 196 · Candidates: 451
- Excluded: 275 untracked · 36186 ignored · 1 sensitive · 1 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.
## God Nodes (most connected - your core abstractions)
1. `Q()` - 82 edges
2. `z9` - 68 edges
3. `z()` - 62 edges
4. `K()` - 41 edges
5. `W()` - 41 edges
6. `J()` - 38 edges
7. `G()` - 37 edges
8. `_7` - 37 edges
9. `RPCClient` - 34 edges
10. `X()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `callPhp()`  [EXTRACTED]
  app/api/scanlog/sync/route.js → app/api/machine/sync/route.js
- `POST()` --calls--> `callPhp()`  [EXTRACTED]
  app/api/scanlog/sync/route.js → app/api/machine/sync/route.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (48): AF(), BD(), bf(), Bh(), BV, Cg(), CS(), _D() (+40 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (103): calculateBradfordFactors(), calculateCheckInDistribution(), calculateDepartmentBreakdown(), calculateHeatmap(), calculateMetrics(), calculateWeeklyTrend(), GET(), getDayCount() (+95 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (38): AnalyticsPage(), isoDate(), monthStart(), AttendancePage(), compactDateWithDay(), formatMinutesToHours(), formatTargetSource(), normalizeDateKey() (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (21): _7, DM(), ej(), G5, hP, lQ, mh(), "node_modules/node-forge/lib/mgf.js"() (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (76): a4, aK(), BT(), c5(), C8(), ck(), cT(), CX() (+68 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (17): AV, ay(), cu(), EV, Fv(), Gv(), IQ, jJ (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (10): commonjsRequire(), createCommonjsModule(), encode(), getIPC(), IPCTransport, pack(), RPCClient, subKey() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (58): addEventListener(), certificateGet(), Cz(), Dp(), Em(), gD(), H(), jg() (+50 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (51): activeFileDelete(), activeFileGet(), activeFilePatch(), activeFilePost(), activeFilePut(), authenticationMiddleware(), commandGet(), commandPost() (+43 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (24): compactDateDayLabel(), contextDateRange(), employeeScheduleMetrics(), escapeHtml(), formatIsoDate(), inferShiftIconKey(), monthDates(), monthEnd() (+16 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (15): attributeChangedCallback(), bN(), connectedCallback(), disconnectedCallback(), $$g_p(), Iv(), lj(), NM (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (37): Ap(), bL(), cd(), Ch(), CL(), Eh(), Ey(), FD() (+29 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (19): debounce(), dv(), EA, loadSettings(), Mv(), "node_modules/finalhandler/node_modules/debug/src/debug.js"(), "node_modules/node-forge/lib/log.js"(), nv() (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (37): aT(), constructor(), Dd(), fS(), fx(), G(), HS(), J() (+29 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (33): _9(), az(), BM(), Cm(), D9(), E4(), ed(), eN() (+25 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (3): A8, gJ, o4

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (32): getMigrationGateStatus(), normalizeEnumValue(), resolveDataSourceCutoverMode(), resolveMachineParityExposureMode(), resolveMigrationFlags(), resolveMode(), resolvePolicySourceMode(), resolveReportingInteractionMode() (+24 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (27): normalizePayload(), toNumber(), buildPaginatedResponse(), computePaginationMeta(), parsePaginationParams(), toPositiveInt(), daysAgo(), ScanlogPage() (+19 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (30): addRoute(), AI(), ax(), bK(), c_(), C3(), getPublicApi(), H11() (+22 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (26): createFingerspotAdapter(), createWindowsSdkAdapter(), envDeviceConfig(), envWindowsSdkConfig(), extractListPayload(), getAdapter(), getDeviceInfoFromSdk(), getDeviceTimeFromSdk() (+18 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (33): a5(), C9(), Eo(), f8(), F9(), g8(), gK(), H8() (+25 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (29): appendValidationErrors(), hasTable(), importUsersToTbUser(), normalizeAndValidateRows(), recordChunk(), runMachineUserPollingJob(), upsertCheckpoint(), assertDangerConfirmation() (+21 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (24): jA(), "node_modules/body-parser/lib/read.js"(), "node_modules/content-disposition/index.js"(), "node_modules/depd/index.js"(), "node_modules/destroy/index.js"(), "node_modules/etag/index.js"(), "node_modules/express/node_modules/debug/src/index.js"(), "node_modules/iconv-lite/lib/extend-node.js"() (+16 more)

### Community 23 - "Community 23"
Cohesion: 0.1
Nodes (10): Gt(), Jh(), MX(), "node_modules/body-parser/lib/types/json.js"(), "node_modules/body-parser/lib/types/raw.js"(), "node_modules/body-parser/lib/types/text.js"(), "node_modules/body-parser/lib/types/urlencoded.js"(), r5() (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.26
Nodes (18): Get-DeviceInfo(), Get-ScanlogAll(), Get-ScanlogGPS(), Get-ScanlogNew(), Get-UserAll-Safe(), Initialize-Device(), Invoke-EasyLink(), Print-Header() (+10 more)

### Community 25 - "Community 25"
Cohesion: 0.19
Nodes (19): ensureCanonicalIdentity(), ensureCanonicalRoleBinding(), ensureEmployeeGroup(), ensureGroup(), ensureGroupOwnership(), ensureIdentificationMethods(), ensureKaryawan(), ensureKaryawanAuth() (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.3
Nodes (17): Confirm-Danger(), Get-DeviceInfo(), Get-ScanlogAll(), Get-ScanlogGPS(), Get-ScanlogNew(), Get-UserAll(), Initialize-Device(), Invoke-EasyLink() (+9 more)

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (13): buildQuickSummariesMetadataRows(), buildQuickSummariesTableColumns(), cellCountByDate(), cellTextByDate(), computeTotalPunches(), normalizeDateKeys(), normalizedGroupName(), numberOrZero() (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.23
Nodes (14): DELETE(), GET(), mergeRows(), normalizeHolidayRow(), POST(), toIsoDate(), fallbackIndonesianHolidays(), getCustomHolidays() (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (13): benchmarkExcelJs(), benchmarkXlsx(), buildHeader(), buildRows(), dayLabel(), fileSizeBytes(), main(), maybeImportExcelJs() (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.27
Nodes (9): buildTaskReference(), normalizeTaskInfo(), queryRecoveryTaskStatus(), runPowerShell(), startRecoveryTask(), buildPayload(), ensureAdmin(), GET() (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.36
Nodes (10): bridge_post(), delete_machine(), get_db_stats(), get_machine(), get_machine_by_sn(), get_machines(), get_pdo(), save_machine() (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.27
Nodes (5): canManageSchedule(), canViewDashboard(), toCanonicalEmployeeRoles(), buildSourceEventKey(), normalizeMachineRow()

### Community 33 - "Community 33"
Cohesion: 0.6
Nodes (9): addAutoFilter(), applyHeaderStyle(), autoFitColumns(), downloadWorkbook(), exportAnalyticsExcel(), exportPerformanceExcel(), exportReportExcel(), formatDate() (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.44
Nodes (9): addHeader(), addPageNumbers(), exportAnalyticsPDF(), exportPerformancePDF(), exportReportPDF(), formatDate(), formatNumber(), formatPercent() (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.44
Nodes (8): ensurePool(), executeStatements(), main(), parseCliArgs(), printUsage(), runSqlFile(), runValidate(), splitStatements()

### Community 36 - "Community 36"
Cohesion: 0.61
Nodes (6): Get-DeviceInfo(), Get-ScanlogNew(), Get-UserAllStream(), Invoke-EasyLink(), Save-JsonFile(), Write-Log()

### Community 37 - "Community 37"
Cohesion: 0.38
Nodes (1): l9

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (6): bridge_post(), bridge_url(), get_pdo(), main(), sync_scanlogs(), sync_users()

### Community 39 - "Community 39"
Cohesion: 0.7
Nodes (4): getClientIp(), isRateLimited(), isValidOrigin(), middleware()

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (1): o8

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (1): H9

## Knowledge Gaps
- **5 isolated node(s):** `hJ`, `YF`, `qF`, `zF`, `KF`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 37`** (1 nodes): `l9`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `o8`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `H9`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `z9` connect `Community 3` to `Community 0`, `Community 7`, `Community 8`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `_7` connect `Community 3` to `Community 0`, `Community 8`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `G5` connect `Community 3` to `Community 0`, `Community 18`, `Community 11`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `hJ`, `YF`, `qF` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._