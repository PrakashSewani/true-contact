import type {
  CaptureDiagnostics,
  CaptureResult,
  PairResult,
  PopupMessage,
  ScanResult,
  StatusResult,
} from '../lib/messages';

interface StoredSession {
  token: string;
  expiresAt: string;
  extensionId: string;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = message as PopupMessage;

    if (request.type === 'status') {
      void getStatus().then(sendResponse);
      return true;
    }
    if (request.type === 'pair') {
      void pair(request.apiBase, request.code).then(sendResponse);
      return true;
    }
    if (request.type === 'scan') {
      void scan(request.apiBase).then(sendResponse);
      return true;
    }

    return false;
  });
});

async function getStatus(): Promise<StatusResult> {
  const { session } = (await browser.storage.local.get('session')) as { session?: StoredSession };

  if (!session) {
    return { paired: false };
  }

  return { paired: true, extensionId: session.extensionId, expiresAt: session.expiresAt };
}

async function pair(apiBase: string, code: string): Promise<PairResult> {
  try {
    const response = await fetch(`${trimBase(apiBase)}/api/pairing/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), extensionId: browser.runtime.id }),
    });

    if (!response.ok) {
      return { ok: false, error: await errorText(response) };
    }

    const session = (await response.json()) as { token: string; expiresAt: string };
    await browser.storage.local.set({
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
        extensionId: browser.runtime.id,
      },
    });

    return { ok: true, extensionId: browser.runtime.id };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

const BATCH_SIZE = 500;

async function scan(apiBase: string): Promise<ScanResult> {
  const { session } = (await browser.storage.local.get('session')) as { session?: StoredSession };

  if (!session) {
    return { ok: false, error: 'Pair with TrueContact first.' };
  }

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  let capture: CaptureResult | undefined;

  if (tab?.id !== undefined) {
    try {
      capture = (await browser.tabs.sendMessage(tab.id, { type: 'capture' })) as
        | CaptureResult
        | undefined;
    } catch {
      capture = undefined;
    }
  }

  const contacts = capture?.contacts ?? [];

  if (contacts.length === 0) {
    return { ok: false, error: emptyReason(capture?.diagnostics) };
  }

  let pushed = 0;

  try {
    for (let index = 0; index < contacts.length; index += BATCH_SIZE) {
      const batch = contacts.slice(index, index + BATCH_SIZE);
      const response = await fetch(`${trimBase(apiBase)}/api/imports/extension`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ source: 'whatsapp', contacts: batch }),
      });

      if (!response.ok) {
        const reason = await errorText(response);
        const suffix = `Pushed ${pushed} of ${contacts.length} contacts — ${reason}`;
        return pushed > 0 ? { ok: false, error: suffix } : { ok: false, error: reason };
      }

      pushed += batch.length;
    }

    return { ok: true, pushed, withPhone: capture?.diagnostics?.withPhone };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function trimBase(apiBase: string): string {
  return apiBase.trim().replace(/\/+$/, '');
}

function emptyReason(diagnostics?: CaptureDiagnostics): string {
  if (!diagnostics) {
    return 'Could not read the WhatsApp tab — reload the page (F5) and try again.';
  }

  if (diagnostics.captureError) {
    return `WhatsApp capture failed: ${diagnostics.captureError}`;
  }

  if (!diagnostics.strategy || diagnostics.rowCount === 0) {
    return 'No chat rows found — open the main chat list (not the New chat panel) and try again.';
  }

  const sample = diagnostics.sampleJid ? `, e.g. ${diagnostics.sampleJid}` : '';

  return `Found ${diagnostics.rowCount} rows but no importable contacts — row IDs: ${diagnostics.jidRows}, list IDs: ${diagnostics.bulkFound}${sample}, page state readable: ${diagnostics.reactFound ? 'yes' : 'no'}, first title: ${diagnostics.firstTitle ?? 'none'}.`;
}

async function errorText(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${response.status})`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
