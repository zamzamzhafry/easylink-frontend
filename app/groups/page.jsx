'use client';
import { useEffect, useState } from 'react';
import { Plus, Users, UserMinus, X, ChevronDown, ChevronRight } from 'lucide-react';

function CreateGroupModal({ onClose, onCreated }) {
  const [nama, setNama]   = useState('');
  const [desc, setDesc]   = useState('');
  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!nama.trim()) return;
    setSaving(true);
    await fetch('/api/groups', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'create_group', nama_group: nama, deskripsi: desc }) });
    setSaving(false); onCreated();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
        <h2 className="text-white font-bold text-lg mb-5">New Group</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Group Name *</label>
            <input value={nama} onChange={e => setNama(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-white">Cancel</button>
          <button onClick={create} disabled={saving || !nama.trim()}
            className="flex-1 px-4 py-2 rounded-lg bg-teal-500 text-slate-900 font-semibold text-sm hover:bg-teal-400 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GroupsPage() {
  const [data, setData]         = useState({ groups:[], members:[], unassigned:[] });
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [assigning, setAssigning] = useState({}); // groupId -> karyawanId being assigned

  const load = () => {
    setLoading(true);
    fetch('/api/groups').then(r => r.json()).then(d => { setData(d); setLoading(false); });
  };

  useEffect(load, []);

  const groupMembers = (gid) => data.members.filter(m => m.group_id === gid);

  const assign = async (karyawan_id, group_id) => {
    await fetch('/api/groups', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'assign', karyawan_id, group_id }) });
    load();
  };

  const remove = async (karyawan_id) => {
    await fetch('/api/groups', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'remove', karyawan_id }) });
    load();
  };

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-mono text-teal-400 uppercase tracking-widest mb-1">Organization</p>
          <h1 className="text-3xl font-bold text-white">Employee Groups</h1>
          <p className="text-slate-400 text-sm mt-1">Organize employees into groups for bulk scheduling</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 text-slate-900 font-semibold text-sm hover:bg-teal-400 transition-colors">
          <Plus className="w-4 h-4" /> New Group
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Groups list */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="text-slate-500 text-sm py-8 text-center">Loading…</div>
          ) : data.groups.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
              No groups yet. Create one to get started.
            </div>
          ) : data.groups.map(g => (
            <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              {/* Group header */}
              <button onClick={() => toggle(g.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/50 transition-colors text-left">
                <div className="w-8 h-8 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-teal-400" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold">{g.nama_group}</div>
                  {g.deskripsi && <div className="text-slate-500 text-xs mt-0.5">{g.deskripsi}</div>}
                </div>
                <span className="text-slate-500 text-xs font-mono mr-2">{groupMembers(g.id).length} members</span>
                {expanded[g.id] ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
              </button>

              {/* Members */}
              {expanded[g.id] && (
                <div className="border-t border-slate-800">
                  {groupMembers(g.id).length === 0 ? (
                    <p className="px-5 py-4 text-slate-600 text-xs italic">No members yet — assign from the panel →</p>
                  ) : groupMembers(g.id).map(m => (
                    <div key={m.karyawan_id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-800/30 border-b border-slate-800/50 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300 font-medium shrink-0">
                        {m.nama?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1">
                        <div className="text-white text-sm">{m.nama}</div>
                        <div className="text-slate-600 text-xs font-mono">PIN: {m.pin}</div>
                      </div>
                      <button onClick={() => remove(m.karyawan_id)}
                        className="text-slate-600 hover:text-rose-400 transition-colors p-1">
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Quick assign from unassigned */}
                  {data.unassigned.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-800/50 flex gap-2 items-center flex-wrap">
                      <span className="text-xs text-slate-600">Add:</span>
                      <select value={assigning[g.id] ?? ''}
                        onChange={e => setAssigning(a => ({ ...a, [g.id]: e.target.value }))}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-500 flex-1 min-w-0">
                        <option value="">— select employee —</option>
                        {data.unassigned.map(u => (
                          <option key={u.id} value={u.id}>{u.nama} (PIN: {u.pin})</option>
                        ))}
                      </select>
                      <button onClick={() => { if (assigning[g.id]) assign(Number(assigning[g.id]), g.id); }}
                        className="px-3 py-1 rounded-lg bg-teal-500/20 text-teal-400 text-xs border border-teal-500/30 hover:bg-teal-500/30 transition-colors">
                        Assign
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Unassigned panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden h-fit">
          <div className="px-5 py-3 border-b border-slate-800">
            <div className="text-sm font-semibold text-white">Unassigned</div>
            <div className="text-xs text-slate-500">{data.unassigned.length} employees without a group</div>
          </div>
          <div className="divide-y divide-slate-800/50 max-h-96 overflow-y-auto">
            {data.unassigned.length === 0 ? (
              <p className="px-5 py-6 text-slate-600 text-xs italic text-center">All employees assigned ✓</p>
            ) : data.unassigned.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 shrink-0">
                  {u.nama?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-xs truncate">{u.nama}</div>
                  <div className="text-slate-600 text-xs font-mono">PIN {u.pin}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {creating && (
        <CreateGroupModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}
