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

function inferShiftIconKey(name) {
  const normalized = String(name ?? '').toLowerCase();
  if (normalized.includes('pagi')) return 'sun';
  if (normalized.includes('siang')) return 'sunset';
  if (normalized.includes('malam')) return 'moon';
  if (normalized.includes('middle')) return 'briefcase';
  if (normalized.includes('libur')) return 'bed';
  if (normalized.includes('cuti')) return 'plane';
  if (normalized.includes('non')) return 'shield';
  return 'star';
}

function shiftIconFor(shift) {
  const key = shift?.icon_key || inferShiftIconKey(shift?.nama_shift);
  return SHIFT_ICON_MAP[key] ?? '⭐';
}

export function formatIsoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
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
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function scheduleTemplateRows(employees, dates, getShiftForDate) {
  const headers = ['Nama', 'PIN', ...dates.map((date) => formatIsoDate(date))];
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

export function parseScheduleTemplateImport(csvText, employees, shifts) {
  const rows = parseCsv(csvText);
  return parseScheduleTemplateRows(rows, employees, shifts);
}

export function parseScheduleTemplateRows(rows, employees, shifts) {
  if (rows.length < 2) {
    return { entries: [], errors: [{ row: 1, message: 'CSV has no data rows.' }] };
  }

  const header = rows[0];
  const dateColumns = header.slice(2);
  const validDateColumns = dateColumns.map((dateValue) => /^\d{4}-\d{2}-\d{2}$/.test(dateValue));
  const invalidDateIndex = validDateColumns.findIndex((ok) => !ok);
  if (invalidDateIndex >= 0) {
    return {
      entries: [],
      errors: [{ row: 1, message: `Invalid date header "${dateColumns[invalidDateIndex]}".` }],
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

    dateColumns.forEach((dateValue, dateIndex) => {
      const cell = String(row[dateIndex + 2] ?? '').trim();
      if (!cell) return;

      const shift =
        shiftById.get(cell) ||
        shiftByName.get(cell.toLowerCase()) ||
        shiftByName.get(cell.toLowerCase().replace(/\s+/g, ' '));

      if (!shift) {
        errors.push({
          row: csvRow,
          message: `Unknown shift "${cell}" on ${dateValue} for PIN ${pin}.`,
        });
        return;
      }

      entries.push({
        karyawan_id: employee.id,
        tanggal: dateValue,
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
  const today = formatIsoDate(new Date());
  const dayHeaders = dates.map((date) => {
    const iso = formatIsoDate(date);
    const weekday = new Date(iso).getDay();
    const holiday = holidayMap[iso] || null;
    return {
      date: iso,
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
          const icon = shiftIconFor(shift);
          const color = shift.color_hex || '#6B7280';
          const label = escapeHtml(shift.nama_shift || '-');
          const paidLeaveClass = isPaidLeaveShift(shift) ? 'is-paid-leave' : '';
          const holidayLabel = day.holiday
            ? `<div class="holiday-note">${escapeHtml(day.holiday.name)}</div>`
            : '';
          return `<td class="${holidayClass} ${dayClass} ${todayClass} ${paidLeaveClass}"><span class="shift-pill" style="--shift:${color}">${icon} ${label}</span>${holidayLabel}</td>`;
        })
        .join('');
      return `<tr><td>${escapeHtml(employee.nama)} (PIN ${escapeHtml(employee.pin ?? '-')})</td>${cells}</tr>`;
    })
    .join('');

  return `
    <html>
      <head>
        <title>Schedule Print</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 16px; color: #0f172a; }
          h1 { margin: 0 0 12px; font-size: 18px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
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
            padding: 2px 8px;
            font-weight: 600;
            white-space: nowrap;
          }
          .shift-empty {
            border-color: #cbd5e1;
            background: #f8fafc;
            color: #64748b;
          }
          .holiday-note {
            margin-top: 4px;
            font-size: 10px;
            color: #9f1239;
            max-width: 120px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .legend {
            margin: 0 0 12px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 11px;
          }
          .legend > span {
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            padding: 2px 8px;
            background: #f8fafc;
          }
        </style>
      </head>
      <body>
        <h1>Shift Schedule</h1>
        <div class="legend">
          <span>Today</span>
          <span>Minggu</span>
          <span>Jumat</span>
          <span>Hari Libur Nasional</span>
          <span>Cuti/Libur Berbayar</span>
        </div>
        <table>
          <thead>
            <tr><th>Employee</th>${dayHeaders
              .map((day) => {
                const classes = [
                  day.isSunday ? 'th-sunday' : '',
                  day.isFriday ? 'th-friday' : '',
                  day.holiday ? 'th-holiday' : '',
                  day.isToday ? 'th-today' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const suffix = day.holiday
                  ? `<br/><small>${escapeHtml(day.holiday.name)}</small>`
                  : '';
                return `<th class="${classes}">${day.date}${suffix}</th>`;
              })
              .join('')}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}
