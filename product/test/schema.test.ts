import { env } from 'cloudflare:workers';
import type { NormalizedContact } from '@truecontact/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';

const db = drizzle(env.DB, { schema });

const AT = new Date('2026-10-02T00:00:00.000Z');

interface SeededGraph {
  userId: string;
  sourceId: string;
  importId: string;
  observationId: string;
  identityId: string;
}

async function seedGraph(): Promise<SeededGraph> {
  const userId = crypto.randomUUID();
  const ids: SeededGraph = {
    userId,
    sourceId: crypto.randomUUID(),
    importId: crypto.randomUUID(),
    observationId: crypto.randomUUID(),
    identityId: crypto.randomUUID(),
  };

  const payload: NormalizedContact = {
    externalId: 'vcard-1',
    displayName: 'Rahul Sharma',
    phones: [{ value: '+91 98765 43210' }],
    emails: [{ value: 'rahul@example.com' }],
    notes: 'met at conference',
    observedAt: AT.toISOString(),
  };

  await db.insert(schema.user).values({
    id: userId,
    name: 'Roundtrip User',
    email: `${userId}@example.com`,
    emailVerified: false,
    createdAt: AT,
    updatedAt: AT,
  });

  await db.insert(schema.sources).values({
    id: ids.sourceId,
    userId,
    kind: 'vcard',
    label: 'contacts.vcf',
    lastObservedAt: AT,
    createdAt: AT,
    updatedAt: AT,
  });

  await db.insert(schema.imports).values({
    id: ids.importId,
    userId,
    sourceId: ids.sourceId,
    status: 'complete',
    rawKey: `imports/${ids.importId}.vcf`,
    fileName: 'contacts.vcf',
    stats: { contacts: 1, created: 1, linked: 0, conflicts: 0 },
    createdAt: AT,
    startedAt: AT,
    finishedAt: AT,
  });

  await db.insert(schema.observations).values({
    id: ids.observationId,
    userId,
    importId: ids.importId,
    sourceId: ids.sourceId,
    externalId: 'vcard-1',
    displayName: payload.displayName,
    normalizedName: 'rahul sharma',
    notes: payload.notes,
    observedAt: AT,
    payload,
    createdAt: AT,
  });

  await db.insert(schema.observationIdentifiers).values([
    {
      id: crypto.randomUUID(),
      userId,
      observationId: ids.observationId,
      kind: 'phone',
      value: '+91 98765 43210',
      normalizedValue: '919876543210',
      createdAt: AT,
    },
    {
      id: crypto.randomUUID(),
      userId,
      observationId: ids.observationId,
      kind: 'email',
      value: 'rahul@example.com',
      normalizedValue: 'rahul@example.com',
      createdAt: AT,
    },
  ]);

  await db.insert(schema.identities).values({
    id: ids.identityId,
    userId,
    displayName: payload.displayName,
    notes: payload.notes,
    createdAt: AT,
    updatedAt: AT,
  });

  await db.insert(schema.identityValues).values({
    id: crypto.randomUUID(),
    userId,
    identityId: ids.identityId,
    kind: 'phone',
    value: '+91 98765 43210',
    normalizedValue: '919876543210',
    firstObservationId: ids.observationId,
    createdAt: AT,
    updatedAt: AT,
  });

  await db.insert(schema.identityLinks).values({
    id: crypto.randomUUID(),
    userId,
    identityId: ids.identityId,
    observationId: ids.observationId,
    confidence: 1,
    method: 'new_identity',
    status: 'auto',
    createdAt: AT,
    updatedAt: AT,
  });

  await db.insert(schema.conflicts).values({
    id: crypto.randomUUID(),
    userId,
    identityId: ids.identityId,
    field: 'display_name',
    existingValue: payload.displayName,
    proposedValue: 'Rahul S.',
    proposedObservationId: ids.observationId,
    createdAt: AT,
  });

  await db.insert(schema.historyEvents).values({
    id: crypto.randomUUID(),
    userId,
    identityId: ids.identityId,
    type: 'created',
    actor: 'system',
    sourceId: ids.sourceId,
    importId: ids.importId,
    observationId: ids.observationId,
    payload: { displayName: payload.displayName },
    createdAt: AT,
  });

  await db.insert(schema.usageOperations).values({
    id: crypto.randomUUID(),
    userId,
    kind: 'imported_contact',
    createdAt: AT,
  });

  return ids;
}

