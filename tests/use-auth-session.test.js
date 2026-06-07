import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const hookModulePath = '../hooks/use-auth-session.js';

function createSessionStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

async function loadHookModule() {
  return import(`${hookModulePath}?t=${Date.now()}-${Math.random()}`);
}

describe('use-auth-session fetchAuthSession', () => {
  beforeEach(() => {
    global.fetch = undefined;
    global.window = undefined;
  });

  test('reuses fresh unauthenticated cache across remount-like reloads', async () => {
    const sessionStorage = createSessionStorage();
    let fetchCalls = 0;

    global.window = { sessionStorage };
    global.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: false,
        status: 401,
        json: async () => ({ ok: false, error: 'Unauthorized' }),
      };
    };

    const firstModule = await loadHookModule();
    const firstSession = await firstModule.fetchAuthSession();

    assert.equal(fetchCalls, 1);
    assert.equal(firstSession.statusCode, 401);
    assert.equal(firstSession.user, null);

    const secondModule = await loadHookModule();
    const secondSession = await secondModule.fetchAuthSession();

    assert.equal(fetchCalls, 1);
    assert.deepEqual(secondSession, firstSession);
  });

  test('keeps 429 as bounded transient failure and does not coerce to 401', async () => {
    const sessionStorage = createSessionStorage();
    let fetchCalls = 0;

    global.window = { sessionStorage };
    global.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: false,
        status: 429,
        json: async () => ({ ok: false, error: 'Too many requests' }),
      };
    };

    const authModule = await loadHookModule();
    const firstSession = await authModule.fetchAuthSession();
    const secondSession = await authModule.fetchAuthSession();

    assert.equal(fetchCalls, 1);
    assert.equal(firstSession.statusCode, 429);
    assert.equal(firstSession.error, 'Too many requests');
    assert.equal(firstSession.user, null);
    assert.equal(secondSession.statusCode, 429);
    assert.equal(secondSession.error, 'Too many requests');
  });

  test('resetSessionCache clears persisted failure state for next auth transition', async () => {
    const sessionStorage = createSessionStorage();
    let fetchCalls = 0;
 
    global.window = { sessionStorage };
    global.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: false,
        status: 401,
        json: async () => ({ ok: false, error: 'Unauthorized' }),
      };
    };
 
    const authModule = await loadHookModule();
    await authModule.fetchAuthSession();
    assert.equal(fetchCalls, 1);
 
    authModule.resetSessionCache();
    global.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, user: { login_id: 'admin01' } }),
      };
    };
 
    const nextSession = await authModule.fetchAuthSession();
 
    assert.equal(fetchCalls, 2);
    assert.equal(nextSession.statusCode, 200);
    assert.deepEqual(nextSession.user, { login_id: 'admin01' });
  });

  test('normalizes successful /api/auth/me payload shape exactly once per cache window', async () => {
    const sessionStorage = createSessionStorage();
    let fetchCalls = 0;
    const normalizedUser = {
      pin: 'A-100',
      nama: 'Admin One',
      privilege: 4,
      is_admin: true,
      is_hr: false,
      is_leader: true,
      can_schedule: true,
      can_dashboard: true,
      groups: [],
      canonical_roles: ['admin'],
      subject_type: 'account',
      account_id: 99,
      login_id: 'admin01',
      role_key: 'admin',
      nip: null,
      karyawan_id: null,
    };

    global.window = { sessionStorage };
    global.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, user: normalizedUser }),
      };
    };

    const authModule = await loadHookModule();
    const firstSession = await authModule.fetchAuthSession();
    const secondSession = await authModule.fetchAuthSession();

    assert.equal(fetchCalls, 1);
    assert.equal(firstSession.statusCode, 200);
    assert.deepEqual(firstSession.user, normalizedUser);
    assert.deepEqual(secondSession.user, normalizedUser);
    assert.deepEqual(JSON.parse(sessionStorage.getItem('easylink_auth_session_cache')), firstSession);
  });

  test('does not persist 429 failures across remount-like reloads', async () => {
    const sessionStorage = createSessionStorage();
    let fetchCalls = 0;

    global.window = { sessionStorage };
    global.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: false,
        status: 429,
        json: async () => ({ ok: false, error: 'Too many requests' }),
      };
    };

    const firstModule = await loadHookModule();
    const firstSession = await firstModule.fetchAuthSession();

    const secondModule = await loadHookModule();
    const secondSession = await secondModule.fetchAuthSession();

    assert.equal(fetchCalls, 2);
    assert.equal(firstSession.statusCode, 429);
    assert.equal(secondSession.statusCode, 429);
    assert.equal(firstSession.error, 'Too many requests');
    assert.equal(sessionStorage.getItem('easylink_auth_session_cache'), null);
  });
});
