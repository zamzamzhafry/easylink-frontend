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

export async function pullScanlogsFromSdk({ from, to, source = 'auto', mode = 'new' } = {}) {
  const config = envDeviceConfig();
  const errors = [];

  const tryFingerspotTs = async () => {
    const mod = await import('fingerspot-easylink-ts');
    const FingerspotEasyLink = mod.default;
    const sdk = new FingerspotEasyLink({
      devices: [{ serverIP: config.ip, serverPort: config.port, deviceSN: config.sn }],
    });
    const device = sdk.getDevice(config.sn);
    const response = await device.getScanLogs(from || undefined, to || undefined);
    const list = Array.isArray(response?.data) ? response.data : [];
    const rows = list
      .map((item) => normalizeEvent(item, 'fingerspot-easylink-ts', config.sn))
      .filter(Boolean);
    return { source: 'fingerspot-easylink-ts', rows };
  };

  const tryEasyLinkJs = async () => {
    const mod = await import('easylink-js');
    const EasyLink = mod.default || mod;
    const host = `http://${config.ip}:${config.port}`;
    const sdk = new EasyLink({ host, serialNumber: config.sn });

    const payload = mode === 'all' ? await sdk.getAllScanLogs() : await sdk.getNewScanLogs();
    const list = Array.isArray(payload?.Data)
      ? payload.Data
      : Array.isArray(payload)
        ? payload
        : [];

    const rows = list
      .map((item) => normalizeEvent(item, 'easylink-js', config.sn))
      .filter(Boolean)
      .filter((item) => dateInRange(item.scan_date, from, to));

    return { source: 'easylink-js', rows };
  };

  if (source === 'fingerspot-easylink-ts') {
    return tryFingerspotTs();
  }
  if (source === 'easylink-js') {
    return tryEasyLinkJs();
  }

  try {
    return await tryFingerspotTs();
  } catch (error) {
    errors.push(`fingerspot-easylink-ts: ${error?.message || String(error)}`);
  }

  try {
    return await tryEasyLinkJs();
  } catch (error) {
    errors.push(`easylink-js: ${error?.message || String(error)}`);
  }

  throw new Error(`Failed to pull scanlogs from all SDK adapters. ${errors.join(' | ')}`);
}
