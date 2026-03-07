'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/sidebar';
import { cn } from '@/lib/utils';
import { requestJson } from '@/lib/request-json';

const STORAGE_KEY = 'easylink_sidebar_collapsed';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';
  const [collapsed, setCollapsed] = useState(false);
  const [authLoading, setAuthLoading] = useState(() => !isLoginPage);
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    if (isLoginPage) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === '1') setCollapsed(true);
    } catch {
      // noop
    }
  }, [isLoginPage]);

  useEffect(() => {
    let mounted = true;
    if (isLoginPage) {
      setAuthLoading(false);
      setAuthUser(null);
      return () => {
        mounted = false;
      };
    }

    setAuthLoading(true);
    requestJson('/api/auth/me')
      .then((data) => {
        if (!mounted) return;
        setAuthUser(data?.user || null);
      })
      .catch(() => {
        if (!mounted) return;
        const nextPath = pathname || '/';
        router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      })
      .finally(() => {
        if (!mounted) return;
        setAuthLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isLoginPage, pathname, router]);

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

  if (isLoginPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm text-slate-300">
          Checking session...
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm text-slate-300">
          Redirecting to login...
        </div>
      </main>
    );
  }

  return (
    <>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} currentUser={authUser} />
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
