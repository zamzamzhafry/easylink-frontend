'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Defensive localStorage-backed preference hook.
 *
 * Why this exists: raw localStorage reads have bitten this app before — a stale
 * value persisted across a deploy and put the UI into a weird state that only a
 * hard reload / cache clear could fix. This hook makes persistence safe:
 *
 *  - Versioned keys: callers pass a key like "easylink:v1:view-mode". Bumping the
 *    version (v1 -> v2) orphans every previously stored value, so a bad shape can
 *    never haunt a new release.
 *  - Validated reads: validate(value) runs on EVERY read. If it returns false the
 *    stored value is discarded, the key is self-healed (rewritten to the default),
 *    and the default is used.
 *  - SSR-safe: returns the default during render, hydrates from storage in an
 *    effect. No hydration mismatch, because first client render matches the server.
 *  - Never throws: all storage access is wrapped in try/catch.
 *
 * @template T
 * @param {string} key            Versioned storage key, e.g. "easylink:v1:view-mode".
 * @param {T} defaultValue        Value used before hydration and on any failure.
 * @param {(value: unknown) => boolean} [validate]  Returns true if a stored value is acceptable.
 * @returns {[T, (next: T) => void]} Tuple of [value, setValue].
 */
export default function usePersistedPreference(key, defaultValue, validate) {
  // First render always returns defaultValue so SSR and the initial client
  // render agree. Hydration happens in the effect below.
  const [value, setValue] = useState(defaultValue);

  const isValid = useCallback(
    (candidate) => {
      if (typeof validate !== 'function') return true;
      try {
        return validate(candidate) === true;
      } catch {
        return false;
      }
    },
    [validate]
  );

  // Hydrate from storage after mount. If the stored value is missing or invalid,
  // self-heal the key back to the default so it can never re-poison a later read.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stored = null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      return; // storage unavailable (private mode, blocked) — stay on default
    }

    if (stored === null) return; // nothing saved yet — keep default

    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch {
      parsed = stored; // tolerate plain-string legacy values
    }

    if (isValid(parsed)) {
      setValue(parsed);
    } else {
      // Stale / corrupt — discard and rewrite to default (self-heal).
      try {
        window.localStorage.setItem(key, JSON.stringify(defaultValue));
      } catch {
        // noop
      }
    }
    // We intentionally hydrate once on mount for a fixed key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? next(value) : next;
      if (!isValid(resolved)) return; // refuse to persist an invalid value
      setValue(resolved);
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // noop — in-memory value still updated
      }
    },
    [isValid, key, value]
  );

  return [value, update];
}
