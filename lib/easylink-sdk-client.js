/* Allow community SDK libs to connect over self-signed / plain HTTP */
if (typeof process !== 'undefined') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toMysqlDateTime(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function envDeviceConfig() {
  const ip = process.env.EASYLINK_DEVICE_IP;
  const port = process.env.EASYLINK_DEVICE_PORT;
  const sn = process.env.EASYLINK_DEVICE_SN;

  if (!ip || !port || !sn) {
    throw new Error(
      'Missing EasyLink env config: EASYLINK_DEVICE_IP, EASYLINK_DEVICE_PORT, EASYLINK_DEVICE_SN'
    );
  }

  return {
    ip,
    port: String(port),
    sn,
  };
}

function envWindowsSdkConfig() {
  const wsdkBaseUrl = String(process.env.EASYLINK_WSDK_BASE_URL || '').trim();
  const wsdkIp = String(process.env.EASYLINK_WSDK_IP || '').trim();
  const lanHost = String(
    process.env.EASYLINK_LAN_HOST || process.env.EASYLINK_API_HOST || ''
  ).trim();
  const port = process.env.EASYLINK_WSDK_PORT || '8090';
  const sn = process.env.EASYLINK_DEVICE_SN;

  function parseEndpointList(value, fallback) {
    const source = String(value || '').trim() || fallback;
    return source
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.startsWith('/') ? item : `/${item}`));
  }

  function extractHost(value) {
    if (!value) return '';
    const normalized = /^https?:\/\//i.test(value) ? value : `http://${value}`;

    try {
      return new URL(normalized).hostname || '';
    } catch {
      return value
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .split(':')[0]
        .trim();
    }
  }

  function normalizeBaseUrl(value) {
    const normalized = /^https?:\/\//i.test(value) ? value : `http://${value}`;
    try {
      const url = new URL(normalized);
      return `${url.protocol}//${url.host}`;
    } catch {
      return value.replace(/\/+$/, '');
    }
  }

  const lanIp = extractHost(lanHost);
  const resolvedIp = wsdkIp || lanIp;
  const baseUrl = wsdkBaseUrl ? normalizeBaseUrl(wsdkBaseUrl) : `http://${resolvedIp}:${port}`;

  if ((!wsdkBaseUrl && !resolvedIp) || !sn) {
    throw new Error(
      'Missing Windows SDK env config: EASYLINK_WSDK_IP or EASYLINK_WSDK_BASE_URL (fallback: EASYLINK_LAN_HOST/EASYLINK_API_HOST) and EASYLINK_DEVICE_SN'
    );
  }

  return {
    baseUrl,
    sn,
    endpoints: {
      scanlogs: parseEndpointList(
        process.env.EASYLINK_WSDK_ENDPOINT_SCANLOGS,
        '/scanlog/new,/scanlog/all/paging,/getScanLogs'
      ),
      users: parseEndpointList(
        process.env.EASYLINK_WSDK_ENDPOINT_USERS,
        '/user/all/paging,/getUsers'
      ),
      deviceInfo: parseEndpointList(
        process.env.EASYLINK_WSDK_ENDPOINT_INFO,
        '/dev/info,/getDeviceInfo'
      ),
      deviceTime: parseEndpointList(
        process.env.EASYLINK_WSDK_ENDPOINT_TIME,
        '/dev/info,/getDeviceTime,/getDeviceInfo'
      ),
    },
  };
}

function shouldFallbackToNext(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.code !== undefined && raw.code !== 0) return true;
  if (raw.Result === false) return true;
  if (typeof raw.message === 'string' && /command\s+not\s+found/i.test(raw.message)) return true;
  return false;
}

function isNoDataResponse(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const message = String(raw.message || raw.error || '').toLowerCase();
  if (!message) return false;
  return /no data|none of data array/.test(message);
}

function toQueryString(payload) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value == null || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

