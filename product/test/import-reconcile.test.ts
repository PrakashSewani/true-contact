import { env } from 'cloudflare:workers';
import type { NormalizedContact } from '@truecontact/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { reconcileSlice } from '../src/imports/reconcile';
import { apiRequest, registerUser, runQueue, upload, vcard } from './helpers';

const db = drizzle(env.DB, { schema });

const NOW = new Date('2026-10-03T00:00:00.000Z');

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

async function explain(query: string, params: unknown[]): Promise<string> {
  const result = await env.DB.prepare(`EXPLAIN QUERY PLAN ${query}`)
    .bind(...params)
    .all();

  return JSON.stringify(result.results);
}

describe('batched slice reconciliation', () => {
  it('reconciles a fresh slice in one write batch within the statement budget', async () => {
    const { userId } = await registerUser();
    const { job } = await seedImport(userId);
    const contacts = Array.from({ length: 60 }, (_, index) => contact(index + 1));

    const first = await reconcileSlice(env, db, {
      job,
      sourceKind: 'whatsapp',
      contacts,
      now: NOW,
    });

    expect(first.created).toBe(60);
    expect(first.skipped).toBe(0);
    expect(first.metrics.statements).toBeLessThanOrEqual(50);
    expect(first.metrics.rowsWritten).toBeLessThanOrEqual(1600);
    expect(first.metrics.rowsRead).toBeLessThanOrEqual(200);

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities).toHaveLength(60);

    const retry = await reconcileSlice(env, db, {
      job,
      sourceKind: 'whatsapp',
      contacts,
      now: NOW,
    });

    expect(retry.skipped).toBe(60);
    expect(retry.metrics.rowsWritten).toBe(0);
    expect(retry.metrics.statements).toBeLessThanOrEqual(3);
  });

  it('re-importing unchanged contacts stays O(T): one refresh per contact', async () => {
    const { userId } = await registerUser();
    const first = await seedImport(userId);
    const contacts = Array.from({ length: 60 }, (_, index) => contact(index + 1));

    await reconcileSlice(env, db, { job: first.job, sourceKind: 'whatsapp', contacts, now: NOW });

    const second = await seedImport(userId);
    const rerun = await reconcileSlice(env, db, {
      job: second.job,
      sourceKind: 'whatsapp',
      contacts,
      now: NOW,
    });

    expect(rerun.unchanged).toBe(60);
    expect(rerun.updated).toBe(0);
    expect(rerun.created).toBe(0);
    expect(rerun.observations).toBe(0);
    expect(rerun.metrics.statements).toBeLessThanOrEqual(10);
    expect(rerun.metrics.rowsRead).toBeLessThanOrEqual(600);
    expect(rerun.metrics.rowsWritten).toBeLessThanOrEqual(120);

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities).toHaveLength(60);

    const observations = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.userId, userId));
    expect(observations).toHaveLength(60);
  });

  it('proposes name matches for identities whose normalized name was never stored', async () => {
    const { userId } = await registerUser();
    const identityId = crypto.randomUUID();

    await db.insert(schema.identities).values({
      id: identityId,
      userId,
      displayName: 'Rahul Sharma',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { job } = await seedImport(userId);
    const outcome = await reconcileSlice(env, db, {
      job,
      sourceKind: 'whatsapp',
      contacts: [
        {
          externalId: 'wa-900',
          displayName: 'RAHUL SHARMA',
          phones: [],
          emails: [],
          observedAt: NOW.toISOString(),
        },
      ],
      now: NOW,
    });

    expect(outcome.proposed).toBe(1);

    const [link] = await db
      .select()
      .from(schema.identityLinks)
      .where(eq(schema.identityLinks.userId, userId));
    expect(link?.method).toBe('name_similarity');
    expect(link?.identityId).toBe(identityId);

    const [stored] = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.id, identityId));
    expect(stored?.normalizedName).toBe('rahul sharma');
  });

  it('no longer writes the observation_identifiers projection', async () => {
    const { cookie, userId } = await registerUser();
    const importId = await upload(
      cookie,
      'contacts.vcf',
      `${vcard('Ada Lovelace', '+44 20 7946 0958')}\r\n${vcard('Grace Hopper', '+1 202 555 0147')}`,
    );

    await runQueue(importId);

    const identifiers = await db
      .select()
      .from(schema.observationIdentifiers)
      .where(eq(schema.observationIdentifiers.userId, userId));
    expect(identifiers).toHaveLength(0);

    const observations = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.userId, userId));
    expect(observations).toHaveLength(2);
  });

  it('keeps normalized_name in step when a contact is renamed', async () => {
    const { cookie, userId } = await registerUser();
    const importId = await upload(cookie, 'rename.vcf', vcard('Old Name', '+1 555 0900'));

    await runQueue(importId);

    const [identity] = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));

    const response = await apiRequest(`/api/contacts/${identity?.id}`, {
      cookie,
      method: 'PATCH',
      body: { displayName: 'New Name' },
    });
    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.id, identity?.id ?? ''));
    expect(updated?.normalizedName).toBe('new name');
  });

  it('candidate queries use the tenant-scoped indexes', async () => {
    const plans = await Promise.all([
      explain(
        "SELECT identity_id, normalized_value FROM identity_values WHERE user_id = ? AND kind = 'phone' AND normalized_value IN (?, ?)",
        ['u1', 'p1', 'p2'],
      ),
      explain(
        'SELECT external_id FROM observations WHERE user_id = ? AND import_id = ? AND external_id IN (?)',
        ['u1', 'i1', 'e1'],
      ),
      explain(
        'SELECT id, normalized_name FROM identities WHERE user_id = ? AND normalized_name IN (?) AND merged_into_id IS NULL',
        ['u1', 'name'],
      ),
      explain(
        'SELECT id FROM observations WHERE user_id = ? AND record_key IN (?) ORDER BY created_at DESC',
        ['u1', 'key'],
      ),
    ]);

    expect(plans[0]).toContain('identity_values_lookup_idx');
    expect(plans[1]).toContain('observations_import_external_idx');
    expect(plans[2]).toContain('identities_normalized_name_idx');
    expect(plans[3]).toContain('observations_record_key_idx');
  });
});
