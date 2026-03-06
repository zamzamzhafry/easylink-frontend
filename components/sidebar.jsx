'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  Layers,
  CalendarRange,
  Fingerprint,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/',            label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/employees',   label: 'Employees',        icon: Users },
  { href: '/attendance',  label: 'Absensi',          icon: CalendarClock },
  { href: '/groups',      label: 'Groups',           icon: Layers },
  { href: '/schedule',    label: 'Schedule',         icon: CalendarRange },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-slate-900 flex flex-col z-40 border-r border-slate-800">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-800">
        <Fingerprint className="text-teal-400 w-6 h-6 shrink-0" />
        <span className="text-white font-semibold tracking-tight text-sm leading-tight">
          EasyLink<br />
          <span className="text-teal-400 font-bold text-base">Absensi</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800 text-slate-600 text-xs">
        demo_easylinksdk · v1.0
      </div>
    </aside>
  );
}
