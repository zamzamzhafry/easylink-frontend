type ModeSource = 'default' | 'env' | 'override';

export type PolicySourceMode = 'legacy' | 'compat_view' | 'canonical';
export type DataSourceCutoverMode = 'legacy_only' | 'shadow_read' | 'canonical_read';
export type MachineParityExposureMode = 'off' | 'admin_only' | 'all_users';
export type ReportingInteractionMode = 'legacy' | 'compat_bridge' | 'canonical';

export type ResolvedFlag<T extends string> = {
  name: string;
  mode: T;
  source: ModeSource;
  raw: string | null;
};

const POLICY_SOURCE_VALUES: PolicySourceMode[] = ['legacy', 'compat_view', 'canonical'];
const DATA_SOURCE_VALUES: DataSourceCutoverMode[] = [
  'legacy_only',
  'shadow_read',
  'canonical_read',
];
const MACHINE_PARITY_VALUES: MachineParityExposureMode[] = ['off', 'admin_only', 'all_users'];
const REPORTING_VALUES: ReportingInteractionMode[] = ['legacy', 'compat_bridge', 'canonical'];

const POLICY_SOURCE_DEFAULT: PolicySourceMode = 'legacy';
const DATA_SOURCE_DEFAULT: DataSourceCutoverMode = 'legacy_only';
const MACHINE_PARITY_DEFAULT: MachineParityExposureMode = 'off';
const REPORTING_DEFAULT: ReportingInteractionMode = 'legacy';

function normalizeEnumValue<T extends string>(
  rawValue: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  const normalized = String(rawValue ?? '')
    .trim()
    .toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
}

function resolveMode<T extends string>({
  envName,
  fallback,
  allowed,
  override,
}: {
  envName: string;
  fallback: T;
  allowed: readonly T[];
  override?: string | null;
}): ResolvedFlag<T> {
  if (override != null && String(override).trim() !== '') {
    const mode = normalizeEnumValue(override, allowed, fallback);
    return {
      name: envName,
      mode,
      source: 'override',
      raw: String(override),
    };
  }

  const rawEnv = process.env[envName] ?? null;
  if (rawEnv != null && String(rawEnv).trim() !== '') {
    const mode = normalizeEnumValue(rawEnv, allowed, fallback);
    return {
      name: envName,
      mode,
      source: 'env',
      raw: String(rawEnv),
    };
  }

  return {
    name: envName,
    mode: fallback,
    source: 'default',
    raw: null,
  };
}

export function resolvePolicySourceMode(override?: string | null): ResolvedFlag<PolicySourceMode> {
  return resolveMode({
    envName: 'EASYLINK_POLICY_SOURCE_MODE',
    fallback: POLICY_SOURCE_DEFAULT,
    allowed: POLICY_SOURCE_VALUES,
    override,
  });
}

export function resolveDataSourceCutoverMode(
  override?: string | null
): ResolvedFlag<DataSourceCutoverMode> {
  return resolveMode({
    envName: 'EASYLINK_DATA_SOURCE_CUTOVER_MODE',
    fallback: DATA_SOURCE_DEFAULT,
    allowed: DATA_SOURCE_VALUES,
    override,
  });
}

export function resolveMachineParityExposureMode(
  override?: string | null
): ResolvedFlag<MachineParityExposureMode> {
  return resolveMode({
    envName: 'EASYLINK_MACHINE_PARITY_EXPOSURE_MODE',
    fallback: MACHINE_PARITY_DEFAULT,
    allowed: MACHINE_PARITY_VALUES,
    override,
  });
}

export function resolveReportingInteractionMode(
  override?: string | null
): ResolvedFlag<ReportingInteractionMode> {
  return resolveMode({
    envName: 'EASYLINK_REPORTING_INTERACTION_MODE',
    fallback: REPORTING_DEFAULT,
    allowed: REPORTING_VALUES,
    override,
  });
}

export function resolveMigrationFlags(overrides?: {
  policySourceMode?: string | null;
  dataSourceCutoverMode?: string | null;
  machineParityExposureMode?: string | null;
  reportingInteractionMode?: string | null;
}) {
  const policySource = resolvePolicySourceMode(overrides?.policySourceMode);
  const dataSourceCutover = resolveDataSourceCutoverMode(overrides?.dataSourceCutoverMode);
  const machineParityExposure = resolveMachineParityExposureMode(
    overrides?.machineParityExposureMode
  );
  const reportingInteraction = resolveReportingInteractionMode(overrides?.reportingInteractionMode);

  return {
    policySource,
    dataSourceCutover,
    machineParityExposure,
    reportingInteraction,
  };
}

export function getMigrationGateStatus(options?: { viewerIsAdmin?: boolean }) {
  const flags = resolveMigrationFlags();
  const viewerIsAdmin = Boolean(options?.viewerIsAdmin);

  return {
    flags,
    defaults: {
      policySource: POLICY_SOURCE_DEFAULT,
      dataSourceCutover: DATA_SOURCE_DEFAULT,
      machineParityExposure: MACHINE_PARITY_DEFAULT,
      reportingInteraction: REPORTING_DEFAULT,
    },
    gates: {
      policySourceCutoverEnabled: flags.policySource.mode !== POLICY_SOURCE_DEFAULT,
      dataSourceCutoverEnabled: flags.dataSourceCutover.mode !== DATA_SOURCE_DEFAULT,
      machineParityVisible:
        flags.machineParityExposure.mode === 'all_users' ||
        (viewerIsAdmin && flags.machineParityExposure.mode === 'admin_only'),
      reportingInteractionCutoverEnabled: flags.reportingInteraction.mode !== REPORTING_DEFAULT,
    },
    compatibilityFirst: {
      runtimeDefaulted:
        flags.policySource.mode === POLICY_SOURCE_DEFAULT &&
        flags.dataSourceCutover.mode === DATA_SOURCE_DEFAULT &&
        flags.machineParityExposure.mode === MACHINE_PARITY_DEFAULT &&
        flags.reportingInteraction.mode === REPORTING_DEFAULT,
      behaviorChangeRequiresFlagToggle: true,
    },
  };
}
