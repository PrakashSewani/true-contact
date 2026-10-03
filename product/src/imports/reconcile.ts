import type { NormalizedContact } from '@truecontact/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { chunk, ID_BATCH_SIZE } from '../db/batch';
import * as schema from '../db/schema';
import {
  normalizeEmailForMatch,
  normalizeNameForMatch,
  normalizePhoneForMatch,
} from '../domain/matching';
import { type ContactValue, contactValues, planAdoption, valueKey } from '../domain/reconcile';
import type { Db, HistoryType } from './graph';

type ImportRow = typeof schema.imports.$inferSelect;

interface Statement {
  toSQL(): { sql: string; params: unknown[] };
}

export interface SliceMetrics {
  roundTrips: number;
  statements: number;
  rowsRead: number;
  rowsWritten: number;
}

export interface SliceOutcome {
  skipped: number;
  created: number;
  linked: number;
  proposed: number;
  conflicts: number;
  observations: number;
  identities: number;
  values: number;
  events: number;
  metrics: SliceMetrics;
}

interface IdentityContext {
  displayName: string;
  notes: string | null;
  createdAtMs: number;
  valueKeys: Set<string>;
  conflictValues: Set<string>;
}

const MAX_QUERY_PARAMS = 100;
const BACKFILL_LIMIT = 25;

