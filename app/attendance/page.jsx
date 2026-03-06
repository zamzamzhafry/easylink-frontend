'use client';
import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Download, Pencil, X, Clock, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';

// ─── helpers ───────────────────────────────────────────────
const today    = () => new Date().toISOString().slice(0, 10);
const addDays  = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0,10); };
const startOf  = (unit) => {
  const d = new Date();
  if (unit === 'week')  { const day = d.getDay(); d.setDate(d.getDate() - day + 1); }
  if (unit === 'month') { d.setDate(1); }
  if (unit === 'last')  { d.setDate(1); d.setMonth(d.getMonth() - 1); }
  return d.toISOString().slice(0, 10);
};
const endOf = (unit) => {
  const d = new Date();
  if (unit === 'week')  { const day = d.getDay(); d.setDate(d.getDate() - day + 7); }
  if (unit === 'month') { d.setMonth(d.getMonth() + 1); d.setDate(0); }
  if (unit === 'last')  { d.setDate(0); }
  return d.toISOString().slice(0, 10);
};

const STATUS_MAP = {
  normal:       { label: 'Normal',       cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  terlambat:    { label: 'Terlambat',    cls: 'text-amber-400  bg-amber-400/10  border-amber-400/20'  },
  pulang_awal:  { label: 'Pulang Awal',  cls: 'text-rose-400   bg-rose-400/10   border-rose-400/20'   },
  tidak_hadir:  { label: 'Tidak Hadir',  cls: 'text-slate-400  bg-slate-400/10  border-slate-400/20'  },
  lembur:       { label: 'Lembur',       cls: 'text-violet-400 bg-violet-400/10 border-violet-400/20' },
  lainnya:      { label: 'Lainnya',      cls: 'text-sky-400    bg-sky-400/10    border-sky-400/20'    },
};

const SHIFT_CLS = {
  Pagi: 'badge-pagi', Siang: 'badge-siang', Malam: 'badge-malam',
  Middle: 'badge-middle', Libur: 'badge-libur', Cuti: 'badge-cuti', 'Non-shift': 'badge-nonshift',
};

// ─── Note editor modal ──────────────────────────────────────
function NoteModal({ row, onClose, onSaved }) {
  const [status, setStatus]   = useState(row.note_status || row.computed_status || 'normal');
  const [catatan, setCatatan] = useState(row.note_catatan || '');
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: row.pin, tanggal: row.scan_date, status, catatan }),
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
        <h2 className="text-white font-bold text-lg">Edit Catatan</h2>
        <p className="text-slate-500 text-xs font-mono mt-1 mb-5">{row.nama} · {row.scan_date}</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500">
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Catatan / Keterangan</label>
            <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={3}
              placeholder="Contoh: izin dokter, tugas luar kota…"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-teal-500 text-slate-900 font-semibold text-sm hover:bg-teal-400 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────
export default function AttendancePage() {
  const [from, setFrom]       = useState(startOf('week'));
  const [to, setTo]           = useState(today());
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/attendance?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const setRange = (unit) => {
    if (unit === 'today') { setFrom(today()); setTo(today()); }
    else if (unit === 'last') { setFrom(startOf('last')); setTo(endOf('last')); }
    else { setFrom(startOf(unit)); setTo(endOf(unit)); }
  };

  // CSV export
  const exportCSV = () => {
    const headers = ['Tanggal','Nama','PIN','Shift','Masuk','Keluar','Durasi','Status','Catatan'];
    const rows = data.map(r => [
      r.scan_date, r.nama, r.pin, r.nama_shift ?? 'Non-shift',
      r.masuk ?? '—', r.keluar ?? '—', r.durasi_label,
      STATUS_MAP[r.computed_status]?.label ?? r.computed_status,
      r.note_catatan ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `absensi_${from}_${to}.csv`; a.click();
  };

  const anomalyCount = data.filter(r => r.computed_status !== 'normal').length;

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-mono text-teal-400 uppercase tracking-widest mb-1">Records</p>
          <h1 className="text-3xl font-bold text-white">Absensi Karyawan</h1>
          <p className="text-slate-400 text-sm mt-1">Scan log with shift comparison & anomaly detection</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-sm hover:bg-teal-500/20 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Date controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <CalendarDays className="w-4 h-4 text-teal-400 shrink-0" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500 font-mono" />
          <label className="text-xs text-slate-500">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500 font-mono" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { k:'today', label:'Today' }, { k:'week', label:'This Week' },
            { k:'month', label:'This Month' }, { k:'last', label:'Last Month' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setRange(k)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs hover:border-teal-500/60 hover:text-teal-400 transition-colors">
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-4 text-xs">
          <span className="text-slate-500"><span className="text-white font-mono font-bold">{data.length}</span> records</span>
          {anomalyCount > 0 && (
            <span className="text-amber-400"><span className="font-mono font-bold">{anomalyCount}</span> anomalies</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                {['Tanggal','Nama','Shift','Masuk','Keluar','Durasi','Status','Catatan',''].map(h => (
                  <th key={h} className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500 text-xs">Loading…</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500 text-xs">No records in range</td></tr>
              ) : data.map((r, i) => {
                const smap = STATUS_MAP[r.computed_status] ?? STATUS_MAP.lainnya;
                const isAnomaly = r.computed_status !== 'normal';
                return (
                  <tr key={i} className={`data-row ${isAnomaly ? 'bg-amber-500/3' : ''}`}>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.scan_date}</td>
                    <td className="px-4 py-3 text-white font-medium">{r.nama}</td>
                    <td className="px-4 py-3">
                      {r.nama_shift ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${SHIFT_CLS[r.nama_shift] ?? 'badge-nonshift'}`}>
                          {r.nama_shift}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-teal-500" />
                        <span className="font-mono text-xs text-teal-300">{r.masuk ?? '—'}</span>
                        {r.flags?.includes('terlambat') && (
                          <AlertTriangle className="w-3 h-3 text-amber-400" title="Terlambat" />
                        )}
                      </div>
                      {r.jam_masuk && (
                        <div className="text-slate-600 text-xs font-mono mt-0.5">Jadwal: {r.jam_masuk.slice(0,5)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-slate-300">{r.keluar ?? '—'}</span>
                        {r.flags?.includes('pulang_awal') && (
                          <AlertTriangle className="w-3 h-3 text-rose-400" title="Pulang Awal" />
                        )}
                      </div>
                      {r.jam_keluar && (
                        <div className="text-slate-600 text-xs font-mono mt-0.5">Jadwal: {r.jam_keluar.slice(0,5)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.durasi_label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${smap.cls}`}>
                        {isAnomaly ? <AlertTriangle className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                        {smap.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {r.note_catatan ? (
                        <span className="text-slate-400 text-xs truncate block">{r.note_catatan}</span>
                      ) : (
                        <span className="text-slate-700 text-xs italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setEditing(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-teal-500/20 hover:text-teal-400 text-slate-400 text-xs transition-all border border-slate-700 hover:border-teal-500/40">
                        <Pencil className="w-3 h-3" /> Note
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <NoteModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}
