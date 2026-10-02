interface FiberLike {
  memoizedProps?: unknown;
  return?: FiberLike | null;
}

interface CaptureRequest {
  source?: string;
  type?: string;
  nonce?: string;
}

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as CaptureRequest | undefined;
      if (data?.source !== 'truecontact-connector' || data.type !== 'capture') {
        return;
      }

      window.postMessage(
        {
          source: 'truecontact-connector-page',
          type: 'capture-result',
          nonce: data.nonce,
          jids: captureJids(),
        },
        '*',
      );
    });
  },
});

function captureJids(): (string | null)[] {
  const rows = Array.from(document.querySelectorAll('[role="listitem"]'));

  return rows.map((row) => {
    try {
      return findJid(row);
    } catch {
      return null;
    }
  });
}

function findJid(row: Element): string | null {
  let node: Element | null = row;

  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const record = node as unknown as Record<string, unknown>;
    const propsKey = Object.keys(record).find((key) => key.startsWith('__reactProps$'));
    const fiberKey = Object.keys(record).find((key) => key.startsWith('__reactFiber$'));

    if (propsKey) {
      const jid = harvest(record[propsKey]);
      if (jid) {
        return jid;
      }
    }

    if (fiberKey) {
      let fiber = record[fiberKey] as FiberLike | null | undefined;

      for (let level = 0; fiber && level < 30; level += 1) {
        const jid = harvest(fiber.memoizedProps);
        if (jid) {
          return jid;
        }
        fiber = fiber.return ?? null;
      }
    }
  }

  return null;
}

function harvest(props: unknown): string | null {
  if (!props || typeof props !== 'object') {
    return null;
  }

  const record = props as Record<string, unknown>;
  const direct = jidOf(record);
  if (direct) {
    return direct;
  }

  for (const candidate of [record.chat, record.contact, record.chatId, record.item, record.id]) {
    const jid = jidOf(candidate);
    if (jid) {
      return jid;
    }
  }

  return null;
}

function jidOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record._serialized === 'string' && record._serialized.includes('@')) {
    return record._serialized;
  }

  const id = record.id as Record<string, unknown> | undefined;
  if (id && typeof id._serialized === 'string' && id._serialized.includes('@')) {
    return id._serialized;
  }

  return null;
}
