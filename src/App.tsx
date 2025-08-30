import { NavLink, Routes, Route } from "react-router-dom";
import "./App.css";

import Backtest from "./pages/Backtest";
import Analyzer from "./pages/Analyzer";
import { TradeFinderPage } from "./pages/TradeFinderPage";
import { Settings } from "./pages/Settings";
import HealthStatusBadge from "./components/HealthStatusBadge";

export default function App() {
  return (
    <div className="app min-h-screen bg-neutral-50">
      {/* Top bar / tabs */}
      <header className="app-header bg-white shadow-sm border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">TE</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-900">Trading Engine</h1>
                <p className="text-xs text-neutral-500">Professional Options Analytics</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Tabs */}
              <nav className="flex gap-2">
                <Tab to="/backtest" label="Backtest" />
                <Tab to="/analyzer" label="Analyzer" />
                <Tab to="/trade-finder" label="Trade Finder" />
                <Tab to="/settings" label="Settings" />
              </nav>

              {/* Health Status Badge */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">Backend:</span>
                <HealthStatusBadge size="md" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Routed views */}
      <main className="app-main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Routes>
            <Route path="/" element={<Backtest />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/analyzer" element={<Analyzer />} />
            <Route path="/trade-finder" element={<TradeFinderPage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer bg-white border-t border-neutral-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-sm text-neutral-500">
          Trading Engine v1.0.0 — Tauri v2 + React 18 + TypeScript
        </div>
      </footer>
    </div>
  );
}

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1 rounded-md text-sm ${
          isActive ? "bg-primary-600 text-white" : "hover:bg-neutral-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
}