export interface ExportContact {
  displayName: string;
  notes: string | null;
  phones: { value: string; label: string | null }[];
  emails: { value: string; label: string | null }[];
}

export function renderVCard(contacts: ExportContact[]): string {
  return contacts
    .map((contact) => {
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${escapeVCard(contact.displayName)}`,
        `N:${escapeVCard(contact.displayName)};;;;`,
      ];

      for (const phone of contact.phones) {
        const type = typeForLabel(phone.label);
        lines.push(
          type ? `TEL;TYPE=${type}:${escapeVCard(phone.value)}` : `TEL:${escapeVCard(phone.value)}`,
        );
      }

      for (const email of contact.emails) {
        const type = typeForLabel(email.label);
        lines.push(
          type
            ? `EMAIL;TYPE=${type}:${escapeVCard(email.value)}`
            : `EMAIL:${escapeVCard(email.value)}`,
        );
      }

      if (contact.notes) {
        lines.push(`NOTE:${escapeVCard(contact.notes)}`);
      }

      lines.push('END:VCARD');
      return lines.join('\r\n');
    })
    .join('\r\n');
}

export function renderCsv(contacts: ExportContact[]): string {
  const rows: string[][] = [['Name', 'Phone', 'Email', 'Notes']];

  for (const contact of contacts) {
    rows.push([
      contact.displayName,
      contact.phones.map((phone) => phone.value).join('; '),
      contact.emails.map((email) => email.value).join('; '),
      contact.notes ?? '',
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function typeForLabel(label: string | null): string | undefined {
  if (!label) {
    return undefined;
  }

  const type = label.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return type === '' ? undefined : type;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
