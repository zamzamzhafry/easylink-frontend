'use client';
import { useEffect, useState, useCallback } from 'react';
import { CalendarRange, Download, ChevronLeft, ChevronRight, Users, Clock } from 'lucide-react';

// ─── helpers ───────────────────────────────────────────────
const fmtDate  = d => d.toISOString().slice(0,10);
const addDays  = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate()+n); return dt; };
const weekStart = (d) => { const dt = new Date(d); dt.setDate(dt.getDate()-dt.getDay()+1); return dt; };
const DAYS_ID  = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];

const SHIFT_CLS = {
  'Pagi':'badge-pagi','Siang':'badge-siang','Malam':'badge-malam',
  'Middle':'badge-middle','Libur':'badge-libur','Cuti':'badge-cuti','Non-shift':'badge-nonshift',
};

export default function SchedulePage() {
  const [weekOf, setWeekOf]     = useState(weekStart(new Date()));
  const [data, setData]         = useState({ shifts:[], schedules:[], employees:[] });
  const [loading, setLoading]   = useState(true);
  const [bulkModal, setBulkModal] = useState(false);

  const weekDates = Array.from({ length:7 }, (_,i) => addDays(weekOf, i));
  const from = fmtDate(weekDates[0]);
  const to   = fmtDate(weekDates[6]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/schedule?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const prevWeek = () => setWeekOf(w => addDays(w, -7));
  const nextWeek = () => setWeekOf(w => addDays(w, 7));

  // Lookup shift for a given karyawan + date
  const getShift = (karyawan_id, dateStr) =>
    data.schedules.find(s => s.karyawan_id === karyawan_id && s.tanggal === dateStr);

  const setShift = async (karyawan_id, tanggal, shift_id) => {
    await fetch('/api/schedule', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'set', karyawan_id, tanggal, shift_id }) });
    load();
  };

  // CSV/template download
  const exportTemplate = () => {
    const header = ['Nama','PIN', ...weekDates.map(d => fmtDate(d))];
    const rows = data.employees.map(e => [
      e.nama, e.pin,
      ...weekDates.map(d => getShift(e.id, fmtDate(d))?.nama_shift ?? ''),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `jadwal_${from}_${to}.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-mono text-teal-400 uppercase tracking-widest mb-1">Planning</p>
          <h1 className="text-3xl font-bold text-white">Shift Schedule</h1>
          <p className="text-slate-400 text-sm mt-1">Assign shifts per employee per day · anomalies auto-detected in Absensi</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm hover:bg-violet-500/30 transition-colors">
            <Users className="w-4 h-4" /> Bulk Assign Group
          </button>
          <button onClick={exportTemplate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-sm hover:bg-teal-500/20 transition-colors">
            <Download className="w-4 h-4" /> Export Template
          </button>
        </div>
      </div>

      {/* Week nav */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 flex items-center gap-4">
        <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-white font-semibold">
            {weekDates[0].toLocaleDateString('id-ID',{day:'numeric',month:'long'})} –{' '}
            {weekDates[6].toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}
          </span>
        </div>
        <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Shift legend */}
      <div className="flex flex-wrap gap-2">
        {data.shifts.map(s => (
          <span key={s.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${SHIFT_CLS[s.nama_shift] ?? 'badge-nonshift'}`}>
            {s.jam_masuk && <Clock className="w-3 h-3 opacity-70" />}
            {s.nama_shift}
            {s.jam_masuk && <span className="opacity-60">{s.jam_masuk.slice(0,5)}–{s.jam_keluar.slice(0,5)}{s.next_day?'+1':''}</span>}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-4 py-3 text-slate-500 font-medium text-xs text-left w-48">Employee</th>
                {weekDates.map((d, i) => {
                  const isToday = fmtDate(d) === fmtDate(new Date());
                  return (
                    <th key={i} className={`px-2 py-3 text-xs font-medium text-center w-28 ${isToday ? 'text-teal-400' : 'text-slate-500'}`}>
                      <div>{DAYS_ID[i]}</div>
                      <div className={`font-mono text-base mt-0.5 ${isToday ? 'text-teal-400' : 'text-slate-300'}`}>
                        {d.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-xs">Loading…</td></tr>
              ) : data.employees.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-xs">No employees found</td></tr>
              ) : data.employees.map(e => (
                <tr key={e.id} className="data-row">
                  <td className="px-4 py-2">
                    <div className="text-white text-sm font-medium">{e.nama}</div>
                    <div className="text-slate-600 text-xs font-mono">PIN {e.pin}</div>
                    {e.nama_group && (
                      <div className="text-teal-500/70 text-xs mt-0.5">{e.nama_group}</div>
                    )}
                  </td>
                  {weekDates.map((d, di) => {
                    const dateStr = fmtDate(d);
                    const sched   = getShift(e.id, dateStr);
                    const isToday = dateStr === fmtDate(new Date());
                    return (
                      <td key={di} className={`px-2 py-2 text-center ${isToday ? 'bg-teal-950/30' : ''}`}>
                        <select
                          value={sched?.shift_id ?? ''}
                          onChange={ev => { if (ev.target.value) setShift(e.id, dateStr, Number(ev.target.value)); }}
                          className={`w-full text-xs rounded-lg border px-1 py-1.5 focus:outline-none focus:border-teal-500 transition-colors cursor-pointer
                            ${sched ? `${SHIFT_CLS[sched.nama_shift] ?? ''} bg-transparent` : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                        >
                          <option value="">—</option>
                          {data.shifts.map(s => (
                            <option key={s.id} value={s.id}>{s.nama_shift}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Modal */}
      {bulkModal && (
        <BulkModal
          shifts={data.shifts}
          groups={[...new Map(data.employees.filter(e=>e.group_id).map(e=>[e.group_id,{id:e.group_id,name:e.nama_group}])).values()]}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setBulkModal(false)}
          onDone={() => { setBulkModal(false); load(); }}
        />
      )}
    </div>
  );
}

function BulkModal({ shifts, groups, defaultFrom, defaultTo, onClose, onDone }) {
  const [groupId, setGroupId]   = useState('');
  const [shiftId, setShiftId]   = useState('');
  const [from, setFrom]         = useState(defaultFrom);
  const [to, setTo]             = useState(defaultTo);
  const [saving, setSaving]     = useState(false);
  const [result, setResult]     = useState(null);

  const apply = async () => {
    if (!groupId || !shiftId) return;
    setSaving(true);
    const res = await fetch('/api/schedule', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'bulk_group', group_id: Number(groupId), shift_id: Number(shiftId), from, to }) });
    const json = await res.json();
    setSaving(false);
    setResult(json.affected);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-1">Bulk Assign — Group</h2>
        <p className="text-slate-500 text-xs mb-5">Apply one shift to all members of a group over a date range.</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Group</label>
            <select value={groupId} onChange={e=>setGroupId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500">
              <option value="">— select group —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Shift</label>
            <select value={shiftId} onChange={e=>setShiftId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500">
              <option value="">— select shift —</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.nama_shift}{s.jam_masuk?` (${s.jam_masuk.slice(0,5)}–${s.jam_keluar.slice(0,5)})`:''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">From</label>
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 font-mono" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">To</label>
              <input type="date" value={to} onChange={e=>setTo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 font-mono" />
            </div>
          </div>
          {result !== null && (
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg px-4 py-3 text-teal-300 text-sm">
              ✓ Applied to {result} schedule slot{result!==1?'s':''}
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          {result !== null
            ? <button onClick={onDone} className="flex-1 px-4 py-2 rounded-lg bg-teal-500 text-slate-900 font-semibold text-sm hover:bg-teal-400">Done</button>
            : <>
                <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-white">Cancel</button>
                <button onClick={apply} disabled={saving || !groupId || !shiftId}
                  className="flex-1 px-4 py-2 rounded-lg bg-teal-500 text-slate-900 font-semibold text-sm hover:bg-teal-400 disabled:opacity-50">
                  {saving ? 'Applying…' : 'Apply'}
                </button>
              </>
          }
        </div>
      </div>
    </div>
  );
}
