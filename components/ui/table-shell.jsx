import { cn } from '@/lib/utils';

export function TableShell({ children, className, innerClassName }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-slate-800 bg-slate-900', className)}>
      <div className={cn('overflow-x-auto', innerClassName)}>{children}</div>
    </div>
  );
}

export function TableHeadRow({ headers }) {
  return (
    <tr className="border-b border-slate-800 text-left">
      {headers.map(({ key, label, className }) => (
        <th
          key={key}
          className={cn(
            'whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500',
            className
          )}
        >
          {label}
        </th>
      ))}
    </tr>
  );
}

export function TableLoadingRow({ colSpan, label = 'Loading...' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-xs text-slate-500">
        {label}
      </td>
    </tr>
  );
}

export function TableEmptyRow({ colSpan, label = 'No data' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-xs text-slate-500">
        {label}
      </td>
    </tr>
  );
}
