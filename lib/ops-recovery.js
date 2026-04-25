import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execFileAsync = promisify(execFile);

const DEFAULT_RECOVERY_TASK = 'EasyLink-Recovery';
const RECOVERY_TASK_NAME = String(
  process.env.EASYLINK_RECOVERY_TASK_NAME || DEFAULT_RECOVERY_TASK
).trim();
const HEALTH_SUMMARY_PATH = String(process.env.EASYLINK_OPS_STATUS_PATH || '').trim();

function buildTaskReference(taskRef = RECOVERY_TASK_NAME) {
  const normalized = String(taskRef || '').trim();
  if (!normalized) {
    throw new Error('Recovery task name is not configured.');
  }

  const clean = normalized.replace(/\//g, '\\');
  const parts = clean.split('\\').filter(Boolean);
  const taskName = parts.pop();
  if (!taskName) {
    throw new Error('Recovery task name is invalid.');
  }

  return {
    taskName,
    taskPath: parts.length ? `\\${parts.join('\\')}\\` : '\\',
    fullName: parts.length ? `\\${parts.join('\\')}\\${taskName}` : taskName,
  };
}

async function runPowerShell(script, args = []) {
  const scriptWithArgs = args.reduce(
    (s, arg, i) => s.replace(new RegExp(`\\$args\\[${i}\\]`, 'g'), `'${String(arg).replace(/'/g, "''")}'`),
    script
  );
  const encoded = Buffer.from(scriptWithArgs, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }
  );
  return stdout;
}

function normalizeTaskInfo(raw, taskRef) {
  if (!raw || typeof raw !== 'object') {
    return {
      name: taskRef.fullName,
      state: 'Unknown',
      last_run_time: null,
      next_run_time: null,
      last_task_result: null,
      last_task_result_label: 'Unknown',
    };
  }

  const lastTaskResult = Number(raw.lastTaskResult);
  let resultLabel = 'Unknown';
  if (Number.isFinite(lastTaskResult)) {
    if (lastTaskResult === 0) {
      resultLabel = 'Success';
    } else if (lastTaskResult === 267009) {
      resultLabel = 'Queued';
    } else if (lastTaskResult === 2147942402) {
      resultLabel = 'File not found';
    } else {
      resultLabel = `Code ${lastTaskResult}`;
    }
  }

  return {
    name: raw.name || taskRef.fullName,
    path: raw.path || taskRef.taskPath,
    state: raw.state || 'Unknown',
    last_run_time: raw.lastRunTime || null,
    next_run_time: raw.nextRunTime || null,
    last_task_result: Number.isFinite(lastTaskResult) ? lastTaskResult : null,
    last_task_result_label: resultLabel,
  };
}

export async function queryRecoveryTaskStatus() {
  if (process.platform !== 'win32') {
    throw new Error('Task Scheduler recovery endpoint is supported on Windows hosts only.');
  }

  const taskRef = buildTaskReference();
  const script = `
    $taskName = $args[0]
    $taskPath = $args[1]
    $task = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction Stop
    $info = $task | Get-ScheduledTaskInfo
    [pscustomobject]@{
      name = $task.TaskName
      path = $task.TaskPath
      state = [string]$task.State
      lastRunTime = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1900) { $info.LastRunTime.ToString('o') } else { $null }
      nextRunTime = if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1900) { $info.NextRunTime.ToString('o') } else { $null }
      lastTaskResult = $info.LastTaskResult
    } | ConvertTo-Json -Compress
  `;

  const stdout = await runPowerShell(script, [taskRef.taskName, taskRef.taskPath]);
  const parsed = JSON.parse(stdout);
  return normalizeTaskInfo(parsed, taskRef);
}

export async function startRecoveryTask() {
  if (process.platform !== 'win32') {
    throw new Error('Task Scheduler recovery endpoint is supported on Windows hosts only.');
  }

  const currentStatus = await queryRecoveryTaskStatus();
  if (String(currentStatus.state || '').toLowerCase() === 'running') {
    return {
      started: false,
      message: 'Recovery task is already running.',
      task: currentStatus,
    };
  }

  const taskRef = buildTaskReference();
  const script = `
    $taskName = $args[0]
    $taskPath = $args[1]
    Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction Stop
  `;

  await runPowerShell(script, [taskRef.taskName, taskRef.taskPath]);
  const refreshedStatus = await queryRecoveryTaskStatus();
  return {
    started: true,
    message: 'Recovery task triggered.',
    task: refreshedStatus,
  };
}

export async function readOpsHealthSummary() {
  if (!HEALTH_SUMMARY_PATH) return null;

  try {
    const raw = await readFile(HEALTH_SUMMARY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

export function getRecoveryTaskConfig() {
  return {
    task_name: RECOVERY_TASK_NAME || DEFAULT_RECOVERY_TASK,
    health_summary_path: HEALTH_SUMMARY_PATH || null,
  };
}
