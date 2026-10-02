import { and, eq, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

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
