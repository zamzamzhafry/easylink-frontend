import { compactDateDayLabel } from '@/lib/schedule-helpers';

const DEFAULT_REPORT_TITLE = 'Attendance Quick Summaries';
const DEFAULT_GROUP_LABEL = 'All Groups';
const DEFAULT_EMPTY_GROUP_LABEL = 'Ungrouped';
const DEFAULT_SHEET_NAME = 'Sheet1';

const EXCEL_SHEET_MAX_LENGTH = 31;
const EXCEL_INVALID_SHEET_CHARS = /[:\\/?*\[\]]/g;

export const QUICK_SUMMARIES_BASE_COLUMNS = [
  { key: 'employee_name', label: 'Employee' },
  { key: 'employee_group', label: 'Group' },
  { key: 'total_punches', label: 'Total Punches' },
];

function normalizeDateKeys(dates) {
  if (!Array.isArray(dates)) return [];
  return dates.map((dateValue) => String(dateValue || '').slice(0, 10)).filter(Boolean);
}

export function quickSummaryDateLabel(value, locale = 'id-ID') {
  const dateKey = String(value || '').slice(0, 10);
  const compactLabel = compactDateDayLabel(dateKey, locale);
  return compactLabel || String(value || '');
}

function numberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed < 0 ? 0 : parsed;
}

function cellCountByDate(row, dateKey) {
  const cell = row?.cells?.[dateKey];
  if (cell?.count != null) return numberOrZero(cell.count);
  if (Array.isArray(cell?.punch_times)) return numberOrZero(cell.punch_times.length);
  return 0;
}

function displayTime(timeValue) {
  return String(timeValue || '').slice(0, 5) || '-';
}

function cellTextByDate(row, dateKey, emptyCell = '-') {
  const punchTimes = row?.cells?.[dateKey]?.punch_times;
  if (!Array.isArray(punchTimes) || punchTimes.length === 0) return emptyCell;
  return punchTimes.map((timeValue) => displayTime(timeValue)).join(' | ');
}

function normalizedGroupName(groupName, fallback = DEFAULT_EMPTY_GROUP_LABEL) {
  const value = String(groupName ?? '').trim();
  return value || fallback;
}

function resolveDateKeys(dates, row) {
  const fromInput = normalizeDateKeys(dates);
  if (fromInput.length > 0) return fromInput;
  return Object.keys(row?.cells || {}).sort();
}

export function buildQuickSummariesTableColumns(dates = []) {
  const dateKeys = normalizeDateKeys(dates);
  return [
    ...QUICK_SUMMARIES_BASE_COLUMNS,
    ...dateKeys.map((dateKey) => ({ key: dateKey, label: quickSummaryDateLabel(dateKey) })),
  ];
}

export function computeTotalPunches(row, dates = []) {
  const dateKeys = resolveDateKeys(dates, row);
  return dateKeys.reduce((sum, dateKey) => sum + cellCountByDate(row, dateKey), 0);
}

export function quickSummaryRowToObject(row, dates = [], options = {}) {
  const employee = row?.employee || {};
  const dateKeys = resolveDateKeys(dates, row);
  const groupFallback = options.emptyGroupLabel || DEFAULT_EMPTY_GROUP_LABEL;
  const emptyCellLabel = options.emptyCellLabel || '-';
  const tableRow = {
    employee_name: employee.nama || `PIN ${employee.pin || '-'}`,
    employee_pin: employee.pin || '-',
    employee_group: normalizedGroupName(employee.nama_group, groupFallback),
    total_punches: computeTotalPunches(row, dateKeys),
  };

  for (const dateKey of dateKeys) {
    tableRow[dateKey] = cellTextByDate(row, dateKey, emptyCellLabel);
  }

  return tableRow;
}

export function quickSummaryRowsToObjects(rows = [], dates = [], options = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => quickSummaryRowToObject(row, dates, options));
}

export function quickSummaryRowToArray(row, dates = [], options = {}) {
  const tableRow = quickSummaryRowToObject(row, dates, options);
  const orderedKeys = buildQuickSummariesTableColumns(dates).map((column) => column.key);
  return orderedKeys.map((key) => tableRow[key]);
}

export function quickSummaryRowsToArrays(rows = [], dates = [], options = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => quickSummaryRowToArray(row, dates, options));
}

export function buildQuickSummariesMetadataRows(meta = {}, options = {}) {
  const reportTitle = String(meta.reportTitle || DEFAULT_REPORT_TITLE);
  const from = String(meta.from || '-');
  const to = String(meta.to || '-');
  const compactFrom = quickSummaryDateLabel(from);
  const compactTo = quickSummaryDateLabel(to);
  const groupLabel = String(meta.groupLabel || DEFAULT_GROUP_LABEL);
  const labels = options.labels && typeof options.labels === 'object' ? options.labels : {};
  const reportLabel = String(labels.report || 'Report');
  const dateRangeLabel = String(labels.dateRange || 'Date Range');
  const groupKeyLabel = String(labels.group || 'Group');
  const rows = [
    [reportLabel, reportTitle],
    [dateRangeLabel, `${compactFrom} to ${compactTo}`],
    [groupKeyLabel, groupLabel],
  ];
  if (options.includeSpacerRow !== false) rows.push([]);
  return rows;
}

export function splitQuickSummaryRowsByGroup(rows = [], options = {}) {
  const groupFallback = options.emptyGroupLabel || DEFAULT_EMPTY_GROUP_LABEL;
  const grouped = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const groupName = normalizedGroupName(row?.employee?.nama_group, groupFallback);
    if (!grouped.has(groupName)) grouped.set(groupName, []);
    grouped.get(groupName).push(row);
  }

  return [...grouped.entries()].map(([groupName, groupRows]) => ({
    groupName,
    rows: groupRows,
  }));
}

export function sanitizeExcelSheetName(name, fallback = DEFAULT_SHEET_NAME) {
  const clean = String(name ?? '')
    .replace(EXCEL_INVALID_SHEET_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .slice(0, EXCEL_SHEET_MAX_LENGTH);

  if (clean) return clean;

  const cleanFallback = String(fallback || DEFAULT_SHEET_NAME)
    .replace(EXCEL_INVALID_SHEET_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .slice(0, EXCEL_SHEET_MAX_LENGTH);

  return cleanFallback || DEFAULT_SHEET_NAME;
}
