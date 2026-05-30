# Graph Report - .  (2026-05-30)

## Corpus Check
- Large corpus: 1168 files · ~4.146.988 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1411 nodes · 2271 edges · 46 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output


## Input Scope
- Requested: all
- Resolved: all (source: cli)
- Included files: 1168 · Candidates: recursive
- Excluded: 0 untracked · 0 ignored · 1 sensitive · 0 missing committed
## God Nodes (most connected - your core abstractions)
1. `Invoke-EasyLink()` - 16 edges
2. `runSeed()` - 16 edges
3. `POST()` - 15 edges
4. `Invoke-EasyLink()` - 14 edges
5. `Print-Header()` - 14 edges
6. `POST()` - 12 edges
7. `getAdapter()` - 12 edges
8. `POST()` - 11 edges
9. `tableExists()` - 11 edges
10. `PUT()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `callPhp()`  [EXTRACTED]
  app/api/scanlog/sync/route.js → app/api/machine/sync/route.js
- `POST()` --calls--> `callPhp()`  [EXTRACTED]
  app/api/scanlog/sync/route.js → app/api/machine/sync/route.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (33): AnalyticsPage(), isoDate(), monthStart(), AttendancePage(), compactDateWithDay(), formatMinutesToHours(), formatTargetSource(), normalizeDateKey() (+25 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (73): calculateBradfordFactors(), calculateCheckInDistribution(), calculateDepartmentBreakdown(), calculateHeatmap(), calculateMetrics(), calculateWeeklyTrend(), GET(), getDayCount() (+65 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (9): forceLayout(), hideVideo(), onEnded(), showVideo(), checkTooltipState(), handlePointer(), getHomepageSponsors(), getShuffledSponsors() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (4): generateTableOfContents(), generateTableOfContentsFromMarkdown(), generateMetadata(), generateStaticParams()

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (39): addCombinator(), adoptValue(), ajaxConvert(), ajaxHandleResponses(), Animation(), augmentWidthOrHeight(), buildFragment(), condense() (+31 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (4): Page(), Page(), Page(), Page()

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (8): getControlComment(), getTextContent(), parseHighlightDirective(), highlight(), preprocess(), removeNewLines(), getTextContent(), slugify()

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (34): bb(), D(), Eb(), fb(), fc(), G(), hb(), hc() (+26 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (43): hop_b_build_failure_record(), hop_b_build_last_error(), hop_b_build_payload(), hop_b_build_record(), hop_b_build_retry_schedule(), hop_b_build_status_snapshot(), hop_b_classify_ingest_failure(), hop_b_clip_error_detail() (+35 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (22): compactDateDayLabel(), contextDateRange(), employeeScheduleMetrics(), escapeHtml(), formatIsoDate(), inferShiftIconKey(), monthDates(), monthEnd() (+14 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (26): buildInteractivePayload(), categorizeAttendanceEntry(), createCumulativeSummaryTemplate(), createInteractiveSummary(), GET(), hasAttendanceNoteColumn(), loadPredictionContextForPins(), POST() (+18 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (26): createFingerspotAdapter(), createWindowsSdkAdapter(), envDeviceConfig(), envWindowsSdkConfig(), extractListPayload(), getAdapter(), getDeviceInfoFromSdk(), getDeviceTimeFromSdk() (+18 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (29): appendValidationErrors(), hasTable(), importUsersToTbUser(), normalizeAndValidateRows(), recordChunk(), runMachineUserPollingJob(), upsertCheckpoint(), assertDangerConfirmation() (+21 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (26): normalizeRequestedSource(), resolveScanlogReadSource(), buildDeltaReport(), callPhp(), closeBatch(), countTableRows(), enqueueSyncJob(), extractDeltaTotal() (+18 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (23): normalizePayload(), toNumber(), buildPaginatedResponse(), computePaginationMeta(), parsePaginationParams(), toPositiveInt(), columnExists(), DELETE() (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (11): endOfRange(), inferShiftIconKey(), isoDate(), shiftIconLabel(), startOfRange(), startOfWeek(), colorForSeries(), formatText() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.26
Nodes (18): Get-DeviceInfo(), Get-ScanlogAll(), Get-ScanlogGPS(), Get-ScanlogNew(), Get-UserAll-Safe(), Initialize-Device(), Invoke-EasyLink(), Print-Header() (+10 more)

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (19): ensureCanonicalIdentity(), ensureCanonicalRoleBinding(), ensureEmployeeGroup(), ensureGroup(), ensureGroupOwnership(), ensureIdentificationMethods(), ensureKaryawan(), ensureKaryawanAuth() (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.3
Nodes (17): Confirm-Danger(), Get-DeviceInfo(), Get-ScanlogAll(), Get-ScanlogGPS(), Get-ScanlogNew(), Get-UserAll(), Initialize-Device(), Invoke-EasyLink() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (13): buildQuickSummariesMetadataRows(), buildQuickSummariesTableColumns(), cellCountByDate(), cellTextByDate(), computeTotalPunches(), normalizeDateKeys(), normalizedGroupName(), numberOrZero() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.23
Nodes (14): DELETE(), GET(), mergeRows(), normalizeHolidayRow(), POST(), toIsoDate(), fallbackIndonesianHolidays(), getCustomHolidays() (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (13): benchmarkExcelJs(), benchmarkXlsx(), buildHeader(), buildRows(), dayLabel(), fileSizeBytes(), main(), maybeImportExcelJs() (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.27
Nodes (9): buildTaskReference(), normalizeTaskInfo(), queryRecoveryTaskStatus(), runPowerShell(), startRecoveryTask(), buildPayload(), ensureAdmin(), GET() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.27
Nodes (9): buildDrilldownPayload(), buildNormalizedRows(), buildSeries(), createStatusCounts(), formatDrilldownRow(), GET(), parseDateParam(), reportCsv() (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.3
Nodes (8): authenticateRequest(), buildRequestId(), errorResponse(), handleHopBIngestPost(), hasJsonContentType(), jsonResponse(), parseJsonBody(), successResponse()

### Community 25 - "Community 25"
Cohesion: 0.5
Nodes (11): assert_same(), assert_true(), create_schema(), insert_staging(), sqlite_pdo(), start_test_server(), stop_test_server(), test_deterministic_selection_and_retry_reuse() (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (10): bridge_post(), delete_machine(), get_db_stats(), get_machine(), get_machine_by_sn(), get_machines(), get_pdo(), save_machine() (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (2): clearMenus(), getParent()

### Community 28 - "Community 28"
Cohesion: 0.27
Nodes (5): canManageSchedule(), canViewDashboard(), toCanonicalEmployeeRoles(), buildSourceEventKey(), normalizeMachineRow()

### Community 29 - "Community 29"
Cohesion: 0.6
Nodes (9): addAutoFilter(), applyHeaderStyle(), autoFitColumns(), downloadWorkbook(), exportAnalyticsExcel(), exportPerformanceExcel(), exportReportExcel(), formatDate() (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.44
Nodes (9): addHeader(), addPageNumbers(), exportAnalyticsPDF(), exportPerformancePDF(), exportReportPDF(), formatDate(), formatNumber(), formatPercent() (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.36
Nodes (6): CreateJSON_DataUser(), CreateJSON_ScanLog(), get_AllLog(), get_AllUser(), getTemplateAll(), webservice()

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (8): getMigrationGateStatus(), normalizeEnumValue(), resolveDataSourceCutoverMode(), resolveMachineParityExposureMode(), resolveMigrationFlags(), resolveMode(), resolvePolicySourceMode(), resolveReportingInteractionMode()

### Community 33 - "Community 33"
Cohesion: 0.47
Nodes (8): assert_true(), create_schema(), insert_staging(), run_test_server(), sqlite_pdo(), stop_test_server(), test_worker_no_work(), test_worker_queued_work()

### Community 34 - "Community 34"
Cohesion: 0.44
Nodes (8): ensurePool(), executeStatements(), main(), parseCliArgs(), printUsage(), runSqlFile(), runValidate(), splitStatements()

### Community 35 - "Community 35"
Cohesion: 0.61
Nodes (6): Get-DeviceInfo(), Get-ScanlogNew(), Get-UserAllStream(), Invoke-EasyLink(), Save-JsonFile(), Write-Log()

### Community 36 - "Community 36"
Cohesion: 0.54
Nodes (6): asTrimmedString(), buildHopBSourceEventKey(), isInteger(), isPlainObject(), validateHopBBatchPayload(), validateRecord()

### Community 37 - "Community 37"
Cohesion: 0.43
Nodes (7): buildHopBCanonicalPayload(), buildInsertParams(), buildScanAt(), finalizeReceipt(), insertHopBSafeEvents(), normalizeWorkcode(), writeHopBCanonicalBatch()

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (6): bridge_post(), bridge_url(), get_pdo(), main(), sync_scanlogs(), sync_users()

### Community 39 - "Community 39"
Cohesion: 0.4
Nodes (2): CreateUserJSON(), getTemplateAll()

### Community 40 - "Community 40"
Cohesion: 0.4
Nodes (2): quote(), str()

### Community 41 - "Community 41"
Cohesion: 0.4
Nodes (2): decodeSessionToken(), normalizeSubjectType()

### Community 44 - "Community 44"
Cohesion: 0.6
Nodes (3): b(), c(), d()

### Community 45 - "Community 45"
Cohesion: 0.7
Nodes (4): getClientIp(), isRateLimited(), isValidOrigin(), middleware()

### Community 51 - "Community 51"
Cohesion: 1
Nodes (2): GET(), jsonResponse()

### Community 52 - "Community 52"
Cohesion: 1
Nodes (2): buildHopBStatusResponse(), readHopBIngestStatus()

## Knowledge Gaps
- **Thin community `Community 27`** (2 nodes): `clearMenus()`, `getParent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `CreateUserJSON()`, `getTemplateAll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `quote()`, `str()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `decodeSessionToken()`, `normalizeSubjectType()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `GET()`, `jsonResponse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `buildHopBStatusResponse()`, `readHopBIngestStatus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `generateMetadata()` connect `Community 3` to `Community 5`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._