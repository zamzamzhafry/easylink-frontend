'use client';
import { SvgPieChart, SvgBarChart } from '@/components/ui/charts';

export function DashboardCharts({ pieData, barData }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5 md:col-span-1">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Hari Ini</h3>
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <SvgPieChart data={pieData} size={180} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
               <span className="text-xl font-bold text-foreground">{pieData.reduce((a, b) => a + b.value, 0)}</span>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 text-xs">
            {pieData.map(d => (
              <div key={d.label} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="truncate text-muted-foreground">{d.label}</span>
                <span className="ml-auto font-mono text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 md:col-span-2">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Tren 7 Hari Terakhir</h3>
        <div className="h-[200px]">
          <SvgBarChart data={barData} />
        </div>
        <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
           <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Hadir</div>
        </div>
      </div>
    </div>
  );
}
