import { describe, expect, it } from 'vitest';
import { parseVCard } from '../src/domain/parse-vcard';

const OBSERVED_AT = '2026-10-02T00:00:00.000Z';

const V3 = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Sharma;Rahul;;;',
  'FN:Rahul Sh',
  ' arma',
  'TEL;TYPE=CELL:+91 98765 43210',
  'TEL;TYPE=HOME;VOICE:011-1234 5678',
  'EMAIL;TYPE=INTERNET:rahul@example.com',
  'NOTE:Met at conference',
  'UID:urn:uuid:abc-123',
  'END:VCARD',
].join('\r\n');

const V4 = [
  'BEGIN:VCARD',
  'VERSION:4.0',
  'FN:Forrest Gump',
  'N:Gump;Forrest;;;',
  'TEL;TYPE="cell,voice":tel:+11115551212',
  'EMAIL:forrest@example.com',
  'END:VCARD',
].join('\r\n');

describe('parseVCard', () => {
  it('parses a 3.0 card with folded lines and multiple phones', () => {
    const result = parseVCard(V3, { observedAt: OBSERVED_AT });

    expect(result.skipped).toEqual([]);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toMatchObject({
      externalId: 'urn:uuid:abc-123',
      displayName: 'Rahul Sharma',
      phones: [
        { value: '+91 98765 43210', label: 'cell' },
        { value: '011-1234 5678', label: 'home' },
      ],
      emails: [{ value: 'rahul@example.com' }],
      notes: 'Met at conference',
      observedAt: OBSERVED_AT,
    });
  });

  it('decodes QUOTED-PRINTABLE text from 2.1 cards', () => {
    const card = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Garc=C3=ADa;Jos=C3=A9;;;',
      'FN;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Jos=C3=A9 Garc=C3=ADa',
      'TEL;CELL:123456789',
      'END:VCARD',
    ].join('\r\n');

    const result = parseVCard(card, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]?.displayName).toBe('José García');
    expect(result.contacts[0]?.phones).toEqual([{ value: '123456789', label: 'cell' }]);
  });

  it('strips tel: URI prefixes from 4.0 cards', () => {
    const result = parseVCard(V4, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]?.displayName).toBe('Forrest Gump');
    expect(result.contacts[0]?.phones).toEqual([{ value: '+11115551212', label: 'cell' }]);
  });

  it('parses multiple cards from one file', () => {
    const result = parseVCard(`${V3}\r\n${V4}`, { observedAt: OBSERVED_AT });

    expect(result.contacts.map((contact) => contact.displayName)).toEqual([
      'Rahul Sharma',
      'Forrest Gump',
    ]);
  });

  it('parses LF-only vCard files', () => {
    const card = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:LF Person', 'TEL:1234', 'END:VCARD'].join('\n');

    const result = parseVCard(card, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]?.displayName).toBe('LF Person');
  });

  it('falls back to N when FN is missing', () => {
    const card = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Sharma;Rahul;;;', 'TEL:1234', 'END:VCARD'].join(
      '\r\n',
    );

    const result = parseVCard(card, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]?.displayName).toBe('Rahul Sharma');
  });

  it('unescapes text values', () => {
    const card = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Doe\\, John', 'END:VCARD'].join('\r\n');

    const result = parseVCard(card, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]?.displayName).toBe('Doe, John');
  });

  it('skips cards without a usable name', () => {
    const card = ['BEGIN:VCARD', 'VERSION:3.0', 'TEL:1234', 'END:VCARD'].join('\r\n');

    const result = parseVCard(card, { observedAt: OBSERVED_AT });

    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([{ index: 1, reason: 'missing display name' }]);
  });

  it('reports input with no vCard records', () => {
    const result = parseVCard('just some text', { observedAt: OBSERVED_AT });

    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([{ index: 0, reason: 'no vCard records found' }]);
  });
});
