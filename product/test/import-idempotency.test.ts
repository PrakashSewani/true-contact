import { env } from 'cloudflare:workers';
import type { NormalizedContact } from '@truecontact/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { reconcileSlice } from '../src/imports/reconcile';
import { registerUser, runQueue, upload, vcard } from './helpers';

const db = drizzle(env.DB, { schema });

const NOW = new Date('2026-10-03T00:00:00.000Z');
const LATER = new Date('2026-10-04T12:00:00.000Z');

async function seedImport(userId: string): Promise<{ job: typeof schema.imports.$inferSelect }> {
  const sourceId = crypto.randomUUID();
  const importId = crypto.randomUUID();

  await db.insert(schema.sources).values({
    id: sourceId,
    userId,
    kind: 'whatsapp',
    label: 'test',
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(schema.imports).values({
    id: importId,
    userId,
    sourceId,
    status: 'processing',
    createdAt: NOW,
  });

  const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));

  if (!job) {
    throw new Error('seeded import is missing');
  }

  return { job };
}

function contact(index: number): NormalizedContact {
  return {
    externalId: `wa-${index}`,
    displayName: `Person ${String(index).padStart(3, '0')}`,
    phones: [{ value: `+91 90000 ${String(index).padStart(5, '0')}` }],
    emails: [],
    observedAt: NOW.toISOString(),
  };
}

