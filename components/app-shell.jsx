'use client';

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import RightOpsSidebar from '@/components/right-ops-sidebar';
import Sidebar from '@/components/sidebar';
import { getUIText } from '@/lib/localization/ui-texts';
import { cn } from '@/lib/utils';
import { requestJson } from '@/lib/request-json';

const STORAGE_KEY = 'easylink_sidebar_collapsed';
const RIGHT_SIDEBAR_STORAGE_KEY = 'easylink_right_sidebar_collapsed';
const THEME_KEY = 'easylink_theme';
const LOCALE_KEY = 'easylink_locale';
const FALLBACK_EVENT_NAME = 'easylink:themeRemountFallback';
const FALLBACK_EVENTS_PROPERTY = '__easylinkThemeFallbackEvents';

const AppLocaleContext = createContext({
  locale: 'en',
  setLocale: () => {},
});

function resolveAppLocale(locale) {
  if (!locale) return 'en';
  const normalized = String(locale).trim().toLowerCase();
  if (!normalized) return 'en';
  if (normalized === 'en' || normalized === 'id') return normalized;
  const [primary] = normalized.split(/[-_]/);
  return primary === 'en' || primary === 'id' ? primary : 'en';
}

export function useAppLocale() {
  return useContext(AppLocaleContext);
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/login';
  const [collapsed, setCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [authLoading, setAuthLoading] = useState(() => !isLoginPage);
  const [authUser, setAuthUser] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [locale, setLocale] = useState('en');
  const [remountKey, setRemountKey] = useState(0);
  const fallbackTriggeredRef = useRef(false);
  const showRightSidebar = Boolean(authUser?.is_admin) && !isLoginPage;
  const recordThemeFallbackEvent = (currentTheme, expectedTheme) => {
    if (typeof window === 'undefined') return;
    const eventRecord = {
      type: 'theme-remount-fallback',
      expectedTheme,
      currentTheme,
      timestamp: new Date().toISOString(),
    };
    const existing = Array.isArray(window[FALLBACK_EVENTS_PROPERTY])
      ? window[FALLBACK_EVENTS_PROPERTY]
      : [];
    existing.push(eventRecord);
    window[FALLBACK_EVENTS_PROPERTY] = existing;
    window.dispatchEvent(new CustomEvent(FALLBACK_EVENT_NAME, { detail: eventRecord }));
  };

  const scheduleThemeVerification = (expected) => {
    if (typeof document === 'undefined') return;

    const verify = () => {
      if (fallbackTriggeredRef.current) return;
      const current = document.documentElement.getAttribute('data-theme');
      if (current !== expected) {
        fallbackTriggeredRef.current = true;
        recordThemeFallbackEvent(current, expected);
        setRemountKey((prev) => prev + 1);
      }
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(verify);
    } else {
      setTimeout(verify, 0);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(THEME_KEY);
    const nextTheme = saved === 'light' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(LOCALE_KEY);
      setLocale(resolveAppLocale(saved));
    } catch {
      setLocale('en');
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // noop
      }
      scheduleThemeVerification(next);
      return next;
    });
  };

  const handleLocaleChange = useCallback((nextLocale) => {
    const resolved = resolveAppLocale(nextLocale);
    setLocale(resolved);
    try {
      window.localStorage.setItem(LOCALE_KEY, resolved);
    } catch {
      // noop
    }
  }, []);

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
    if (isLoginPage) return;
    try {
      const saved = window.localStorage.getItem(RIGHT_SIDEBAR_STORAGE_KEY);
      if (saved === '1') setRightSidebarCollapsed(true);
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

  useEffect(() => {
    if (isLoginPage || authLoading || !authUser || authUser.is_admin) {
      return;
    }

    const isMachineRoute = pathname === '/machine' || pathname?.startsWith('/machine/');

    if (isMachineRoute) {
      router.replace('/dashboard');
    }
  }, [authLoading, authUser, isLoginPage, pathname, router]);

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

  const toggleRightSidebar = () => {
    setRightSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RIGHT_SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // noop
      }
      return next;
    });
  };

  const localeContextValue = useMemo(
    () => ({ locale, setLocale: handleLocaleChange }),
    [handleLocaleChange, locale]
  );

  if (isLoginPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="app-shell-status w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-md shadow-slate-900/20 dark:border-slate-800/70 dark:bg-slate-950/60">
          <div className="h-4 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-4 w-full rounded-full bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
          <div className="h-4 w-5/6 rounded-full bg-slate-200/90 dark:bg-slate-800/70 animate-pulse" />
          <div className="flex items-center justify-between pt-2">
            <span className="h-3 w-16 rounded-full bg-slate-200/80 dark:bg-slate-800/60 animate-pulse" />
            <span className="h-3 w-12 rounded-full bg-slate-200/80 dark:bg-slate-800/60 animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  if (!authUser) {
    const redirectText = getUIText('appShell.redirecting', locale);
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="app-shell-status rounded-xl border border-slate-800 bg-slate-900 px-5 py-4 text-sm text-slate-300">
          {redirectText}
        </div>
      </main>
    );
  }

  return (
    <AppLocaleContext.Provider value={localeContextValue}>
      <Fragment key={remountKey}>
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleSidebar}
          currentUser={authUser}
          theme={theme}
          onThemeToggle={toggleTheme}
          locale={locale}
          onLocaleChange={handleLocaleChange}
        />
        <main
          className={cn(
            'app-shell-main min-h-screen p-6 transition-all duration-200',
            collapsed ? 'ml-20' : 'ml-60',
            showRightSidebar && 'xl:mr-80'
          )}
        >
          {children}
        </main>
        {showRightSidebar && (
          <RightOpsSidebar
            currentUser={authUser}
            collapsed={rightSidebarCollapsed}
            onToggle={toggleRightSidebar}
          />
        )}
      </Fragment>
    </AppLocaleContext.Provider>
  );
}
