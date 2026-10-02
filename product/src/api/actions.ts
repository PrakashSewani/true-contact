import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from '../db/schema';
import { normalizeEmailForMatch, normalizePhoneForMatch } from '../domain/matching';
import {
  adoptValues,
  createIdentityFromObservation,
  recordEvent,
  seedValues,
} from '../imports/graph';
import { getSessionUser } from './session';

export const actionRoutes = new Hono<{ Bindings: Env }>();

actionRoutes.post('/api/links/:id/confirm', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const [link] = await db
    .select()
    .from(schema.identityLinks)
    .where(
      and(eq(schema.identityLinks.id, c.req.param('id')), eq(schema.identityLinks.userId, user.id)),
    );

  if (!link) {
    return c.json({ error: 'not found' }, 404);
  }
  if (link.status === 'rejected') {
    return c.json({ error: 'link was rejected' }, 409);
  }

  const [observation] = await db
    .select()
    .from(schema.observations)
    .where(eq(schema.observations.id, link.observationId));

  if (!observation) {
    return c.json({ error: 'observation is missing' }, 409);
  }

  await db
    .update(schema.identityLinks)
    .set({ status: 'confirmed', updatedAt: new Date() })
    .where(eq(schema.identityLinks.id, link.id));

  const conflicts = await adoptValues(db, {
    userId: user.id,
    identityId: link.identityId,
    contact: observation.payload,
    observationId: observation.id,
    actor: 'user',
    sourceId: observation.sourceId,
    importId: observation.importId,
  });

  await recordEvent(
    db,
    {
      userId: user.id,
      actor: 'user',
      sourceId: observation.sourceId,
      importId: observation.importId,
    },
    link.identityId,
    'link_confirmed',
    observation.id,
    { linkId: link.id, conflicts },
  );

  return c.json({ ok: true, conflicts });
});

actionRoutes.post('/api/links/:id/reject', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const [link] = await db
    .select()
    .from(schema.identityLinks)
    .where(
      and(eq(schema.identityLinks.id, c.req.param('id')), eq(schema.identityLinks.userId, user.id)),
    );

  if (!link) {
    return c.json({ error: 'not found' }, 404);
  }

  const [observation] = await db
    .select()
    .from(schema.observations)
    .where(eq(schema.observations.id, link.observationId));

  if (!observation) {
    return c.json({ error: 'observation is missing' }, 409);
  }

  const identityId = await createIdentityFromObservation(db, {
    userId: user.id,
    contact: observation.payload,
    observationId: observation.id,
    actor: 'user',
    sourceId: observation.sourceId,
    importId: observation.importId,
  });

  await db
    .update(schema.identityLinks)
    .set({ identityId, method: 'manual', status: 'confirmed', updatedAt: new Date() })
    .where(eq(schema.identityLinks.id, link.id));

  await recordEvent(
    db,
    {
      userId: user.id,
      actor: 'user',
      sourceId: observation.sourceId,
      importId: observation.importId,
    },
    link.identityId,
    'link_rejected',
    observation.id,
    { createdIdentityId: identityId },
  );

  return c.json({ ok: true, identityId });
});

