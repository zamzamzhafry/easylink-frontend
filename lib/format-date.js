// Shared display-date formatter for exports. Appends T00:00:00 to date-only
// YYYY-MM-DD strings so parsing is local-midnight (not UTC midnight) — avoids
// off-by-one display in UTC-X timezones. Latent for WIB (+7) deployments today,
// but a single fix point means it's correct if the host TZ ever changes.

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const iso = String(dateStr).trim();
  // Date-only → local midnight; already has time → as-is.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
