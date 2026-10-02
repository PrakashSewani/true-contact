import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import appWorker from '../src/api/index';
import * as schema from '../src/db/schema';

export const worker = exports.default;

const ORIGIN = 'http://localhost:5173';

export interface RegisteredUser {
  cookie: string;
  email: string;
  userId: string;
}

export interface RegisterOptions {
  approved?: boolean;
}

export async function setMembership(
  userId: string,
  role: 'admin' | 'member',
  status: 'approved' | 'pending' | 'rejected',
): Promise<void> {
  const db = drizzle(env.DB, { schema });

  await db
    .insert(schema.memberships)
    .values({ userId, role, status, createdAt: new Date() })
    .onConflictDoUpdate({ target: schema.memberships.userId, set: { role, status } });
}

export async function registerUser(options: RegisterOptions = {}): Promise<RegisteredUser> {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const response = await worker.fetch(
    new Request('http://truecontact.test/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email, password: 'correct-horse-battery-staple', name: 'Test User' }),
    }),
  );

  if (response.status !== 200) {
    throw new Error(`sign-up failed with status ${response.status}`);
  }

  const body = (await response.json()) as { user?: { id?: string } };
  const userId = body.user?.id;

  if (!userId) {
    throw new Error('sign-up response did not include a user id');
  }

  if (options.approved !== false) {
    await setMembership(userId, 'member', 'approved');
  }

  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0] ?? '')
    .join('; ');

  return { cookie, email, userId };
}

export function apiRequest(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  return worker.fetch(
    new Request(`http://truecontact.test${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

export function vcard(name: string, phone: string, email?: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const digits = phone.replace(/[^0-9]/g, '');

  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:${slug}-${digits}`,
    `FN:${name}`,
    `TEL;TYPE=CELL:${phone}`,
    ...(email ? [`EMAIL:${email}`] : []),
    'END:VCARD',
  ].join('\r\n');
}

export async function upload(cookie: string, fileName: string, content: string): Promise<string> {
  const response = await apiRequest('/api/imports', { cookie, body: { fileName, content } });

  if (response.status !== 201) {
    throw new Error(`upload failed with status ${response.status}`);
  }

  const { import: job } = (await response.json()) as { import: { id: string } };
  return job.id;
}

export interface RunQueueOptions {
  chunkSize?: number;
}

export async function runQueue(importId: string, options: RunQueueOptions = {}): Promise<void> {
  const mutableEnv = env as unknown as { IMPORT_CHUNK_SIZE: string };
  const previousChunkSize = mutableEnv.IMPORT_CHUNK_SIZE;

  if (options.chunkSize !== undefined) {
    mutableEnv.IMPORT_CHUNK_SIZE = String(options.chunkSize);
  }

  const db = drizzle(env.DB, { schema });
  const attempts = new Map<number, number>();

  try {
    for (let step = 0; step < 500; step += 1) {
      const [job] = await db
        .select({ status: schema.imports.status, cursor: schema.imports.cursor })
        .from(schema.imports)
        .where(eq(schema.imports.id, importId));

      if (!job || job.status === 'complete' || job.status === 'failed') {
        return;
      }

      const attempt = Math.min((attempts.get(job.cursor) ?? 0) + 1, 4);
      attempts.set(job.cursor, attempt);

      const batch = createMessageBatch('truecontact-imports', [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          attempts: attempt,
          body: { importId, cursor: job.cursor },
        },
      ]);
      const ctx = createExecutionContext();

      await (
        appWorker as {
          queue: (batch: MessageBatch, env: Env, ctx: ExecutionContext) => Promise<void>;
        }
      ).queue(batch, env, ctx);
      await getQueueResult(batch, ctx);
    }

    throw new Error(`import ${importId} did not finish`);
  } finally {
    mutableEnv.IMPORT_CHUNK_SIZE = previousChunkSize;
  }
}
