import type { NormalizedContact, SourceKind } from '@truecontact/shared';
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { chunk, ID_BATCH_SIZE } from '../db/batch';
import * as schema from '../db/schema';
import {
  normalizeEmailForMatch,
  normalizeNameForMatch,
  normalizePhoneForMatch,
} from '../domain/matching';
import { type ContactValue, contactValues, planAdoption, valueKey } from '../domain/reconcile';
import { canonicalRecordState, recordIdentity, sha256Hex } from '../domain/record';
import type { Db, HistoryType } from './graph';

type ImportRow = typeof schema.imports.$inferSelect;
type LinkStatus = (typeof schema.identityLinks.$inferSelect)['status'];

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
  unchanged: number;
  updated: number;
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

interface PriorRecord {
  id: string;
  hash: string | null;
  identityId: string | null;
  status: LinkStatus | null;
  confidence: number | null;
}

const MAX_QUERY_PARAMS = 100;
const BACKFILL_LIMIT = 25;
const KEY_BACKFILL_LIMIT = 25;

export async function reconcileSlice(
  env: Env,
  db: Db,
  params: { job: ImportRow; sourceKind: SourceKind; contacts: NormalizedContact[]; now: Date },
): Promise<SliceOutcome> {
  const { job, sourceKind, contacts, now } = params;
  const { userId } = job;
  const metrics: SliceMetrics = { roundTrips: 0, statements: 0, rowsRead: 0, rowsWritten: 0 };
  const outcome: SliceOutcome = {
    skipped: 0,
    unchanged: 0,
    updated: 0,
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

  const keyBackfill = await loadRecordBackfill(env, db, userId, metrics);
  const nameBackfill = await readBackfillBatch(env, db, userId, metrics);
  const recordInfo = await Promise.all(work.map((contact) => recordIdentity(contact, sourceKind)));
  const prior = await loadPriorRecords(env, db, userId, recordInfo, metrics);

  for (const [key, record] of keyBackfill.prior) {
    if (!prior.has(key)) {
      prior.set(key, record);
    }
  }

  const unchangedIndexes = new Map<number, PriorRecord>();
  const changedIndexes = new Map<number, PriorRecord>();
  const freshIndexes: number[] = [];

  work.forEach((contact, index) => {
    const info = recordInfo[index];
    const previous = info?.recordKey ? prior.get(info.recordKey) : undefined;

    if (previous && previous.hash !== null && previous.hash === info?.contentHash) {
      unchangedIndexes.set(index, previous);
    } else if (previous && previous.identityId) {
      changedIndexes.set(index, previous);
    } else {
      freshIndexes.push(index);
    }
  });

  const freshContacts = freshIndexes.map((index) => work[index] as NormalizedContact);
  const blocking = await loadBlockingIdentities(env, db, userId, freshContacts, metrics);
  const { names, nameMap } = await loadNameCandidates(
    env,
    db,
    userId,
    freshContacts,
    blocking,
    nameBackfill,
    metrics,
  );
  const priorIdentityIds = dedupe(
    [...changedIndexes.values()]
      .map((record) => record.identityId)
      .filter((identityId): identityId is string => identityId !== null),
  );
  const identities = await loadCandidateState(
    env,
    db,
    userId,
    blocking,
    names,
    nameMap,
    priorIdentityIds,
    metrics,
  );

  const identityRows: (typeof schema.identities.$inferInsert)[] = [];
  const observationRows: (typeof schema.observations.$inferInsert)[] = [];
  const valueRows: (typeof schema.identityValues.$inferInsert)[] = [];
  const linkRows: (typeof schema.identityLinks.$inferInsert)[] = [];
  const conflictRows: (typeof schema.conflicts.$inferInsert)[] = [];
  const eventRows: (typeof schema.historyEvents.$inferInsert)[] = [];
  const noteRows: { id: string; notes: string }[] = [];
  const refreshGroups = new Map<
    string,
    { observedAt: string; entries: { id: string; contentHash: string }[] }
  >();

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

  for (const [index, contact] of work.entries()) {
    const info = recordInfo[index];

    if (info === undefined) {
      continue;
    }

    const unchangedRecord = unchangedIndexes.get(index);

    if (unchangedRecord) {
      const group = refreshGroups.get(contact.observedAt) ?? {
        observedAt: contact.observedAt,
        entries: [],
      };
      group.entries.push({ id: unchangedRecord.id, contentHash: info.contentHash });
      refreshGroups.set(contact.observedAt, group);
      outcome.unchanged += 1;
      continue;
    }

    const observationId = crypto.randomUUID();

    observationRows.push({
      id: observationId,
      userId,
      importId: job.id,
      sourceId: job.sourceId,
      externalId: contact.externalId ?? null,
      recordKey: info.recordKey,
      contentHash: info.contentHash,
      displayName: contact.displayName,
      normalizedName: normalizeNameForMatch(contact.displayName),
      notes: contact.notes ?? null,
      observedAt: new Date(contact.observedAt),
      payload: contact,
      createdAt: now,
    });
    outcome.observations += 1;

    const changedRecord = changedIndexes.get(index);
    const priorIdentityId =
      changedRecord?.identityId && identities.has(changedRecord.identityId)
        ? changedRecord.identityId
        : undefined;

    if (priorIdentityId) {
      const proposed = changedRecord?.status === 'proposed';

      linkRows.push({
        id: crypto.randomUUID(),
        userId,
        identityId: priorIdentityId,
        observationId,
        confidence: proposed ? (changedRecord?.confidence ?? 0.5) : 1,
        method: 'source_record',
        status: proposed ? 'proposed' : 'auto',
        createdAt: now,
        updatedAt: now,
      });

      if (proposed) {
        outcome.proposed += 1;
      } else {
        applyAdoption(priorIdentityId, contact, observationId);
        addEvent(priorIdentityId, 'observed', observationId, { sourceId: job.sourceId });
        outcome.updated += 1;
      }

      continue;
    }

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

  const refreshStatements: Statement[] = [];

  for (const group of refreshGroups.values()) {
    for (const batch of chunk(group.entries, Math.floor((MAX_QUERY_PARAMS - 2) / 3))) {
      const cases = batch.map((entry) => sql`when ${entry.id} then ${entry.contentHash}`);

      refreshStatements.push(
        db
          .update(schema.observations)
          .set({
            observedAt: new Date(group.observedAt),
            contentHash: sql`case id ${sql.join(cases, sql` `)} else content_hash end`,
          })
          .where(
            and(
              eq(schema.observations.userId, userId),
              inArray(
                schema.observations.id,
                batch.map((entry) => entry.id),
              ),
            ),
          ),
      );
    }
  }

  const statements: Statement[] = [
    ...keyBackfill.statements,
    ...buildNameBackfillStatements(db, userId, nameBackfill),
    ...refreshStatements,
    ...chunk(identityRows, Math.floor(MAX_QUERY_PARAMS / 7)).map((batch) =>
      db.insert(schema.identities).values(batch),
    ),
    ...noteRows.map((row) =>
      db
        .update(schema.identities)
        .set({ notes: row.notes, updatedAt: now })
        .where(eq(schema.identities.id, row.id)),
    ),
    ...chunk(observationRows, Math.floor(MAX_QUERY_PARAMS / 13)).map((batch) =>
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

async function loadRecordBackfill(
  env: Env,
  db: Db,
  userId: string,
  metrics: SliceMetrics,
): Promise<{ statements: Statement[]; prior: Map<string, PriorRecord> }> {
  const rows = await readRows(
    env.DB,
    db
      .select({
        id: schema.observations.id,
        externalId: schema.observations.externalId,
        kind: schema.sources.kind,
        payload: schema.observations.payload,
        identityId: schema.identityLinks.identityId,
        status: schema.identityLinks.status,
        confidence: schema.identityLinks.confidence,
      })
      .from(schema.observations)
      .innerJoin(schema.sources, eq(schema.sources.id, schema.observations.sourceId))
      .leftJoin(
        schema.identityLinks,
        eq(schema.identityLinks.observationId, schema.observations.id),
      )
      .where(
        and(
          eq(schema.observations.userId, userId),
          isNull(schema.observations.recordKey),
          isNotNull(schema.observations.externalId),
          ne(schema.observations.externalId, ''),
        ),
      )
      .limit(KEY_BACKFILL_LIMIT),
    metrics,
  );

  const prior = new Map<string, PriorRecord>();
  const entries: { id: string; recordKey: string }[] = [];

  for (const row of rows) {
    const recordKey = `${row.kind as string}:x:${row.external_id as string}`;
    entries.push({ id: row.id as string, recordKey });
    prior.set(recordKey, {
      id: row.id as string,
      hash: typeof row.payload === 'string' ? await hashPayload(row.payload) : null,
      identityId: (row.identity_id as string | null) ?? null,
      status: (row.status as LinkStatus | null) ?? null,
      confidence: (row.confidence as number | null) ?? null,
    });
  }

  const statements: Statement[] = [];

  for (const batch of chunk(entries, Math.floor((MAX_QUERY_PARAMS - 1) / 3))) {
    const cases = batch.map((entry) => sql`when ${entry.id} then ${entry.recordKey}`);

    statements.push(
      db
        .update(schema.observations)
        .set({
          recordKey: sql`case id ${sql.join(cases, sql` `)} else record_key end`,
        })
        .where(
          and(
            eq(schema.observations.userId, userId),
            inArray(
              schema.observations.id,
              batch.map((entry) => entry.id),
            ),
          ),
        ),
    );
  }

  return { statements, prior };
}

async function loadPriorRecords(
  env: Env,
  db: Db,
  userId: string,
  recordInfo: { recordKey: string | null }[],
  metrics: SliceMetrics,
): Promise<Map<string, PriorRecord>> {
  const keys = dedupe(
    recordInfo.map((info) => info.recordKey).filter((key): key is string => key !== null),
  );
  const prior = new Map<string, PriorRecord>();

  if (keys.length === 0) {
    return prior;
  }

  for (const batch of chunk(keys, ID_BATCH_SIZE)) {
    const rows = await readRows(
      env.DB,
      db
        .select({
          id: schema.observations.id,
          recordKey: schema.observations.recordKey,
          contentHash: schema.observations.contentHash,
          identityId: schema.identityLinks.identityId,
          status: schema.identityLinks.status,
          confidence: schema.identityLinks.confidence,
        })
        .from(schema.observations)
        .leftJoin(
          schema.identityLinks,
          eq(schema.identityLinks.observationId, schema.observations.id),
        )
        .where(
          and(
            eq(schema.observations.userId, userId),
            inArray(schema.observations.recordKey, batch),
          ),
        )
        .orderBy(desc(schema.observations.createdAt)),
      metrics,
    );

    for (const row of rows) {
      const key = row.record_key as string;

      if (prior.has(key)) {
        continue;
      }

      prior.set(key, {
        id: row.id as string,
        hash: (row.content_hash as string | null) ?? null,
        identityId: (row.identity_id as string | null) ?? null,
        status: (row.status as LinkStatus | null) ?? null,
        confidence: (row.confidence as number | null) ?? null,
      });
    }
  }

  const legacyIds = [...prior.values()]
    .filter((record) => record.hash === null)
    .map((record) => record.id);

  if (legacyIds.length > 0) {
    const payloads = new Map<string, string>();

    for (const batch of chunk(legacyIds, ID_BATCH_SIZE)) {
      const rows = await readRows(
        env.DB,
        db
          .select({ id: schema.observations.id, payload: schema.observations.payload })
          .from(schema.observations)
          .where(
            and(eq(schema.observations.userId, userId), inArray(schema.observations.id, batch)),
          ),
        metrics,
      );

      for (const row of rows) {
        if (typeof row.payload === 'string') {
          payloads.set(row.id as string, row.payload);
        }
      }
    }

    for (const record of prior.values()) {
      if (record.hash !== null) {
        continue;
      }

      const payload = payloads.get(record.id);
      record.hash = payload === undefined ? null : await hashPayload(payload);
    }
  }

  return prior;
}

async function hashPayload(payload: string): Promise<string | null> {
  try {
    return await sha256Hex(canonicalRecordState(JSON.parse(payload) as NormalizedContact));
  } catch {
    return null;
  }
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
  extraIds: string[],
  metrics: SliceMetrics,
): Promise<Map<string, IdentityContext>> {
  const candidateIds = new Set<string>(extraIds);

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

function buildNameBackfillStatements(
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
