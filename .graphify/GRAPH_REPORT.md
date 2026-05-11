# Graph Report - .  (2026-05-11)

## Corpus Check
- 180 files · ~135.631 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 713 nodes · 1309 edges · 30 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 180 · Candidates: 208
- Excluded: 74 untracked · 36183 ignored · 1 sensitive · 1 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.
## God Nodes (most connected - your core abstractions)
1. `Invoke-EasyLink()` - 16 edges
2. `runSeed()` - 16 edges
3. `Invoke-EasyLink()` - 14 edges
4. `Print-Header()` - 14 edges
5. `POST()` - 13 edges
6. `getAdapter()` - 12 edges
7. `POST()` - 11 edges
8. `toIsoString()` - 9 edges
9. `Print-Header()` - 9 edges
10. `envDeviceConfig()` - 9 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (21): AttendancePage(), compactDateWithDay(), formatMinutesToHours(), formatTargetSource(), normalizeDateKey(), quickSummaryDayMeta(), toSafeNumber(), DashboardOpsPanel() (+13 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (18): AnalyticsPage(), isoDate(), monthStart(), normalizePayload(), toNumber(), parseJsonSafely(), requestJson(), actionLabel() (+10 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (37): calculateBradfordFactors(), calculateCheckInDistribution(), calculateDepartmentBreakdown(), calculateHeatmap(), calculateMetrics(), calculateWeeklyTrend(), GET(), getDayCount() (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (30): GET(), PUT(), readConfig(), writeConfig(), base64UrlDecode(), base64UrlEncode(), buildScopedGroupAccess(), createAuthContextByLoginId() (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (21): createCumulativeSummaryTemplate(), GET(), hasAttendanceNoteColumn(), loadPredictionContextForPins(), POST(), canAccessAttendanceReviewQueue(), canAccessRawAttendance(), buildDateRange() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (20): compactDateDayLabel(), contextDateRange(), employeeScheduleMetrics(), escapeHtml(), formatIsoDate(), inferShiftIconKey(), monthDates(), monthEnd() (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (22): createFingerspotAdapter(), createWindowsSdkAdapter(), envDeviceConfig(), envWindowsSdkConfig(), extractListPayload(), getAdapter(), getDeviceInfoFromSdk(), getDeviceTimeFromSdk() (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.21
Nodes (23): buildDeltaReport(), closeBatch(), countTableRows(), enqueueSyncJob(), extractDeltaTotal(), formatDateValue(), formatTimeValue(), GET() (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.2
Nodes (22): assertDangerConfirmation(), cancelMachineJob(), createDedupeKey(), enqueueMachineJob(), fetchDeviceInfo(), findDuplicateJob(), GET(), getUserPollingConfig() (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (19): buildPaginatedResponse(), computePaginationMeta(), parsePaginationParams(), toPositiveInt(), GET(), nextIsoDate(), tableExists(), DELETE() (+11 more)

### Community 10 - "Community 10"
Cohesion: 0.26
Nodes (18): Get-DeviceInfo(), Get-ScanlogAll(), Get-ScanlogGPS(), Get-ScanlogNew(), Get-UserAll-Safe(), Initialize-Device(), Invoke-EasyLink(), Print-Header() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (19): ensureCanonicalIdentity(), ensureCanonicalRoleBinding(), ensureEmployeeGroup(), ensureGroup(), ensureGroupOwnership(), ensureIdentificationMethods(), ensureKaryawan(), ensureKaryawanAuth() (+11 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (4): hexToRgb(), shiftBadgeInlineStyle(), mapShiftToForm(), toTimeInput()

### Community 13 - "Community 13"
Cohesion: 0.3
Nodes (17): Confirm-Danger(), Get-DeviceInfo(), Get-ScanlogAll(), Get-ScanlogGPS(), Get-ScanlogNew(), Get-UserAll(), Initialize-Device(), Invoke-EasyLink() (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (13): buildQuickSummariesMetadataRows(), buildQuickSummariesTableColumns(), cellCountByDate(), cellTextByDate(), computeTotalPunches(), normalizeDateKeys(), normalizedGroupName(), numberOrZero() (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.23
Nodes (14): DELETE(), GET(), mergeRows(), normalizeHolidayRow(), POST(), toIsoDate(), fallbackIndonesianHolidays(), getCustomHolidays() (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (13): benchmarkExcelJs(), benchmarkXlsx(), buildHeader(), buildRows(), dayLabel(), fileSizeBytes(), main(), maybeImportExcelJs() (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.27
Nodes (9): buildTaskReference(), normalizeTaskInfo(), queryRecoveryTaskStatus(), runPowerShell(), startRecoveryTask(), buildPayload(), ensureAdmin(), GET() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.27
Nodes (9): buildDrilldownPayload(), buildNormalizedRows(), buildSeries(), createStatusCounts(), formatDrilldownRow(), GET(), parseDateParam(), reportCsv() (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (3): Dashboard(), getStats(), toMinutes()

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (5): colorForSeries(), formatText(), getStatusLabel(), normalizeKey(), ReportPage()

### Community 21 - "Community 21"
Cohesion: 0.27
Nodes (5): canManageSchedule(), canViewDashboard(), toCanonicalEmployeeRoles(), buildSourceEventKey(), normalizeMachineRow()

### Community 22 - "Community 22"
Cohesion: 0.6
Nodes (9): addAutoFilter(), applyHeaderStyle(), autoFitColumns(), downloadWorkbook(), exportAnalyticsExcel(), exportPerformanceExcel(), exportReportExcel(), formatDate() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.44
Nodes (9): addHeader(), addPageNumbers(), exportAnalyticsPDF(), exportPerformancePDF(), exportReportPDF(), formatDate(), formatNumber(), formatPercent() (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (8): getMigrationGateStatus(), normalizeEnumValue(), resolveDataSourceCutoverMode(), resolveMachineParityExposureMode(), resolveMigrationFlags(), resolveMode(), resolvePolicySourceMode(), resolveReportingInteractionMode()

### Community 25 - "Community 25"
Cohesion: 0.44
Nodes (8): ensurePool(), executeStatements(), main(), parseCliArgs(), printUsage(), runSqlFile(), runValidate(), splitStatements()

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (4): GET(), sse(), tableExists(), toBoundedInt()

### Community 27 - "Community 27"
Cohesion: 0.61
Nodes (6): Get-DeviceInfo(), Get-ScanlogNew(), Get-UserAllStream(), Invoke-EasyLink(), Save-JsonFile(), Write-Log()

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (7): appendValidationErrors(), hasTable(), importUsersToTbUser(), normalizeAndValidateRows(), recordChunk(), runMachineUserPollingJob(), upsertCheckpoint()

### Community 29 - "Community 29"
Cohesion: 0.7
Nodes (4): getClientIp(), isRateLimited(), isValidOrigin(), middleware()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._