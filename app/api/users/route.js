import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';
import {
  buildPaginatedResponse,
  computePaginationMeta,
  parsePaginationParams,
} from '@/lib/pagination';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,50}$/;

function normalizeIdentifier(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function isValidIdentifier(value) {
  if (!value) return true;
  return IDENTIFIER_PATTERN.test(value);
}

function privilegeToCanonicalRole(privilege) {
  return Number(privilege ?? 0) >= 14 ? 'admin' : 'employee';
}

async function upsertIdentificationMethod(connection, { employeeId, methodType, methodValue }) {
  if (!methodValue) return;
  if (!(await tableExists('cs_employee_identification_methods'))) return;

  await connection.query(
    `UPDATE cs_employee_identification_methods
     SET is_primary = 0
     WHERE employee_id = ?
       AND method_type = ?
       AND method_value <> ?
       AND valid_to IS NULL`,
    [employeeId, methodType, methodValue]
  );

  await connection.query(
    `INSERT INTO cs_employee_identification_methods
      (employee_id, method_type, method_value, is_primary, is_verified, source_system, valid_from)
     VALUES (?, ?, ?, 1, 1, 'users-api', NOW())
     ON DUPLICATE KEY UPDATE
      is_primary = 1,
      is_verified = 1,
      source_system = VALUES(source_system),
      valid_to = NULL,
      updated_at = CURRENT_TIMESTAMP`,
    [employeeId, methodType, methodValue]
  );
}

async function resolveCanonicalIdentityByPin(connection, pin) {
  if (!(await tableExists('cs_employee_auth_identity'))) return null;

  const [rows] = await connection.query(
    `SELECT
       ai.employee_id,
       ai.login_nip,
       k.pin AS karyawan_pin
     FROM cs_employee_auth_identity ai
     JOIN tb_karyawan k ON k.id = ai.employee_id
     WHERE ai.login_nip = ?
        OR k.pin = ?
        OR EXISTS (
          SELECT 1
          FROM cs_employee_identification_methods m
          WHERE m.employee_id = ai.employee_id
            AND m.method_type = 'pin'
            AND m.valid_to IS NULL
            AND m.method_value = ?
        )
     LIMIT 1`,
    [pin, pin, pin]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function ensureEmployeeByPin(connection, { pin, nama }) {
  const [rows] = await connection.query(
    'SELECT id FROM tb_karyawan WHERE pin = ? OR nip = ? LIMIT 1',
    [pin, pin]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    const employeeId = Number(rows[0].id);
    await connection.query(
      "UPDATE tb_karyawan SET nama = COALESCE(NULLIF(?, ''), nama), pin = ? WHERE id = ?",
      [nama, pin, employeeId]
    );
    return employeeId;
  }

  const [result] = await connection.query(
    'INSERT INTO tb_karyawan (nama, pin, nip) VALUES (?, ?, ?)',
    [nama, pin, pin]
  );
  return Number(result.insertId);
}

async function syncCanonicalGlobalRole(connection, { employeeId, privilege }) {
  if (!(await tableExists('cs_employee_role_bindings'))) return;

  const roleKey = privilegeToCanonicalRole(privilege);

  await connection.query(
    `UPDATE cs_employee_role_bindings
     SET is_active = CASE WHEN role_key = ? THEN 1 ELSE 0 END,
         ends_at = CASE WHEN role_key = ? THEN NULL ELSE COALESCE(ends_at, NOW()) END,
         grant_source = 'users-api',
         updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = ?
       AND scope_type = 'global'
       AND scope_group_id IS NULL
       AND role_key IN ('admin', 'employee')`,
    [roleKey, roleKey, employeeId]
  );

  const [rows] = await connection.query(
    `SELECT id
     FROM cs_employee_role_bindings
     WHERE employee_id = ?
       AND role_key = ?
       AND scope_type = 'global'
       AND scope_group_id IS NULL
     LIMIT 1`,
    [employeeId, roleKey]
  );

  if (Array.isArray(rows) && rows.length > 0) {
    await connection.query(
      `UPDATE cs_employee_role_bindings
       SET is_active = 1,
           ends_at = NULL,
           grant_source = 'users-api',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rows[0].id]
    );
    return;
  }

  await connection.query(
    `INSERT INTO cs_employee_role_bindings
      (employee_id, role_key, scope_type, scope_group_id, grant_source, is_active)
     VALUES (?, ?, 'global', NULL, 'users-api', 1)`,
    [employeeId, roleKey]
  );
}

// ─────────────────────────────────────────────
// Helpers — detect canonical vs legacy schema at runtime
// ─────────────────────────────────────────────
const _tableExistsCache = new Map();
const _columnExistsCache = new Map();
async function tableExists(tableName) {
  if (_tableExistsCache.has(tableName)) return _tableExistsCache.get(tableName);
  const [rows] = await pool.query(
    `SELECT 1 AS found FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [tableName]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  _tableExistsCache.set(tableName, exists);
  return exists;
}

async function columnExists(tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (_columnExistsCache.has(cacheKey)) return _columnExistsCache.get(cacheKey);
  const [rows] = await pool.query(
    `SELECT 1 AS found FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  _columnExistsCache.set(cacheKey, exists);
  return exists;
}

function getDefaultTbUserSn() {
  return normalizeIdentifier(process.env.EASYLINK_DEVICE_SN);
}

async function resolveEmployeeAuthByLoginId(connection, loginId) {
  if (!loginId || !(await tableExists('tb_karyawan_auth'))) return null;

  const [rows] = await connection.query(
    `SELECT
       auth.karyawan_id AS employee_id,
       auth.nip,
       auth.is_active,
       k.pin AS karyawan_pin,
       k.nama
     FROM tb_karyawan_auth auth
     JOIN tb_karyawan k ON k.id = auth.karyawan_id
     WHERE auth.nip = ?
     LIMIT 1`,
    [loginId]
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function upsertLegacyEmployeeAuth(connection, { employeeId, loginId, password }) {
  if (!(await tableExists('tb_karyawan_auth'))) return;

  const [rows] = await connection.query(
    'SELECT karyawan_id FROM tb_karyawan_auth WHERE karyawan_id = ? LIMIT 1',
    [employeeId]
  );

  if (Array.isArray(rows) && rows.length > 0) {
    const setClauses = ['nip = ?', 'is_active = 1'];
    const params = [loginId];
    if (password !== undefined) {
      setClauses.push('password_hash = ?');
      params.push(String(password));
    }
    params.push(employeeId);
    await connection.query(
      `UPDATE tb_karyawan_auth
       SET ${setClauses.join(', ')}
       WHERE karyawan_id = ?`,
      params
    );
    return;
  }

  await connection.query(
    `INSERT INTO tb_karyawan_auth (karyawan_id, nip, password_hash, is_active, created_at)
     VALUES (?, ?, ?, 1, NOW())`,
    [employeeId, loginId, String(password ?? '')]
  );
}

async function getTbUserScope() {
  const hasTbUser = await tableExists('tb_user');
  const hasSn = hasTbUser ? await columnExists('tb_user', 'sn') : false;
  return {
    hasTbUser,
    hasSn,
    sn: getDefaultTbUserSn(),
  };
}

// ─────────────────────────────────────────────
// GET /api/users  — canonical or legacy user list with scanlog + group access
// ─────────────────────────────────────────────
export async function GET(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim();
  const { limit, pageInput } = parsePaginationParams(searchParams, {
    defaultLimit: 20,
    maxLimit: 100,
  });

  const useCanonical = await tableExists('cs_employee_auth_identity');
  const hasEmployeeAuth = await tableExists('tb_karyawan_auth');
  const hasStandaloneAccounts = await tableExists('auth_accounts');
  const tbUserScope = await getTbUserScope();

  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push(
      '(base.pin LIKE ? OR base.nama LIKE ? OR base.rfid LIKE ? OR base.login_nip LIKE ?)'
    );
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    let allRows = [];

    // ── Source 1: tb_karyawan_auth (employee login accounts) ──
    if (await tableExists('tb_karyawan_auth')) {
      const [empAuthRows] = await pool.query(
        `SELECT
           auth.karyawan_id AS karyawan_id,
           COALESCE(NULLIF(k.pin, ''), auth.nip) AS pin,
           COALESCE(k.nama, auth.nip) AS nama,
           '' AS rfid,
           auth.nip AS login_nip,
           0 AS privilege
         FROM tb_karyawan_auth auth
         JOIN tb_karyawan k ON k.id = auth.karyawan_id
         WHERE auth.is_active = 1`
      );
      if (Array.isArray(empAuthRows)) allRows.push(...empAuthRows);
    }

    // ── Source 2: auth_accounts (standalone admin/hr/scheduler accounts) ──
    if (await tableExists('auth_accounts')) {
      const [aaRows] = await pool.query(
        `SELECT
           NULL AS karyawan_id,
           aa.login_id AS pin,
           COALESCE(aa.display_name, aa.login_id) AS nama,
           NULL AS rfid,
           aa.login_id AS login_nip,
           CASE aa.role_key
             WHEN 'admin' THEN 14
             WHEN 'hr' THEN 3
             WHEN 'scheduler' THEN 2
             ELSE 1
           END AS privilege
         FROM auth_accounts aa
         WHERE aa.is_active = 1`
      );
      if (Array.isArray(aaRows)) allRows.push(...aaRows);
    }

    // ── Source 3: tb_user (legacy device-mirror users not already covered) ──
    if (await tableExists('tb_user')) {
      const coveredPins = new Set(allRows.map((r) => String(r.pin)));
      const tbUserHasSn = await columnExists('tb_user', 'sn');
      const defaultSn = getDefaultTbUserSn();
      const snFilter = tbUserHasSn && defaultSn ? ' WHERE u.sn = ?' : '';
      const snParams = tbUserHasSn && defaultSn ? [defaultSn] : [];
      const [legacyRows] = await pool.query(
        `SELECT
           k.id AS karyawan_id,
           u.pin,
           u.nama,
           u.rfid,
           NULL AS login_nip,
           u.privilege
         FROM tb_user u
         LEFT JOIN tb_karyawan k ON k.pin = u.pin${snFilter}`,
        snParams
      );
      if (Array.isArray(legacyRows)) {
        for (const row of legacyRows) {
          if (!coveredPins.has(String(row.pin))) {
            allRows.push(row);
            coveredPins.add(String(row.pin));
          }
        }
      }
    }

    // ── Normalize and deduplicate by pin ──
    const seen = new Map();
    for (const row of allRows) {
      const pin = String(row.pin || '').trim();
      if (!pin) continue;
      if (!seen.has(pin)) seen.set(pin, row);
    }
    let merged = [...seen.values()];

    // ── Search filter ──
    if (search) {
      const s = search.toLowerCase();
      merged = merged.filter((r) =>
        (r.pin && String(r.pin).toLowerCase().includes(s)) ||
        (r.nama && String(r.nama).toLowerCase().includes(s)) ||
        (r.rfid && String(r.rfid).toLowerCase().includes(s)) ||
        (r.login_nip && String(r.login_nip).toLowerCase().includes(s))
      );
    }

    // ── Sort ──
    merged.sort((a, b) => {
      const na = String(a.nama || '').toLowerCase();
      const nb = String(b.nama || '').toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return String(a.pin || '').localeCompare(String(b.pin || ''));
    });

    // ── Pagination ──
    const total = merged.length;
    const meta = computePaginationMeta({ total, pageInput, limit });
    const rows = merged.slice(meta.offset, meta.offset + meta.limit);

    const pins = rows.map((row) => String(row.pin)).filter(Boolean);

    const scanByPin = {};
    const accessByPin = {};

    if (pins.length > 0) {
      const [scanRows] = await pool.query(
        `SELECT
           sl.pin,
           COUNT(DISTINCT sl.scan_date) AS scan_days,
           COUNT(*)                     AS scan_total,
           MAX(sl.scan_date)            AS last_scan
         FROM tb_scanlog sl
         WHERE sl.pin IN (?)
         GROUP BY sl.pin`,
        [pins]
      );

      for (const row of scanRows) {
        scanByPin[String(row.pin)] = {
          scan_days: Number(row.scan_days ?? 0),
          scan_total: Number(row.scan_total ?? 0),
          last_scan: row.last_scan || null,
        };
      }

      const [accessRows] = await pool.query(
        `SELECT uga.pin, uga.group_id, uga.can_schedule, uga.can_dashboard,
                uga.is_approved, uga.approved_by, uga.approved_at, uga.created_at,
                g.nama_group
         FROM tb_user_group_access uga
         LEFT JOIN tb_group g ON g.id = uga.group_id
         WHERE uga.pin IN (?)
         ORDER BY uga.pin, g.nama_group`,
        [pins]
      );

      for (const row of accessRows) {
        const pin = String(row.pin);
        if (!accessByPin[pin]) accessByPin[pin] = [];
        accessByPin[pin].push({
          group_id: Number(row.group_id),
          nama_group: row.nama_group || null,
          can_schedule: Boolean(row.can_schedule),
          can_dashboard: Boolean(row.can_dashboard),
          is_approved: Boolean(row.is_approved),
          approved_by: row.approved_by || null,
          approved_at: row.approved_at || null,
          created_at: row.created_at || null,
        });
      }
    }

    const users = rows.map((u) => {
      const pin = String(u.pin);
      const scanMeta = scanByPin[pin] || {};

      return {
        pin,
        nama: u.nama || null,
        rfid: u.rfid || null,
        privilege: Number(u.privilege ?? 0),
        karyawan_id: u.karyawan_id != null ? Number(u.karyawan_id) : null,
        scan_days: Number(scanMeta.scan_days ?? 0),
        scan_total: Number(scanMeta.scan_total ?? 0),
        last_scan: scanMeta.last_scan || null,
        groups: accessByPin[pin] ?? [],
      };
    });

    return NextResponse.json(
      buildPaginatedResponse({
        items: users,
        total,
        pageInput,
        limit: meta.limit,
        itemKey: 'users',
        extra: {
          search,
        },
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// POST /api/users  — create canonical identity + compatibility tb_user row
// ─────────────────────────────────────────────
export async function POST(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pin = normalizeIdentifier(body.pin);
  const nama = String(body.nama ?? '').trim();
  const pwd = String(body.pwd ?? '').trim();
  const rfid = normalizeIdentifier(body.rfid);
  const nip = normalizeIdentifier(body.nip) || pin;
  const privilege = Number(body.privilege ?? 0);
  const tbUserSn = normalizeIdentifier(body.sn) || getDefaultTbUserSn();

  if (!pin) return NextResponse.json({ ok: false, error: 'PIN is required' }, { status: 400 });
  if (!nama) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
  if (pin.length > 12)
    return NextResponse.json({ ok: false, error: 'PIN max 12 characters' }, { status: 400 });
  if (!isValidIdentifier(pin) || !isValidIdentifier(nip) || !isValidIdentifier(rfid)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Identifiers must use only letters, numbers, dot, underscore, or dash.',
      },
      { status: 400 }
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const existingCanonical = await resolveCanonicalIdentityByPin(connection, pin);
    const existingEmployeeAuth = await resolveEmployeeAuthByLoginId(connection, pin);
    if (existingCanonical) {
      await connection.rollback();
      return NextResponse.json({ ok: false, error: `PIN ${pin} already exists` }, { status: 409 });
    }
    if (existingEmployeeAuth) {
      await connection.rollback();
      return NextResponse.json({ ok: false, error: `PIN ${pin} already exists` }, { status: 409 });
    }

    if (!existingCanonical) {
      const [legacyCheck] = await connection.query(
        'SELECT pin FROM tb_user WHERE pin = ? LIMIT 1',
        [pin]
      );
      if (Array.isArray(legacyCheck) && legacyCheck.length > 0) {
        await connection.rollback();
        return NextResponse.json({ ok: false, error: `PIN ${pin} already exists` }, { status: 409 });
      }
    }

    const employeeId = await ensureEmployeeByPin(connection, { pin, nama });

    if (await tableExists('cs_employee_auth_identity')) {
      await connection.query(
        `INSERT INTO cs_employee_auth_identity
          (employee_id, login_nip, password_hash, identity_status, password_updated_at)
         VALUES (?, ?, ?, 'active', NOW())
         ON DUPLICATE KEY UPDATE
          login_nip = VALUES(login_nip),
          password_hash = VALUES(password_hash),
          identity_status = 'active',
          password_updated_at = NOW(),
          updated_at = CURRENT_TIMESTAMP`,
        [employeeId, nip, pwd]
      );
    }

    await upsertLegacyEmployeeAuth(connection, {
      employeeId,
      loginId: nip,
      password: pwd,
    });

    await upsertIdentificationMethod(connection, {
      employeeId,
      methodType: 'nip',
      methodValue: nip,
    });
    await upsertIdentificationMethod(connection, {
      employeeId,
      methodType: 'pin',
      methodValue: pin,
    });
    await upsertIdentificationMethod(connection, {
      employeeId,
      methodType: 'rfid',
      methodValue: rfid,
    });

    await syncCanonicalGlobalRole(connection, {
      employeeId,
      privilege,
    });

    const tbUserHasSn = await columnExists('tb_user', 'sn');
    if (tbUserHasSn && !tbUserSn) {
      await connection.rollback();
      return NextResponse.json(
        { ok: false, error: 'tb_user requires SN. Set EASYLINK_DEVICE_SN or send body.sn.' },
        { status: 400 }
      );
    }
    if (tbUserHasSn) {
      await connection.query(
        `INSERT INTO tb_user (pin, sn, nama, pwd, rfid, privilege)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          nama = VALUES(nama),
          pwd = VALUES(pwd),
          rfid = VALUES(rfid),
          privilege = VALUES(privilege)`,
        [pin, tbUserSn, nama, pwd, rfid || '', privilege]
      );
    } else {
      await connection.query(
        `INSERT INTO tb_user (pin, nama, pwd, rfid, privilege)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          nama = VALUES(nama),
          pwd = VALUES(pwd),
          rfid = VALUES(rfid),
          privilege = VALUES(privilege)`,
        [pin, nama, pwd, rfid || '', privilege]
      );
    }

    await connection.commit();
    return NextResponse.json({ ok: true, pin });
  } catch (error) {
    await connection.rollback();
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'PIN or NIP already exists in canonical identity.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}

// ─────────────────────────────────────────────
// PUT /api/users  — update canonical identity + compatibility tb_user data
// ─────────────────────────────────────────────
export async function PUT(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pin = normalizeIdentifier(body.pin);
  const tbUserSn = normalizeIdentifier(body.sn) || getDefaultTbUserSn();
  if (!pin) return NextResponse.json({ ok: false, error: 'PIN is required' }, { status: 400 });

  const nextNip = body.nip !== undefined ? normalizeIdentifier(body.nip) : undefined;
  const nextRfid = body.rfid !== undefined ? normalizeIdentifier(body.rfid) : undefined;

  if (!isValidIdentifier(pin) || !isValidIdentifier(nextNip) || !isValidIdentifier(nextRfid)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Identifiers must use only letters, numbers, dot, underscore, or dash.',
      },
      { status: 400 }
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const canonicalIdentity = await resolveCanonicalIdentityByPin(connection, pin);
    const employeeAuthIdentity = await resolveEmployeeAuthByLoginId(connection, pin);
    const employeeId =
      canonicalIdentity?.employee_id != null
        ? Number(canonicalIdentity.employee_id)
        : employeeAuthIdentity?.employee_id != null
          ? Number(employeeAuthIdentity.employee_id)
          : null;
    const tbUserHasSn = await columnExists('tb_user', 'sn');
    const [legacyUserRows] = await connection.query(
      tbUserHasSn && tbUserSn
        ? 'SELECT pin, sn FROM tb_user WHERE pin = ? AND sn = ? LIMIT 1'
        : 'SELECT pin FROM tb_user WHERE pin = ? LIMIT 1',
      tbUserHasSn && tbUserSn ? [pin, tbUserSn] : [pin]
    );

    if (!employeeId && (!Array.isArray(legacyUserRows) || legacyUserRows.length === 0)) {
      await connection.rollback();
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    if (employeeId) {
      if (body.nama !== undefined) {
        const nextName = String(body.nama).trim();
        if (!nextName) {
          await connection.rollback();
          return NextResponse.json({ ok: false, error: 'Name cannot be empty' }, { status: 400 });
        }
        await connection.query('UPDATE tb_karyawan SET nama = ? WHERE id = ?', [
          nextName,
          employeeId,
        ]);
      }

      if (body.pwd !== undefined && (await tableExists('cs_employee_auth_identity'))) {
        await connection.query(
          `UPDATE cs_employee_auth_identity
           SET password_hash = ?,
               password_updated_at = NOW(),
               identity_status = 'active',
               updated_at = CURRENT_TIMESTAMP
           WHERE employee_id = ?`,
          [String(body.pwd), employeeId]
        );
      }

      if (body.pwd !== undefined || nextNip !== undefined) {
        await upsertLegacyEmployeeAuth(connection, {
          employeeId,
          loginId: nextNip || employeeAuthIdentity?.nip || canonicalIdentity?.login_nip || pin,
          password: body.pwd !== undefined ? String(body.pwd) : undefined,
        });
      }

      if (nextNip !== undefined) {
        if (!nextNip) {
          await connection.rollback();
          return NextResponse.json({ ok: false, error: 'NIP cannot be empty' }, { status: 400 });
        }
        if (await tableExists('cs_employee_auth_identity')) {
          await connection.query(
            'UPDATE cs_employee_auth_identity SET login_nip = ?, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?',
            [nextNip, employeeId]
          );
        }
        await connection.query('UPDATE tb_karyawan SET nip = ? WHERE id = ?', [
          nextNip,
          employeeId,
        ]);
        await upsertIdentificationMethod(connection, {
          employeeId,
          methodType: 'nip',
          methodValue: nextNip,
        });
      }

      if (nextRfid !== undefined) {
        if (nextRfid) {
          await upsertIdentificationMethod(connection, {
            employeeId,
            methodType: 'rfid',
            methodValue: nextRfid,
          });
        } else if (await tableExists('cs_employee_identification_methods')) {
          await connection.query(
            `UPDATE cs_employee_identification_methods
             SET is_primary = 0,
                 valid_to = COALESCE(valid_to, NOW()),
                 updated_at = CURRENT_TIMESTAMP
             WHERE employee_id = ?
               AND method_type = 'rfid'
               AND valid_to IS NULL`,
            [employeeId]
          );
        }
      }

      if (body.privilege !== undefined) {
        await syncCanonicalGlobalRole(connection, {
          employeeId,
          privilege: Number(body.privilege),
        });
      }
    }

    const setClauses = [];
    const params = [];

    if (body.nama !== undefined) {
      const nama = String(body.nama).trim();
      if (!nama) {
        await connection.rollback();
        return NextResponse.json({ ok: false, error: 'Name cannot be empty' }, { status: 400 });
      }
      setClauses.push('nama = ?');
      params.push(nama);
    }
    if (body.pwd !== undefined) {
      setClauses.push('pwd = ?');
      params.push(String(body.pwd));
    }
    if (body.rfid !== undefined) {
      setClauses.push('rfid = ?');
      params.push(String(body.rfid ?? ''));
    }
    if (body.privilege !== undefined) {
      setClauses.push('privilege = ?');
      params.push(Number(body.privilege));
    }

    if (setClauses.length > 0) {
      if (Array.isArray(legacyUserRows) && legacyUserRows.length > 0) {
        if (tbUserHasSn && !tbUserSn) {
          await connection.rollback();
          return NextResponse.json(
            { ok: false, error: 'tb_user requires SN. Set EASYLINK_DEVICE_SN or send body.sn.' },
            { status: 400 }
          );
        }
        if (tbUserHasSn) {
          params.push(pin, tbUserSn);
          await connection.query(
            `UPDATE tb_user SET ${setClauses.join(', ')} WHERE pin = ? AND sn = ?`,
            params
          );
        } else {
          params.push(pin);
          await connection.query(`UPDATE tb_user SET ${setClauses.join(', ')} WHERE pin = ?`, params);
        }
      } else {
        const legacyName = String(body.nama ?? '').trim() || pin;
        const legacyPwd = String(body.pwd ?? '');
        const legacyRfid = String(body.rfid ?? '');
        const legacyPrivilege = Number(body.privilege ?? 0);
        if (tbUserHasSn && !tbUserSn) {
          await connection.rollback();
          return NextResponse.json(
            { ok: false, error: 'tb_user requires SN. Set EASYLINK_DEVICE_SN or send body.sn.' },
            { status: 400 }
          );
        }
        if (tbUserHasSn) {
          await connection.query(
            `INSERT INTO tb_user (pin, sn, nama, pwd, rfid, privilege)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
              nama = VALUES(nama),
              pwd = VALUES(pwd),
              rfid = VALUES(rfid),
              privilege = VALUES(privilege)`,
            [pin, tbUserSn, legacyName, legacyPwd, legacyRfid, legacyPrivilege]
          );
        } else {
          await connection.query(
            `INSERT INTO tb_user (pin, nama, pwd, rfid, privilege)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
              nama = VALUES(nama),
              pwd = VALUES(pwd),
              rfid = VALUES(rfid),
              privilege = VALUES(privilege)`,
            [pin, legacyName, legacyPwd, legacyRfid, legacyPrivilege]
          );
        }
      }
    }

    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'NIP already exists for another canonical identity.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}

// ─────────────────────────────────────────────
// DELETE /api/users  — disable canonical identity + delete compatibility tb_user data
// ─────────────────────────────────────────────
export async function DELETE(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pin = normalizeIdentifier(body.pin);
  const tbUserSn = normalizeIdentifier(body.sn) || getDefaultTbUserSn();
  if (!pin) return NextResponse.json({ ok: false, error: 'PIN is required' }, { status: 400 });

  // Protect deleting yourself
  if (pin === auth.pin) {
    return NextResponse.json(
      { ok: false, error: 'Cannot delete your own account' },
      { status: 400 }
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const canonicalIdentity = await resolveCanonicalIdentityByPin(connection, pin);
    const employeeAuthIdentity = await resolveEmployeeAuthByLoginId(connection, pin);
    const employeeId =
      canonicalIdentity?.employee_id != null
        ? Number(canonicalIdentity.employee_id)
        : employeeAuthIdentity?.employee_id != null
          ? Number(employeeAuthIdentity.employee_id)
          : null;
    const tbUserHasSn = await columnExists('tb_user', 'sn');
    const [legacyRows] = await connection.query(
      tbUserHasSn && tbUserSn
        ? 'SELECT pin, sn FROM tb_user WHERE pin = ? AND sn = ? LIMIT 1'
        : 'SELECT pin FROM tb_user WHERE pin = ? LIMIT 1',
      tbUserHasSn && tbUserSn ? [pin, tbUserSn] : [pin]
    );

    if (!employeeId && (!Array.isArray(legacyRows) || legacyRows.length === 0)) {
      await connection.rollback();
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    if (employeeId && (await tableExists('cs_employee_auth_identity'))) {
      await connection.query(
        `UPDATE cs_employee_auth_identity
         SET identity_status = 'disabled',
             updated_at = CURRENT_TIMESTAMP
         WHERE employee_id = ?`,
        [employeeId]
      );
    }

    if (employeeId && (await tableExists('tb_karyawan_auth'))) {
      await connection.query(
        `UPDATE tb_karyawan_auth
         SET is_active = 0
         WHERE karyawan_id = ?`,
        [employeeId]
      );
    }

    await connection.query('DELETE FROM tb_user_group_access WHERE pin = ?', [pin]);
    if (tbUserHasSn && !tbUserSn && Array.isArray(legacyRows) && legacyRows.length > 0) {
      await connection.rollback();
      return NextResponse.json(
        { ok: false, error: 'tb_user requires SN. Set EASYLINK_DEVICE_SN or send body.sn.' },
        { status: 400 }
      );
    }
    if (tbUserHasSn && tbUserSn) {
      await connection.query('DELETE FROM tb_user WHERE pin = ? AND sn = ?', [pin, tbUserSn]);
    } else {
      await connection.query('DELETE FROM tb_user WHERE pin = ?', [pin]);
    }

    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
