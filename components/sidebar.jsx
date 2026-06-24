'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  CalendarClock,
  CalendarRange,
  ChevronDown,
  Crown,
  DatabaseZap,
  FileBarChart,
  Fingerprint,
  Languages,
  LayersIcon,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  Settings,
  ShieldCheck,
  Sun,
  Table,
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
  mobileOpen = false,
  onMobileClose,
  currentUser = null,
  theme = 'dark',
  onThemeToggle,
  locale = 'en',
  onLocaleChange,
  viewMode = 'auto',
  onViewModeCycle,
}) {
  const path = usePathname();
  // Mobile drawer always renders expanded, ignoring the persisted collapse state.
  const effectiveCollapsed = collapsed && !mobileOpen;
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const viewModeMeta = {
    auto: { icon: Monitor, label: 'Auto layout' },
    table: { icon: Table, label: 'Table view' },
    cards: { icon: LayoutGrid, label: 'Card view' },
  };
  const currentViewMode = viewModeMeta[viewMode] ?? viewModeMeta.auto;
  const ViewModeIcon = currentViewMode.icon;
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
            auth: 'admin',
          },
          {
            href: '/performance',
            label: t('sidebar.items.performance'),
            icon: BarChart3,
            auth: 'dashboard',
          },
          {
            href: '/analytics',
            label: t('sidebar.items.analytics'),
            icon: Activity,
            auth: 'dashboard',
          },
          {
            href: '/report',
            label: t('sidebar.items.report'),
            icon: FileBarChart,
            auth: 'admin',
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
  const roleLabel = useMemo(() => {
    if (!currentUser) return null;
    if (currentUser.is_admin) return t('sidebar.roles.admin');
    if (currentUser.is_hr) return 'HR';
    if (currentUser.role_key === 'scheduler' || currentUser.is_leader) {
      return t('sidebar.roles.groupLeader');
    }
    if (currentUser.role_key === 'viewer') return 'Viewer';
    return t('sidebar.roles.member');
  }, [currentUser, t]);

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

  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onMobileClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}
      <aside
        className={cn(
          'app-sidebar fixed inset-y-0 left-0 flex flex-col border-r border-border bg-card transition-all duration-200',
          mobileOpen ? 'z-50 w-60 translate-x-0' : 'z-40 -translate-x-full lg:translate-x-0',
          effectiveCollapsed ? 'lg:w-20' : 'lg:w-60'
        )}
      >
      <div className="app-sidebar-header flex h-16 items-center border-b border-border px-3">
        <button
          type="button"
          onClick={onToggle}
          className="app-sidebar-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
          aria-label={
            effectiveCollapsed
              ? t('sidebar.actions.expandSidebar')
              : t('sidebar.actions.collapseSidebar')
          }
          title={
            effectiveCollapsed
              ? t('sidebar.actions.expandSidebar')
              : t('sidebar.actions.collapseSidebar')
          }
        >
          {effectiveCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        <div
          className={cn(
            'ml-3 flex items-center gap-3 overflow-hidden transition-all',
            effectiveCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          )}
        >
          <Fingerprint className="h-6 w-6 shrink-0 text-teal-400" />
          <span className="text-sm font-semibold leading-tight text-foreground">
            EasyLink
            <br />
            <span className="text-base font-bold text-teal-400">{t('sidebar.brand.subtitle')}</span>
          </span>
        </div>

        {effectiveCollapsed && <Fingerprint className="ml-2 h-5 w-5 text-teal-400" />}
      </div>

      <nav className="app-sidebar-nav flex-1 space-y-2 overflow-y-auto px-2 py-4">
        {visibleSections.map((section) => {
          if (effectiveCollapsed) {
            return section.items.map(({ href, label, icon: Icon }) => {
              const active = path === href || (href !== '/' && path.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'app-sidebar-link flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                    active
                      ? 'app-sidebar-link-active border border-teal-500/20 bg-teal-500/15 text-teal-400'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
              className="app-sidebar-section rounded-xl border border-border bg-card/60"
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
                  sectionActive ? 'text-teal-300' : 'text-muted-foreground hover:text-foreground'
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
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'app-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                          active
                            ? 'app-sidebar-link-active border border-teal-500/20 bg-teal-500/15 text-teal-400'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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

      <div className="app-sidebar-footer border-t border-border px-3 py-3">
        {/* settings button */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className={cn(
            'app-sidebar-settings mb-2 flex w-full items-center rounded-lg border border-border px-2.5 py-2 text-xs text-foreground transition-colors hover:border-border hover:text-foreground',
            effectiveCollapsed ? 'justify-center' : 'gap-2'
          )}
          aria-label={t('sidebar.actions.settings')}
          title={t('sidebar.actions.settings')}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          {!effectiveCollapsed && t('sidebar.actions.settings')}
        </button>
        <button
          type="button"
          onClick={onThemeToggle}
          className={cn(
            'app-sidebar-theme-btn mb-2 flex w-full items-center rounded-lg border border-border px-2.5 py-2 text-xs text-foreground transition-colors hover:border-border hover:text-foreground',
            effectiveCollapsed ? 'justify-center' : 'gap-2'
          )}
          aria-label={
            theme === 'dark'
              ? t('sidebar.actions.switchToLightMode')
              : t('sidebar.actions.switchToDarkMode')
          }
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
          {!effectiveCollapsed &&
            (theme === 'dark' ? t('sidebar.actions.lightMode') : t('sidebar.actions.darkMode'))}
        </button>
        <button
          type="button"
          onClick={onViewModeCycle}
          className={cn(
            'app-sidebar-viewmode-btn mb-2 flex w-full items-center rounded-lg border border-border px-2.5 py-2 text-xs text-foreground transition-colors hover:border-border hover:text-foreground',
            effectiveCollapsed ? 'justify-center' : 'gap-2'
          )}
          aria-label={`Table layout: ${currentViewMode.label} (click to change)`}
          title={`Table layout: ${currentViewMode.label} (click to change)`}
        >
          <ViewModeIcon className="h-3.5 w-3.5 shrink-0 text-teal-400" />
          {!effectiveCollapsed && currentViewMode.label}
        </button>
        <div
          className={cn(
            'app-sidebar-locale mb-2 rounded-lg border border-border bg-card/70 p-1',
            effectiveCollapsed ? 'flex justify-center' : ''
          )}
        >
          {effectiveCollapsed ? (
            <button
              type="button"
              onClick={() => onLocaleChange?.(resolvedLocale === 'en' ? 'id' : 'en')}
              className="inline-flex h-7 min-w-10 items-center justify-center rounded-md border border-border px-2 text-xs font-semibold tracking-wide text-foreground transition-colors hover:border-border hover:text-foreground"
              aria-label={
                resolvedLocale === 'en'
                  ? t('sidebar.locale.switchToBahasa')
                  : t('sidebar.locale.switchToEnglish')
              }
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
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground">
                <Languages className="h-3.5 w-3.5" />
              </span>
              <button
                type="button"
                onClick={() => onLocaleChange?.('en')}
                className={cn(
                  'h-7 rounded-md px-2 text-xs font-semibold tracking-wide transition-colors',
                  resolvedLocale === 'en'
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                aria-label={t('sidebar.locale.switchToEnglish')}
                title={t('sidebar.locale.switchToEnglish')}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onLocaleChange?.('id')}
                className={cn(
                  'h-7 rounded-md px-2 text-xs font-semibold tracking-wide transition-colors',
                  resolvedLocale === 'id'
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                aria-label={t('sidebar.locale.switchToBahasa')}
                title={t('sidebar.locale.switchToBahasa')}
              >
                ID
              </button>
            </div>
          )}
        </div>

        {currentUser && !effectiveCollapsed && (
          <div className="app-sidebar-userbox mb-2 rounded-lg border border-border bg-card/70 px-3 py-2">
            <div className="text-xs font-semibold text-foreground">{currentUser.nama}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              {currentUser.is_admin ? (
                <>
                  <ShieldCheck className="h-3 w-3" /> {t('sidebar.roles.admin')}
                </>
              ) : currentUser.is_hr ? (
                <>
                  <ShieldCheck className="h-3 w-3 text-sky-400" /> HR
                </>
              ) : currentUser.is_leader ? (
                <>
                  <Crown className="h-3 w-3 text-amber-400" /> {t('sidebar.roles.groupLeader')}
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3 w-3" /> {roleLabel}
                </>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className={cn(
            'app-sidebar-logout flex w-full items-center rounded-lg border border-border px-2.5 py-2 text-xs text-foreground transition-colors hover:border-border hover:text-foreground',
            effectiveCollapsed ? 'justify-center' : 'gap-2'
          )}
          aria-label={t('sidebar.actions.logout')}
          title={t('sidebar.actions.logout')}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!effectiveCollapsed && t('sidebar.actions.logout')}
        </button>

        <div
          className={cn('mt-3 text-xs text-muted-foreground', effectiveCollapsed ? 'text-center' : '')}
        >
          {effectiveCollapsed ? t('sidebar.version.short') : t('sidebar.version.full')}
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </aside>
    </>
  );
}
