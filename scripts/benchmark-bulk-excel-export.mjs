import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';

import * as XLSX from 'xlsx';

const DEFAULTS = {
  groups: 8,
  rowsPerSheet: 1000,
  days: 31,
  outDir: 'tmp/benchmarks',
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token.startsWith('--groups=')) {
      args.groups = Number(token.split('=')[1]);
      continue;
    }

    if (token === '--groups' && i + 1 < argv.length) {
      args.groups = Number(argv[++i]);
      continue;
    }

    if (token.startsWith('--rows-per-sheet=')) {
      args.rowsPerSheet = Number(token.split('=')[1]);
      continue;
    }

    if (token === '--rows-per-sheet' && i + 1 < argv.length) {
      args.rowsPerSheet = Number(argv[++i]);
      continue;
    }

    if (token.startsWith('--days=')) {
      args.days = Number(token.split('=')[1]);
      continue;
    }

    if (token === '--days' && i + 1 < argv.length) {
      args.days = Number(argv[++i]);
      continue;
    }

    if (token.startsWith('--out-dir=')) {
      args.outDir = token.split('=')[1];
      continue;
    }

    if (token === '--out-dir' && i + 1 < argv.length) {
      args.outDir = argv[++i];
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!Number.isFinite(args.groups) || args.groups <= 0) {
    throw new Error('--groups must be a positive number');
  }

  if (!Number.isFinite(args.rowsPerSheet) || args.rowsPerSheet <= 0) {
    throw new Error('--rows-per-sheet must be a positive number');
  }

  if (!Number.isFinite(args.days) || args.days <= 0 || args.days > 31) {
    throw new Error('--days must be between 1 and 31');
  }

  return args;
}

