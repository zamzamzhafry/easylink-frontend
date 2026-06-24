'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, BarChart3, Activity, Clock, Users, TrendingUp } from 'lucide-react';
import { useToast } from '@/components/ui/toast-provider';
import InlineStatusPanel from '@/components/ui/inline-status-panel';
import { requestJson } from '@/lib/request-json';
import { useAppLocale } from '@/components/app-shell';
import { getUIText } from '@/lib/localization/ui-texts';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

function isoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function monthStart(value = new Date()) {
  const date = new Date(value);
  date.setDate(1);
  return isoDate(date);
}

function StatCard({ label, value, unit, color }) {
  const colorClass = color === 'green' ? 'text-emerald-400' : color === 'yellow' ? 'text-amber-400' : color === 'red' ? 'text-rose-400' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-lg font-bold ${colorClass}`}>
        {value}{unit && <span className="text-sm text-muted-foreground ml-1">{unit}</span>}
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const { warning } = useToast();
  const [auth, setAuth] = useState(null);
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDate());
  const [groupId, setGroupId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [data, setData] = useState({
    metrics: {},
    checkInDistribution: [],
    weeklyTrend: [],
    departmentBreakdown: [],
    heatmap: [],
    bradfordFactors: []
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadAuth = useCallback(async () => {
    try {
      const me = await requestJson('/api/auth/me');
      const user = me?.user || null;
      setAuth(user);

      if (user?.is_admin) {
        const groupData = await requestJson('/api/groups');
        setGroups(Array.isArray(groupData?.groups) ? groupData.groups : []);
      } else {
        setGroups(
          (user?.groups || []).map((item) => ({ id: item.group_id, nama_group: item.nama_group }))
        );
      }
    } catch {
      setAuth(null);
      setGroups([]);
      warning('Could not load groups. Some filters may be unavailable.', 'Groups request failed');
    }
  }, [warning]);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  const loadEmployees = useCallback(async () => {
    if (!groupId) {
      setEmployees([]);
      return;
    }
    try {
      const result = await requestJson(`/api/employees?group_id=${groupId}`);
      setEmployees(Array.isArray(result?.employees) ? result.employees : []);
    } catch {
      setEmployees([]);
      warning('Could not load employees for this group.', 'Employees request failed');
    }
  }, [groupId, warning]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      if (groupId) query.set('group_id', groupId);
      if (employeeId) query.set('employee_id', employeeId);
      const result = await requestJson(`/api/analytics?${query.toString()}`);
      setData({
        metrics: result?.metrics || {},
        checkInDistribution: Array.isArray(result?.checkInDistribution) ? result.checkInDistribution : [],
        weeklyTrend: Array.isArray(result?.weeklyTrend) ? result.weeklyTrend : [],
        departmentBreakdown: Array.isArray(result?.departmentBreakdown) ? result.departmentBreakdown : [],
        heatmap: Array.isArray(result?.heatmap) ? result.heatmap : [],
        bradfordFactors: Array.isArray(result?.bradfordFactors) ? result.bradfordFactors : []
      });
      setLoadError('');
    } catch (error) {
      const message = error.message || 'Failed to load analytics.';
      setLoadError(message);
      warning(message, 'Analytics request failed');
    } finally {
      setLoading(false);
    }
  }, [employeeId, from, groupId, to, warning]);

  useEffect(() => {
    load();
  }, [load]);

  const getMetricColor = (value, type) => {
    if (type === 'rate') {
      if (value >= 90) return 'green';
      if (value >= 75) return 'yellow';
      return 'red';
    }
    return 'white';
  };

  const handleDepartmentClick = (entry) => {
    if (entry?.groupId) {
      setGroupId(entry.groupId);
    }
  };

  const handleExportPDF = async () => {
    try {
      const { exportAnalyticsPDF } = await import('@/lib/export-pdf');
      await exportAnalyticsPDF(data, { from, to, groupId, employeeId });
    } catch (err) {
      warning(err.message || 'PDF export failed.', 'Export Error');
    }
  };

  const handleExportExcel = async () => {
    try {
      const { exportAnalyticsExcel } = await import('@/lib/export-excel');
      await exportAnalyticsExcel(data, { from, to, groupId, employeeId });
    } catch (err) {
      warning(err.message || 'Excel export failed.', 'Export Error');
    }
  };

  const peakHour = data.checkInDistribution.reduce(
    (max, item) => (item.count > max.count ? item : max),
    { hour: 0, count: 0 }
  );

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
            <p className="text-sm text-muted-foreground">Advanced attendance insights and metrics</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm hover:bg-muted"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded border border-border bg-muted px-2 py-1 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded border border-border bg-muted px-2 py-1 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Group</label>
              <select
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  setEmployeeId('');
                }}
                className="w-full rounded border border-border bg-muted px-2 py-1 text-sm text-foreground"
              >
                <option value="">All Groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nama_group}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Employee</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={!groupId}
                className="w-full rounded border border-border bg-muted px-2 py-1 text-sm text-foreground disabled:opacity-50"
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nama}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={load}
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {loadError && (
          <InlineStatusPanel
            message={loadError}
            variant="error"
            actionLabel="Retry"
            onAction={load}
          />
        )}

        <div
          aria-busy={loading}
          className={`space-y-4 ${loading ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}`}
        >
        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard
            label="Attendance Rate"
            value={data.metrics.attendanceRate?.toFixed(1) || '0.0'}
            unit="%"
            color={getMetricColor(data.metrics.attendanceRate, 'rate')}
          />
          <StatCard
            label="Punctuality Index"
            value={data.metrics.punctualityRate?.toFixed(1) || '0.0'}
            unit="%"
            color={getMetricColor(data.metrics.punctualityRate, 'rate')}
          />
          <StatCard
            label="Avg Late Minutes"
            value={data.metrics.avgLateMinutes?.toFixed(0) || '0'}
            unit="min"
            color="white"
          />
          <StatCard
            label="Total Overtime"
            value={data.metrics.totalOvertimeHours?.toFixed(1) || '0.0'}
            unit="hrs"
            color="white"
          />
        </div>

        {/* Weekly Trend Line Chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Weekly Trend</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="week" stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="attendanceRate" stroke="#10b981" strokeWidth={2} name="Attendance %" />
              <Line type="monotone" dataKey="punctualityRate" stroke="#3b82f6" strokeWidth={2} name="Punctuality %" />
              <Line type="monotone" dataKey="lateRate" stroke="#f59e0b" strokeWidth={2} name="Late %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Check-in Distribution Area Chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Check-in Distribution</h2>
            {peakHour.count > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                Peak: {peakHour.hour}:00 ({peakHour.count} check-ins)
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.checkInDistribution}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCount)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Department Breakdown Stacked Bar Chart */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Department Breakdown</h2>
            <span className="ml-auto text-xs text-muted-foreground">Click bar to filter by group</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.departmentBreakdown} onClick={handleDepartmentClick}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="groupName" stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="present" stackId="a" fill="#10b981" name="Present" />
              <Bar dataKey="late" stackId="a" fill="#f59e0b" name="Late" />
              <Bar dataKey="absent" stackId="a" fill="#ef4444" name="Absent" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmap Calendar */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Attendance Heatmap</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="flex">
                {/* Sticky employee names column */}
                <div className="sticky left-0 z-10 bg-card">
                  <div className="h-8 border-b border-border px-2 py-1 text-xs font-medium text-muted-foreground">
                    Employee
                  </div>
                  {data.heatmap.map((row, idx) => (
                    <div
                      key={idx}
                      className="h-8 border-b border-border px-2 py-1 text-xs text-foreground truncate"
                      style={{ width: '150px' }}
                    >
                      {row.employeeName}
                    </div>
                  ))}
                </div>
                {/* Date columns */}
                <div className="flex">
                  {data.heatmap[0]?.dates?.map((dateObj, dateIdx) => (
                    <div key={dateIdx} className="flex-shrink-0" style={{ width: '40px' }}>
                      <div className="h-8 border-b border-border px-1 py-1 text-center text-xs text-muted-foreground">
                        {new Date(dateObj.date).getDate()}
                      </div>
                      {data.heatmap.map((row, rowIdx) => {
                        const cell = row.dates[dateIdx];
                        const bgColor =
                          cell.status === 'present'
                            ? '#10b981'
                            : cell.status === 'late'
                            ? '#f59e0b'
                            : cell.status === 'early_leave'
                            ? '#fb7185'
                            : cell.status === 'absent'
                            ? '#ef4444'
                            : '#1e293b';
                        return (
                          <div
                            key={rowIdx}
                            className="h-8 border-b border-border cursor-pointer hover:opacity-80"
                            style={{ backgroundColor: bgColor }}
                            title={`${row.employeeName} - ${dateObj.date} - ${cell.status}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: '#10b981' }} />
              <span className="text-muted-foreground">Present</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
              <span className="text-muted-foreground">Late</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: '#fb7185' }} />
              <span className="text-muted-foreground">Early Leave</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-muted-foreground">Absent</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: '#1e293b' }} />
              <span className="text-muted-foreground">No Schedule</span>
            </div>
          </div>
        </div>

        {/* Bradford Factor Table */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Bradford Factor Analysis</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2 text-right">Frequency</th>
                  <th className="px-3 py-2 text-right">Total Days</th>
                  <th className="px-3 py-2 text-right">Bradford Score</th>
                </tr>
              </thead>
              <tbody>
                {data.bradfordFactors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                      {t('analyticsPage.bradford.empty')}
                    </td>
                  </tr>
                ) : (
                  data.bradfordFactors.map((row, idx) => {
                    const scoreColor =
                      row.bradfordScore < 50
                        ? 'text-emerald-400'
                        : row.bradfordScore < 200
                        ? 'text-amber-400'
                        : 'text-rose-400';
                    return (
                      <tr key={idx} className="border-b border-border hover:bg-muted/50">
                        <td className="px-3 py-2 text-foreground">{row.employeeName}</td>
                        <td className="px-3 py-2 text-foreground">{row.groupName}</td>
                        <td className="px-3 py-2 text-right text-foreground">{row.frequency}</td>
                        <td className="px-3 py-2 text-right text-foreground">{row.totalDays}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${scoreColor}`}>
                          {row.bradfordScore}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        {!auth && <p className="text-xs text-rose-400">Session not loaded. Please re-login.</p>}
      </div>
    </div>
  );
}
