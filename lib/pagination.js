const DEFAULT_ITEM_KEYS = ['items', 'rows', 'records', 'users'];

function toPositiveInt(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export function parsePaginationParams(searchParams, options = {}) {
  const defaultLimit = toPositiveInt(options.defaultLimit, 20);
  const maxLimit = toPositiveInt(options.maxLimit, 100);
  const defaultPage = toPositiveInt(options.defaultPage, 1);

  const requestedLimit = toPositiveInt(searchParams?.get?.('limit'), defaultLimit);
  const requestedPage = toPositiveInt(searchParams?.get?.('page'), defaultPage);

  return {
    limit: Math.max(1, Math.min(requestedLimit, maxLimit)),
    pageInput: Math.max(1, requestedPage),
  };
}

export function computePaginationMeta({ total, pageInput, limit }) {
  const safeLimit = Math.max(1, toPositiveInt(limit, 20));
  const safeTotal = Math.max(0, Number(total) || 0);
  const pages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const page = Math.min(Math.max(1, Number(pageInput) || 1), pages);
  const offset = (page - 1) * safeLimit;

  return {
    total: safeTotal,
    page,
    limit: safeLimit,
    pages,
    offset,
  };
}

export function resolveItemsFromPayload(payload, itemKeys = DEFAULT_ITEM_KEYS) {
  if (Array.isArray(payload)) return payload;

  for (const key of itemKeys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
}

export function buildPaginatedResponse({
  items,
  total,
  pageInput,
  limit,
  itemKey = 'items',
  extra = {},
}) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const meta = computePaginationMeta({
    total: total ?? normalizedItems.length,
    pageInput,
    limit,
  });

  const payload = {
    ok: true,
    items: normalizedItems,
    total: meta.total,
    page: meta.page,
    limit: meta.limit,
    pages: meta.pages,
    ...extra,
  };

  if (itemKey && itemKey !== 'items') {
    payload[itemKey] = normalizedItems;
  }

  return payload;
}
