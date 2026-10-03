import type { NormalizedContact } from '@truecontact/shared';
import { importBatchSchema } from '@truecontact/shared';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { parseCsv } from '../domain/parse-csv';
import { parseVCard } from '../domain/parse-vcard';
import type { Db } from './graph';
import { reconcileSlice } from './reconcile';

type ImportRow = typeof schema.imports.$inferSelect;

const DEFAULT_CHUNK_SIZE = 30;
const MAX_CHUNK_SIZE = 200;

interface SlicePayload {
  contacts: NormalizedContact[];
  total: number;
  skipped: number;
}

export async function processImport(env: Env, importId: string, cursor: number): Promise<void> {
  const db = drizzle(env.DB, { schema });
  const [job] = await db.select().from(schema.imports).where(eq(schema.imports.id, importId));

  if (!job || job.status === 'complete' || job.status === 'failed') {
    return;
  }

  if (cursor < job.cursor) {
    return;
  }

  if (job.status !== 'processing') {
    await db
      .update(schema.imports)
      .set({ status: 'processing', startedAt: job.startedAt ?? new Date() })
      .where(eq(schema.imports.id, importId));
  }

  await runSlice(env, db, job, cursor);
}

export async function markImportFailed(env: Env, importId: string, error: unknown): Promise<void> {
  const db = drizzle(env.DB, { schema });

  await db
    .update(schema.imports)
    .set({ status: 'failed', error: errorMessage(error), finishedAt: new Date() })
    .where(eq(schema.imports.id, importId));
}

function chunkSize(env: Env): number {
  const parsed = Number.parseInt(env.IMPORT_CHUNK_SIZE ?? '', 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_CHUNK_SIZE;
  }

  return Math.min(parsed, MAX_CHUNK_SIZE);
}

async function loadSlice(
  env: Env,
  db: Db,
  job: ImportRow,
  cursor: number,
  size: number,
): Promise<SlicePayload> {
  const raw = job.rawKey ? await env.IMPORTS_BUCKET.get(job.rawKey) : null;
  if (!raw) {
    throw new Error('raw payload is missing');
  }

  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, job.sourceId));
  if (!source) {
    throw new Error('source is missing');
  }

  const text = await raw.text();

  if (source.kind === 'whatsapp') {
    let envelope: { source?: unknown; contacts?: unknown } | null = null;
    try {
      envelope = JSON.parse(text) as { source?: unknown; contacts?: unknown } | null;
    } catch {
      throw new Error('invalid whatsapp batch payload');
    }

    const all = envelope?.contacts;
    if (envelope?.source !== 'whatsapp' || !Array.isArray(all)) {
      throw new Error('invalid whatsapp batch payload');
    }
    const slice = all.slice(cursor, cursor + size);

    if (slice.length === 0) {
      return { contacts: [], total: all.length, skipped: 0 };
    }

    const batch = importBatchSchema.safeParse({ source: 'whatsapp', contacts: slice });
    if (!batch.success) {
      throw new Error('invalid whatsapp batch payload');
    }

    return { contacts: batch.data.contacts, total: all.length, skipped: 0 };
  }

  const observedAt = job.createdAt.toISOString();
  const parsed =
    source.kind === 'csv' ? parseCsv(text, { observedAt }) : parseVCard(text, { observedAt });

  return {
    contacts: parsed.contacts.slice(cursor, cursor + size),
    total: parsed.contacts.length,
    skipped: parsed.skipped.length,
  };
}

async function runSlice(env: Env, db: Db, job: ImportRow, cursor: number): Promise<void> {
  const payload = await loadSlice(env, db, job, cursor, chunkSize(env));
  const contacts = payload.contacts;
  const nextCursor = cursor + contacts.length;
  const done = nextCursor >= payload.total;

  if (contacts.length > 0) {
    const outcome = await reconcileSlice(env, db, { job, contacts, now: new Date() });

    console.log(
      JSON.stringify({
        event: 'import.slice',
        importId: job.id,
        cursor,
        contacts: contacts.length,
        skipped: outcome.skipped,
        created: outcome.created,
        linked: outcome.linked,
        proposed: outcome.proposed,
        conflicts: outcome.conflicts,
        roundTrips: outcome.metrics.roundTrips,
        statements: outcome.metrics.statements,
        rowsRead: outcome.metrics.rowsRead,
        rowsWritten: outcome.metrics.rowsWritten,
      }),
    );
  }

  const now = new Date();

  if (!done) {
    await db
      .update(schema.imports)
      .set({ cursor: nextCursor, total: payload.total, progressAt: now })
      .where(eq(schema.imports.id, job.id));
    await env.IMPORTS_QUEUE.send({ importId: job.id, cursor: nextCursor });

    return;
  }

  const stats = await finalize(db, job, payload, now);

  await db
    .update(schema.imports)
    .set({
      status: 'complete',
      cursor: nextCursor,
      total: payload.total,
      progressAt: now,
      stats,
      finishedAt: now,
    })
    .where(eq(schema.imports.id, job.id));
}

async function finalize(
  db: Db,
  job: ImportRow,
  payload: SlicePayload,
  now: Date,
): Promise<schema.ImportStats> {
  const linkRows = await db
    .select({
      method: schema.identityLinks.method,
      status: schema.identityLinks.status,
      count: sql<number>`count(*)`,
    })
    .from(schema.identityLinks)
    .innerJoin(schema.observations, eq(schema.observations.id, schema.identityLinks.observationId))
    .where(eq(schema.observations.importId, job.id))
    .groupBy(schema.identityLinks.method, schema.identityLinks.status);

  const [conflictRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.conflicts)
    .innerJoin(
      schema.observations,
      eq(schema.observations.id, schema.conflicts.proposedObservationId),
    )
    .where(eq(schema.observations.importId, job.id));

  let created = 0;
  let linked = 0;
  let proposed = 0;

  for (const row of linkRows) {
    if (row.method === 'new_identity') {
      created += row.count;
    } else if (row.method === 'exact_identifier' && row.status === 'auto') {
      linked += row.count;
    } else if (row.status === 'proposed') {
      proposed += row.count;
    }
  }

  await db
    .update(schema.sources)
    .set({ lastObservedAt: job.createdAt, updatedAt: now })
    .where(eq(schema.sources.id, job.sourceId));

  if (payload.total > 0) {
    try {
      await db.insert(schema.usageOperations).values({
        id: job.id,
        userId: job.userId,
        kind: 'imported_contact',
        quantity: payload.total,
        createdAt: now,
      });
    } catch {
      // The deterministic id makes the insert idempotent: a retried final slice
      // finds the usage row already recorded and the conflict is expected.
    }
  }

  return {
    contacts: payload.total,
    created,
    linked,
    proposed,
    conflicts: conflictRow?.count ?? 0,
    skipped: payload.skipped,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
