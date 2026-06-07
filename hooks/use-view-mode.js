'use client';

import { useCallback } from 'react';
import usePersistedPreference from '@/hooks/use-persisted-preference';

export const VIEW_MODE_KEY = 'easylink:v1:view-mode';
export const VIEW_MODES = ['auto', 'table', 'cards'];

const isViewMode = (value) => VIEW_MODES.includes(value);

export default function useViewMode() {
  const [viewMode, setViewMode] = usePersistedPreference(VIEW_MODE_KEY, 'auto', isViewMode);

  const cycleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const idx = VIEW_MODES.indexOf(prev);
      return VIEW_MODES[(idx + 1) % VIEW_MODES.length];
    });
  }, [setViewMode]);

  return { viewMode, setViewMode, cycleViewMode };
}
