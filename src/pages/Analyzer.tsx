import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadPreferencesSafe, savePreferencesSafe } from "@/lib/prefs";
import type { BacktestParams, BacktestSummary } from "@/types/backtest";

/* ---------- tiny UI atoms ---------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-neutral-800 mb-3">{title}</h3>
      <div className="bg-white border border-neutral-200 rounded-lg p-4">{children}</div>
    </div>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void; }) {
  return (
    <label className="flex items-center gap-2 mb-2 cursor-pointer">
      <input type="checkbox" className="h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-neutral-800">{label}</span>
    </label>
  );
}
function Slider({ label, value, min, max, step = 1, onChange }:{
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-neutral-600 mb-1">
        <span>{label}</span><span>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}
function Metric({ label, value }:{label:string; value:string}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg px-4 py-3">
      <div className="text-xs text-neutral-600">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
function formatPct(n:number){ return `${(n*100).toFixed(2)}%`; }
function formatDrawdown(n:number){ return `${Math.abs(n*100).toFixed(2)}%`; }

/* ---------- inline chart (SVG) ---------- */
function EquityMiniChart({ a, b }:{ a?: BacktestSummary|null; b?: BacktestSummary|null }) {
  const w=420, h=120, pad=10;
  const poly = (eq?:BacktestSummary|null, color="#2563eb")=>{
    if(!eq || !eq.equity_curve?.length) return null;
    const vals = eq.equity_curve.map(p=>p.equity);
    const minV = Math.min(...vals), maxV = Math.max(...vals), range = Math.max(1, maxV-minV);
    const pts = eq.equity_curve.map((p,i)=>{
      const x = pad + (i/Math.max(1, eq.equity_curve.length-1))*(w-pad*2);
      const y = pad + (1 - (p.equity-minV)/range)*(h-pad*2);
      return `${x},${y}`;
    }).join(" ");
    return <polyline fill="none" stroke={color} strokeWidth="2" points={pts} />;
  };
  return <svg width={w} height={h} className="border border-neutral-200 rounded">{poly(a,"#2563eb")}{poly(b,"#16a34a")}</svg>;
}

/* ---------- Analyzer state ---------- */
type IndicatorId = "RSI"|"MACD"|"ADX"|"BBANDS"|"VWAP"|"SMA50"|"SMA200"|"ICHIMOKU";
type ProfileId = "Momentum"|"MeanReversion"|"Trend"|"VolatilitySell";
type ParamState = { rsiLength:number; macdFast:number; macdSlow:number; macdSignal:number; adxLength:number; bbLength:number; bbStd:number; };
type AnalyzerState = { enabled: Record<IndicatorId, boolean>; params: ParamState; profile: ProfileId | null; };

const DEFAULT_PARAMS: ParamState = { rsiLength:14, macdFast:12, macdSlow:26, macdSignal:9, adxLength:14, bbLength:20, bbStd:2 };
const PROFILES: Record<ProfileId, { enabled: Partial<Record<IndicatorId,boolean>>; params: Partial<ParamState> }> = {
  Momentum: { enabled:{RSI:true,MACD:true,SMA50:true,SMA200:true}, params:{ rsiLength:14, macdFast:12, macdSlow:26, macdSignal:9 } },
  MeanReversion: { enabled:{RSI:true,BBANDS:true,VWAP:true}, params:{ rsiLength:30, bbLength:20, bbStd:2 } },
  Trend: { enabled:{ADX:true,SMA50:true,SMA200:true,ICHIMOKU:true}, params:{ adxLength:14 } },
  VolatilitySell: { enabled:{BBANDS:true,ADX:true}, params:{ bbLength:18, bbStd:2, adxLength:10 } },
};

