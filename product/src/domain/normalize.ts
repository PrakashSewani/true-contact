import type { NormalizedContact } from '@truecontact/shared';

export function normalizeContact(contact: NormalizedContact): NormalizedContact {
  return {
    ...contact,
    displayName: collapseWhitespace(contact.displayName),
    phones: dedupeByValue(contact.phones.map((phone) => ({ ...phone, value: phone.value.trim() }))),
    emails: dedupeByValue(
      contact.emails.map((email) => ({ ...email, value: email.value.trim().toLowerCase() })),
    ),
  };
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function dedupeByValue<T extends { value: string }>(items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.value)) {
      return false;
    }
    seen.add(item.value);
    return true;
  });
}
