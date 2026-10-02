import type { NormalizedContact } from '@truecontact/shared';
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['whatsapp', 'vcard', 'csv'] }).notNull(),
    label: text('label'),
    lastObservedAt: integer('last_observed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('sources_user_id_idx').on(table.userId)],
);

export interface ImportStats {
  contacts?: number;
  created?: number;
  linked?: number;
  proposed?: number;
  conflicts?: number;
  skipped?: number;
}

export const imports = sqliteTable(
  'imports',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'processing', 'complete', 'failed'] })
      .notNull()
      .default('pending'),
    rawKey: text('raw_key'),
    fileName: text('file_name'),
    stats: text('stats', { mode: 'json' }).$type<ImportStats>(),
    error: text('error'),
    cursor: integer('cursor').notNull().default(0),
    total: integer('total').notNull().default(0),
    progressAt: integer('progress_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('imports_user_id_idx').on(table.userId),
    index('imports_source_id_idx').on(table.sourceId),
  ],
);

export const observations = sqliteTable(
  'observations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    importId: text('import_id')
      .notNull()
      .references(() => imports.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    externalId: text('external_id'),
    displayName: text('display_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    notes: text('notes'),
    observedAt: integer('observed_at', { mode: 'timestamp' }).notNull(),
    payload: text('payload', { mode: 'json' }).$type<NormalizedContact>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('observations_user_id_idx').on(table.userId),
    index('observations_import_id_idx').on(table.importId),
    index('observations_normalized_name_idx').on(table.normalizedName),
  ],
);

export const observationIdentifiers = sqliteTable(
  'observation_identifiers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    observationId: text('observation_id')
      .notNull()
      .references(() => observations.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['phone', 'email'] }).notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    label: text('label'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('observation_identifiers_lookup_idx').on(table.userId, table.kind, table.normalizedValue),
    index('observation_identifiers_observation_id_idx').on(table.observationId),
  ],
);

export const identities = sqliteTable(
  'identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    notes: text('notes'),
    mergedIntoId: text('merged_into_id').references((): AnySQLiteColumn => identities.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('identities_user_id_idx').on(table.userId)],
);

export const identityValues = sqliteTable(
  'identity_values',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    identityId: text('identity_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['phone', 'email'] }).notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    label: text('label'),
    firstObservationId: text('first_observation_id').references(() => observations.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('identity_values_lookup_idx').on(table.userId, table.kind, table.normalizedValue),
    index('identity_values_identity_id_idx').on(table.identityId),
  ],
);

export const identityLinks = sqliteTable(
  'identity_links',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    identityId: text('identity_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    observationId: text('observation_id')
      .notNull()
      .references(() => observations.id, { onDelete: 'cascade' }),
    confidence: real('confidence').notNull(),
    method: text('method', {
      enum: ['exact_identifier', 'name_similarity', 'manual', 'new_identity'],
    }).notNull(),
    status: text('status', { enum: ['auto', 'proposed', 'confirmed', 'rejected'] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('identity_links_observation_id_unique').on(table.observationId),
    index('identity_links_identity_id_idx').on(table.identityId),
  ],
);

export const conflicts = sqliteTable(
  'conflicts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    identityId: text('identity_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    field: text('field', { enum: ['display_name', 'phone', 'email', 'notes'] }).notNull(),
    existingValue: text('existing_value'),
    existingValueId: text('existing_value_id').references(() => identityValues.id, {
      onDelete: 'set null',
    }),
    proposedValue: text('proposed_value').notNull(),
    proposedLabel: text('proposed_label'),
    proposedObservationId: text('proposed_observation_id').references(() => observations.id, {
      onDelete: 'cascade',
    }),
    status: text('status', { enum: ['open', 'resolved', 'dismissed'] })
      .notNull()
      .default('open'),
    resolution: text('resolution', { enum: ['keep_existing', 'use_proposed', 'custom'] }),
    resolvedValue: text('resolved_value'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('conflicts_user_id_idx').on(table.userId),
    index('conflicts_identity_id_idx').on(table.identityId),
  ],
);

export const historyEvents = sqliteTable(
  'history_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    identityId: text('identity_id')
      .notNull()
      .references(() => identities.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: [
        'created',
        'observed',
        'value_added',
        'value_changed',
        'value_removed',
        'conflict_opened',
        'conflict_resolved',
        'merged',
        'split',
        'link_confirmed',
        'link_rejected',
      ],
    }).notNull(),
    actor: text('actor', { enum: ['system', 'user'] }).notNull(),
    sourceId: text('source_id').references(() => sources.id, { onDelete: 'set null' }),
    importId: text('import_id').references(() => imports.id, { onDelete: 'set null' }),
    observationId: text('observation_id').references(() => observations.id, {
      onDelete: 'set null',
    }),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('history_events_identity_id_created_at_idx').on(table.identityId, table.createdAt),
  ],
);

export const usageOperations = sqliteTable(
  'usage_operations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['imported_contact', 'export'] }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('usage_operations_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

export const pairingCodes = sqliteTable(
  'pairing_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('pairing_codes_user_id_idx').on(table.userId)],
);

export const extensionTokens = sqliteTable(
  'extension_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    extensionId: text('extension_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [index('extension_tokens_user_id_idx').on(table.userId)],
);