actionRoutes.post('/api/conflicts/:id/resolve', async (c) => {
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

  const { resolution, value } = (body ?? {}) as { resolution?: unknown; value?: unknown };
  if (resolution !== 'keep_existing' && resolution !== 'use_proposed' && resolution !== 'custom') {
    return c.json({ error: 'resolution must be keep_existing, use_proposed, or custom' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [conflict] = await db
    .select()
    .from(schema.conflicts)
    .where(and(eq(schema.conflicts.id, c.req.param('id')), eq(schema.conflicts.userId, user.id)));

  if (!conflict) {
    return c.json({ error: 'not found' }, 404);
  }
  if (conflict.status !== 'open') {
    return c.json({ ok: true, status: conflict.status });
  }
  if (conflict.field !== 'display_name') {
    return c.json({ error: 'only display_name conflicts are resolvable in v1' }, 400);
  }

  let resolvedValue: string | null = null;
  if (resolution === 'use_proposed') {
    resolvedValue = conflict.proposedValue;
  } else if (resolution === 'custom') {
    if (typeof value !== 'string' || value.trim() === '') {
      return c.json({ error: 'value is required for a custom resolution' }, 400);
    }
    resolvedValue = value.trim();
  }

  const now = new Date();
  const [identity] = await db
    .select()
    .from(schema.identities)
    .where(eq(schema.identities.id, conflict.identityId));

  if (resolvedValue !== null && identity && identity.displayName !== resolvedValue) {
    await db
      .update(schema.identities)
      .set({ displayName: resolvedValue, updatedAt: now })
      .where(eq(schema.identities.id, identity.id));
    await recordEvent(
      db,
      { userId: user.id, actor: 'user' },
      identity.id,
      'value_changed',
      conflict.proposedObservationId,
      { field: 'display_name', from: identity.displayName, to: resolvedValue },
    );
  }

  await db
    .update(schema.conflicts)
    .set({ status: 'resolved', resolution, resolvedValue, resolvedAt: now })
    .where(eq(schema.conflicts.id, conflict.id));

  await recordEvent(
    db,
    { userId: user.id, actor: 'user' },
    conflict.identityId,
    'conflict_resolved',
    conflict.proposedObservationId,
    { resolution, resolvedValue },
  );

  return c.json({ ok: true });
});

actionRoutes.post('/api/contacts/:id/merge', async (c) => {
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

  const { intoId } = (body ?? {}) as { intoId?: unknown };
  const sourceId = c.req.param('id');

  if (typeof intoId !== 'string' || intoId === '' || intoId === sourceId) {
    return c.json({ error: 'intoId must reference a different contact' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [source] = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.id, sourceId), eq(schema.identities.userId, user.id)));
  const [target] = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.id, intoId), eq(schema.identities.userId, user.id)));

  if (!source || !target) {
    return c.json({ error: 'not found' }, 404);
  }
  if (source.mergedIntoId) {
    return c.json({ error: 'source contact is already merged' }, 409);
  }
  if (target.mergedIntoId) {
    return c.json({ error: 'target contact is already merged' }, 409);
  }

  const now = new Date();
  const [sourceValues, targetValues] = [
    await db
      .select()
      .from(schema.identityValues)
      .where(eq(schema.identityValues.identityId, source.id)),
    await db
      .select()
      .from(schema.identityValues)
      .where(eq(schema.identityValues.identityId, target.id)),
  ];

  const targetKeys = new Set(targetValues.map((value) => `${value.kind}:${value.normalizedValue}`));

  for (const value of sourceValues) {
    const key = `${value.kind}:${value.normalizedValue}`;
    if (targetKeys.has(key)) {
      await db.delete(schema.identityValues).where(eq(schema.identityValues.id, value.id));
    } else {
      targetKeys.add(key);
      await db
        .update(schema.identityValues)
        .set({ identityId: target.id, updatedAt: now })
        .where(eq(schema.identityValues.id, value.id));
    }
  }

  await db
    .update(schema.identityLinks)
    .set({ identityId: target.id, status: 'confirmed', updatedAt: now })
    .where(
      and(
        eq(schema.identityLinks.identityId, source.id),
        eq(schema.identityLinks.status, 'proposed'),
      ),
    );
  await db
    .update(schema.identityLinks)
    .set({ identityId: target.id, updatedAt: now })
    .where(
      and(
        eq(schema.identityLinks.identityId, source.id),
        inArray(schema.identityLinks.status, ['auto', 'confirmed']),
      ),
    );

  await db
    .update(schema.conflicts)
    .set({ identityId: target.id })
    .where(and(eq(schema.conflicts.identityId, source.id), eq(schema.conflicts.status, 'open')));

  await db
    .update(schema.identities)
    .set({ mergedIntoId: target.id, updatedAt: now })
    .where(eq(schema.identities.id, source.id));

  const context = { userId: user.id, actor: 'user' as const };
  await recordEvent(db, context, source.id, 'merged', null, { intoId: target.id });
  await recordEvent(db, context, target.id, 'merged', null, { fromId: source.id });

  return c.json({ ok: true, intoId: target.id });
});

