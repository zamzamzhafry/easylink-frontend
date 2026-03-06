export const DAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

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
  const headers = ['Nama', 'PIN', ...dates.map((date) => formatIsoDate(date))];
  const rows = employees.map((employee) => [
    employee.nama,
    employee.pin,
    ...dates.map((date) => getShiftForDate(employee.id, formatIsoDate(date))?.nama_shift ?? ''),
  ]);

  return [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
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

  const employeeByPin = new Map(employees.map((employee) => [String(employee.pin ?? ''), employee]));
  const shiftByName = new Map(shifts.map((shift) => [String(shift.nama_shift ?? '').toLowerCase(), shift]));
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
        errors.push({ row: csvRow, message: `Unknown shift "${cell}" on ${dateValue} for PIN ${pin}.` });
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

export function employeeScheduleMetrics(employees, schedules, shifts, scanCompletions, today = new Date()) {
  const shiftHours = new Map(shifts.map((shift) => [Number(shift.id), Number(shift.jam_kerja ?? 0) || 0]));
  const completionSet = new Set(
    (scanCompletions ?? []).map((item) => `${Number(item.karyawan_id)}|${String(item.tanggal).slice(0, 10)}`)
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

export function schedulePrintHtml(employees, dates, getShiftForDate) {
  const dayHeaders = dates.map((date) => formatIsoDate(date));
  const rows = employees
    .map((employee) => {
      const cells = dayHeaders
        .map((dateString) => `<td>${getShiftForDate(employee.id, dateString)?.nama_shift ?? '-'}</td>`)
        .join('');
      return `<tr><td>${employee.nama} (PIN ${employee.pin ?? '-'})</td>${cells}</tr>`;
    })
    .join('');

  return `
    <html>
      <head>
        <title>Schedule Print</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; }
          h1 { margin: 0 0 12px; font-size: 18px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
          th { background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>Shift Schedule</h1>
        <table>
          <thead>
            <tr><th>Employee</th>${dayHeaders.map((day) => `<th>${day}</th>`).join('')}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}
