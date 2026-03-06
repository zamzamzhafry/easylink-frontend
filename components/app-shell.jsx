'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/sidebar';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'easylink_sidebar_collapsed';

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === '1') setCollapsed(true);
    } catch {
      // noop
    }
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // noop
      }
      return next;
    });
  };

  return (
    <>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <main
        className={cn(
          'min-h-screen p-6 transition-all duration-200',
          collapsed ? 'ml-20' : 'ml-60'
        )}
      >
        {children}
      </main>
    </>
  );
}