actionRoutes.post('/api/contacts/:id/split', async (c) => {
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

  const { observationIds, displayName } = (body ?? {}) as {
    observationIds?: unknown;
    displayName?: unknown;
  };
  const sourceId = c.req.param('id');

  if (
    !Array.isArray(observationIds) ||
    observationIds.length === 0 ||
    !observationIds.every((item) => typeof item === 'string')
  ) {
    return c.json({ error: 'observationIds must be a non-empty array of ids' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [source] = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.id, sourceId), eq(schema.identities.userId, user.id)));

  if (!source) {
    return c.json({ error: 'not found' }, 404);
  }
  if (source.mergedIntoId) {
    return c.json({ error: 'contact is merged' }, 409);
  }

  const links = await db
    .select()
    .from(schema.identityLinks)
    .where(
      and(
        eq(schema.identityLinks.identityId, source.id),
        inArray(schema.identityLinks.observationId, observationIds as string[]),
      ),
    );

  if (links.length === 0) {
    return c.json({ error: 'none of the observations belong to this contact' }, 400);
  }

  const observations = await db
    .select()
    .from(schema.observations)
    .where(
      inArray(
        schema.observations.id,
        links.map((link) => link.observationId),
      ),
    );

  const sorted = [...observations].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  const first = sorted[0];

  if (!first) {
    return c.json({ error: 'observations are missing' }, 409);
  }

  const name =
    typeof displayName === 'string' && displayName.trim() !== ''
      ? displayName.trim()
      : first.displayName;
  const now = new Date();
  const identityId = crypto.randomUUID();

  await db.insert(schema.identities).values({
    id: identityId,
    userId: user.id,
    displayName: name,
    createdAt: now,
    updatedAt: now,
  });

  await seedValues(db, {
    userId: user.id,
    identityId,
    contacts: sorted.map((observation) => observation.payload),
    observationIds: sorted.map((observation) => observation.id),
    actor: 'user',
  });

  await db
    .update(schema.identityLinks)
    .set({ identityId, status: 'confirmed', updatedAt: now })
    .where(
      and(
        eq(schema.identityLinks.identityId, source.id),
        inArray(
          schema.identityLinks.observationId,
          sorted.map((observation) => observation.id),
        ),
      ),
    );

  const context = { userId: user.id, actor: 'user' as const };
  await recordEvent(db, context, source.id, 'split', null, {
    newIdentityId: identityId,
    observationIds: sorted.map((observation) => observation.id),
  });
  await recordEvent(db, context, identityId, 'created', null, {
    displayName: name,
    splitFrom: source.id,
  });

  return c.json({ ok: true, identityId });
});

