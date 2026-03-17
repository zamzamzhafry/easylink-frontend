'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  CalendarRange,
  Crown,
  DatabaseZap,
  Fingerprint,
  LayersIcon,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sun,
  Timer,
  UserCog,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, auth: 'all' },
  { href: '/schedule', label: 'Schedule', icon: CalendarRange, auth: 'schedule' },
  { href: '/performance', label: 'Performance', icon: BarChart3, auth: 'dashboard' },
  { href: '/attendance', label: 'Absensi', icon: CalendarClock, auth: 'member' },
  { href: '/employees', label: 'Employees', icon: Users, auth: 'admin' },
  { href: '/groups', label: 'Groups', icon: LayersIcon, auth: 'admin' },
  { href: '/shifts', label: 'Shift Maker', icon: Timer, auth: 'admin' },
  { href: '/users', label: 'Users', icon: UserCog, auth: 'admin' },
  { href: '/scanlog', label: 'Scan Log', icon: DatabaseZap, auth: 'admin' },
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
  const visibleNav = nav.filter((item) => canSeeNav(currentUser, item.auth));

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
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-800 bg-slate-900 transition-all duration-200',
        collapsed ? 'w-20' : 'w-60'
      )}
    >
      <div className="flex h-16 items-center border-b border-slate-800 px-3">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
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

      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {visibleNav.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                collapsed ? 'justify-center' : 'gap-3',
                active
                  ? 'border border-teal-500/20 bg-teal-500/15 text-teal-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-3 py-3">
        <button
          type="button"
          onClick={onThemeToggle}
          className={cn(
            'mb-2 flex w-full items-center rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white',
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
          <div className="mb-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
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
            'flex w-full items-center rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white',
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
