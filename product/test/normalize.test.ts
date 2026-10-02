import { describe, expect, it } from 'vitest';
import { normalizeContact } from '../src/domain/normalize';

const OBSERVED_AT = '2026-10-02T00:00:00.000Z';

describe('normalizeContact', () => {
  it('collapses whitespace in display names', () => {
    const result = normalizeContact({
      displayName: '  Rahul   Sharma ',
      phones: [],
      emails: [],
      observedAt: OBSERVED_AT,
    });

    expect(result.displayName).toBe('Rahul Sharma');
  });

  it('trims phone values and removes duplicates', () => {
    const result = normalizeContact({
      displayName: 'Rahul',
      phones: [{ value: ' +91 98765 43210 ' }, { value: '+91 98765 43210' }],
      emails: [],
      observedAt: OBSERVED_AT,
    });

    expect(result.phones).toEqual([{ value: '+91 98765 43210' }]);
  });

  it('lowercases and dedupes email values', () => {
    const result = normalizeContact({
      displayName: 'Rahul',
      phones: [],
      emails: [{ value: ' Rahul@Example.com ' }, { value: 'rahul@example.com' }],
      observedAt: OBSERVED_AT,
    });

    expect(result.emails).toEqual([{ value: 'rahul@example.com' }]);
  });

  it('preserves identity fields', () => {
    const result = normalizeContact({
      externalId: 'wa-123',
      displayName: 'Rahul',
      phones: [],
      emails: [],
      notes: 'met at conference',
      observedAt: OBSERVED_AT,
    });

    expect(result.externalId).toBe('wa-123');
    expect(result.notes).toBe('met at conference');
    expect(result.observedAt).toBe(OBSERVED_AT);
  });
});
