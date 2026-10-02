import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/domain/parse-csv';

const OBSERVED_AT = '2026-10-02T00:00:00.000Z';

describe('parseCsv', () => {
  it('maps alias headers and splits multi-value cells', () => {
    const csv = [
      'Full Name,Mobile,Email,Notes',
      'Rahul Sharma,+91 98765 43210;011-1234 5678,rahul@example.com,met at conference',
    ].join('\r\n');

    const result = parseCsv(csv, { observedAt: OBSERVED_AT });

    expect(result.skipped).toEqual([]);
    expect(result.contacts[0]).toMatchObject({
      displayName: 'Rahul Sharma',
      phones: [{ value: '+91 98765 43210' }, { value: '011-1234 5678' }],
      emails: [{ value: 'rahul@example.com' }],
      notes: 'met at conference',
      observedAt: OBSERVED_AT,
    });
  });

  it('auto-detects a semicolon delimiter and combines first and last name', () => {
    const csv = ['First Name;Last Name;Mobile Phone', 'Jane;Doe;+49 160 1234567'].join('\r\n');

    const result = parseCsv(csv, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]).toMatchObject({
      displayName: 'Jane Doe',
      phones: [{ value: '+49 160 1234567' }],
    });
  });

  it('handles quoted fields, BOM, and CRLF', () => {
    const csv = '\uFEFFName,Phone\r\n"Smith, Jane","+1 555 0100"\r\n';

    const result = parseCsv(csv, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]).toMatchObject({
      displayName: 'Smith, Jane',
      phones: [{ value: '+1 555 0100' }],
    });
  });

  it('maps Google-style headers', () => {
    const csv = [
      'First Name,Last Name,Phone 1 - Value,E-mail 1 - Value,Notes',
      'Rahul,Sharma,+91 98765 43210,rahul@example.com,hi',
    ].join('\n');

    const result = parseCsv(csv, { observedAt: OBSERVED_AT });

    expect(result.contacts[0]).toMatchObject({
      displayName: 'Rahul Sharma',
      phones: [{ value: '+91 98765 43210' }],
      emails: [{ value: 'rahul@example.com' }],
      notes: 'hi',
    });
  });

  it('skips rows without a name', () => {
    const csv = ['Name,Phone', ',+1 555', 'Rahul,+91 98765 43210'].join('\n');

    const result = parseCsv(csv, { observedAt: OBSERVED_AT });

    expect(result.contacts).toHaveLength(1);
    expect(result.skipped).toEqual([{ index: 2, reason: 'missing display name' }]);
  });

  it('reports a missing name column', () => {
    const csv = ['Phone,Email', '+1 555,a@example.com'].join('\n');

    const result = parseCsv(csv, { observedAt: OBSERVED_AT });

    expect(result.contacts).toEqual([]);
    expect(result.skipped).toEqual([{ index: 1, reason: 'no name column found' }]);
  });
});
