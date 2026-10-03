import type { NormalizedContact } from '@truecontact/shared';
import { and, eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { normalizeNameForMatch } from '../domain/matching';
import { type AdoptionState, planAdoption, planValues, valueKey } from '../domain/reconcile';

export type Db = DrizzleD1Database<typeof schema>;

export type HistoryType = (typeof schema.historyEvents.$inferInsert)['type'];

export interface EventContext {
  userId: string;
  actor: 'system' | 'user';
  sourceId?: string | null;
  importId?: string | null;
}

export async function recordEvent(
  db: Db,
  context: EventContext,
  identityId: string,
  type: HistoryType,
  observationId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.historyEvents).values({
    id: crypto.randomUUID(),
    userId: context.userId,
    identityId,
    type,
    actor: context.actor,
    sourceId: context.sourceId ?? null,
    importId: context.importId ?? null,
    observationId,
    payload,
    createdAt: new Date(),
  });
}

async function existingValueKeys(db: Db, userId: string, identityId: string): Promise<Set<string>> {
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

  return new Set(existing.map((value) => valueKey(value)));
}

export interface SeedParams {
  userId: string;
  identityId: string;
  contacts: NormalizedContact[];
  observationIds: (string | null)[];
  actor: 'system' | 'user';
  sourceId?: string | null;
  importId?: string | null;
}

export async function seedValues(db: Db, params: SeedParams): Promise<void> {
  const now = new Date();
  const keys = await existingValueKeys(db, params.userId, params.identityId);
  const context: EventContext = {
    userId: params.userId,
    actor: params.actor,
    sourceId: params.sourceId,
    importId: params.importId,
  };

  for (const [index, contact] of params.contacts.entries()) {
    const observationId = params.observationIds[index] ?? null;

    for (const row of planValues(keys, contact)) {
      keys.add(valueKey(row));

      await db.insert(schema.identityValues).values({
        id: crypto.randomUUID(),
        userId: params.userId,
        identityId: params.identityId,
        kind: row.kind,
        value: row.value,
        normalizedValue: row.normalizedValue,
        label: row.label,
        firstObservationId: observationId,
        createdAt: now,
        updatedAt: now,
      });
      await recordEvent(db, context, params.identityId, 'value_added', observationId, {
        kind: row.kind,
        value: row.value,
      });
    }
  }
}

export interface AdoptParams {
  userId: string;
  identityId: string;
  contact: NormalizedContact;
  observationId: string;
  actor: 'system' | 'user';
  sourceId?: string | null;
  importId?: string | null;
}

export async function adoptValues(db: Db, params: AdoptParams): Promise<number> {
  const [identity] = await db
    .select()
    .from(schema.identities)
    .where(eq(schema.identities.id, params.identityId));

  if (!identity) {
    return 0;
  }

  const now = new Date();
  const state: AdoptionState = {
    displayName: identity.displayName,
    notes: identity.notes,
    valueKeys: await existingValueKeys(db, params.userId, params.identityId),
    conflictValues: new Set(),
  };
  const plan = planAdoption(state, params.contact);
  const context: EventContext = {
    userId: params.userId,
    actor: params.actor,
    sourceId: params.sourceId,
    importId: params.importId,
  };

  for (const row of plan.values) {
    await db.insert(schema.identityValues).values({
      id: crypto.randomUUID(),
      userId: params.userId,
      identityId: params.identityId,
      kind: row.kind,
      value: row.value,
      normalizedValue: row.normalizedValue,
      label: row.label,
      firstObservationId: params.observationId,
      createdAt: now,
      updatedAt: now,
    });
    await recordEvent(db, context, params.identityId, 'value_added', params.observationId, {
      kind: row.kind,
      value: row.value,
    });
  }

  let conflicts = 0;

  if (plan.conflict) {
    const [existingConflict] = await db
      .select({ id: schema.conflicts.id })
      .from(schema.conflicts)
      .where(
        and(
          eq(schema.conflicts.userId, params.userId),
          eq(schema.conflicts.identityId, params.identityId),
          eq(schema.conflicts.status, 'open'),
          eq(schema.conflicts.proposedValue, plan.conflict.proposedValue),
        ),
      );

    if (!existingConflict) {
      await db.insert(schema.conflicts).values({
        id: crypto.randomUUID(),
        userId: params.userId,
        identityId: params.identityId,
        field: 'display_name',
        existingValue: identity.displayName,
        proposedValue: plan.conflict.proposedValue,
        proposedObservationId: params.observationId,
        status: 'open',
        createdAt: now,
      });
      await recordEvent(db, context, params.identityId, 'conflict_opened', params.observationId, {
        field: 'display_name',
        proposedValue: plan.conflict.proposedValue,
      });
      conflicts += 1;
    }
  }

  if (plan.notes) {
    await db
      .update(schema.identities)
      .set({ notes: plan.notes, updatedAt: now })
      .where(eq(schema.identities.id, params.identityId));
    await recordEvent(db, context, params.identityId, 'value_added', params.observationId, {
      kind: 'notes',
    });
  }

  return conflicts;
}

export interface CreateIdentityParams {
  userId: string;
  contact: NormalizedContact;
  observationId: string;
  actor: 'system' | 'user';
  sourceId?: string | null;
  importId?: string | null;
  displayName?: string;
  notes?: string | null;
}

export async function createIdentityFromObservation(
  db: Db,
  params: CreateIdentityParams,
): Promise<string> {
  const now = new Date();
  const identityId = crypto.randomUUID();
  const displayName = params.displayName ?? params.contact.displayName;

  await db.insert(schema.identities).values({
    id: identityId,
    userId: params.userId,
    displayName,
    normalizedName: normalizeNameForMatch(displayName),
    notes: params.notes ?? params.contact.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await seedValues(db, {
    userId: params.userId,
    identityId,
    contacts: [params.contact],
    observationIds: [params.observationId],
    actor: params.actor,
    sourceId: params.sourceId,
    importId: params.importId,
  });

  await recordEvent(
    db,
    {
      userId: params.userId,
      actor: params.actor,
      sourceId: params.sourceId,
      importId: params.importId,
    },
    identityId,
    'created',
    params.observationId,
    { displayName },
  );

  return identityId;
}
