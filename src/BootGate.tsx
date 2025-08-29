import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core'; // v2 import

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
        const res = await invoke<string>('ping');
        clearTimeout(t);
        setState(res === 'ok' ? 'up' : 'down');
        if (res !== 'ok') setErr(`Unexpected ping result: ${String(res)}`);
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
      <div style={{display:'grid',placeItems:'center',height:'100vh',fontFamily:'system-ui'}}>
        <div>Starting backend…</div>
      </div>
    );
  }
  if (state === 'down') {
    return (
      <div style={{padding:20,fontFamily:'system-ui'}}>
        <h2>Backend not reachable</h2>
        <pre style={{whiteSpace:'pre-wrap',color:'#b00'}}>{err}</pre>
        <ol>
          <li>Confirm import: <code>import &#123; invoke &#125; from '@tauri-apps/api/core'</code></li>
          <li>Make sure <code>ping</code> is registered in <code>main.rs</code> (see below).</li>
          <li>Ctrl+Shift+I in the Tauri window → check Console for the exact error.</li>
        </ol>
      </div>
    );
  }
  return <>{children}</>;
}
