import type { BulkEntry } from '../lib/messages';

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
          rows: captureRowIds(),
          bulk: captureBulk(),
        },
        '*',
      );
    });
  },
});

const JID_PATTERN = /(\d{5,20})@(c\.us|lid)/i;

function parseJid(value: string): string | null {
  const match = JID_PATTERN.exec(value);
  const number = match?.[1];
  const server = match?.[2];

  return number && server ? `${number}@${server.toLowerCase()}` : null;
}

function captureRowIds(): (string | null)[] {
  const rows = Array.from(document.querySelectorAll('[role="listitem"]'));

  return rows.map((row) => {
    try {
      return findRowId(row);
    } catch {
      return null;
    }
  });
}

function findRowId(row: Element): string | null {
  let node: Element | null = row;

  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    const record = node as unknown as Record<string, unknown>;
    const propsKey = Object.keys(record).find((key) => key.startsWith('__reactProps$'));
    const fiberKey = Object.keys(record).find((key) => key.startsWith('__reactFiber$'));

    if (propsKey) {
      const id = idFromProps(record[propsKey]);
      if (id) {
        return id;
      }
    }

    if (fiberKey) {
      let fiber = record[fiberKey] as FiberLike | null | undefined;

      for (let level = 0; fiber && level < 30; level += 1) {
        const id = idFromProps(fiber.memoizedProps);
        if (id) {
          return id;
        }
        fiber = fiber.return ?? null;
      }
    }
  }

  return null;
}

function idFromProps(props: unknown): string | null {
  if (!props || typeof props !== 'object') {
    return null;
  }

  const record = props as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | undefined;

  if (data && typeof data === 'object') {
    if (typeof data.itemKey === 'string') {
      const id = parseJid(data.itemKey);
      if (id) {
        return id;
      }
    }

    const nested = jidString(data.id);
    if (nested) {
      const id = parseJid(nested);
      if (id) {
        return id;
      }
    }
  }

  const candidates = [
    typeof record.itemKey === 'string' ? record.itemKey : null,
    jidString(record.chatId),
    jidString(record.chat),
    jidString(record.contact),
    jidString(record.id),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const id = parseJid(candidate);
    if (id) {
      return id;
    }
  }

  return null;
}

function jidString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record._serialized === 'string') {
    return record._serialized;
  }

  const id = record.id as Record<string, unknown> | undefined;
  if (id && typeof id._serialized === 'string') {
    return id._serialized;
  }

  return null;
}

function captureBulk(): BulkEntry[] {
  const entries = new Map<string, BulkEntry>();
  const arrays: unknown[][] = [];
  const arraysSeen = new Set<unknown[]>();
  const propsSeen = new Set<object>();

  const visitProps = (props: unknown) => {
    if (!props || typeof props !== 'object' || propsSeen.has(props)) {
      return;
    }
    propsSeen.add(props);

    const record = props as Record<string, unknown>;
    for (const key of ['data', 'contacts', 'chats', 'items']) {
      const value = record[key];
      if (Array.isArray(value) && value.length > 0 && !arraysSeen.has(value)) {
        arraysSeen.add(value);
        arrays.push(value);
      }
    }
  };

  const rows = Array.from(document.querySelectorAll('[role="listitem"]'));

  for (const row of rows) {
    let node: Element | null = row;

    for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
      const record = node as unknown as Record<string, unknown>;
      const propsKey = Object.keys(record).find((key) => key.startsWith('__reactProps$'));
      const fiberKey = Object.keys(record).find((key) => key.startsWith('__reactFiber$'));

      if (propsKey) {
        visitProps(record[propsKey]);
      }
      if (fiberKey) {
        let fiber = record[fiberKey] as FiberLike | null | undefined;

        for (let level = 0; fiber && level < 30; level += 1) {
          visitProps(fiber.memoizedProps);
          fiber = fiber.return ?? null;
        }
      }
    }
  }

  for (const array of arrays) {
    for (const item of array) {
      const entry = bulkEntry(item);
      if (entry && !entries.has(entry.id)) {
        entries.set(entry.id, entry);
      }
    }
  }

  return Array.from(entries.values()).slice(0, 1500);
}

function bulkEntry(item: unknown): BulkEntry | null {
  try {
    if (typeof item === 'string') {
      const id = parseJid(item);

      return id ? { id, name: null } : null;
    }
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const data = record.data as Record<string, unknown> | undefined;

    const idCandidates: unknown[] = [
      record.itemKey,
      record._serialized,
      record.id,
      data?.itemKey,
      data?.id,
      (record.chat as Record<string, unknown> | undefined)?.id,
      (record.contact as Record<string, unknown> | undefined)?.id,
    ];

    let id: string | null = null;

    for (const candidate of idCandidates) {
      const value = jidString(candidate) ?? (typeof candidate === 'string' ? candidate : null);
      if (!value) {
        continue;
      }
      const parsed = parseJid(value);
      if (parsed) {
        id = parsed;
        break;
      }
    }

    return id ? { id, name: pickName(item) } : null;
  } catch {
    return null;
  }
}

function pickName(item: unknown): string | null {
  try {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const candidates: unknown[] = [
      record.name,
      record.formattedTitle,
      record.formattedName,
      record.displayName,
      record.pushname,
      (record.data as Record<string, unknown> | undefined)?.name,
      (record.data as Record<string, unknown> | undefined)?.formattedTitle,
      (record.contact as Record<string, unknown> | undefined)?.name,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate.trim().slice(0, 200);
      }
      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>;
        for (const key of ['formattedName', 'displayName', 'name', 'text']) {
          const value = nested[key];
          if (typeof value === 'string' && value.trim() !== '') {
            return value.trim().slice(0, 200);
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
