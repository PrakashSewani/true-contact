import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { freeImportLimit, importedContactUsage } from '../src/imports/limits';
import { apiRequest, registerUser, vcard } from './helpers';

const db = drizzle(env.DB, { schema });

describe('free tier limits', () => {
  it('reads the configured limit with a safe default', () => {
    expect(freeImportLimit({ FREE_IMPORT_LIMIT: '7' } as unknown as Env)).toBe(7);
    expect(freeImportLimit({ FREE_IMPORT_LIMIT: 'nope' } as unknown as Env)).toBe(1000);
    expect(freeImportLimit({} as Env)).toBe(1000);
    expect(freeImportLimit({ FREE_IMPORT_LIMIT: '0' } as unknown as Env)).toBe(1000);
  });

  it('blocks new imports once the tier is exhausted', async () => {
    const { cookie, userId } = await registerUser();

    await db.insert(schema.usageOperations).values({
      id: crypto.randomUUID(),
      userId,
      kind: 'imported_contact',
      quantity: freeImportLimit(env),
      createdAt: new Date(),
    });

    const blocked = await apiRequest('/api/imports', {
      cookie,
      body: { fileName: 'more.vcf', content: vcard('Blocked Person', '+1 555 0999') },
    });

    expect(blocked.status).toBe(402);
    const body = (await blocked.json()) as { used: number; limit: number };
    expect(body.limit).toBe(freeImportLimit(env));
    expect(body.used).toBe(freeImportLimit(env));
  });

  it('reports usage on the import list', async () => {
    const { cookie } = await registerUser();

    const response = await apiRequest('/api/imports', { cookie });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      usage: { importedContacts: number; limit: number };
    };
    expect(body.usage.importedContacts).toBe(0);
    expect(body.usage.limit).toBe(freeImportLimit(env));
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
