import type { CaptureDiagnostics, CaptureResult } from '../lib/messages';

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if ((message as { type?: string } | undefined)?.type === 'capture') {
        sendResponse(captureContacts());
        return true;
      }

      return false;
    });
  },
});

const ROW_STRATEGIES = ['#pane-side [role="listitem"]', '[role="listitem"]'];

function captureContacts(): CaptureResult {
  const contacts: CaptureResult['contacts'] = [];
  const seen = new Set<string>();

  let strategy: string | null = null;
  let rows: Element[] = [];

  for (const selector of ROW_STRATEGIES) {
    const found = Array.from(document.querySelectorAll(selector));
    if (found.length > 0) {
      strategy = selector;
      rows = found;
      break;
    }
  }

  let firstDataId: string | null = null;
  let firstTitle: string | null = null;

  for (const [index, row] of rows.entries()) {
    const dataId = chatDataId(row);
    const jid = jidFromDataId(dataId);
    const name = chatName(row);

    if (index === 0) {
      firstDataId = dataId;
      firstTitle = name;
    }

    if (!jid.endsWith('@c.us') || name === '' || seen.has(jid)) {
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
    strategy,
    rowCount: rows.length,
    matchedCount: contacts.length,
    firstDataId,
    firstTitle,
  };

  return { contacts, diagnostics };
}

function chatDataId(row: Element): string | null {
  const holder = row.querySelector('[data-id]') ?? row;

  return holder.getAttribute('data-id');
}

function jidFromDataId(dataId: string | null): string {
  if (!dataId) {
    return '';
  }

  const segment = dataId.split('_').find((part) => part.endsWith('@c.us'));

  return segment ?? '';
}

function chatName(row: Element): string {
  const titled = row.querySelector('span[title]');

  return titled?.getAttribute('title')?.trim() ?? '';
}
