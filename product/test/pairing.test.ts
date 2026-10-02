import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { apiRequest, registerUser, runQueue, worker } from './helpers';

const db = drizzle(env.DB, { schema });

async function pushBatch(token: string | undefined, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return worker.fetch(
    new Request('http://truecontact.test/api/imports/extension', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

interface PairingChoice {
  code: string;
  expiresAt: string;
}

const BATCH = {
  source: 'whatsapp',
  contacts: [
    {
      displayName: 'WA Person',
      phones: [{ value: '+1 555 0700' }],
      emails: [],
      observedAt: '2026-10-02T00:00:00.000Z',
    },
  ],
};

async function startPairing(cookie: string): Promise<PairingChoice> {
  const response = await apiRequest('/api/pairing/start', { cookie, method: 'POST', body: {} });
  expect(response.status).toBe(201);

  const body = (await response.json()) as { pairing: PairingChoice };
  return body.pairing;
}

async function exchange(code: string, extensionId: string): Promise<Response> {
  return apiRequest('/api/pairing/exchange', { body: { code, extensionId } });
}

describe('extension pairing', () => {
  it('pairs an extension and accepts a WhatsApp batch end to end', async () => {
    const { cookie, userId } = await registerUser();
    const pairing = await startPairing(cookie);
    expect(pairing.code).toHaveLength(8);

    const exchanged = await exchange(pairing.code, 'chromium-test-extension');
    expect(exchanged.status).toBe(200);
    const session = (await exchanged.json()) as { token: string; expiresAt: string };
    expect(session.token.startsWith('tc_')).toBe(true);

    const reused = await exchange(pairing.code, 'another-extension');
    expect(reused.status).toBe(400);

    const pushed = await pushBatch(undefined, BATCH);
    expect(pushed.status).toBe(401);

    const authorized = await pushBatch(session.token, BATCH);
    expect(authorized.status).toBe(201);
    const { import: job } = (await authorized.json()) as { import: { id: string } };

    await runQueue(job.id);

    const identities = await db
      .select()
      .from(schema.identities)
      .where(eq(schema.identities.userId, userId));
    expect(identities.map((identity) => identity.displayName)).toEqual(['WA Person']);

    const [tokenRecord] = await db
      .select()
      .from(schema.extensionTokens)
      .where(eq(schema.extensionTokens.userId, userId));
    expect(tokenRecord?.extensionId).toBe('chromium-test-extension');
    expect(tokenRecord?.lastUsedAt).not.toBeNull();

    const [importRow] = await db.select().from(schema.imports).where(eq(schema.imports.id, job.id));
    expect(importRow?.status).toBe('complete');
    expect(importRow?.stats).toMatchObject({ contacts: 1, created: 1, skipped: 0 });
  });

  it('rejects invalid pairing codes and invalid batches', async () => {
    const { cookie } = await registerUser();

    const badCode = await exchange('NOPE1234', 'ext');
    expect(badCode.status).toBe(400);

    const pairing = await startPairing(cookie);
    const exchanged = await exchange(pairing.code, 'ext');
    expect(exchanged.status).toBe(200);
    const { token } = (await exchanged.json()) as { token: string };

    const badBatch = await pushBatch(token, { source: 'whatsapp', contacts: [] });
    expect(badBatch.status).toBe(400);

    const badToken = await pushBatch('tc_nope', {});
    expect(badToken.status).toBe(401);
  });

  it('requires a session to start pairing', async () => {
    const response = await apiRequest('/api/pairing/start', { method: 'POST', body: {} });
    expect(response.status).toBe(401);
  });

  it('stores only the token hash', async () => {
    const { cookie, userId } = await registerUser();
    const pairing = await startPairing(cookie);
    const exchanged = await exchange(pairing.code, 'ext');
    const { token } = (await exchanged.json()) as { token: string };

    const rows = await db
      .select()
      .from(schema.extensionTokens)
      .where(and(eq(schema.extensionTokens.userId, userId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toHaveLength(64);
  });
});
