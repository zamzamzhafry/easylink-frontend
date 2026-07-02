// Deep day-metadata builder for the attendance/schedule surfaces. Owns the
// weekday + holiday + today derivation that was triplicated across
// app/attendance/page.jsx (quickSummaryDayMeta),
// components/schedule/quick-summaries-table.jsx (dayMeta), and
// lib/schedule-helpers.js (schedulePrintHtml inline).
//
// VISUAL CUE ONLY. This does NOT join holidays into attendance-rate or late
// computation — users work around holidays manually. Do not wire this into
// any denominator/formula.
//
// compactLabel is intentionally NOT included here — callers that need it
// already import compactDateDayLabel from lib/schedule-helpers and add it
// inline. Duplicating that fn here would create a 3rd divergent copy.

/**
 * Normalize a date value to a YYYY-MM-DD string (the holidayMap key shape).
 * Handles Date instances via LOCAL Y-M-D (not toISOString — UTC would
 * off-by-one near midnight). Returns null if input is empty/invalid.
 */
export function normalizeDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const candidate = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

/**
 * Build per-day metadata: iso key, weekday, weekday flags, isToday, holiday.
 *
 * @param {string|Date} dateValue   the day to describe
 * @param {Record<string, object>|null} holidayMap  iso-date -> holiday object
 * @param {string|null} [todayIso]  YYYY-MM-DD for "today" flag; null/omit to skip
 * @returns {{ isoDate: string|null, weekday: number, isToday: boolean, isSunday: boolean, isFriday: boolean, holiday: object|null }}
 */
export function buildDayMeta(dateValue, holidayMap, todayIso = null) {
  const isoDate = normalizeDateKey(dateValue);
  if (!isoDate) {
    return {
      isoDate: null,
      weekday: NaN,
      isToday: false,
      isSunday: false,
      isFriday: false,
      holiday: null,
    };
  }
  const weekday = new Date(`${isoDate}T00:00:00`).getDay();
  return {
    isoDate,
    weekday,
    isToday: todayIso != null && isoDate === todayIso,
    isSunday: weekday === 0,
    isFriday: weekday === 5,
    holiday: holidayMap?.[isoDate] || null,
  };
}
