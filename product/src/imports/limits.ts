import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export const DEFAULT_FREE_IMPORT_LIMIT = 1000;

export function freeImportLimit(env: Env): number {
  const parsed = Number.parseInt(env.FREE_IMPORT_LIMIT ?? '', 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_FREE_IMPORT_LIMIT;
  }

  return parsed;
}

export async function importedContactUsage(
  db: DrizzleD1Database<typeof schema>,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.usageOperations.quantity}), 0)` })
    .from(schema.usageOperations)
    .where(
      and(
        eq(schema.usageOperations.userId, userId),
        eq(schema.usageOperations.kind, 'imported_contact'),
      ),
    );

  return row?.total ?? 0;
}

export async function checkImportLimit(
  env: Env,
  db: DrizzleD1Database<typeof schema>,
  userId: string,
): Promise<{ ok: true } | { ok: false; used: number; limit: number }> {
  const limit = freeImportLimit(env);
  const used = await importedContactUsage(db, userId);

  if (used >= limit) {
    return { ok: false, used, limit };
  }

  return { ok: true };
}
