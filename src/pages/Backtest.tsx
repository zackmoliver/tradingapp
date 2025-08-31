// src/pages/BacktestPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@/lib/tauri';
import type { BacktestSummary } from '@/types/backtest';

type FormState = {
  ticker: string;
  start_date: string; // YYYY-MM-DD (UI) -> converted before invoke
  end_date: string;   // YYYY-MM-DD
  initial_capital: number;
  strategy: 'PMCC' | 'CoveredCall' | 'Wheel' | 'iron_condor' | 'bull_put_spread';
};

const toMMDDYYYY = (yyyyMMdd: string) => {
  const [y, m, d] = yyyyMMdd.split('-');
  return `${m}/${d}/${y}`;
};

const fromMMDDYYYY = (mmddyyyy: string) => {
  // accepts "MM/DD/YYYY" or "YYYY-MM-DD"; fallback to today
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(mmddyyyy)) {
    const [m, d, y] = mmddyyyy.split('/');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(mmddyyyy)) return mmddyyyy;
  return '2023-01-01';
};

const defaultForm: FormState = {
  ticker: 'SPY',
  start_date: '2023-01-01',
  end_date: '2023-12-31',
  initial_capital: 100_000,
  strategy: 'PMCC',
};

export default function BacktestPage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [result, setResult] = useState<BacktestSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Load preferences from Tauri
  useEffect(() => {
    (async () => {
      try {
        const prefs = await invoke<null | {
          ticker: string;
          start_date: string; // MM/DD/YYYY
          end_date: string;   // MM/DD/YYYY
          strategy: string;
          initial_capital: number;
          seed?: number;
        }>('load_preferences');

        if (prefs) {
          setForm({
            ticker: prefs.ticker ?? defaultForm.ticker,
            start_date: fromMMDDYYYY(prefs.start_date ?? '2023-01-01'),
            end_date: fromMMDDYYYY(prefs.end_date ?? '2023-12-31'),
            initial_capital: Number(prefs.initial_capital ?? 100000),
            strategy: (prefs.strategy as FormState['strategy']) ?? 'PMCC',
          });
        }
      } catch (e: any) {
        console.error('load_preferences failed', e);
        setLoadErr(e?.message ?? 'Failed to load preferences');
      }
    })();
  }, []);

  // Save preferences to Tauri
  const savePrefs = async () => {
    setSaving(true);
    try {
      await invoke('save_preferences', {
        appHandle: undefined, // Tauri v2 ignores this param
        preferences: {
          ticker: form.ticker.toUpperCase(),
          start_date: toMMDDYYYY(form.start_date),
          end_date: toMMDDYYYY(form.end_date),
          strategy: form.strategy,
          initial_capital: form.initial_capital,
          seed: 42,
        },
      });
    } catch (e) {
      console.error('save_preferences failed', e);
    } finally {
      setSaving(false);
    }
  };

  const onRun = async () => {
    setLoading(true);
    try {
      const payload = {
        ticker: form.ticker.toUpperCase(),
        start_date: toMMDDYYYY(form.start_date),
        end_date: toMMDDYYYY(form.end_date),
        strategy: form.strategy,
        initial_capital: form.initial_capital,
        seed: 42,
      };
      // small delay for realism; backend supports delayMs param name "delay_ms"
      const res = await invoke<BacktestSummary>('run_backtest', {
        params: payload,
        delayMs: 250,
      });
      setResult(res);
      await savePrefs();
    } catch (e) {
      console.error('run_backtest failed', e);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const metrics = useMemo(() => {
    if (!result) return null;
    const finalEquity = result.equity_curve.at(-1)?.equity ?? result.capital;
    const initialEquity = result.equity_curve[0]?.equity ?? result.capital;
    return {
      strategy: result.strategy,
      range: `${result.start} → ${result.end}`,
      trades: result.trades,
      winRatePct: `${(result.win_rate * 100).toFixed(2)}%`,
      cagrPct: `${(result.cagr * 100).toFixed(2)}%`,
      maxDDPct: `${(Math.abs(result.max_dd) * 100).toFixed(2)}%`,
      finalEquity,
      initialEquity,
    };
  }, [result]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Backtest</h1>
        <p className="text-slate-600 mt-1">
          Run backtests against the Tauri engine and view key metrics.
        </p>
        {loadErr && (
          <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            {loadErr}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ticker</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.ticker}
                onChange={(e) => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="e.g., SPY"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.start_date}
                onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.end_date}
                onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Initial Capital</label>
              <input
                type="number"
                min={0}
                step={100}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.initial_capital}
                onChange={(e) => setForm(f => ({ ...f, initial_capital: Number(e.target.value || 0) }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Strategy</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.strategy}
                onChange={(e) => setForm(f => ({ ...f, strategy: e.target.value as FormState['strategy'] }))}
              >
                <option value="PMCC">Poor Man&apos;s Covered Call</option>
                <option value="CoveredCall">Covered Call</option>
                <option value="Wheel">Cash-Secured Put</option>
                <option value="iron_condor">Iron Condor</option>
                <option value="bull_put_spread">Bull Put Spread</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onRun}
                disabled={loading}
                className="flex-1 rounded-md bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? 'Running…' : 'Run Backtest'}
              </button>
              <button
                onClick={savePrefs}
                disabled={saving}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          {!result ? (
            <div className="text-slate-500">No results yet. Run a backtest.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Metric label="Strategy" value={metrics?.strategy ?? '—'} />
              <Metric label="Date Range" value={metrics?.range ?? '—'} />
              <Metric label="Trades" value={String(metrics?.trades ?? '—')} />
              <Metric label="Win Rate" value={metrics?.winRatePct ?? '—'} />
              <Metric label="CAGR" value={metrics?.cagrPct ?? '—'} />
              <Metric label="Max Drawdown" value={metrics?.maxDDPct ?? '—'} />
              <Metric label="Initial Equity" value={metrics ? `$${metrics.initialEquity.toLocaleString()}` : '—'} />
              <Metric label="Final Equity" value={metrics ? `$${metrics.finalEquity.toLocaleString()}` : '—'} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
