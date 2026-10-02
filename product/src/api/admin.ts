import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { type Context, Hono } from 'hono';
import * as schema from '../db/schema';
import { getSessionUser } from './session';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.get('/api/admin/users', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      createdAt: schema.user.createdAt,
      role: schema.memberships.role,
      status: schema.memberships.status,
      decidedAt: schema.memberships.decidedAt,
    })
    .from(schema.user)
    .leftJoin(schema.memberships, eq(schema.memberships.userId, schema.user.id))
    .orderBy(desc(schema.user.createdAt))
    .limit(200);

  return c.json({
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt,
      role: row.role ?? 'member',
      status: row.status ?? 'pending',
      decidedAt: row.decidedAt ?? null,
    })),
  });
});

adminRoutes.post('/api/admin/users/:id/approve', (c) => decide(c, 'approved'));
adminRoutes.post('/api/admin/users/:id/reject', (c) => decide(c, 'rejected'));

async function decide(c: Context<{ Bindings: Env }>, status: 'approved' | 'rejected') {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const targetId = c.req.param('id');
  if (!targetId) {
    return c.json({ error: 'not found' }, 404);
  }

  const db = drizzle(c.env.DB, { schema });

  const [target] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, targetId));

  if (!target) {
    return c.json({ error: 'not found' }, 404);
  }

  const [current] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, targetId));

  if (current?.role === 'admin') {
    return c.json({ error: 'cannot change an admin' }, 409);
  }

  const now = new Date();

  await db
    .insert(schema.memberships)
    .values({
      userId: targetId,
      role: 'member',
      status,
      createdAt: now,
      decidedAt: now,
      decidedBy: user.id,
    })
    .onConflictDoUpdate({
      target: schema.memberships.userId,
      set: { status, decidedAt: now, decidedBy: user.id },
    });

  return c.json({ user: { id: targetId, status } });
}
