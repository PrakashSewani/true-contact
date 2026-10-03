import type { NormalizedContact } from '@truecontact/shared';
import { normalizeEmailForMatch, normalizeNameForMatch, normalizePhoneForMatch } from './matching';

export interface ContactValue {
  kind: 'phone' | 'email';
  value: string;
  normalizedValue: string;
  label?: string;
}

export function contactValues(contact: NormalizedContact): ContactValue[] {
  return [
    ...contact.phones.map((phone) => ({
      kind: 'phone' as const,
      value: phone.value,
      normalizedValue: normalizePhoneForMatch(phone.value),
      label: phone.label,
    })),
    ...contact.emails.map((email) => ({
      kind: 'email' as const,
      value: email.value,
      normalizedValue: normalizeEmailForMatch(email.value),
      label: email.label,
    })),
  ].filter((row) => row.normalizedValue !== '');
}

export function valueKey(value: Pick<ContactValue, 'kind' | 'normalizedValue'>): string {
  return `${value.kind}:${value.normalizedValue}`;
}

export interface AdoptionState {
  displayName: string;
  notes: string | null;
  valueKeys: ReadonlySet<string>;
  conflictValues: ReadonlySet<string>;
}

export interface AdoptionPlan {
  values: ContactValue[];
  conflict: { existingValue: string; proposedValue: string } | null;
  notes: string | null;
}

export function planValues(
  valueKeys: ReadonlySet<string>,
  contact: NormalizedContact,
): ContactValue[] {
  const seen = new Set(valueKeys);
  const values: ContactValue[] = [];

  for (const value of contactValues(contact)) {
    const key = valueKey(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    values.push(value);
  }

  return values;
}

export function planAdoption(state: AdoptionState, contact: NormalizedContact): AdoptionPlan {
  const values = planValues(state.valueKeys, contact);

  const conflict =
    normalizeNameForMatch(state.displayName) !== normalizeNameForMatch(contact.displayName) &&
    !state.conflictValues.has(contact.displayName)
      ? { existingValue: state.displayName, proposedValue: contact.displayName }
      : null;

  const notes = !state.notes && contact.notes ? contact.notes : null;

  return { values, conflict, notes };
}
