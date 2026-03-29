let pool;
let configuredDatabase = process.env.EASYLINK_DB_NAME || 'demo_easylinksdk';

const FIXTURE_GROUP_NAME = 'Role Fixture Auth Group';
const FIXTURE_GROUP_DESCRIPTION = 'Deterministic group used by role/capability tests.';
const SCHEDULE_DATE = '2026-03-01';
const SHIFT_NAME = 'Pagi';
const PASSWORD = 'password';
const FIXTURES = [
  {
    pin: 'admin001',
    nip: 'admin001',
    nama: 'Seed Admin 001',
    legacyRole: 'admin',
    canonicalRole: 'admin',
    privilege: 4,
    assignGroup: null,
    needsLeaderAccess: false,
  },
  {
    pin: 'leader001',
    nip: 'leader001',
    nama: 'Seed Leader 001',
    legacyRole: 'group_leader',
    canonicalRole: 'group_leader',
    privilege: 1,
    assignGroup: FIXTURE_GROUP_NAME,
    needsLeaderAccess: true,
  },
  {
    pin: 'employee001',
    nip: 'employee001',
    nama: 'Seed Employee 001',
    legacyRole: 'viewer',
    canonicalRole: 'employee',
    privilege: 1,
    assignGroup: FIXTURE_GROUP_NAME,
    needsLeaderAccess: false,
  },
];

function printUsage() {
  console.log(`
Usage: node scripts/seed-v3-role-fixtures.mjs [--execute] [--database <name>]

Options:
  --execute    Run the seeding workflow (default is dry run).
  --database   Optional database target (defaults to EASYLINK_DB_NAME or demo_easylinksdk).
  --help       Show this help text.
`);
}

