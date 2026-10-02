import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { apiRequest, registerUser, runQueue, vcard } from './helpers';

const db = drizzle(env.DB, { schema });

describe('delete all data', () => {
  it('requires an explicit confirmation', async () => {
    const { cookie } = await registerUser();

    const response = await apiRequest('/api/account/delete-data', { cookie, body: {} });
    expect(response.status).toBe(400);
  });

  it('clears the graph but keeps usage counters', async () => {
    const { cookie, userId } = await registerUser();

    const upload = await apiRequest('/api/imports', {
      cookie,
      body: { fileName: 'contacts.vcf', content: vcard('Delete Me', '+1 555 0900') },
    });
    expect(upload.status).toBe(201);
    const { import: job } = (await upload.json()) as { import: { id: string } };
    await runQueue(job.id);

    const before = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(before).toHaveLength(1);

    const deleted = await apiRequest('/api/account/delete-data', {
      cookie,
      body: { confirm: true },
    });
    expect(deleted.status).toBe(200);
    const body = (await deleted.json()) as { deletedContacts: number };
    expect(body.deletedContacts).toBe(1);

    const remaining = await Promise.all([
      db.select().from(schema.identities).where(eq(schema.identities.userId, userId)),
      db.select().from(schema.observations).where(eq(schema.observations.userId, userId)),
      db.select().from(schema.imports).where(eq(schema.imports.userId, userId)),
      db.select().from(schema.sources).where(eq(schema.sources.userId, userId)),
      db.select().from(schema.identityLinks).where(eq(schema.identityLinks.userId, userId)),
      db.select().from(schema.identityValues).where(eq(schema.identityValues.userId, userId)),
      db.select().from(schema.historyEvents).where(eq(schema.historyEvents.userId, userId)),
    ]);
    for (const rows of remaining) {
      expect(rows).toHaveLength(0);
    }

    const usage = await db
      .select()
      .from(schema.usageOperations)
      .where(eq(schema.usageOperations.userId, userId));
    expect(usage).toHaveLength(1);
  });
});
