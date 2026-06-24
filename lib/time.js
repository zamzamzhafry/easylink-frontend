// Shared time helpers. Standardizes "HH:MM" → minutes-of-day.
// Returns null for missing/partial input (e.g. "9:" → null, not 540) so
// callers' null-guards fire consistently. Prior copies diverged here.

export function toMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}
