import { cn } from '@/lib/utils';

export function TableShell({ children, className, innerClassName }) {
  return (
    <div className={cn('ui-table-shell', className)}>
      <div className={cn('overflow-x-auto', innerClassName)}>{children}</div>
    </div>
  );
}

export function TableHeadRow({ headers }) {
  return (
    <tr className="ui-table-head text-left">
      {headers.map(({ key, label, className }) => (
        <th key={key} className={cn('ui-table-head-cell whitespace-nowrap px-4 py-3', className)}>
          {label}
        </th>
      ))}
    </tr>
  );
}

export function TableLoadingRow({ colSpan, label = 'Loading...' }) {
  return (
    <tr className="ui-table-row">
      <td colSpan={colSpan} className="ui-table-cell-muted px-4 py-10 text-center text-xs">
        {label}
      </td>
    </tr>
  );
}

export function TableEmptyRow({ colSpan, label = 'No data' }) {
  return (
    <tr className="ui-table-row">
      <td colSpan={colSpan} className="ui-table-cell-muted px-4 py-10 text-center text-xs">
        {label}
      </td>
    </tr>
  );
}