function parseArgs(argv) {
  const args = { execute: false, help: false, database: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--execute') {
      args.execute = true;
      continue;
    }
    if (token.startsWith('--database=')) {
      args.database = token.split('=')[1];
      continue;
    }
    if (token === '--database' && i + 1 < argv.length) {
      args.database = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

async function ensurePool() {
  if (!pool) {
    process.env.DB_NAME = configuredDatabase;
    const dbModule = await import('../lib/db.js');
    pool = dbModule.default;
  }
  return pool;
}

async function hasColumn(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureGroup(connection, name, description) {
  const [rows] = await connection.query('SELECT id FROM tb_group WHERE nama_group = ? LIMIT 1', [
    name,
  ]);
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0].id;
  }
  const [result] = await connection.query(
    'INSERT INTO tb_group (nama_group, deskripsi) VALUES (?, ?)',
    [name, description]
  );
  return result.insertId;
}

async function ensureShift(connection, name) {
  const [rows] = await connection.query(
    'SELECT id FROM tb_shift_type WHERE nama_shift = ? LIMIT 1',
    [name]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Shift '${name}' is missing. Run migration.sql before seeding.`);
  }
  return rows[0].id;
}

async function ensureKaryawan(connection, { pin, nip, nama }) {
  const [rows] = await connection.query(
    'SELECT id FROM tb_karyawan WHERE pin = ? OR nip = ? LIMIT 1',
    [pin, nip]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    const { id } = rows[0];
    await connection.query('UPDATE tb_karyawan SET pin = ?, nip = ?, nama = ? WHERE id = ?', [
      pin,
      nip,
      nama,
      id,
    ]);
    return id;
  }
  const [result] = await connection.query(
    'INSERT INTO tb_karyawan (pin, nip, nama) VALUES (?, ?, ?)',
    [pin, nip, nama]
  );
  return result.insertId;
}

async function ensureUser(connection, { pin, nama, privilege }) {
  const [rows] = await connection.query('SELECT pin FROM tb_user WHERE pin = ? LIMIT 1', [pin]);
  if (Array.isArray(rows) && rows.length > 0) {
    await connection.query(
      'UPDATE tb_user SET nama = ?, pwd = ?, privilege = ?, rfid = ? WHERE pin = ?',
      [nama, PASSWORD, privilege, `$RFID-${pin}`, pin]
    );
    return;
  }
  await connection.query(
    'INSERT INTO tb_user (pin, nama, pwd, privilege, rfid) VALUES (?, ?, ?, ?, ?)',
    [pin, nama, PASSWORD, privilege, `$RFID-${pin}`]
  );
}

async function ensureKaryawanAuth(connection, { employeeId, nip }) {
  const [rows] = await connection.query(
    'SELECT karyawan_id FROM tb_karyawan_auth WHERE karyawan_id = ? LIMIT 1',
    [employeeId]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    await connection.query(
      'UPDATE tb_karyawan_auth SET nip = ?, password_hash = ?, is_active = 1, last_login_at = NOW() WHERE karyawan_id = ?',
      [nip, PASSWORD, employeeId]
    );
    return;
  }
  await connection.query(
    'INSERT INTO tb_karyawan_auth (karyawan_id, nip, password_hash, is_active, last_login_at) VALUES (?, ?, ?, 1, NOW())',
    [employeeId, nip, PASSWORD]
  );
}

async function ensureKaryawanRole(connection, { employeeId, roleKey, groupId }) {
  const [rows] = await connection.query(
    'SELECT id FROM tb_karyawan_roles WHERE karyawan_id = ? AND role_key = ? AND (group_id <=> ?) LIMIT 1',
    [employeeId, roleKey, groupId]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return;
  }
  await connection.query(
    'INSERT INTO tb_karyawan_roles (karyawan_id, role_key, group_id) VALUES (?, ?, ?)',
    [employeeId, roleKey, groupId]
  );
}

async function ensureEmployeeGroup(connection, { employeeId, groupId }) {
  if (!groupId) return;
  const [rows] = await connection.query(
    'SELECT group_id FROM tb_employee_group WHERE karyawan_id = ? LIMIT 1',
    [employeeId]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    if (rows[0].group_id === groupId) {
      return;
    }
    await connection.query('UPDATE tb_employee_group SET group_id = ? WHERE karyawan_id = ?', [
      groupId,
      employeeId,
    ]);
    return;
  }
  await connection.query('INSERT INTO tb_employee_group (karyawan_id, group_id) VALUES (?, ?)', [
    employeeId,
    groupId,
  ]);
}

async function ensureUserGroupAccess(connection, { pin, groupId, isLeader, approvedBy }) {
  if (!groupId) return;
  const [rows] = await connection.query(
    'SELECT id FROM tb_user_group_access WHERE pin = ? AND group_id = ? LIMIT 1',
    [pin, groupId]
  );
  const payload = {
    can_schedule: isLeader ? 1 : 0,
    can_dashboard: isLeader ? 1 : 0,
    is_leader: isLeader ? 1 : 0,
    is_approved: 1,
  };

  const hasIsLeaderColumn = await hasColumn(connection, 'tb_user_group_access', 'is_leader');
  if (Array.isArray(rows) && rows.length > 0) {
    const updates = ['can_schedule = ?', 'can_dashboard = ?', 'is_approved = ?'];
    const params = [payload.can_schedule, payload.can_dashboard, payload.is_approved];
    if (hasIsLeaderColumn) {
      updates.push('is_leader = ?');
      params.push(payload.is_leader);
    }
    updates.push('approved_by = ?', 'approved_at = NOW()');
    params.push(approvedBy);
    params.push(rows[0].id);
    await connection.query(
      `UPDATE tb_user_group_access SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return;
  }

  const columns = [
    'pin',
    'group_id',
    'can_schedule',
    'can_dashboard',
    'is_approved',
    'approved_by',
    'approved_at',
  ];
  const placeholders = ['?', '?', '?', '?', '?', '?', 'NOW()'];
  const values = [
    pin,
    groupId,
    payload.can_schedule,
    payload.can_dashboard,
    payload.is_approved,
    approvedBy,
  ];
  if (hasIsLeaderColumn) {
    columns.splice(5, 0, 'is_leader');
    placeholders.splice(5, 0, '?');
    values.splice(5, 0, payload.is_leader);
  }

  await connection.query(
    `INSERT INTO tb_user_group_access (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  );
}

async function ensureSchedule(connection, { employeeId, shiftId }) {
  const [rows] = await connection.query(
    'SELECT id FROM tb_schedule WHERE karyawan_id = ? AND tanggal = ? LIMIT 1',
    [employeeId, SCHEDULE_DATE]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    await connection.query('UPDATE tb_schedule SET shift_id = ?, catatan = ? WHERE id = ?', [
      shiftId,
      'Seeded fixture schedule',
      rows[0].id,
    ]);
    return;
  }
  await connection.query(
    'INSERT INTO tb_schedule (karyawan_id, tanggal, shift_id, catatan) VALUES (?, ?, ?, ?)',
    [employeeId, SCHEDULE_DATE, shiftId, 'Seeded fixture schedule']
  );
}

async function ensureCanonicalIdentity(connection, { employeeId, nip }) {
  const [rows] = await connection.query(
    'SELECT employee_id FROM cs_employee_auth_identity WHERE employee_id = ? LIMIT 1',
    [employeeId]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    await connection.query(
      'UPDATE cs_employee_auth_identity SET login_nip = ?, password_hash = ?, identity_status = ?, last_login_at = NOW() WHERE employee_id = ?',
      [nip, PASSWORD, 'active', employeeId]
    );
    return;
  }
  await connection.query(
    'INSERT INTO cs_employee_auth_identity (employee_id, login_nip, password_hash, identity_status, last_login_at) VALUES (?, ?, ?, ?, NOW())',
    [employeeId, nip, PASSWORD, 'active']
  );
}

async function ensureIdentificationMethods(connection, { employeeId, pin, nip }) {
  const methods = [
    { type: 'nip', value: nip },
    { type: 'pin', value: pin },
  ];
  for (const method of methods) {
    await connection.query(
      `INSERT INTO cs_employee_identification_methods (employee_id, method_type, method_value, is_primary, is_verified, source_system, valid_from)
       VALUES (?, ?, ?, 1, 1, 'seed-v3-role-fixtures', NOW())
       ON DUPLICATE KEY UPDATE is_primary = 1, is_verified = 1, updated_at = CURRENT_TIMESTAMP`,
      [employeeId, method.type, method.value]
    );
  }
}

async function ensureCanonicalRoleBinding(
  connection,
  { employeeId, canonicalRole, scopeType, scopeGroupId, grantedBy }
) {
  const [rows] = await connection.query(
    'SELECT id FROM cs_employee_role_bindings WHERE employee_id = ? AND role_key = ? AND scope_type = ? AND (scope_group_id <=> ?) LIMIT 1',
    [employeeId, canonicalRole, scopeType, scopeGroupId]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    await connection.query(
      'UPDATE cs_employee_role_bindings SET is_active = 1, grant_source = ?, granted_by_employee_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['seed-v3-role-fixtures', grantedBy, rows[0].id]
    );
    return;
  }
  await connection.query(
    'INSERT INTO cs_employee_role_bindings (employee_id, role_key, scope_type, scope_group_id, granted_by_employee_id, grant_source, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [employeeId, canonicalRole, scopeType, scopeGroupId, grantedBy, 'seed-v3-role-fixtures']
  );
}

async function ensureGroupOwnership(connection, { groupId, ownerId }) {
  const [rows] = await connection.query(
    'SELECT id FROM cs_group_ownership WHERE group_id = ? AND owner_employee_id = ? LIMIT 1',
    [groupId, ownerId]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    await connection.query(
      'UPDATE cs_group_ownership SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [rows[0].id]
    );
    return;
  }
  await connection.query(
    'INSERT INTO cs_group_ownership (group_id, owner_employee_id, ownership_role, is_primary) VALUES (?, ?, ?, 1)',
    [groupId, ownerId, 'group_leader']
  );
}

async function runSeed() {
  const poolInstance = await ensurePool();
  const connection = await poolInstance.getConnection();
  await connection.beginTransaction();
  try {
    const shiftId = await ensureShift(connection, SHIFT_NAME);
    const groupId = await ensureGroup(connection, FIXTURE_GROUP_NAME, FIXTURE_GROUP_DESCRIPTION);
    const adminFixture = FIXTURES.find((fixture) => fixture.pin === 'admin001');
    if (!adminFixture) throw new Error('Admin fixture not defined.');

    let adminEmployeeId = null;
    const results = [];
    for (const fixture of FIXTURES) {
      const employeeId = await ensureKaryawan(connection, fixture);
      await ensureUser(connection, fixture);
      await ensureKaryawanAuth(connection, { employeeId, nip: fixture.nip });
      const groupAssignment = fixture.assignGroup ? groupId : null;
      await ensureKaryawanRole(connection, {
        employeeId,
        roleKey: fixture.legacyRole,
        groupId: groupAssignment,
      });
      await ensureEmployeeGroup(connection, { employeeId, groupId: groupAssignment });
      await ensureSchedule(connection, { employeeId, shiftId });
      await ensureCanonicalIdentity(connection, { employeeId, nip: fixture.nip });
      await ensureIdentificationMethods(connection, {
        employeeId,
        pin: fixture.pin,
        nip: fixture.nip,
      });

      if (fixture.pin === 'admin001') {
        adminEmployeeId = employeeId;
      }

      await ensureCanonicalRoleBinding(connection, {
        employeeId,
        canonicalRole: fixture.canonicalRole,
        scopeType: fixture.assignGroup ? 'group' : 'global',
        scopeGroupId: fixture.assignGroup ? groupAssignment : null,
        grantedBy: adminEmployeeId || null,
      });

      if (fixture.assignGroup && fixture.needsLeaderAccess) {
        await ensureUserGroupAccess(connection, {
          pin: fixture.pin,
          groupId: groupAssignment,
          isLeader: true,
          approvedBy: 'admin001',
        });
        await ensureGroupOwnership(connection, { groupId: groupAssignment, ownerId: employeeId });
      } else if (fixture.assignGroup) {
        await ensureUserGroupAccess(connection, {
          pin: fixture.pin,
          groupId: groupAssignment,
          isLeader: false,
          approvedBy: 'admin001',
        });
      }

      results.push(`Seeded ${fixture.pin} (${fixture.nama})`);
    }

    await connection.commit();
    console.log('[seed-v3-role-fixtures] Seed applied successfully:');
    results.forEach((entry) => {
      console.log(`  - ${entry}`);
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printUsage();
      return;
    }

    configuredDatabase = args.database || process.env.EASYLINK_DB_NAME || configuredDatabase;
    console.log(`[seed-v3-role-fixtures] Target database: ${configuredDatabase}`);

    console.log(`[seed-v3-role-fixtures] Mode: ${args.execute ? 'execute' : 'dry-run'}`);
    if (!args.execute) {
      console.log(
        'This is a dry run. Add --execute to apply deterministic role fixtures and baseline data.'
      );
      console.log(
        'Fixtures:\n' +
          FIXTURES.map((fixture) => `  - ${fixture.pin} (${fixture.legacyRole})`).join('\n')
      );
      return;
    }

    await runSeed();
  } catch (error) {
    console.error('[seed-v3-role-fixtures] ⚠️', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main();
