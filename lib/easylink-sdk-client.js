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
  const ip = process.env.EASYLINK_WSDK_IP;
  const port = process.env.EASYLINK_WSDK_PORT || '8090';
  const sn = process.env.EASYLINK_DEVICE_SN;

  if (!ip || !sn) {
    throw new Error(
      'Missing Windows SDK env config: EASYLINK_WSDK_IP (and EASYLINK_DEVICE_SN)'
    );
  }

  return {
    baseUrl: `http://${ip}:${port}`,
    sn,
  };
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
  const { baseUrl, sn } = config;

  async function post(endpoint, body = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sn, ...body }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Windows SDK ${endpoint}: HTTP ${res.status}`);
      }

      const json = await res.json();

      if (json.code !== undefined && json.code !== 0) {
        throw new Error(`Windows SDK ${endpoint}: code=${json.code} ${json.message || ''}`);
      }

      return json.data ?? json;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    source: 'windows-sdk',
    async getScanlogs(from, to) {
      const body = {};
      if (from) body.start_date = from;
      if (to) body.end_date = to;

      const data = await post('/getScanLogs', body);
      const list = Array.isArray(data) ? data : [];
      return list
        .map((item) => normalizeEvent(item, 'windows-sdk', sn))
        .filter(Boolean);
    },
    async getUsers() {
      const data = await post('/getUsers');
      const list = Array.isArray(data) ? data : [];
      return list.map(normalizeUser).filter(Boolean);
    },
    async getDeviceInfo() {
      const data = await post('/getDeviceInfo');
      return normalizeDeviceInfo(data || {}, 'windows-sdk', sn);
    },
    async getDeviceTime() {
      const data = await post('/getDeviceInfo');
      const value = data?.time || data?.deviceTime || data;
      const parsed = parseDateTime(value);
      return parsed ? toMysqlDateTime(parsed) : String(value || '');
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

export async function pullScanlogsFromSdk({ from, to, source = 'auto', mode = 'new' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const rows = await adapter.getScanlogs(from, to, mode);
  return { source: adapter.source, rows };
}

export async function pullUsersFromSdk({ source = 'auto' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const rows = await adapter.getUsers();
  return { source: adapter.source, rows };
}

export async function getDeviceInfoFromSdk({ source = 'auto' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const info = await adapter.getDeviceInfo();
  return { source: adapter.source, info };
}

export async function getDeviceTimeFromSdk({ source = 'auto' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const time = await adapter.getDeviceTime();
  return { source: adapter.source, time };
}

export async function syncDeviceTimeFromSdk({ source = 'auto' } = {}) {
  const config = envDeviceConfig();
  const adapter = await getAdapter(source, config);
  const syncedAt = await adapter.syncDeviceTime();
  return { source: adapter.source, synced_at: syncedAt };
}
