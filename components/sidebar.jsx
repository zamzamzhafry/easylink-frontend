'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock,
  CalendarRange,
  Fingerprint,
  LayoutDashboard,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/attendance', label: 'Absensi', icon: CalendarClock },
  { href: '/groups', label: 'Groups', icon: Layers },
  { href: '/schedule', label: 'Schedule', icon: CalendarRange },
];

export default function Sidebar({ collapsed = false, onToggle }) {
  const path = usePathname();

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
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <div className={cn('ml-3 flex items-center gap-3 overflow-hidden transition-all', collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100')}>
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
        {nav.map(({ href, label, icon: Icon }) => {
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

      <div className={cn('border-t border-slate-800 px-4 py-4 text-xs text-slate-600', collapsed ? 'text-center' : '')}>
        {collapsed ? 'v1.0' : 'demo_easylinksdk | v1.0'}
      </div>
    </aside>
  );
}