describe('contact graph schema', () => {
  it('round-trips a full graph through D1', async () => {
    const ids = await seedGraph();

    const [identity] = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.id, ids.identityId));
    expect(identity?.displayName).toBe('Rahul Sharma');
    expect(identity?.mergedIntoId).toBeNull();

    const [observation] = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.id, ids.observationId));
    expect(observation?.observedAt).toEqual(AT);
    expect(observation?.payload.displayName).toBe('Rahul Sharma');
    expect(observation?.payload.phones).toEqual([{ value: '+91 98765 43210' }]);

    const identifiers = await db
      .select()
      .from(schema.observationIdentifiers)
      .where(eq(schema.observationIdentifiers.observationId, ids.observationId));
    expect(identifiers.map((row) => row.kind).sort()).toEqual(['email', 'phone']);

    const [link] = await db
      .select()
      .from(schema.identityLinks)
      .where(eq(schema.identityLinks.observationId, ids.observationId));
    expect(link?.identityId).toBe(ids.identityId);
    expect(link?.method).toBe('new_identity');
    expect(link?.status).toBe('auto');

    const [storedImport] = await db
      .select()
      .from(schema.imports)
      .where(eq(schema.imports.id, ids.importId));
    expect(storedImport?.status).toBe('complete');
    expect(storedImport?.stats).toEqual({ contacts: 1, created: 1, linked: 0, conflicts: 0 });

    const [conflict] = await db
      .select()
      .from(schema.conflicts)
      .where(eq(schema.conflicts.identityId, ids.identityId));
    expect(conflict?.status).toBe('open');
    expect(conflict?.resolution).toBeNull();
    expect(conflict?.proposedObservationId).toBe(ids.observationId);

    const events = await db
      .select()
      .from(schema.historyEvents)
      .where(eq(schema.historyEvents.identityId, ids.identityId));
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('created');

    const [usage] = await db
      .select()
      .from(schema.usageOperations)
      .where(eq(schema.usageOperations.userId, ids.userId));
    expect(usage?.kind).toBe('imported_contact');
    expect(usage?.quantity).toBe(1);
  });

  it('allows at most one identity per observation', async () => {
    const ids = await seedGraph();
    const otherIdentityId = crypto.randomUUID();

    await db.insert(schema.identities).values({
      id: otherIdentityId,
      userId: ids.userId,
      displayName: 'Rahul S.',
      createdAt: AT,
      updatedAt: AT,
    });

    await expect(
      db.insert(schema.identityLinks).values({
        id: crypto.randomUUID(),
        userId: ids.userId,
        identityId: otherIdentityId,
        observationId: ids.observationId,
        confidence: 0.7,
        method: 'name_similarity',
        status: 'proposed',
        createdAt: AT,
        updatedAt: AT,
      }),
    ).rejects.toThrow();
  });

  it('cascades every graph row when the user is deleted', async () => {
    const { userId } = await seedGraph();

    await db.delete(schema.user).where(eq(schema.user.id, userId));

    const counts = await Promise.all([
      db.$count(schema.sources, eq(schema.sources.userId, userId)),
      db.$count(schema.imports, eq(schema.imports.userId, userId)),
      db.$count(schema.observations, eq(schema.observations.userId, userId)),
      db.$count(schema.observationIdentifiers, eq(schema.observationIdentifiers.userId, userId)),
      db.$count(schema.identities, eq(schema.identities.userId, userId)),
      db.$count(schema.identityValues, eq(schema.identityValues.userId, userId)),
      db.$count(schema.identityLinks, eq(schema.identityLinks.userId, userId)),
      db.$count(schema.conflicts, eq(schema.conflicts.userId, userId)),
      db.$count(schema.historyEvents, eq(schema.historyEvents.userId, userId)),
      db.$count(schema.usageOperations, eq(schema.usageOperations.userId, userId)),
    ]);

    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
