import type { NormalizedContact } from '@truecontact/shared';

export interface SkippedRecord {
  index: number;
  reason: string;
}

export interface ParseResult {
  contacts: NormalizedContact[];
  skipped: SkippedRecord[];
}

export interface ParseOptions {
  observedAt: string;
}