actionRoutes.patch('/api/contacts/:id', async (c) => {
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

  const { displayName, notes } = (body ?? {}) as { displayName?: unknown; notes?: unknown };

  const db = drizzle(c.env.DB, { schema });
  const [identity] = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.id, c.req.param('id')), eq(schema.identities.userId, user.id)));

  if (!identity) {
    return c.json({ error: 'not found' }, 404);
  }
  if (identity.mergedIntoId) {
    return c.json({ error: 'contact is merged' }, 409);
  }

  const now = new Date();
  const context = { userId: user.id, actor: 'user' as const };

  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim() === '') {
      return c.json({ error: 'displayName must be a non-empty string' }, 400);
    }
    const next = displayName.trim();
    if (next !== identity.displayName) {
      await db
        .update(schema.identities)
        .set({ displayName: next, updatedAt: now })
        .where(eq(schema.identities.id, identity.id));
      await recordEvent(db, context, identity.id, 'value_changed', null, {
        field: 'display_name',
        from: identity.displayName,
        to: next,
      });
    }
  }

  if (notes !== undefined) {
    if (notes !== null && typeof notes !== 'string') {
      return c.json({ error: 'notes must be a string' }, 400);
    }
    const next = typeof notes === 'string' && notes.trim() !== '' ? notes : null;
    if (next !== (identity.notes ?? null)) {
      await db
        .update(schema.identities)
        .set({ notes: next, updatedAt: now })
        .where(eq(schema.identities.id, identity.id));
      await recordEvent(db, context, identity.id, 'value_changed', null, {
        field: 'notes',
        from: identity.notes ?? null,
        to: next,
      });
    }
  }

  return c.json({ ok: true });
});

actionRoutes.post('/api/contacts/:id/values', async (c) => {
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

  const { kind, value, label } = (body ?? {}) as {
    kind?: unknown;
    value?: unknown;
    label?: unknown;
  };

  if (kind !== 'phone' && kind !== 'email') {
    return c.json({ error: 'kind must be phone or email' }, 400);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return c.json({ error: 'value must be a non-empty string' }, 400);
  }
  if (label !== undefined && label !== null && typeof label !== 'string') {
    return c.json({ error: 'label must be a string' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [identity] = await db
    .select()
    .from(schema.identities)
    .where(and(eq(schema.identities.id, c.req.param('id')), eq(schema.identities.userId, user.id)));

  if (!identity) {
    return c.json({ error: 'not found' }, 404);
  }
  if (identity.mergedIntoId) {
    return c.json({ error: 'contact is merged' }, 409);
  }

  const normalizedValue =
    kind === 'phone' ? normalizePhoneForMatch(value) : normalizeEmailForMatch(value);
  if (normalizedValue === '') {
    return c.json({ error: 'value is empty after normalization' }, 400);
  }

  const [existing] = await db
    .select({ id: schema.identityValues.id })
    .from(schema.identityValues)
    .where(
      and(
        eq(schema.identityValues.userId, user.id),
        eq(schema.identityValues.identityId, identity.id),
        eq(schema.identityValues.kind, kind),
        eq(schema.identityValues.normalizedValue, normalizedValue),
      ),
    );

  if (existing) {
    return c.json({ error: 'value already exists' }, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const cleaned = value.trim();
  const cleanedLabel = typeof label === 'string' && label.trim() !== '' ? label.trim() : null;

  await db.insert(schema.identityValues).values({
    id,
    userId: user.id,
    identityId: identity.id,
    kind,
    value: cleaned,
    normalizedValue,
    label: cleanedLabel,
    createdAt: now,
    updatedAt: now,
  });

  await recordEvent(db, { userId: user.id, actor: 'user' }, identity.id, 'value_added', null, {
    kind,
    value: cleaned,
    label: cleanedLabel,
  });

  return c.json({ value: { id, kind, value: cleaned } }, 201);
});

actionRoutes.delete('/api/contacts/:id/values/:valueId', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const [value] = await db
    .select()
    .from(schema.identityValues)
    .where(
      and(
        eq(schema.identityValues.id, c.req.param('valueId')),
        eq(schema.identityValues.userId, user.id),
        eq(schema.identityValues.identityId, c.req.param('id')),
      ),
    );

  if (!value) {
    return c.json({ error: 'not found' }, 404);
  }

  await db.delete(schema.identityValues).where(eq(schema.identityValues.id, value.id));

  await recordEvent(
    db,
    { userId: user.id, actor: 'user' },
    value.identityId,
    'value_removed',
    null,
    { kind: value.kind, value: value.value },
  );

  return c.json({ ok: true });
});
