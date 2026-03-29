'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  Crown,
  DatabaseZap,
  Fingerprint,
  Languages,
  LayersIcon,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  Settings,
  ShieldCheck,
  Sun,
  Timer,
  UserCog,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import SettingsModal from '@/components/settings/settings-modal';
import { canSeeNavItem } from '@/lib/authz/authorization-adapter';
import { getUIText } from '@/lib/localization/ui-texts';

export default function Sidebar({
  collapsed = false,
  onToggle,
  currentUser = null,
  theme = 'dark',
  onThemeToggle,
  locale = 'en',
  onLocaleChange,
}) {
  const path = usePathname();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const navSections = useMemo(
    () => [
      {
        key: 'overview',
        label: t('sidebar.sections.overview'),
        items: [
          { href: '/', label: t('sidebar.items.dashboard'), icon: LayoutDashboard, auth: 'all' },
        ],
      },
      {
        key: 'planning',
        label: t('sidebar.sections.planning'),
        items: [
          {
            href: '/schedule',
            label: t('sidebar.items.schedule'),
            icon: CalendarRange,
            auth: 'schedule',
          },
          {
            href: '/attendance',
            label: t('sidebar.items.attendance'),
            icon: CalendarClock,
            auth: 'member',
          },
          {
            href: '/attendance/review',
            label: t('sidebar.items.attendanceReview'),
            icon: CalendarClock,
            auth: 'member',
          },
          {
            href: '/performance',
            label: t('sidebar.items.performance'),
            icon: BarChart3,
            auth: 'dashboard',
          },
        ],
      },
      {
        key: 'master',
        label: t('sidebar.sections.master'),
        items: [
          { href: '/employees', label: t('sidebar.items.employees'), icon: Users, auth: 'admin' },
          { href: '/groups', label: t('sidebar.items.groups'), icon: LayersIcon, auth: 'admin' },
          { href: '/shifts', label: t('sidebar.items.shifts'), icon: Timer, auth: 'admin' },
          { href: '/users', label: t('sidebar.items.users'), icon: UserCog, auth: 'admin' },
          { href: '/scanlog', label: t('sidebar.items.scanlog'), icon: DatabaseZap, auth: 'admin' },
          { href: '/machine', label: t('sidebar.items.machine'), icon: PlugZap, auth: 'admin' },
        ],
      },
    ],
    [t]
  );
  const [openSections, setOpenSections] = useState({
    overview: true,
    planning: true,
    master: true,
  });
  const [showSettings, setShowSettings] = useState(false);

  const visibleSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => canSeeNavItem(currentUser, item.auth)),
      }))
      .filter((section) => section.items.length > 0);
  }, [currentUser, navSections]);

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
          title={
            collapsed ? t('sidebar.actions.expandSidebar') : t('sidebar.actions.collapseSidebar')
          }
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
            <span className="text-base font-bold text-teal-400">{t('sidebar.brand.subtitle')}</span>
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
        {/* settings button */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className={cn(
            'app-sidebar-settings mb-2 flex w-full items-center rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white',
            collapsed ? 'justify-center' : 'gap-2'
          )}
          title={t('sidebar.actions.settings')}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && t('sidebar.actions.settings')}
        </button>
        <button
          type="button"
          onClick={onThemeToggle}
          className={cn(
            'app-sidebar-theme-btn mb-2 flex w-full items-center rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white',
            collapsed ? 'justify-center' : 'gap-2'
          )}
          title={
            theme === 'dark'
              ? t('sidebar.actions.switchToLightMode')
              : t('sidebar.actions.switchToDarkMode')
          }
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          ) : (
            <Moon className="h-3.5 w-3.5 shrink-0 text-teal-500" />
          )}
          {!collapsed &&
            (theme === 'dark' ? t('sidebar.actions.lightMode') : t('sidebar.actions.darkMode'))}
        </button>
        <div
          className={cn(
            'app-sidebar-locale mb-2 rounded-lg border border-slate-700 bg-slate-900/70 p-1',
            collapsed ? 'flex justify-center' : ''
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => onLocaleChange?.(resolvedLocale === 'en' ? 'id' : 'en')}
              className="inline-flex h-7 min-w-10 items-center justify-center rounded-md border border-slate-600 px-2 text-[10px] font-semibold tracking-wide text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
              title={
                resolvedLocale === 'en'
                  ? t('sidebar.locale.switchToBahasa')
                  : t('sidebar.locale.switchToEnglish')
              }
            >
              {resolvedLocale.toUpperCase()}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400">
                <Languages className="h-3.5 w-3.5" />
              </span>
              <button
                type="button"
                onClick={() => onLocaleChange?.('en')}
                className={cn(
                  'h-7 rounded-md px-2 text-[10px] font-semibold tracking-wide transition-colors',
                  resolvedLocale === 'en'
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )}
                title={t('sidebar.locale.switchToEnglish')}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onLocaleChange?.('id')}
                className={cn(
                  'h-7 rounded-md px-2 text-[10px] font-semibold tracking-wide transition-colors',
                  resolvedLocale === 'id'
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )}
                title={t('sidebar.locale.switchToBahasa')}
              >
                ID
              </button>
            </div>
          )}
        </div>

        {currentUser && !collapsed && (
          <div className="app-sidebar-userbox mb-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
            <div className="text-xs font-semibold text-white">{currentUser.nama}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
              {currentUser.is_admin ? (
                <>
                  <ShieldCheck className="h-3 w-3" /> {t('sidebar.roles.admin')}
                </>
              ) : currentUser.is_leader ? (
                <>
                  <Crown className="h-3 w-3 text-amber-400" /> {t('sidebar.roles.groupLeader')}
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3 w-3" /> {t('sidebar.roles.member')}
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
          {!collapsed && t('sidebar.actions.logout')}
        </button>

        <div className={cn('mt-3 text-xs text-slate-600', collapsed ? 'text-center' : '')}>
          {collapsed ? t('sidebar.version.short') : t('sidebar.version.full')}
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </aside>
  );
}
