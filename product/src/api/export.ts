import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { collectInBatches } from '../db/batch';
import * as schema from '../db/schema';
import { type ExportContact, renderCsv, renderVCard } from '../domain/export';
import { getSessionUser } from './session';

export const exportRoutes = new Hono<{ Bindings: Env }>();

exportRoutes.get('/api/export/vcard', async (c) => {
  const data = await loadExportContacts(c);
  if (!data) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await recordExport(c, data.userId);

  return new Response(renderVCard(data.contacts), {
    headers: {
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': 'attachment; filename="truecontact-contacts.vcf"',
    },
  });
});

exportRoutes.get('/api/export/csv', async (c) => {
  const data = await loadExportContacts(c);
  if (!data) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await recordExport(c, data.userId);

  return new Response(renderCsv(data.contacts), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="truecontact-contacts.csv"',
    },
  });
});

async function loadExportContacts(
  c: Context<{ Bindings: Env }>,
): Promise<{ userId: string; contacts: ExportContact[] } | null> {
  const user = await getSessionUser(c);
  if (!user) {
    return null;
  }

  const db = drizzle(c.env.DB, { schema });
  const identities = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.userId, user.id), isNull(schema.identities.mergedIntoId)))
    .orderBy(asc(schema.identities.displayName));

  const ids = identities.map((identity) => identity.id);
  const values = ids.length
    ? await collectInBatches(ids, (batch) =>
        db
          .select()
          .from(schema.identityValues)
          .where(inArray(schema.identityValues.identityId, batch)),
      )
    : [];

  const valuesBy = new Map<string, (typeof values)[number][]>();
  for (const value of values) {
    const list = valuesBy.get(value.identityId) ?? [];
    list.push(value);
    valuesBy.set(value.identityId, list);
  }

  const contacts = identities.map((identity) => {
    const own = valuesBy.get(identity.id) ?? [];

    return {
      displayName: identity.displayName,
      notes: identity.notes ?? null,
      phones: own
        .filter((value) => value.kind === 'phone')
        .map((value) => ({ value: value.value, label: value.label ?? null })),
      emails: own
        .filter((value) => value.kind === 'email')
        .map((value) => ({ value: value.value, label: value.label ?? null })),
    };
  });

  return { userId: user.id, contacts };
}

async function recordExport(c: Context<{ Bindings: Env }>, userId: string): Promise<void> {
  const db = drizzle(c.env.DB, { schema });

  await db.insert(schema.usageOperations).values({
    id: crypto.randomUUID(),
    userId,
    kind: 'export',
    quantity: 1,
    createdAt: new Date(),
  });
}