export async function reconcileSlice(
  env: Env,
  db: Db,
  params: { job: ImportRow; contacts: NormalizedContact[]; now: Date },
): Promise<SliceOutcome> {
  const { job, contacts, now } = params;
  const { userId } = job;
  const metrics: SliceMetrics = { roundTrips: 0, statements: 0, rowsRead: 0, rowsWritten: 0 };
  const outcome: SliceOutcome = {
    skipped: 0,
    created: 0,
    linked: 0,
    proposed: 0,
    conflicts: 0,
    observations: 0,
    identities: 0,
    values: 0,
    events: 0,
    metrics,
  };

  const work = await skipAlreadyProcessed(env, db, job, contacts, metrics);
  outcome.skipped = contacts.length - work.length;

  if (work.length === 0) {
    return outcome;
  }

  const backfill = await readBackfillBatch(env, db, userId, metrics);
  const blocking = await loadBlockingIdentities(env, db, userId, work, metrics);
  const { names, nameMap } = await loadNameCandidates(
    env,
    db,
    userId,
    work,
    blocking,
    backfill,
    metrics,
  );
  const identities = await loadCandidateState(env, db, userId, blocking, names, nameMap, metrics);

  const identityRows: (typeof schema.identities.$inferInsert)[] = [];
  const observationRows: (typeof schema.observations.$inferInsert)[] = [];
  const valueRows: (typeof schema.identityValues.$inferInsert)[] = [];
  const linkRows: (typeof schema.identityLinks.$inferInsert)[] = [];
  const conflictRows: (typeof schema.conflicts.$inferInsert)[] = [];
  const eventRows: (typeof schema.historyEvents.$inferInsert)[] = [];
  const noteRows: { id: string; notes: string }[] = [];

  const addEvent = (
    identityId: string,
    type: HistoryType,
    observationId: string,
    payload: Record<string, unknown>,
  ) => {
    eventRows.push({
      id: crypto.randomUUID(),
      userId,
      identityId,
      type,
      actor: 'system',
      sourceId: job.sourceId,
      importId: job.id,
      observationId,
      payload,
      createdAt: now,
    });
    outcome.events += 1;
  };

  const registerBlocking = (value: ContactValue, identityId: string) => {
    const key = valueKey(value);
    const list = blocking.get(key) ?? [];

    if (!list.includes(identityId)) {
      list.push(identityId);
    }

    blocking.set(key, list);
  };

  const applyAdoption = (identityId: string, contact: NormalizedContact, observationId: string) => {
    const state = identities.get(identityId);

    if (!state) {
      return;
    }

    const plan = planAdoption(state, contact);

    for (const value of plan.values) {
      valueRows.push({
        id: crypto.randomUUID(),
        userId,
        identityId,
        kind: value.kind,
        value: value.value,
        normalizedValue: value.normalizedValue,
        label: value.label ?? null,
        firstObservationId: observationId,
        createdAt: now,
        updatedAt: now,
      });
      state.valueKeys.add(valueKey(value));
      registerBlocking(value, identityId);
      addEvent(identityId, 'value_added', observationId, {
        kind: value.kind,
        value: value.value,
      });
      outcome.values += 1;
    }

    if (plan.conflict) {
      conflictRows.push({
        id: crypto.randomUUID(),
        userId,
        identityId,
        field: 'display_name',
        existingValue: state.displayName,
        proposedValue: plan.conflict.proposedValue,
        proposedObservationId: observationId,
        status: 'open',
        createdAt: now,
      });
      state.conflictValues.add(plan.conflict.proposedValue);
      addEvent(identityId, 'conflict_opened', observationId, {
        field: 'display_name',
        proposedValue: plan.conflict.proposedValue,
      });
      outcome.conflicts += 1;
    }

    if (plan.notes) {
      noteRows.push({ id: identityId, notes: plan.notes });
      state.notes = plan.notes;
      addEvent(identityId, 'value_added', observationId, { kind: 'notes' });
    }
  };

  for (const contact of work) {
    const observationId = crypto.randomUUID();

    observationRows.push({
      id: observationId,
      userId,
      importId: job.id,
      sourceId: job.sourceId,
      externalId: contact.externalId ?? null,
      displayName: contact.displayName,
      normalizedName: normalizeNameForMatch(contact.displayName),
      notes: contact.notes ?? null,
      observedAt: new Date(contact.observedAt),
      payload: contact,
      createdAt: now,
    });
    outcome.observations += 1;

    const counts = new Map<string, number>();

    for (const value of contactValues(contact)) {
      for (const identityId of blocking.get(valueKey(value)) ?? []) {
        counts.set(identityId, (counts.get(identityId) ?? 0) + 1);
      }
    }

    const ranked = [...counts.entries()]
      .filter(([identityId]) => identities.has(identityId))
      .sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1];
        }

        const aCreated = identities.get(a[0])?.createdAtMs ?? Number.MAX_SAFE_INTEGER;
        const bCreated = identities.get(b[0])?.createdAtMs ?? Number.MAX_SAFE_INTEGER;
        return aCreated - bCreated;
      });

    const best = ranked[0];

    if (best) {
      const auto = ranked.length === 1;

      linkRows.push({
        id: crypto.randomUUID(),
        userId,
        identityId: best[0],
        observationId,
        confidence: auto ? 1 : 0.9,
        method: 'exact_identifier',
        status: auto ? 'auto' : 'proposed',
        createdAt: now,
        updatedAt: now,
      });

      if (auto) {
        applyAdoption(best[0], contact, observationId);
        addEvent(best[0], 'observed', observationId, { sourceId: job.sourceId });
        outcome.linked += 1;
      } else {
        outcome.proposed += 1;
      }

      continue;
    }

    const nameKey = normalizeNameForMatch(contact.displayName);
    const nameCandidate = nameKey === '' ? undefined : nameMap.get(nameKey)?.[0];

    if (nameCandidate) {
      linkRows.push({
        id: crypto.randomUUID(),
        userId,
        identityId: nameCandidate,
        observationId,
        confidence: 0.5,
        method: 'name_similarity',
        status: 'proposed',
        createdAt: now,
        updatedAt: now,
      });
      outcome.proposed += 1;

      continue;
    }

    const identityId = crypto.randomUUID();

    identityRows.push({
      id: identityId,
      userId,
      displayName: contact.displayName,
      normalizedName: nameKey,
      notes: contact.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });
    identities.set(identityId, {
      displayName: contact.displayName,
      notes: contact.notes ?? null,
      createdAtMs: now.getTime(),
      valueKeys: new Set(),
      conflictValues: new Set(),
    });

    if (nameKey !== '') {
      const list = nameMap.get(nameKey) ?? [];
      list.push(identityId);
      nameMap.set(nameKey, list);
    }

    applyAdoption(identityId, contact, observationId);
    addEvent(identityId, 'created', observationId, { displayName: contact.displayName });
    linkRows.push({
      id: crypto.randomUUID(),
      userId,
      identityId,
      observationId,
      confidence: 1,
      method: 'new_identity',
      status: 'auto',
      createdAt: now,
      updatedAt: now,
    });
    outcome.created += 1;
    outcome.identities += 1;
  }

  const statements: Statement[] = [
    ...buildBackfillStatements(db, userId, backfill),
    ...chunk(identityRows, Math.floor(MAX_QUERY_PARAMS / 7)).map((batch) =>
      db.insert(schema.identities).values(batch),
    ),
    ...noteRows.map((row) =>
      db
        .update(schema.identities)
        .set({ notes: row.notes, updatedAt: now })
        .where(eq(schema.identities.id, row.id)),
    ),
    ...chunk(observationRows, Math.floor(MAX_QUERY_PARAMS / 11)).map((batch) =>
      db.insert(schema.observations).values(batch),
    ),
    ...chunk(valueRows, Math.floor(MAX_QUERY_PARAMS / 10)).map((batch) =>
      db.insert(schema.identityValues).values(batch),
    ),
    ...chunk(linkRows, Math.floor(MAX_QUERY_PARAMS / 9)).map((batch) =>
      db.insert(schema.identityLinks).values(batch),
    ),
    ...chunk(conflictRows, Math.floor(MAX_QUERY_PARAMS / 9)).map((batch) =>
      db.insert(schema.conflicts).values(batch),
    ),
    ...chunk(eventRows, Math.floor(MAX_QUERY_PARAMS / 10)).map((batch) =>
      db.insert(schema.historyEvents).values(batch),
    ),
  ];

  await writeBatch(env.DB, statements, metrics);

  return outcome;
}

