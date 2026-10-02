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

interface RowCapture {
  id: string | null;
  phone: string | null;
}

interface PageCapture {
  rows: RowCapture[];
  bulk: BulkEntry[];
  error?: string | null;
}

async function captureContacts(): Promise<CaptureResult> {
  const rows = Array.from(document.querySelectorAll(ROW_SELECTOR));
  const capture = await requestCapture();

  const phonesById = new Map<string, string>();
  const namesById = new Map<string, string>();

  for (const entry of capture?.bulk ?? []) {
    if (entry.phone) {
      phonesById.set(entry.id, entry.phone);
    }
    if (entry.name) {
      namesById.set(entry.id, entry.name);
    }
  }

  const collected = new Map<string, { name: string; phone: string | null }>();
  let firstTitle: string | null = null;
  let jidRows = 0;
  let sampleJid: string | null = null;

  for (const [index, row] of rows.entries()) {
    const rowInfo = capture?.rows[index];
    const jid = rowInfo?.id ?? null;
    const title = chatName(row);

    if (index === 0) {
      firstTitle = title;
    }
    if (!jid) {
      continue;
    }

    jidRows += 1;
    sampleJid ??= jid;

    const phoneJid = rowInfo?.phone ?? (jid.endsWith('@c.us') ? jid : (phonesById.get(jid) ?? ''));
    const phone = phoneOf(phoneJid);
    const name = title !== '' ? title : (namesById.get(jid) ?? phone ?? '');

    if (name !== '' && !collected.has(jid)) {
      collected.set(jid, { name, phone });
    }
  }

  let bulkFound = 0;

  for (const entry of capture?.bulk ?? []) {
    bulkFound += 1;
    if (collected.has(entry.id)) {
      continue;
    }

    const phone = phoneOf(entry.phone ?? '');
    const name = entry.name ?? phone;

    if (name) {
      collected.set(entry.id, { name, phone });
    }
  }

  const contacts: CaptureResult['contacts'] = [];
  let withPhone = 0;

  for (const [jid, info] of collected) {
    if (info.phone) {
      withPhone += 1;
    }

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
    withPhone,
    reactFound: capture !== null,
    captureError: capture?.error ?? null,
    firstTitle,
    sampleJid,
  };

  console.log(
    `[TrueContact] merged ${JSON.stringify({
      rowCount: rows.length,
      jidRows,
      bulkFound,
      matched: contacts.length,
      withPhone,
      sample: contacts
        .slice(0, 4)
        .map((contact) => ({ id: contact.externalId, phones: contact.phones })),
    })}`,
  );
  console.log('[TrueContact] pushed contacts', contacts);

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
    }, 20000);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as
        | {
            source?: string;
            type?: string;
            nonce?: string;
            rows?: unknown;
            bulk?: unknown;
            error?: unknown;
          }
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
        error: typeof data.error === 'string' ? data.error : null,
        rows: data.rows.map((value) => {
          if (!value || typeof value !== 'object') {
            return { id: null, phone: null };
          }
          const record = value as { id?: unknown; phone?: unknown };
          return {
            id: typeof record.id === 'string' ? record.id : null,
            phone: typeof record.phone === 'string' ? record.phone : null,
          };
        }),
        bulk: data.bulk
          .map((value) => {
            if (!value || typeof value !== 'object') {
              return null;
            }
            const record = value as { id?: unknown; name?: unknown; phone?: unknown };
            if (typeof record.id !== 'string') {
              return null;
            }
            return {
              id: record.id,
              name: typeof record.name === 'string' ? record.name : null,
              phone: typeof record.phone === 'string' ? record.phone : null,
            };
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
