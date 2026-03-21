'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  Crown,
  DatabaseZap,
  Fingerprint,
  LayersIcon,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  ShieldCheck,
  Sun,
  Timer,
  UserCog,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navSections = [
  {
    key: 'overview',
    label: 'Overview',
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, auth: 'all' }],
  },
  {
    key: 'planning',
    label: 'Planning & Attendance',
    items: [
      { href: '/schedule', label: 'Schedule', icon: CalendarRange, auth: 'schedule' },
      { href: '/attendance', label: 'Absensi', icon: CalendarClock, auth: 'member' },
      {
        href: '/attendance/review',
        label: 'Attendance Review',
        icon: CalendarClock,
        auth: 'member',
      },
      { href: '/performance', label: 'Performance', icon: BarChart3, auth: 'dashboard' },
    ],
  },
  {
    key: 'master',
    label: 'Master Data',
    items: [
      { href: '/employees', label: 'Employees', icon: Users, auth: 'admin' },
      { href: '/groups', label: 'Groups', icon: LayersIcon, auth: 'admin' },
      { href: '/shifts', label: 'Shift Maker', icon: Timer, auth: 'admin' },
      { href: '/users', label: 'Users', icon: UserCog, auth: 'admin' },
      { href: '/scanlog', label: 'Scan Log', icon: DatabaseZap, auth: 'admin' },
      { href: '/machine', label: 'Machine Connect', icon: PlugZap, auth: 'admin' },
    ],
  },
];

function canSeeNav(user, authType) {
  if (!user) return authType === 'all';
  if (user.is_admin) return true;
  if (authType === 'all') return true;
  // 'member': any approved group access (can_schedule OR can_dashboard)
  if (authType === 'member') return Boolean(user.can_schedule || user.can_dashboard);
  // 'schedule': can view schedule (leader or can_schedule)
  if (authType === 'schedule') return Boolean(user.can_schedule);
  // 'dashboard': performance view
  if (authType === 'dashboard') return Boolean(user.can_dashboard);
  return false;
}

export default function Sidebar({
  collapsed = false,
  onToggle,
  currentUser = null,
  theme = 'dark',
  onThemeToggle,
}) {
  const path = usePathname();
  const [openSections, setOpenSections] = useState({
    overview: true,
    planning: true,
    master: true,
  });

  const visibleSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => canSeeNav(currentUser, item.auth)),
      }))
      .filter((section) => section.items.length > 0);
  }, [currentUser]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // noop
    }
    window.location.href = '/login';
  };

  return (
    <aside
      className={cn(
        'app-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-200',
        collapsed ? 'w-20' : 'w-60'
      )}
    >
      <div className="app-sidebar-header flex h-16 items-center border-b border-slate-800 px-3">
        <button
          type="button"
          onClick={onToggle}
          className="app-sidebar-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        <div
          className={cn(
            'ml-3 flex items-center gap-3 overflow-hidden transition-all',
            collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          )}
        >
          <Fingerprint className="h-6 w-6 shrink-0 text-teal-400" />
          <span className="text-sm font-semibold leading-tight text-white">
            EasyLink
            <br />
            <span className="text-base font-bold text-teal-400">Absensi</span>
          </span>
        </div>

        {collapsed && <Fingerprint className="ml-2 h-5 w-5 text-teal-400" />}
      </div>

      <nav className="app-sidebar-nav flex-1 space-y-2 overflow-y-auto px-2 py-4">
        {visibleSections.map((section) => {
          if (collapsed) {
            return section.items.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== '/' && path.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={cn(
                    'app-sidebar-link flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                    active
                      ? 'app-sidebar-link-active border border-teal-500/20 bg-teal-500/15 text-teal-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </Link>
              );
            });
          }

          const sectionActive = section.items.some(
            (item) => path === item.href || (item.href !== '/' && path.startsWith(item.href))
          );

          return (
            <div
              key={section.key}
              className="app-sidebar-section rounded-xl border border-slate-800 bg-slate-950/60"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenSections((prev) => ({
                    ...prev,
                    [section.key]: !prev[section.key],
                  }))
                }
                className={cn(
                  'app-sidebar-section-toggle flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide transition-colors',
                  sectionActive ? 'text-teal-300' : 'text-slate-400 hover:text-slate-200'
                )}
              >
                <span>{section.label}</span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    openSections[section.key] ? 'rotate-180' : 'rotate-0'
                  )}
                />
              </button>
              {openSections[section.key] && (
                <div className="space-y-1 px-2 pb-2">
                  {section.items.map(({ href, label, icon: Icon }) => {
                    const active = path === href || (href !== '/' && path.startsWith(href));
                    return (
                      <Link
                        key={href}
                        href={href}
                        title={label}
                        className={cn(
                          'app-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                          active
                            ? 'app-sidebar-link-active border border-teal-500/20 bg-teal-500/15 text-teal-400'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="app-sidebar-footer border-t border-slate-800 px-3 py-3">
        <button
          type="button"
          onClick={onThemeToggle}
          className={cn(
            'app-sidebar-theme-btn mb-2 flex w-full items-center rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white',
            collapsed ? 'justify-center' : 'gap-2'
          )}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          ) : (
            <Moon className="h-3.5 w-3.5 shrink-0 text-teal-500" />
          )}
          {!collapsed && (theme === 'dark' ? 'Light Mode' : 'Dark Mode')}
        </button>

        {currentUser && !collapsed && (
          <div className="app-sidebar-userbox mb-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
            <div className="text-xs font-semibold text-white">{currentUser.nama}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
              {currentUser.is_admin ? (
                <>
                  <ShieldCheck className="h-3 w-3" /> Admin
                </>
              ) : currentUser.is_leader ? (
                <>
                  <Crown className="h-3 w-3 text-amber-400" /> Group Leader
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3 w-3" /> Member
                </>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className={cn(
            'app-sidebar-logout flex w-full items-center rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white',
            collapsed ? 'justify-center' : 'gap-2'
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && 'Logout'}
        </button>

        <div className={cn('mt-3 text-xs text-slate-600', collapsed ? 'text-center' : '')}>
          {collapsed ? 'v1.1' : 'demo_easylinksdk | v1.1'}
        </div>
      </div>
    </aside>
  );
}
