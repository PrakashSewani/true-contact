import { pairingExchangeSchema } from '@truecontact/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from '../db/schema';
import { getSessionUser } from './session';

export const pairingRoutes = new Hono<{ Bindings: Env }>();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

pairingRoutes.post('/api/pairing/start', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = drizzle(c.env.DB, { schema });
  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const [existing] = await db
      .select({ id: schema.pairingCodes.id })
      .from(schema.pairingCodes)
      .where(eq(schema.pairingCodes.code, code));

    if (existing) {
      continue;
    }

    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    await db.insert(schema.pairingCodes).values({
      id: crypto.randomUUID(),
      userId: user.id,
      code,
      expiresAt,
      createdAt: now,
    });

    return c.json({ pairing: { code, expiresAt } }, 201);
  }

  return c.json({ error: 'could not allocate a pairing code' }, 500);
});

pairingRoutes.post('/api/pairing/exchange', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json body' }, 400);
  }

  const parsed = pairingExchangeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'code and extensionId are required' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const now = new Date();
  const code = parsed.data.code.trim().toUpperCase();
  const [pairing] = await db
    .select()
    .from(schema.pairingCodes)
    .where(and(eq(schema.pairingCodes.code, code), isNull(schema.pairingCodes.usedAt)));

  if (!pairing || pairing.expiresAt.getTime() <= now.getTime()) {
    return c.json({ error: 'invalid or expired pairing code' }, 400);
  }

  await db
    .update(schema.pairingCodes)
    .set({ usedAt: now })
    .where(eq(schema.pairingCodes.id, pairing.id));

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  await db.insert(schema.extensionTokens).values({
    id: crypto.randomUUID(),
    userId: pairing.userId,
    extensionId: parsed.data.extensionId,
    tokenHash,
    expiresAt,
    createdAt: now,
  });

  return c.json({ token, expiresAt });
});

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function generateCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  return [...bytes].map((byte) => CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length)).join('');
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `tc_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
