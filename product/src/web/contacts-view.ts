import type { ContactSummary } from './client';

export type ContactFilter = 'all' | 'phone' | 'email' | 'no-phone' | 'review';
export type ContactSort = 'name-asc' | 'name-desc' | 'updated' | 'observed';

export const CONTACT_FILTERS: { value: ContactFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'no-phone', label: 'No phone' },
  { value: 'review', label: 'Review' },
];

export const CONTACT_SORTS: { value: ContactSort; label: string }[] = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'observed', label: 'Recently seen' },
];

export interface ContactViewOptions {
  query: string;
  filter: ContactFilter;
  sort: ContactSort;
}

export function filterAndSortContacts(
  contacts: ContactSummary[],
  options: ContactViewOptions,
): ContactSummary[] {
  const query = options.query.trim().toLowerCase();
  const digits = query.replace(/\D+/g, '');

  return contacts
    .filter(
      (contact) => matchesFilter(contact, options.filter) && matchesQuery(contact, query, digits),
    )
    .sort((a, b) => compareContacts(a, b, options.sort));
}

function matchesFilter(contact: ContactSummary, filter: ContactFilter): boolean {
  switch (filter) {
    case 'phone':
      return contact.phones.length > 0;
    case 'email':
      return contact.emails.length > 0;
    case 'no-phone':
      return contact.phones.length === 0;
    case 'review':
      return contact.openConflicts > 0 || contact.proposedLinks > 0;
    default:
      return true;
  }
}

function matchesQuery(contact: ContactSummary, query: string, digits: string): boolean {
  if (query === '') {
    return true;
  }

  if (contact.displayName.toLowerCase().includes(query)) {
    return true;
  }

  if (
    digits.length >= 3 &&
    contact.phones.some((phone) => phone.value.replace(/\D+/g, '').includes(digits))
  ) {
    return true;
  }

  return contact.emails.some((email) => email.value.toLowerCase().includes(query));
}

function compareContacts(a: ContactSummary, b: ContactSummary, sort: ContactSort): number {
  switch (sort) {
    case 'name-desc':
      return compareNames(b, a);
    case 'updated':
      return timeOf(b.updatedAt) - timeOf(a.updatedAt) || compareNames(a, b);
    case 'observed':
      return compareObserved(a, b);
    default:
      return compareNames(a, b);
  }
}

function compareNames(a: ContactSummary, b: ContactSummary): number {
  return (
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  );
}

function compareObserved(a: ContactSummary, b: ContactSummary): number {
  const aTime = a.lastObservedAt === null ? null : timeOf(a.lastObservedAt);
  const bTime = b.lastObservedAt === null ? null : timeOf(b.lastObservedAt);

  if (aTime === null && bTime === null) {
    return compareNames(a, b);
  }
  if (aTime === null) {
    return 1;
  }
  if (bTime === null) {
    return -1;
  }

  return bTime - aTime || compareNames(a, b);
}

function timeOf(value: string): number {
  return new Date(value).getTime();
}
