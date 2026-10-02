import type { NormalizedContact } from '@truecontact/shared';
import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import {
  normalizeEmailForMatch,
  normalizeNameForMatch,
  normalizePhoneForMatch,
} from '../domain/matching';
import { parseCsv } from '../domain/parse-csv';
import { parseVCard } from '../domain/parse-vcard';

type Db = DrizzleD1Database<typeof schema>;
type ImportRow = typeof schema.imports.$inferSelect;

interface ImportContext {
  db: Db;
  userId: string;
  importId: string;
  sourceId: string;
  identitiesByName: Map<string, string[]>;
  identityCreatedAt: Map<string, number>;
}

interface ReconcileOutcome {
  action: 'created' | 'linked' | 'proposed';
  conflicts: number;
}

export async function processImport(env: Env, importId: string): Promise<void> {
  const db = drizzle(env.DB, { schema });
  const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));

  if (!job || job.status === 'complete') {
    return;
  }

  await db
    .update(schema.imports)
    .set({ status: 'processing', startedAt: new Date() })
    .where(eq(schema.imports.id, importId));

  try {
    await runImport(env, db, job);
  } catch (error) {
    await db
      .update(schema.imports)
      .set({ status: 'failed', error: errorMessage(error), finishedAt: new Date() })
      .where(eq(schema.imports.id, importId));
  }
}

async function runImport(env: Env, db: Db, job: ImportRow): Promise<void> {
  const raw = job.rawKey ? await env.IMPORTS_BUCKET.get(job.rawKey) : null;
  if (!raw) {
    throw new Error('raw payload is missing');
  }

  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, job.sourceId));
  if (!source) {
    throw new Error('source is missing');
  }

  const observedAt = job.createdAt.toISOString();
  const text = await raw.text();
  const parsed =
    source.kind === 'csv' ? parseCsv(text, { observedAt }) : parseVCard(text, { observedAt });

  const identityRows = await db
    .select({
      id: schema.identities.id,
      displayName: schema.identities.displayName,
      createdAt: schema.identities.createdAt,
    })
    .from(schema.identities)
    .where(eq(schema.identities.userId, job.userId));

  const context: ImportContext = {
    db,
    userId: job.userId,
    importId: job.id,
    sourceId: source.id,
    identitiesByName: new Map(),
    identityCreatedAt: new Map(),
  };

  for (const row of identityRows) {
    addToNameIndex(context, row.id, row.displayName, row.createdAt.getTime());
  }

  let created = 0;
  let linked = 0;
  let proposed = 0;
  let conflicts = 0;

  for (const contact of parsed.contacts) {
    const observationId = await recordObservation(context, contact);
    const outcome = await reconcileContact(context, contact, observationId);

    if (outcome.action === 'created') {
      created += 1;
    } else if (outcome.action === 'linked') {
      linked += 1;
    } else {
      proposed += 1;
    }
    conflicts += outcome.conflicts;
  }

  const stats: schema.ImportStats = {
    contacts: parsed.contacts.length,
    created,
    linked,
    proposed,
    conflicts,
    skipped: parsed.skipped.length,
  };

  const now = new Date();
  await db
    .update(schema.sources)
    .set({ lastObservedAt: job.createdAt, updatedAt: now })
    .where(eq(schema.sources.id, source.id));
  await db
    .update(schema.imports)
    .set({ status: 'complete', stats, finishedAt: now })
    .where(eq(schema.imports.id, job.id));

  if (parsed.contacts.length > 0) {
    await db.insert(schema.usageOperations).values({
      id: crypto.randomUUID(),
      userId: job.userId,
      kind: 'imported_contact',
      quantity: parsed.contacts.length,
      createdAt: now,
    });
  }
}

async function recordObservation(
  context: ImportContext,
  contact: NormalizedContact,
): Promise<string> {
  const { db, userId, importId, sourceId } = context;
  const observationId = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.observations).values({
    id: observationId,
    userId,
    importId,
    sourceId,
    externalId: contact.externalId,
    displayName: contact.displayName,
    normalizedName: normalizeNameForMatch(contact.displayName),
    notes: contact.notes,
    observedAt: new Date(contact.observedAt),
    payload: contact,
    createdAt: now,
  });

  const identifiers = [
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
  ].filter((identifier) => identifier.normalizedValue !== '');

  if (identifiers.length > 0) {
    await db.insert(schema.observationIdentifiers).values(
      identifiers.map((identifier) => ({
        id: crypto.randomUUID(),
        userId,
        observationId,
        ...identifier,
        createdAt: now,
      })),
    );
  }

  return observationId;
}

