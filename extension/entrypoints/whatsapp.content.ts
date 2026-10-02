import type { CaptureResult } from '../lib/messages';

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

function captureContacts(): CaptureResult {
  const contacts: CaptureResult['contacts'] = [];
  const seen = new Set<string>();

  const rows = document.querySelectorAll('#pane-side [role="listitem"]');

  for (const row of rows) {
    const jid = chatJid(row);
    const name = chatName(row);

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

  return { contacts };
}

function chatJid(row: Element): string {
  const holder = row.querySelector('[data-id]') ?? row;
  const dataId = holder.getAttribute('data-id') ?? '';

  return dataId.split('_').pop() ?? '';
}

function chatName(row: Element): string {
  const titled = row.querySelector('span[title]');

  return titled?.getAttribute('title')?.trim() ?? '';
}