function usage() {
  console.log(`
Usage: node scripts/benchmark-bulk-excel-export.mjs [options]

Options:
  --groups <n>          Number of worksheets (default: ${DEFAULTS.groups})
  --rows-per-sheet <n>  Data rows per worksheet (default: ${DEFAULTS.rowsPerSheet})
  --days <n>            Number of date/day columns (default: ${DEFAULTS.days})
  --out-dir <path>      Output folder (default: ${DEFAULTS.outDir})
  --help                Show this help text
`);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dayLabel(dayIndex) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${pad2(dayIndex + 1)}-${dayNames[dayIndex % dayNames.length]}`;
}

function buildHeader(days) {
  const header = ['Employee ID', 'Employee Name', 'Role'];
  for (let d = 0; d < days; d += 1) {
    header.push(dayLabel(d));
  }
  header.push('Total Hours');
  return header;
}

function buildRows(rowsPerSheet, days, groupIndex) {
  const rows = new Array(rowsPerSheet);

  for (let r = 0; r < rowsPerSheet; r += 1) {
    const row = [
      `EMP-${groupIndex + 1}-${pad2(r + 1)}`,
      `Employee ${groupIndex + 1}-${r + 1}`,
      r % 3 === 0 ? 'Leader' : 'Staff',
    ];

    let totalHours = 0;
    for (let d = 0; d < days; d += 1) {
      const value = (r + d + groupIndex) % 5 === 0 ? 'OFF' : '8';
      row.push(value);
      if (value !== 'OFF') totalHours += 8;
    }

    row.push(totalHours);
    rows[r] = row;
  }

  return rows;
}

async function fileSizeBytes(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function toMb(bytes) {
  return bytes / (1024 * 1024);
}

async function benchmarkXlsx({ groups, rowsPerSheet, days, outDir }) {
  const workbook = XLSX.utils.book_new();
  const header = buildHeader(days);

  const start = performance.now();

  for (let g = 0; g < groups; g += 1) {
    const rows = buildRows(rowsPerSheet, days, g);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    XLSX.utils.book_append_sheet(workbook, sheet, `Group-${g + 1}`);
  }

  const outPath = path.resolve(outDir, 'bulk-benchmark-xlsx.xlsx');
  XLSX.writeFile(workbook, outPath, { compression: true });

  const elapsedMs = performance.now() - start;
  const totalRows = groups * rowsPerSheet;
  const sizeBytes = await fileSizeBytes(outPath);

  return {
    module: 'xlsx',
    available: true,
    sheets: groups,
    rows: totalRows,
    seconds: Number((elapsedMs / 1000).toFixed(3)),
    rowsPerSecond: Number((totalRows / (elapsedMs / 1000)).toFixed(0)),
    fileSizeMb: Number(toMb(sizeBytes).toFixed(3)),
    outputPath: outPath,
  };
}

async function maybeImportExcelJs() {
  try {
    const module = await import('exceljs');
    return module.default || module;
  } catch {
    return null;
  }
}

async function benchmarkExcelJs({ groups, rowsPerSheet, days, outDir, ExcelJS }) {
  const workbook = new ExcelJS.Workbook();
  const header = buildHeader(days);

  const start = performance.now();

  for (let g = 0; g < groups; g += 1) {
    const ws = workbook.addWorksheet(`Group-${g + 1}`);
    ws.addRow(header);

    const rows = buildRows(rowsPerSheet, days, g);
    ws.addRows(rows);
  }

  const outPath = path.resolve(outDir, 'bulk-benchmark-exceljs.xlsx');
  await workbook.xlsx.writeFile(outPath);

  const elapsedMs = performance.now() - start;
  const totalRows = groups * rowsPerSheet;
  const sizeBytes = await fileSizeBytes(outPath);

  return {
    module: 'exceljs',
    available: true,
    sheets: groups,
    rows: totalRows,
    seconds: Number((elapsedMs / 1000).toFixed(3)),
    rowsPerSecond: Number((totalRows / (elapsedMs / 1000)).toFixed(0)),
    fileSizeMb: Number(toMb(sizeBytes).toFixed(3)),
    outputPath: outPath,
  };
}

function printSummary(args, results) {
  const line = '-'.repeat(92);
  console.log('\nBulk Excel Export Benchmark');
  console.log(line);
  console.log(`Config: sheets=${args.groups}, rows/sheet=${args.rowsPerSheet}, day-columns=${args.days}`);
  console.log(line);
  console.log('module     available   sheets   rows      seconds   rows/sec   file(MB)');
  console.log(line);

  for (const result of results) {
    const cols = [
      result.module.padEnd(10),
      String(result.available).padEnd(10),
      String(result.sheets ?? '-').padEnd(8),
      String(result.rows ?? '-').padEnd(9),
      String(result.seconds ?? '-').padEnd(9),
      String(result.rowsPerSecond ?? '-').padEnd(10),
      String(result.fileSizeMb ?? '-').padEnd(8),
    ];
    console.log(cols.join(' '));
    if (result.outputPath) {
      console.log(`  file: ${result.outputPath}`);
    }
    if (result.note) {
      console.log(`  note: ${result.note}`);
    }
  }

  console.log(line);
  console.log('JSON_RESULT_START');
  console.log(JSON.stringify({ config: args, results }, null, 2));
  console.log('JSON_RESULT_END');
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      usage();
      return;
    }

    const outDir = path.resolve(args.outDir);
    await fs.mkdir(outDir, { recursive: true });

    const results = [];

    results.push(await benchmarkXlsx({ ...args, outDir }));

    const ExcelJS = await maybeImportExcelJs();
    if (ExcelJS) {
      results.push(await benchmarkExcelJs({ ...args, outDir, ExcelJS }));
    } else {
      results.push({
        module: 'exceljs',
        available: false,
        note: 'Package not installed. Install with: npm i exceljs',
      });
    }

    printSummary({ ...args, outDir }, results);
  } catch (error) {
    console.error('[benchmark-bulk-excel-export] Failed:', error.message);
    process.exit(1);
  }
}

await main();
