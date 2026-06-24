// Shared date-range validation for query/export routes. Guards against
// (1) non-date input producing junk-string queries, (2) from > to, and
// (3) a wide from/to blowing up memory on scanlog scans + CSV/XLSX exports.
// Keep in sync with the 366-day cap already applied to performance/report routes.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MAX_RANGE_DAYS = 366;

/**
 * @param {string|null|undefined} fromParam
 * @param {string|null|undefined} toParam
 * @param {{ maxRangeDays?: number, fallbackFrom?: string }} [options]
 * @returns {{ error?: string, status?: number, from?: string, to?: string }}
 */
export function resolveDateRange(fromParam, toParam, options = {}) {
  const maxRangeDays = options.maxRangeDays ?? DEFAULT_MAX_RANGE_DAYS;
  const today = new Date().toISOString().slice(0, 10);
  const fallbackFrom = options.fallbackFrom ?? today;
  const from = DATE_RE.test(fromParam) ? fromParam : fallbackFrom;
  const to = DATE_RE.test(toParam) ? toParam : from;
  if (from > to) {
    return { error: '"from" must be on or before "to".', status: 400 };
  }
  const dayDiff = Math.round((new Date(to) - new Date(from)) / 86_400_000);
  if (dayDiff > maxRangeDays) {
    return { error: `Date range exceeds ${maxRangeDays} days.`, status: 400 };
  }
  return { from, to };
}
