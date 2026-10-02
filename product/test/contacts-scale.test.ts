import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { apiRequest, registerUser } from './helpers';

const db = drizzle(env.DB, { schema });

describe('scale: lists larger than the D1 bound-parameter limit', () => {
  it('lists and exports more than 100 contacts', async () => {
    const { cookie, userId } = await registerUser();
    const now = new Date();

    for (let index = 0; index < 150; index += 10) {
      await db.insert(schema.identities).values(
        Array.from({ length: 10 }, (_, offset) => ({
          id: crypto.randomUUID(),
          userId,
          displayName: `Person ${index + offset}`,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    const list = await apiRequest('/api/contacts', { cookie });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { contacts: unknown[] };
    expect(listBody.contacts).toHaveLength(150);

    const exported = await apiRequest('/api/export/vcard', { cookie });
    expect(exported.status).toBe(200);
    expect(await exported.text()).toContain('Person 0');
  });
});
