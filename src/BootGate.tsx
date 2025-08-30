import { useEffect, useState } from 'react';
import { invoke } from './lib/tauri';

type State = 'loading' | 'up' | 'down';

export default function BootGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    const t = setTimeout(() => {
      setState('down');
      setErr('Timeout: backend did not respond within 5s.');
    }, 5000);

    (async () => {
      try {
        const res = await invoke<any>('ping');
        console.log('Ping response:', res, typeof res);
        clearTimeout(t);

        // Handle both string and object responses
        const responseText = typeof res === 'string' ? res : JSON.stringify(res);
        const isSuccess = responseText.includes('pong') || responseText.includes('ok');

        setState(isSuccess ? 'up' : 'down');
        if (!isSuccess) setErr(`Unexpected ping result: ${responseText}`);
      } catch (e: any) {
        clearTimeout(t);
        setState('down');
        setErr(e?.message ?? String(e));
        console.error('[BootGate] invoke("ping") failed:', e);
      }
    })();

    return () => clearTimeout(t);
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting to backend...</p>
        </div>
      </div>
    );
  }

  if (state === 'down') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Backend Unavailable</h1>
          <p className="text-gray-600 mb-4">Unable to connect to the trading engine backend.</p>
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