async function skipAlreadyProcessed(
  env: Env,
  db: Db,
  job: ImportRow,
  contacts: NormalizedContact[],
  metrics: SliceMetrics,
): Promise<NormalizedContact[]> {
  const externalIds = [
    ...new Set(
      contacts
        .map((contact) => contact.externalId)
        .filter((value): value is string => typeof value === 'string' && value !== ''),
    ),
  ];

  if (externalIds.length === 0) {
    return contacts;
  }

  const seen = new Set<string>();

  for (const batch of chunk(externalIds, ID_BATCH_SIZE)) {
    const rows = await readRows(
      env.DB,
      db
        .select({ externalId: schema.observations.externalId })
        .from(schema.observations)
        .where(
          and(
            eq(schema.observations.userId, job.userId),
            eq(schema.observations.importId, job.id),
            inArray(schema.observations.externalId, batch),
          ),
        ),
      metrics,
    );

    for (const row of rows) {
      const value = row.external_id;

      if (typeof value === 'string' && value !== '') {
        seen.add(value);
      }
    }
  }

  return contacts.filter((contact) => !(contact.externalId && seen.has(contact.externalId)));
}

async function readBackfillBatch(
  env: Env,
  db: Db,
  userId: string,
  metrics: SliceMetrics,
): Promise<Record<string, unknown>[]> {
  return readRows(
    env.DB,
    db
      .select({ id: schema.identities.id, displayName: schema.identities.displayName })
      .from(schema.identities)
      .where(
        and(
          eq(schema.identities.userId, userId),
          isNull(schema.identities.normalizedName),
          isNull(schema.identities.mergedIntoId),
        ),
      )
      .limit(BACKFILL_LIMIT),
    metrics,
  );
}

