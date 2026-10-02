import { z } from 'zod';

/**
 * Source kinds the platform understands. A source adapter produces normalized
 * contacts tagged with the kind it came from; the core domain never branches on
 * a concrete provider beyond this tag.
 */
export const SOURCE_KINDS = ['whatsapp', 'vcard', 'csv'] as const;

export const sourceKindSchema = z.enum(SOURCE_KINDS);

export type SourceKind = z.infer<typeof sourceKindSchema>;

export const normalizedPhoneSchema = z.object({
  value: z.string().min(1),
  label: z.string().optional(),
});

export type NormalizedPhone = z.infer<typeof normalizedPhoneSchema>;

export const normalizedEmailSchema = z.object({
  value: z.string(),
  label: z.string().optional(),
});

export type NormalizedEmail = z.infer<typeof normalizedEmailSchema>;

/**
 * The normalized shape every source adapter must produce. Deliberately
 * source-agnostic: no WhatsApp-, phone-, or provider-specific fields.
 */
export const normalizedContactSchema = z.object({
  /** Stable identifier of the record inside its source, when the source has one. */
  externalId: z.string().optional(),
  displayName: z.string().min(1),
  phones: z.array(normalizedPhoneSchema).default([]),
  emails: z.array(normalizedEmailSchema).default([]),
  notes: z.string().optional(),
  /** When the source last represented this record (ISO 8601). */
  observedAt: z.iso.datetime(),
});

export type NormalizedContact = z.infer<typeof normalizedContactSchema>;

/**
 * A batch of normalized contacts pushed by an adapter (extension or file importer).
 */
export const importBatchSchema = z.object({
  source: sourceKindSchema,
  contacts: z.array(normalizedContactSchema).min(1).max(1000),
});

export type ImportBatch = z.infer<typeof importBatchSchema>;
