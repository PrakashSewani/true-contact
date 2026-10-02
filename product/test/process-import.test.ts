import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { registerUser, runQueue, upload, vcard } from './helpers';

const db = drizzle(env.DB, { schema });

describe('import processing', () => {
  it('processes a fresh vCard import into new identities', async () => {
    const { cookie, userId } = await registerUser();
    const importId = await upload(
      cookie,
      'contacts.vcf',
      `${vcard('Rahul Sharma', '+91 98765 43210')}\r\n${vcard('Jane Doe', '+1 555 0100', 'jane@example.com')}`,
    );

    await runQueue(importId);

    const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));
    expect(job?.status).toBe('complete');
    expect(job?.stats).toMatchObject({
      contacts: 2,
      created: 2,
      linked: 0,
      proposed: 0,
      conflicts: 0,
      skipped: 0,
    });

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities.map((row) => row.displayName).sort()).toEqual(['Jane Doe', 'Rahul Sharma']);

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
    expect(links.every((link) => link.status === 'auto' && link.method === 'new_identity')).toBe(
      true,
    );

    const values = await db
      .select()
      .from(schema.identityValues)
      .where(eq(schema.identityValues.userId, userId));
    expect(values.filter((value) => value.kind === 'phone')).toHaveLength(2);
    expect(values.filter((value) => value.kind === 'email')).toHaveLength(1);

    const events = await db
      .select()
      .from(schema.historyEvents)
      .where(eq(schema.historyEvents.userId, userId));
    expect(events.filter((event) => event.type === 'created')).toHaveLength(2);

    const usage = await db
      .select()
      .from(schema.usageOperations)
      .where(eq(schema.usageOperations.userId, userId));
    expect(usage).toHaveLength(1);
    expect(usage[0]?.quantity).toBe(2);
  });

  it('auto-links an exact identifier, adopts new values, and opens a name conflict', async () => {
    const { cookie, userId } = await registerUser();
    await runQueue(await upload(cookie, 'first.vcf', vcard('Rahul Sharma', '+91 98765 43210')));

    const secondId = await upload(
      cookie,
      'second.vcf',
      vcard('Rahul S.', '+91 98765 43210', 'rahul@example.com'),
    );
    await runQueue(secondId);

    const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, secondId));
    expect(job?.stats).toMatchObject({ contacts: 1, created: 0, linked: 1, conflicts: 1 });

    const [identity] = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identity?.displayName).toBe('Rahul Sharma');

    const values = await db
      .select()
      .from(schema.identityValues)
      .where(eq(schema.identityValues.userId, userId));
    expect(values.map((value) => `${value.kind}:${value.normalizedValue}`).sort()).toEqual([
      'email:rahul@example.com',
      'phone:919876543210',
    ]);

    const conflicts = await db
      .select()
      .from(schema.conflicts)
      .where(eq(schema.conflicts.userId, userId));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      field: 'display_name',
      existingValue: 'Rahul Sharma',
      proposedValue: 'Rahul S.',
      status: 'open',
    });
  });

  it('proposes a link for a name-only match without adopting values', async () => {
    const { cookie, userId } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Jane Doe', '+1 555 0100')));

    const secondId = await upload(cookie, 'two.vcf', vcard('Jane Doe', '+1 555 0200'));
    await runQueue(secondId);

    const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, secondId));
    expect(job?.stats).toMatchObject({ proposed: 1, created: 0, linked: 0 });

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities).toHaveLength(1);

    const links = await db
      .select()
      .from(schema.identityLinks)
      .where(eq(schema.identityLinks.userId, userId));
    const proposed = links.find((link) => link.status === 'proposed');
    expect(proposed?.method).toBe('name_similarity');
    expect(proposed?.confidence).toBe(0.5);
    expect(proposed?.identityId).toBe(identities[0]?.id);

    const values = await db
      .select()
      .from(schema.identityValues)
      .where(eq(schema.identityValues.userId, userId));
    expect(values.map((value) => value.normalizedValue)).toEqual(['15550100']);
  });

  it('proposes rather than auto-links when several identities match an identifier', async () => {
    const { cookie, userId } = await registerUser();
    await runQueue(await upload(cookie, 'first.vcf', vcard('Alice One', '+1 555 0300')));

    const now = new Date();
    const duplicateId = crypto.randomUUID();
    await db.insert(schema.identities).values({
      id: duplicateId,
      userId,
      displayName: 'Alice Duplicate',
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.identityValues).values({
      id: crypto.randomUUID(),
      userId,
      identityId: duplicateId,
      kind: 'phone',
      value: '+1 555 0300',
      normalizedValue: '15550300',
      createdAt: now,
      updatedAt: now,
    });

    const thirdId = await upload(cookie, 'third.vcf', vcard('Alice New', '+1 555 0300'));
    await runQueue(thirdId);

    const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, thirdId));
    expect(job?.stats).toMatchObject({ proposed: 1, linked: 0, created: 0, conflicts: 0 });

    const links = await db
      .select()
      .from(schema.identityLinks)
      .where(eq(schema.identityLinks.userId, userId));
    const ambiguous = links.find((link) => link.confidence === 0.9);
    expect(ambiguous?.status).toBe('proposed');

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    const oldest = identities.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    expect(ambiguous?.identityId).toBe(oldest?.id);
  });

  it('processes CSV uploads through the same pipeline', async () => {
    const { cookie, userId } = await registerUser();
    const importId = await upload(cookie, 'contacts.csv', 'Name,Mobile\nCSV Person,+1 555 0500\n');

    await runQueue(importId);

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities.map((row) => row.displayName)).toEqual(['CSV Person']);
  });

  it('processes in slices and skips already-processed contacts when a slice is retried', async () => {
    const { cookie, userId } = await registerUser();
    const importId = await upload(
      cookie,
      'chunked.vcf',
      [
        vcard('A One', '+1 555 1001'),
        vcard('B Two', '+1 555 1002'),
        vcard('C Three', '+1 555 1003'),
      ].join('\r\n'),
    );

    await runQueue(importId, { chunkSize: 1 });

    const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));
    expect(job?.status).toBe('complete');
    expect(job?.cursor).toBe(3);
    expect(job?.total).toBe(3);
    expect(job?.stats).toMatchObject({ contacts: 3, created: 3, skipped: 0 });

    // Simulate a killed run being redelivered: rewind and re-run from cursor 0.
    // Existing observations must be skipped and usage must not double-count.
    await db
      .update(schema.imports)
      .set({ status: 'processing', cursor: 0 })
      .where(eq(schema.imports.id, importId));

    await runQueue(importId, { chunkSize: 1 });

    const observations = await db
      .select()
      .from(schema.observations)
      .where(eq(schema.observations.importId, importId));
    expect(observations).toHaveLength(3);

    const usage = await db
      .select()
      .from(schema.usageOperations)
      .where(eq(schema.usageOperations.userId, userId));
    expect(usage).toHaveLength(1);
    expect(usage[0]?.quantity).toBe(3);
  });

  it('marks an import failed when the raw payload is missing', async () => {
    const { cookie } = await registerUser();
    const importId = await upload(cookie, 'gone.vcf', vcard('Missing Person', '+1 555 0400'));

    const [row] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));
    await env.IMPORTS_BUCKET.delete(row?.rawKey ?? '');

    await runQueue(importId);

    const [failed] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('raw payload');
  });
});
