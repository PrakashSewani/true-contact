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

      const rows = captureRows();
      const bulk = captureBulk();
      debugCapture(rows, bulk);

      window.postMessage(
        {
          source: 'truecontact-connector-page',
          type: 'capture-result',
          nonce: data.nonce,
          rows,
          bulk,
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

function phoneField(value: unknown): string | null {
  const serialized = typeof value === 'string' ? value : jidString(value);
  if (!serialized) {
    return null;
  }

  const match = JID_PATTERN.exec(serialized);
  const number = match?.[1];
  const server = match?.[2]?.toLowerCase();

  return number && server === 'c.us' ? `${number}@c.us` : null;
}

const PHONE_KEYS = ['__x_phoneNumber', 'phoneNumber'];
const RELATION_KEYS = ['contact', 'data', 'chat'];

function findPhone(value: unknown, depth: number): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of PHONE_KEYS) {
    const phone = phoneField(record[key]);
    if (phone) {
      return phone;
    }
  }

  for (const key of RELATION_KEYS) {
    const phone = findPhone(record[key], depth + 1);
    if (phone) {
      return phone;
    }
  }

  return null;
}

interface RowCapture {
  id: string | null;
  phone: string | null;
}

function debugCapture(rows: RowCapture[], bulk: BulkEntry[]): void {
  try {
    const payload = {
      rows: rows.length,
      rowsWithPhone: rows.filter((row) => row.phone).length,
      bulk: bulk.length,
      bulkWithPhone: bulk.filter((entry) => entry.phone).length,
      rowSample: rows.slice(0, 4),
      bulkSample: bulk.slice(0, 4).map((entry) => ({ id: entry.id, phone: entry.phone })),
      trace: traceFirstRow(),
    };

    console.log(`[TrueContact] capture ${JSON.stringify(payload)}`);
  } catch (error) {
    console.log('[TrueContact] capture debug failed', error);
  }
}

function traceFirstRow(): unknown {
  const rows = Array.from(document.querySelectorAll('[role="listitem"]'));

  for (const row of rows) {
    let node: Element | null = row;

    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      const record = node as unknown as Record<string, unknown>;
      const propsKey = Object.keys(record).find((key) => key.startsWith('__reactProps$'));
      const fiberKey = Object.keys(record).find((key) => key.startsWith('__reactFiber$'));
      const levels: unknown[] = [];

      if (propsKey) {
        levels.push(record[propsKey]);
      }
      if (fiberKey) {
        let fiber = record[fiberKey] as FiberLike | null | undefined;

        for (let level = 0; fiber && level < 30; level += 1) {
          levels.push(fiber.memoizedProps);
          fiber = fiber.return ?? null;
        }
      }

      for (const props of levels) {
        if (!props || typeof props !== 'object') {
          continue;
        }

        const id = idFromProps(props);
        if (!id) {
          continue;
        }

        const p = props as Record<string, unknown>;
        const descriptor = p.data as Record<string, unknown> | undefined;
        const model = (descriptor?.data as Record<string, unknown> | undefined) ?? descriptor;

        if (!model || typeof model !== 'object') {
          continue;
        }

        const keys = Object.keys(model).slice(0, 80);
        const contact = model.contact as Record<string, unknown> | undefined;

        return {
          id,
          modelKeys: keys,
          phoneishKeys: keys.filter((key) => /phone/i.test(key)),
          hasContact: !!contact,
          contactPhoneishKeys: contact
            ? Object.keys(contact).filter((key) => /phone/i.test(key))
            : null,
        };
      }
    }
  }

  return 'no row with id found';
}

function captureRows(): RowCapture[] {
  const rows = Array.from(document.querySelectorAll('[role="listitem"]'));

  return rows.map((row) => {
    try {
      return findRowCapture(row);
    } catch {
      return { id: null, phone: null };
    }
  });
}

function findRowCapture(row: Element): RowCapture {
  let node: Element | null = row;
  let id: string | null = null;
  let phone: string | null = null;

  const scan = (props: unknown) => {
    if (!props || typeof props !== 'object') {
      return;
    }

    const propsId = idFromProps(props);
    if (!propsId) {
      return;
    }

    id ??= propsId;
    // Bind the number to a level that carries this row's id, so a shared
    // ancestor can never attach another chat's contact to this row.
    phone ??= findPhone(props, 0);
  };

  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    const record = node as unknown as Record<string, unknown>;
    const propsKey = Object.keys(record).find((key) => key.startsWith('__reactProps$'));
    const fiberKey = Object.keys(record).find((key) => key.startsWith('__reactFiber$'));

    if (propsKey) {
      scan(record[propsKey]);
    }

    if (fiberKey) {
      let fiber = record[fiberKey] as FiberLike | null | undefined;

      for (let level = 0; fiber && level < 30; level += 1) {
        scan(fiber.memoizedProps);
        fiber = fiber.return ?? null;
      }
    }
  }

  return { id, phone };
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
    typeof record.__x_id === 'string' ? record.__x_id : null,
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

      return id ? { id, name: null, phone: null } : null;
    }
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as Record<string, unknown>;
    const data = record.data as Record<string, unknown> | undefined;

    const idCandidates: unknown[] = [
      record.__x_id,
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

    if (!id) {
      return null;
    }

    return {
      id,
      name: pickName(item),
      phone: findPhone(item, 0),
    };
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
      record.__x_name,
      record.__x_shortName,
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
