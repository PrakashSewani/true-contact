import { importBatchSchema } from '@truecontact/shared';
import { and, eq, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from '../db/schema';
import { queueImport } from '../imports/intake';
import { checkImportLimit } from '../imports/limits';
import { hashToken } from './pairing';

export const extensionRoutes = new Hono<{ Bindings: Env }>();

extensionRoutes.post('/api/imports/extension', async (c) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (token === '') {
    return c.json({ error: 'missing bearer token' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const now = new Date();
  const tokenHash = await hashToken(token);
  const [record] = await db
    .select()
    .from(schema.extensionTokens)
    .where(
      and(
        eq(schema.extensionTokens.tokenHash, tokenHash),
        gt(schema.extensionTokens.expiresAt, now),
      ),
    );

  if (!record) {
    return c.json({ error: 'invalid or expired token' }, 401);
  }

  const limitCheck = await checkImportLimit(c.env, db, record.userId);
  if (!limitCheck.ok) {
    return c.json(
      { error: 'Free tier limit reached', used: limitCheck.used, limit: limitCheck.limit },
      402,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }

  const parsed = importBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid batch payload' }, 400);
  }

  await db
    .update(schema.extensionTokens)
    .set({ lastUsedAt: now })
    .where(eq(schema.extensionTokens.id, record.id));

  const { importId } = await queueImport(c.env, {
    userId: record.userId,
    kind: 'whatsapp',
    fileName: `whatsapp (${record.extensionId})`,
    content: JSON.stringify(parsed.data),
  });

  return c.json({ import: { id: importId, status: 'pending' } }, 201);
});
