export const SCANLOG_CANONICAL_SOURCE = 'canonical';
export const SCANLOG_LEGACY_SOURCE = 'legacy';

function normalizeRequestedSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'legacy') return SCANLOG_LEGACY_SOURCE;
  if (normalized === 'safe' || normalized === 'canonical') return SCANLOG_CANONICAL_SOURCE;
  return SCANLOG_CANONICAL_SOURCE;
}

export function resolveScanlogReadSource(requestedSource, { hasSafeTable, hasLegacyTable }) {
  const normalizedRequestedSource = normalizeRequestedSource(requestedSource);
  const canUseCanonical = Boolean(hasSafeTable);
  const canUseLegacy = Boolean(hasLegacyTable);

  if (normalizedRequestedSource === SCANLOG_LEGACY_SOURCE) {
    if (canUseLegacy) {
      return {
        requestedSource: normalizedRequestedSource,
        resolvedSource: SCANLOG_LEGACY_SOURCE,
        baseTable: 'tb_scanlog',
        useCanonical: false,
        fallbackReason: null,
      };
    }

    if (canUseCanonical) {
      return {
        requestedSource: normalizedRequestedSource,
        resolvedSource: SCANLOG_CANONICAL_SOURCE,
        baseTable: 'tb_scanlog_safe_events',
        useCanonical: true,
        fallbackReason: 'legacy_unavailable',
      };
    }
  }

  if (canUseCanonical) {
    return {
      requestedSource: normalizedRequestedSource,
      resolvedSource: SCANLOG_CANONICAL_SOURCE,
      baseTable: 'tb_scanlog_safe_events',
      useCanonical: true,
      fallbackReason: null,
    };
  }

  return {
    requestedSource: normalizedRequestedSource,
    resolvedSource: SCANLOG_LEGACY_SOURCE,
    baseTable: 'tb_scanlog',
    useCanonical: false,
    fallbackReason: canUseLegacy ? 'canonical_unavailable' : 'no_scanlog_table',
  };
}

export function buildScanlogReadBoundary(sourceState) {
  const legacyRoute = '/api/scanlog/sync';
  const legacyMode = sourceState.resolvedSource === SCANLOG_LEGACY_SOURCE;

  return {
    direct_cutover_source: SCANLOG_CANONICAL_SOURCE,
    resolved_source: sourceState.resolvedSource,
    requested_source: sourceState.requestedSource,
    fallback_reason: sourceState.fallbackReason,
    legacy_sdk_pull_route: legacyRoute,
    legacy_sdk_pull_allowed: legacyMode,
  };
}