async function loadBlockingIdentities(
  env: Env,
  db: Db,
  userId: string,
  contacts: NormalizedContact[],
  metrics: SliceMetrics,
): Promise<Map<string, string[]>> {
  const blocking = new Map<string, string[]>();

  const load = async (kind: 'phone' | 'email', values: string[]) => {
    for (const batch of chunk(values, ID_BATCH_SIZE)) {
      const rows = await readRows(
        env.DB,
        db
          .select({
            kind: schema.identityValues.kind,
            normalizedValue: schema.identityValues.normalizedValue,
            identityId: schema.identityValues.identityId,
          })
          .from(schema.identityValues)
          .where(
            and(
              eq(schema.identityValues.userId, userId),
              eq(schema.identityValues.kind, kind),
              inArray(schema.identityValues.normalizedValue, batch),
            ),
          ),
        metrics,
      );

      for (const row of rows) {
        const key = `${kind}:${row.normalized_value as string}`;
        const identityId = row.identity_id as string;
        const list = blocking.get(key) ?? [];

        if (!list.includes(identityId)) {
          list.push(identityId);
        }

        blocking.set(key, list);
      }
    }
  };

  await load(
    'phone',
    dedupe(
      contacts
        .flatMap((contact) => contact.phones.map((phone) => normalizePhoneForMatch(phone.value)))
        .filter((value) => value !== ''),
    ),
  );
  await load(
    'email',
    dedupe(
      contacts
        .flatMap((contact) => contact.emails.map((email) => normalizeEmailForMatch(email.value)))
        .filter((value) => value !== ''),
    ),
  );

  return blocking;
}

async function loadNameCandidates(
  env: Env,
  db: Db,
  userId: string,
  contacts: NormalizedContact[],
  blocking: Map<string, string[]>,
  backfill: Record<string, unknown>[],
  metrics: SliceMetrics,
): Promise<{ names: string[]; nameMap: Map<string, string[]> }> {
  const names = dedupe(
    contacts
      .filter(
        (contact) =>
          !contactValues(contact).some((value) => (blocking.get(valueKey(value)) ?? []).length > 0),
      )
      .map((contact) => normalizeNameForMatch(contact.displayName))
      .filter((name) => name !== ''),
  );

  const nameMap = new Map<string, string[]>();
  const add = (name: string, identityId: string) => {
    const list = nameMap.get(name) ?? [];

    if (!list.includes(identityId)) {
      list.push(identityId);
    }

    nameMap.set(name, list);
  };

  for (const batch of chunk(names, ID_BATCH_SIZE)) {
    const rows = await readRows(
      env.DB,
      db
        .select({ id: schema.identities.id, normalizedName: schema.identities.normalizedName })
        .from(schema.identities)
        .where(
          and(
            eq(schema.identities.userId, userId),
            inArray(schema.identities.normalizedName, batch),
            isNull(schema.identities.mergedIntoId),
          ),
        ),
      metrics,
    );

    for (const row of rows) {
      add(row.normalized_name as string, row.id as string);
    }
  }

  for (const row of backfill) {
    add(normalizeNameForMatch(row.display_name as string), row.id as string);
  }

  return { names, nameMap };
}

