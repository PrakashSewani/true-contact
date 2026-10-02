import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from '../db/schema';
import { getSessionUser } from './session';

export const contactRoutes = new Hono<{ Bindings: Env }>();

contactRoutes.get('/api/contacts', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const parsedLimit = Number.parseInt(c.req.query('limit') ?? '', 10);
  const limit = Number.isNaN(parsedLimit) ? 200 : Math.min(Math.max(parsedLimit, 1), 500);

  const identities = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.userId, user.id), isNull(schema.identities.mergedIntoId)))
    .orderBy(desc(schema.identities.updatedAt))
    .limit(limit);

  const ids = identities.map((identity) => identity.id);

  if (ids.length === 0) {
    return c.json({ contacts: [] });
  }

  const values = await db
    .select()
    .from(schema.identityValues)
    .where(inArray(schema.identityValues.identityId, ids));

  const conflictCounts = await db
    .select({ identityId: schema.conflicts.identityId, count: sql<number>`count(*)` })
    .from(schema.conflicts)
    .where(and(inArray(schema.conflicts.identityId, ids), eq(schema.conflicts.status, 'open')))
    .groupBy(schema.conflicts.identityId);

  const proposalCounts = await db
    .select({ identityId: schema.identityLinks.identityId, count: sql<number>`count(*)` })
    .from(schema.identityLinks)
    .where(
      and(
        inArray(schema.identityLinks.identityId, ids),
        eq(schema.identityLinks.status, 'proposed'),
      ),
    )
    .groupBy(schema.identityLinks.identityId);

  const lastObserved = await db
    .select({
      identityId: schema.identityLinks.identityId,
      last: sql<number | null>`max(${schema.observations.observedAt})`,
    })
    .from(schema.identityLinks)
    .innerJoin(schema.observations, eq(schema.identityLinks.observationId, schema.observations.id))
    .where(inArray(schema.identityLinks.identityId, ids))
    .groupBy(schema.identityLinks.identityId);

  const conflictsBy = new Map(conflictCounts.map((row) => [row.identityId, row.count]));
  const proposalsBy = new Map(proposalCounts.map((row) => [row.identityId, row.count]));
  const lastObservedBy = new Map(lastObserved.map((row) => [row.identityId, row.last]));

  const valuesBy = new Map<string, (typeof values)[number][]>();
  for (const value of values) {
    const list = valuesBy.get(value.identityId) ?? [];
    list.push(value);
    valuesBy.set(value.identityId, list);
  }

  return c.json({
    contacts: identities.map((identity) => {
      const own = valuesBy.get(identity.id) ?? [];
      const lastSeen = lastObservedBy.get(identity.id);

      return {
        id: identity.id,
        displayName: identity.displayName,
        notes: identity.notes ?? null,
        updatedAt: identity.updatedAt,
        phones: own
          .filter((value) => value.kind === 'phone')
          .map((value) => ({ id: value.id, value: value.value, label: value.label ?? null })),
        emails: own
          .filter((value) => value.kind === 'email')
          .map((value) => ({ id: value.id, value: value.value, label: value.label ?? null })),
        openConflicts: conflictsBy.get(identity.id) ?? 0,
        proposedLinks: proposalsBy.get(identity.id) ?? 0,
        lastObservedAt:
          lastSeen === undefined || lastSeen === null ? null : new Date(lastSeen * 1000),
      };
    }),
  });
});

contactRoutes.get('/api/contacts/:id', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const [identity] = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.id, c.req.param('id')), eq(schema.identities.userId, user.id)));

  if (!identity) {
    return c.json({ error: 'not found' }, 404);
  }

  const [values, links, conflicts, history, sources] = await Promise.all([
    db
      .select()
      .from(schema.identityValues)
      .where(eq(schema.identityValues.identityId, identity.id)),
    db
      .select({
        id: schema.identityLinks.id,
        observationId: schema.identityLinks.observationId,
        confidence: schema.identityLinks.confidence,
        method: schema.identityLinks.method,
        status: schema.identityLinks.status,
        observationName: schema.observations.displayName,
        observedAt: schema.observations.observedAt,
        sourceId: schema.observations.sourceId,
      })
      .from(schema.identityLinks)
      .innerJoin(
        schema.observations,
        eq(schema.identityLinks.observationId, schema.observations.id),
      )
      .where(eq(schema.identityLinks.identityId, identity.id))
      .orderBy(desc(schema.observations.observedAt)),
    db
      .select()
      .from(schema.conflicts)
      .where(eq(schema.conflicts.identityId, identity.id))
      .orderBy(desc(schema.conflicts.createdAt)),
    db
      .select()
      .from(schema.historyEvents)
      .where(eq(schema.historyEvents.identityId, identity.id))
      .orderBy(desc(schema.historyEvents.createdAt))
      .limit(200),
    db
      .select({ id: schema.sources.id, kind: schema.sources.kind, label: schema.sources.label })
      .from(schema.sources)
      .where(eq(schema.sources.userId, user.id)),
  ]);

  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return c.json({
    contact: {
      id: identity.id,
      displayName: identity.displayName,
      notes: identity.notes ?? null,
      mergedIntoId: identity.mergedIntoId ?? null,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
      values: values.map((value) => ({
        id: value.id,
        kind: value.kind,
        value: value.value,
        label: value.label ?? null,
        firstObservationId: value.firstObservationId ?? null,
      })),
      observations: links.map((link) => ({
        linkId: link.id,
        observationId: link.observationId,
        displayName: link.observationName,
        observedAt: link.observedAt,
        source: sourceById.get(link.sourceId) ?? null,
        link: { confidence: link.confidence, method: link.method, status: link.status },
      })),
      conflicts,
      history,
    },
  });
});

contactRoutes.get('/api/review', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });

  const [conflicts, proposals] = await Promise.all([
    db
      .select({
        id: schema.conflicts.id,
        identityId: schema.conflicts.identityId,
        identityName: schema.identities.displayName,
        field: schema.conflicts.field,
        existingValue: schema.conflicts.existingValue,
        proposedValue: schema.conflicts.proposedValue,
        proposedObservationId: schema.conflicts.proposedObservationId,
        createdAt: schema.conflicts.createdAt,
      })
      .from(schema.conflicts)
      .innerJoin(schema.identities, eq(schema.conflicts.identityId, schema.identities.id))
      .where(and(eq(schema.conflicts.userId, user.id), eq(schema.conflicts.status, 'open')))
      .orderBy(desc(schema.conflicts.createdAt)),
    db
      .select({
        id: schema.identityLinks.id,
        identityId: schema.identityLinks.identityId,
        identityName: schema.identities.displayName,
        observationId: schema.identityLinks.observationId,
        observationName: schema.observations.displayName,
        confidence: schema.identityLinks.confidence,
        method: schema.identityLinks.method,
        createdAt: schema.identityLinks.createdAt,
      })
      .from(schema.identityLinks)
      .innerJoin(schema.identities, eq(schema.identityLinks.identityId, schema.identities.id))
      .innerJoin(
        schema.observations,
        eq(schema.identityLinks.observationId, schema.observations.id),
      )
      .where(
        and(eq(schema.identityLinks.userId, user.id), eq(schema.identityLinks.status, 'proposed')),
      )
      .orderBy(desc(schema.identityLinks.createdAt)),
  ]);

  return c.json({ conflicts, proposals });
});
