import type { NormalizedContact } from '@truecontact/shared';
import * as Papa from 'papaparse';
import { normalizeContact } from './normalize';
import type { ParseOptions, ParseResult } from './parse-result';

interface ColumnMap {
  name?: number;
  firstName?: number;
  lastName?: number;
  phones: number[];
  emails: number[];
  notes?: number;
}

export function parseCsv(text: string, options: ParseOptions): ParseResult {
  const input = text.replace(/^\uFEFF/, '');
  const parsed = Papa.parse<string[]>(input, { skipEmptyLines: 'greedy' });
  const rows = parsed.data;

  if (rows.length === 0) {
    const reason = parsed.errors[0]?.message ?? 'empty file';
    return { contacts: [], skipped: [{ index: 0, reason }] };
  }

  const columns = mapColumns(rows[0] ?? []);

  if (
    columns.name === undefined &&
    columns.firstName === undefined &&
    columns.lastName === undefined
  ) {
    return { contacts: [], skipped: [{ index: 1, reason: 'no name column found' }] };
  }

  const result: ParseResult = { contacts: [], skipped: [] };

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const index = rowIndex + 1;

    const name =
      cell(row, columns.name) ??
      [cell(row, columns.firstName), cell(row, columns.lastName)].filter(Boolean).join(' ');

    if (!name) {
      result.skipped.push({ index, reason: 'missing display name' });
      continue;
    }

    const phones = columns.phones
      .flatMap((column) => splitValues(row[column]))
      .map((value) => ({ value }));
    const emails = columns.emails
      .flatMap((column) => splitValues(row[column]))
      .map((value) => ({ value }));
    const notes = cell(row, columns.notes);

    const contact: NormalizedContact = {
      displayName: name,
      phones,
      emails,
      observedAt: options.observedAt,
    };

    if (notes) {
      contact.notes = notes;
    }

    result.contacts.push(normalizeContact(contact));
  }

  return result;
}

function mapColumns(header: string[]): ColumnMap {
  const columns: ColumnMap = { phones: [], emails: [] };

  header.forEach((raw, index) => {
    const value = normalizeHeader(raw);

    if (value === '') {
      return;
    }
    if (columns.name === undefined && /^(name|full name|display name|contact name)$/.test(value)) {
      columns.name = index;
      return;
    }
    if (columns.firstName === undefined && /^(first name|given name)$/.test(value)) {
      columns.firstName = index;
      return;
    }
    if (columns.lastName === undefined && /^(last name|family name|surname)$/.test(value)) {
      columns.lastName = index;
      return;
    }
    if (/^(phone|mobile|tel|telephone|cell)/.test(value)) {
      columns.phones.push(index);
      return;
    }
    if (/^(email|e mail)/.test(value)) {
      columns.emails.push(index);
      return;
    }
    if (columns.notes === undefined && /^notes?$/.test(value)) {
      columns.notes = index;
    }
  });

  return columns;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cell(row: string[], index: number | undefined): string | undefined {
  if (index === undefined) {
    return undefined;
  }

  const value = row[index]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function splitValues(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}
