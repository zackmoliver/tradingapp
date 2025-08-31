// at top
import React, { useState } from "react";
// ...

interface QAOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

export const QAOverlay: React.FC<QAOverlayProps> = ({ isVisible, onClose }) => {
  const [open, setOpen] = useState(isVisible);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [copied, setCopied] = useState<"idle"|"ok"|"err">("idle");

  function getCurrentReport() {
    // prefer local state, fall back to registry
    const qaRegistry = (window as any).__qa;
    const last = report ?? qaRegistry?.getReport?.();
    return last ?? {
      ts: Date.now(),
      summary: {
        totalSuites: 0,
        passedSuites: 0,
        failedSuites: 0,
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0
      },
      suites: []
    };
  }

  async function handleRunAll() {
    setRunning(true);
    try {
      const qaRegistry = (window as any).__qa;
      if (qaRegistry?.runAll) {
        const res = await qaRegistry.runAll();
        setReport(res);
        console.log("[QA] report", res);
      } else {
        console.warn("[QA] No QA registry found");
      }
    } catch (error) {
      console.error("[QA] Error running tests:", error);
    } finally {
      setRunning(false);
    }
  }

async function handleCopy() {
  const data = (window as any).__qa?.getReport?.();
  if (!data) return;
  await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  setCopied("ok");
  setTimeout(()=>setCopied("idle"), 1200);
}

function handleDownload() {
  const qaRegistry = (window as any).__qa;
  if (qaRegistry?.download) {
    qaRegistry.download();
  } else {
    // Fallback if download method not available
    const data = qaRegistry?.getReport?.();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    a.href = URL.createObjectURL(blob);
    a.download = `qa-report-${ts}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

  // ...return (
  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {/* collapsed fab */}
      {!open && (
        <button onClick={() => setOpen(true)} className="rounded-full px-4 py-2 bg-slate-800 text-white shadow-lg">
          QA
        </button>
      )}

      {open && (
        <div className="w-[360px] max-h-[70vh] rounded-xl border border-slate-300 bg-white shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-3 border-b border-slate-200 flex items-center gap-2">
            <div className="font-semibold text-slate-800">QA Mode</div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleRunAll} disabled={running} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50">
                {running ? "Running…" : "Run All"}
              </button>

              <button onClick={handleCopy} className="px-3 py-1.5 text-sm rounded border border-slate-300 relative">
                Copy JSON
                {copied === "ok" && <span className="ml-2 text-green-600">✓</span>}
                {copied === "err" && <span className="ml-2 text-red-600">✕</span>}
              </button>

              <button onClick={handleDownload} className="px-3 py-1.5 text-sm rounded border border-slate-300">
                Download
              </button>

              <button onClick={() => setOpen(false)} className="px-2 py-1 text-slate-500 hover:text-slate-700" title="Close">
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-3 overflow-auto text-sm">
            {/* tiny summary preview so you know it exists */}
            {getCurrentReport()?.summary && (
              <div className="mb-2 text-slate-600">
                Suites: {getCurrentReport().summary.passedSuites || 0} passed, {getCurrentReport().summary.failedSuites || 0} failed
                <br />
                Checks: {getCurrentReport().summary.passedChecks || 0} passed, {getCurrentReport().summary.failedChecks || 0} failed
              </div>
            )}
            {/* ...your suites rendering... */}
          </div>
        </div>
      )}
    </div>
  );
};
