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
