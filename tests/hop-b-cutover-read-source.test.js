import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  buildScanlogReadBoundary,
  resolveScanlogReadSource,
  SCANLOG_CANONICAL_SOURCE,
  SCANLOG_LEGACY_SOURCE,
} = await import('../lib/scanlog-read-source.js');

describe('resolveScanlogReadSource', () => {
  it('defaults to canonical when requested source is undefined', () => {
    const state = resolveScanlogReadSource(undefined, {
      hasSafeTable: true,
      hasLegacyTable: true,
    });

    assert.equal(state.requestedSource, 'canonical');
    assert.equal(state.resolvedSource, 'canonical');
    assert.equal(state.baseTable, 'tb_scanlog_safe_events');
    assert.equal(state.useCanonical, true);
    assert.equal(state.fallbackReason, null);
  });

  it('normalizes "safe" to canonical', () => {
    const state = resolveScanlogReadSource('safe', {
      hasSafeTable: true,
      hasLegacyTable: true,
    });

    assert.equal(state.requestedSource, 'canonical');
    assert.equal(state.resolvedSource, 'canonical');
    assert.equal(state.baseTable, 'tb_scanlog_safe_events');
    assert.equal(state.useCanonical, true);
    assert.equal(state.fallbackReason, null);
  });

  it('normalizes "canonical" explicitly', () => {
    const state = resolveScanlogReadSource('canonical', {
      hasSafeTable: true,
      hasLegacyTable: false,
    });

    assert.equal(state.requestedSource, 'canonical');
    assert.equal(state.resolvedSource, 'canonical');
    assert.equal(state.baseTable, 'tb_scanlog_safe_events');
    assert.equal(state.useCanonical, true);
    assert.equal(state.fallbackReason, null);
  });

  it('resolves "legacy" to legacy when legacy table exists', () => {
    const state = resolveScanlogReadSource('legacy', {
      hasSafeTable: true,
      hasLegacyTable: true,
    });

    assert.equal(state.requestedSource, 'legacy');
    assert.equal(state.resolvedSource, 'legacy');
    assert.equal(state.baseTable, 'tb_scanlog');
    assert.equal(state.useCanonical, false);
    assert.equal(state.fallbackReason, null);
  });

  it('falls back to canonical when legacy requested but legacy table missing', () => {
    const state = resolveScanlogReadSource('legacy', {
      hasSafeTable: true,
      hasLegacyTable: false,
    });

    assert.equal(state.requestedSource, 'legacy');
    assert.equal(state.resolvedSource, 'canonical');
    assert.equal(state.baseTable, 'tb_scanlog_safe_events');
    assert.equal(state.useCanonical, true);
    assert.equal(state.fallbackReason, 'legacy_unavailable');
  });

  it('falls back to legacy when canonical requested but safe table missing', () => {
    const state = resolveScanlogReadSource('canonical', {
      hasSafeTable: false,
      hasLegacyTable: true,
    });

    assert.equal(state.requestedSource, 'canonical');
    assert.equal(state.resolvedSource, 'legacy');
    assert.equal(state.baseTable, 'tb_scanlog');
    assert.equal(state.useCanonical, false);
    assert.equal(state.fallbackReason, 'canonical_unavailable');
  });

  it('falls back with no_scanlog_table when both tables missing', () => {
    const state = resolveScanlogReadSource(undefined, {
      hasSafeTable: false,
      hasLegacyTable: false,
    });

    assert.equal(state.resolvedSource, 'legacy');
    assert.equal(state.baseTable, 'tb_scanlog');
    assert.equal(state.useCanonical, false);
    assert.equal(state.fallbackReason, 'no_scanlog_table');
  });

  it('treats unknown source values as canonical default', () => {
    const state = resolveScanlogReadSource('bogus', {
      hasSafeTable: true,
      hasLegacyTable: true,
    });

    assert.equal(state.requestedSource, 'canonical');
    assert.equal(state.resolvedSource, 'canonical');
    assert.equal(state.useCanonical, true);
  });
});

describe('buildScanlogReadBoundary', () => {
  it('returns correct boundary shape for canonical source', () => {
    const state = resolveScanlogReadSource('canonical', {
      hasSafeTable: true,
      hasLegacyTable: true,
    });
    const boundary = buildScanlogReadBoundary(state);

    assert.equal(boundary.direct_cutover_source, SCANLOG_CANONICAL_SOURCE);
    assert.equal(boundary.resolved_source, 'canonical');
    assert.equal(boundary.requested_source, 'canonical');
    assert.equal(boundary.fallback_reason, null);
    assert.equal(boundary.legacy_sdk_pull_route, '/api/scanlog/sync');
    assert.equal(boundary.legacy_sdk_pull_allowed, false);
  });

  it('returns correct boundary shape for legacy source', () => {
    const state = resolveScanlogReadSource('legacy', {
      hasSafeTable: true,
      hasLegacyTable: true,
    });
    const boundary = buildScanlogReadBoundary(state);

    assert.equal(boundary.direct_cutover_source, SCANLOG_CANONICAL_SOURCE);
    assert.equal(boundary.resolved_source, 'legacy');
    assert.equal(boundary.requested_source, 'legacy');
    assert.equal(boundary.fallback_reason, null);
    assert.equal(boundary.legacy_sdk_pull_route, '/api/scanlog/sync');
    assert.equal(boundary.legacy_sdk_pull_allowed, true);
  });

  it('includes fallback reason when canonical unavailable', () => {
    const state = resolveScanlogReadSource('canonical', {
      hasSafeTable: false,
      hasLegacyTable: true,
    });
    const boundary = buildScanlogReadBoundary(state);

    assert.equal(boundary.resolved_source, 'legacy');
    assert.equal(boundary.fallback_reason, 'canonical_unavailable');
    assert.equal(boundary.legacy_sdk_pull_allowed, true);
  });

  it('includes fallback reason when legacy unavailable', () => {
    const state = resolveScanlogReadSource('legacy', {
      hasSafeTable: true,
      hasLegacyTable: false,
    });
    const boundary = buildScanlogReadBoundary(state);

    assert.equal(boundary.resolved_source, 'canonical');
    assert.equal(boundary.fallback_reason, 'legacy_unavailable');
    assert.equal(boundary.legacy_sdk_pull_allowed, false);
  });

  it('direct_cutover_source is always canonical regardless of resolved source', () => {
    const legacyState = resolveScanlogReadSource('legacy', {
      hasSafeTable: true,
      hasLegacyTable: true,
    });
    const canonicalState = resolveScanlogReadSource('canonical', {
      hasSafeTable: true,
      hasLegacyTable: true,
    });

    assert.equal(buildScanlogReadBoundary(legacyState).direct_cutover_source, SCANLOG_CANONICAL_SOURCE);
    assert.equal(buildScanlogReadBoundary(canonicalState).direct_cutover_source, SCANLOG_CANONICAL_SOURCE);
  });
});
