import type { BulkEntry, CaptureDiagnostics, CaptureResult, PongResult } from '../lib/messages';

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = (message as { type?: string } | undefined)?.type;

      if (type === 'capture') {
        void captureContacts().then(sendResponse);
        return true;
      }

      if (type === 'ping') {
        sendResponse({ ok: true } satisfies PongResult);
        return true;
      }

      return false;
    });
  },
});

const ROW_SELECTOR = '[role="listitem"]';

interface PageCapture {
  rows: (string | null)[];
  bulk: BulkEntry[];
}

async function captureContacts(): Promise<CaptureResult> {
  const rows = Array.from(document.querySelectorAll(ROW_SELECTOR));
  const capture = await requestCapture();

  const collected = new Map<string, { name: string; phone: string | null }>();
  let firstTitle: string | null = null;
  let jidRows = 0;
  let sampleJid: string | null = null;

  for (const [index, row] of rows.entries()) {
    const jid = capture?.rows[index] ?? null;
    const title = chatName(row);

    if (index === 0) {
      firstTitle = title;
    }
    if (!jid) {
      continue;
    }

    jidRows += 1;
    sampleJid ??= jid;

    const name = title !== '' ? title : (phoneOf(jid) ?? '');
    if (name !== '' && !collected.has(jid)) {
      collected.set(jid, { name, phone: phoneOf(jid) });
    }
  }

  let bulkFound = 0;

  for (const entry of capture?.bulk ?? []) {
    bulkFound += 1;
    if (collected.has(entry.id)) {
      continue;
    }

    const name = entry.name ?? phoneOf(entry.id);
    if (name) {
      collected.set(entry.id, { name, phone: phoneOf(entry.id) });
    }
  }

  const contacts: CaptureResult['contacts'] = [];

  for (const [jid, info] of collected) {
    contacts.push({
      externalId: jid,
      displayName: info.name,
      phones: info.phone ? [{ value: info.phone }] : [],
      emails: [],
      observedAt: new Date().toISOString(),
    });
  }

  const diagnostics: CaptureDiagnostics = {
    url: location.href,
    strategy: rows.length > 0 ? ROW_SELECTOR : null,
    rowCount: rows.length,
    jidRows,
    bulkFound,
    matchedCount: contacts.length,
    reactFound: capture !== null,
    firstTitle,
    sampleJid,
  };

  return { contacts, diagnostics };
}

function phoneOf(jid: string): string | null {
  if (!jid.endsWith('@c.us')) {
    return null;
  }

  const digits = jid.replace('@c.us', '');

  return /^\d{7,15}$/.test(digits) ? `+${digits}` : null;
}

async function requestCapture(): Promise<PageCapture | null> {
  return new Promise((resolve) => {
    const nonce = crypto.randomUUID();

    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 2000);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as
        | { source?: string; type?: string; nonce?: string; rows?: unknown; bulk?: unknown }
        | undefined;

      if (
        data?.source !== 'truecontact-connector-page' ||
        data.nonce !== nonce ||
        !Array.isArray(data.rows) ||
        !Array.isArray(data.bulk)
      ) {
        return;
      }

      cleanup();
      resolve({
        rows: data.rows.map((value) => (typeof value === 'string' ? value : null)),
        bulk: data.bulk
          .map((value) => {
            if (!value || typeof value !== 'object') {
              return null;
            }
            const record = value as { id?: unknown; name?: unknown };
            if (typeof record.id !== 'string') {
              return null;
            }
            return { id: record.id, name: typeof record.name === 'string' ? record.name : null };
          })
          .filter((value): value is BulkEntry => value !== null),
      });
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
    };

    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'truecontact-connector', type: 'capture', nonce }, '*');
  });
}

function chatName(row: Element): string {
  const titled = row.querySelector('span[title]');

  return titled?.getAttribute('title')?.trim() ?? '';
}
