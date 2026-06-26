import { inferShiftIconKey } from './shift-icon-options';
import { csvEscape } from './csv';

export const DAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const SHIFT_ICON_MAP = {
  sun: '☀️',
  sunset: '🌇',
  moon: '🌙',
  briefcase: '💼',
  bed: '🛌',
  plane: '✈️',
  star: '⭐',
  shield: '🛡️',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shiftIconFor(shift) {
  const key = shift?.icon_key || inferShiftIconKey(shift?.nama_shift);
  return SHIFT_ICON_MAP[key] ?? '⭐';
}

export function shiftAbbreviation(shift) {
  const name = String(shift?.nama_shift ?? '').toLowerCase();
  if (name.includes('pagi')) return 'P';
  if (name.includes('siang')) return 'S';
  if (name.includes('malam')) return 'M';
  if (name.includes('middle')) return 'MD';
  if (name.includes('libur')) return 'L';
  if (name.includes('cuti')) return 'C';
  if (name.includes('non')) return 'N';
  const firstWord = String(shift?.nama_shift ?? '-').split(/\s+/)[0];
  return firstWord.length > 3 ? firstWord.slice(0, 3) : firstWord;
}

// Inline SVG paths (lucide-derived, 24x24) for the compact print mode —
// printable, no external assets, no React. Falls back to briefcase.
const SHIFT_SYMBOL_PATHS = {
  sun: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  sunset: 'M17 18a5 5 0 0 0-10 0M12 9V2M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  briefcase: 'M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 5h4v2h-4z',
  bed: 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8V4a2 2 0 0 1 2-2h2',
  plane: 'M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.6 1.9L9 11l-2 2-3-1-1 1 3 2 2 3 1-1-1-3 2-2 2.9 4.8a1 1 0 0 0 1.9-.6z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
};

export function shiftSymbolSvg(shift, color) {
  const key = String(shift?.icon_key || inferShiftIconKey(shift?.nama_shift || '')).toLowerCase();
  const path = SHIFT_SYMBOL_PATHS[key] || SHIFT_SYMBOL_PATHS.briefcase;
  return `<svg class="shift-symbol-icon" viewBox="0 0 24 24" fill="none" stroke="${escapeHtml(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

export function formatIsoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  return text.includes('T') ? text.slice(0, 10) : text.slice(0, 10);
}

function shortWeekday(value, locale = 'id-ID') {
  return new Date(`${normalizeDateKey(value)}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'short',
  });
}

export function compactDateDayLabel(value, locale = 'id-ID') {
  const isoDate = normalizeDateKey(value);
  if (!isoDate) return '';
  const day = String(new Date(`${isoDate}T00:00:00`).getDate()).padStart(2, '0');
  return `${day} ${shortWeekday(isoDate, locale)}`;
}

export function addDays(dateValue, amount) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + amount);
  return date;
}

export function weekStart(value) {
  const date = new Date(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return date;
}

export function weekDates(weekOf) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekOf, index));
}