describe('source-record idempotency', () => {
  it('refreshes observedAt for an unchanged re-import without new rows', async () => {
    const { userId } = await registerUser();
    const first = await seedImport(userId);
    const contacts = [contact(1), contact(2)];

    const firstOutcome = await reconcileSlice(env, db, {
      job: first.job,
      sourceKind: 'whatsapp',
      contacts,
      now: NOW,
    });
    expect(firstOutcome.created).toBe(2);

    const before = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.userId, userId));
    expect(before).toHaveLength(2);

    const second = await seedImport(userId);
    const rerun = await reconcileSlice(env, db, {
      job: second.job,
      sourceKind: 'whatsapp',
      contacts: contacts.map((item) => ({ ...item, observedAt: LATER.toISOString() })),
      now: LATER,
    });

    expect(rerun.unchanged).toBe(2);
    expect(rerun.observations).toBe(0);
    expect(rerun.values).toBe(0);
    expect(rerun.events).toBe(0);
    expect(rerun.created).toBe(0);

    const after = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.userId, userId));
    expect(after).toHaveLength(2);
    expect(new Set(after.map((row) => row.id))).toEqual(new Set(before.map((row) => row.id)));
    expect(after.every((row) => row.observedAt.getTime() === LATER.getTime())).toBe(true);

    const links = await db
      .select()
      .from(schema.identityLinks)
      .where(eq(schema.identityLinks.userId, userId));
    expect(links).toHaveLength(2);

    const events = await db
      .select()
      .from(schema.historyEvents)
      .where(eq(schema.historyEvents.userId, userId));
    expect(events).toHaveLength(4);
  });

  it('appends a changed source record and links it to the same identity', async () => {
    const { userId } = await registerUser();
    const first = await seedImport(userId);

    await reconcileSlice(env, db, {
      job: first.job,
      sourceKind: 'whatsapp',
      contacts: [contact(7)],
      now: NOW,
    });

    const second = await seedImport(userId);
    const changed: NormalizedContact = {
      ...contact(7),
      phones: [{ value: '+91 90000 00888' }],
    };
    const outcome = await reconcileSlice(env, db, {
      job: second.job,
      sourceKind: 'whatsapp',
      contacts: [changed],
      now: LATER,
    });

    expect(outcome.updated).toBe(1);
    expect(outcome.created).toBe(0);
    expect(outcome.proposed).toBe(0);
    expect(outcome.observations).toBe(1);
    expect(outcome.values).toBe(1);

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities).toHaveLength(1);

    const observations = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.userId, userId));
    expect(observations).toHaveLength(2);

    const links = await db
      .select()
      .from(schema.identityLinks)
      .where(eq(schema.identityLinks.userId, userId));
    expect(links).toHaveLength(2);

    const sourceLink = links.find((link) => link.method === 'source_record');
    expect(sourceLink?.identityId).toBe(identities[0]?.id);
    expect(sourceLink?.status).toBe('auto');

    const values = await db
      .select()
      .from(schema.identityValues)
      .where(eq(schema.identityValues.userId, userId));
    expect(values.map((value) => value.normalizedValue).sort()).toEqual([
      '919000000007',
      '919000000888',
    ]);
  });

  it('never collapses name-only records without identifiers', async () => {
    const { userId } = await registerUser();
    const first = await seedImport(userId);
    const nameOnly: NormalizedContact = {
      displayName: 'Dad',
      phones: [],
      emails: [],
      observedAt: NOW.toISOString(),
    };

    const firstOutcome = await reconcileSlice(env, db, {
      job: first.job,
      sourceKind: 'csv',
      contacts: [nameOnly],
      now: NOW,
    });
    expect(firstOutcome.created).toBe(1);

    const second = await seedImport(userId);
    const outcome = await reconcileSlice(env, db, {
      job: second.job,
      sourceKind: 'csv',
      contacts: [nameOnly],
      now: LATER,
    });

    expect(outcome.unchanged).toBe(0);
    expect(outcome.observations).toBe(1);
    expect(outcome.proposed).toBe(1);

    const observations = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.userId, userId));
    expect(observations).toHaveLength(2);

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities).toHaveLength(1);
  });

  it('fingerprints identical identifier-bearing records without external ids', async () => {
    const { userId } = await registerUser();
    const first = await seedImport(userId);
    const record: NormalizedContact = {
      displayName: 'CSV Person',
      phones: [{ value: '+1 555 0111' }],
      emails: [],
      observedAt: NOW.toISOString(),
    };

    expect(
      (
        await reconcileSlice(env, db, {
          job: first.job,
          sourceKind: 'csv',
          contacts: [record],
          now: NOW,
        })
      ).created,
    ).toBe(1);

    const second = await seedImport(userId);
    const outcome = await reconcileSlice(env, db, {
      job: second.job,
      sourceKind: 'csv',
      contacts: [record],
      now: LATER,
    });

    expect(outcome.unchanged).toBe(1);
    expect(outcome.observations).toBe(0);

    const observations = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.userId, userId));
    expect(observations).toHaveLength(1);
  });

  it('compares a legacy payload once and stores its hash from then on', async () => {
    const { userId } = await registerUser();
    const first = await seedImport(userId);
    const identityId = crypto.randomUUID();
    const observationId = crypto.randomUUID();
    const legacy: NormalizedContact = {
      externalId: 'legacy-1',
      displayName: 'Legacy Person',
      phones: [{ value: '+91 91111 11111' }],
      emails: [],
      observedAt: NOW.toISOString(),
    };

    await db.insert(schema.identities).values({
      id: identityId,
      userId,
      displayName: 'Legacy Person',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(schema.observations).values({
      id: observationId,
      userId,
      importId: first.job.id,
      sourceId: first.job.sourceId,
      externalId: 'legacy-1',
      recordKey: 'whatsapp:x:legacy-1',
      contentHash: null,
      displayName: legacy.displayName,
      normalizedName: 'legacy person',
      observedAt: NOW,
      payload: legacy,
      createdAt: NOW,
    });
    await db.insert(schema.identityLinks).values({
      id: crypto.randomUUID(),
      userId,
      identityId,
      observationId,
      confidence: 1,
      method: 'new_identity',
      status: 'auto',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const second = await seedImport(userId);
    const outcome = await reconcileSlice(env, db, {
      job: second.job,
      sourceKind: 'whatsapp',
      contacts: [{ ...legacy, observedAt: LATER.toISOString() }],
      now: LATER,
    });

    expect(outcome.unchanged).toBe(1);
    expect(outcome.observations).toBe(0);

    const [stored] = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.id, observationId));
    expect(stored?.contentHash).not.toBeNull();
    expect(stored?.observedAt.getTime()).toBe(LATER.getTime());
  });

  it('records counters in the import stats and reports unchanged re-imports', async () => {
    const { cookie } = await registerUser();
    const content = vcard('Counter Person', '+1 555 0123', 'counter@example.com');

    const firstId = await upload(cookie, 'counter.vcf', content);
    await runQueue(firstId);

    const [first] = await db.select().from(schema.imports).where(eq(schema.imports.id, firstId));
    expect(first?.stats?.contacts).toBe(1);
    expect(first?.stats?.slices).toBe(1);
    expect(first?.stats?.observations).toBe(1);
    expect(first?.stats?.unchanged).toBe(0);
    expect(first?.stats?.updated).toBe(0);
    expect(first?.stats?.rowsWritten).toBeGreaterThan(0);
    expect(typeof first?.stats?.durationMs).toBe('number');

    const secondId = await upload(cookie, 'counter-2.vcf', content);
    await runQueue(secondId);

    const [second] = await db.select().from(schema.imports).where(eq(schema.imports.id, secondId));
    expect(second?.stats?.unchanged).toBe(1);
    expect(second?.stats?.updated).toBe(0);
    expect(second?.stats?.observations).toBe(0);
    expect(second?.stats?.values).toBe(0);
  });
});
