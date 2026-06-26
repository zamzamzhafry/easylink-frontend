export function sanitizeNextPath(rawNext) {
  const fallbackPath = '/';
  const value = String(rawNext ?? '').trim();
  if (!value) return fallbackPath;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) return fallbackPath;
  if (value.startsWith('//')) return fallbackPath;
  if (!value.startsWith('/')) return fallbackPath;
  if (/\r|\n|\0/.test(value)) return fallbackPath;

  try {
    const url = new URL(value, 'http://localhost');
    const normalizedPath = `${url.pathname}${url.search}${url.hash}`;
    if (!normalizedPath.startsWith('/')) return fallbackPath;
    if (normalizedPath === '/login' || normalizedPath.startsWith('/login?') || normalizedPath.startsWith('/login#')) {
      return fallbackPath;
    }
    return normalizedPath;
  } catch {
    return fallbackPath;
  }
}
