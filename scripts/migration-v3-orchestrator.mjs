import fs from 'fs/promises';
import path from 'path';

let pool;
let configuredDatabase = process.env.EASYLINK_DB_NAME || 'demo_easylinksdk';

const MIGRATION_FILES = {
  apply: 'migration_v3_clean_slate_schema.sql',
  rollback: 'migration_v3_clean_slate_rollback.sql',
};

const VALID_MODES = ['apply', 'validate', 'rollback'];
const EXPECTED_TABLES = [
  'cs_employee_auth_identity',
  'cs_role_policy_catalog',
  'cs_employee_role_bindings',
  'cs_group_ownership',
  'cs_legacy_role_alias_map',
];
const EXPECTED_VIEWS = [
  'vw_compat_karyawan_auth',
  'vw_compat_karyawan_roles',
  'vw_compat_user_group_access',
  'vw_prediction_target_effective',
];

async function ensurePool() {
  if (!pool) {
    process.env.DB_NAME = configuredDatabase;
    const dbModule = await import('../lib/db.js');
    pool = dbModule.default;
  }
  return pool;
}

function printUsage(message) {
  if (message) console.error(`Error: ${message}`);
  console.log(`
Usage: node scripts/migration-v3-orchestrator.mjs --mode <apply|validate|rollback> [--execute] [--file <path>] [--database <name>]

Options:
  --mode       Required. Specify what to perform (apply, validate, rollback).
  --execute    Actually run the SQL statements (required for apply/rollback).
  --file       Optional override for the SQL file (defaults to migration_v3_clean_slate_{schema|rollback}.sql).
  --database   Optional override for the database name (defaults to EASYLINK_DB_NAME or demo_easylinksdk).
  --help       Show this help text.

Examples:
  npm run migration:v3 -- --mode apply --execute
  npm run migration:v3 -- --mode validate
  npm run migration:v3 -- --mode rollback --file ./custom-rollback.sql --execute
`);
}

function parseCliArgs(argv) {
  const args = {
    mode: null,
    execute: false,
    file: null,
    database: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--help' || raw === '-h') {
      args.help = true;
      continue;
    }

    if (raw === '--execute' || raw === '-x') {
      args.execute = true;
      continue;
    }

    if (raw.startsWith('--mode=')) {
      args.mode = raw.split('=')[1];
      continue;
    }

    if (raw === '--mode' && i + 1 < argv.length) {
      args.mode = argv[++i];
      continue;
    }

    if (raw.startsWith('--file=')) {
      args.file = raw.split('=')[1];
      continue;
    }

    if (raw === '--file' && i + 1 < argv.length) {
      args.file = argv[++i];
      continue;
    }

    if (raw.startsWith('--database=')) {
      args.database = raw.split('=')[1];
      continue;
    }

    if (raw === '--database' && i + 1 < argv.length) {
      args.database = argv[++i];
      continue;
    }

    throw new Error(`Unknown argument: ${raw}`);
  }

  return args;
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?=\r?\n|$)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

async function executeStatements(statements) {
  const poolInstance = await ensurePool();
  const connection = await poolInstance.getConnection();
  try {
    for (const statement of statements) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 120);
      console.log(`Executing: ${preview}${preview.length === 120 ? '...' : ''}`);
      await connection.query(statement);
    }
  } finally {
    connection.release();
  }
}

async function runSqlFile(filePath, execute) {
  const absolutePath = path.resolve(filePath);
  console.log(`[migration-v3-orchestrator] Tuple path: ${absolutePath}`);
  const rawSql = await fs.readFile(absolutePath, 'utf8');
  const statements = splitStatements(rawSql);
  console.log(
    `[migration-v3-orchestrator] ${execute ? 'Executing' : 'Dry run'} ${statements.length} statements from ${path.basename(absolutePath)}`
  );
  if (!execute) {
    statements.slice(0, 5).forEach((stmt, index) => {
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 160);
      console.log(`  [dry-run] ${index + 1}. ${preview}${preview.length === 160 ? '...' : ''}`);
    });
    console.log('  Use --execute to apply the statements.');
    return;
  }
  await executeStatements(statements);
  console.log('[migration-v3-orchestrator] SQL file applied successfully.');
}

async function runValidate() {
  console.log('[migration-v3-orchestrator] Validating canonical objects...');
  const poolInstance = await ensurePool();
  const [tableRows] = await poolInstance.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
    [EXPECTED_TABLES]
  );
  const existingTables = new Set(tableRows.map((row) => row.TABLE_NAME));
  const missingTables = EXPECTED_TABLES.filter((table) => !existingTables.has(table));

  const [viewRows] = await poolInstance.query(
    `SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`,
    [EXPECTED_VIEWS]
  );
  const existingViews = new Set(viewRows.map((row) => row.TABLE_NAME));
  const missingViews = EXPECTED_VIEWS.filter((view) => !existingViews.has(view));

  if (missingTables.length === 0 && missingViews.length === 0) {
    console.log('[migration-v3-orchestrator] Validation passed: all expected tables/views exist.');
  } else {
    if (missingTables.length > 0) {
      console.warn(`[migration-v3-orchestrator] Missing tables: ${missingTables.join(', ')}`);
    }
    if (missingViews.length > 0) {
      console.warn(`[migration-v3-orchestrator] Missing views: ${missingViews.join(', ')}`);
    }
    throw new Error('Validation failed: some canonical objects are missing.');
  }
}

async function main() {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
      printUsage();
      return;
    }

    if (!args.mode) {
      printUsage('Mode is required.');
      process.exit(1);
    }

    if (!VALID_MODES.includes(args.mode)) {
      printUsage(`Invalid mode: ${args.mode}`);
      process.exit(1);
    }

    configuredDatabase = args.database || process.env.EASYLINK_DB_NAME || configuredDatabase;
    console.log(`[migration-v3-orchestrator] Target database: ${configuredDatabase}`);

    console.log(`[migration-v3-orchestrator] Mode requested: ${args.mode}`);
    if (args.mode === 'validate') {
      await runValidate();
      return;
    }

    if (!args.execute) {
      console.log(
        '[migration-v3-orchestrator] Dry run only. Add --execute to run against the database.'
      );
    }

    const targetFile = args.file || MIGRATION_FILES[args.mode];
    if (!targetFile) {
      throw new Error('SQL file path could not be determined.');
    }

    await runSqlFile(targetFile, args.execute);
  } catch (error) {
    console.error(
      '[migration-v3-orchestrator] ⚠️ ',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main();
