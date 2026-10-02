import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from '../db/schema';
import { getSessionUser } from './session';

export const accountRoutes = new Hono<{ Bindings: Env }>();

accountRoutes.post('/api/account/delete-data', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }

  const { confirm } = (body ?? {}) as { confirm?: unknown };
  if (confirm !== true) {
    return c.json({ error: 'confirm must be true' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.identities)
    .where(eq(schema.identities.userId, user.id));

  // Imports cascade to observations (and their links/conflicts); identities cascade to
  // values/links/conflicts/history. Usage counters are kept: they track the free-tier limit.
  await db.delete(schema.imports).where(eq(schema.imports.userId, user.id));
  await db.delete(schema.identities).where(eq(schema.identities.userId, user.id));
  await db.delete(schema.sources).where(eq(schema.sources.userId, user.id));

  return c.json({ ok: true, deletedContacts: countRow?.count ?? 0 });
});
