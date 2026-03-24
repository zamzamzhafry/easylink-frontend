"use client";
import { useState } from 'react';
import { requestJson } from '@/lib/utils'; // Assuming this exists or fetch wrapper

export default function MigrateScanlogPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleMigrate = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await requestJson('/api/admin/migrate-scanlog', { method: 'POST' });
      if (res.ok) {
        setResult(`Migration successful. Rows affected: ${res.rowsAffected}`);
      } else {
        setError(res.error || 'Migration failed.');
      }
    } catch (err) {
      setError(err.message || 'Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Database Operations</h1>
      
      <div className="bg-white shadow rounded-lg p-6 border border-gray-200">
        <h2 className="text-xl font-semibold mb-2">Migrate Legacy Scan Logs</h2>
        <p className="text-gray-600 mb-4 text-sm">
          Safely migrate raw device scan data from <code>tb_scanlog</code> into the new <code>scanlog_events</code> 
          normalized table. This operation is idempotent and ignores duplicates based on the composite key.
        </p>
        
        <button 
          onClick={handleMigrate}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50 hover:bg-blue-700"
        >
          {loading ? 'Migrating...' : 'Start Migration'}
        </button>

        {result && (
          <div className="mt-4 p-3 bg-green-50 text-green-800 rounded border border-green-200">
            {result}
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-800 rounded border border-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
