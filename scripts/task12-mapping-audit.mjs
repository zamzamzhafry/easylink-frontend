import fs from 'node:fs';

const page = fs.readFileSync(new URL('../app/machine/page.jsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/api/machine/route.js', import.meta.url), 'utf8');
const aliases = ['devinfo', 'scanlog_new', 'users_partial'];

const cardMatchers = {
  devinfo: [`confirmMachineAction('devinfo'`],
  scanlog_new: [`queueTask12ScanlogNew`],
  users_partial: [`queueUsersPartial`, `submitMachineAction('users_partial'`],
};

const aliasMapMatch = /const aliases = {([\s\S]*?)};/m.exec(route);
const aliasLiteral = aliasMapMatch ? `{${aliasMapMatch[1]}}` : '{}';
const aliasMap = aliasLiteral ? new Function(`return ${aliasLiteral};`)() : {};

const results = aliases.map((alias) => {
  const card = (cardMatchers[alias] || []).some((pattern) => page.includes(pattern));
  const normalized = aliasMap[alias] === alias;
  const handler = route.includes(`action === '${alias}'`);
  return { alias, card, normalized, handler };
});

const pass = results.every((r) => r.card && r.normalized && r.handler);
console.log(JSON.stringify({ pass, results }, null, 2));
if (!pass) process.exitCode = 1;