export function monthStart(value = new Date()) {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function monthEnd(value = new Date()) {
  const date = monthStart(value);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date;
}

export function monthDates(value = new Date()) {
  const start = monthStart(value);
  const end = monthEnd(value);
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function monthLabel(value = new Date(), locale = 'en-US') {
  return monthStart(value).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function scheduleCsvTemplate(employees, dates, getShiftForDate) {
  const rows = scheduleTemplateRows(employees, dates, getShiftForDate);

  return rows
    .map((line) => line.map(csvEscape).join(','))
    .join('\n');
}

export function scheduleTemplateRows(employees, dates, getShiftForDate) {
  const headers = ['Nama', 'PIN', ...dates.map((date) => compactDateDayLabel(date, 'id-ID'))];
  const rows = employees.map((employee) => [
    employee.nama,
    employee.pin,
    ...dates.map((date) => getShiftForDate(employee.id, formatIsoDate(date))?.nama_shift ?? ''),
  ]);
  return [headers, ...rows];
}

export function groupOptionsFromEmployees(employees) {
  const groups = employees
    .filter((employee) => employee.group_id)
    .map((employee) => ({ id: employee.group_id, name: employee.nama_group }));

  return [...new Map(groups.map((group) => [group.id, group])).values()];
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map(parseCsvLine);
}

export function parseScheduleTemplateImport(csvText, employees, shifts, options = {}) {
  const rows = parseCsv(csvText);
  return parseScheduleTemplateRows(rows, employees, shifts, options);
}

function parseIsoFromDateHeader(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch?.[1]) return isoMatch[1];
  return null;
}

function parseDayNumberFromHeader(value) {
  const text = String(value ?? '').trim();
  const dayMatch = text.match(/^(\d{1,2})(?:\s+[\p{L}.-]+)?$/u);
  if (!dayMatch?.[1]) return null;
  const day = Number(dayMatch[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return day;
}

function contextDateRange(from, to) {
  const fromIso = normalizeDateKey(from);
  const toIso = normalizeDateKey(to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) return [];
  if (fromIso > toIso) return [];

  const dates = [];
  const cursor = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  while (cursor <= end) {
    dates.push(normalizeDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function resolveDateColumns(headers, options = {}) {
  const contextDates = contextDateRange(options.from, options.to);
  let contextCursor = 0;

  return headers.map((headerCell) => {
    const explicitIso = parseIsoFromDateHeader(headerCell);
    if (explicitIso) {
      if (contextDates.length > 0) {
        const matchedContextIndex = contextDates.indexOf(explicitIso);
        if (matchedContextIndex >= contextCursor) {
          contextCursor = matchedContextIndex + 1;
        }
      }
      return explicitIso;
    }

    const dayNumber = parseDayNumberFromHeader(headerCell);
    if (!dayNumber || !contextDates.length) return null;

    for (let cursorIndex = contextCursor; cursorIndex < contextDates.length; cursorIndex += 1) {
      const contextIso = contextDates[cursorIndex];
      const contextDayNumber = Number(contextIso.slice(8, 10));
      if (contextDayNumber !== dayNumber) continue;
      contextCursor = cursorIndex + 1;
      return contextIso;
    }

    for (let cursorIndex = 0; cursorIndex < contextDates.length; cursorIndex += 1) {
      const contextIso = contextDates[cursorIndex];
      const contextDayNumber = Number(contextIso.slice(8, 10));
      if (contextDayNumber !== dayNumber) continue;
      return contextIso;
    }

    return null;
  });
}

export function parseScheduleTemplateRows(rows, employees, shifts, options = {}) {
  if (rows.length < 2) {
    return { entries: [], errors: [{ row: 1, message: 'CSV has no data rows.' }] };
  }

  const header = rows[0];
  const rawDateColumns = header.slice(2);
  const resolvedDateColumns = resolveDateColumns(rawDateColumns, options);
  const firstResolvedDateIndex = resolvedDateColumns.findIndex((value) => Boolean(value));
  if (firstResolvedDateIndex < 0) {
    return {
      entries: [],
      errors: [{ row: 1, message: 'No date headers found.' }],
    };
  }

  const dateColumns = [];
  const seenDates = new Set();

  for (let index = 0; index < resolvedDateColumns.length; index += 1) {
    const dateValue = resolvedDateColumns[index];
    const headerValue = String(rawDateColumns[index] ?? '').trim();

    if (!dateValue) {
      if (index < firstResolvedDateIndex) continue;
      if (!headerValue) continue;
      return {
        entries: [],
        errors: [{ row: 1, message: `Invalid date header "${rawDateColumns[index]}".` }],
      };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return {
        entries: [],
        errors: [{ row: 1, message: `Invalid date header "${rawDateColumns[index]}".` }],
      };
    }

    if (seenDates.has(dateValue)) {
      return {
        entries: [],
        errors: [{ row: 1, message: `Duplicate date header "${rawDateColumns[index]}".` }],
      };
    }

    seenDates.add(dateValue);
    dateColumns.push({ dateValue, sourceColumnIndex: index + 2 });
  }

  if (!dateColumns.length) {
    return {
      entries: [],
      errors: [{ row: 1, message: 'No valid date headers found.' }],
    };
  }

  const employeeByPin = new Map(
    employees.map((employee) => [String(employee.pin ?? ''), employee])
  );
  const shiftByName = new Map(
    shifts.map((shift) => [String(shift.nama_shift ?? '').toLowerCase(), shift])
  );
  const shiftById = new Map(shifts.map((shift) => [String(shift.id), shift]));

  const entries = [];
  const errors = [];

  rows.slice(1).forEach((row, rowIndex) => {
    const csvRow = rowIndex + 2;
    const pin = String(row[1] ?? '').trim();
    if (!pin) {
      errors.push({ row: csvRow, message: 'PIN is required.' });
      return;
    }

    const employee = employeeByPin.get(pin);
    if (!employee) {
      errors.push({ row: csvRow, message: `PIN ${pin} not found in employee list.` });
      return;
    }

    dateColumns.forEach((column) => {
      const cell = String(row[column.sourceColumnIndex] ?? '').trim();
      if (!cell) return;

      const shift =
        shiftById.get(cell) ||
        shiftByName.get(cell.toLowerCase()) ||
        shiftByName.get(cell.toLowerCase().replace(/\s+/g, ' '));

      if (!shift) {
        errors.push({
          row: csvRow,
          message: `Unknown shift "${cell}" on ${column.dateValue} for PIN ${pin}.`,
        });
        return;
      }

      entries.push({
        karyawan_id: employee.id,
        tanggal: column.dateValue,
        shift_id: shift.id,
        pin,
        nama: employee.nama,
        shift_name: shift.nama_shift,
      });
    });
  });

  return { entries, errors };
}

export function scheduleHoursSummary(employees, schedules, shifts) {
  const shiftHours = new Map(
    shifts.map((shift) => [Number(shift.id), Number(shift.jam_kerja ?? 0) || 0])
  );
  const summary = new Map(
    employees.map((employee) => [
      Number(employee.id),
      { ...employee, scheduled_days: 0, estimated_hours: 0 },
    ])
  );

  schedules.forEach((schedule) => {
    const employeeId = Number(schedule.karyawan_id);
    const row = summary.get(employeeId);
    if (!row) return;
    row.scheduled_days += 1;
    row.estimated_hours += shiftHours.get(Number(schedule.shift_id)) || 0;
  });

  return [...summary.values()].sort((a, b) => b.estimated_hours - a.estimated_hours);
}

export function employeeScheduleMetrics(
  employees,
  schedules,
  shifts,
  scanCompletions,
  today = new Date()
) {
  const shiftHours = new Map(
    shifts.map((shift) => [Number(shift.id), Number(shift.jam_kerja ?? 0) || 0])
  );
  const completionSet = new Set(
    (scanCompletions ?? []).map(
      (item) => `${Number(item.karyawan_id)}|${String(item.tanggal).slice(0, 10)}`
    )
  );
  const todayIso = formatIsoDate(today);
  const map = new Map(
    employees.map((employee) => [
      Number(employee.id),
      {
        employee_id: Number(employee.id),
        shifted_days: 0,
        planned_hours: 0,
        done_hours: 0,
        pending_hours: 0,
        future_hours: 0,
      },
    ])
  );

  schedules.forEach((schedule) => {
    const employeeId = Number(schedule.karyawan_id);
    const metric = map.get(employeeId);
    if (!metric) return;

    const dateValue = String(schedule.tanggal).slice(0, 10);
    const hours = shiftHours.get(Number(schedule.shift_id)) || 0;
    metric.shifted_days += 1;
    metric.planned_hours += hours;

    const hasCompletion = completionSet.has(`${employeeId}|${dateValue}`);
    if (hasCompletion) {
      metric.done_hours += hours;
      return;
    }

    if (dateValue > todayIso) {
      metric.future_hours += hours;
      return;
    }

    metric.pending_hours += hours;
  });

  return map;
}

function isPaidLeaveShift(shift) {
  const name = String(shift?.nama_shift ?? '').toLowerCase();
  return name.includes('cuti') || name.includes('libur');
}

export function schedulePrintHtml(employees, dates, getShiftForDate, options = {}) {
  const holidayMap = options.holidayMap || {};
  const compact = Boolean(options.compact);
  const today = formatIsoDate(new Date());
  const title = String(options.title || 'Shift Schedule');
  const groupLabel = String(options.groupLabel || 'All Groups');
  const fromLabel = options.from ? compactDateDayLabel(options.from, 'id-ID') : '';
  const toLabel = options.to ? compactDateDayLabel(options.to, 'id-ID') : '';
  const dayHeaders = dates.map((date) => {
    const iso = formatIsoDate(date);
    const weekday = new Date(`${iso}T00:00:00`).getDay();
    const holiday = holidayMap[iso] || null;
    return {
      date: iso,
      compactLabel: compactDateDayLabel(iso, 'id-ID'),
      isToday: iso === today,
      isSunday: weekday === 0,
      isFriday: weekday === 5,
      holiday,
    };
  });
  const rows = employees
    .map((employee) => {
      const cells = dayHeaders
        .map((day) => {
          const shift = getShiftForDate(employee.id, day.date);
          const holidayClass = day.holiday ? 'is-holiday' : '';
          const dayClass = day.isSunday ? 'is-sunday' : day.isFriday ? 'is-friday' : '';
          const todayClass = day.isToday ? 'is-today' : '';
          if (!shift) {
            return `<td class="${holidayClass} ${dayClass} ${todayClass}"><span class="shift-pill shift-empty">-</span></td>`;
          }
          const color = shift.color_hex || '#6B7280';
          const abbr = escapeHtml(shiftAbbreviation(shift));
          const fullName = escapeHtml(shift.nama_shift || '-');
          const paidLeaveClass = isPaidLeaveShift(shift) ? 'is-paid-leave' : '';
          const pill = compact
            ? `<span class="shift-symbol" style="--shift:${color}" title="${fullName}">${shiftSymbolSvg(shift, color)}</span>`
            : `<span class="shift-pill" style="--shift:${color}" title="${fullName}">${abbr}</span>`;
          return `<td class="${holidayClass} ${dayClass} ${todayClass} ${paidLeaveClass}">${pill}</td>`;
        })
        .join('');
      return `<tr><td class="employee-col">${escapeHtml(employee.nama)} (PIN ${escapeHtml(employee.pin ?? '-')})</td>${cells}</tr>`;
    })
    .join('');

  return `
    <html>
      <head>
        <title>Schedule Print</title>
        <style>
          @page { size: landscape; margin: 4mm; }
          html, body { margin: 0; padding: 0; }
          body { font-family: Inter, Arial, sans-serif; padding: 2mm; color: #0f172a; }
          h1 { margin: 0 0 2px; font-size: 14px; }
          p.meta { margin: 0 0 1px; font-size: 10px; color: #475569; }
          table { border-collapse: collapse; width: 100%; font-size: 9px; table-layout: fixed; }
          th, td { border: 1px solid #cbd5e1; padding: 2px 3px; text-align: left; vertical-align: top; word-break: break-word; }
          th.employee-col, td.employee-col { width: 138px; min-width: 138px; }
          th { background: linear-gradient(to bottom, #dcfce7, #fef3c7); }
          .th-sunday { color: #b91c1c; }
          .th-friday { color: #166534; }
          .th-holiday { background: linear-gradient(to bottom, #fecaca, #fee2e2); color: #7f1d1d; }
          .th-today { box-shadow: inset 0 0 0 2px #0f766e; }
          td.is-sunday { background: #fef2f2; }
          td.is-friday { background: #f0fdf4; }
          td.is-holiday { background: #fff1f2; }
          td.is-today { outline: 2px solid #0f766e; outline-offset: -2px; }
          td.is-paid-leave { background: #f8fafc; }
          .shift-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            border: 1px solid color-mix(in srgb, var(--shift), #64748b 35%);
            background: color-mix(in srgb, var(--shift), #ffffff 82%);
            color: #0f172a;
            border-radius: 999px;
            padding: 1px 6px;
            font-weight: 600;
            white-space: nowrap;
          }
          .shift-empty {
            border-color: #cbd5e1;
            background: #f8fafc;
            color: #64748b;
          }
          .shift-symbol {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--shift), #ffffff 88%);
          }
          .shift-symbol-icon { width: 14px; height: 14px; }

        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${fromLabel && toLabel ? `<p class="meta">Periode: ${escapeHtml(fromLabel)} - ${escapeHtml(toLabel)}</p>` : ''}
        <p class="meta">Grup: ${escapeHtml(groupLabel)}</p>
        
        <table>
          <thead>
            <tr><th class="employee-col">Employee</th>${dayHeaders
              .map((day) => {
                const classes = [
                  day.isSunday ? 'th-sunday' : '',
                  day.isFriday ? 'th-friday' : '',
                  day.holiday ? 'th-holiday' : '',
                  day.isToday ? 'th-today' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return `<th class="${classes}">${escapeHtml(day.compactLabel)}</th>`;
              })
              .join('')}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}
