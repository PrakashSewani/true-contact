import { BRAND } from '@truecontact/shared';
import { useEffect, useState } from 'react';
import type { PairResult, ScanResult, StatusResult } from '../../lib/messages';

export function App() {
  const [apiBase, setApiBase] = useState('http://localhost:8787');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = (await browser.storage.local.get('apiBase')) as { apiBase?: string };
      if (stored.apiBase) {
        setApiBase(stored.apiBase);
      }

      const result = (await browser.runtime.sendMessage({ type: 'status' })) as StatusResult;
      setStatus(result);
    })();
  }, []);

  async function handlePair() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = (await browser.runtime.sendMessage({
      type: 'pair',
      apiBase,
      code,
    })) as PairResult;

    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? 'Pairing failed.');
      return;
    }

    await browser.storage.local.set({ apiBase });
    setCode('');
    setStatus({ paired: true, extensionId: result.extensionId });
    setMessage('Paired. Open WhatsApp Web and load your chat list.');
  }

  async function handleScan() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = (await browser.runtime.sendMessage({ type: 'scan', apiBase })) as ScanResult;

    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? 'Scan failed.');
      return;
    }

    setMessage(`Pushed ${result.pushed ?? 0} contacts to TrueContact.`);
  }

  return (
    <main>
      <h1>{BRAND.name}</h1>
      <p className="muted">
        Import contacts from WhatsApp Web. This connector never asks for your WhatsApp credentials.
      </p>

      <label>
        TrueContact URL
        <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
      </label>

      <label>
        Pairing code
        <input
          value={code}
          maxLength={8}
          placeholder="XXXXXXXX"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </label>

      <button type="button" disabled={busy || code.trim().length < 8} onClick={handlePair}>
        Pair with TrueContact
      </button>

      <button type="button" disabled={busy || !status?.paired} onClick={handleScan}>
        Scan WhatsApp contacts
      </button>

      <p className="muted">
        {status?.paired
          ? `Paired${status.extensionId ? ` (${status.extensionId})` : ''}`
          : 'Not paired yet — generate a code on the TrueContact Imports page.'}
      </p>

      {message && <p className="ok">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </main>
  );
}
