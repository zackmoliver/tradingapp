import React, { useState } from 'react';
import { invoke } from '@/lib/tauri';

export default function AdaptiveTester() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Call the Tauri command added by Augment
      const res = await invoke<any>('adaptive_run', { mode: 'test' });
      setResult(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-900">Adaptive Intelligence</h3>
        <button
          onClick={runTest}
          disabled={loading}
          className="rounded-md bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Test Adaptive'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      )}

      {result && (
        <pre className="mt-3 text-sm bg-slate-50 border border-slate-200 rounded p-3 overflow-auto max-h-64">
{JSON.stringify(result, null, 2)}
        </pre>
      )}

      {!error && !result && !loading && (
        <p className="text-sm text-slate-600">Click “Test Adaptive” to run a self-check.</p>
      )}
    </div>
  );
}
