import type { Context } from 'hono';
import { createAuth } from './auth';

export async function getSessionUser(c: Context<{ Bindings: Env }>) {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  return session?.user ?? null;
}
