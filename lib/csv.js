// CSV cell escaping with formula-injection guard. Prefixes leading = + - @
// with a single quote so Excel/LibreOffice treat the cell as text, not a
// formula (CSV injection = CWE-1236). Reuse across all CSV exporters.

export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}
