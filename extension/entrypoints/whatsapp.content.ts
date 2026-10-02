import type { CaptureDiagnostics, CaptureResult } from '../lib/messages';

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if ((message as { type?: string } | undefined)?.type === 'capture') {
        void captureContacts().then(sendResponse);
        return true;
      }

      return false;
    });
  },
});

const ROW_SELECTOR = '[role="listitem"]';

async function captureContacts(): Promise<CaptureResult> {
  const contacts: CaptureResult['contacts'] = [];
  const seen = new Set<string>();

  const rows = Array.from(document.querySelectorAll(ROW_SELECTOR));
  const jids = await requestJids();

  let firstTitle: string | null = null;
  let jidRows = 0;
  let sampleJid: string | null = null;

  for (const [index, row] of rows.entries()) {
    const name = chatName(row);
    const jid = jids?.[index] ?? null;

    if (index === 0) {
      firstTitle = name;
    }

    if (jid) {
      jidRows += 1;
      sampleJid ??= jid;
    }

    if (!jid?.endsWith('@c.us') || name === '' || seen.has(jid)) {
      continue;
    }
    seen.add(jid);

    const digits = jid.replace('@c.us', '');
    const phone = /^\d{7,15}$/.test(digits) ? `+${digits}` : null;

    contacts.push({
      externalId: jid,
      displayName: name,
      phones: phone ? [{ value: phone }] : [],
      emails: [],
      observedAt: new Date().toISOString(),
    });
  }

  const diagnostics: CaptureDiagnostics = {
    url: location.href,
    strategy: rows.length > 0 ? ROW_SELECTOR : null,
    rowCount: rows.length,
    jidRows,
    matchedCount: contacts.length,
    reactFound: jids !== null,
    firstTitle,
    sampleJid,
  };

  return { contacts, diagnostics };
}

async function requestJids(): Promise<(string | null)[] | null> {
  return new Promise((resolve) => {
    const nonce = crypto.randomUUID();

    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 1500);

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as
        | { source?: string; type?: string; nonce?: string; jids?: unknown }
        | undefined;

      if (
        data?.source !== 'truecontact-connector-page' ||
        data.nonce !== nonce ||
        !Array.isArray(data.jids)
      ) {
        return;
      }

      cleanup();
      resolve(data.jids.map((value) => (typeof value === 'string' ? value : null)));
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
