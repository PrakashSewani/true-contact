import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { importedContactUsage } from '../src/imports/limits';
import { apiRequest, registerUser, vcard } from './helpers';

const db = drizzle(env.DB, { schema });

describe('usage tracking', () => {
  it('does not block new imports during the personal stage', async () => {
    const { cookie, userId } = await registerUser();

    await db.insert(schema.usageOperations).values({
      id: crypto.randomUUID(),
      userId,
      kind: 'imported_contact',
      quantity: 5000,
      createdAt: new Date(),
    });

    const accepted = await apiRequest('/api/imports', {
      cookie,
      body: { fileName: 'more.vcf', content: vcard('Accepted Person', '+1 555 0999') },
    });

    expect(accepted.status).toBe(201);
  });

  it('reports usage on the import list', async () => {
    const { cookie } = await registerUser();

    const response = await apiRequest('/api/imports', { cookie });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { usage: { importedContacts: number } };
    expect(body.usage.importedContacts).toBe(0);
  });

  it('sums usage across operations', async () => {
    const { userId } = await registerUser();

    await db.insert(schema.usageOperations).values([
      {
        id: crypto.randomUUID(),
        userId,
        kind: 'imported_contact',
        quantity: 3,
        createdAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        userId,
        kind: 'imported_contact',
        quantity: 4,
        createdAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        userId,
        kind: 'export',
        quantity: 10,
        createdAt: new Date(),
      },
    ]);

    expect(await importedContactUsage(db, userId)).toBe(7);
  });
});
