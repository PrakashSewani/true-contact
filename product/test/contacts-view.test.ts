import { describe, expect, it } from 'vitest';
import type { ContactSummary } from '../src/web/client';
import { filterAndSortContacts } from '../src/web/contacts-view';

function contact(
  overrides: Partial<ContactSummary> & Pick<ContactSummary, 'id' | 'displayName'>,
): ContactSummary {
  return {
    notes: null,
    updatedAt: '2026-10-01T00:00:00.000Z',
    phones: [],
    emails: [],
    openConflicts: 0,
    proposedLinks: 0,
    lastObservedAt: null,
    ...overrides,
  };
}

const VIEW = { query: '', filter: 'all', sort: 'name-asc' } as const;

function value(id: string, value: string): { id: string; value: string; label: null } {
  return { id, value, label: null };
}

describe('contacts view', () => {
  it('sorts alphabetically by name by default, case-insensitively', () => {
    const contacts = [
      contact({ id: 'c', displayName: 'zoe' }),
      contact({ id: 'a', displayName: 'Alice' }),
      contact({ id: 'b', displayName: 'bob' }),
    ];

    expect(filterAndSortContacts(contacts, VIEW).map((item) => item.displayName)).toEqual([
      'Alice',
      'bob',
      'zoe',
    ]);
  });

  it('sorts by name descending and keeps ties deterministic by id', () => {
    const contacts = [
      contact({ id: 'b', displayName: 'Sam' }),
      contact({ id: 'a', displayName: 'sam' }),
    ];

    expect(
      filterAndSortContacts(contacts, { ...VIEW, sort: 'name-desc' }).map((c) => c.id),
    ).toEqual(['b', 'a']);
    expect(filterAndSortContacts(contacts, VIEW).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('sorts by recently updated and recently seen, with unseen contacts last', () => {
    const contacts = [
      contact({
        id: 'old',
        displayName: 'Old',
        updatedAt: '2026-09-01T00:00:00.000Z',
        lastObservedAt: '2026-09-01T00:00:00.000Z',
      }),
      contact({ id: 'mid', displayName: 'Mid', updatedAt: '2026-09-20T00:00:00.000Z' }),
      contact({
        id: 'new',
        displayName: 'New',
        updatedAt: '2026-10-02T00:00:00.000Z',
        lastObservedAt: '2026-10-02T00:00:00.000Z',
      }),
    ];

    expect(filterAndSortContacts(contacts, { ...VIEW, sort: 'updated' }).map((c) => c.id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
    expect(filterAndSortContacts(contacts, { ...VIEW, sort: 'observed' }).map((c) => c.id)).toEqual(
      ['new', 'old', 'mid'],
    );
  });

  it('searches by name, phone digits, and email', () => {
    const contacts = [
      contact({
        id: 'rahul',
        displayName: 'Rahul Sharma',
        phones: [value('p', '+91 98765 43210')],
      }),
      contact({ id: 'jane', displayName: 'Jane Doe', emails: [value('e', 'jane@example.com')] }),
    ];

    expect(filterAndSortContacts(contacts, { ...VIEW, query: 'rahul' }).map((c) => c.id)).toEqual([
      'rahul',
    ]);
    expect(filterAndSortContacts(contacts, { ...VIEW, query: '98765' }).map((c) => c.id)).toEqual([
      'rahul',
    ]);
    expect(
      filterAndSortContacts(contacts, { ...VIEW, query: '9876543210' }).map((c) => c.id),
    ).toEqual(['rahul']);
    expect(filterAndSortContacts(contacts, { ...VIEW, query: 'EXAMPLE' }).map((c) => c.id)).toEqual(
      ['jane'],
    );
    expect(filterAndSortContacts(contacts, { ...VIEW, query: 'nothing here' })).toEqual([]);
  });

  it('filters by phone, email, missing phone, and needs review', () => {
    const withPhone = contact({
      id: 'phone',
      displayName: 'Has Phone',
      phones: [value('p', '+1 555 0100')],
    });
    const withEmail = contact({
      id: 'email',
      displayName: 'Has Email',
      emails: [value('e', 'a@example.com')],
    });
    const bare = contact({ id: 'bare', displayName: 'Bare Contact' });
    const review = contact({
      id: 'review',
      displayName: 'Review Me',
      phones: [value('p', '+1 555 0200')],
      openConflicts: 2,
      proposedLinks: 1,
    });
    const contacts = [withPhone, withEmail, bare, review];

    expect(filterAndSortContacts(contacts, { ...VIEW, filter: 'phone' }).map((c) => c.id)).toEqual([
      'phone',
      'review',
    ]);
    expect(filterAndSortContacts(contacts, { ...VIEW, filter: 'email' }).map((c) => c.id)).toEqual([
      'email',
    ]);
    expect(
      filterAndSortContacts(contacts, { ...VIEW, filter: 'no-phone' }).map((c) => c.id),
    ).toEqual(['bare', 'email']);
    expect(filterAndSortContacts(contacts, { ...VIEW, filter: 'review' }).map((c) => c.id)).toEqual(
      ['review'],
    );
  });

  it('combines query and filter', () => {
    const contacts = [
      contact({ id: 'a', displayName: 'Alice', phones: [value('p', '+1 555 0300')] }),
      contact({ id: 'b', displayName: 'Alina' }),
    ];

    expect(
      filterAndSortContacts(contacts, { ...VIEW, query: 'ali', filter: 'phone' }).map((c) => c.id),
    ).toEqual(['a']);
  });
});