async function reconcileContact(
  context: ImportContext,
  contact: NormalizedContact,
  observationId: string,
): Promise<ReconcileOutcome> {
  const candidates = await findIdentifierCandidates(context, contact);
  const [best] = candidates;

  if (best) {
    const status = candidates.length === 1 ? ('auto' as const) : ('proposed' as const);
    const confidence = candidates.length === 1 ? 1 : 0.9;

    await insertLink(
      context,
      best.identityId,
      observationId,
      'exact_identifier',
      status,
      confidence,
    );

    if (status === 'auto') {
      const conflicts = await adoptValues(context, best.identityId, contact, observationId);
      await recordEvent(context, best.identityId, 'observed', observationId, {
        sourceId: context.sourceId,
      });
      return { action: 'linked', conflicts };
    }

    return { action: 'proposed', conflicts: 0 };
  }

  const [nameCandidate] =
    context.identitiesByName.get(normalizeNameForMatch(contact.displayName)) ?? [];

  if (nameCandidate) {
    await insertLink(context, nameCandidate, observationId, 'name_similarity', 'proposed', 0.5);
    return { action: 'proposed', conflicts: 0 };
  }

  await createIdentity(context, contact, observationId);
  return { action: 'created', conflicts: 0 };
}

async function findIdentifierCandidates(
  context: ImportContext,
  contact: NormalizedContact,
): Promise<{ identityId: string }[]> {
  const { db, userId } = context;
  const phones = dedupe(
    contact.phones
      .map((phone) => normalizePhoneForMatch(phone.value))
      .filter((value) => value !== ''),
  );
  const emails = dedupe(
    contact.emails
      .map((email) => normalizeEmailForMatch(email.value))
      .filter((value) => value !== ''),
  );

  if (phones.length === 0 && emails.length === 0) {
    return [];
  }

  const conditions: SQL[] = [];
  if (phones.length > 0) {
    const phoneCondition = and(
      eq(schema.identityValues.kind, 'phone'),
      inArray(schema.identityValues.normalizedValue, phones),
    );
    if (phoneCondition) {
      conditions.push(phoneCondition);
    }
  }
  if (emails.length > 0) {
    const emailCondition = and(
      eq(schema.identityValues.kind, 'email'),
      inArray(schema.identityValues.normalizedValue, emails),
    );
    if (emailCondition) {
      conditions.push(emailCondition);
    }
  }

  const matches = await db
    .select({ identityId: schema.identityValues.identityId })
    .from(schema.identityValues)
    .where(and(eq(schema.identityValues.userId, userId), or(...conditions)));

  const counts = new Map<string, number>();
  for (const match of matches) {
    counts.set(match.identityId, (counts.get(match.identityId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([identityId, count]) => ({ identityId, count }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      const aCreated = context.identityCreatedAt.get(a.identityId) ?? Number.MAX_SAFE_INTEGER;
      const bCreated = context.identityCreatedAt.get(b.identityId) ?? Number.MAX_SAFE_INTEGER;
      return aCreated - bCreated;
    });
}

async function createIdentity(
  context: ImportContext,
  contact: NormalizedContact,
  observationId: string,
): Promise<string> {
  const { db, userId } = context;
  const now = new Date();
  const identityId = crypto.randomUUID();

  await db.insert(schema.identities).values({
    id: identityId,
    userId,
    displayName: contact.displayName,
    notes: contact.notes,
    createdAt: now,
    updatedAt: now,
  });

  for (const phone of contact.phones) {
    const normalizedValue = normalizePhoneForMatch(phone.value);
    if (normalizedValue === '') {
      continue;
    }

    await db.insert(schema.identityValues).values({
      id: crypto.randomUUID(),
      userId,
      identityId,
      kind: 'phone',
      value: phone.value,
      normalizedValue,
      label: phone.label,
      firstObservationId: observationId,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const email of contact.emails) {
    const normalizedValue = normalizeEmailForMatch(email.value);
    if (normalizedValue === '') {
      continue;
    }

    await db.insert(schema.identityValues).values({
      id: crypto.randomUUID(),
      userId,
      identityId,
      kind: 'email',
      value: email.value,
      normalizedValue,
      label: email.label,
      firstObservationId: observationId,
      createdAt: now,
      updatedAt: now,
    });
  }

  await insertLink(context, identityId, observationId, 'new_identity', 'auto', 1);
  await recordEvent(context, identityId, 'created', observationId, {
    displayName: contact.displayName,
  });
  addToNameIndex(context, identityId, contact.displayName, now.getTime());

  return identityId;
}

async function adoptValues(
  context: ImportContext,
  identityId: string,
  contact: NormalizedContact,
  observationId: string,
): Promise<number> {
  const { db, userId } = context;
  const now = new Date();
  let conflicts = 0;

  const existing = await db
    .select({
      kind: schema.identityValues.kind,
      normalizedValue: schema.identityValues.normalizedValue,
    })
    .from(schema.identityValues)
    .where(
      and(
        eq(schema.identityValues.userId, userId),
        eq(schema.identityValues.identityId, identityId),
      ),
    );

  const existingKeys = new Set(existing.map((value) => `${value.kind}:${value.normalizedValue}`));

  for (const phone of contact.phones) {
    const normalizedValue = normalizePhoneForMatch(phone.value);
    const key = `phone:${normalizedValue}`;

    if (normalizedValue === '' || existingKeys.has(key)) {
      continue;
    }
    existingKeys.add(key);

    await db.insert(schema.identityValues).values({
      id: crypto.randomUUID(),
      userId,
      identityId,
      kind: 'phone',
      value: phone.value,
      normalizedValue,
      label: phone.label,
      firstObservationId: observationId,
      createdAt: now,
      updatedAt: now,
    });
    await recordEvent(context, identityId, 'value_added', observationId, {
      kind: 'phone',
      value: phone.value,
    });
  }

  for (const email of contact.emails) {
    const normalizedValue = normalizeEmailForMatch(email.value);
    const key = `email:${normalizedValue}`;

    if (normalizedValue === '' || existingKeys.has(key)) {
      continue;
    }
    existingKeys.add(key);

    await db.insert(schema.identityValues).values({
      id: crypto.randomUUID(),
      userId,
      identityId,
      kind: 'email',
      value: email.value,
      normalizedValue,
      label: email.label,
      firstObservationId: observationId,
      createdAt: now,
      updatedAt: now,
    });
    await recordEvent(context, identityId, 'value_added', observationId, {
      kind: 'email',
      value: email.value,
    });
  }

  const [identity] = await db
    .select()
    .from(schema.identities)
    .where(eq(schema.identities.id, identityId));

  if (!identity) {
    return conflicts;
  }

  if (normalizeNameForMatch(identity.displayName) !== normalizeNameForMatch(contact.displayName)) {
    const [existingConflict] = await db
      .select({ id: schema.conflicts.id })
      .from(schema.conflicts)
      .where(
        and(
          eq(schema.conflicts.userId, userId),
          eq(schema.conflicts.identityId, identityId),
          eq(schema.conflicts.status, 'open'),
          eq(schema.conflicts.proposedValue, contact.displayName),
        ),
      );

    if (!existingConflict) {
      await db.insert(schema.conflicts).values({
        id: crypto.randomUUID(),
        userId,
        identityId,
        field: 'display_name',
        existingValue: identity.displayName,
        proposedValue: contact.displayName,
        proposedObservationId: observationId,
        status: 'open',
        createdAt: now,
      });
      await recordEvent(context, identityId, 'conflict_opened', observationId, {
        field: 'display_name',
        proposedValue: contact.displayName,
      });
      conflicts += 1;
    }
  }

  if (!identity.notes && contact.notes) {
    await db
      .update(schema.identities)
      .set({ notes: contact.notes, updatedAt: now })
      .where(eq(schema.identities.id, identityId));
    await recordEvent(context, identityId, 'value_added', observationId, { kind: 'notes' });
  }

  return conflicts;
}

async function insertLink(
  context: ImportContext,
  identityId: string,
  observationId: string,
  method: 'exact_identifier' | 'name_similarity' | 'new_identity',
  status: 'auto' | 'proposed',
  confidence: number,
): Promise<void> {
  const now = new Date();

  await context.db.insert(schema.identityLinks).values({
    id: crypto.randomUUID(),
    userId: context.userId,
    identityId,
    observationId,
    confidence,
    method,
    status,
    createdAt: now,
    updatedAt: now,
  });
}

async function recordEvent(
  context: ImportContext,
  identityId: string,
  type: 'created' | 'observed' | 'value_added' | 'conflict_opened',
  observationId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await context.db.insert(schema.historyEvents).values({
    id: crypto.randomUUID(),
    userId: context.userId,
    identityId,
    type,
    actor: 'system',
    sourceId: context.sourceId,
    importId: context.importId,
    observationId,
    payload,
    createdAt: new Date(),
  });
}

function addToNameIndex(
  context: ImportContext,
  identityId: string,
  displayName: string,
  createdAt: number,
): void {
  const key = normalizeNameForMatch(displayName);

  if (key === '') {
    return;
  }

  const list = context.identitiesByName.get(key) ?? [];
  list.push(identityId);
  context.identitiesByName.set(key, list);
  context.identityCreatedAt.set(identityId, createdAt);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
