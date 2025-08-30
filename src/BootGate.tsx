import { useEffect, useState } from "react";

type State = "loading" | "up" | "down" | "desktop-only" | "error";

function isTauri(): boolean {
  const w = window as any;
  return (
    typeof window !== "undefined" &&
    (!!w.__TAURI__ || !!w.__TAURI_INTERNALS__ || navigator.userAgent.includes("Tauri"))
  );
}

const DEV_BYPASS =
  import.meta.env.MODE === "development" &&
  String(import.meta.env.VITE_ALLOW_WEB ?? "") === "1";

export default function BootGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    // Allow pure web preview if explicitly enabled
    if (!isTauri() && DEV_BYPASS) {
      console.warn("[BootGate] Dev bypass enabled (web-only mode).");
      setState("up");
      return;
    }

    // Desktop required beyond this point
    if (!isTauri()) {
      setState("desktop-only");
      setErr("Tauri desktop environment not detected. Please run: npm run tauri:dev");
      return;
    }

    const timeout = setTimeout(() => {
      setState("down");
      setErr("Timeout: backend did not respond within 12s.");
    }, 12_000);

    (async () => {
      try {
        // Tauri v2 import
        const { invoke } = await import("@tauri-apps/api/core");
        const res = await invoke<any>("ping"); // must exist on the Rust side
        clearTimeout(timeout);

        const txt = typeof res === "string" ? res : JSON.stringify(res);
        const ok = txt.toLowerCase().includes("pong") || txt.toLowerCase().includes("ok");
        setState(ok ? "up" : "down");
        if (!ok) setErr(`Unexpected ping result: ${txt}`);
      } catch (e: any) {
        clearTimeout(timeout);
        const msg = e?.message ?? String(e);
        // Common: "unknown api command ping" if not registered yet
        if (msg.toLowerCase().includes("unknown") && msg.toLowerCase().includes("ping")) {
          setState("down");
          setErr('Ping command is not registered in Tauri. Add #[tauri::command] fn ping() and register it.');
        } else {
          setState("error");
          setErr(msg);
        }
        console.error("[BootGate] invoke('ping') failed:", e);
      }
    })();

    return () => clearTimeout(timeout);
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting to backend...</p>
        </div>
      </div>
    );
  }

  if (state === "desktop-only") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-yellow-500 text-6xl mb-4">💻</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Desktop App Required</h1>
          <p className="text-gray-600 mb-4">{err}</p>
          <p className="text-sm text-gray-500">
            Please run this application using the desktop version for full functionality.
          </p>
        </div>
      </div>
    );
  }

  if (state === "down" || state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {state === "down" ? "Backend Unavailable" : "Connection Error"}
          </h1>
          <p className="text-gray-600 mb-4">
            {state === "down"
              ? "Unable to connect to the trading engine backend."
              : "An error occurred while connecting to the backend."}
          </p>
          <p className="text-sm text-gray-500">{err}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
