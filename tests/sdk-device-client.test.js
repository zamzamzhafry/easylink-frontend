const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { pullAllDeviceScanlogs, fetchPage, resolveDeviceConfig } = require('../lib/sdk-device-client.js');

const CFG = { ip: '127.0.0.1', port: '8090', sn: 'Fio1' };

// Build a fake fetch that returns the given pages in sequence, driven by
// IsSession. Mirrors the php8 device contract: { Data, IsSession, Result }.
function fakeFetchFactory(pages) {
  let i = 0;
  return async () => {
    const p = pages[Math.min(i, pages.length - 1)];
    i += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify(p) };
  };
}

describe('sdk-device-client', () => {
  test('paginates the IsSession loop across 2 pages', async () => {
    const fetch = fakeFetchFactory([
      { Data: [{ pin: '1', Time: '2026-06-26 08:00:00' }, { pin: '2', Time: '2026-06-26 09:00:00' }], IsSession: true, Result: true },
      { Data: [{ pin: '3', Time: '2026-06-26 10:00:00' }], IsSession: false, Result: true },
    ]);
    const entries = await pullAllDeviceScanlogs({ fetch, device: CFG, limit: 100, maxPages: 5 });
    assert.equal(entries.length, 3);
    assert.equal(entries[0].pin, '1');
    assert.equal(entries[2].Time, '2026-06-26 10:00:00');
  });

  test('stops when IsSession is false on first page', async () => {
    const fetch = fakeFetchFactory([
      { Data: [{ pin: '1', Time: '2026-06-26 08:00:00' }], IsSession: false, Result: true },
    ]);
    const entries = await pullAllDeviceScanlogs({ fetch, device: CFG, maxPages: 5 });
    assert.equal(entries.length, 1);
  });

  test('treats empty Data array as no entries (not an error)', async () => {
    const fetch = fakeFetchFactory([{ Data: [], IsSession: false, Result: true }]);
    const entries = await pullAllDeviceScanlogs({ fetch, device: CFG, maxPages: 5 });
    assert.equal(entries.length, 0);
  });

  test('survives missing Data field (coerces to empty)', async () => {
    const fetch = fakeFetchFactory([{ IsSession: false, Result: true }]);
    const entries = await pullAllDeviceScanlogs({ fetch, device: CFG, maxPages: 5 });
    assert.equal(entries.length, 0);
  });

  test('throws on HTTP error with status code', async () => {
    const fetch = async () => ({ ok: false, status: 503, text: async () => 'gateway down' });
    await assert.rejects(() => pullAllDeviceScanlogs({ fetch, device: CFG, maxPages: 5 }), /503/);
  });

  test('throws on non-JSON body', async () => {
    const fetch = async () => ({ ok: true, status: 200, text: async () => '<<<not json>>>' });
    await assert.rejects(() => pullAllDeviceScanlogs({ fetch, device: CFG, maxPages: 5 }), /non-JSON/);
  });

  test('safety cap throws when session never ends', async () => {
    const fetch = fakeFetchFactory([
      { Data: [{ pin: '1', Time: '2026-06-26 08:00:00' }], IsSession: true, Result: true },
    ]);
    await assert.rejects(
      () => pullAllDeviceScanlogs({ fetch, device: CFG, maxPages: 3 }),
      /safety cap|exceeded/i,
    );
  });

  test('resolveDeviceConfig reads tb_device row', async () => {
    const fakeDb = {
      query: async () => [[{ server_IP: '10.0.0.1', server_port: '8090', device_sn: 'SN99' }]],
    };
    const cfg = await resolveDeviceConfig(fakeDb);
    assert.deepEqual(cfg, { ip: '10.0.0.1', port: '8090', sn: 'SN99' });
  });

  test('resolveDeviceConfig throws when no tb_device row', async () => {
    const fakeDb = { query: async () => [[]] };
    await assert.rejects(() => resolveDeviceConfig(fakeDb), /No device row/);
  });

  test('resolveDeviceConfig falls back to env when db absent', async () => {
    const saved = { ip: process.env.EASYLINK_DEVICE_IP, port: process.env.EASYLINK_DEVICE_PORT, sn: process.env.EASYLINK_DEVICE_SN };
    process.env.EASYLINK_DEVICE_IP = '1.2.3.4';
    process.env.EASYLINK_DEVICE_PORT = '8090';
    process.env.EASYLINK_DEVICE_SN = 'ENV_SN';
    try {
      const cfg = await resolveDeviceConfig(undefined);
      assert.deepEqual(cfg, { ip: '1.2.3.4', port: '8090', sn: 'ENV_SN' });
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  test('resolveDeviceConfig throws when env fallback incomplete', async () => {
    const savedIp = process.env.EASYLINK_DEVICE_IP;
    delete process.env.EASYLINK_DEVICE_IP;
    try {
      await assert.rejects(() => resolveDeviceConfig(undefined), /No device config/);
    } finally {
      if (savedIp !== undefined) process.env.EASYLINK_DEVICE_IP = savedIp;
    }
  });
});
