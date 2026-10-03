import type { NormalizedContact, SourceKind } from '@truecontact/shared';
import { normalizeNameForMatch } from './matching';
import { contactValues, valueKey } from './reconcile';

export function canonicalRecordState(contact: NormalizedContact): string {
  const identifiers = contactValues(contact).map(valueKey).sort();

  return [
    normalizeNameForMatch(contact.displayName),
    identifiers.join(','),
    contact.notes ?? '',
  ].join('\u0001');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface RecordIdentity {
  recordKey: string | null;
  contentHash: string;
}

export async function recordIdentity(
  contact: NormalizedContact,
  kind: SourceKind,
): Promise<RecordIdentity> {
  const contentHash = await sha256Hex(canonicalRecordState(contact));
  const externalId = contact.externalId?.trim() ?? '';

  if (externalId !== '') {
    return { recordKey: `${kind}:x:${externalId}`, contentHash };
  }

  if (contactValues(contact).length === 0) {
    return { recordKey: null, contentHash };
  }

  return { recordKey: `${kind}:f:${contentHash}`, contentHash };
}
