import { describe, expect, it } from 'vitest';
import {
  normalizeEmailForMatch,
  normalizeNameForMatch,
  normalizePhoneForMatch,
} from '../src/domain/matching';

describe('match normalization', () => {
  it('keeps phone digits only', () => {
    expect(normalizePhoneForMatch('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhoneForMatch('(011) 1234-5678')).toBe('01112345678');
  });

  it('trims and lowercases emails', () => {
    expect(normalizeEmailForMatch(' Rahul@Example.COM ')).toBe('rahul@example.com');
  });

  it('normalizes display names', () => {
    expect(normalizeNameForMatch('  Rahul   Sharma ')).toBe('rahul sharma');
    expect(normalizeNameForMatch('Doe, John')).toBe('doe john');
  });
});
