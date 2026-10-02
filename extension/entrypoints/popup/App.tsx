import { BRAND } from '@truecontact/shared';
import { useEffect, useState } from 'react';
import type { PairResult, ScanResult, StatusResult } from '../../lib/messages';

const DEFAULT_API_BASE = 'https://app.truecontact.prakashsewani.com';

export function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [onWhatsApp, setOnWhatsApp] = useState<boolean | null>(null);
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

      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      let reachable = false;

      if (tab?.id !== undefined) {
        try {
          await browser.tabs.sendMessage(tab.id, { type: 'ping' });
          reachable = true;
        } catch {
          reachable = false;
        }
      }

      setOnWhatsApp(reachable);
    })();
  }, []);

  const paired = status?.paired ?? false;

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

  async function handleDisconnect() {
    await browser.storage.local.remove('session');
    setStatus({ paired: false });
    setMessage('Disconnected. Pair again with a new code.');
    setError(null);
  }

  return (
    <main>
      <h1>{BRAND.name}</h1>
      <p className="muted">
        Import contacts from WhatsApp Web. This connector never asks for your WhatsApp credentials.
      </p>

      {onWhatsApp === false && (
        <p className="notice">
          Open <strong>web.whatsapp.com</strong> with your chat list visible, then scan. If you just
          installed or updated the extension, reload the WhatsApp tab first.
        </p>
      )}

      <label>
        TrueContact URL
        <input
          value={apiBase}
          disabled={paired}
          onChange={(event) => setApiBase(event.target.value)}
        />
      </label>

      {paired ? (
        <>
          <p className="muted">Paired{status?.extensionId ? ` (${status.extensionId})` : ''}.</p>
          <button type="button" disabled={busy} onClick={handleDisconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <>
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
          <p className="muted">Generate a code on the TrueContact Imports page.</p>
        </>
      )}

      <button type="button" disabled={busy || !paired || onWhatsApp === false} onClick={handleScan}>
        Scan WhatsApp contacts
      </button>

      {message && <p className="ok">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </main>
  );
}