/* ---------- Page ---------- */
export default function Analyzer(){
  // A/B sets
  const [activeTab, setActiveTab] = useState<"A"|"B">("A");
  const [A, setA] = useState<AnalyzerState>({ enabled:{RSI:true,MACD:true,ADX:false,BBANDS:false,VWAP:false,SMA50:true,SMA200:true,ICHIMOKU:false}, params:{...DEFAULT_PARAMS}, profile:"Momentum" });
  const [B, setB] = useState<AnalyzerState>({ enabled:{RSI:true,MACD:false,ADX:true,BBANDS:true,VWAP:true,SMA50:false,SMA200:true,ICHIMOKU:true}, params:{...DEFAULT_PARAMS, rsiLength:30, bbLength:18, adxLength:10}, profile:"MeanReversion" });

  // global inputs
  const [ticker, setTicker] = useState("SPY");
  const [strategy, setStrategy] = useState<BacktestParams["strategy"]>("PMCC");
  const [start, setStart] = useState("01/01/2023");
  const [end, setEnd] = useState("12/31/2023");
  const [capital, setCapital] = useState(100000);

  // results
  const [resA, setResA] = useState<BacktestSummary|null>(null);
  const [resB, setResB] = useState<BacktestSummary|null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  // load prefs once
  const loadedOnce = useRef(false);
  useEffect(()=>{(async()=>{
    if(loadedOnce.current) return; loadedOnce.current = true;
    const prefs = await loadPreferencesSafe();
    if(prefs.ticker) setTicker(prefs.ticker);
    if(prefs.strategy) setStrategy(prefs.strategy as BacktestParams["strategy"]);
    if(prefs.start_date) setStart(prefs.start_date);
    if(prefs.end_date) setEnd(prefs.end_date);
    if(typeof prefs.initial_capital==="number") setCapital(prefs.initial_capital);
    if(prefs.analyzer?.profile && PROFILES[prefs.analyzer.profile as ProfileId]){
      const p = prefs.analyzer.profile as ProfileId;
      const preset = PROFILES[p];
      setA((s)=>({ enabled:{...s.enabled, ...preset.enabled} as any, params:{...s.params, ...preset.params}, profile:p }));
    }
  })()},[]);

  const indicators = useMemo<IndicatorId[]>(()=>["RSI","MACD","ADX","BBANDS","VWAP","SMA50","SMA200","ICHIMOKU"],[]);
  const state = activeTab==="A"?A:B;
  const setState = activeTab==="A"?setA:setB;

  function applyProfile(p:ProfileId){
    const preset = PROFILES[p];
    setState((s)=>({ enabled:{...s.enabled, ...preset.enabled} as any, params:{...s.params, ...preset.params}, profile:p }));
  }

  async function runAB(){
    setRunning(true); setErr(null); setResA(null); setResB(null);

    await savePreferencesSafe({
      ticker, strategy, start_date:start, end_date:end, initial_capital:capital,
      analyzer: { profile: A.profile ?? null, enabledIndicators: indicators.filter(k=>A.enabled[k]), params: A.params }
    });

    const base: Omit<BacktestParams,"seed"> = { ticker, strategy, start_date:start, end_date:end, initial_capital:capital } as BacktestParams;

    try{
      const [a,b] = await Promise.all([
        invoke<BacktestSummary>("run_backtest", { params:{...base, seed:101}, delayMs: 400 } as any),
        invoke<BacktestSummary>("run_backtest", { params:{...base, seed:202}, delayMs: 400 } as any),
      ]);
      setResA(a); setResB(b);
    }catch(e:any){
      setErr(e?.message ?? String(e));
    }finally{
      setRunning(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analyzer / Indicator Lab</h1>
        <p className="text-gray-600 mt-1">Toggle indicators, tune params, and compare A vs B on demand.</p>
      </div>

      {/* Inputs */}
      <Section title="Inputs">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input className="border rounded px-2 py-1" value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="Ticker (e.g., SPY)" />
          <select className="border rounded px-2 py-1" value={strategy} onChange={e=>setStrategy(e.target.value as any)}>
            <option value="PMCC">PMCC</option>
            <option value="bull_put_spread">Bull Put</option>
            <option value="iron_condor">Iron Condor</option>
            <option value="CoveredCall">Covered Call</option>
            <option value="Wheel">Wheel (CSP)</option>
          </select>
          <input className="border rounded px-2 py-1" value={start} onChange={e=>setStart(e.target.value)} placeholder="MM/DD/YYYY" />
          <input className="border rounded px-2 py-1" value={end} onChange={e=>setEnd(e.target.value)} placeholder="MM/DD/YYYY" />
          <input className="border rounded px-2 py-1" type="number" value={capital} onChange={e=>setCapital(Number(e.target.value))} placeholder="Initial Capital" />
        </div>
      </Section>

      {/* Analyzer controls */}
      <Section title="Indicators & Parameters">
        <div className="flex items-center gap-3 mb-3">
          <button className={`px-3 py-1 rounded border ${activeTab==="A"?"bg-blue-600 text-white border-blue-600":"bg-white"}`} onClick={()=>setActiveTab("A")}>Profile A</button>
          <button className={`px-3 py-1 rounded border ${activeTab==="B"?"bg-green-600 text-white border-green-600":"bg-white"}`} onClick={()=>setActiveTab("B")}>Profile B</button>
          <select className="ml-auto border rounded px-2 py-1" value={state.profile ?? ""} onChange={(e)=> e.target.value ? applyProfile(e.target.value as ProfileId) : setState(s=>({...s, profile:null}))}>
            <option value="">— Apply preset —</option>
            {Object.keys(PROFILES).map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* toggles */}
          <div>
            <div className="font-medium text-sm mb-2">Enabled indicators</div>
            {indicators.map(k=>(
              <Toggle key={k} label={k} checked={!!state.enabled[k]} onChange={(v)=>setState(s=>({...s, enabled:{...s.enabled, [k]:v}}))}/>
            ))}
          </div>
          {/* sliders */}
          <div>
            <div className="font-medium text-sm mb-2">Parameters</div>
            <Slider label={`RSI length`} value={state.params.rsiLength} min={2} max={50} onChange={(v)=>setState(s=>({...s, params:{...s.params, rsiLength:v}}))} />
            <Slider label={`MACD fast`} value={state.params.macdFast} min={2} max={30} onChange={(v)=>setState(s=>({...s, params:{...s.params, macdFast:v}}))} />
            <Slider label={`MACD slow`} value={state.params.macdSlow} min={5} max={50} onChange={(v)=>setState(s=>({...s, params:{...s.params, macdSlow:v}}))} />
            <Slider label={`MACD signal`} value={state.params.macdSignal} min={2} max={20} onChange={(v)=>setState(s=>({...s, params:{...s.params, macdSignal:v}}))} />
            <Slider label={`ADX length`} value={state.params.adxLength} min={2} max={50} onChange={(v)=>setState(s=>({...s, params:{...s.params, adxLength:v}}))} />
            <Slider label={`BB length`} value={state.params.bbLength} min={5} max={50} onChange={(v)=>setState(s=>({...s, params:{...s.params, bbLength:v}}))} />
            <Slider label={`BB std`} value={state.params.bbStd} min={1} max={4} step={0.5} onChange={(v)=>setState(s=>({...s, params:{...s.params, bbStd:v}}))} />
          </div>
        </div>

        <div className="mt-3 flex gap-3">
          <button disabled={running} onClick={runAB} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60">
            {running ? "Running…" : "Run A/B"}
          </button>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      </Section>

      {/* Results */}
      <Section title="Results">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="mb-3 font-medium">Profile A {A.profile ? `(${A.profile})` : ""}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <Metric label="CAGR" value={resA?formatPct(resA.cagr):"—"} />
              <Metric label="Win Rate" value={resA?formatPct(resA.win_rate):"—"} />
              <Metric label="Max DD" value={resA?formatDrawdown(resA.max_dd):"—"} />
              <Metric label="Trades" value={resA?String(resA.trades):"—"} />
            </div>
          </div>
          <div>
            <div className="mb-3 font-medium">Profile B {B.profile ? `(${B.profile})` : ""}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <Metric label="CAGR" value={resB?formatPct(resB.cagr):"—"} />
              <Metric label="Win Rate" value={resB?formatPct(resB.win_rate):"—"} />
              <Metric label="Max DD" value={resB?formatDrawdown(resB.max_dd):"—"} />
              <Metric label="Trades" value={resB?String(resB.trades):"—"} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <EquityMiniChart a={resA} b={resB} />
        </div>
      </Section>
    </div>
  );
}
