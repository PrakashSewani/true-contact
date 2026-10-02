import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { api, errorMessage, type ImportJob } from '../client';
import { EXTENSION_STORE_URL } from '../config';

export function ImportsPage() {
  const [version, setVersion] = useState(0);
  const [imports, setImports] = useState<ImportJob[] | null>(null);
  const [usage, setUsage] = useState<{ importedContacts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .imports()
      .then((data) => {
        if (!cancelled) {
          setImports(data.imports);
          setUsage(data.usage);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    const active =
      imports?.some((job) => job.status === 'pending' || job.status === 'processing') ?? false;

    if (!active) {
      return;
    }

    const timer = setInterval(() => setVersion((value) => value + 1), 2500);
    return () => clearInterval(timer);
  }, [imports]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const content = await file.text();
      await api.createImport(file.name, content);
      event.target.value = '';
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleResume(id: string) {
    setBusyId(id);
    setError(null);

    try {
      await api.resumeImport(id);
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm('Delete all contacts, imports, and history? This cannot be undone.')) {
      return;
    }

    setBusyId('delete-all');
    setError(null);
    setNotice(null);

    try {
      const result = await api.deleteAllData();
      setNotice(`Deleted ${result.deletedContacts} contacts and all import data.`);
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePairing() {
    setPairingBusy(true);
    setPairingError(null);

    try {
      const data = await api.startPairing();
      setPairing(data.pairing);
    } catch (cause) {
      setPairingError(errorMessage(cause));
    } finally {
      setPairingBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="section-header">
        <h1>Imports</h1>
        <div className="toolbar">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setVersion((value) => value + 1)}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}

      <div className="panel">
        <h2>Import a file</h2>
        <p className="muted">
          vCard (.vcf) or CSV exported from your phone, Google Contacts, or another address book.
        </p>
        <input
          type="file"
          accept=".vcf,.vcard,.csv,text/vcard,text/csv"
          disabled={busy}
          onChange={handleUpload}
        />
        {usage && <p className="muted">{usage.importedContacts} contacts imported so far.</p>}
        <p className="muted">
          Large imports process in small background batches and can take a while — progress shows
          below, and a paused import can be resumed.
        </p>
      </div>

      <div className="panel">
        <h2>Connect WhatsApp</h2>
        <p className="muted">
          Open the TrueContact browser extension on WhatsApp Web and enter this pairing code within
          10 minutes.
        </p>
        <p className="muted">
          Don&apos;t have the connector yet?{' '}
          <a href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
            Install it from the Chrome Web Store
          </a>
          .
        </p>
        {pairingError && <p className="error">{pairingError}</p>}
        {pairing ? (
          <p>
            <strong className="pairing-code">{pairing.code}</strong>{' '}
            <span className="muted">
              expires {new Date(pairing.expiresAt).toLocaleTimeString()}
            </span>
          </p>
        ) : (
          <button
            type="button"
            className="button-secondary"
            disabled={pairingBusy}
            onClick={handlePairing}
          >
            Generate pairing code
          </button>
        )}
      </div>

      {imports === null ? (
        <p className="muted">Loading…</p>
      ) : imports.length === 0 ? (
        <p className="muted">No imports yet.</p>
      ) : (
        <ul className="list">
          {imports.map((job) => {
            const stalled = isStalled(job);

            return (
              <li key={job.id} className="panel">
                <div className="list-main">
                  <strong>{job.fileName ?? 'Import'}</strong>
                  <span className="muted">
                    {new Date(job.createdAt).toLocaleString()}
                    {job.status === 'processing' && job.total > 0
                      ? ` · processing ${Math.min(job.cursor, job.total)} of ${job.total}`
                      : ''}
                    {job.stats
                      ? ` · ${job.stats.contacts ?? 0} contacts · ${job.stats.created ?? 0} new · ${
                          job.stats.linked ?? 0
                        } matched · ${job.stats.proposed ?? 0} to review · ${
                          job.stats.conflicts ?? 0
                        } conflicts · ${job.stats.skipped ?? 0} skipped`
                      : ''}
                  </span>
                </div>
                <span className={`badge badge-${stalled ? 'warn' : job.status}`}>
                  {stalled ? 'paused' : job.status}
                </span>
                {stalled && (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busyId === job.id}
                    onClick={() => void handleResume(job.id)}
                  >
                    Resume processing
                  </button>
                )}
                {job.error && <p className="error">{job.error}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="panel">
        <h2>Danger zone</h2>
        <p className="muted">
          Delete all contacts, imports, and history from your account. This cannot be undone. Your
          usage counter stays — it keeps a running total.
        </p>
        <button
          type="button"
          className="button-secondary"
          disabled={busyId === 'delete-all'}
          onClick={() => void handleDeleteAll()}
        >
          Delete all data
        </button>
      </div>
    </section>
  );
}

const STALE_AFTER_MS = 10 * 60 * 1000;

function isStalled(job: ImportJob): boolean {
  if (job.status !== 'processing') {
    return false;
  }

  const reference = job.progressAt ?? job.createdAt;

  return Date.now() - new Date(reference).getTime() > STALE_AFTER_MS;
}
