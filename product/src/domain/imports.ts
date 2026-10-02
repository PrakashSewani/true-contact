export const MAX_IMPORT_LENGTH = 5_000_000;

export type ImportKind = 'vcard' | 'csv';

export function detectImportKind(fileName: string, content: string): ImportKind | undefined {
  const name = fileName.toLowerCase();

  if (name.endsWith('.vcf') || name.endsWith('.vcard')) {
    return 'vcard';
  }
  if (name.endsWith('.csv')) {
    return 'csv';
  }
  if (/BEGIN:VCARD/i.test(content)) {
    return 'vcard';
  }
  if (/[;,\t]/.test(content)) {
    return 'csv';
  }
  return undefined;
}

export function rawImportKey(userId: string, importId: string): string {
  return `imports/${userId}/${importId}`;
}
