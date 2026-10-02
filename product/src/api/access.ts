import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export interface Membership {
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected';
}

export async function membershipFor(env: Env, userId: string): Promise<Membership> {
  const db = drizzle(env.DB, { schema });
  const [row] = await db
    .select({ role: schema.memberships.role, status: schema.memberships.status })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId));

  return row ?? { role: 'member', status: 'pending' };
}
