import type { NormalizedContact } from '@truecontact/shared';
import VCF, { type VCardProperty } from 'vcf';
import { normalizeContact } from './normalize';
import type { ParseOptions, ParseResult } from './parse-result';

const CARD_PATTERN = /BEGIN:VCARD[\s\S]*?END:VCARD/gi;

const TRANSPORT_TYPES = new Set([
  'voice',
  'internet',
  'pref',
  'text',
  'vcard',
  'dom',
  'isdn',
  'pcs',
  'msg',
  'car',
  'video',
]);

type VCardData = Record<string, VCardProperty | VCardProperty[] | undefined>;
type PropertyTuple = [string, Record<string, unknown>, string, unknown];

export function parseVCard(text: string, options: ParseOptions): ParseResult {
  const result: ParseResult = { contacts: [], skipped: [] };
  const normalized = text.replace(/\r\n|\r|\n/g, '\r\n');
  const blocks = normalized.match(CARD_PATTERN) ?? [];

  if (blocks.length === 0) {
    if (text.trim() !== '') {
      result.skipped.push({ index: 0, reason: 'no vCard records found' });
    }
    return result;
  }

  blocks.forEach((block, position) => {
    const index = position + 1;
    let contact: NormalizedContact | undefined;

    try {
      const data = new VCF().parse(block).data ?? {};
      contact = toContact(data, options.observedAt);
    } catch (error) {
      result.skipped.push({ index, reason: `unreadable vCard: ${errorMessage(error)}` });
      return;
    }

    if (!contact) {
      result.skipped.push({ index, reason: 'missing display name' });
      return;
    }

    result.contacts.push(normalizeContact(contact));
  });

  return result;
}

function toContact(data: VCardData, observedAt: string): NormalizedContact | undefined {
  const displayName = propertyText(data, 'fn') ?? nameFromN(data);

  if (!displayName) {
    return undefined;
  }

  const contact: NormalizedContact = { displayName, phones: [], emails: [], observedAt };

  const externalId = propertyText(data, 'uid');
  if (externalId) {
    contact.externalId = externalId;
  }

  const notes = propertyText(data, 'note');
  if (notes) {
    contact.notes = notes;
  }

  for (const tuple of propertyList(data, 'tel')) {
    const value = tupleText(tuple);
    if (value) {
      const phone = value.replace(/^tel:/i, '');
      const label = labelFromParams(tuple[1]);
      contact.phones.push(label ? { value: phone, label } : { value: phone });
    }
  }

  for (const tuple of propertyList(data, 'email')) {
    const value = tupleText(tuple);
    if (value) {
      const label = labelFromParams(tuple[1]);
      contact.emails.push(label ? { value, label } : { value });
    }
  }

  return contact;
}

function propertyList(data: VCardData, name: string): PropertyTuple[] {
  const value = data[name];

  if (value === undefined) {
    return [];
  }

  const properties = Array.isArray(value) ? value : [value];
  return properties.map((property) => property.toJSON());
}

function propertyText(data: VCardData, name: string): string | undefined {
  const [tuple] = propertyList(data, name);
  return tuple ? tupleText(tuple) : undefined;
}

function tupleText(tuple: PropertyTuple): string | undefined {
  const raw = tuple[3];

  if (typeof raw !== 'string') {
    return undefined;
  }

  const value = unescapeText(decodeIfQuotedPrintable(raw, tuple[1])).trim();
  return value === '' ? undefined : value;
}

function nameFromN(data: VCardData): string | undefined {
  const [tuple] = propertyList(data, 'n');

  if (!tuple || !Array.isArray(tuple[3])) {
    return undefined;
  }

  const parts = tuple[3].map((part) =>
    typeof part === 'string' ? unescapeText(decodeIfQuotedPrintable(part, tuple[1])).trim() : '',
  );

  const [family = '', given = '', additional = '', prefix = '', suffix = ''] = parts;
  const name = [prefix, given, additional, family, suffix].filter((part) => part !== '').join(' ');

  return name === '' ? undefined : name;
}

function labelFromParams(params: Record<string, unknown>): string | undefined {
  const type = params.type;
  const values = typeof type === 'string' ? [type] : Array.isArray(type) ? type : [];

  const label = values.find(
    (value): value is string =>
      typeof value === 'string' && !TRANSPORT_TYPES.has(value.toLowerCase()),
  );

  return label?.toLowerCase();
}

function decodeIfQuotedPrintable(value: string, params: Record<string, unknown>): string {
  const encoding = typeof params.encoding === 'string' ? params.encoding.toLowerCase() : '';

  if (encoding !== 'quoted-printable') {
    return value;
  }

  const charset = typeof params.charset === 'string' ? params.charset : 'utf-8';
  return decodeQuotedPrintable(value, charset);
}

function decodeQuotedPrintable(value: string, charset: string): string {
  const bytes: number[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i);

    if (char === '=') {
      const hex = value.slice(i + 1, i + 3);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }

    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else {
      bytes.push(...new TextEncoder().encode(char));
    }
  }

  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder();
  }

  return decoder.decode(new Uint8Array(bytes));
}

function unescapeText(value: string): string {
  if (!value.includes('\\')) {
    return value;
  }

  let result = '';

  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i);

    if (char !== '\\') {
      result += char;
      continue;
    }

    const next = value[i + 1];
    if (next === 'n' || next === 'N') {
      result += '\n';
      i += 1;
    } else if (next === '\\' || next === ',' || next === ';') {
      result += next;
      i += 1;
    } else {
      result += char;
    }
  }

  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
