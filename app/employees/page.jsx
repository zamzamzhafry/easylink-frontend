'use client';
import { useEffect, useState } from 'react';
import { Pencil, Search, AlertCircle, CheckCircle2, X } from 'lucide-react';

function EditModal({ emp, onClose, onSaved }) {
  const [form, setForm] = useState({
    nama_karyawan: emp.nama_karyawan ?? '',
    nama_user:     emp.nama_user     ?? '',
    nip:           emp.nip           ?? '',
    awal_kontrak:  emp.awal_kontrak  ?? '',
    akhir_kontrak: emp.akhir_kontrak ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/employees/${emp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-white font-bold text-lg mb-1">Edit Employee</h2>
        <p className="text-slate-500 text-xs mb-5 font-mono">ID #{emp.id} · PIN {emp.pin}</p>

        <div className="space-y-4">
          <Field label="Full Name (tb_karyawan.nama)" value={form.nama_karyawan}
            onChange={v => setForm(f => ({ ...f, nama_karyawan: v }))} />
          <Field label="Device Username (tb_user.nama)" value={form.nama_user}
            onChange={v => setForm(f => ({ ...f, nama_user: v }))}
            hint="Leave unchanged to not modify device user" />
          <Field label="NIP" value={form.nip}
            onChange={v => setForm(f => ({ ...f, nip: v }))} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Awal Kontrak" value={form.awal_kontrak}
              onChange={v => setForm(f => ({ ...f, awal_kontrak: v }))} />
            <Field label="Akhir Kontrak" value={form.akhir_kontrak}
              onChange={v => setForm(f => ({ ...f, akhir_kontrak: v }))} />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-teal-500 text-slate-900 font-semibold text-sm hover:bg-teal-400 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500 transition-colors"
      />
      {hint && <p className="text-slate-600 text-xs mt-1">{hint}</p>}
    </div>
  );
}

export default function EmployeesPage() {
  const [data, setData]     = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/employees').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  };

  useEffect(load, []);

  const filtered = data.filter(e => {
    const q = search.toLowerCase();
    return (
      (e.nama_karyawan ?? '').toLowerCase().includes(q) ||
      (e.nama_user     ?? '').toLowerCase().includes(q) ||
      (e.pin           ?? '').includes(q) ||
      (e.nip           ?? '').includes(q)
    );
  });

  const unlinked = data.filter(e => !e.nama_karyawan || e.nama_karyawan.trim() === '');

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-mono text-teal-400 uppercase tracking-widest mb-1">Management</p>
          <h1 className="text-3xl font-bold text-white">Employees</h1>
          <p className="text-slate-400 text-sm mt-1">Link device users (tb_user) to employee records (tb_karyawan)</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white font-mono">{data.length}</div>
          <div className="text-xs text-slate-500">total records</div>
        </div>
      </div>

      {/* Alert: unlinked users */}
      {unlinked.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-300 text-sm font-medium">
              {unlinked.length} employee{unlinked.length > 1 ? 's' : ''} without a real name
            </p>
            <p className="text-amber-400/70 text-xs mt-0.5">
              These users were registered on the device but haven't been linked to a full name yet.
            </p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, PIN, or NIP…"
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                {['ID','PIN','Full Name (karyawan)','Device User (user)','NIP','Kontrak','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500 text-xs">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500 text-xs">No results</td></tr>
              ) : filtered.map(e => {
                const hasName = e.nama_karyawan && e.nama_karyawan.trim() !== '';
                return (
                  <tr key={e.id} className="data-row">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{e.id}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{e.pin}</td>
                    <td className="px-4 py-3">
                      {hasName ? (
                        <span className="text-white">{e.nama_karyawan}</span>
                      ) : (
                        <span className="italic text-amber-400/80 text-xs">— no name set —</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{e.nama_user || <span className="italic text-slate-600 text-xs">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{e.nip || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {e.awal_kontrak && <span>{e.awal_kontrak}{e.akhir_kontrak ? ` – ${e.akhir_kontrak}` : ''}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {hasName ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="w-3 h-3" /> Linked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
                          <AlertCircle className="w-3 h-3" /> Unlinked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setEditing(e)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-teal-500/20 hover:text-teal-400 text-slate-300 text-xs transition-all border border-slate-700 hover:border-teal-500/40">
                        <Pencil className="w-3 h-3" /> Edit
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
        <EditModal emp={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}
