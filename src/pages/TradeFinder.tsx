import React, { useState } from "react";
import { invoke } from "@/lib/tauri";
import { STRATEGY_OPTIONS, BacktestSummary, BacktestParams } from "@/types/backtest";

export default function TradeFinderPage() {
  const [symbol, setSymbol] = useState("SPY");
  const [start, setStart] = useState("01/01/2023");
  const [end, setEnd] = useState("12/31/2023");
  const [strategy, setStrategy] = useState<BacktestParams["strategy"]>("PMCC");
  const [capital, setCapital] = useState(100000);
  const [results, setResults] = useState<BacktestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findTrades() {
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      // In a real app you could loop multiple tickers here
      const res = await invoke<BacktestSummary>("run_backtest", {
        params: {
          ticker: symbol,
          strategy,
          start_date: start,
          end_date: end,
          initial_capital: capital,
          seed: 123,
        } as BacktestParams,
        delayMs: 500,
      });
      setResults([res]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Trade Finder</h1>
      <p className="text-gray-600 mb-6">
        Filter trades and run quick backtests for different tickers and strategies.
      </p>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <input
          type="text"
          className="border rounded px-2 py-1"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Symbol"
        />
        <select
          className="border rounded px-2 py-1"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as BacktestParams["strategy"])}
        >
          {STRATEGY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="border rounded px-2 py-1"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="Start MM/DD/YYYY"
        />
        <input
          type="text"
          className="border rounded px-2 py-1"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          placeholder="End MM/DD/YYYY"
        />
        <input
          type="number"
          className="border rounded px-2 py-1"
          value={capital}
          onChange={(e) => setCapital(Number(e.target.value))}
          placeholder="Capital"
        />
      </div>

      <button
        onClick={findTrades}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Finding..." : "Find Trades"}
      </button>

      {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Results</h2>
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Symbol</th>
                <th className="border px-2 py-1 text-left">Strategy</th>
                <th className="border px-2 py-1 text-right">CAGR</th>
                <th className="border px-2 py-1 text-right">Win Rate</th>
                <th className="border px-2 py-1 text-right">Trades</th>
                <th className="border px-2 py-1 text-right">Max DD</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">{r.symbol}</td>
                  <td className="border px-2 py-1">{r.strategy}</td>
                  <td className="border px-2 py-1 text-right">
                    {(r.cagr * 100).toFixed(2)}%
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {(r.win_rate * 100).toFixed(2)}%
                  </td>
                  <td className="border px-2 py-1 text-right">{r.trades}</td>
                  <td className="border px-2 py-1 text-right">
                    {(r.max_dd * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