async function loadCandidateState(
  env: Env,
  db: Db,
  userId: string,
  blocking: Map<string, string[]>,
  names: string[],
  nameMap: Map<string, string[]>,
  metrics: SliceMetrics,
): Promise<Map<string, IdentityContext>> {
  const candidateIds = new Set<string>();

  for (const identityIds of blocking.values()) {
    for (const identityId of identityIds) {
      candidateIds.add(identityId);
    }
  }

  for (const name of names) {
    for (const identityId of nameMap.get(name) ?? []) {
      candidateIds.add(identityId);
    }
  }

  const identities = new Map<string, IdentityContext>();

  for (const batch of chunk([...candidateIds], ID_BATCH_SIZE)) {
    const rows = await readRows(
      env.DB,
      db
        .select({
          id: schema.identities.id,
          displayName: schema.identities.displayName,
          notes: schema.identities.notes,
          createdAt: schema.identities.createdAt,
        })
        .from(schema.identities)
        .where(
          and(
            eq(schema.identities.userId, userId),
            inArray(schema.identities.id, batch),
            isNull(schema.identities.mergedIntoId),
          ),
        ),
      metrics,
    );

    for (const row of rows) {
      identities.set(row.id as string, {
        displayName: row.display_name as string,
        notes: (row.notes as string | null) ?? null,
        createdAtMs: (row.created_at as number) * 1000,
        valueKeys: new Set(),
        conflictValues: new Set(),
      });
    }
  }

  for (const batch of chunk([...identities.keys()], ID_BATCH_SIZE)) {
    const rows = await readRows(
      env.DB,
      db
        .select({
          identityId: schema.identityValues.identityId,
          kind: schema.identityValues.kind,
          normalizedValue: schema.identityValues.normalizedValue,
        })
        .from(schema.identityValues)
        .where(
          and(
            eq(schema.identityValues.userId, userId),
            inArray(schema.identityValues.identityId, batch),
          ),
        ),
      metrics,
    );

    for (const row of rows) {
      identities
        .get(row.identity_id as string)
        ?.valueKeys.add(`${row.kind}:${row.normalized_value}`);
    }
  }

  for (const batch of chunk([...identities.keys()], ID_BATCH_SIZE)) {
    const rows = await readRows(
      env.DB,
      db
        .select({
          identityId: schema.conflicts.identityId,
          proposedValue: schema.conflicts.proposedValue,
        })
        .from(schema.conflicts)
        .where(
          and(
            eq(schema.conflicts.userId, userId),
            inArray(schema.conflicts.identityId, batch),
            eq(schema.conflicts.status, 'open'),
          ),
        ),
      metrics,
    );

    for (const row of rows) {
      identities.get(row.identity_id as string)?.conflictValues.add(row.proposed_value as string);
    }
  }

  return identities;
}

function buildBackfillStatements(
  db: Db,
  userId: string,
  backfill: Record<string, unknown>[],
): Statement[] {
  const rows = backfill.map((row) => ({
    id: row.id as string,
    normalizedName: normalizeNameForMatch(row.display_name as string),
  }));
  const statements: Statement[] = [];

  for (const batch of chunk(rows, Math.floor((MAX_QUERY_PARAMS - 1) / 3))) {
    const cases = batch.map((row) => sql`when ${row.id} then ${row.normalizedName}`);

    statements.push(
      db
        .update(schema.identities)
        .set({
          normalizedName: sql`case id ${sql.join(cases, sql` `)} else normalized_name end`,
        })
        .where(
          and(
            eq(schema.identities.userId, userId),
            inArray(
              schema.identities.id,
              batch.map((row) => row.id),
            ),
          ),
        ),
    );
  }

  return statements;
}

async function readRows(
  client: D1Database,
  statement: Statement,
  metrics: SliceMetrics,
): Promise<Record<string, unknown>[]> {
  const { sql: text, params } = statement.toSQL();
  const result = await client
    .prepare(text)
    .bind(...params)
    .all();

  metrics.roundTrips += 1;
  metrics.statements += 1;
  metrics.rowsRead += result.meta.rows_read;
  metrics.rowsWritten += result.meta.rows_written;

  return result.results as Record<string, unknown>[];
}

async function writeBatch(
  client: D1Database,
  statements: Statement[],
  metrics: SliceMetrics,
): Promise<void> {
  if (statements.length === 0) {
    return;
  }

  const prepared = statements.map((statement) => {
    const { sql: text, params } = statement.toSQL();
    return client.prepare(text).bind(...params);
  });
  const results = await client.batch(prepared);

  metrics.roundTrips += 1;

  for (const result of results) {
    metrics.statements += 1;
    metrics.rowsRead += result.meta.rows_read;
    metrics.rowsWritten += result.meta.rows_written;
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
