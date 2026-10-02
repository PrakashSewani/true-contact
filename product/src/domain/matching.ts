export function normalizePhoneForMatch(value: string): string {
  return value.replace(/\D+/g, '');
}

export function normalizeEmailForMatch(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
