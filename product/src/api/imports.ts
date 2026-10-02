import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from '../db/schema';
import { detectImportKind, MAX_IMPORT_LENGTH } from '../domain/imports';
import { queueImport } from '../imports/intake';
import { checkImportLimit, freeImportLimit, importedContactUsage } from '../imports/limits';
import { getSessionUser } from './session';

export const importRoutes = new Hono<{ Bindings: Env }>();

importRoutes.post('/api/imports', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const limitCheck = await checkImportLimit(c.env, db, user.id);
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

  const { fileName, content } = (body ?? {}) as { fileName?: unknown; content?: unknown };

  if (
    typeof fileName !== 'string' ||
    fileName.trim() === '' ||
    typeof content !== 'string' ||
    content.trim() === ''
  ) {
    return c.json({ error: 'fileName and content are required' }, 400);
  }
  if (content.length > MAX_IMPORT_LENGTH) {
    return c.json({ error: 'file exceeds the 5 MB limit' }, 413);
  }

  const kind = detectImportKind(fileName, content);
  if (!kind) {
    return c.json({ error: 'unsupported file type; expected vCard (.vcf) or CSV (.csv)' }, 400);
  }

  const label = fileName.trim();
  const { importId } = await queueImport(c.env, {
    userId: user.id,
    kind,
    fileName: label,
    content,
  });

  return c.json({ import: { id: importId, kind, fileName: label, status: 'pending' } }, 201);
});

importRoutes.get('/api/imports', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select()
    .from(schema.imports)
    .where(eq(schema.imports.userId, user.id))
    .orderBy(desc(schema.imports.createdAt))
    .limit(50);
  const usage = await importedContactUsage(db, user.id);

  return c.json({
    imports: rows.map(importSummary),
    usage: { importedContacts: usage, limit: freeImportLimit(c.env) },
  });
});

importRoutes.get('/api/imports/:id', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const [row] = await db
    .select()
    .from(schema.imports)
    .where(and(eq(schema.imports.id, c.req.param('id')), eq(schema.imports.userId, user.id)));

  if (!row) {
    return c.json({ error: 'not found' }, 404);
  }

  return c.json({ import: importSummary(row) });
});

type ImportRow = typeof schema.imports.$inferSelect;

function importSummary(row: ImportRow) {
  return {
    id: row.id,
    fileName: row.fileName,
    status: row.status,
    stats: row.stats ?? null,
    error: row.error ?? null,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt ?? null,
  };
}
