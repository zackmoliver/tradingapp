import React, { useEffect } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import BacktestPage from "@/pages/BacktestPage";
import Analyzer from "@/pages/Analyzer";
import TradeFinderPage from "@/pages/TradeFinderPage";
import Intelligence from "@/pages/Intelligence";
import { useTheme } from "@/theme/ThemeContext";
import { useAppBus } from "@/context/AppBus";
import { QAOverlay } from "@/components/QAOverlay";
import { useQAMode } from "@/hooks/useQAMode";
import "@/lib/qa"; // force registry to attach window.__qa
// make sure the registry runs and sets window.__qa
import "@/lib/qa";

function TabLink({ to, children }:{ to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-md text-sm font-medium ${
          isActive ? "bg-blue-600 text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="ml-auto px-3 py-2 rounded-md text-sm font-medium border border-slate-300 dark:border-slate-600
                 hover:bg-slate-100 dark:hover:bg-slate-700"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
    </button>
  );
}

export default function App() {
  const navigate = useNavigate();
  const { onNavigateToBacktest } = useAppBus();
  const qaMode = useQAMode();

  // Set up navigation callback for AppBus
  useEffect(() => {
    onNavigateToBacktest(() => {
      navigate('/backtest');
    });
  }, [navigate, onNavigateToBacktest]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-2">
          <div className="text-slate-900 dark:text-slate-100 font-semibold mr-4">Trading Engine</div>
          <div className="flex gap-2">
            <TabLink to="/backtest">Backtest</TabLink>
            <TabLink to="/analyzer">Analyzer</TabLink>
            <TabLink to="/trade-finder">Trade Finder</TabLink>
            <TabLink to="/intelligence">Intelligence</TabLink>
          </div>
          <ThemeToggle />
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/backtest" replace />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/analyzer" element={<Analyzer />} />
          <Route path="/trade-finder" element={<TradeFinderPage />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="*" element={<div className="text-slate-600 dark:text-slate-300">Not found</div>} />
        </Routes>
      </main>

      {/* QA Overlay */}
      <QAOverlay
        isVisible={qaMode.isVisible}
        onClose={qaMode.hide}
      />
    </div>
  );
}