function normalizeTimeValue(input) {
  if (input == null) return '';

  const candidate =
    input?.time ??
    input?.deviceTime ??
    input?.datetime ??
    input?.Jam ??
    input?.DEVINFO?.Jam ??
    input?.DEVINFO?.Time ??
    input;

  if (typeof candidate === 'string' || typeof candidate === 'number') {
    const parsed = parseDateTime(candidate);
    return parsed ? toMysqlDateTime(parsed) : String(candidate);
  }

  if (candidate instanceof Date) {
    return toMysqlDateTime(candidate);
  }

  return candidate;
}

function normalizePositiveInt(value, fallback, { min = 1, max = 100000 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function extractListPayload(payload, preferredKeys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const keys = [
    ...preferredKeys,
    'data',
    'rows',
    'list',
    'items',
    'scanlogs',
    'scanlog',
    'logs',
    'users',
    'result',
    'Data',
    'Rows',
    'List',
    'Items',
    'SCANLOG',
    'LOGS',
    'USERS',
    'Result',
  ];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  const nestedCandidates = [payload.payload, payload.response, payload.result, payload.data];
  for (const candidate of nestedCandidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      for (const key of keys) {
        if (Array.isArray(candidate[key])) return candidate[key];
      }
    }
  }

  return [];
}

function reorderEndpoints(endpoints, priorityPatterns = []) {
  const list = Array.isArray(endpoints) ? endpoints.filter(Boolean) : [];
  if (!priorityPatterns.length) return list;

  const score = (endpoint) => {
    const target = String(endpoint || '').toLowerCase();
    for (let i = 0; i < priorityPatterns.length; i += 1) {
      if (target.includes(priorityPatterns[i])) return i;
    }
    return priorityPatterns.length + 1;
  };

  return [...list].sort((a, b) => score(a) - score(b));
}

function hasPagingHints(endpoint, payload) {
  const endpointName = String(endpoint || '').toLowerCase();
  if (endpointName.includes('/paging')) return true;
  if (!payload || typeof payload !== 'object') return false;

  return (
    payload.has_more !== undefined ||
    payload.hasMore !== undefined ||
    payload.next_page !== undefined ||
    payload.nextPage !== undefined ||
    payload.total_page !== undefined ||
    payload.totalPage !== undefined ||
    payload.last_page !== undefined ||
    payload.lastPage !== undefined ||
    payload.paging !== undefined ||
    payload.pagination !== undefined
  );
}

function normalizeEvent(event, sourceSdk, defaultSn) {
  const sn = String(event?.sn || event?.deviceSN || event?.serialNumber || defaultSn || '').trim();
  const pin = String(event?.pin || event?.PIN || '').trim();
  const verifyMode = Number(event?.verifyMode ?? event?.verifymode ?? 0);
  const ioMode = Number(event?.ioMode ?? event?.iomode ?? 0);
  const workcode = event?.workcode != null ? String(event.workcode) : null;

  let timestamp = event?.timestamp || event?.scan_at || event?.scan_date || event?.datetime;
  if (event?.scan_date && event?.scan_time) {
    timestamp = `${event.scan_date} ${event.scan_time}`;
  }

  const parsed = parseDateTime(timestamp);
  if (!sn || !pin || !parsed) return null;

  const scanAt = toMysqlDateTime(parsed);
  const scanDate = scanAt.slice(0, 10);
  const scanTime = scanAt.slice(11, 19);
  const sourceEventKey = [sn, pin, scanAt, verifyMode, ioMode, workcode || ''].join('|');

  return {
    source_event_key: sourceEventKey,
    source_sdk: sourceSdk,
    sn,
    pin,
    scan_at: scanAt,
    scan_date: scanDate,
    scan_time: scanTime,
    verifymode: verifyMode,
    iomode: ioMode,
    workcode,
    raw_payload: JSON.stringify(event),
  };
}

function dateInRange(scanDate, from, to) {
  if (from && scanDate < from) return false;
  if (to && scanDate > to) return false;
  return true;
}

function normalizeUser(user) {
  const pin = String(user?.pin || user?.PIN || '').trim();
  if (!pin) return null;
  return {
    pin,
    nama: String(user?.name || user?.nama || user?.Name || `PIN ${pin}`),
    rfid: user?.rfid != null ? String(user.rfid) : '',
    privilege: Number(user?.privilege ?? user?.Privilege ?? 0),
  };
}

function normalizeDeviceInfo(info, source, defaultSn) {
  return {
    source,
    sn: String(info?.sn || info?.serialNumber || defaultSn || '').trim(),
    name: String(info?.name || info?.deviceName || info?.model || 'EasyLink Device'),
    info,
  };
}

async function createFingerspotAdapter(config) {
  const mod = await import('fingerspot-easylink-ts');
  const FingerspotEasyLink = mod.default;
  const sdk = new FingerspotEasyLink({
    devices: [{ serverIP: config.ip, serverPort: config.port, deviceSN: config.sn }],
  });
  const device = sdk.getDevice(config.sn);

  return {
    source: 'fingerspot-easylink-ts',
    async getScanlogs(from, to) {
      const response = await device.getScanLogs(from || undefined, to || undefined);
      const list = Array.isArray(response?.data) ? response.data : [];
      return list
        .map((item) => normalizeEvent(item, 'fingerspot-easylink-ts', config.sn))
        .filter(Boolean);
    },
    async getUsers() {
      const response = await device.getUsers();
      const list = Array.isArray(response?.data) ? response.data : [];
      return list.map(normalizeUser).filter(Boolean);
    },
    async getDeviceInfo() {
      const response = await device.getDeviceInfo();
      return normalizeDeviceInfo(response?.data || response, 'fingerspot-easylink-ts', config.sn);
    },
    async getDeviceTime() {
      const response = await device.getDeviceTime();
      const value = response?.data?.time || response?.data || response;
      const parsed = parseDateTime(value);
      return parsed ? toMysqlDateTime(parsed) : String(value || '');
    },
    async syncDeviceTime() {
      const now = toMysqlDateTime(new Date());
      await device.setDeviceTime(now);
      return now;
    },
  };
}

/* ── Windows SDK adapter (REST API on port 8090) ──────────── */

function createWindowsSdkAdapter(config) {
  const { baseUrl, sn, endpoints } = config;

  async function requestOnce(endpoint, payload, strategy, { unwrapData, allowNoData = false }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const isQuery = strategy === 'query';
      const isForm = strategy === 'form';
      const query = isQuery ? toQueryString(payload) : '';
      const url = isQuery && query ? `${baseUrl}${endpoint}?${query}` : `${baseUrl}${endpoint}`;

      const headers = {
        'Content-Type':
          isForm || isQuery ? 'application/x-www-form-urlencoded' : 'application/json',
      };

      let body;
      if (!isQuery) {
        body = isForm ? toQueryString(payload) : JSON.stringify(payload);
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Windows SDK ${endpoint} (${strategy}): HTTP ${res.status}`);
      }

      const text = await res.text();
      let raw = text;
      try {
        raw = JSON.parse(text);
      } catch {
        raw = text;
      }

      if (shouldFallbackToNext(raw)) {
        if (allowNoData && isNoDataResponse(raw)) {
          return { payload: [], raw, endpoint, strategy };
        }

        throw new Error(
          `Windows SDK ${endpoint} (${strategy}): ${
            raw?.message || raw?.error || 'unexpected response'
          }`
        );
      }

      const payloadData =
        unwrapData && raw && typeof raw === 'object' && raw.data !== undefined ? raw.data : raw;

      return { payload: payloadData, raw, endpoint, strategy };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestWithFallback(
    endpointCandidates,
    payload = {},
    { strategies = ['json'], unwrapData = true, allowNoData = false } = {}
  ) {
    const list = Array.isArray(endpointCandidates) ? endpointCandidates : [endpointCandidates];
    let lastError = null;

    for (const endpoint of list.filter(Boolean)) {
      for (const strategy of strategies) {
        try {
          return await requestOnce(endpoint, payload, strategy, { unwrapData, allowNoData });
        } catch (error) {
          lastError = error;
        }
      }
    }

    throw lastError || new Error('Windows SDK request failed');
  }

  return {
    source: 'windows-sdk',
    async getScanlogs(from, to, mode = 'new', options = {}) {
      const limit = normalizePositiveInt(
        options?.limit ?? process.env.EASYLINK_SCANLOG_LIMIT,
        100,
        { min: 1, max: 1000 }
      );
      const startPage = normalizePositiveInt(options?.page, 1, { min: 1, max: 100000 });
      const maxPages = normalizePositiveInt(
        options?.maxPages ?? process.env.EASYLINK_SCANLOG_MAX_PAGES,
        3,
        { min: 1, max: 200 }
      );

      const modeValue = String(mode || 'new').toLowerCase();
      const endpointCandidates =
        modeValue === 'new'
          ? reorderEndpoints(endpoints.scanlogs, [
              '/scanlog/new',
              '/scanlog/all/paging',
              '/getscanlogs',
            ])
          : reorderEndpoints(endpoints.scanlogs, [
              '/scanlog/all/paging',
              '/getscanlogs',
              '/scanlog/new',
            ]);

      const allItems = [];
      let page = startPage;

      for (let idx = 0; idx < maxPages; idx += 1) {
        const payload = { sn, mode: modeValue, limit, page };
        if (from) {
          payload.from = from;
          payload.start_date = from;
          payload.start = from;
        }
        if (to) {
          payload.to = to;
          payload.end_date = to;
          payload.end = to;
        }

        const result = await requestWithFallback(endpointCandidates, payload, {
          strategies: ['query', 'form', 'json'],
          unwrapData: false,
          allowNoData: true,
        });

        const list = extractListPayload(result.payload, ['scanlogs', 'scanlog', 'logs', 'rows']);
        allItems.push(...list);

        if (!hasPagingHints(result.endpoint, result.payload)) break;

        const responseObj =
          result.payload && typeof result.payload === 'object' ? result.payload : {};
        const totalPage = normalizePositiveInt(
          responseObj.total_page ??
            responseObj.totalPage ??
            responseObj.last_page ??
            responseObj.lastPage,
          0,
          { min: 0, max: 100000 }
        );
        const nextPage = normalizePositiveInt(
          responseObj.next_page ?? responseObj.nextPage,
          page + 1,
          {
            min: 1,
            max: 100000,
          }
        );
        const hasMore = Boolean(responseObj.has_more ?? responseObj.hasMore ?? nextPage > page);
        const continueBySize = list.length >= limit;
        const continueByTotal = totalPage > 0 ? page < totalPage : false;

        if (!(hasMore || continueBySize || continueByTotal)) break;
        page = nextPage > page ? nextPage : page + 1;
      }

      const normalized = allItems
        .map((item) => normalizeEvent(item, 'windows-sdk', sn))
        .filter(Boolean)
        .filter((row) => dateInRange(row.scan_date, from, to));

      const dedupMap = new Map();
      for (const row of normalized) {
        if (!dedupMap.has(row.source_event_key)) dedupMap.set(row.source_event_key, row);
      }

      return [...dedupMap.values()];
    },
    async getUsers(options = {}) {
      const limit = normalizePositiveInt(options?.limit, 100, { min: 1, max: 1000 });
      const startPage = normalizePositiveInt(options?.page, 1, { min: 1, max: 100000 });
      const maxPages = normalizePositiveInt(options?.maxPages, 3, { min: 1, max: 200 });
      const endpointCandidates = reorderEndpoints(endpoints.users, [
        '/user/all/paging',
        '/getusers',
      ]);

      const allItems = [];
      let page = startPage;

      for (let idx = 0; idx < maxPages; idx += 1) {
        const result = await requestWithFallback(
          endpointCandidates,
          { sn, limit, page },
          {
            strategies: ['query', 'form', 'json'],
            unwrapData: false,
            allowNoData: true,
          }
        );

        const list = extractListPayload(result.payload, ['users', 'rows', 'list']);
        allItems.push(...list);

        if (!hasPagingHints(result.endpoint, result.payload)) break;

        const responseObj =
          result.payload && typeof result.payload === 'object' ? result.payload : {};
        const totalPage = normalizePositiveInt(
          responseObj.total_page ??
            responseObj.totalPage ??
            responseObj.last_page ??
            responseObj.lastPage,
          0,
          { min: 0, max: 100000 }
        );
        const nextPage = normalizePositiveInt(
          responseObj.next_page ?? responseObj.nextPage,
          page + 1,
          {
            min: 1,
            max: 100000,
          }
        );
        const hasMore = Boolean(responseObj.has_more ?? responseObj.hasMore ?? nextPage > page);
        const continueBySize = list.length >= limit;
        const continueByTotal = totalPage > 0 ? page < totalPage : false;

        if (!(hasMore || continueBySize || continueByTotal)) break;
        page = nextPage > page ? nextPage : page + 1;
      }

      return allItems.map(normalizeUser).filter(Boolean);
    },
    async getDeviceInfo() {
      const result = await requestWithFallback(
        endpoints.deviceInfo,
        { sn },
        {
          strategies: ['query', 'form', 'json'],
          unwrapData: false,
        }
      );

      return {
        normalized: normalizeDeviceInfo(result.payload || {}, 'windows-sdk', sn),
        raw: result.raw,
      };
    },
    async getDeviceTime() {
      const result = await requestWithFallback(
        endpoints.deviceTime,
        { sn },
        {
          strategies: ['query', 'form', 'json'],
          unwrapData: false,
        }
      );

      return {
        value: normalizeTimeValue(result.payload),
        raw: result.raw,
      };
    },
    async syncDeviceTime() {
      const now = toMysqlDateTime(new Date());
      return now;
    },
  };
}

async function getAdapter(source, config) {
  if (source === 'easylink-js') {
    throw new Error(
      'easylink-js adapter is disabled in this build. Use source=auto, fingerspot-easylink-ts, or windows-sdk.'
    );
  }
  if (source === 'windows-sdk') {
    const wsdkConfig = envWindowsSdkConfig();
    return createWindowsSdkAdapter(wsdkConfig);
  }
  if (source === 'fingerspot-easylink-ts') return createFingerspotAdapter(config);

  /* auto: prefer windows-sdk if configured, else fingerspot */
  try {
    const wsdkConfig = envWindowsSdkConfig();
    return createWindowsSdkAdapter(wsdkConfig);
  } catch {
    return createFingerspotAdapter(config);
  }
}

export async function pullScanlogsFromSdk({
  from,
  to,
  source = 'auto',
  mode = 'new',
  limit,
  page,
  maxPages,
} = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const rows = await adapter.getScanlogs(from, to, mode, { limit, page, maxPages });
  return { source: adapter.source, rows };
}

export async function pullUsersFromSdk({ source = 'auto', limit, page, maxPages } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const rows = await adapter.getUsers({ limit, page, maxPages });
  return { source: adapter.source, rows };
}

export async function getDeviceInfoFromSdk({ source = 'auto' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const infoResult = await adapter.getDeviceInfo();

  if (infoResult && typeof infoResult === 'object' && 'normalized' in infoResult) {
    return { source: adapter.source, info: infoResult.normalized, raw: infoResult.raw };
  }

  return { source: adapter.source, info: infoResult };
}

export async function getDeviceTimeFromSdk({ source = 'auto' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const timeResult = await adapter.getDeviceTime();

  if (timeResult && typeof timeResult === 'object' && 'value' in timeResult) {
    return { source: adapter.source, time: timeResult.value, raw: timeResult.raw };
  }

  return { source: adapter.source, time: timeResult };
}

export async function syncDeviceTimeFromSdk({ source = 'auto' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const syncedAt = await adapter.syncDeviceTime();
  return { source: adapter.source, synced_at: syncedAt };
}
